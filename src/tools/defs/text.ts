import type { ToolDef } from '../types';
import { CASES } from '../lib/words';

function lineDiff(a: string[], b: string[]): string[] {
  if (a.length * b.length > 4_000_000) throw new Error('Los textos son demasiado largos para comparar aquí (máx. ~2000 líneas cada uno).');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push('  ' + a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push('- ' + a[i++]);
    else out.push('+ ' + b[j++]);
  }
  while (i < n) out.push('- ' + a[i++]);
  while (j < m) out.push('+ ' + b[j++]);
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#)[^)\s]*)\)/g, '<a href="$2">$1</a>');
}
function markdownToHtml(src: string): string {
  const out: string[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let list: 'ul' | 'ol' | null = null, para: string[] = [], code: string[] | null = null;
  const flushP = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const closeList = () => { if (list) out.push(`</${list}>`); list = null; };
  for (const line of lines) {
    if (code) { if (line.startsWith('```')) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (line.startsWith('```')) { flushP(); closeList(); code = []; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line), ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (h) { flushP(); closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (ul || ol) {
      flushP();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (/^>\s?/.test(line)) { flushP(); closeList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushP(); closeList(); out.push('<hr>'); }
    else if (!line.trim()) { flushP(); closeList(); }
    else para.push(line.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushP(); closeList();
  return `<!doctype html><meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;padding:16px;color:#1d2332;background:#fff}code{background:#eef;padding:1px 4px;border-radius:4px}pre{background:#f3f4f8;padding:12px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #9b8cff;margin:0;padding-left:12px;color:#555}</style>${out.join('\n')}`;
}

const tools: ToolDef[] = [
  {
    id: 'regex',
    name: 'Regex Tester',
    desc: 'Prueba expresiones regulares y muestra coincidencias y grupos.',
    category: 'Texto',
    icon: '.*',
    sample: '\\b\\w+@\\w+\\.\\w+\\b',
    secondLabel: 'Texto donde buscar',
    secondSample: 'Escribe a ana@correo.es o a luis@ejemplo.com para más info.',
    options: [{ id: 'flags', label: 'Flags', type: 'text', default: 'g' }],
    hint: 'Una expresión con retroceso excesivo puede bloquear la pestaña. Evita patrones como (a+)+.',
    run(input, extra, o) {
      if (!input) throw new Error('Escribe una expresión regular en el primer campo.');
      const flags = String(o.flags).includes('g') ? String(o.flags) : String(o.flags) + 'g';
      const ms = [...extra.matchAll(new RegExp(input, flags))];
      if (!ms.length) return 'Sin coincidencias.';
      return `${ms.length} coincidencia(s)\n\n` + ms.map((m, i) => {
        const groups = m.slice(1).map((g, k) => `    grupo ${k + 1}: ${g ?? '(sin captura)'}`);
        const named = m.groups ? Object.entries(m.groups).map(([k, v]) => `    «${k}»: ${v ?? '(sin captura)'}`) : [];
        return [`#${i + 1}  «${m[0]}»  @ ${m.index}`, ...groups, ...named].join('\n');
      }).join('\n');
    },
  },
  {
    id: 'text-diff',
    name: 'Text Diff',
    desc: 'Compara dos textos línea a línea.',
    category: 'Texto',
    icon: '⇄',
    sample: 'Primera línea\nLínea que cambia\nFin',
    secondLabel: 'Segundo texto',
    secondSample: 'Primera línea\nLínea cambiada\nFin\nLínea nueva',
    run(input, extra) {
      const d = lineDiff(input.split(/\r?\n/), extra.split(/\r?\n/));
      return d.some((l) => !l.startsWith('  ')) ? d.join('\n') : '✓ Sin diferencias.';
    },
  },
  {
    id: 'case',
    name: 'Case Converter',
    desc: 'camelCase, PascalCase, snake_case, kebab-case, MAYÚSCULAS y más.',
    category: 'Texto',
    icon: 'Aa',
    sample: 'DevTools toolbox: herramientas para desarrolladores',
    options: [{ id: 'mode', label: 'Formato', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Todos' }, ...CASES.map((c) => ({ value: c.id, label: c.label }))] }],
    tip: 'Reconoce palabras en camelCase, PascalCase, snake_case y kebab-case de la entrada.',
    run(input, _e, o) {
      const lines = input.split(/\r?\n/);
      const conv = (fn: (l: string) => string) => lines.map(fn).join('\n');
      if (o.mode !== 'all') return conv(CASES.find((c) => c.id === o.mode)!.fn);
      return lines.length === 1
        ? CASES.map((c) => `${c.label.padEnd(14)} ${c.fn(lines[0])}`).join('\n')
        : CASES.map((c) => `── ${c.label} ──\n${conv(c.fn)}`).join('\n\n');
    },
  },
  {
    id: 'markdown',
    name: 'Markdown Preview',
    desc: 'Previsualiza Markdown (también genera el HTML).',
    category: 'Texto',
    icon: 'M↓',
    view: 'html',
    sample: '# Hola\n\nEscribe **Markdown** aquí.\n\n- Lista uno\n- Lista dos\n\n`código` y [un enlace](https://example.com)',
    tip: 'Admite títulos, negrita, cursiva, código, listas, citas y enlaces. El resultado copiado es el HTML.',
    run: (input) => markdownToHtml(input),
  },
];
export default tools;
