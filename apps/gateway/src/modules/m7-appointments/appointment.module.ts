import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { FhirModule } from '../../core/fhir/fhir.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { AuthModule } from '../../core/auth/auth.module';

@Module({
  imports: [FhirModule, NotificationsModule, AuthModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class AppointmentModule {}
