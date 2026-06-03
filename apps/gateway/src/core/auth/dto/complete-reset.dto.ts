import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CompleteResetDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
