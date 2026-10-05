import { Controller, Get, Headers, Inject, NotFoundException, Param, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/auth.decorators';
import { JobsService } from './jobs.service';

/**
 * Scheduled-job endpoints for serverless hosting (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Fails closed: if CRON_SECRET is unset, every request is refused. Responses contain counts only.
 */
@Controller('internal/cron')
export class CronController {
  constructor(@Inject(JobsService) private jobs: JobsService) {}

  @Public() @Get(':job')
  async run(@Param('job') job: string, @Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    const expected = Buffer.from(`Bearer ${secret ?? ''}`), given = Buffer.from(auth ?? '');
    if (!secret || expected.length !== given.length || !timingSafeEqual(expected, given)) throw new UnauthorizedException();
    const handler = this.jobs.handlers[job];
    if (!handler) throw new NotFoundException();
    return { job, result: await handler() };
  }
}
