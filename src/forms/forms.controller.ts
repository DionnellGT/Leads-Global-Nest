import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FormsService } from './forms.service';
import { RegisterFormDto } from './dto/register-form.dto';

@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(private formsService: FormsService) {}

  @ApiOperation({
    summary: 'Registra un formulario de Lead Ads e importa sus leads históricos',
  })
  @ApiResponse({ status: 201, description: 'Formulario registrado e import iniciado' })
  @ApiResponse({ status: 409, description: 'El formulario ya está registrado' })
  @Post()
  register(@Body() dto: RegisterFormDto) {
    return this.formsService.register(dto);
  }

  @ApiOperation({ summary: 'Lista todos los formularios registrados' })
  @ApiResponse({ status: 200, description: 'Lista de formularios' })
  @Get()
  findAll() {
    return this.formsService.findAll();
  }

  @ApiOperation({
    summary: 'Re-importa los leads de un formulario ya registrado (sync manual)',
  })
  @ApiParam({ name: 'formId', description: 'ID del formulario en Meta' })
  @ApiResponse({ status: 200, description: 'Sync completado' })
  @ApiResponse({ status: 404, description: 'Formulario no encontrado' })
  @Post(':formId/sync')
  syncLeads(@Param('formId') formId: string) {
    return this.formsService.syncLeads(formId);
  }

  @ApiOperation({ summary: 'Elimina un formulario registrado (no borra sus leads)' })
  @ApiParam({ name: 'formId', description: 'ID del formulario en Meta' })
  @ApiResponse({ status: 200, description: 'Formulario eliminado' })
  @Delete(':formId')
  remove(@Param('formId') formId: string) {
    return this.formsService.remove(formId);
  }
}
