export type RGB = { r: number; g: number; b: number };

const NAMES: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', brown: '#a52a2a', navy: '#000080', teal: '#008080', lime: '#00ff00', maroon: '#800000',
  olive: '#808000', silver: '#c0c0c0', gold: '#ffd700', coral: '#ff7f50', indigo: '#4b0082', violet: '#ee82ee',
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const NUM = '(-?\\d+(?:\\.\\d+)?)';

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}
export function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  }
  return [h, s * 100, l * 100];
}
export function rgbToHsv({ r, g, b }: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = d === 0 ? 0 : mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [h, mx === 0 ? 0 : (d / mx) * 100, mx * 100];
}
export function rgbToCmyk({ r, g, b }: RGB): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k === 1) return [0, 0, 0, 100];
  const f = (v: number) => ((1 - v / 255 - k) / (1 - k)) * 100;
  return [f(r), f(g), f(b), k * 100];
}
export const toHex = ({ r, g, b }: RGB) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');

export function parseColor(input: string): RGB {
  const s = input.trim().toLowerCase();
  if (NAMES[s]) return parseColor(NAMES[s]);
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = new RegExp(`^(?:rgba?\\()?\\s*${NUM}[\\s,]+${NUM}[\\s,]+${NUM}`).exec(s);
  if (rgb && /^rgb|^\d/.test(s)) return { r: clamp(Math.round(+rgb[1]), 0, 255), g: clamp(Math.round(+rgb[2]), 0, 255), b: clamp(Math.round(+rgb[3]), 0, 255) };
  const hsl = new RegExp(`^hsla?\\(\\s*${NUM}(?:deg)?[\\s,]+${NUM}%?[\\s,]+${NUM}%?`).exec(s);
  if (hsl) return hslToRgb(+hsl[1], +hsl[2], +hsl[3]);
  throw new Error(`Color no reconocido: «${input.trim()}». Usa #RRGGBB, rgb(…), hsl(…) o un nombre básico (red, blue…).`);
}
