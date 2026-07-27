import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Lead } from './entities/lead.entity';
import { FacebookService } from '../facebook/facebook.service';

export interface LeadFilters {
  desde?: string; // fecha ISO, ej. 2026-07-20
  hasta?: string;
  estado?: string;
  formId?: string;
  campaignId?: string;
  search?: string; // busca en nombre/correo/telefono
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
   */
  async processIncomingLead(leadgenId: string, pageId?: string) {
    const existing = await this.leadsRepo.findOne({
      where: { leadgenId },
    });
    if (existing) {
      this.logger.log(`Lead ${leadgenId} ya estaba guardado, se ignora.`);
      return existing;
    }

    const data = await this.facebookService.getLeadData(leadgenId);
    const flat = this.facebookService.parseFieldData(data.field_data);

    const lead = this.leadsRepo.create({
      leadgenId: data.id,
      nombre: flat['full_name'] || flat['first_name'] || '',
      correo: flat['email'] || '',
      telefono: flat['phone_number'] || '',
      ciudad: flat['city'] || '',
      formId: data.form_id,
      formName: data.form_name,
      campaignId: data.campaign_id,
      campaignName: data.campaign_name,
      pageId,
      rawFieldData: flat,
      leadCreatedTime: new Date(data.created_time),
      estado: 'Nuevo',
    });

    const saved = await this.leadsRepo.save(lead);
    this.logger.log(`Lead ${saved.leadgenId} guardado correctamente.`);
    return saved;
  }

  async findAll(filters: LeadFilters) {
    const where: FindOptionsWhere<Lead> = {};

    if (filters.desde && filters.hasta) {
      where.leadCreatedTime = Between(
        new Date(filters.desde),
        new Date(filters.hasta),
      );
    }
    if (filters.estado) where.estado = filters.estado;
    if (filters.formId) where.formId = filters.formId;
    if (filters.campaignId) where.campaignId = filters.campaignId;

    let leads = await this.leadsRepo.find({
      where,
      order: { leadCreatedTime: 'DESC' },
    });

    // Búsqueda de texto libre sobre nombre/correo/telefono
    if (filters.search) {
      const q = filters.search.toLowerCase();
      leads = leads.filter(
        (l) =>
          l.nombre?.toLowerCase().includes(q) ||
          l.correo?.toLowerCase().includes(q) ||
          l.telefono?.toLowerCase().includes(q),
      );
    }

    return leads;
  }

  async updateEstado(id: string, estado: string) {
    await this.leadsRepo.update(id, { estado });
    return this.leadsRepo.findOne({ where: { id } });
  }

  /**
   * Genera un archivo Excel en memoria (buffer) con los leads filtrados.
   */
  async exportToExcel(filters: LeadFilters): Promise<Buffer> {
    const leads = await this.findAll(filters);

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
