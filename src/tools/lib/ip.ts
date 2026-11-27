export function parseIPv4(s: string): number | null {
  const p = s.trim().split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => (a * 256 + Number(x)) >>> 0, 0);
}
export const ipv4ToStr = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

export function parseIPv6(input: string): number[] | null {
  let s = input.trim().toLowerCase().replace(/%.*$/, '').replace(/^\[|\]$/g, '');
  if (!s.includes(':')) return null;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = parseIPv4(v4[1]);
    if (n === null) return null;
    s = s.slice(0, -v4[1].length) + ((n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16));
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const grp = (t: string) => (t === '' ? [] : t.split(':'));
  const left = grp(halves[0]), right = halves.length === 2 ? grp(halves[1]) : [];
  const all = [...left, ...right];
  if (all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  if (halves.length === 1 ? left.length !== 8 : left.length + right.length > 7) return null;
  const fill = halves.length === 2 ? Array(8 - left.length - right.length).fill('0') : [];
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16));
}
export const expandIPv6 = (h: number[]) => h.map((x) => x.toString(16).padStart(4, '0')).join(':');
export function compressIPv6(h: number[]): string {
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8;) {
    if (h[i] !== 0) { i++; continue; }
    let j = i; while (j < 8 && h[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const hex = h.map((x) => x.toString(16));
  if (bestLen < 2) return hex.join(':');
  return hex.slice(0, best).join(':') + '::' + hex.slice(best + bestLen).join(':');
}

const V4_RANGES: [string, number, string][] = [
  ['0.0.0.0', 8, 'Esta red (no enrutable)'], ['10.0.0.0', 8, 'Privada (RFC 1918)'], ['100.64.0.0', 10, 'CGNAT / espacio compartido (RFC 6598)'],
  ['127.0.0.0', 8, 'Loopback'], ['169.254.0.0', 16, 'Link-local (APIPA)'], ['172.16.0.0', 12, 'Privada (RFC 1918)'],
  ['192.0.0.0', 24, 'Protocolos IETF'], ['192.0.2.0', 24, 'Documentación (TEST-NET-1)'], ['192.168.0.0', 16, 'Privada (RFC 1918)'],
  ['198.18.0.0', 15, 'Pruebas de rendimiento'], ['198.51.100.0', 24, 'Documentación (TEST-NET-2)'], ['203.0.113.0', 24, 'Documentación (TEST-NET-3)'],
  ['224.0.0.0', 4, 'Multicast'], ['240.0.0.0', 4, 'Reservada'],
];
export function classifyV4(n: number): string {
  if (n === 0xffffffff) return 'Broadcast limitado';
  for (const [base, bits, desc] of V4_RANGES) {
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    if (((n & mask) >>> 0) === parseIPv4(base)) return desc;
  }
  return 'Pública (enrutable en Internet)';
}
export function classifyV6(h: number[]): string {
  if (h.every((x) => x === 0)) return 'No especificada (::)';
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return 'Loopback (::1)';
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return `IPv4 mapeada (${ipv4ToStr(((h[6] << 16) | h[7]) >>> 0)})`;
  if ((h[0] & 0xffc0) === 0xfe80) return 'Link-local (fe80::/10)';
  if ((h[0] & 0xfe00) === 0xfc00) return 'Local única / privada (fc00::/7)';
  if ((h[0] & 0xff00) === 0xff00) return 'Multicast (ff00::/8)';
  if (h[0] === 0x2001 && h[1] === 0x0db8) return 'Documentación (2001:db8::/32)';
  if ((h[0] & 0xe000) === 0x2000) return 'Unicast global (2000::/3)';
  return 'Reservada / otro';
}
