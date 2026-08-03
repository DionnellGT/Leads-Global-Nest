import { ApiProperty } from '@nestjs/swagger';

export class LeadEstadoCountDto {
  @ApiProperty() estado: string;
  @ApiProperty() count: number;
}

export class LeadsByDayDto {
  @ApiProperty({ example: '2026-07-20' }) date: string;
  @ApiProperty() count: number;
}

export class TopFormDto {
  @ApiProperty() formName: string;
  @ApiProperty() count: number;
}

export class TodayVsYesterdayDto {
  @ApiProperty({ description: 'Leads recibidos hoy hasta la hora actual' })
  today: number;

  @ApiProperty({
    description: 'Leads recibidos ayer hasta la misma hora del día',
  })
  yesterdaySameTime: number;

  @ApiProperty({ description: 'today - yesterdaySameTime' })
  diff: number;

  @ApiProperty({
    description:
      'Variación porcentual vs. ayer a esta hora. null si ayer fue 0.',
    nullable: true,
  })
  diffPercent: number | null;
}

export class LeadStatsDto {
  @ApiProperty({ description: 'Total histórico de leads' })
  total: number;

  @ApiProperty({ description: 'Leads recibidos hoy' })
  leadsToday: number;

  @ApiProperty({ description: 'Leads recibidos en los últimos 7 días' })
  leadsThisWeek: number;

  @ApiProperty({ description: 'Leads recibidos en el mes calendario actual' })
  leadsThisMonth: number;

  @ApiProperty({ type: TodayVsYesterdayDto })
  todayVsYesterday: TodayVsYesterdayDto;

  @ApiProperty({ type: [LeadEstadoCountDto] })
  byEstado: LeadEstadoCountDto[];

  @ApiProperty({
    type: [LeadsByDayDto],
    description: 'Serie diaria de los últimos 14 días, para graficar',
  })
  leadsByDay: LeadsByDayDto[];

  @ApiProperty({
    type: [TopFormDto],
    description: 'Los 5 formularios con más leads',
  })
  topForms: TopFormDto[];
}
