import { IsString, MinLength } from 'class-validator';

/** Body for both /auth/refresh and /auth/logout. */
export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
