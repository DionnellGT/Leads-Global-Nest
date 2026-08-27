import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('forms')
export class Form {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ID del formulario en Meta (el que aparece en la Biblioteca de formularios)
  @ApiProperty()
  @Index({ unique: true })
  @Column({ name: 'form_id', unique: true })
  formId: string;

  @ApiPropertyOptional()
  @Column({ name: 'form_name', nullable: true })
  formName: string;

  @ApiProperty()
  @Column({ name: 'page_id' })
  pageId: string;

  @ApiPropertyOptional()
  @Column({ name: 'page_name', nullable: true })
  pageName: string;

  // Cuántos leads se importaron la última vez que se hizo sync
  @ApiProperty()
  @Column({ name: 'leads_imported', default: 0 })
  leadsImported: number;

  // Fecha del último import/sync exitoso
  @ApiPropertyOptional()
  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  // Si está activo, el webhook seguirá procesando leads de este formulario
  @ApiProperty()
  @Column({ default: true })
  activo: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
