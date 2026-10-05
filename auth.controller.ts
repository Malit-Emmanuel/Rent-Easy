import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Public } from './auth.decorators';
import { AuthService } from './auth.service';

const str = (v: unknown, name: string) => { if (typeof v !== 'string' || !v) throw new BadRequestException(`${name} required`); return v; };
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}

  @Public() @Post('auth/otp/request') @HttpCode(200)
  request(@Body() b: any) { return this.auth.requestOtp(str(b?.phone, 'phone')); }

  @Public() @Post('auth/otp/verify') @HttpCode(200)
  verify(@Body() b: any) { return this.auth.verifyOtp(str(b?.phone, 'phone'), str(b?.code, 'code'), optStr(b?.deviceId)); }

  @Public() @Post('auth/refresh') @HttpCode(200)
  refresh(@Body() b: any) { return this.auth.refresh(str(b?.refreshToken, 'refreshToken'), optStr(b?.deviceId)); }

  @Post('auth/logout') @HttpCode(204)
  async logout(@Body() b: any) { await this.auth.logout(optStr(b?.refreshToken) ?? ''); }

  @Get('me')
  me(@Req() req: any) { return req.user; }
}
