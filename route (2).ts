import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/proxy-rules';
import { callApi, clearSession, DEV, RT, setSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin('POST', req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const rt = req.cookies.get(RT)?.value, deviceId = req.cookies.get(DEV)?.value;
  if (!rt) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const r = await callApi('/auth/refresh', { method: 'POST', body: { refreshToken: rt, deviceId } });
  if (r.status !== 200) { const res = NextResponse.json({ message: 'Unauthorized' }, { status: 401 }); clearSession(res); return res; }
  const res = NextResponse.json({ ok: true });
  setSession(res, r.json as any, deviceId ?? '');
  return res;
}
