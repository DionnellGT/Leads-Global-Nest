import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { LeadsService } from './leads.service';
import { LeadFiltersDto } from './dto/lead-filters.dto';
import { UpdateLeadEstadoDto } from './dto/update-estado.dto';
import { Lead } from './entities/lead.entity';

@ApiTags('leads')
@Controller()
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(
    private leadsService: LeadsService,
    private config: ConfigService,
  ) {}

  // ── 1) Verificación del webhook (Meta la llama una sola vez al configurar) ──
  // Se excluye de Swagger: no es un endpoint pensado para consumo propio,
  // solo lo llama Meta.
  @ApiExcludeEndpoint()
  @Get('webhook/facebook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('FB_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expected) {
      this.logger.log('Webhook verificado correctamente.');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // ── 2) Recepción de eventos en tiempo real (nuevo lead enviado) ──
  @ApiExcludeEndpoint()
  @Post('webhook/facebook')
  async receiveWebhook(@Body() body: any, @Res() res: Response) {
    // Respondemos 200 de inmediato para que Meta no reintente,
    // y procesamos el/los leads.
    res.sendStatus(200);

    try {
      const entries = body?.entry ?? [];
      for (const entry of entries) {
        const pageId = entry.id;
        for (const change of entry.changes ?? []) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value?.leadgen_id;
            if (leadgenId) {
              await this.leadsService.processIncomingLead(leadgenId, pageId);
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Error procesando webhook de leads', err as Error);
    }
  }

  // ── 3) Listado de leads con filtros (para la tabla en React) ──
  @ApiOperation({ summary: 'Lista leads guardados, con filtros opcionales' })
  @ApiResponse({ status: 200, description: 'Listado de leads', type: [Lead] })
  @Get('leads')
  findAll(@Query() filters: LeadFiltersDto) {
    return this.leadsService.findAll(filters);
  }

  // ── 4) Actualizar estado de un lead (Nuevo/Contactado/Vendido) ──
  @ApiOperation({ summary: 'Actualiza el estado de un lead' })
  @ApiParam({ name: 'id', description: 'UUID del lead' })
  @ApiResponse({ status: 200, description: 'Lead actualizado', type: Lead })
  @Patch('leads/:id/estado')
  updateEstado(@Param('id') id: string, @Body() dto: UpdateLeadEstadoDto) {
    return this.leadsService.updateEstado(id, dto.estado);
  }

  // ── 5) Exportar a Excel con los mismos filtros ──
  @ApiOperation({ summary: 'Exporta los leads filtrados a un archivo .xlsx' })
  @ApiResponse({ status: 200, description: 'Archivo Excel generado' })
  @Get('leads/export')
  async export(@Res() res: Response, @Query() filters: LeadFiltersDto) {
    const buffer = await this.leadsService.exportToExcel(filters);

    const fileName = `Leads_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    res.send(buffer);
  }
}
