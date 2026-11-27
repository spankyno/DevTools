const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', deg: '°', plusmn: '±', times: '×', divide: '÷', middot: '·', bull: '•', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ograve: 'ò', auml: 'ä', ouml: 'ö',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', ne: '≠', le: '≤', ge: '≥', infin: '∞',
};
const REVERSE = new Map(Object.entries(NAMED).filter(([k]) => k !== 'apos').map(([k, v]) => [v, k]));

export const escapeHtml = (s: string, xml = false) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, xml ? '&apos;' : '&#39;');

export function encodeEntities(s: string, mode: 'basic' | 'numeric' | 'named'): string {
  if (mode === 'basic') return escapeHtml(s);
  return [...escapeHtml(s)].map((ch) => {
    const cp = ch.codePointAt(0)!;
    if (cp < 128) return ch;
    if (mode === 'named' && REVERSE.has(ch)) return `&${REVERSE.get(ch)};`;
    return `&#${cp};`;
  }).join('');
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
    }
    return NAMED[body] ?? m;
  });
}
