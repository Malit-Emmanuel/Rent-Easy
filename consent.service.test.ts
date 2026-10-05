import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { EventBus } from '../events/event-bus';
import { ConsentService } from './consent.service';

// Integration test: runs only when DATABASE_URL points at a migrated database.
const url = process.env.DATABASE_URL;
const t = url ? test : test.skip;

t('consent grant, check, revoke against a real database', async () => {
  const pool = new Pool({ connectionString: url });
  const events: string[] = [];
  const bus = new EventBus(); bus.on('ConsentGranted', () => { events.push('g'); }); bus.on('ConsentRevoked', () => { events.push('r'); });
  const svc = new ConsentService(pool, new AuditService(pool), bus);
  const suffix = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const tenant = (await pool.query(`INSERT INTO identity.users(phone) VALUES ($1) RETURNING id`, [`+2547${suffix}`])).rows[0].id;
  const other = (await pool.query(`INSERT INTO identity.users(phone) VALUES ($1) RETURNING id`, [`+2541${suffix}`])).rows[0].id;
  const org = (await pool.query(`INSERT INTO identity.organizations(name,kind) VALUES ('M','management_firm') RETURNING id`)).rows[0].id;
  const q = { scope: 'profile.income_proof', purpose: 'rental_application', orgId: org };

  assert.equal(await svc.check(tenant, other, q), false, 'no consent yet');
  const id = await svc.grant({ grantorId: tenant, granteeOrgId: org, scope: ['profile.income_proof'], purpose: 'rental_application', policyVersion: 'v1' });
  assert.equal(await svc.check(tenant, other, q), true);
  assert.equal(await svc.check(tenant, other, { ...q, purpose: 'lending' }), false, 'wrong purpose');
  await assert.rejects(() => svc.revoke(id, other), 'only the grantor can revoke');
  await svc.revoke(id, tenant);
  assert.equal(await svc.check(tenant, other, q), false, 'revoked');

  const logs = await pool.query(`SELECT count(*)::int n, count(*) FILTER (WHERE reason LIKE 'DENIED%')::int denied FROM governance.data_access_log WHERE subject_user_id=$1`, [tenant]);
  assert.equal(logs.rows[0].n, 4); assert.equal(logs.rows[0].denied, 3);  // 4 checks: 3 denied, 1 allowed
  const audits = await pool.query(`SELECT action FROM governance.audit_events WHERE subject_id=$1 ORDER BY id`, [id]);
  assert.deepEqual(audits.rows.map((r) => r.action), ['consent.granted', 'consent.revoked']);
  assert.deepEqual(events, ['g', 'r']);
  await pool.end();
});
