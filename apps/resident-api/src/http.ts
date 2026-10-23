export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  /** Comma-separated list of allowed browser origins. */
  ALLOWED_ORIGINS: string;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'validation', 'Invalid request.');
  }
}

/** Supabase calls made with the server's secret key, plus the caller check. */
export function supabase(env: Env, fetchImpl: Fetch) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const admin = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  return {
    base,
    admin,
    async rows<T>(path: string): Promise<T[]> {
      const res = await admin(path);
      if (!res.ok) throw new Error(`select ${path.split('?')[0]} failed: ${res.status}`);
      return (await res.json()) as T[];
    },
    /** Calls a database function as service_role. Database errors keep their message and hint. */
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      const res = await admin(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
      const text = await res.text();
      const body = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const e = (body ?? {}) as { message?: string; hint?: string };
        const code = e.hint && /^[a-z_]+$/.test(e.hint) ? e.hint : 'unknown';
        const status = code === 'not_found' ? 404 : code === 'forbidden' || code === 'tenant_inactive' ? 403 : code === 'unknown' ? 500 : 400;
        if (status === 500) throw new Error(`rpc ${fn} failed: ${res.status} ${e.message ?? ''}`);
        throw new HttpError(status, code, e.message ?? 'Something went wrong. Please try again.');
      }
      return body as T;
    },
    /** The signed-in user behind a Bearer token, verified by Supabase Auth. */
    async caller(request: Request): Promise<{ id: string }> {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new HttpError(401, 'not_authenticated', 'Sign in to continue.');
      const me = await fetchImpl(`${base}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!me.ok) throw new HttpError(401, 'not_authenticated', 'Your session has expired. Please sign in again.');
      return (await me.json()) as { id: string };
    },
  };
}
