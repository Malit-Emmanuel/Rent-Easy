import { NextResponse } from 'next/server';

export const AT = 'khp_at', RT = 'khp_rt', DEV = 'khp_dev';
const secure = () => process.env.COOKIE_SECURE !== 'false';
export const apiUrl = () => {
  const u = process.env.API_URL; if (!u) throw new Error('API_URL is not set'); return u.replace(/\/$/, '');
};

interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }

/** Tokens live only in httpOnly cookies, so page scripts can never read them. */
export function setSession(res: NextResponse, t: Tokens, deviceId: string) {
  const base = { httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/' };
  res.cookies.set(AT, t.accessToken, { ...base, maxAge: t.expiresIn });
  res.cookies.set(RT, t.refreshToken, { ...base, maxAge: 30 * 24 * 3600 });
  res.cookies.set(DEV, deviceId, { ...base, maxAge: 365 * 24 * 3600 });
}
export function clearSession(res: NextResponse) {
  for (const n of [AT, RT]) res.cookies.set(n, '', { path: '/', maxAge: 0 });
}
export async function callApi(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const r = await fetch(apiUrl() + path, {
    method: init.method ?? 'GET', cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await r.text();
  let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { status: r.status, json };
}
