import { ApiProperty } from '@nestjs/swagger';
import { Lead } from '../entities/lead.entity';

export class PaginatedLeadsDto {
  @ApiProperty({ type: [Lead] })
  data: Lead[];

  @ApiProperty({ description: 'Total de leads que cumplen los filtros' })
  total: number;

  @ApiProperty({ description: 'Página actual' })
  page: number;

  @ApiProperty({ description: 'Resultados por página' })
  limit: number;

  @ApiProperty({ description: 'Total de páginas disponibles' })
  totalPages: number;
}
