import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsNotEmpty()
  @IsString()
  patientId!: string;

  @IsNotEmpty()
  @IsDateString()
  start!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
