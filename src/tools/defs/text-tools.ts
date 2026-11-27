import type { ToolDef } from '../types';
import { randomInt } from '../lib/bytes';
import { decodeEntities, encodeEntities, escapeHtml } from '../lib/entities';

const lines = (s: string) => s.split(/\r?\n/);
const clampInt = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

// ---------- Contraseñas ----------
const COMMON = ['password', 'contraseña', 'contrasena', 'qwerty', 'admin', 'letmein', 'welcome', 'iloveyou', 'monkey', 'dragon', 'football', 'abc123', 'login', 'master', 'sunshine', 'princess', 'azerty', '123456', '12345678', '111111', '000000', 'secreto', 'hola'];
const SEQ = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function humanTime(sec: number): string {
  if (sec < 1) return 'menos de un segundo';
  const u: [number, string][] = [[60, 'segundos'], [60, 'minutos'], [24, 'horas'], [365, 'días'], [100, 'años'], [Infinity, 'siglos']];
  let v = sec, i = 0;
  while (i < u.length - 1 && v >= u[i][0]) { v /= u[i][0]; i++; }
  return v >= 1e6 ? 'millones de ' + u[i][1] : `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i][1]}`;
}
function strength(pw: string) {
  const low = pw.toLowerCase();
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[ -/:-@[-`{-~]/.test(pw)) pool += 33;
  if (/[^\x00-\x7f]/.test(pw)) pool += 30;
  let bits = pw.length * Math.log2(Math.max(pool, 1));
  const issues: string[] = [];
  if (COMMON.some((c) => low === c || low.replace(/[\d!@#$%^&*._-]+$/g, '') === c)) { bits = Math.min(bits, 12); issues.push('Es una contraseña muy común o una variación trivial de una.'); }
  const body = low.replace(/[\d\W_]{1,4}$/, '');
  const leet = body.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
  if (/^[a-z]{5,}$/.test(leet) && bits > 34) { bits = 34; issues.push('Parece una palabra con sustituciones (0→o, 4→a…) y un sufijo: es un patrón muy típico que los atacantes prueban primero.'); }
  if (/(.)\1{2,}/.test(pw)) { bits -= 6; issues.push('Tiene caracteres repetidos seguidos.'); }
  if (SEQ.some((s) => { for (let i = 0; i + 4 <= s.length; i++) { const q = s.slice(i, i + 4); if (low.includes(q) || low.includes([...q].reverse().join(''))) return true; } return false; })) { bits -= 8; issues.push('Contiene una secuencia predecible (abcd, 1234, qwer…).'); }
  if (pw.length < 12) issues.push('Es corta: lo ideal son 12 caracteres o más.');
  if (pool <= 26) issues.push('Mezcla más tipos de caracteres, o usa una frase larga.');
  return { bits: Math.max(0, bits), pool, issues };
}

// ---------- Escapes ----------
const JS_ESC: Record<string, string> = { '\\': '\\\\', "'": "\\'", '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\u2028': '\\u2028', '\u2029': '\\u2029' };
const escapers: Record<string, { esc: (s: string) => string; unesc: (s: string) => string }> = {
  json: { esc: (s) => JSON.stringify(s).slice(1, -1), unesc: (s) => { try { return JSON.parse(`"${s}"`); } catch { throw new Error('Cadena JSON no válida (¿hay comillas sin escapar?).'); } } },
  js: {
    esc: (s) => s.replace(/[\\'"\n\r\t\b\f\v\u2028\u2029]|[\x00-\x1f]/g, (c) => JS_ESC[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`),
    unesc: (s) => s.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([nrtbfv0'"\\\n]))/g, (_m, a, b, c, d) =>
      a ? String.fromCodePoint(parseInt(a, 16)) : b || c ? String.fromCharCode(parseInt(b || c, 16)) : ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' } as Record<string, string>)[d] ?? d),
  },
  html: { esc: (s) => escapeHtml(s), unesc: decodeEntities },
  xml: { esc: (s) => escapeHtml(s, true), unesc: decodeEntities },
  regex: { esc: (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'), unesc: (s) => s.replace(/\\(.)/g, '$1') },
  sql: { esc: (s) => s.replace(/'/g, "''"), unesc: (s) => s.replace(/''/g, "'") },
  csv: { esc: (s) => `"${s.replace(/"/g, '""')}"`, unesc: (s) => s.replace(/^"([\s\S]*)"$/, '$1').replace(/""/g, '"') },
};

// ---------- Extractor ----------
const EXTRACT: Record<string, { re: RegExp; clean?: (m: string) => string | null }> = {
  emails: { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  urls: { re: /\bhttps?:\/\/[^\s<>"')\]]+/gi, clean: (m) => m.replace(/[.,;:!?]+$/, '') },
  phones: { re: /(?:\+|00)?\d[\d\s().-]{6,}\d/g, clean: (m) => { const n = m.replace(/\D/g, '').length; return n >= 7 && n <= 15 && !/^\d{4}-\d{2}-\d{2}$/.test(m) ? m.trim() : null; } },
  ipv4: { re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  numbers: { re: /-?\d+(?:[.,]\d+)?/g },
  hashtags: { re: /#[\p{L}\p{N}_]+/gu },
  mentions: { re: /(?<![\w.@])@[A-Za-z0-9_]{1,30}/g },
  dates: { re: /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g },
  uuids: { re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
};

// ---------- Lorem ipsum ----------
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const word = () => LOREM[randomInt(LOREM.length)];
function sentence(): string {
  const n = 8 + randomInt(9);
  const w = Array.from({ length: n }, word);
  if (n > 10) w[4 + randomInt(n - 8)] += ',';
  return w.join(' ').replace(/^./, (c) => c.toUpperCase()).replace(/,$/, '') + '.';
}

const tools: ToolDef[] = [
  {
    id: 'text-counter', name: 'Text Counter', desc: 'Cuenta caracteres, palabras, líneas, párrafos y tiempo de lectura.', category: 'Texto', icon: 'Σ',
    sample: 'Escribe o pega un texto.\nEsta es la segunda línea.\n\nY un segundo párrafo con acentos y emojis 👋.',
    run(input) {
      const words = input.match(/\S+/g)?.length ?? 0;
      const chars = [...input].length;
      const paragraphs = input.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const sentences = input.split(/[.!?…]+(?:\s|$)/).filter((p) => p.trim()).length;
      const min = words / 200;
      return [
        `Caracteres:             ${chars}`, `Sin espacios:           ${input.replace(/\s/g, '').length}`, `Palabras:               ${words}`,
        `Frases:                 ${sentences}`, `Líneas:                 ${input ? lines(input).length : 0}`, `Párrafos:               ${paragraphs}`,
        `Bytes (UTF-8):          ${new TextEncoder().encode(input).length}`, `Lectura (200 ppm):      ${words ? (min < 1 ? 'menos de 1 min' : `${Math.ceil(min)} min`) : '–'}`,
      ].join('\n');
    },
  },
  {
    id: 'text-sorter', name: 'Text Sorter', desc: 'Ordena líneas alfabética, natural o aleatoriamente.', category: 'Texto', icon: 'A↓',
    sample: 'banana\nManzana\ncereza\narchivo10\narchivo2\n\nálamo',
    options: [
      { id: 'order', label: 'Orden', type: 'select', default: 'asc', choices: [
        { value: 'asc', label: 'A → Z' }, { value: 'desc', label: 'Z → A' }, { value: 'natural', label: 'Natural (archivo2 < archivo10)' },
        { value: 'length', label: 'Por longitud' }, { value: 'reverse', label: 'Invertir el orden' }, { value: 'shuffle', label: 'Aleatorio' } ] },
      { id: 'ignoreCase', label: 'Ignorar mayúsculas', type: 'checkbox', default: true },
      { id: 'trim', label: 'Recortar espacios', type: 'checkbox', default: true },
      { id: 'removeEmpty', label: 'Quitar líneas vacías', type: 'checkbox', default: true },
    ],
    run(input, _e, o) {
      let l = lines(input);
      if (o.trim) l = l.map((x) => x.trim());
      if (o.removeEmpty) l = l.filter(Boolean);
      const col = new Intl.Collator('es', { sensitivity: o.ignoreCase ? 'base' : 'variant', numeric: o.order === 'natural' });
      switch (o.order) {
        case 'asc': case 'natural': l.sort(col.compare); break;
        case 'desc': l.sort((a, b) => col.compare(b, a)); break;
        case 'length': l.sort((a, b) => a.length - b.length || col.compare(a, b)); break;
        case 'reverse': l.reverse(); break;
        case 'shuffle': for (let i = l.length - 1; i > 0; i--) { const j = randomInt(i + 1); [l[i], l[j]] = [l[j], l[i]]; } break;
      }
      return l.join('\n');
    },
  },
  {
    id: 'dedupe', name: 'Duplicate Remover', desc: 'Elimina líneas duplicadas o informa de cuáles se repiten.', category: 'Texto', icon: '⊜',
    sample: 'uno\ndos\nUno\ntres\ndos\ndos',
    options: [
      { id: 'mode', label: 'Modo', type: 'select', default: 'remove', choices: [
        { value: 'remove', label: 'Quitar duplicados (conserva la 1.ª)' }, { value: 'unique', label: 'Dejar solo las que no se repiten' }, { value: 'report', label: 'Informe de repetidas' } ] },
      { id: 'ignoreCase', label: 'Ignorar mayúsculas', type: 'checkbox', default: false },
      { id: 'trim', label: 'Recortar espacios', type: 'checkbox', default: true },
    ],
    run(input, _e, o) {
      const l = lines(input).map((x) => (o.trim ? x.trim() : x));
      const key = (x: string) => (o.ignoreCase ? x.toLowerCase() : x);
      const count = new Map<string, number>();
      for (const x of l) count.set(key(x), (count.get(key(x)) ?? 0) + 1);
      if (o.mode === 'unique') return l.filter((x) => count.get(key(x)) === 1).join('\n');
      if (o.mode === 'report') {
        const seen = new Set<string>(), out: string[] = [];
        for (const x of l) if (count.get(key(x))! > 1 && !seen.has(key(x))) { seen.add(key(x)); out.push(`${count.get(key(x))}×  ${x}`); }
        return out.length ? out.join('\n') : '✓ No hay líneas repetidas.';
      }
      const seen = new Set<string>();
      return l.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true))).join('\n');
    },
  },
  {
    id: 'line-breaks', name: 'Line Break Converter', desc: 'Convierte saltos de línea (LF, CRLF, CR) o une líneas.', category: 'Texto', icon: '↵',
    sample: 'Línea 1\r\nLínea 2\nLínea 3\rLínea 4',
    options: [{ id: 'to', label: 'Convertir a', type: 'select', default: 'lf', choices: [
      { value: 'lf', label: 'LF (Linux/macOS)' }, { value: 'crlf', label: 'CRLF (Windows)' }, { value: 'cr', label: 'CR (Mac clásico)' }, { value: 'space', label: 'Unir con espacios' }, { value: 'none', label: 'Unir sin separador' } ] }],
    tip: 'CRLF y CR no se ven en pantalla, pero se conservan al copiar o exportar.',
    run(input, _e, o) {
      const l = input.split(/\r\n|\r|\n/);
      return l.join({ lf: '\n', crlf: '\r\n', cr: '\r', space: ' ', none: '' }[String(o.to)] ?? '\n');
    },
  },
  {
    id: 'whitespace', name: 'Whitespace Cleaner', desc: 'Limpia espacios sobrantes, tabulaciones y líneas vacías.', category: 'Texto', icon: '␣',
    sample: '   Texto   con   espacios\textra   \n\n\n   y líneas vacías   ',
    options: [
      { id: 'trim', label: 'Recortar cada línea', type: 'checkbox', default: true },
      { id: 'collapse', label: 'Reducir espacios repetidos', type: 'checkbox', default: true },
      { id: 'removeEmpty', label: 'Quitar líneas vacías', type: 'checkbox', default: true },
      { id: 'tabs', label: 'Tabuladores → espacios', type: 'checkbox', default: false },
      { id: 'all', label: 'Quitar TODO el espacio en blanco', type: 'checkbox', default: false },
    ],
    run(input, _e, o) {
      if (o.all) return input.replace(/\s+/g, '');
      let l = lines(input);
      if (o.tabs) l = l.map((x) => x.replace(/\t/g, '  '));
      if (o.collapse) l = l.map((x) => x.replace(/(\S)[ \t]{2,}/g, '$1 '));
      if (o.trim) l = l.map((x) => x.trim());
      if (o.removeEmpty) l = l.filter((x) => x.trim() !== '');
      return l.join('\n');
    },
  },
  {
    id: 'text-reverser', name: 'Text Reverser', desc: 'Invierte caracteres, palabras o líneas.', category: 'Texto', icon: '↔',
    sample: 'Hola mundo\nSegunda línea',
    options: [{ id: 'mode', label: 'Invertir', type: 'select', default: 'chars', choices: [{ value: 'chars', label: 'Caracteres' }, { value: 'words', label: 'Orden de palabras' }, { value: 'lines', label: 'Orden de líneas' }] }],
    run(input, _e, o) {
      if (o.mode === 'lines') return lines(input).reverse().join('\n');
      if (o.mode === 'words') return lines(input).map((l) => l.split(/\s+/).reverse().join(' ')).join('\n');
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return lines(input).map((l) => [...seg.segment(l)].map((s) => s.segment).reverse().join('')).join('\n');
    },
  },
  {
    id: 'slug', name: 'Slug Generator', desc: 'Convierte títulos en slugs para URLs.', category: 'Texto', icon: '-',
    sample: '¡Cómo crear una URL amigable! Niño & café',
    options: [
      { id: 'sep', label: 'Separador', type: 'select', default: '-', choices: [{ value: '-', label: 'Guion ( - )' }, { value: '_', label: 'Guion bajo ( _ )' }, { value: '.', label: 'Punto ( . )' }] },
      { id: 'lower', label: 'Minúsculas', type: 'checkbox', default: true },
      { id: 'max', label: 'Longitud máx. (0 = sin límite)', type: 'number', default: 0, min: 0, max: 200 },
    ],
    run(input, _e, o) {
      const sep = String(o.sep);
      const max = clampInt(o.max, 0, 200, 0);
      return lines(input).map((l) => {
        let s = l.normalize('NFD').replace(/\p{M}/gu, '');
        if (o.lower) s = s.toLowerCase();
        s = s.replace(/[^A-Za-z0-9]+/g, sep).split(sep).filter(Boolean).join(sep);
        if (max && s.length > max) s = s.slice(0, max).replace(new RegExp(`\\${sep}+$`), '');
        return s;
      }).join('\n');
    },
  },
  {
    id: 'string-escape', name: 'String Escape / Unescape', desc: 'Escapa o desescapa texto para JSON, JS, HTML, XML, regex, SQL o CSV.', category: 'Texto', icon: '\\"',
    sample: 'Dijo: "hola"\nLínea 2 con \\ y \'comillas\'',
    options: [
      { id: 'format', label: 'Formato', type: 'select', default: 'json', choices: [
        { value: 'json', label: 'JSON' }, { value: 'js', label: 'JavaScript' }, { value: 'html', label: 'HTML' }, { value: 'xml', label: 'XML' }, { value: 'regex', label: 'Regex' }, { value: 'sql', label: 'SQL' }, { value: 'csv', label: 'CSV' } ] },
      { id: 'mode', label: 'Acción', type: 'select', default: 'escape', choices: [{ value: 'escape', label: 'Escapar' }, { value: 'unescape', label: 'Desescapar' }] },
    ],
    run(input, _e, o) {
      const f = escapers[String(o.format)];
      return o.mode === 'unescape' ? f.unesc(input) : f.esc(input);
    },
  },
  {
    id: 'text-extractor', name: 'Text Extractor', desc: 'Extrae correos, URLs, teléfonos, IPs, números, fechas y más de un texto.', category: 'Texto', icon: '⌕',
    sample: 'Contacto: ana@correo.es y luis.p@ejemplo.com. Web: https://ejemplo.com/ayuda?id=3.\nTel: +34 612 345 678. Servidor 192.168.1.20. Fecha 2026-11-26 #devtools @ana_dev',
    options: [
      { id: 'type', label: 'Extraer', type: 'select', default: 'emails', choices: [
        { value: 'emails', label: 'Correos' }, { value: 'urls', label: 'URLs' }, { value: 'phones', label: 'Teléfonos' }, { value: 'ipv4', label: 'IPv4' }, { value: 'numbers', label: 'Números' },
        { value: 'hashtags', label: 'Hashtags' }, { value: 'mentions', label: 'Menciones' }, { value: 'dates', label: 'Fechas' }, { value: 'uuids', label: 'UUIDs' } ] },
      { id: 'unique', label: 'Sin repetidos', type: 'checkbox', default: true },
    ],
    run(input, _e, o) {
      const def = EXTRACT[String(o.type)];
      let found = (input.match(def.re) ?? []).map((m) => (def.clean ? def.clean(m) : m)).filter((m): m is string => !!m);
      if (o.unique) found = [...new Set(found)];
      return found.length ? `${found.length} resultado(s)\n\n${found.join('\n')}` : 'No se encontró nada de ese tipo.';
    },
  },
  {
    id: 'lorem', name: 'Lorem Ipsum Generator', desc: 'Genera texto de relleno por párrafos, frases o palabras.', category: 'Generadores', icon: '¶',
    sample: '', noInput: true,
    options: [
      { id: 'unit', label: 'Unidad', type: 'select', default: 'paragraphs', choices: [{ value: 'paragraphs', label: 'Párrafos' }, { value: 'sentences', label: 'Frases' }, { value: 'words', label: 'Palabras' }] },
      { id: 'count', label: 'Cantidad', type: 'number', default: 3, min: 1, max: 100 },
      { id: 'classic', label: 'Empezar con «Lorem ipsum…»', type: 'checkbox', default: true },
    ],
    run(_i, _e, o) {
      const n = clampInt(o.count, 1, o.unit === 'words' ? 1000 : 100, 3);
      const classic = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
      let out: string;
      if (o.unit === 'words') out = Array.from({ length: n }, word).join(' ');
      else if (o.unit === 'sentences') out = Array.from({ length: n }, sentence).join(' ');
      else out = Array.from({ length: n }, () => Array.from({ length: 3 + randomInt(4) }, sentence).join(' ')).join('\n\n');
      if (o.classic) out = o.unit === 'words' ? 'lorem ipsum dolor sit amet consectetur adipiscing elit'.split(' ').concat(out.split(' ')).slice(0, n).join(' ') : classic + ' ' + out.replace(/^[^.]*\.\s?/, '');
      return o.unit === 'words' ? out.replace(/^./, (c) => c.toUpperCase()) : out;
    },
  },
  {
    id: 'random-number', name: 'Random Number Generator', desc: 'Números aleatorios enteros o decimales, con o sin repetición.', category: 'Generadores', icon: '⚄',
    sample: '', noInput: true,
    options: [
      { id: 'min', label: 'Mínimo', type: 'number', default: 1 }, { id: 'max', label: 'Máximo', type: 'number', default: 100 },
      { id: 'count', label: 'Cantidad', type: 'number', default: 5, min: 1, max: 1000 },
      { id: 'integer', label: 'Enteros', type: 'checkbox', default: true },
      { id: 'unique', label: 'Sin repetir', type: 'checkbox', default: false },
      { id: 'sort', label: 'Ordenar', type: 'checkbox', default: false },
    ],
    hint: 'Usa crypto.getRandomValues, no Math.random.',
    run(_i, _e, o) {
      let min = Number(o.min), max = Number(o.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('Mínimo y máximo deben ser números.');
      if (min > max) [min, max] = [max, min];
      const count = clampInt(o.count, 1, 1000, 5);
      const out: number[] = [];
      if (o.integer) {
        min = Math.ceil(min); max = Math.floor(max);
        const span = max - min + 1;
        if (span < 1) throw new Error('No hay enteros en ese rango.');
        if (o.unique && count > span) throw new Error(`Solo hay ${span} enteros distintos en ese rango.`);
        const seen = new Set<number>();
        while (out.length < count) {
          const v = span <= 2 ** 32 ? min + randomInt(span) : min + Math.floor((crypto.getRandomValues(new Uint32Array(2)).reduce((a, x) => a * 2 ** 32 + x, 0) / 2 ** 64) * span);
          if (o.unique) { if (seen.has(v)) continue; seen.add(v); }
          out.push(v);
        }
      } else {
        for (let i = 0; i < count; i++) out.push(Number((min + (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (max - min)).toFixed(4)));
      }
      if (o.sort) out.sort((a, b) => a - b);
      return out.join('\n');
    },
  },
  {
    id: 'html-entities', name: 'HTML Entities', desc: 'Codifica y decodifica entidades HTML (&amp;, &eacute;, &#233;…).', category: 'Codificación', icon: '&;',
    sample: '<p class="a">Café & té — 5 € © 2026 ¿Qué tal? 👋</p>',
    options: [{ id: 'mode', label: 'Modo', type: 'select', default: 'basic', choices: [
      { value: 'basic', label: 'Codificar (& < > " \')' }, { value: 'named', label: 'Codificar + nombradas (&eacute;)' }, { value: 'numeric', label: 'Codificar + numéricas (&#233;)' }, { value: 'decode', label: 'Decodificar' } ] }],
    run: (input, _e, o) => (o.mode === 'decode' ? decodeEntities(input) : encodeEntities(input, o.mode as 'basic' | 'named' | 'numeric')),
  },
  {
    id: 'unicode', name: 'Unicode Converter', desc: 'Tabla de puntos de código, escapes \\u y decodificación.', category: 'Codificación', icon: 'U+',
    sample: 'Añ€ 😀',
    options: [{ id: 'mode', label: 'Modo', type: 'select', default: 'table', choices: [
      { value: 'table', label: 'Texto → tabla de caracteres' }, { value: 'escapes', label: 'Texto → escapes \\u' }, { value: 'decode', label: 'Códigos → texto' } ] }],
    tip: 'Para decodificar acepta U+1F600, \\u00e1, \\u{1F600} y &#128512; mezclados con texto.',
    run(input, _e, o) {
      if (o.mode === 'decode') {
        return input.replace(/U\+([0-9a-fA-F]{1,6})|\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]+);|&#(\d+);/g, (m, a, b, c, d, e) => {
          const cp = a ? parseInt(a, 16) : b ? parseInt(b, 16) : c ? parseInt(c, 16) : d ? parseInt(d, 16) : Number(e);
          return cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
        });
      }
      const cps = [...input];
      if (cps.length > 500) throw new Error('Máximo 500 caracteres en esta vista.');
      if (o.mode === 'escapes') return cps.map((ch) => { const cp = ch.codePointAt(0)!; return cp < 128 ? ch : cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`; }).join('');
      const enc = new TextEncoder();
      return ['Car.  Código       Decimal   UTF-8', ...cps.map((ch) => {
        const cp = ch.codePointAt(0)!;
        const shown = cp < 32 || cp === 127 ? '·' : ch;
        return `${shown.padEnd(5)} ${('U+' + cp.toString(16).toUpperCase().padStart(4, '0')).padEnd(11)} ${String(cp).padEnd(9)} ${[...enc.encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`;
      })].join('\n');
    },
  },
  {
    id: 'password-strength', name: 'Password Strength Checker', desc: 'Estima la fortaleza y el tiempo de ataque de una contraseña.', category: 'Seguridad', icon: '▰',
    sample: 'Tr0ub4dor&3',
    hint: 'Se evalúa solo en tu navegador y nunca se guarda ni se envía. Aun así, evita pegar contraseñas reales que uses en servicios importantes. No usa diccionarios: si contiene palabras o nombres, es más débil de lo que indica.',
    tip: 'Es una estimación orientativa (fuerza bruta con un atacante rápido), no una garantía.',
    run(input) {
      if (!input) throw new Error('Escribe una contraseña para evaluarla.');
      const pw = lines(input)[0];
      const { bits, pool, issues } = strength(pw);
      const label = bits < 28 ? 'Muy débil' : bits < 36 ? 'Débil' : bits < 60 ? 'Media' : bits < 80 ? 'Fuerte' : 'Muy fuerte';
      const seconds = 2 ** bits / 1e10 / 2;
      return [
        `Fortaleza:   ${label}  (~${Math.round(bits)} bits de entropía)`, `Longitud:    ${[...pw].length} caracteres · alfabeto estimado de ${pool}`,
        `Tiempo medio de ataque offline (10.000 millones de intentos/s): ${humanTime(seconds)}`,
        '', ...(issues.length ? ['Problemas detectados:', ...issues.map((i) => '  • ' + i)] : ['✓ No se detectaron patrones débiles evidentes.']),
      ].join('\n');
    },
  },
];
export default tools;
