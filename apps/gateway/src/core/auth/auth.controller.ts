import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { AuthService, type MfaRequiredResponse, type TokenResponse } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<TokenResponse | MfaRequiredResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body() dto: MfaVerifyDto): Promise<TokenResponse> {
    return this.auth.verifyMfa(dto.mfaToken, dto.code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto): Promise<{ success: true }> {
    return this.auth.logout(dto.refreshToken);
  }
}
