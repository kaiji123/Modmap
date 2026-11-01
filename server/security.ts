import { timingSafeEqual } from 'node:crypto';

export function validState(expected: string | undefined, actual: unknown): boolean {
  if (!expected || typeof actual !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sessionCookie(cookie: string | undefined): string | undefined {
  return cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('modmap_session='))?.slice('modmap_session='.length);
}
export function localHost(host: string | undefined): boolean {
  return Boolean(host && /^(localhost|127\.0\.0\.1)(:300[01])?$/.test(host));
}
export function localOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Non-browser local clients, still restricted by Host and session cookie.
  try { const url = new URL(origin); return (url.protocol === 'http:' || url.protocol === 'https:') && localHost(url.host); }
  catch { return false; }
}
