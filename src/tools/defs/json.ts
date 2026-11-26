import type { ToolDef } from '../types';
import { checkJson, describeJsonError, parseJson } from '../lib/json';

function diff(a: unknown, b: unknown, path: string, out: string[]) {
  const show = (v: unknown) => JSON.stringify(v);
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in b)) out.push(`- ${p}: ${show(a[k])}`);
      else diff(a[k], b[k], p, out);
    }
    for (const k of Object.keys(b)) if (!(k in a)) out.push(`+ ${path ? `${path}.${k}` : k}: ${show(b[k])}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const p = `${path}[${i}]`;
      if (i >= a.length) out.push(`+ ${p}: ${show(b[i])}`);
      else if (i >= b.length) out.push(`- ${p}: ${show(a[i])}`);
      else diff(a[i], b[i], p, out);
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`~ ${path || '(raíz)'}: ${show(a)} → ${show(b)}`);
}

const tools: ToolDef[] = [
  {
    id: 'json',
    name: 'JSON Formatter / Validator',
    desc: 'Formatea, minifica y valida JSON con línea y columna.',
    category: 'JSON y XML',
    icon: '{}',
    order: 0,
    sample: '{"nombre":"DevTools Toolbox","version":1,"activo":true,"etiquetas":["json","utilidades"]}',
    options: [
      { id: 'mode', label: 'Modo', type: 'select', default: 'format', choices: [
        { value: 'format', label: 'Formatear' }, { value: 'minify', label: 'Minificar' }, { value: 'validate', label: 'Solo validar' } ] },
      { id: 'indent', label: 'Indentación', type: 'select', default: '2', choices: [
        { value: '2', label: '2 espacios' }, { value: '4', label: '4 espacios' }, { value: 'tab', label: 'Tabulador' } ] },
      { id: 'sort', label: 'Ordenar claves', type: 'checkbox', default: false },
    ],
    run(input, _e, o) {
      if (o.mode === 'validate') {
        if (!input.trim()) return 'Introduce un JSON.';
        const err = checkJson(input);
        if (err) return '✗ JSON no válido\n\n' + describeJsonError(input, err);
        const v = JSON.parse(input);
        const tipo = Array.isArray(v) ? `array de ${v.length} elementos` : v && typeof v === 'object' ? `objeto con ${Object.keys(v).length} claves` : typeof v;
        return `✓ JSON válido (${tipo})`;
      }
      let v = parseJson(input);
      if (o.sort) {
        const sortDeep = (x: unknown): unknown =>
          Array.isArray(x) ? x.map(sortDeep) : x && typeof x === 'object'
            ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, y]) => [k, sortDeep(y)])) : x;
        v = sortDeep(v);
      }
      if (o.mode === 'minify') return JSON.stringify(v);
      return JSON.stringify(v, null, o.indent === 'tab' ? '\t' : Number(o.indent));
    },
  },
  {
    id: 'json-viewer',
    name: 'JSON Viewer',
    desc: 'Explora un JSON como árbol expandible.',
    category: 'JSON y XML',
    icon: '🌲',
    order: 1,
    view: 'tree',
    sample: '{"usuario":{"id":7,"nombre":"Ana","roles":["admin","dev"]},"activo":true,"saldo":null}',
    run: (input) => JSON.stringify(parseJson(input)),
    tip: 'Pulsa sobre una clave para expandir o contraer.',
  },
  {
    id: 'json-diff',
    name: 'JSON Diff',
    desc: 'Compara dos JSON y lista las diferencias por ruta.',
    category: 'JSON y XML',
    icon: '⇄',
    sample: '{"nombre":"Aitor","version":1,"tags":["a","b"]}',
    secondLabel: 'Segundo JSON',
    secondSample: '{"nombre":"Aitor","version":2,"tags":["a"],"nuevo":true}',
    run(input, extra) {
      const out: string[] = [];
      diff(parseJson(input), parseJson(extra), '', out);
      return out.length ? `${out.length} diferencia(s)\n(- solo en el primero · + solo en el segundo · ~ cambia)\n\n${out.join('\n')}` : '✓ Los dos JSON son equivalentes.';
    },
  },
];
export default tools;
