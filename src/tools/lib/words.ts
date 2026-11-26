/** Divide texto en palabras reconociendo camelCase, PascalCase, snake_case, kebab-case y espacios. */
export function splitWords(s: string): string[] {
  return s
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export const CASES: { id: string; label: string; fn: (line: string) => string }[] = [
  { id: 'upper', label: 'UPPERCASE', fn: (l) => l.toUpperCase() },
  { id: 'lower', label: 'lowercase', fn: (l) => l.toLowerCase() },
  { id: 'title', label: 'Title Case', fn: (l) => l.toLowerCase().replace(/(^|[\s\-_/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) },
  { id: 'sentence', label: 'Sentence case', fn: (l) => { const t = l.toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); } },
  { id: 'camel', label: 'camelCase', fn: (l) => splitWords(l).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('') },
  { id: 'pascal', label: 'PascalCase', fn: (l) => splitWords(l).map(cap).join('') },
  { id: 'snake', label: 'snake_case', fn: (l) => splitWords(l).map((w) => w.toLowerCase()).join('_') },
  { id: 'constant', label: 'CONSTANT_CASE', fn: (l) => splitWords(l).map((w) => w.toUpperCase()).join('_') },
  { id: 'kebab', label: 'kebab-case', fn: (l) => splitWords(l).map((w) => w.toLowerCase()).join('-') },
  { id: 'dot', label: 'dot.case', fn: (l) => splitWords(l).map((w) => w.toLowerCase()).join('.') },
];
