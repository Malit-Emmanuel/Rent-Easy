export interface AppConfig {
  databaseUrl: string; redisUrl: string; port: number; appEnv: string;
  smsProvider: 'fake'; paymentsProvider: 'fake';
  jwtSecret: string; otpPepper: string; otpResendCooldownSec: number;
}

/** True only in real production. Vercel sets NODE_ENV=production for previews too, so we use APP_ENV / VERCEL_ENV instead. */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.APP_ENV ?? (env.VERCEL_ENV === 'production' ? 'production' : 'development')) === 'production';
}

/** Fail fast at boot on missing/invalid config. Only 'fake' providers exist until vendors are chosen (ADR-0004). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const need = (k: string) => { const v = env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; };
  const secret = (k: string) => { const v = need(k); if (v.length < 32) throw new Error(`${k} must be at least 32 characters`); return v; };
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0) throw new Error('PORT must be a non-negative integer');
  const sms = env.SMS_PROVIDER ?? 'fake', pay = env.PAYMENTS_PROVIDER ?? 'fake';
  if (sms !== 'fake' || pay !== 'fake') throw new Error('Only fake providers are implemented; vendors are not yet selected');
  const appEnv = isProductionEnv(env) ? 'production' : (env.APP_ENV ?? 'development');
  if (appEnv === 'production') throw new Error('Production is blocked until real vendors are selected (ADR-0004)');
  return {
    databaseUrl: need('DATABASE_URL'), redisUrl: env.REDIS_URL ?? '', port, appEnv,
    smsProvider: 'fake', paymentsProvider: 'fake',
    jwtSecret: secret('JWT_SECRET'), otpPepper: secret('OTP_PEPPER'),
    otpResendCooldownSec: Number(env.OTP_RESEND_COOLDOWN_SEC ?? 30),
  };
}
