import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsModule } from './leads/leads.module';
import { FormsModule } from './forms/forms.module';
import { Lead } from './leads/entities/lead.entity';
import { Form } from './forms/entities/form.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [Lead, Form],
        synchronize: true, // OK para desarrollo; usa migraciones en producción
        ssl: { rejectUnauthorized: false }, // Neon requiere SSL
      }),
    }),
    LeadsModule,
    FormsModule,
  ],
})
export class AppModule {}
