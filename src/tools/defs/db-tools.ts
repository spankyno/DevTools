import type { ToolDef } from '../types';
import { randomInt } from '../lib/bytes';
import { readTable } from '../lib/csv';
import { DIALECTS, insertStatements, quoteIdent, type Dialect } from '../lib/sql';

const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const tableName = (v: unknown) => { const s = String(v).trim() || 'tabla'; if (!/^[\w$]+(\.[\w$]+)?$/.test(s)) throw new Error('Nombre de tabla no válido: usa letras, números y _ (opcionalmente esquema.tabla).'); return s; };
const dialectOpt = { id: 'dialect', label: 'Dialecto', type: 'select' as const, default: 'postgres', choices: DIALECTS };
const tableOpt = { id: 'table', label: 'Tabla', type: 'text' as const, default: 'usuarios' };

function minifySql(src: string): string {
  let out = '', i = 0, space = false;
  const n = src.length;
  const emit = (tok: string) => {
    if (space && out) { const p = out.slice(-1), c = tok[0]; if (!',(;'.includes(p) && !',);'.includes(c)) out += ' '; }
    space = false; out += tok;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '-' && d === '-') { while (i < n && src[i] !== '\n') i++; space = true; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; space = true; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; } j++; }
      emit(src.slice(i, j + 1)); i = j + 1; continue;
    }
    if (/\s/.test(c)) { space = true; i++; continue; }
    emit(c); i++;
  }
  return out.trim();
}

// ---------- Inferencia de tipos ----------
type Kind = 'empty' | 'bool' | 'int' | 'bigint' | 'float' | 'date' | 'ts' | 'json' | 'text';
function kindOf(v: unknown): Kind {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? (Math.abs(v) > 2147483647 ? 'bigint' : 'int') : 'float';
  if (typeof v === 'object') return 'json';
  const s = String(v);
  if (/^(true|false)$/i.test(s)) return 'bool';
  if (/^-?(0|[1-9]\d*)$/.test(s)) return s.replace('-', '').length > 18 ? 'text' : Math.abs(Number(s)) > 2147483647 ? 'bigint' : 'int';
  if (/^-?(0|[1-9]\d*)\.\d+$/.test(s)) return 'float';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return 'ts';
  return 'text';
}
function merge(kinds: Set<Kind>): Kind {
  const k = [...kinds].filter((x) => x !== 'empty');
  if (!k.length) return 'text';
  if (k.length === 1) return k[0];
  const only = (allowed: Kind[]) => k.every((x) => allowed.includes(x));
  if (only(['int', 'bigint'])) return 'bigint';
  if (only(['int', 'bigint', 'float'])) return 'float';
  if (only(['date', 'ts'])) return 'ts';
  return 'text';
}
const TYPE_MAP: Record<Dialect, Record<string, string>> = {
  postgres: { bool: 'BOOLEAN', int: 'INTEGER', bigint: 'BIGINT', float: 'DOUBLE PRECISION', date: 'DATE', ts: 'TIMESTAMP', json: 'JSONB', text: 'TEXT' },
  mysql: { bool: 'BOOLEAN', int: 'INT', bigint: 'BIGINT', float: 'DOUBLE', date: 'DATE', ts: 'DATETIME', json: 'JSON', text: 'TEXT' },
  sqlite: { bool: 'INTEGER', int: 'INTEGER', bigint: 'INTEGER', float: 'REAL', date: 'TEXT', ts: 'TEXT', json: 'TEXT', text: 'TEXT' },
  sqlserver: { bool: 'BIT', int: 'INT', bigint: 'BIGINT', float: 'FLOAT', date: 'DATE', ts: 'DATETIME2', json: 'NVARCHAR(MAX)', text: 'NVARCHAR(MAX)' },
};
function sqlType(kind: Kind, maxLen: number, d: Dialect): string {
  if (kind === 'text' && d !== 'sqlite' && maxLen <= 255) {
    const n = maxLen <= 50 ? 50 : maxLen <= 100 ? 100 : 255;
    return d === 'sqlserver' ? `NVARCHAR(${n})` : `VARCHAR(${n})`;
  }
  return TYPE_MAP[d][kind];
}

// ---------- Datos de prueba ----------
const NOMBRES = ['Lucía', 'Mateo', 'Sofía', 'Daniel', 'Valeria', 'Hugo', 'Carla', 'Álvaro', 'Noa', 'Pablo', 'Elena', 'Iker'];
const APELLIDOS = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno'];
const CIUDADES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Zaragoza', 'Málaga', 'Vigo'];
const PAISES = ['España', 'México', 'Argentina', 'Chile', 'Colombia', 'Perú', 'Uruguay'];
const PALABRAS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed eiusmod tempor labore magna aliqua'.split(' ');
const pick = <T,>(a: T[]) => a[randomInt(a.length)];
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const pad2 = (n: number) => String(n).padStart(2, '0');
function randDate(withTime: boolean): string {
  const d = new Date(Date.now() - randomInt(5 * 365 * 86400) * 1000);
  const ymd = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return withTime ? `${ymd} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}` : ymd;
}
type Ctx = { name: string; surname: string };
function generator(type: string, args: string, rowIdx: number, ctx: Ctx): unknown {
  const range = (dMin: number, dMax: number): [number, number] => { const m = /^\s*(-?\d+(?:\.\d+)?)\s*[-–,]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(args); return m ? [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])] : [dMin, dMax]; };
  switch (type) {
    case 'id': return rowIdx + 1;
    case 'int': { const [a, b] = range(1, 1000); return Math.ceil(a) + randomInt(Math.floor(b) - Math.ceil(a) + 1); }
    case 'float': { const [a, b] = range(0, 1000); return Number((a + (randomInt(1e6) / 1e6) * (b - a)).toFixed(2)); }
    case 'name': return ctx.name;
    case 'surname': return ctx.surname;
    case 'email': return `${plain(ctx.name)}.${plain(ctx.surname)}${rowIdx + 1}@example.test`;
    case 'phone': return `+34 6${String(randomInt(1e8)).padStart(8, '0').replace(/(\d{2})(\d{3})(\d{3})/, '$1 $2 $3')}`;
    case 'bool': return randomInt(2) === 1;
    case 'date': return randDate(false);
    case 'datetime': return randDate(true);
    case 'uuid': return crypto.randomUUID();
    case 'city': return pick(CIUDADES);
    case 'country': return pick(PAISES);
    case 'text': { const n = Math.max(1, Math.min(60, Math.floor(Number(args)) || 5)); return Array.from({ length: n }, () => pick(PALABRAS)).join(' '); }
    case 'pick': { const o = args.split('|').map((x) => x.trim()).filter(Boolean); if (!o.length) throw new Error('pick necesita opciones: pick(a|b|c)'); return pick(o); }
    default: throw new Error(`Tipo desconocido «${type}». Tipos: id, int, float, name, surname, email, phone, bool, date, datetime, uuid, city, country, text, pick.`);
  }
}

// ---------- Conexiones ----------
const PORTS: Record<string, number> = { 'postgres-uri': 5432, 'mysql-uri': 3306, 'sqlserver-ado': 1433, mongodb: 27017, redis: 6379, 'jdbc-postgres': 5432, 'jdbc-mysql': 3306 };

const tools: ToolDef[] = [
  {
    id: 'sql-minify', name: 'SQL Minifier', desc: 'Minifica SQL: quita comentarios y espacios sin tocar los textos entre comillas.', category: 'Bases de datos', icon: '⇲',
    sample: "-- usuarios activos\nSELECT  id,  name\nFROM   users\nWHERE  name = 'Ana  López'   /* comentario */\n  AND  active = 1\nORDER  BY id;",
    run: (input) => minifySql(input),
  },
  {
    id: 'insert-gen', name: 'INSERT Generator', desc: 'Convierte JSON o CSV en sentencias INSERT para tu base de datos.', category: 'Bases de datos', icon: '⤓',
    sample: 'id,nombre,edad,activo,nota\n1,Ana,28,true,"Dijo ""hola"""\n2,Luis O\'Neil,34,false,', inputLabel: 'Datos: array JSON de objetos o CSV con cabecera',
    options: [tableOpt, dialectOpt, { id: 'batch', label: 'Un solo INSERT', type: 'checkbox', default: true }, { id: 'emptyNull', label: 'Vacío → NULL', type: 'checkbox', default: true }],
    tip: 'Los números y booleanos se escriben sin comillas; los textos se escapan. Revisa siempre el resultado antes de ejecutarlo.',
    run(input, _e, o) {
      const { cols, rows } = readTable(input);
      return insertStatements(tableName(o.table), cols, rows.map((r) => cols.map((c) => r[c])), o.dialect as Dialect, Boolean(o.batch), Boolean(o.emptyNull));
    },
  },
  {
    id: 'create-table', name: 'CREATE TABLE Generator', desc: 'Deduce el esquema de una tabla a partir de JSON o CSV de ejemplo.', category: 'Bases de datos', icon: '▤',
    sample: '[\n  {"id": 1, "nombre": "Ana", "edad": 28, "saldo": 10.5, "activo": true, "alta": "2026-01-15"},\n  {"id": 2, "nombre": "Luis", "edad": 34, "saldo": 3, "activo": false, "alta": "2026-02-03"}\n]',
    inputLabel: 'Datos de ejemplo: array JSON de objetos o CSV con cabecera', options: [tableOpt, dialectOpt],
    tip: 'Los tipos se deducen de los valores de ejemplo: revísalos y ajusta longitudes, claves e índices antes de usarlo.',
    run(input, _e, o) {
      const { cols, rows } = readTable(input), d = o.dialect as Dialect;
      if (!cols.length) throw new Error('No se detectaron columnas.');
      const defs = cols.map((c) => {
        const vals = rows.map((r) => r[c]);
        const kinds = new Set(vals.map(kindOf));
        const kind = merge(kinds);
        const maxLen = Math.max(1, ...vals.map((v) => String(v ?? '').length));
        const notNull = rows.length > 0 && !kinds.has('empty');
        const isPk = /^id$/i.test(c) && (kind === 'int' || kind === 'bigint') && notNull && new Set(vals.map(String)).size === vals.length;
        return `  ${quoteIdent(c, d)} ${sqlType(kind, maxLen, d)}${notNull ? ' NOT NULL' : ''}${isPk ? ' PRIMARY KEY' : ''}`;
      });
      return `CREATE TABLE ${quoteIdent(tableName(o.table), d)} (\n${defs.join(',\n')}\n);`;
    },
  },
  {
    id: 'sql-data-gen', name: 'SQL Test Data Generator', desc: 'Genera filas de prueba con tipos realistas y las exporta como INSERT.', category: 'Bases de datos', icon: '✦',
    sample: 'id:id\nnombre:name\napellido:surname\nemail:email\nedad:int(18-65)\nciudad:city\nsaldo:float(0-5000)\nalta:date\nactivo:bool\nestado:pick(nuevo|activo|baja)', inputLabel: 'Columnas (nombre:tipo, una por línea)',
    options: [tableOpt, dialectOpt, { id: 'rows', label: 'Filas', type: 'number', default: 10, min: 1, max: 1000 }, { id: 'batch', label: 'Un solo INSERT', type: 'checkbox', default: true }],
    tip: 'Tipos: id, int(a-b), float(a-b), name, surname, email, phone, bool, date, datetime, uuid, city, country, text(n), pick(a|b|c). Datos ficticios; correos en el dominio reservado example.test.',
    run(input, _e, o) {
      const specs = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = /^([^:]+):\s*([a-z]+)(?:\((.*)\))?$/i.exec(l);
        if (!m) throw new Error(`Línea no válida: «${l}». Formato: nombre:tipo, p. ej. edad:int(18-65).`);
        return { col: m[1].trim(), type: m[2].toLowerCase(), args: m[3] ?? '' };
      });
      if (!specs.length) throw new Error('Define al menos una columna.');
      const n = clampInt(o.rows, 1, 1000, 10);
      const rows = Array.from({ length: n }, (_, i) => { const ctx = { name: pick(NOMBRES), surname: pick(APELLIDOS) }; return specs.map((s) => generator(s.type, s.args, i, ctx)); });
      return insertStatements(tableName(o.table), specs.map((s) => s.col), rows, o.dialect as Dialect, Boolean(o.batch), false);
    },
  },
  {
    id: 'conn-string', name: 'Connection String Builder', desc: 'Construye cadenas de conexión para PostgreSQL, MySQL, SQL Server, MongoDB, Redis y SQLite.', category: 'Bases de datos', icon: '⛁', sample: '', noInput: true,
    options: [
      { id: 'engine', label: 'Motor', type: 'select', default: 'postgres-uri', choices: [
        { value: 'postgres-uri', label: 'PostgreSQL (URI)' }, { value: 'mysql-uri', label: 'MySQL / MariaDB (URI)' }, { value: 'sqlserver-ado', label: 'SQL Server (ADO.NET)' }, { value: 'mongodb', label: 'MongoDB' },
        { value: 'redis', label: 'Redis' }, { value: 'sqlite', label: 'SQLite' }, { value: 'jdbc-postgres', label: 'JDBC PostgreSQL' }, { value: 'jdbc-mysql', label: 'JDBC MySQL' } ] },
      { id: 'host', label: 'Servidor', type: 'text', default: 'localhost' }, { id: 'port', label: 'Puerto (vacío = por defecto)', type: 'text', default: '' },
      { id: 'db', label: 'Base de datos', type: 'text', default: 'mi_base' }, { id: 'user', label: 'Usuario', type: 'text', default: 'usuario' }, { id: 'pass', label: 'Contraseña', type: 'text', default: 'p@ss:w/rd#1' },
      { id: 'ssl', label: 'Conexión cifrada (TLS)', type: 'checkbox', default: true },
    ],
    hint: 'Usa datos de ejemplo. En tus proyectos guarda las credenciales en variables de entorno y nunca en el repositorio.',
    run(_i, _e, o) {
      const eng = String(o.engine), host = String(o.host).trim() || 'localhost';
      const port = String(o.port).trim() || String(PORTS[eng] ?? '');
      if (port && !/^\d{1,5}$/.test(port)) throw new Error('Puerto no válido.');
      const db = String(o.db).trim(), user = String(o.user), pass = String(o.pass), ssl = Boolean(o.ssl);
      const eu = encodeURIComponent, auth = user || pass ? `${eu(user)}${pass ? ':' + eu(pass) : ''}@` : '';
      const ado = (v: string) => (/[;'"=]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      let url: string, note = '';
      switch (eng) {
        case 'postgres-uri': url = `postgresql://${auth}${host}${port ? ':' + port : ''}/${eu(db)}${ssl ? '?sslmode=require' : ''}`; break;
        case 'mysql-uri': url = `mysql://${auth}${host}${port ? ':' + port : ''}/${eu(db)}${ssl ? '?ssl=true' : ''}`; break;
        case 'sqlserver-ado': url = `Server=${host}${port ? ',' + port : ''};Database=${ado(db)};User Id=${ado(user)};Password=${ado(pass)};Encrypt=${ssl ? 'True' : 'False'};TrustServerCertificate=False;`; break;
        case 'mongodb': url = `mongodb://${auth}${host}${port ? ':' + port : ''}/${eu(db)}${ssl ? '?tls=true' : ''}`; break;
        case 'redis': url = `${ssl ? 'rediss' : 'redis'}://${user || pass ? `${user ? eu(user) : ''}:${eu(pass)}@` : ''}${host}${port ? ':' + port : ''}/${/^\d+$/.test(db) ? db : '0'}`; note = 'En Redis la «base de datos» es un número (0–15); se usa 0 si el campo no es numérico.'; break;
        case 'sqlite': url = `sqlite:///${db || 'datos.db'}`; note = 'SQLite no usa servidor ni credenciales: en .NET sería «Data Source=' + (db || 'datos.db') + ';».'; break;
        case 'jdbc-postgres': url = `jdbc:postgresql://${host}${port ? ':' + port : ''}/${eu(db)}?user=${eu(user)}&password=${eu(pass)}${ssl ? '&ssl=true' : ''}`; break;
        default: url = `jdbc:mysql://${host}${port ? ':' + port : ''}/${eu(db)}?user=${eu(user)}&password=${eu(pass)}${ssl ? '&useSSL=true' : '&useSSL=false'}`;
      }
      return [url, '', `Variable de entorno:\nDATABASE_URL=${/[\s;"]/.test(url) ? `'${url}'` : url}`, ...(note ? ['', note] : []), '', 'Los caracteres especiales de usuario y contraseña se codifican en las URIs (p. ej. «@», «:», «/», «#»).'].join('\n');
    },
  },
];
export default tools;
