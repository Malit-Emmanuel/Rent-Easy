import { NextRequest, NextResponse } from 'next/server';
import { isAllowedProxyPath, isSameOrigin } from '@/lib/proxy-rules';
import { AT, apiUrl } from '@/lib/session';

/**
 * Forwards allow-listed calls to the API with the access token from the httpOnly cookie.
 * It never refreshes tokens itself: parallel refreshes would trip refresh-token reuse detection,
 * so the browser refreshes once (see lib/client.ts) and retries.
 */
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!isAllowedProxyPath(path)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!isSameOrigin(req.method, req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const token = req.cookies.get(AT)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
  const r = await fetch(apiUrl() + '/' + path.join('/') + req.nextUrl.search, {
    method: req.method, cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: hasBody ? await req.text() : undefined,
  });
  const text = await r.text();
  return new NextResponse(r.status === 204 ? null : text, { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
}
export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
