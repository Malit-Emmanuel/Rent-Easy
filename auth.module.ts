import { Module } from '@nestjs/common';
import { loadConfig } from '../../config/env';
import { MembersController } from '../orgs/members.controller';
import { OrgsController } from '../orgs/orgs.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AUTH_CONFIG, AuthConfig, AuthService, defaultAuthTuning } from './auth.service';

@Module({
  controllers: [AuthController, OrgsController, MembersController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: (): AuthConfig => {
        const c = loadConfig();
        return { ...defaultAuthTuning, jwtSecret: c.jwtSecret, otpPepper: c.otpPepper, resendCooldownSec: c.otpResendCooldownSec };
    } },
    AuthService, AuthGuard,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
