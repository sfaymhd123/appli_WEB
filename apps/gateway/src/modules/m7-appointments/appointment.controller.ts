import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Audit } from '../../core/audit/decorators/audit.decorator';
import type { AppointmentList } from './appointment.types';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly service: AppointmentService) {}

  @Get()
  @Audit('R')
  list(): Promise<AppointmentList> {
    return this.service.list();
  }

  @Post()
  @Audit('C')
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }
}
