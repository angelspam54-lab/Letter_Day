import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const uuid = () => randomUUID();
export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const ALPHA = '23456789abcdefghjkmnpqrstuvwxyz';
/** Short, URL-safe, unambiguous id for share links (e.g. "k7m2qx9a"). */
export function shareId(len = 8): string {
  const bytes = randomBytes(len);
  let s = '';
  for (const b of bytes) s += ALPHA[b % ALPHA.length];
  return s;
}

/** Stable 32-bit hash used for deterministic daily shuffles. */
export function hash32(s: string): number {
  return createHash('sha256').update(s).digest().readUInt32BE(0);
}
