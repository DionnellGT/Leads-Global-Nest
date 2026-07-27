import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ID del lead que entrega Meta (leadgen_id)
  @Index({ unique: true })
  @Column({ name: 'leadgen_id', unique: true })
  leadgenId: string;

  @Column({ nullable: true })
  nombre: string;

  @Column({ nullable: true })
  correo: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ name: 'form_id', nullable: true })
  formId: string;

  @Column({ name: 'form_name', nullable: true })
  formName: string;

  @Column({ name: 'campaign_id', nullable: true })
  campaignId: string;

  @Column({ name: 'campaign_name', nullable: true })
  campaignName: string;

  @Column({ name: 'page_id', nullable: true })
  pageId: string;

  // Guardamos todas las preguntas del formulario tal cual, por si hay
  // campos personalizados que no mapeamos a columnas propias
  @Column({ name: 'raw_field_data', type: 'jsonb', nullable: true })
  rawFieldData: Record<string, any>;

  @Column({ name: 'lead_created_time', type: 'timestamptz', nullable: true })
  leadCreatedTime: Date;

  @Column({ default: 'Nuevo' })
  estado: string; // Nuevo | Contactado | Vendido

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
