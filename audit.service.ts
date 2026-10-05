import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

export interface AuditInput {
  actorId?: string; action: string; subjectType: string; subjectId: string; metadata?: Record<string, unknown>;
}

/** Every module writes here. The DB trigger hash-chains rows and forbids UPDATE/DELETE. */
@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private pool: Pool) {}
  async record(e: AuditInput) {
    await this.pool.query(
      `INSERT INTO governance.audit_events (actor_id, action, subject_type, subject_id, metadata)
       VALUES ($1,$2,$3,$4,$5)`,
      [e.actorId ?? null, e.action, e.subjectType, e.subjectId, JSON.stringify(e.metadata ?? {})],
    );
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 5),            // serverless: many instances, so keep each pool small
      idleTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : undefined,
    }) },
    AuditService,
  ],
  exports: [PG_POOL, AuditService],
})
export class AuditModule {}
