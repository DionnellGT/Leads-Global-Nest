import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('leads')
export class Lead {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ID del lead que entrega Meta (leadgen_id)
  @ApiProperty()
  @Index({ unique: true })
  @Column({ name: 'leadgen_id', unique: true })
  leadgenId: string;

  @ApiPropertyOptional()
  @Column({ nullable: true })
  nombre: string;

  @ApiPropertyOptional()
  @Column({ nullable: true })
  correo: string;

  @ApiPropertyOptional()
  @Column({ nullable: true })
  telefono: string;

  @ApiPropertyOptional()
  @Column({ nullable: true })
  ciudad: string;

  @ApiPropertyOptional()
  @Column({ name: 'form_id', nullable: true })
  formId: string;

  @ApiPropertyOptional()
  @Column({ name: 'form_name', nullable: true })
  formName: string;

  @ApiPropertyOptional()
  @Column({ name: 'campaign_id', nullable: true })
  campaignId: string;

  @ApiPropertyOptional()
  @Column({ name: 'campaign_name', nullable: true })
  campaignName: string;

  @ApiPropertyOptional()
  @Column({ name: 'page_id', nullable: true })
  pageId: string;

  @ApiPropertyOptional({ description: 'Nombre de la página de Facebook/Instagram (ej. "Remate de Terrenos", "Fundo El Avellano")' })
  @Column({ name: 'page_name', nullable: true })
  pageName: string;

  // Guardamos todas las preguntas del formulario tal cual, por si hay
  // campos personalizados que no mapeamos a columnas propias
  @ApiPropertyOptional({ type: 'object' })
  @Column({ name: 'raw_field_data', type: 'jsonb', nullable: true })
  rawFieldData: Record<string, any>;

  @ApiPropertyOptional()
  @Column({ name: 'lead_created_time', type: 'timestamptz', nullable: true })
  leadCreatedTime: Date;

  @ApiProperty({ enum: ['Nuevo', 'Contactado', 'Vendido'] })
  @Column({ default: 'Nuevo' })
  estado: string; // Nuevo | Contactado | Vendido

  @ApiPropertyOptional()
  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
