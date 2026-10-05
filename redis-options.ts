/**
 * Extra ioredis options from the environment. Railway's private network may resolve over IPv6 only;
 * set REDIS_IP_FAMILY=6 (or 4, or 0 for automatic) if the first deployment cannot reach Redis.
 * Unset keeps the library default.
 */
export function redisOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): { family?: 0 | 4 | 6 } {
  const v = env.REDIS_IP_FAMILY;
  if (v === undefined || v === '') return {};
  if (v !== '0' && v !== '4' && v !== '6') throw new Error('REDIS_IP_FAMILY must be 0, 4 or 6');
  return { family: Number(v) as 0 | 4 | 6 };
}
