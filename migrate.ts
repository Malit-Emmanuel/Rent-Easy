import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

/** Applies db/migrations/*.sql in order, each in a transaction, recording checksums. Never edits applied files. */
async function main() {
  const dir = join(__dirname, '../../../db/migrations');
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, sha text NOT NULL, applied_at timestamptz DEFAULT now())');
  const { createHash } = await import('crypto');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8'), sha = createHash('sha256').update(sql).digest('hex');
    const done = await c.query('SELECT sha FROM public.schema_migrations WHERE name=$1', [f]);
    if (done.rows[0]) { if (done.rows[0].sha !== sha) throw new Error(`${f} changed after being applied; write a new migration`); continue; }
    await c.query('BEGIN'); try { await c.query(sql); await c.query('INSERT INTO public.schema_migrations(name,sha) VALUES ($1,$2)', [f, sha]); await c.query('COMMIT'); console.log('applied', f); }
    catch (e) { await c.query('ROLLBACK'); throw e; }
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
