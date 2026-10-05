import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/proxy-rules';
import { callApi, DEV, setSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin('POST', req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const deviceId = req.cookies.get(DEV)?.value ?? randomUUID();   // binds refresh tokens to this browser
  const r = await callApi('/auth/otp/verify', { method: 'POST', body: { phone: b?.phone, code: b?.code, deviceId } });
  if (r.status !== 200) return NextResponse.json(r.json ?? {}, { status: r.status });
  const res = NextResponse.json({ ok: true });       // tokens go to cookies, never to the page
  setSession(res, r.json as any, deviceId);
  return res;
}
