import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Lead } from './entities/lead.entity';
import { FacebookService, GraphApiError } from '../facebook/facebook.service';
import { LeadFiltersDto } from './dto/lead-filters.dto';

export type LeadFilters = LeadFiltersDto;

export interface PaginatedLeads {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeadEstadoCount {
  estado: string;
  count: number;
}

export interface LeadsByDay {
  date: string;
  count: number;
}

export interface TopForm {
  formName: string;
  count: number;
}

export interface TodayVsYesterday {
  today: number;
  yesterdaySameTime: number;
  diff: number;
  diffPercent: number | null; // null cuando ayer fue 0 (no hay % que calcular)
}

export interface LeadStats {
  total: number;
  leadsToday: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  todayVsYesterday: TodayVsYesterday;
  byEstado: LeadEstadoCount[];
  leadsByDay: LeadsByDay[];
  topForms: TopForm[];
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead) private leadsRepo: Repository<Lead>,
    private facebookService: FacebookService,
  ) {}

  /**
   * Paso 2 del flujo: dado un leadgen_id recibido por el webhook,
   * consulta la Graph API y guarda el lead en la base de datos.
   * Es idempotente: si el leadgen_id ya existe, no lo duplica.
   *
   * Devuelve `null` cuando el leadgen_id corresponde a un evento
   * simulado (ej. botón "Probar" del panel de Meta) — no es un error
   * real, así que no debe tratarse como tal en los logs ni reintentarse.
   */
  async processIncomingLead(leadgenId: string, pageId?: string) {
    const existing = await this.leadsRepo.findOne({
      where: { leadgenId },
    });
    if (existing) {
      this.logger.log(`Lead ${leadgenId} ya estaba guardado, se ignora.`);
      return existing;
    }

    let data;
    try {
      data = await this.facebookService.getLeadData(leadgenId);
    } catch (err) {
      if (err instanceof GraphApiError && err.isSimulatedLead) {
        // Caso esperado: evento de prueba desde el panel de Meta.
        // Se registra como info, no como error, para no ensuciar
        // las alertas con algo que no requiere acción.
        this.logger.log(
          `Webhook de prueba recibido (leadgen_id simulado: ${leadgenId}). No se guarda, es comportamiento esperado.`,
        );
        return null;
      }
      // Cualquier otro caso (token vencido, permisos, rate limit, etc.)
      // sí es un problema real: se relanza para que quede como ERROR
      // en los logs y puedas detectarlo.
      throw err;
    }

    const flat = this.facebookService.parseFieldData(data.field_data);

    // Datos opcionales: si fallan (ej. falta permiso ads_read/ads_management
    // en el token), no deben impedir que el lead se guarde igual.
    const [formName, campaignInfo, pageName] = await Promise.all([
      data.form_id ? this.facebookService.getFormName(data.form_id) : undefined,
      this.facebookService.getCampaignInfo(leadgenId),
      pageId ? this.facebookService.getPageName(pageId) : undefined,
    ]);

    const lead = this.leadsRepo.create({
      leadgenId: data.id,
      nombre: flat['full_name'] || flat['first_name'] || flat['nombre_completo'] ||'',
      correo: flat['email'] || flat['correo_electrónico'] || '',
      telefono: flat['phone_number'] || flat['número_de_teléfono'] || '',
      ciudad: flat['city'] || '',
      formId: data.form_id,
      formName,
      campaignId: campaignInfo.campaignId,
      campaignName: campaignInfo.campaignName,
      pageId,
      pageName,
      rawFieldData: flat,
      leadCreatedTime: new Date(data.created_time),
      estado: 'Nuevo',
    });

    const saved = await this.leadsRepo.save(lead);
    this.logger.log(`Lead ${saved.leadgenId} guardado correctamente.`);
    return saved;
  }

  /**
   * Arma el query base con todos los filtros (fecha, estado, form,
   * campaña y búsqueda de texto libre), sin paginar. Se reutiliza
   * tanto para el listado paginado como para la exportación a Excel.
   */
  private buildFilteredQuery(filters: LeadFilters) {
    const qb = this.leadsRepo
      .createQueryBuilder('lead')
      .orderBy('lead.leadCreatedTime', 'DESC');

    if (filters.desde || filters.hasta) {
      // Las fechas llegan como 'YYYY-MM-DD' (fecha local del usuario en
      // Santiago). Para filtrar correctamente en UTC (cómo Neon almacena
      // los timestamps), convertimos cada extremo al inicio/fin del día
      // en la zona horaria de Chile, que es UTC-3 o UTC-4 según horario
      // de verano. Usamos el offset fijo más conservador para no excluir
      // leads legítimos: medianoche Santiago = 03:00 UTC (UTC-3, verano)
      // o 04:00 UTC (UTC-4, invierno). Como no tenemos el offset exacto
      // en tiempo de ejecución sin instalar una librería de IANA, usamos
      // la estrategia más robusta: desde = 00:00 Santiago (= -04:00 más
      // conservador) y hasta = fin del día 23:59:59 local.
      //
      // Alternativa más exacta: usar AT TIME ZONE en la query de Postgres,
      // que sí conoce el historial de DST de 'America/Santiago':
      if (filters.desde) {
        qb.andWhere(
          `lead.leadCreatedTime >= ((:desde)::date)::timestamptz AT TIME ZONE 'America/Santiago'`,
          { desde: filters.desde },
        );
      }
      if (filters.hasta) {
        qb.andWhere(
          `lead.leadCreatedTime < (((:hasta)::date + interval '1 day'))::timestamptz AT TIME ZONE 'America/Santiago'`,
          { hasta: filters.hasta },
        );
      }
    }
    if (filters.estado) qb.andWhere('lead.estado = :estado', { estado: filters.estado });
    if (filters.formId) qb.andWhere('lead.formId = :formId', { formId: filters.formId });
    if (filters.campaignId) {
      qb.andWhere('lead.campaignId = :campaignId', {
        campaignId: filters.campaignId,
      });
    }
    if (filters.pageId) {
      qb.andWhere('lead.pageId = :pageId', { pageId: filters.pageId });
    }
    if (filters.search) {
      qb.andWhere(
        '(lead.nombre ILIKE :search OR lead.correo ILIKE :search OR lead.telefono ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return qb;
  }

  /**
   * Lista las páginas distintas que ya tienen leads guardados, para
   * poblar el filtro de "Página" en el frontend sin tener que
   * hardcodear IDs ahí.
   */
  async getAvailablePages(): Promise<{ pageId: string; pageName: string }[]> {
    const rows = await this.leadsRepo
      .createQueryBuilder('lead')
      .select('lead.pageId', 'pageId')
      .addSelect('lead.pageName', 'pageName')
      .where('lead.pageId IS NOT NULL')
      .groupBy('lead.pageId')
      .addGroupBy('lead.pageName')
      .orderBy('lead.pageName', 'ASC')
      .getRawMany<{ pageId: string; pageName: string | null }>();

    return rows.map((r) => ({
      pageId: r.pageId,
      pageName: r.pageName ?? r.pageId,
    }));
  }

  async findAll(filters: LeadFilters): Promise<PaginatedLeads> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const [data, total] = await this.buildFilteredQuery(filters)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async updateEstado(id: string, estado: string) {
    await this.leadsRepo.update(id, { estado });
    return this.leadsRepo.findOne({ where: { id } });
  }

  /**
   * Métricas agregadas para el dashboard: totales, desglose por estado,
   * serie de los últimos 14 días (para el gráfico), y los formularios
   * y campañas con más leads.
   */
  async getStats(pageId?: string): Promise<LeadStats> {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // últimos 7 días incl. hoy
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfSeries = new Date(startOfToday);
    startOfSeries.setDate(startOfSeries.getDate() - 13); // últimos 14 días

    // "Ayer a esta misma hora": mismo rango horario que hoy, pero un día antes.
    // Ej. si son las 14:30 de hoy, se compara con [ayer 00:00, ayer 14:30).
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const yesterdaySameTimeCutoff = new Date(
      startOfYesterday.getTime() + (now.getTime() - startOfToday.getTime()),
    );

    // Aplica el filtro de página (si viene) a cualquier query builder.
    const withPageFilter = <T extends SelectQueryBuilder<Lead>>(qb: T): T =>
      pageId ? qb.andWhere('lead.pageId = :pageId', { pageId }) : qb;

    const [
      total,
      leadsToday,
      leadsThisWeek,
      leadsThisMonth,
      leadsYesterdaySameTime,
      byEstadoRaw,
      byDayRaw,
      byFormRaw,
    ] = await Promise.all([
        withPageFilter(this.leadsRepo.createQueryBuilder('lead')).getCount(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .where('lead.leadCreatedTime >= :start', { start: startOfToday }),
        ).getCount(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .where('lead.leadCreatedTime >= :start', { start: startOfWeek }),
        ).getCount(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .where('lead.leadCreatedTime >= :start', { start: startOfMonth }),
        ).getCount(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .where('lead.leadCreatedTime >= :start', { start: startOfYesterday })
            .andWhere('lead.leadCreatedTime < :end', {
              end: yesterdaySameTimeCutoff,
            }),
        ).getCount(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .select('lead.estado', 'estado')
            .addSelect('COUNT(*)', 'count')
            .groupBy('lead.estado'),
        ).getRawMany<{ estado: string; count: string }>(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .select("TO_CHAR(lead.leadCreatedTime, 'YYYY-MM-DD')", 'day')
            .addSelect('COUNT(*)', 'count')
            .where('lead.leadCreatedTime >= :start', { start: startOfSeries }),
        )
          .groupBy('day')
          .orderBy('day', 'ASC')
          .getRawMany<{ day: string; count: string }>(),
        withPageFilter(
          this.leadsRepo
            .createQueryBuilder('lead')
            .select('lead.formName', 'formName')
            .addSelect('COUNT(*)', 'count')
            .where('lead.formName IS NOT NULL'),
        )
          .groupBy('lead.formName')
          .orderBy('count', 'DESC')
          .limit(5)
          .getRawMany<{ formName: string; count: string }>(),
      ]);

    // Rellena los días sin leads con 0, para que el gráfico no tenga huecos.
    const leadsByDay: { date: string; count: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(startOfSeries);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const found = byDayRaw.find((r) => r.day === key);
      leadsByDay.push({ date: key, count: found ? Number(found.count) : 0 });
    }

    const estados: LeadEstadoCount[] = ['Nuevo', 'Contactado', 'Vendido'].map(
      (estado) => ({
        estado,
        count: Number(
          byEstadoRaw.find((r) => r.estado === estado)?.count ?? 0,
        ),
      }),
    );

    const diff = leadsToday - leadsYesterdaySameTime;
    const diffPercent =
      leadsYesterdaySameTime > 0 ? (diff / leadsYesterdaySameTime) * 100 : null;

    return {
      total,
      leadsToday,
      leadsThisWeek,
      leadsThisMonth,
      todayVsYesterday: {
        today: leadsToday,
        yesterdaySameTime: leadsYesterdaySameTime,
        diff,
        diffPercent,
      },
      byEstado: estados,
      leadsByDay,
      topForms: byFormRaw.map((r) => ({
        formName: r.formName,
        count: Number(r.count),
      })),
    };
  }

  /**
   * Genera un archivo Excel en memoria (buffer) con los leads filtrados.
   * A propósito ignora page/limit: exporta TODOS los resultados que
   * cumplen los filtros, no solo la página visible en pantalla.
   * Incluye columnas dinámicas para cualquier pregunta personalizada
   * que venga en rawFieldData (ej. preguntas de opción múltiple).
   */
  async exportToExcel(filters: LeadFilters): Promise<Buffer> {
    const leads = await this.buildFilteredQuery(filters).getMany();

    // El servidor corre en UTC (Railway). Para que el Excel muestre la hora
    // en la zona horaria de Chile (sin importar dónde corre el servidor),
    // forzamos 'America/Santiago' explícitamente. Esta zona ya maneja
    // automáticamente el cambio de horario de verano (UTC-3/UTC-4).
    const formatDate = (date: Date | null | undefined) => {
      if (!date) return '';
      return date.toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    };

    // Campos estándar que ya tienen columna propia en la tabla — se excluyen
    // del bloque de preguntas personalizadas para no duplicarlos.
    const STANDARD_FIELDS = new Set([
      'full_name', 'first_name', 'last_name',
      'email', 'phone_number', 'city',
      'inbox_url',  // campo interno de Meta, no es una pregunta del usuario
    ]);

    // Recorre todos los leads para recolectar las claves personalizadas,
    // preservando el orden en que aparecen por primera vez.
    const customKeySet = new Set<string>();
    for (const lead of leads) {
      if (!lead.rawFieldData) continue;
      for (const key of Object.keys(lead.rawFieldData)) {
        if (!STANDARD_FIELDS.has(key)) customKeySet.add(key);
      }
    }
    const customKeys = Array.from(customKeySet);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');

    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 22 },
      { header: 'Nombre', key: 'nombre', width: 25 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Correo', key: 'correo', width: 28 },
      { header: 'Ciudad', key: 'ciudad', width: 18 },
      { header: 'Página', key: 'pagina', width: 22 },
      { header: 'Campaña', key: 'campania', width: 22 },
      { header: 'Formulario', key: 'formulario', width: 24 },
      { header: 'Estado', key: 'estado', width: 15 },
      // Una columna por cada pregunta personalizada encontrada en este export.
      // El header usa la clave de Meta tal cual (ej. "¿Qué te llamó la atención?").
      ...customKeys.map((key) => ({
        header: key,
        key: `custom_${key}`,
        width: 30,
      })),
    ];
    sheet.getRow(1).font = { bold: true };

    for (const lead of leads) {
      const row: Record<string, string> = {
        fecha: formatDate(lead.leadCreatedTime),
        nombre: lead.nombre,
        telefono: lead.telefono,
        correo: lead.correo,
        ciudad: lead.ciudad,
        pagina: lead.pageName,
        campania: lead.campaignName,
        formulario: lead.formName,
        estado: lead.estado,
      };

      // Agrega el valor de cada pregunta personalizada (vacío si ese lead
      // no respondió esa pregunta, ej. era de otro formulario).
      for (const key of customKeys) {
        row[`custom_${key}`] = lead.rawFieldData?.[key] ?? '';
      }

      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
