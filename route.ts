import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/proxy-rules';
import { AT, callApi, clearSession, RT } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin('POST', req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const rt = req.cookies.get(RT)?.value, at = req.cookies.get(AT)?.value;
  if (rt) await callApi('/auth/logout', { method: 'POST', token: at, body: { refreshToken: rt } }).catch(() => {});
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
