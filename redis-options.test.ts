import test from 'node:test';
import assert from 'node:assert/strict';
import { redisOptionsFromEnv as opts } from './redis-options';

test('unset means library defaults', () => { assert.deepEqual(opts({}), {}); assert.deepEqual(opts({ REDIS_IP_FAMILY: '' }), {}); });
test('accepts 0, 4 and 6', () => {
  assert.deepEqual(opts({ REDIS_IP_FAMILY: '6' }), { family: 6 });
  assert.deepEqual(opts({ REDIS_IP_FAMILY: '4' }), { family: 4 });
  assert.deepEqual(opts({ REDIS_IP_FAMILY: '0' }), { family: 0 });
});
test('rejects anything else', () => assert.throws(() => opts({ REDIS_IP_FAMILY: 'ipv6' })));
