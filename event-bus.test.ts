import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from './event-bus';

test('delivers to all subscribers even if one fails', async () => {
  const bus = new EventBus(); const seen: string[] = [];
  bus.on('LeaseSigned', () => { throw new Error('boom'); });
  bus.on('LeaseSigned', (e) => { seen.push(e.leaseId); });
  await assert.rejects(() => bus.emit({ type: 'LeaseSigned', leaseId: 'L1' }));
  assert.deepEqual(seen, ['L1']);
});
