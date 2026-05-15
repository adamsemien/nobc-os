import { headers } from 'next/headers';

/** Server-side fetch to same-origin API with forwarded cookies (Clerk session). */
export async function operatorServerFetch(path: string): Promise<Response> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  // Prefer the incoming request origin so dev on e.g. :3004 still hits the same server
  // (NEXT_PUBLIC_APP_URL is often fixed to :3000 and would break operator RSC fetches).
  const fromRequest = host ? `${proto}://${host}` : null;
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? null;
  const base = fromRequest ?? envBase ?? 'http://localhost:3000';
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    cache: 'no-store',
    headers: { cookie: h.get('cookie') ?? '' },
  });
}
