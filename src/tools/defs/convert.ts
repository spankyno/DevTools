import type { ToolDef } from '../types';
import { utf8 } from '../lib/bytes';
import { convertUnits, fmtNum } from '../lib/units';
import { domainToAscii, domainToUnicode } from '../lib/punycode';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const num = (s: string) => Number(s.trim().replace(',', '.'));
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

function parseBase(s: string, base: number): bigint {
  let acc = 0n;
  const b = BigInt(base);
  for (const ch of s.toLowerCase()) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error(`«${ch}» no es un dígito válido en base ${base}.`);
    acc = acc * b + BigInt(d);
  }
  return acc;
}
const group = (s: string, n: number) => s.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), ' ');

// ---- tamaños y velocidades ----
const PREFIX: Record<string, number> = { '': 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15 };
function parseSize(input: string): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([kKmMgGtTpP]?)(i?)(b|B|bit|bits|byte|bytes)?\s*$/.exec(input);
  if (!m) throw new Error('Tamaño no válido. Ejemplos: «1.5 GB», «700 MiB», «8 Mb», «4096».');
  const [, v, p, i, u] = m;
  const bin = i === 'i';
  const mult = p ? (bin ? 1024 ** ('kmgtp'.indexOf(p.toLowerCase()) + 1) : PREFIX[p.toLowerCase()]) : 1;
  const isBits = u === 'b' || u === 'bit' || u === 'bits';
  return (num(v) * mult) / (isBits ? 8 : 1);
}
function parseRate(input: string): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([kKmMgGtT]?)(i?)(b|B)(?:ps|\/s)\s*$/.exec(input);
  if (!m) throw new Error('Velocidad no válida. Ejemplos: «100 Mbps» (megabits/s), «12 MB/s» (megabytes/s), «1 Gbps».');
  const [, v, p, i, u] = m;
  const mult = p ? (i ? 1024 ** ('kmgt'.indexOf(p.toLowerCase()) + 1) : PREFIX[p.toLowerCase()]) : 1;
  return (num(v) * mult) / (u === 'b' ? 8 : 1);
}
function humanDuration(sec: number): string {
  if (sec < 1) return `${fmtNum(sec * 1000)} ms`;
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return [d && `${d} d`, h && `${h} h`, mi && `${mi} min`, (s || (!d && !h && !mi)) && `${s} s`].filter(Boolean).join(' ');
}

function kelvinToRgb(k: number): { r: number; g: number; b: number } {
  const t = k / 100, c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return { r: c(r), g: c(g), b: c(b) };
}
const swatch = (out: string) => `<body style="margin:0;height:100vh;background:${/#[0-9a-f]{6}/i.exec(out)?.[0] ?? '#fff'}">`;

const tools: ToolDef[] = [
  {
    id: 'number-base', name: 'Number Base Converter', desc: 'Binario, octal, decimal, hexadecimal y cualquier base de 2 a 36.', category: 'Conversión y cálculo', icon: '0x',
    sample: '255',
    options: [{ id: 'from', label: 'Base de entrada', type: 'select', default: 'auto', choices: [
      { value: 'auto', label: 'Automática (0x, 0b, 0o o decimal)' }, { value: '2', label: 'Binaria (2)' }, { value: '8', label: 'Octal (8)' }, { value: '10', label: 'Decimal (10)' }, { value: '16', label: 'Hexadecimal (16)' }, { value: '36', label: 'Base 36' } ] }],
    tip: 'Admite números enteros grandes (sin límite de 53 bits) y negativos.',
    run(input, _e, o) {
      let s = input.trim().replace(/[\s_]/g, '');
      if (!s) throw new Error('Introduce un número.');
      const neg = s.startsWith('-');
      if (neg || s.startsWith('+')) s = s.slice(1);
      let base = o.from === 'auto' ? 10 : Number(o.from);
      const pre = /^0([xbo])/i.exec(s);
      if (pre && (o.from === 'auto' || base === { x: 16, b: 2, o: 8 }[pre[1].toLowerCase() as 'x' | 'b' | 'o'])) {
        base = { x: 16, b: 2, o: 8 }[pre[1].toLowerCase() as 'x' | 'b' | 'o']; s = s.slice(2);
      }
      if (!s) throw new Error('Falta el valor después del prefijo.');
      const n = parseBase(s, base);
      const sg = neg && n !== 0n ? '-' : '';
      const bin = n.toString(2);
      return [
        `Binario       ${sg}${group(bin.padStart(Math.ceil(bin.length / 4) * 4, '0'), 4)}`, `Octal         ${sg}${n.toString(8)}`,
        `Decimal       ${sg}${n.toString(10)}`, `Hexadecimal   ${sg}${n.toString(16).toUpperCase()}`, `Base 36       ${sg}${n.toString(36).toUpperCase()}`,
        '', `Con prefijo    ${sg}0b${bin}  ${sg}0o${n.toString(8)}  ${sg}0x${n.toString(16)}`, `Bits           ${n === 0n ? 1 : bin.length}`,
      ].join('\n');
    },
  },
  {
    id: 'text-binary', name: 'Text ↔ Hex / Binary', desc: 'Convierte texto a hexadecimal, binario, octal o decimal (UTF-8) y viceversa.', category: 'Conversión y cálculo', icon: '01',
    sample: 'Hola ñ',
    options: [
      { id: 'mode', label: 'Dirección', type: 'select', default: 'encode', choices: [{ value: 'encode', label: 'Texto → código' }, { value: 'decode', label: 'Código → texto' }] },
      { id: 'fmt', label: 'Formato', type: 'select', default: 'hex', choices: [{ value: 'hex', label: 'Hexadecimal' }, { value: 'bin', label: 'Binario' }, { value: 'oct', label: 'Octal' }, { value: 'dec', label: 'Decimal' }] },
    ],
    run(input, _e, o) {
      const base = { hex: 16, bin: 2, oct: 8, dec: 10 }[String(o.fmt)]!;
      const width = { hex: 2, bin: 8, oct: 3, dec: 1 }[String(o.fmt)]!;
      if (o.mode === 'decode') {
        let t = input.trim();
        if (o.fmt === 'hex') t = t.replace(/0x/gi, '');
        const tokens = /[\s,;]/.test(t) ? t.split(/[\s,;]+/).filter(Boolean) : o.fmt === 'hex' ? t.match(/.{1,2}/g) ?? [] : o.fmt === 'bin' ? t.match(/.{1,8}/g) ?? [] : [t];
        const bytes = tokens.map((x) => { const v = parseInt(x, base); if (!/^[0-9a-f]+$/i.test(x) || Number.isNaN(v) || v > 255) throw new Error(`Byte no válido: «${x}».`); return v; });
        try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); } catch { throw new Error('Los bytes no forman texto UTF-8 válido.'); }
      }
      return [...utf8(input)].map((b) => b.toString(base).toUpperCase().padStart(width, '0')).join(' ');
    },
  },
  {
    id: 'byte-converter', name: 'Byte Converter', desc: 'Convierte bits, bytes, KB/MB/GB y KiB/MiB/GiB.', category: 'Conversión y cálculo', icon: 'GB',
    sample: '1.5 GB',
    tip: 'Distingue b (bits) de B (bytes), y KB (1000) de KiB (1024).',
    run(input) {
      const bytes = parseSize(input);
      const dec = ['KB', 'MB', 'GB', 'TB', 'PB'], bin = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
      return [
        `Bits        ${fmtNum(bytes * 8)}`, `Bytes       ${fmtNum(bytes)}`, '',
        ...dec.map((u, i) => `${u.padEnd(11)} ${fmtNum(bytes / 1000 ** (i + 1))}`), '',
        ...bin.map((u, i) => `${u.padEnd(11)} ${fmtNum(bytes / 1024 ** (i + 1))}`),
      ].join('\n');
    },
  },
  {
    id: 'percentage', name: 'Percentage Calculator', desc: 'Porcentajes de un valor, variaciones, descuentos y aumentos.', category: 'Conversión y cálculo', icon: '%',
    sample: '15', inputLabel: 'Valor A', secondLabel: 'Valor B', secondSample: '200',
    options: [{ id: 'mode', label: 'Cálculo', type: 'select', default: 'of', choices: [
      { value: 'of', label: 'A % de B' }, { value: 'what', label: 'A es qué % de B' }, { value: 'change', label: 'Variación de A a B' }, { value: 'add', label: 'B aumentado un A %' }, { value: 'sub', label: 'B con descuento del A %' } ] }],
    run(input, extra, o) {
      const a = num(input), b = num(extra);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('A y B deben ser números.');
      switch (o.mode) {
        case 'of': return `${fmtNum(a)} % de ${fmtNum(b)} = ${fmtNum((a / 100) * b)}`;
        case 'what': if (b === 0) throw new Error('B no puede ser 0.'); return `${fmtNum(a)} es el ${fmtNum((a / b) * 100)} % de ${fmtNum(b)}`;
        case 'change': { if (a === 0) throw new Error('A no puede ser 0.'); const c = ((b - a) / Math.abs(a)) * 100; return `De ${fmtNum(a)} a ${fmtNum(b)}: ${c >= 0 ? 'aumento' : 'descenso'} del ${fmtNum(Math.abs(c))} %  (${c >= 0 ? '+' : '−'}${fmtNum(Math.abs(b - a))})`; }
        case 'add': return `${fmtNum(b)} + ${fmtNum(a)} % = ${fmtNum(b * (1 + a / 100))}`;
        default: return `${fmtNum(b)} − ${fmtNum(a)} % = ${fmtNum(b * (1 - a / 100))}  (ahorro: ${fmtNum((b * a) / 100)})`;
      }
    },
  },
  {
    id: 'unit-converter', name: 'Unit Converter', desc: 'Longitud, masa, volumen, área, velocidad, tiempo y temperatura.', category: 'Conversión y cálculo', icon: '⇌',
    sample: '10 km',
    tip: 'Escribe «valor unidad»: 10 km, 5 lb, 30 C, 100 mph, 2 gal, 3 ha… Se convierte a todas las unidades de su categoría.',
    run: (input) => convertUnits(input),
  },
  {
    id: 'css-units', name: 'CSS Units Converter', desc: 'Convierte px, rem, em, vw, vh, %, pt, cm, mm e in.', category: 'Conversión y cálculo', icon: 'px',
    sample: '24 px',
    options: [
      { id: 'base', label: 'Tamaño base (px)', type: 'number', default: 16, min: 1 }, { id: 'vw', label: 'Ancho viewport', type: 'number', default: 1920, min: 1 },
      { id: 'vh', label: 'Alto viewport', type: 'number', default: 1080, min: 1 }, { id: 'parent', label: 'Padre para % (px)', type: 'number', default: 800, min: 1 },
    ],
    run(input, _e, o) {
      const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(px|rem|em|vw|vh|vmin|vmax|%|pt|cm|mm|in)\s*$/i.exec(input);
      if (!m) throw new Error('Formato: «valor unidad», por ejemplo «24 px» o «1.5 rem».');
      const v = num(m[1]), base = Number(o.base) || 16, vw = Number(o.vw) || 1920, vh = Number(o.vh) || 1080, par = Number(o.parent) || 800;
      const toPx: Record<string, number> = { px: 1, rem: base, em: base, vw: vw / 100, vh: vh / 100, vmin: Math.min(vw, vh) / 100, vmax: Math.max(vw, vh) / 100, '%': par / 100, pt: 96 / 72, cm: 96 / 2.54, mm: 96 / 25.4, in: 96 };
      const px = v * toPx[m[2].toLowerCase()];
      return Object.entries(toPx).filter(([u]) => u !== 'em').map(([u, f]) => `${fmtNum(px / f).padStart(12)} ${u}`).join('\n');
    },
  },
  {
    id: 'aspect-ratio', name: 'Aspect Ratio Calculator', desc: 'Simplifica proporciones y calcula dimensiones al redimensionar.', category: 'Conversión y cálculo', icon: '16:9',
    sample: '1920x1080', secondLabel: 'Nueva dimensión (opcional): «ancho=1280» o «alto=720»', secondSample: 'ancho=1280',
    run(input, extra) {
      const m = /^\s*(\d+(?:\.\d+)?)\s*[x×:*,\s]\s*(\d+(?:\.\d+)?)\s*$/i.exec(input);
      if (!m) throw new Error('Formato: «ancho x alto», por ejemplo «1920x1080».');
      const w = Number(m[1]), h = Number(m[2]);
      if (!w || !h) throw new Error('Ancho y alto deben ser mayores que 0.');
      const g = Number.isInteger(w) && Number.isInteger(h) ? gcd(w, h) : 1;
      const out = [`Proporción:  ${w / g}:${h / g}`, `Decimal:     ${(w / h).toFixed(4)}`, `Orientación: ${w > h ? 'horizontal' : w < h ? 'vertical' : 'cuadrada'}`];
      const e = /^\s*(ancho|alto|w|h)?\s*=?\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(extra);
      if (extra.trim()) {
        if (!e) throw new Error('La nueva dimensión debe ser como «ancho=1280» o «alto=720».');
        const val = num(e[2]);
        const isH = /^(alto|h)$/i.test(e[1] ?? '');
        out.push('', isH ? `Con alto ${val}: ancho = ${fmtNum((val * w) / h)}  (≈ ${Math.round((val * w) / h)})` : `Con ancho ${val}: alto = ${fmtNum((val * h) / w)}  (≈ ${Math.round((val * h) / w)})`);
      }
      out.push('', 'Tamaños equivalentes:', ...[320, 640, 1280, 1920, 3840].map((x) => `  ${String(x).padStart(5)} × ${Math.round((x * h) / w)}`));
      return out.join('\n');
    },
  },
  {
    id: 'dpi-ppi', name: 'Resolution / DPI / PPI', desc: 'Megapíxeles, densidad de píxeles y tamaño de impresión.', category: 'Conversión y cálculo', icon: 'dpi',
    sample: '1920x1080', secondLabel: 'Diagonal de la pantalla en pulgadas (opcional)', secondSample: '15.6',
    run(input, extra) {
      const m = /^\s*(\d+)\s*[x×*,\s]\s*(\d+)\s*$/i.exec(input);
      if (!m) throw new Error('Formato: «ancho x alto» en píxeles, por ejemplo «1920x1080».');
      const w = Number(m[1]), h = Number(m[2]);
      const out = [`Píxeles totales:  ${(w * h).toLocaleString('es-ES')}  (${((w * h) / 1e6).toFixed(2)} MP)`];
      const diag = extra.trim() ? num(extra) : NaN;
      if (extra.trim()) {
        if (!(diag > 0)) throw new Error('La diagonal debe ser un número mayor que 0.');
        const ppi = Math.hypot(w, h) / diag, k = diag / Math.hypot(w, h);
        out.push(`Densidad:         ${ppi.toFixed(1)} PPI`, `Tamaño físico:    ${(w * k).toFixed(2)} × ${(h * k).toFixed(2)} in  (${(w * k * 2.54).toFixed(1)} × ${(h * k * 2.54).toFixed(1)} cm)`);
      }
      out.push('', 'Tamaño de impresión según DPI:', ...[72, 150, 300, 600].map((d) => `  ${String(d).padStart(3)} DPI → ${(w / d).toFixed(2)} × ${(h / d).toFixed(2)} in  (${((w / d) * 2.54).toFixed(1)} × ${((h / d) * 2.54).toFixed(1)} cm)`));
      return out.join('\n');
    },
  },
  {
    id: 'data-transfer', name: 'Data Transfer Calculator', desc: 'Calcula cuánto tarda en transferirse un archivo según la velocidad.', category: 'Conversión y cálculo', icon: '⇅',
    sample: '4.7 GB', inputLabel: 'Tamaño', secondLabel: 'Velocidad (Mbps = megabits/s · MB/s = megabytes/s)', secondSample: '100 Mbps',
    options: [{ id: 'eff', label: 'Rendimiento real (%)', type: 'number', default: 100, min: 1, max: 100 }],
    tip: 'En redes reales el rendimiento útil suele ser del 80–95 % por la sobrecarga de los protocolos.',
    run(input, extra, o) {
      const size = parseSize(input), rate = parseRate(extra) * ((Number(o.eff) || 100) / 100);
      if (rate <= 0) throw new Error('La velocidad debe ser mayor que 0.');
      const t = size / rate;
      return [`Tamaño:     ${fmtNum(size)} bytes`, `Velocidad:  ${fmtNum(rate)} bytes/s  (${fmtNum((rate * 8) / 1e6)} Mbps efectivos)`, '', `Tiempo:     ${humanDuration(t)}`, `Segundos:   ${fmtNum(t)}`].join('\n');
    },
  },
  {
    id: 'color-temperature', name: 'Color Temperature', desc: 'Convierte temperatura de color (Kelvin) a RGB aproximado.', category: 'Conversión y cálculo', icon: 'K',
    sample: '2700',
    preview: swatch,
    tip: 'Aproximación habitual (Tanner Helland) válida de 1000 K a 40000 K.',
    run(input) {
      const k = num(input);
      if (!(k >= 1000 && k <= 40000)) throw new Error('Introduce una temperatura entre 1000 y 40000 K.');
      const { r, g, b } = kelvinToRgb(k);
      const name = k < 2000 ? 'Llama de vela' : k < 3300 ? 'Bombilla incandescente / luz cálida' : k < 4500 ? 'Luz blanca neutra' : k < 5800 ? 'Luz de día (flash, mediodía)' : k < 7500 ? 'Cielo nublado / pantalla estándar (D65 ≈ 6500 K)' : 'Sombra / cielo azul';
      return `${Math.round(k)} K  →  ${name}\n\nHEX  #${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}\nRGB  rgb(${r}, ${g}, ${b})`;
    },
  },
  {
    id: 'punycode', name: 'Punycode Converter', desc: 'Convierte dominios internacionales (münchen.de ↔ xn--mnchen-3ya.de).', category: 'Codificación', icon: 'xn',
    sample: 'münchen.de\nespañol.es\n日本語.jp',
    options: [{ id: 'mode', label: 'Dirección', type: 'select', default: 'toAscii', choices: [{ value: 'toAscii', label: 'Unicode → Punycode' }, { value: 'toUnicode', label: 'Punycode → Unicode' }] }],
    tip: 'Un dominio por línea. No aplica normalización Nameprep: usa minúsculas para obtener el resultado habitual.',
    run(input, _e, o) { return input.split(/\r?\n/).map((l) => (o.mode === 'toUnicode' ? domainToUnicode(l.trim()) : domainToAscii(l.trim()))).join('\n'); },
  },
];
export default tools;
