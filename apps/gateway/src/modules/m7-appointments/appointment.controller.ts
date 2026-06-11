import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Audit } from '../../core/audit/decorators/audit.decorator';
import type { AppointmentList } from './appointment.types';
import type { AuthenticatedRequest } from '../../core/auth/auth.types';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly service: AppointmentService) {}

  @Get()
  @Audit('R')
  list(@Req() req: AuthenticatedRequest): Promise<AppointmentList> {
    return this.service.list(req.user.role);
  }

  @Post()
  @Audit('C')
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }
}
