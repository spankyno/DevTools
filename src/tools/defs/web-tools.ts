import type { ToolDef } from '../types';
import { fromBase64, toBase64, utf8 } from '../lib/bytes';
import { parseColor, toHex } from '../lib/color';
import { escapeHtml } from '../lib/entities';
import { page } from '../lib/preview';

const SAMPLE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPQO9kFRAwQCgAougYF3mOgMgAAAABJRU5ErkJggg==';
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const nz = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
const kb = (n: number) => (n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB (${n} bytes)` : `${(n / 1048576).toFixed(2)} MB (${n} bytes)`);

function sniffMime(b: Uint8Array): string | null {
  const s = (a: number, n: number) => String.fromCharCode(...b.subarray(a, a + n));
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (s(0, 3) === 'GIF') return 'image/gif';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  if (s(4, 8) === 'ftypavif') return 'image/avif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return null;
}
function readDims(b: Uint8Array, mime: string): [number, number] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === 'image/png') return [dv.getUint32(16), dv.getUint32(20)];
    if (mime === 'image/gif') return [dv.getUint16(6, true), dv.getUint16(8, true)];
    if (mime === 'image/bmp') return [dv.getInt32(18, true), Math.abs(dv.getInt32(22, true))];
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
        i += 2 + dv.getUint16(i + 2);
      }
    }
  } catch { /* archivo truncado */ }
  return null;
}
function browserDims(uri: string): Promise<[number, number] | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res(null); im.src = uri; });
}
async function describeImage(bytes: Uint8Array, mimeHint: string, name?: string): Promise<string> {
  const mime = sniffMime(bytes) ?? (mimeHint.startsWith('image/') ? mimeHint : 'application/octet-stream');
  const uri = `data:${mime};base64,${toBase64(bytes)}`;
  const dims = readDims(bytes, mime) ?? (await browserDims(uri));
  const out = [...(name ? [`Archivo:       ${name}`] : []), `Tipo:          ${mime}`, `Tamaño:        ${kb(bytes.length)}`,
    dims ? `Dimensiones:   ${dims[0]} × ${dims[1]} px  (proporción ${dims[0] / gcd(dims[0], dims[1])}:${dims[1] / gcd(dims[0], dims[1])})` : 'Dimensiones:   no se pudieron leer',
    `Base64:        ${uri.length - uri.indexOf(',') - 1} caracteres (≈ +33 % sobre el archivo)`, ''];
  if (bytes.length > 750_000) out.push('Data URI omitido: el archivo supera ~750 KB y el texto sería enorme. Usa un archivo más pequeño.');
  else out.push('Data URI:', uri);
  return out.join('\n');
}
const tinyPage = (out: string) => { const u = /data:image\/[^\s]+/.exec(out)?.[0]; return page(u ? `<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px"><img style="max-width:90%;max-height:90%;image-rendering:pixelated" src="${u}"></div>` : ''); };

const tools: ToolDef[] = [
  {
    id: 'svg-placeholder', name: 'SVG Placeholder Generator', desc: 'Genera imágenes de relleno SVG con las dimensiones y colores que quieras.', category: 'HTML, CSS y JS', icon: '▨', sample: '', noInput: true,
    options: [
      { id: 'w', label: 'Ancho', type: 'number', default: 600, min: 1, max: 4000 }, { id: 'h', label: 'Alto', type: 'number', default: 400, min: 1, max: 4000 },
      { id: 'bg', label: 'Fondo', type: 'text', default: '#cccccc' }, { id: 'fg', label: 'Texto', type: 'text', default: '#555555' }, { id: 'text', label: 'Texto (vacío = medidas)', type: 'text', default: '' },
    ],
    preview: (out) => page(`<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa">${out.replace('<svg ', '<svg style="max-width:95%;max-height:95%;height:auto" ')}</div>`),
    run(_i, _e, o) {
      const w = nz(o.w, 600), h = nz(o.h, 400), bg = toHex(parseColor(String(o.bg))), fg = toHex(parseColor(String(o.fg)));
      const text = escapeHtml(String(o.text).trim() || `${w}×${h}`);
      const fs = Math.max(10, Math.round(Math.min(w, h) / 6));
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <rect width="100%" height="100%" fill="${bg}"/>\n  <text x="50%" y="50%" fill="${fg}" font-family="system-ui, sans-serif" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${text}</text>\n</svg>`;
    },
  },
  {
    id: 'svg-datauri', name: 'SVG to Data URI', desc: 'Convierte SVG a Data URI optimizado (o Base64) para usar en CSS o <img>.', category: 'HTML, CSS y JS', icon: 'svg',
    sample: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#7565ff"/></svg>',
    options: [{ id: 'mode', label: 'Codificación', type: 'select', default: 'utf8', choices: [{ value: 'utf8', label: 'URL-encoded (más corto)' }, { value: 'base64', label: 'Base64' }] }],
    preview: (out) => { const u = /data:image\/svg\+xml[^"\s)]+/.exec(out)?.[0]; return page(u ? `<div style="height:100vh;display:flex;align-items:center;justify-content:center"><img style="max-width:80%;max-height:80%" src="${escapeHtml(u)}"></div>` : ''); },
    run(input, _e, o) {
      let svg = input.trim().replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '');
      if (!/^<svg[\s>]/i.test(svg)) throw new Error('La entrada debe empezar por <svg …>.');
      if (!/<svg[^>]*\sxmlns=/i.test(svg)) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      svg = svg.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ');
      const uri = o.mode === 'base64' ? `data:image/svg+xml;base64,${toBase64(utf8(svg))}`
        : 'data:image/svg+xml,' + svg.replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23').replace(/\{/g, '%7B').replace(/\}/g, '%7D').replace(/</g, '%3C').replace(/>/g, '%3E');
      return `${uri}\n\nCSS:\nbackground-image: url("${uri}");\n\nHTML:\n<img src="${uri}" alt="">`;
    },
  },
  {
    id: 'image-tool', name: 'Image Base64 & Dimensions', desc: 'Convierte una imagen a Data URI y muestra su tipo, tamaño y dimensiones.', category: 'HTML, CSS y JS', icon: '🖼',
    sample: SAMPLE_PNG, inputLabel: 'Data URI o Base64 de una imagen (o usa el botón para elegir un archivo)',
    fileInput: { label: 'Elegir imagen…', accept: 'image/*' }, preview: tinyPage,
    hint: 'La imagen se procesa en tu navegador; no se sube a ningún servidor.',
    async run(input) {
      const t = input.trim();
      const m = /^data:([\w.+/-]+)?(?:;[\w=.-]+)*;base64,([\s\S]*)$/i.exec(t);
      const b64 = m ? m[2] : t;
      if (!/^[A-Za-z0-9+/_=\s-]{16,}$/.test(b64)) throw new Error('Pega un Data URI de imagen (data:image/png;base64,…) o su Base64.');
      return describeImage(fromBase64(b64), m?.[1] ?? '');
    },
    async runFile(file) { return describeImage(new Uint8Array(await file.arrayBuffer()), file.type, file.name); },
  },
  {
    id: 'data-uri', name: 'Data URI Generator', desc: 'Convierte texto o cualquier archivo en un Data URI.', category: 'HTML, CSS y JS', icon: 'data:',
    sample: '<h1>Hola</h1>',
    options: [
      { id: 'mime', label: 'Tipo MIME', type: 'select', default: 'text/html', choices: ['text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'image/svg+xml'].map((v) => ({ value: v, label: v })) },
      { id: 'b64', label: 'Base64', type: 'checkbox', default: false },
    ],
    fileInput: { label: 'Elegir archivo…' }, hint: 'Los Data URI inflan el tamaño (Base64 ≈ +33 %): úsalos solo para recursos pequeños.',
    run(input, _e, o) {
      const mime = String(o.mime);
      return o.b64 ? `data:${mime};base64,${toBase64(utf8(input))}` : `data:${mime};charset=utf-8,${encodeURIComponent(input)}`;
    },
    async runFile(file) {
      if (file.size > 750_000) throw new Error('El archivo supera ~750 KB; el Data URI sería demasiado grande para mostrarlo.');
      return `data:${file.type || 'application/octet-stream'};base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`;
    },
  },
  {
    id: 'meta-tags', name: 'Meta Tags Generator', desc: 'Genera etiquetas SEO, Open Graph y Twitter Card.', category: 'HTML, CSS y JS', icon: '<m>',
    sample: 'titulo: DevTools Toolbox – utilidades para desarrolladores\ndescripcion: Más de 100 herramientas gratuitas que funcionan en tu navegador, sin enviar tus datos.\nurl: https://devtools.ejemplo.com/\nimagen: https://devtools.ejemplo.com/og.png\nsitio: DevTools Toolbox\ntwitter: @devtools\nidioma: es\ncolor: #7565ff\nrobots: index, follow',
    inputLabel: 'Datos (clave: valor). Claves: titulo, descripcion, url, imagen, sitio, twitter, idioma, color, robots, autor, tipo',
    run(input) {
      const d: Record<string, string> = {};
      for (const l of input.split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) d[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
      if (!d.titulo) throw new Error('Falta «titulo: …».');
      const e = escapeHtml, t: string[] = [], warn: string[] = [];
      t.push('<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', `<title>${e(d.titulo)}</title>`);
      if (d.descripcion) t.push(`<meta name="description" content="${e(d.descripcion)}">`);
      if (d.autor) t.push(`<meta name="author" content="${e(d.autor)}">`);
      if (d.robots) t.push(`<meta name="robots" content="${e(d.robots)}">`);
      if (d.color) t.push(`<meta name="theme-color" content="${e(d.color)}">`);
      if (d.url) t.push(`<link rel="canonical" href="${e(d.url)}">`);
      t.push('', '<!-- Open Graph -->', `<meta property="og:type" content="${e(d.tipo || 'website')}">`, `<meta property="og:title" content="${e(d.titulo)}">`);
      if (d.descripcion) t.push(`<meta property="og:description" content="${e(d.descripcion)}">`);
      if (d.url) t.push(`<meta property="og:url" content="${e(d.url)}">`);
      if (d.imagen) t.push(`<meta property="og:image" content="${e(d.imagen)}">`);
      if (d.sitio) t.push(`<meta property="og:site_name" content="${e(d.sitio)}">`);
      if (d.idioma) t.push(`<meta property="og:locale" content="${e(d.idioma)}">`);
      t.push('', '<!-- Twitter Card -->', `<meta name="twitter:card" content="${d.imagen ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${e(d.titulo)}">`);
      if (d.descripcion) t.push(`<meta name="twitter:description" content="${e(d.descripcion)}">`);
      if (d.imagen) t.push(`<meta name="twitter:image" content="${e(d.imagen)}">`);
      if (d.twitter) t.push(`<meta name="twitter:site" content="${e(d.twitter)}">`);
      if (d.titulo.length > 60) warn.push(`El título tiene ${d.titulo.length} caracteres: Google suele cortarlo a ~60.`);
      if (!d.descripcion) warn.push('Falta la descripción (recomendada, ~120–160 caracteres).');
      else if (d.descripcion.length > 160) warn.push(`La descripción tiene ${d.descripcion.length} caracteres: se suele cortar a ~160.`);
      if (!d.imagen) warn.push('Sin imagen: las vistas previas al compartir serán pobres.');
      if (d.url && !/^https:\/\//.test(d.url)) warn.push('La URL canónica debería ser absoluta y con https.');
      return t.join('\n') + (warn.length ? `\n\n<!-- ⚠ ${warn.join(' · ')} -->` : '');
    },
  },
];
export default tools;
