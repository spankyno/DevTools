import type { ToolDef } from '../types';
import { randomInt } from '../lib/bytes';

function uuid7(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) { b[i] = ms % 256; ms = Math.floor(ms / 256); }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const clamp = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

const NOMBRES = ['Alex', 'Sam', 'Lucía', 'Daniel', 'Noa', 'Mario', 'Carla', 'Hugo', 'Elena', 'Pablo'];

const tools: ToolDef[] = [
  {
    id: 'uuid',
    name: 'UUID Generator',
    desc: 'Genera UUID v4 (aleatorio) y v7 (ordenable por fecha).',
    category: 'Generadores',
    icon: '✳',
    sample: '',
    noInput: true,
    options: [
      { id: 'version', label: 'Versión', type: 'select', default: 'v4', choices: [{ value: 'v4', label: 'v4 (aleatorio)' }, { value: 'v7', label: 'v7 (con marca de tiempo)' }] },
      { id: 'count', label: 'Cantidad', type: 'number', default: 5, min: 1, max: 1000 },
      { id: 'upper', label: 'Mayúsculas', type: 'checkbox', default: false },
      { id: 'nodash', label: 'Sin guiones', type: 'checkbox', default: false },
    ],
    tip: 'Los UUID v7 empiezan por la hora actual en milisegundos, así que se ordenan cronológicamente.',
    run(_i, _e, o) {
      const n = clamp(o.count, 1, 1000, 5);
      const list = Array.from({ length: n }, () => (o.version === 'v7' ? uuid7() : crypto.randomUUID()));
      return list.map((u) => (o.nodash ? u.replace(/-/g, '') : u)).map((u) => (o.upper ? u.toUpperCase() : u)).join('\n');
    },
  },
  {
    id: 'password',
    name: 'Password Generator',
    desc: 'Contraseñas aleatorias seguras y configurables.',
    category: 'Generadores',
    icon: '•••',
    sample: '',
    noInput: true,
    options: [
      { id: 'length', label: 'Longitud', type: 'number', default: 20, min: 8, max: 128 },
      { id: 'count', label: 'Cantidad', type: 'number', default: 3, min: 1, max: 50 },
      { id: 'upper', label: 'Mayúsculas', type: 'checkbox', default: true },
      { id: 'digits', label: 'Números', type: 'checkbox', default: true },
      { id: 'symbols', label: 'Símbolos', type: 'checkbox', default: true },
      { id: 'ambiguous', label: 'Evitar caracteres ambiguos (0 O l 1 I)', type: 'checkbox', default: true },
    ],
    hint: 'Se generan con crypto.getRandomValues en tu navegador y no se guardan en ningún sitio.',
    run(_i, _e, o) {
      const amb = (s: string) => (o.ambiguous ? s.replace(/[0O1lI]/g, '') : s);
      const sets = [amb('abcdefghijklmnopqrstuvwxyz')];
      if (o.upper) sets.push(amb('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
      if (o.digits) sets.push(amb('0123456789'));
      if (o.symbols) sets.push('!@#$%&*_-+=?');
      const pool = sets.join('');
      const len = clamp(o.length, 8, 128, 20);
      return Array.from({ length: clamp(o.count, 1, 50, 3) }, () => {
        const chars = sets.map((s) => s[randomInt(s.length)]); // al menos uno de cada tipo
        while (chars.length < len) chars.push(pool[randomInt(pool.length)]);
        for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
        return chars.join('');
      }).join('\n');
    },
  },
  {
    id: 'fake-data',
    name: 'Fake Data Generator',
    desc: 'Genera datos ficticios en JSON para pruebas.',
    category: 'Generadores',
    icon: '✧',
    sample: '',
    noInput: true,
    options: [{ id: 'count', label: 'Registros', type: 'number', default: 10, min: 1, max: 500 }],
    hint: 'Datos inventados; los correos usan el dominio reservado example.test.',
    run: (_i, _e, o) => JSON.stringify(Array.from({ length: clamp(o.count, 1, 500, 10) }, (_, i) => ({
      id: i + 1,
      nombre: NOMBRES[i % NOMBRES.length],
      email: `usuario${i + 1}@example.test`,
      edad: 18 + randomInt(50),
      activo: i % 3 !== 0,
    })), null, 2),
  },
  {
    id: 'gitignore',
    name: '.gitignore Generator',
    desc: 'Genera reglas .gitignore por tecnología.',
    category: 'Git y desarrollo',
    icon: 'git',
    sample: '',
    noInput: true,
    options: [{ id: 'tech', label: 'Tecnología', type: 'select', default: 'Node', choices: ['Node', 'React', 'Python', 'Java', 'Visual Studio Code'].map((v) => ({ value: v, label: v })) }],
    run: (_i, _e, o) => ({
      Node: 'node_modules/\ndist/\n.env\n*.log',
      React: 'node_modules/\ndist/\n.env\n.vite/',
      Python: '__pycache__/\n*.py[cod]\n.venv/\n.env',
      Java: '*.class\ntarget/\n.idea/',
      'Visual Studio Code': '.vscode/\n!.vscode/extensions.json',
    } as Record<string, string>)[String(o.tech)] ?? 'node_modules/\ndist/\n.env\n.DS_Store\n*.log',
  },
];
export default tools;
