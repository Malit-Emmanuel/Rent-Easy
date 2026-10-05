// What the browser may reach through the dashboard's server routes. Everything else is refused.
const ALLOWED_PREFIXES = ['me', 'orgs', 'invitations', 'admin/verifications'];

export function isAllowedProxyPath(segments: string[]): boolean {
  if (!segments.length || segments.some((s) => !s || s === '.' || s === '..' || /[\\\0%]/.test(s))) return false;
  const path = segments.join('/');
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

/** CSRF defence for state-changing requests: the Origin header must match this site's own host. */
export function isSameOrigin(method: string, origin: string | null, host: string | null): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
