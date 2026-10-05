import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { CronController } from './cron.controller';
import { JobsService } from './jobs.service';

@Module({ controllers: [CronController], imports: [AuthModule, IdentityModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
