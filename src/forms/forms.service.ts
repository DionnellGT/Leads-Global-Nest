import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Form } from './entities/form.entity';
import { RegisterFormDto } from './dto/register-form.dto';
import { FacebookService } from '../facebook/facebook.service';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectRepository(Form)
    private formsRepo: Repository<Form>,
    private facebookService: FacebookService,
    private leadsService: LeadsService,
  ) {}

  /**
   * Registra un formulario nuevo y hace el import histórico de todos
   * sus leads desde la Graph API.
   *
   * Si el formulario ya está registrado, lanza ConflictException — para
   * reimportar leads de un form ya registrado, usa syncLeads().
   */
  async register(dto: RegisterFormDto) {
    const existing = await this.formsRepo.findOne({
      where: { formId: dto.formId },
    });
    if (existing) {
      throw new ConflictException(
        `El formulario ${dto.formId} ya está registrado. Para reimportar sus leads usa el endpoint de sync.`,
      );
    }

    // Obtener nombre del formulario y de la página en paralelo
    const [formName, pageName] = await Promise.all([
      this.facebookService.getFormName(dto.formId),
      this.facebookService.getPageName(dto.pageId),
    ]);

    const form = this.formsRepo.create({
      formId: dto.formId,
      formName,
      pageId: dto.pageId,
      pageName,
      leadsImported: 0,
    });
    await this.formsRepo.save(form);
    this.logger.log(
      `Formulario registrado: ${formName ?? dto.formId} (${dto.formId})`,
    );

    // Import histórico asíncrono — no bloquea la respuesta
    this.importLeadsFromForm(form).catch((err) =>
      this.logger.error(
        `Error en import histórico del formulario ${dto.formId}`,
        err,
      ),
    );

    return {
      form,
      message: `Formulario registrado. Se está iniciando el import histórico de leads en segundo plano.`,
    };
  }

  /**
   * Re-importa los leads de un formulario ya registrado.
   * Útil para traer leads nuevos que hayan llegado desde el último sync,
   * o para recuperar leads que fallaron en el webhook.
   * Es idempotente: los leads ya existentes en la BD se ignoran.
   */
  async syncLeads(formId: string) {
    const form = await this.formsRepo.findOne({ where: { formId } });
    if (!form) {
      throw new NotFoundException(
        `Formulario ${formId} no encontrado. Regístralo primero.`,
      );
    }

    const imported = await this.importLeadsFromForm(form);
    return {
      formId,
      formName: form.formName,
      leadsImported: imported,
      message: `Sync completado. Se importaron ${imported} lead(s) nuevos.`,
    };
  }

  /**
   * Trae todos los leads de un formulario de Meta paginando la Graph API
   * (/form_id/leads, que devuelve hasta 100 por página).
   * Guarda cada lead usando LeadsService.processLeadData, que ya es
   * idempotente (ignora duplicados por leadgen_id).
   *
   * Retorna el número de leads nuevos importados en esta ejecución.
   */
  async importLeadsFromForm(form: Form): Promise<number> {
    this.logger.log(
      `Iniciando import de leads del formulario ${form.formId} (${form.formName})`,
    );

    let imported = 0;
    let cursor: string | undefined;

    do {
      const response = await this.facebookService.getFormLeads(
        form.formId,
        cursor,
      );

      for (const leadData of response.data) {
        try {
          const result = await this.leadsService.processLeadData(
            leadData,
            form.pageId,
            form.pageName,
            form.formId,
            form.formName,
          );
          if (result) imported++;
        } catch (err) {
          this.logger.warn(
            `No se pudo guardar lead ${leadData.id} del formulario ${form.formId}: ${(err as Error).message}`,
          );
        }
      }

      cursor = response.paging?.cursors?.after;
      // Si no hay página siguiente, paramos
      if (!response.paging?.next) cursor = undefined;
    } while (cursor);

    // Actualizar contador y fecha del último sync
    await this.formsRepo.update(form.id, {
      leadsImported: form.leadsImported + imported,
      lastSyncedAt: new Date(),
    });

    this.logger.log(
      `Import completado: ${imported} lead(s) nuevos del formulario ${form.formId}`,
    );
    return imported;
  }

  findAll() {
    return this.formsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async remove(formId: string) {
    const form = await this.formsRepo.findOne({ where: { formId } });
    if (!form) throw new NotFoundException(`Formulario ${formId} no encontrado.`);
    await this.formsRepo.remove(form);
    return { message: `Formulario ${formId} eliminado.` };
  }
}
