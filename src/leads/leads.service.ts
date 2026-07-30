import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const [formName, campaignInfo] = await Promise.all([
      data.form_id ? this.facebookService.getFormName(data.form_id) : undefined,
      this.facebookService.getCampaignInfo(leadgenId),
    ]);

    const lead = this.leadsRepo.create({
      leadgenId: data.id,
      nombre: flat['full_name'] || flat['first_name'] || '',
      correo: flat['email'] || '',
      telefono: flat['phone_number'] || '',
      ciudad: flat['city'] || '',
      formId: data.form_id,
      formName,
      campaignId: campaignInfo.campaignId,
      campaignName: campaignInfo.campaignName,
      pageId,
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

    if (filters.desde && filters.hasta) {
      qb.andWhere('lead.leadCreatedTime BETWEEN :desde AND :hasta', {
        desde: new Date(filters.desde),
        hasta: new Date(filters.hasta),
      });
    }
    if (filters.estado) qb.andWhere('lead.estado = :estado', { estado: filters.estado });
    if (filters.formId) qb.andWhere('lead.formId = :formId', { formId: filters.formId });
    if (filters.campaignId) {
      qb.andWhere('lead.campaignId = :campaignId', {
        campaignId: filters.campaignId,
      });
    }
    if (filters.search) {
      qb.andWhere(
        '(lead.nombre ILIKE :search OR lead.correo ILIKE :search OR lead.telefono ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return qb;
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
   * Genera un archivo Excel en memoria (buffer) con los leads filtrados.
   * A propósito ignora page/limit: exporta TODOS los resultados que
   * cumplen los filtros, no solo la página visible en pantalla.
   */
  async exportToExcel(filters: LeadFilters): Promise<Buffer> {
    const leads = await this.buildFilteredQuery(filters).getMany();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');

    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Nombre', key: 'nombre', width: 25 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Correo', key: 'correo', width: 28 },
      { header: 'Ciudad', key: 'ciudad', width: 18 },
      { header: 'Campaña', key: 'campania', width: 22 },
      { header: 'Formulario', key: 'formulario', width: 22 },
      { header: 'Estado', key: 'estado', width: 15 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const lead of leads) {
      sheet.addRow({
        fecha: lead.leadCreatedTime?.toLocaleString('es-CL') ?? '',
        nombre: lead.nombre,
        telefono: lead.telefono,
        correo: lead.correo,
        ciudad: lead.ciudad,
        campania: lead.campaignName,
        formulario: lead.formName,
        estado: lead.estado,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
