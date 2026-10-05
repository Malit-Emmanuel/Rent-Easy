// Structured JSON logs with PII redaction (Plan §10.1: logs without PII).
const SENSITIVE_KEYS = /phone|msisdn|id_?number|national_?id|passport|token|secret|password|otp|authorization|selfie/i;
const PHONE = /(\+?254|0)[17]\d{8}\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (typeof value === 'string') return value.replace(PHONE, '[phone]');
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, SENSITIVE_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1)]));
  }
  return value;
}

export function logLine(level: 'info' | 'warn' | 'error', msg: string, ctx: Record<string, unknown> = {}) {
  return JSON.stringify({ t: new Date().toISOString(), level, msg: redact(msg), ...(redact(ctx) as object) });
}
export const log = {
  info: (m: string, c?: Record<string, unknown>) => console.log(logLine('info', m, c)),
  warn: (m: string, c?: Record<string, unknown>) => console.warn(logLine('warn', m, c)),
  error: (m: string, c?: Record<string, unknown>) => console.error(logLine('error', m, c)),
};
