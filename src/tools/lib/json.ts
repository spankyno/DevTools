export type JsonError = { pos: number; line: number; col: number; msg: string };

/** Validador sintáctico propio: da la misma línea/columna en todos los navegadores. */
export function checkJson(src: string): JsonError | null {
  let i = 0;
  const n = src.length;
  const ws = () => { while (i < n && ' \t\n\r'.includes(src[i])) i++; };
  const fail = (msg: string): never => { throw { pos: i, msg }; };

  function str() {
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '"') { i++; return; }
      if (c === '\\') {
        const e = src[i + 1];
        if (e !== undefined && '"\\/bfnrt'.includes(e)) i += 2;
        else if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) { i += 1; fail('Secuencia \\u no válida'); }
          i += 6;
        } else { i += 1; fail('Secuencia de escape no válida'); }
      } else if (c < ' ') fail('Carácter de control sin escapar dentro de una cadena');
      else i++;
    }
    fail('Cadena sin cerrar');
  }
  function num() {
    const re = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) fail('Número no válido');
    i += m![0].length;
  }
  function value() {
    ws();
    if (i >= n) fail('Se esperaba un valor, pero el texto termina aquí');
    const c = src[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"') return str();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    for (const lit of ['true', 'false', 'null']) if (src.startsWith(lit, i)) { i += lit.length; return; }
    fail(`Carácter inesperado «${c}»`);
  }
  function obj() {
    i++; ws();
    if (src[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (src[i] !== '"') fail('Se esperaba una clave entre comillas dobles');
      str(); ws();
      if (src[i] !== ':') fail('Se esperaba «:» después de la clave');
      i++; value(); ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === '}') { i++; return; }
      fail('Se esperaba «,» o «}»');
    }
  }
  function arr() {
    i++; ws();
    if (src[i] === ']') { i++; return; }
    for (;;) {
      value(); ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; return; }
      fail('Se esperaba «,» o «]»');
    }
  }

  try {
    value(); ws();
    if (i < n) fail('Contenido inesperado después del valor JSON');
    return null;
  } catch (e) {
    const err = e as { pos?: number; msg?: string };
    if (err.pos === undefined) throw e;
    const before = src.slice(0, err.pos);
    const line = before.split('\n').length;
    const col = err.pos - before.lastIndexOf('\n');
    return { pos: err.pos, line, col, msg: err.msg ?? 'JSON no válido' };
  }
}

export function describeJsonError(src: string, e: JsonError): string {
  const text = src.split('\n')[e.line - 1] ?? '';
  const shown = text.length > 100 ? text.slice(Math.max(0, e.col - 40), e.col + 40) : text;
  const caret = ' '.repeat(text.length > 100 ? Math.min(40, e.col - 1) : e.col - 1) + '^';
  return `Línea ${e.line}, columna ${e.col}: ${e.msg}\n\n${shown}\n${caret}`;
}

/** Parsea con mensajes de error claros (línea y columna). */
export function parseJson(src: string): unknown {
  if (!src.trim()) throw new Error('Introduce un JSON.');
  const err = checkJson(src);
  if (err) throw new Error(describeJsonError(src, err));
  return JSON.parse(src);
}
