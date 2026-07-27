import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Número de página (empieza en 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de resultados por página (máx. 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
