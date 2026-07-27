import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export enum LeadEstado {
  NUEVO = 'Nuevo',
  CONTACTADO = 'Contactado',
  VENDIDO = 'Vendido',
}

export class LeadFiltersDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial (ISO 8601)',
    example: '2026-07-20',
  })
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha final (ISO 8601)',
    example: '2026-07-24',
  })
  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @ApiPropertyOptional({ enum: LeadEstado })
  @IsOptional()
  @IsIn(Object.values(LeadEstado))
  estado?: LeadEstado;

  @ApiPropertyOptional({ description: 'ID del formulario de Lead Ads' })
  @IsOptional()
  @IsString()
  formId?: string;

  @ApiPropertyOptional({ description: 'ID de la campaña de Meta Ads' })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({
    description: 'Búsqueda libre por nombre, correo o teléfono',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
