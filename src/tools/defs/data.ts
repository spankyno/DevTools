import type { ToolDef } from '../types';
import { parseJson } from '../lib/json';
import { csvCell, parseCsv } from '../lib/csv';

const tools: ToolDef[] = [
  {
    id: 'csv',
    name: 'CSV / JSON Converter',
    desc: 'Convierte CSV a JSON y JSON a CSV (con comillas y saltos de línea).',
    category: 'JSON y XML',
    icon: '⇆',
    sample: 'nombre,edad,ciudad\nAna,28,Madrid\nLuis,34,"Sevilla, Andalucía"',
    options: [
      { id: 'delim', label: 'Separador', type: 'select', default: ',', choices: [
        { value: ',', label: 'Coma ( , )' }, { value: ';', label: 'Punto y coma ( ; )' }, { value: '\t', label: 'Tabulador' } ] },
      { id: 'numbers', label: 'Convertir números', type: 'checkbox', default: true },
    ],
    tip: 'Detecta la dirección sola: si empieza por [ o { convierte JSON → CSV.',
    run(input, _e, o) {
      const d = String(o.delim), t = input.trim();
      if (!t) throw new Error('Introduce datos.');
      if (t.startsWith('[') || t.startsWith('{')) {
        const a = parseJson(t);
        const rows = (Array.isArray(a) ? a : [a]) as Record<string, unknown>[];
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))];
        return [keys.map((k) => csvCell(k, d)).join(d), ...rows.map((r) => keys.map((k) => csvCell(r?.[k], d)).join(d))].join('\n');
      }
      const [head, ...lines] = parseCsv(t, d);
      return JSON.stringify(lines.map((l) => Object.fromEntries(head.map((k, i) => {
        const v = l[i] ?? '';
        return [k, o.numbers && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v];
      }))), null, 2);
    },
  },
  {
    id: 'xml',
    browserOnly: true,
    name: 'XML / JSON Converter',
    desc: 'Convierte XML a JSON (atributos y etiquetas repetidas).',
    category: 'JSON y XML',
    icon: '<>',
    sample: '<persona id="7"><nombre>Ana</nombre><edad>28</edad><tel>111</tel><tel>222</tel></persona>',
    tip: 'Los atributos se guardan con el prefijo @ y las etiquetas repetidas pasan a ser arrays.',
    run(input) {
      const d = new DOMParser().parseFromString(input, 'application/xml');
      if (d.querySelector('parsererror')) throw new Error('XML no válido.');
      const walk = (e: Element): unknown => {
        const obj: Record<string, unknown> = {};
        for (const a of Array.from(e.attributes)) obj['@' + a.name] = a.value;
        const kids = Array.from(e.children);
        if (!kids.length) {
          const text = e.textContent?.trim() ?? '';
          return Object.keys(obj).length ? (text ? { ...obj, '#text': text } : obj) : text;
        }
        for (const k of kids) {
          const v = walk(k);
          if (k.tagName in obj) obj[k.tagName] = Array.isArray(obj[k.tagName]) ? [...(obj[k.tagName] as unknown[]), v] : [obj[k.tagName], v];
          else obj[k.tagName] = v;
        }
        return obj;
      };
      return JSON.stringify({ [d.documentElement.tagName]: walk(d.documentElement) }, null, 2);
    },
  },
  {
    id: 'sql',
    name: 'SQL Formatter',
    desc: 'Formatea consultas SQL con el dialecto que elijas.',
    category: 'Bases de datos',
    icon: '▤',
    sample: 'select id, name from users where active = true order by id desc;',
    options: [
      { id: 'dialect', label: 'Dialecto', type: 'select', default: 'sql', choices: [
        { value: 'sql', label: 'SQL estándar' }, { value: 'postgresql', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL' },
        { value: 'sqlite', label: 'SQLite' }, { value: 'transactsql', label: 'SQL Server' } ] },
      { id: 'upper', label: 'Palabras clave en mayúsculas', type: 'checkbox', default: true },
    ],
    async run(input, _e, o) {
      const { format } = await import('sql-formatter'); // carga diferida: solo al ejecutar
      return format(input, { language: o.dialect as 'sql', keywordCase: o.upper ? 'upper' : 'preserve' });
    },
  },
  {
    id: 'sql-play',
    name: 'SQL Playground',
    desc: 'Consola SQL demostrativa (aún no ejecuta SQL real).',
    category: 'Bases de datos',
    icon: '⌘',
    sample: 'SELECT * FROM users;',
    tip: 'Esta consola es demostrativa y no ejecuta SQL.',
    run: (input) => 'Demo: no ejecuta SQL ni se conecta a una base de datos.\nConsulta recibida:\n' + input,
  },
];
export default tools;
