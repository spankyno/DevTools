const enc = new TextEncoder();
const dec = new TextDecoder();

export const utf8 = (s: string) => enc.encode(s);
export const fromUtf8 = (b: Uint8Array) => dec.decode(b);

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Acepta Base64 estándar o URL-safe, con o sin relleno. */
export function fromBase64(input: string): Uint8Array {
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Base64 no válido: contiene caracteres no permitidos.');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error('Base64 no válido: longitud incorrecta.');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export const toBase64Url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Entero aleatorio uniforme en [0, max) sin sesgo de módulo. */
export function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a);
  while (a[0] >= limit);
  return a[0] % max;
}
