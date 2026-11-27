// Punycode (RFC 3492) para etiquetas de dominio internacionalizadas.
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700;
const adapt = (delta: number, n: number, first: boolean) => {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / n);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) { delta = Math.floor(delta / (BASE - TMIN)); k += BASE; }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
};
const digit = (d: number) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
const thr = (k: number, bias: number) => (k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias);

export function punyEncode(input: string): string {
  const cps = [...input].map((c) => c.codePointAt(0)!);
  let out = cps.filter((c) => c < 128).map((c) => String.fromCharCode(c)).join('');
  const b = out.length;
  let h = b;
  if (b) out += '-';
  let n = 128, delta = 0, bias = 72;
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n));
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = thr(k, bias);
          if (q < t) break;
          out += digit(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        out += digit(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0; h++;
      }
    }
    delta++; n++;
  }
  return out;
}

export function punyDecode(input: string): string {
  const b = input.lastIndexOf('-');
  const out: number[] = b > 0 ? [...input.slice(0, b)].map((c) => c.charCodeAt(0)) : [];
  let n = 128, i = 0, bias = 72;
  for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
    const oldi = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      const c = input.charCodeAt(idx++);
      const d = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : NaN;
      if (Number.isNaN(d)) throw new Error('Punycode no válido.');
      i += d * w;
      const t = thr(k, bias);
      if (d < t) break;
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

export const domainToAscii = (d: string) => d.split('.').map((l) => (/[^\x00-\x7f]/.test(l) ? 'xn--' + punyEncode(l.toLowerCase()) : l)).join('.');
export const domainToUnicode = (d: string) => d.split('.').map((l) => (l.toLowerCase().startsWith('xn--') ? punyDecode(l.slice(4)) : l)).join('.');
