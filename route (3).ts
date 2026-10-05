import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/proxy-rules';
import { callApi } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin('POST', req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await callApi('/auth/otp/request', { method: 'POST', body: { phone: b?.phone } });
  return NextResponse.json(r.json ?? {}, { status: r.status });
}
