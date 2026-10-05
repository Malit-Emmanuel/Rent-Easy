import { Module } from '@nestjs/common';
import { loadConfig } from '../../config/env';
import { IDENTITY_PROVIDERS } from '../../providers/ports';
import { FakeIdentityProvider } from './fake-identity.provider';
import { IdentityController } from './identity.controller';
import { IDENTITY_CONFIG, IdentityConfig, IdentityVerificationService } from './identity.service';

// Real vendors (Smile ID, Didit, Sumsub, ...) are added to the registry only after legal and sandbox review (ADR-0004, ADR-0009).
@Module({
  controllers: [IdentityController],
  providers: [
    FakeIdentityProvider,
    { provide: IDENTITY_PROVIDERS, inject: [FakeIdentityProvider], useFactory: (fake: FakeIdentityProvider) => ({ fake }) },
    { provide: IDENTITY_CONFIG, useFactory: (): IdentityConfig => ({
        provider: process.env.IDENTITY_PROVIDER ?? 'fake', fingerprintPepper: loadConfig().otpPepper, badgeMonths: 12, maxSessionsPerDay: 3 }) },
    IdentityVerificationService,
  ],
  exports: [IdentityVerificationService],
})
export class IdentityModule {}
