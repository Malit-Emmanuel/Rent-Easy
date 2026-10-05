// Shared harness for HTTP integration tests. Requires a migrated Postgres at DATABASE_URL.
export async function bootApp() {
  Object.assign(process.env, { JWT_SECRET: 'j'.repeat(40), OTP_PEPPER: 'p'.repeat(40), OTP_RESEND_COOLDOWN_SEC: '0', NODE_ENV: 'test', APP_ENV: 'test' });
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { SMS_PORT } = await import('../providers/ports');
  const { PG_POOL } = await import('../modules/audit/audit.service');
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  await app.listen(0);
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const sms: any = app.get(SMS_PORT), pool: any = app.get(PG_POOL);
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (r.status === 204 ? null : await r.json().catch(() => null)) as any };
  };
  const raw = async (path: string, headers: Record<string, string>, rawBody: string) => {
    const r = await fetch(base + path, { method: 'POST', headers, body: rawBody });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const newPhone = () => `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const lastMsg = (p: string): string => sms.outbox.filter((m: any) => m.to === p).pop().body;
  const login = async (p = newPhone()) => {
    await call('POST', '/auth/otp/request', { phone: p });
    const r = await call('POST', '/auth/otp/verify', { phone: p, code: lastMsg(p).match(/\d{6}/)![0] });
    if (r.status !== 200) throw new Error('login failed ' + r.status);
    return { p, ...r.body };
  };
  const userId = async (p: string) => (await pool.query('SELECT id FROM identity.users WHERE phone=$1', [p])).rows[0].id as string;
  const close = async () => { await app.close(); await pool.end().catch(() => {}); };
  return { app, call, raw, login, newPhone, lastMsg, userId, pool, close };
}
