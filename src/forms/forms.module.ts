import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form } from './entities/form.entity';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { FacebookModule } from '../facebook/facebook.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [TypeOrmModule.forFeature([Form]), FacebookModule, LeadsModule],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
