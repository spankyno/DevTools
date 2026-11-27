export type Dialect = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver';
export const DIALECTS = [
  { value: 'postgres', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL / MariaDB' }, { value: 'sqlite', label: 'SQLite' }, { value: 'sqlserver', label: 'SQL Server' },
];

export function quoteIdent(name: string, d: Dialect): string {
  return name.split('.').map((p) => (d === 'mysql' ? '`' + p.replace(/`/g, '``') + '`' : d === 'sqlserver' ? '[' + p.replace(/]/g, ']]') + ']' : '"' + p.replace(/"/g, '""') + '"')).join('.');
}

const isPlainNumber = (s: string) => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s);

/** Convierte un valor de JSON o CSV en un literal SQL seguro. */
export function literal(v: unknown, d: Dialect, emptyNull = true): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return d === 'sqlite' || d === 'sqlserver' ? (v ? '1' : '0') : v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return str(JSON.stringify(v), d);
  const s = String(v);
  if (s === '') return emptyNull ? 'NULL' : "''";
  if (isPlainNumber(s)) return s;
  if (/^(true|false)$/i.test(s)) return literal(s.toLowerCase() === 'true', d);
  return str(s, d);
}
function str(s: string, d: Dialect): string {
  const esc = (d === 'mysql' ? s.replace(/\\/g, '\\\\') : s).replace(/'/g, "''");
  return (d === 'sqlserver' && /[^\x00-\x7f]/.test(s) ? 'N' : '') + `'${esc}'`;
}

export function insertStatements(table: string, cols: string[], rows: unknown[][], d: Dialect, batch: boolean, emptyNull = true): string {
  const head = `INSERT INTO ${quoteIdent(table, d)} (${cols.map((c) => quoteIdent(c, d)).join(', ')}) VALUES`;
  const tuples = rows.map((r) => `(${cols.map((_, i) => literal(r[i], d, emptyNull)).join(', ')})`);
  if (!tuples.length) return '-- (sin filas)';
  if (!batch) return tuples.map((t) => `${head} ${t};`).join('\n');
  return `${head}\n  ${tuples.join(',\n  ')};`;
}
