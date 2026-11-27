import type { ToolDef } from '../types';
import { parseColor } from '../lib/color';
import { page } from '../lib/preview';
import { escapeHtml } from '../lib/entities';

const nz = (v: unknown, d = 0) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
const safeCss = (v: unknown, label: string) => {
  const s = String(v).trim();
  if (!/^[\w\s.,()%\-/*+]+$/.test(s)) throw new Error(`Valor no válido en «${label}»: solo letras, números y , . ( ) % - / * +`);
  return s;
};
const boxes = (n: number, extra = '') => Array.from({ length: n }, (_, i) => `<div style="background:#7565ff;color:#fff;padding:${10 + (i % 3) * 14}px 14px;border-radius:6px;${extra}">${i + 1}</div>`).join('');

// ---------- Especificidad ----------
type Spec = [number, number, number];
const add = (x: Spec, y: Spec): Spec => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
const cmp = (x: Spec, y: Spec) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
function splitTop(s: string): string[] {
  const out: string[] = []; let d = 0, cur = '';
  for (const c of s) { if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function specificity(sel: string): Spec {
  let s = sel.replace(/"[^"]*"|'[^']*'/g, '""');
  let total: Spec = [0, 0, 0];
  const fn = /:(not|is|matches|where|has|nth-child|nth-last-child)\(/i;
  for (let m = fn.exec(s); m; m = fn.exec(s)) {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < s.length && depth) { if (s[i] === '(') depth++; if (s[i] === ')') depth--; i++; }
    const arg = s.slice(start, i - 1), name = m[1].toLowerCase();
    const maxOf = (list: string[]): Spec => list.map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0] as Spec);
    if (name === 'where') { /* especificidad 0 */ }
    else if (name.startsWith('nth')) { total = add(total, [0, 1, 0]); const of = /\sof\s(.+)$/i.exec(arg); if (of) total = add(total, maxOf(splitTop(of[1]))); }
    else total = add(total, maxOf(splitTop(arg)));
    s = s.slice(0, m.index) + ' ' + s.slice(i);
  }
  let [a, b, c] = total;
  s = s.replace(/:(?!:)[\w-]+\([^)]*\)/g, () => { b++; return ' '; })
    .replace(/\[[^\]]*\]/g, () => { b++; return ' '; })
    .replace(/::[\w-]+/g, () => { c++; return ' '; })
    .replace(/:(before|after|first-line|first-letter)\b/gi, () => { c++; return ' '; })
    .replace(/:[\w-]+/g, () => { b++; return ' '; })
    .replace(/#[\w-]+/g, () => { a++; return ' '; })
    .replace(/\.[\w-]+/g, () => { b++; return ' '; })
    .replace(/(^|[\s>+~|])([a-zA-Z][\w-]*)/g, (_m, p: string) => { c++; return p + ' '; });
  return [a, b, c];
}

function minifyCss(src: string): string {
  let out = '', paren = 0, quote = '', space = false, boundary = 0;
  const blocks: boolean[] = []; // true = bloque de at-regla (@media…), false = bloque de declaraciones
  const stick = '{};,>~+';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) { out += c; if (c === '\\') out += src[++i] ?? ''; else if (c === quote) quote = ''; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      if (src[i + 2] === '!') out += src.slice(i, stop);
      i = stop - 1; continue;
    }
    if (c === '"' || c === "'") { if (space && out && !stick.includes(out.slice(-1)) && out.slice(-1) !== ':') out += ' '; space = false; quote = c; out += c; continue; }
    if (/\s/.test(c)) { space = true; continue; }
    if (c === '(') paren++;
    if (c === ')') paren = Math.max(0, paren - 1);
    if (space && out) {
      const prev = out.slice(-1);
      const inDecl = blocks.length > 0 && !blocks[blocks.length - 1];
      const tight = (paren > 0 && prev === ':') || paren === 0 && (stick.includes(c) || stick.includes(prev) || prev === ':' || prev === ',' || (inDecl && c === ':'));
      if (!tight && !(paren > 0 && (c === ')' || prev === '('))) out += ' ';
    }
    space = false;
    if (paren === 0) {
      if (c === '{') { blocks.push(out.slice(boundary).trim().startsWith('@')); boundary = out.length + 1; }
      else if (c === '}') { blocks.pop(); boundary = out.length + 1; }
      else if (c === ';') boundary = out.length + 1;
    }
    out += c;
  }
  return out.replace(/;}/g, '}').trim();
}

const tools: ToolDef[] = [
  {
    id: 'box-shadow', name: 'Box Shadow Generator', desc: 'Genera sombras CSS con vista previa.', category: 'Diseño', icon: '▣', sample: '', noInput: true,
    options: [
      { id: 'x', label: 'X (px)', type: 'number', default: 0 }, { id: 'y', label: 'Y (px)', type: 'number', default: 8 },
      { id: 'blur', label: 'Desenfoque', type: 'number', default: 24, min: 0 }, { id: 'spread', label: 'Expansión', type: 'number', default: 0 },
      { id: 'color', label: 'Color', type: 'text', default: '#000000' }, { id: 'opacity', label: 'Opacidad %', type: 'number', default: 25, min: 0, max: 100 },
      { id: 'inset', label: 'Interior (inset)', type: 'checkbox', default: false },
    ],
    preview: (out) => page(`<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f8"><div style="width:120px;height:80px;border-radius:12px;background:#fff;${out}"></div></div>`),
    run(_i, _e, o) {
      const c = parseColor(String(o.color)), a = Math.min(100, Math.max(0, nz(o.opacity, 25))) / 100;
      return `box-shadow: ${o.inset ? 'inset ' : ''}${nz(o.x)}px ${nz(o.y)}px ${Math.max(0, nz(o.blur))}px ${nz(o.spread)}px rgba(${c.r}, ${c.g}, ${c.b}, ${a});`;
    },
  },
  {
    id: 'border-radius', name: 'Border Radius Generator', desc: 'Genera border-radius para las cuatro esquinas.', category: 'Diseño', icon: '◜', sample: '', noInput: true,
    options: [
      { id: 'tl', label: 'Sup. izq.', type: 'number', default: 24, min: 0 }, { id: 'tr', label: 'Sup. der.', type: 'number', default: 24, min: 0 },
      { id: 'br', label: 'Inf. der.', type: 'number', default: 0, min: 0 }, { id: 'bl', label: 'Inf. izq.', type: 'number', default: 24, min: 0 },
      { id: 'unit', label: 'Unidad', type: 'select', default: 'px', choices: [{ value: 'px', label: 'px' }, { value: '%', label: '%' }, { value: 'rem', label: 'rem' }] },
    ],
    preview: (out) => page(`<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f8"><div style="width:140px;height:100px;background:#7565ff;${out}"></div></div>`),
    run(_i, _e, o) {
      const u = String(o.unit), v = [o.tl, o.tr, o.br, o.bl].map((x) => Math.max(0, nz(x)) + (nz(x) === 0 ? '' : u));
      const s = v.map((x) => x || '0');
      return `border-radius: ${s.every((x) => x === s[0]) ? s[0] : s.join(' ')};`;
    },
  },
  {
    id: 'flexbox', name: 'Flexbox Generator', desc: 'Genera CSS de Flexbox y compruébalo con elementos de ejemplo.', category: 'Diseño', icon: '☰', sample: '', noInput: true,
    options: [
      { id: 'direction', label: 'Dirección', type: 'select', default: 'row', choices: ['row', 'row-reverse', 'column', 'column-reverse'].map((v) => ({ value: v, label: v })) },
      { id: 'wrap', label: 'Salto de línea', type: 'select', default: 'nowrap', choices: ['nowrap', 'wrap', 'wrap-reverse'].map((v) => ({ value: v, label: v })) },
      { id: 'justify', label: 'justify-content', type: 'select', default: 'flex-start', choices: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].map((v) => ({ value: v, label: v })) },
      { id: 'align', label: 'align-items', type: 'select', default: 'stretch', choices: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'].map((v) => ({ value: v, label: v })) },
      { id: 'gap', label: 'Gap (px)', type: 'number', default: 10, min: 0 }, { id: 'items', label: 'Elementos', type: 'number', default: 4, min: 1, max: 12 },
    ],
    preview: (_out, _i, _e, o) => page(`<div style="height:100vh;box-sizing:border-box;padding:8px;background:#f3f4f8;display:flex;flex-direction:${o.direction};flex-wrap:${o.wrap};justify-content:${o.justify};align-items:${o.align};gap:${nz(o.gap)}px">${boxes(Math.min(12, Math.max(1, nz(o.items, 4))))}</div>`),
    run: (_i, _e, o) => `display: flex;\nflex-direction: ${o.direction};\nflex-wrap: ${o.wrap};\njustify-content: ${o.justify};\nalign-items: ${o.align};\ngap: ${Math.max(0, nz(o.gap))}px;`,
  },
  {
    id: 'grid', name: 'CSS Grid Generator', desc: 'Genera CSS Grid con columnas, filas y huecos.', category: 'Diseño', icon: '▦', sample: '', noInput: true,
    options: [
      { id: 'cols', label: 'Columnas', type: 'text', default: 'repeat(3, 1fr)' }, { id: 'rows', label: 'Filas', type: 'text', default: 'auto' },
      { id: 'gap', label: 'Gap (px)', type: 'number', default: 12, min: 0 }, { id: 'items', label: 'Elementos', type: 'number', default: 6, min: 1, max: 24 },
    ],
    tip: 'Ejemplos de columnas: repeat(3, 1fr) · 200px 1fr · repeat(auto-fill, minmax(120px, 1fr)).',
    preview: (_out, _i, _e, o) => page(`<div style="height:100vh;box-sizing:border-box;padding:8px;background:#f3f4f8;display:grid;grid-template-columns:${escapeHtml(safeCss(o.cols, 'Columnas'))};grid-auto-rows:${escapeHtml(safeCss(o.rows, 'Filas'))};gap:${nz(o.gap)}px;overflow:auto">${boxes(Math.min(24, Math.max(1, nz(o.items, 6))))}</div>`),
    run: (_i, _e, o) => `display: grid;\ngrid-template-columns: ${safeCss(o.cols, 'Columnas')};\ngrid-auto-rows: ${safeCss(o.rows, 'Filas')};\ngap: ${Math.max(0, nz(o.gap))}px;`,
  },
  {
    id: 'css-filter', name: 'CSS Filter Generator', desc: 'Combina filtros CSS (blur, brillo, contraste, sepia…) con vista previa.', category: 'Diseño', icon: '◍', sample: '', noInput: true,
    options: [
      { id: 'blur', label: 'Blur (px)', type: 'number', default: 0, min: 0 }, { id: 'brightness', label: 'Brillo %', type: 'number', default: 100, min: 0 },
      { id: 'contrast', label: 'Contraste %', type: 'number', default: 100, min: 0 }, { id: 'grayscale', label: 'Grises %', type: 'number', default: 0, min: 0, max: 100 },
      { id: 'hue', label: 'Tono (°)', type: 'number', default: 0 }, { id: 'invert', label: 'Invertir %', type: 'number', default: 0, min: 0, max: 100 },
      { id: 'opacity', label: 'Opacidad %', type: 'number', default: 100, min: 0, max: 100 }, { id: 'saturate', label: 'Saturación %', type: 'number', default: 100, min: 0 },
      { id: 'sepia', label: 'Sepia %', type: 'number', default: 0, min: 0, max: 100 },
    ],
    preview: (out) => page(`<div style="height:100vh;background:linear-gradient(90deg,#e63946,#f4a261,#e9c46a,#2a9d8f,#457b9d,#7565ff);${out}"></div>`),
    run(_i, _e, o) {
      const f: string[] = [], g = (k: string, d: number) => nz(o[k], d);
      if (g('blur', 0)) f.push(`blur(${g('blur', 0)}px)`);
      if (g('brightness', 100) !== 100) f.push(`brightness(${g('brightness', 100)}%)`);
      if (g('contrast', 100) !== 100) f.push(`contrast(${g('contrast', 100)}%)`);
      if (g('grayscale', 0)) f.push(`grayscale(${g('grayscale', 0)}%)`);
      if (g('hue', 0)) f.push(`hue-rotate(${g('hue', 0)}deg)`);
      if (g('invert', 0)) f.push(`invert(${g('invert', 0)}%)`);
      if (g('opacity', 100) !== 100) f.push(`opacity(${g('opacity', 100)}%)`);
      if (g('saturate', 100) !== 100) f.push(`saturate(${g('saturate', 100)}%)`);
      if (g('sepia', 0)) f.push(`sepia(${g('sepia', 0)}%)`);
      return `filter: ${f.join(' ') || 'none'};`;
    },
  },
  {
    id: 'specificity', name: 'CSS Specificity Calculator', desc: 'Calcula la especificidad (a, b, c) de selectores CSS.', category: 'HTML, CSS y JS', icon: '#.:',
    sample: '#nav .item:hover > a::before\nul li a\n:where(#a) p\n.btn:not(.disabled, #x)\na:nth-child(2n+1 of .x)',
    tip: 'a = ids · b = clases, atributos y pseudoclases · c = elementos y pseudoelementos. :where() vale 0; :is() y :not() toman el argumento más específico.',
    run(input) {
      const sels = input.split(/\r?\n/).flatMap(splitTop);
      if (!sels.length) throw new Error('Escribe uno o más selectores.');
      const rows = sels.map((s) => ({ s, v: specificity(s) }));
      const best = rows.reduce((a, b) => (cmp(b.v, a.v) > 0 ? b : a));
      return [...rows.map(({ s, v }) => `(${v.join(', ')})  ${String(v[0] * 100 + v[1] * 10 + v[2]).padStart(3)}  ${s}`), '', rows.length > 1 ? `Gana: ${best.s}  (${best.v.join(', ')})` : '', '(La columna central es solo orientativa: la comparación real es por columnas, de izquierda a derecha.)'].filter((x, i, a) => x || a[i - 1]).join('\n');
    },
  },
  {
    id: 'selector-tester', name: 'CSS Selector Tester', desc: 'Prueba un selector CSS contra un fragmento HTML.', category: 'HTML, CSS y JS', icon: '⌖', browserOnly: true,
    sample: 'ul > li.activo', inputLabel: 'Selector CSS', secondLabel: 'HTML', secondSample: '<ul>\n  <li class="activo">Uno</li>\n  <li>Dos</li>\n  <li class="activo">Tres</li>\n</ul>',
    run(input, extra) {
      const doc = new DOMParser().parseFromString(extra, 'text/html');
      let list: NodeListOf<Element>;
      try { list = doc.querySelectorAll(input.trim()); } catch { throw new Error('Selector CSS no válido.'); }
      if (!list.length) return '0 coincidencias.';
      return `${list.length} coincidencia(s)\n\n` + [...list].slice(0, 50).map((e, i) => `${i + 1}. ${e.outerHTML.replace(/\s+/g, ' ').slice(0, 140)}`).join('\n') + (list.length > 50 ? '\n…' : '');
    },
  },
  {
    id: 'css-minify', name: 'CSS Minifier', desc: 'Minifica CSS: quita comentarios y espacios innecesarios.', category: 'HTML, CSS y JS', icon: '⇲',
    sample: '/* Tarjeta */\n.card {\n  padding: 1rem 2rem;\n  background: url("a b.png");\n  width: calc(100% - 2rem);\n}\n\n.card > a:hover { color: red; }',
    tip: 'Conserva los comentarios /*! … */, los strings y los espacios dentro de calc().',
    run: (input) => { const out = minifyCss(input); return out + (input.length ? `\n\n/* ${input.length} → ${out.length} bytes (−${Math.round((1 - out.length / input.length) * 100)} %) */` : ''); },
  },
];
export default tools;
