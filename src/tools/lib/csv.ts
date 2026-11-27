export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (q) throw new Error('CSV no válido: comillas sin cerrar.');
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

export const csvCell = (v: unknown, d: string) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /["\n\r]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Lee filas de JSON (array de objetos) o CSV (con cabecera) y devuelve {cols, rows}. */
export function readTable(text: string, delim = ','): { cols: string[]; rows: Record<string, unknown>[] } {
  const t = text.trim();
  if (!t) throw new Error('Introduce datos en JSON (array de objetos) o CSV con cabecera.');
  if (t.startsWith('[') || t.startsWith('{')) {
    let v: unknown;
    try { v = JSON.parse(t); } catch { throw new Error('JSON no válido.'); }
    const rows = (Array.isArray(v) ? v : [v]) as Record<string, unknown>[];
    if (rows.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) throw new Error('El JSON debe ser un objeto o un array de objetos.');
    return { cols: [...new Set(rows.flatMap((r) => Object.keys(r)))], rows };
  }
  const [head, ...lines] = parseCsv(t, delim);
  return { cols: head, rows: lines.map((l) => Object.fromEntries(head.map((k, i) => [k, l[i] ?? '']))) };
}
