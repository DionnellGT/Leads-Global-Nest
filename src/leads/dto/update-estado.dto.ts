import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { LeadEstado } from './lead-filters.dto';

export class UpdateLeadEstadoDto {
  @ApiProperty({ enum: LeadEstado, example: LeadEstado.CONTACTADO })
  @IsIn(Object.values(LeadEstado))
  estado: LeadEstado;
}
