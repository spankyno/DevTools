import type { ToolDef } from '../types';

type RGB = { r: number; g: number; b: number };
function parseHex(h: string): RGB {
  let s = h.trim().replace('#', '');
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`Color HEX no válido: «${h}». Usa #RGB o #RRGGBB.`);
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const lum = (c: RGB) => {
  const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const hex = (c: RGB) => '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('');

const tools: ToolDef[] = [
  {
    id: 'gradient',
    name: 'CSS Gradient Generator',
    desc: 'Crea degradados CSS lineales o radiales.',
    category: 'Diseño',
    icon: '◒',
    sample: '#7565ff',
    secondLabel: 'Segundo color',
    secondSample: '#24c9a2',
    options: [
      { id: 'type', label: 'Tipo', type: 'select', default: 'linear', choices: [{ value: 'linear', label: 'Lineal' }, { value: 'radial', label: 'Radial' }] },
      { id: 'angle', label: 'Ángulo (°)', type: 'number', default: 135, min: 0, max: 360 },
    ],
    run(input, extra, o) {
      const a = input.trim() || '#7565ff', b = extra.trim() || '#24c9a2';
      return o.type === 'radial' ? `background: radial-gradient(circle, ${a}, ${b});` : `background: linear-gradient(${Number(o.angle) || 0}deg, ${a}, ${b});`;
    },
  },
  {
    id: 'color',
    name: 'Color Converter',
    desc: 'Convierte un color HEX a RGB y HSL.',
    category: 'Diseño',
    icon: '◉',
    sample: '#7565ff',
    run(input) {
      const c = parseHex(input || '#7565ff');
      const r = c.r / 255, g = c.g / 255, b = c.b / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
      let h = 0, s = 0;
      if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      }
      return `HEX  ${hex(c)}\nRGB  rgb(${c.r}, ${c.g}, ${c.b})\nHSL  hsl(${Math.round((h + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    },
  },
  {
    id: 'contrast',
    name: 'Color Contrast Checker',
    desc: 'Comprueba el contraste de color según WCAG.',
    category: 'Diseño',
    icon: '◐',
    sample: '#111827',
    secondLabel: 'Color de fondo',
    secondSample: '#ffffff',
    run(input, extra) {
      const a = lum(parseHex(input || '#111111')), b = lum(parseHex(extra || '#ffffff'));
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const ok = (v: boolean) => (v ? '✓ cumple' : '✗ no cumple');
      return `Contraste: ${r.toFixed(2)}:1\n\nTexto normal  AA  (4.5): ${ok(r >= 4.5)}\nTexto normal  AAA (7):   ${ok(r >= 7)}\nTexto grande  AA  (3):   ${ok(r >= 3)}\nTexto grande  AAA (4.5): ${ok(r >= 4.5)}`;
    },
  },
];
export default tools;
