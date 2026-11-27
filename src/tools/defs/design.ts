import type { ToolDef } from '../types';
import { hslToRgb, parseColor, rgbToCmyk, rgbToHsl, rgbToHsv, toHex, type RGB } from '../lib/color';
import { hexesIn, page, swatchPage } from '../lib/preview';

const lum = (c: RGB) => {
  const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const r0 = Math.round;

const tools: ToolDef[] = [
  {
    id: 'gradient', name: 'CSS Gradient Generator', desc: 'Crea degradados CSS lineales o radiales.', category: 'Diseño', icon: '◒',
    sample: '#7565ff', secondLabel: 'Segundo color', secondSample: '#24c9a2',
    options: [
      { id: 'type', label: 'Tipo', type: 'select', default: 'linear', choices: [{ value: 'linear', label: 'Lineal' }, { value: 'radial', label: 'Radial' }] },
      { id: 'angle', label: 'Ángulo (°)', type: 'number', default: 135, min: 0, max: 360 },
    ],
    preview: (out) => page(`<div style="height:100vh;${out}"></div>`),
    run(input, extra, o) {
      const a = toHex(parseColor(input.trim() || '#7565ff')), b = toHex(parseColor(extra.trim() || '#24c9a2'));
      return o.type === 'radial' ? `background: radial-gradient(circle, ${a}, ${b});` : `background: linear-gradient(${Number(o.angle) || 0}deg, ${a}, ${b});`;
    },
  },
  {
    id: 'color', name: 'Color Converter / Picker', desc: 'Convierte entre HEX, RGB, HSL, HSV y CMYK (acepta nombres básicos).', category: 'Diseño', icon: '◉',
    sample: '#7565ff', preview: swatchPage,
    tip: 'Acepta #RGB, #RRGGBB, rgb(12, 34, 56), hsl(210, 50%, 40%) o nombres como red, teal, orange.',
    run(input) {
      const c = parseColor(input || '#7565ff');
      const [h, s, l] = rgbToHsl(c), [hv, sv, v] = rgbToHsv(c), cmyk = rgbToCmyk(c);
      return [`HEX   ${toHex(c)}`, `RGB   rgb(${c.r}, ${c.g}, ${c.b})`, `HSL   hsl(${r0(h)}, ${r0(s)}%, ${r0(l)}%)`, `HSV   hsv(${r0(hv)}, ${r0(sv)}%, ${r0(v)}%)`, `CMYK  cmyk(${cmyk.map(r0).join('%, ')}%)`].join('\n');
    },
  },
  {
    id: 'color-palette', name: 'Color Palette Generator', desc: 'Genera paletas complementarias, análogas, triádicas y monocromáticas.', category: 'Diseño', icon: '▦',
    sample: '#7565ff',
    options: [
      { id: 'scheme', label: 'Esquema', type: 'select', default: 'triadic', choices: [
        { value: 'complementary', label: 'Complementario' }, { value: 'analogous', label: 'Análogo' }, { value: 'triadic', label: 'Triádico' }, { value: 'tetradic', label: 'Tetrádico' },
        { value: 'split', label: 'Complementario dividido' }, { value: 'mono', label: 'Monocromático (tonos)' } ] },
    ],
    preview: (out) => page(`<div style="display:flex;height:100vh">${hexesIn(out).map((h) => `<div style="flex:1;background:${h};display:flex;align-items:flex-end;justify-content:center;padding:6px;color:${lum(parseColor(h)) > 0.4 ? '#000' : '#fff'}">${h}</div>`).join('')}</div>`),
    run(input, _e, o) {
      const base = parseColor(input || '#7565ff');
      const [h, s, l] = rgbToHsl(base);
      const rot = (d: number, ls = l, ss = s) => toHex(hslToRgb(h + d, ss, ls));
      const sets: Record<string, [string, string][]> = {
        complementary: [['Base', rot(0)], ['Complemento', rot(180)]],
        analogous: [['−30°', rot(-30)], ['Base', rot(0)], ['+30°', rot(30)]],
        triadic: [['Base', rot(0)], ['+120°', rot(120)], ['+240°', rot(240)]],
        tetradic: [['Base', rot(0)], ['+90°', rot(90)], ['+180°', rot(180)], ['+270°', rot(270)]],
        split: [['Base', rot(0)], ['+150°', rot(150)], ['+210°', rot(210)]],
        mono: [10, 25, 40, 55, 70, 85].map((x): [string, string] => [`Luminosidad ${x}%`, rot(0, x)]),
      };
      return sets[String(o.scheme)].map(([n, hx]) => `${hx}  ${n}`).join('\n');
    },
  },
  {
    id: 'contrast', name: 'Color Contrast Checker', desc: 'Comprueba el contraste de color según WCAG.', category: 'Diseño', icon: '◐',
    sample: '#111827', secondLabel: 'Color de fondo', secondSample: '#ffffff',
    preview: (_o, i, e) => { const fg = toHex(parseColor(i || '#111111')), bg = toHex(parseColor(e || '#ffffff')); return page(`<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:${bg};color:${fg};font-size:20px">Texto de ejemplo Aa</div>`); },
    run(input, extra) {
      const a = lum(parseColor(input || '#111111')), b = lum(parseColor(extra || '#ffffff'));
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const ok = (v: boolean) => (v ? '✓ cumple' : '✗ no cumple');
      return `Contraste: ${r.toFixed(2)}:1\n\nTexto normal  AA  (4.5): ${ok(r >= 4.5)}\nTexto normal  AAA (7):   ${ok(r >= 7)}\nTexto grande  AA  (3):   ${ok(r >= 3)}\nTexto grande  AAA (4.5): ${ok(r >= 4.5)}`;
    },
  },
];
export default tools;
