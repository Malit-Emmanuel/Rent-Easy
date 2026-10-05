import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { Public } from '../auth/auth.decorators';
import { PG_POOL } from '../audit/audit.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private pool: Pool) {}
  @Public() @Get() async check() {
    await this.pool.query('SELECT 1');
    return { status: 'ok' };
  }
}
