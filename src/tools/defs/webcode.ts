import type { ToolDef } from '../types';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function formatHtml(src: string, unit: string): string {
  const tokens = src.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? [];
  const out: string[] = [];
  let depth = 0;
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('</')) { depth = Math.max(0, depth - 1); out.push(unit.repeat(depth) + t); continue; }
    out.push(unit.repeat(depth) + t);
    const m = /^<([a-zA-Z][\w-]*)/.exec(t);
    if (m && !t.endsWith('/>') && !VOID.has(m[1].toLowerCase()) && !t.startsWith('<!')) depth++;
  }
  return out.join('\n');
}

function formatCss(src: string, unit: string): string {
  let out = '', depth = 0, paren = 0, quote = '';
  const nl = () => '\n' + unit.repeat(depth);
  const s = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c); // conserva comentarios
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { out += c; if (c === quote && s[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '(') paren++;
    if (c === ')') paren = Math.max(0, paren - 1);
    if (paren > 0) { out += c; continue; }
    if (c === '{') { out = out.trimEnd() + ' {'; depth++; out += nl(); }
    else if (c === '}') { depth = Math.max(0, depth - 1); out = out.trimEnd() + nl() + '}'; out += depth ? nl() : '\n'; }
    else if (c === ';') { out += ';' + nl(); }
    else if (/\s/.test(c)) { if (!/\s$/.test(out)) out += ' '; }
    else out += c;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const indentOpt = { id: 'indent', label: 'Indentación', type: 'select' as const, default: '2', choices: [
  { value: '2', label: '2 espacios' }, { value: '4', label: '4 espacios' }, { value: 'tab', label: 'Tabulador' } ] };
const unitOf = (v: unknown) => (v === 'tab' ? '\t' : ' '.repeat(Number(v)));

const tools: ToolDef[] = [
  {
    id: 'html',
    name: 'HTML Formatter',
    desc: 'Indenta y ordena código HTML.',
    category: 'HTML, CSS y JS',
    icon: '</>',
    sample: '<main><h1>Hola</h1><p>Ejemplo <b>HTML</b></p><ul><li>Uno</li><li>Dos</li></ul></main>',
    options: [indentOpt],
    tip: 'El contenido de <pre>, <script> y <style> no se trata de forma especial: revísalo tras formatear.',
    run: (input, _e, o) => formatHtml(input, unitOf(o.indent)),
  },
  {
    id: 'css',
    name: 'CSS Formatter',
    desc: 'Formatea reglas CSS con la indentación que prefieras.',
    category: 'HTML, CSS y JS',
    icon: '#',
    sample: 'body{margin:0;color:#222}.card{padding:1rem;background:url(data:image/png;base64,AAAA)}@media(min-width:600px){.card{padding:2rem}}',
    options: [indentOpt],
    run: (input, _e, o) => formatCss(input, unitOf(o.indent)),
  },
  {
    id: 'preview',
    name: 'HTML Live Preview',
    desc: 'Previsualiza HTML en un iframe aislado.',
    category: 'HTML, CSS y JS',
    icon: '▣',
    view: 'html',
    sample: '<h1>Hola, mundo</h1><p>Vista previa HTML local.</p>',
    hint: 'La vista previa está aislada (sandbox): los scripts no se ejecutan.',
    run: (input) => input,
  },
];
export default tools;
