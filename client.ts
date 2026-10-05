// Browser-side API helper. One shared refresh at a time: parallel refreshes would trip the API's token-reuse protection.
let refreshing: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' }).then((r) => r.ok).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T | null }> {
  const go = () => fetch('/api/proxy/' + path.replace(/^\//, ''), {
    method: init.method ?? 'GET', headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let r = await go();
  if (r.status === 401) {
    if (await refreshOnce()) r = await go();
    else { window.location.href = '/login'; }
  }
  const text = await r.text();
  let data: T | null = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, data };
}
