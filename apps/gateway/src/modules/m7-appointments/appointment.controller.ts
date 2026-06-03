import { Body, Controller, Post } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Audit } from '../../core/audit/decorators/audit.decorator';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly service: AppointmentService) {}

  @Post()
  @Audit('C')
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }
}
