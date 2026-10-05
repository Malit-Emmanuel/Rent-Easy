import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { redisOptionsFromEnv } from './redis-options';
import { AuthService } from '../auth/auth.service';
import { IdentityVerificationService } from '../identity/identity.service';

export const QUEUE_NAME = 'maintenance';

/**
 * Background jobs on BullMQ/Redis. Handlers are plain functions, so business logic stays testable without Redis.
 * With no REDIS_URL, jobs are disabled (local dev/CI without Redis) and a warning is logged.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Jobs');
  private conn?: IORedis; private queue?: Queue; private worker?: Worker;

  readonly handlers: Record<string, () => Promise<unknown>>;
  readonly schedules = [
    { name: 'expire-verifications', everyMs: 10 * 60 * 1000 },
    { name: 'purge-auth-data', everyMs: 24 * 60 * 60 * 1000 },
  ];

  constructor(
    @Inject(IdentityVerificationService) identity: IdentityVerificationService,
    @Inject(AuthService) auth: AuthService,
  ) {
    this.handlers = {
      'expire-verifications': () => identity.expireStale(),
      'purge-auth-data': () => auth.purgeExpired(),
    };
  }

  /** Never blocks or crashes app startup: if Redis is unreachable, jobs are degraded and the API still serves requests. */
  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) { this.log.warn('REDIS_URL not set: queue workers off (scheduled HTTP cron endpoints still work)'); return; }
    const conn = new IORedis(url, { maxRetriesPerRequest: null, retryStrategy: (n) => Math.min(n * 500, 5000), ...redisOptionsFromEnv() });
    conn.on('error', (e) => this.log.error(`redis: ${e.message}`));
    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timed out connecting to Redis')), 5000);
        conn.once('ready', () => { clearTimeout(t); resolve(); });
      });
      this.conn = conn;
      this.queue = new Queue(QUEUE_NAME, { connection: conn });
      for (const s of this.schedules) {
        await this.queue.upsertJobScheduler(s.name, { every: s.everyMs }, { name: s.name, opts: { removeOnComplete: 50, removeOnFail: 200 } });
      }
      this.worker = new Worker(QUEUE_NAME, async (job: Job) => {
        const h = this.handlers[job.name];
        if (!h) throw new Error(`Unknown job ${job.name}`);
        const out = await h();
        this.log.log(`${job.name} done ${JSON.stringify(out)}`);   // counts only, never personal data
        return out;
      }, { connection: conn, concurrency: 2 });
      this.worker.on('failed', (job, err) => this.log.error(`${job?.name} failed: ${err.message}`));
    } catch (e) {
      this.log.error(`Background jobs DISABLED: ${(e as Error).message}`);
      conn.disconnect();
    }
  }

  /** Enqueue a one-off run (operations tooling and tests). */
  async runNow(name: string) {
    if (!this.queue) throw new Error('jobs disabled');
    if (!this.handlers[name]) throw new Error(`Unknown job ${name}`);
    return this.queue.add(name, {}, { removeOnComplete: 50, removeOnFail: 200 });
  }
  async schedulerNames() { return (await this.queue?.getJobSchedulers())?.map((j) => j.key) ?? []; }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => {}); await this.queue?.close().catch(() => {});
    this.conn?.disconnect();
  }
}
