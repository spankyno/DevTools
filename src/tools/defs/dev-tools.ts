import type { ToolDef } from '../types';
import { GIT_CMDS } from '../lib/refdata';

const lines = (s: string) => s.split(/\r?\n/);
const q = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
const today = () => new Date().toISOString().slice(0, 10);

// ---------- SemVer ----------
const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
type SV = { major: number; minor: number; patch: number; pre: string[]; build: string };
function parseSv(s: string): SV {
  const m = SEMVER.exec(s.trim());
  if (!m) throw new Error(`«${s.trim()}» no es una versión SemVer válida (MAYOR.MENOR.PARCHE[-pre][+build]).`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [], build: m[5] ?? '' };
}
const fmtSv = (v: SV) => `${v.major}.${v.minor}.${v.patch}${v.pre.length ? '-' + v.pre.join('.') : ''}`;
function cmpSv(a: SV, b: SV): number {
  for (const k of ['major', 'minor', 'patch'] as const) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
function bump(v: SV, kind: string, id: string): SV {
  const n: SV = { ...v, pre: [], build: '' };
  const pre = (base: SV) => ({ ...base, pre: [id, '0'] });
  switch (kind) {
    case 'major': return v.pre.length && !v.minor && !v.patch ? n : { ...n, major: v.major + 1, minor: 0, patch: 0 };
    case 'minor': return v.pre.length && !v.patch ? n : { ...n, minor: v.minor + 1, patch: 0 };
    case 'patch': return v.pre.length ? n : { ...n, patch: v.patch + 1 };
    case 'premajor': return pre({ ...n, major: v.major + 1, minor: 0, patch: 0 });
    case 'preminor': return pre({ ...n, minor: v.minor + 1, patch: 0 });
    case 'prepatch': return pre({ ...n, patch: v.patch + 1 });
    default: { // prerelease
      if (!v.pre.length) return pre({ ...n, patch: v.patch + 1 });
      const p = [...v.pre], last = p.length - 1;
      if (/^\d+$/.test(p[last])) p[last] = String(Number(p[last]) + 1); else p.push('0');
      return { ...n, pre: p };
    }
  }
}

// ---------- Licencias ----------
const LICENSES: Record<string, { name: string; kind: string; goal: string; summary: string; patents: string; cond: string }> = {
  MIT: { name: 'MIT', kind: 'Permisiva', goal: 'permisiva', summary: 'Muy corta y simple. Permite casi todo con tal de conservar el aviso.', patents: 'No explícita', cond: 'Incluir aviso de copyright y licencia' },
  'Apache-2.0': { name: 'Apache 2.0', kind: 'Permisiva', goal: 'patentes', summary: 'Permisiva con concesión expresa de patentes y cláusula de marca.', patents: 'Sí, explícita', cond: 'Aviso de licencia y copyright, indicar cambios' },
  'BSD-3-Clause': { name: 'BSD 3-Clause', kind: 'Permisiva', goal: 'permisiva', summary: 'Como MIT, y prohíbe usar el nombre del autor para promocionar derivados.', patents: 'No explícita', cond: 'Aviso de licencia; sin endosos con el nombre del autor' },
  ISC: { name: 'ISC', kind: 'Permisiva', goal: 'permisiva', summary: 'Funcionalmente equivalente a MIT, con redacción más corta.', patents: 'No explícita', cond: 'Incluir aviso de copyright y licencia' },
  'MPL-2.0': { name: 'MPL 2.0', kind: 'Copyleft débil (por archivo)', goal: 'copyleft débil', summary: 'Los archivos modificados deben seguir siendo MPL, pero se pueden combinar con código propietario.', patents: 'Sí, explícita', cond: 'Publicar el código fuente de los archivos MPL modificados' },
  'LGPL-3.0': { name: 'LGPL 3.0', kind: 'Copyleft débil (bibliotecas)', goal: 'copyleft débil', summary: 'Pensada para bibliotecas: se puede enlazar desde software no libre, pero las modificaciones de la biblioteca deben publicarse.', patents: 'Sí, explícita', cond: 'Publicar modificaciones de la biblioteca; permitir sustituirla' },
  'GPL-3.0': { name: 'GPL 3.0', kind: 'Copyleft fuerte', goal: 'copyleft', summary: 'Cualquier obra derivada distribuida debe publicarse con la misma licencia.', patents: 'Sí, explícita', cond: 'Publicar el código fuente, misma licencia, indicar cambios' },
  'AGPL-3.0': { name: 'AGPL 3.0', kind: 'Copyleft fuerte + red', goal: 'red', summary: 'Como la GPL, pero ofrecer el software por red también obliga a publicar el código.', patents: 'Sí, explícita', cond: 'Publicar el código, incluso si solo se usa como servicio en red' },
  Unlicense: { name: 'The Unlicense', kind: 'Dominio público', goal: 'dominio público', summary: 'Dedica la obra al dominio público sin condiciones.', patents: 'No explícita', cond: 'Ninguna' },
  'CC0-1.0': { name: 'CC0 1.0', kind: 'Dominio público', goal: 'dominio público', summary: 'Renuncia a los derechos de autor en la mayor medida legal. Excluye expresamente las patentes, por lo que no es la mejor opción para código.', patents: 'Excluidas expresamente', cond: 'Ninguna' },
};
const MIT_TEXT = (year: string, holder: string) => `MIT License

Copyright (c) ${year} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

// ---------- Git builder ----------
type GitOut = { cmd: string; why: string; warn?: string };
const need = (v: string, what: string) => { if (!v.trim()) throw new Error(`Falta ${what} (primer campo).`); return v.trim(); };
const GIT: Record<string, (a: string, b: string, v: string) => GitOut> = {
  commit: (a, _b, v) => v === 'amend'
    ? { cmd: a.trim() ? `git commit --amend -m ${q(a.trim())}` : 'git commit --amend --no-edit', why: 'Modifica el último commit.', warn: 'Reescribe el historial: no lo hagas si el commit ya está publicado.' }
    : { cmd: `git commit -m ${q(need(a, 'el mensaje'))}`, why: 'Crea un commit con lo que hay en el área de preparación.' },
  'branch-new': (a, b) => ({ cmd: `git switch -c ${need(a, 'el nombre de la rama')}${b.trim() ? ' ' + b.trim() : ''}`, why: `Crea la rama y cambia a ella${b.trim() ? ` a partir de ${b.trim()}` : ''}.` }),
  switch: (a) => ({ cmd: `git switch ${need(a, 'la rama')}`, why: 'Cambia de rama.' }),
  'branch-delete': (a, _b, v) => v === 'force'
    ? { cmd: `git branch -D ${need(a, 'la rama')}`, why: 'Borra la rama aunque no esté fusionada.', warn: 'Puedes perder commits que no estén en otra rama (recuperables con git reflog un tiempo).' }
    : { cmd: `git branch -d ${need(a, 'la rama')}`, why: 'Borra la rama solo si ya está fusionada.' },
  merge: (a, _b, v) => ({ cmd: `git merge ${v === 'no-ff' ? '--no-ff ' : ''}${need(a, 'la rama')}`, why: 'Fusiona la rama indicada en la actual' + (v === 'no-ff' ? ', creando siempre un commit de fusión.' : '.') }),
  rebase: (a) => ({ cmd: `git rebase ${need(a, 'la rama base')}`, why: 'Reaplica tus commits sobre la rama indicada.', warn: 'No hagas rebase de ramas que otras personas ya han descargado.' }),
  stash: (a) => ({ cmd: `git stash push${a.trim() ? ' -m ' + q(a.trim()) : ''}`, why: 'Guarda temporalmente los cambios sin preparar.' }),
  reset: (a, _b, v) => {
    const mode = v === 'soft' || v === 'hard' ? v : 'mixed';
    return { cmd: `git reset --${mode} ${a.trim() || 'HEAD~1'}`, why: mode === 'soft' ? 'Mueve la rama conservando los cambios preparados.' : mode === 'mixed' ? 'Mueve la rama y deja los cambios sin preparar.' : 'Mueve la rama y descarta los cambios del árbol de trabajo.', warn: mode === 'hard' ? 'DESTRUCTIVO: se pierden los cambios sin commitear.' : undefined };
  },
  revert: (a) => ({ cmd: `git revert ${need(a, 'el commit')}`, why: 'Crea un commit nuevo que deshace otro. Es seguro en ramas compartidas.' }),
  restore: (a) => ({ cmd: `git restore ${need(a, 'el archivo')}`, why: 'Descarta los cambios locales de un archivo.', warn: 'Los cambios sin commitear de ese archivo se pierden.' }),
  'cherry-pick': (a) => ({ cmd: `git cherry-pick ${need(a, 'el commit')}`, why: 'Aplica un commit concreto sobre la rama actual.' }),
  log: (a) => ({ cmd: `git log --oneline --graph --decorate${/^\d+$/.test(a.trim()) ? ' -n ' + a.trim() : ''}`, why: 'Historial compacto con ramas.' }),
  tag: (a, b) => ({ cmd: `git tag -a ${need(a, 'el nombre de la etiqueta')} -m ${q(b.trim() || a.trim())}`, why: 'Crea una etiqueta anotada. Publícala con git push origin ' + a.trim() + '.' }),
  push: (a, b, v) => {
    const remote = b.trim() || 'origin', br = need(a, 'la rama');
    if (v === 'force') return { cmd: `git push --force ${remote} ${br}`, why: 'Publica sobreescribiendo el remoto.', warn: 'PELIGROSO: puede borrar el trabajo de otras personas. Prefiere --force-with-lease.' };
    if (v === 'force-with-lease') return { cmd: `git push --force-with-lease ${remote} ${br}`, why: 'Publica sobreescribiendo solo si nadie más ha subido cambios desde tu última descarga.' };
    return { cmd: `git push -u ${remote} ${br}`, why: 'Publica la rama y la enlaza con el remoto.' };
  },
  pull: (a, b, v) => ({ cmd: `git pull ${v === 'rebase' ? '--rebase ' : ''}${b.trim() || 'origin'} ${need(a, 'la rama')}`, why: 'Descarga cambios y los integra' + (v === 'rebase' ? ' reaplicando tus commits encima.' : ' con una fusión.') }),
  clone: (a, b) => ({ cmd: `git clone ${need(a, 'la URL')}${b.trim() ? ' ' + b.trim() : ''}`, why: 'Clona un repositorio remoto.' }),
  'remote-add': (a, b) => ({ cmd: `git remote add ${b.trim() || 'origin'} ${need(a, 'la URL')}`, why: 'Añade un repositorio remoto.' }),
};

// ---------- Commits ----------
const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

const tools: ToolDef[] = [
  {
    id: 'git-cheatsheet', name: 'Git Cheat Sheet', desc: 'Chuleta de comandos Git con buscador.', category: 'Git y desarrollo', icon: 'git', sample: 'stash',
    tip: 'Filtra por comando o descripción (stash, rama, deshacer…). Vacío = todos.',
    run(input) {
      const f = input.trim().toLowerCase();
      const list = f ? GIT_CMDS.filter(([g, c, d]) => `${g} ${c} ${d}`.toLowerCase().includes(f)) : GIT_CMDS;
      if (!list.length) return 'Sin resultados.';
      const out: string[] = []; let last = '';
      for (const [g, c, d] of list) { if (g !== last) { out.push('', `── ${g} ──`); last = g; } out.push(c, `    ${d}`); }
      return out.join('\n').trim();
    },
  },
  {
    id: 'git-builder', name: 'Git Command Builder', desc: 'Construye comandos Git y explica qué hacen (con avisos de seguridad).', category: 'Git y desarrollo', icon: '$_', sample: 'feature/login',
    inputLabel: 'Argumento principal (rama, mensaje, commit, URL…)', secondLabel: 'Segundo argumento (opcional: remoto, base, carpeta…)', secondSample: '',
    options: [
      { id: 'action', label: 'Acción', type: 'select', default: 'branch-new', choices: Object.keys(GIT).map((k) => ({ value: k, label: k })) },
      { id: 'variant', label: 'Variante', type: 'select', default: 'default', choices: [
        { value: 'default', label: 'Normal' }, { value: 'amend', label: 'commit: amend' }, { value: 'soft', label: 'reset: soft' }, { value: 'mixed', label: 'reset: mixed' }, { value: 'hard', label: 'reset: hard' },
        { value: 'force-with-lease', label: 'push: force-with-lease' }, { value: 'force', label: 'push / branch-delete: force' }, { value: 'no-ff', label: 'merge: --no-ff' }, { value: 'rebase', label: 'pull: --rebase' } ] },
    ],
    run(input, extra, o) {
      const r = GIT[String(o.action)](input, extra, String(o.variant));
      return [r.cmd, '', r.why, ...(r.warn ? ['', '⚠ ' + r.warn] : [])].join('\n');
    },
  },
  {
    id: 'commit-builder', name: 'Commit Message Builder', desc: 'Mensajes de commit con Conventional Commits y comprobaciones.', category: 'Git y desarrollo', icon: 'feat',
    sample: 'añadir inicio de sesión con Google', inputLabel: 'Descripción (corta, en minúscula y sin punto final)', secondLabel: 'Cuerpo (opcional)', secondSample: 'Usa OAuth 2.0 con PKCE.\nSe guarda el token solo en memoria.',
    options: [
      { id: 'type', label: 'Tipo', type: 'select', default: 'feat', choices: TYPES.map((t) => ({ value: t, label: t })) },
      { id: 'scope', label: 'Ámbito', type: 'text', default: 'auth' }, { id: 'breaking', label: 'Cambio incompatible (!)', type: 'checkbox', default: false },
      { id: 'refs', label: 'Referencias', type: 'text', default: 'Closes #12' },
    ],
    run(input, extra, o) {
      const desc = input.trim();
      if (!desc) throw new Error('Escribe la descripción.');
      const scope = String(o.scope).trim().replace(/[()\s]/g, '');
      const header = `${o.type}${scope ? `(${scope})` : ''}${o.breaking ? '!' : ''}: ${desc}`;
      const parts = [header, ...(extra.trim() ? [extra.trim()] : []), ...(o.breaking ? [`BREAKING CHANGE: ${desc}`] : []), ...(String(o.refs).trim() ? [String(o.refs).trim()] : [])];
      const warn: string[] = [];
      if (header.length > 72) warn.push(`La primera línea mide ${header.length} caracteres (recomendado ≤ 72).`);
      if (/^[A-ZÁÉÍÓÚÑ]/.test(desc)) warn.push('La descripción debería empezar en minúscula.');
      if (/[.!]$/.test(desc)) warn.push('La descripción no debería terminar en punto.');
      return parts.join('\n\n') + (warn.length ? '\n\n──── avisos (no copiar) ────\n' + warn.map((w) => '⚠ ' + w).join('\n') : '');
    },
  },
  {
    id: 'semver', name: 'Semantic Versioning', desc: 'Valida, incrementa y compara versiones SemVer.', category: 'Git y desarrollo', icon: '1.2.3',
    sample: '1.4.2', inputLabel: 'Versión', secondLabel: 'Comparar con (opcional)', secondSample: '1.10.0',
    options: [
      { id: 'bump', label: 'Incrementar', type: 'select', default: 'minor', choices: ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'].map((v) => ({ value: v, label: v })) },
      { id: 'preid', label: 'Prefijo pre-lanzamiento', type: 'text', default: 'rc' },
    ],
    run(input, extra, o) {
      const v = parseSv(input), id = String(o.preid).trim() || 'rc';
      const out = [`✓ Versión válida: ${fmtSv(v)}${v.build ? '+' + v.build : ''}`, `  mayor ${v.major} · menor ${v.minor} · parche ${v.patch}${v.pre.length ? ` · pre-lanzamiento «${v.pre.join('.')}»` : ''}${v.build ? ` · build «${v.build}»` : ''}`, '', `${String(o.bump)} → ${fmtSv(bump(v, String(o.bump), id))}`];
      if (extra.trim()) { const w = parseSv(extra), c = cmpSv(v, w); out.push('', `${fmtSv(v)} ${c < 0 ? '<' : c > 0 ? '>' : '='} ${fmtSv(w)}  (${c < 0 ? 'la primera es anterior' : c > 0 ? 'la primera es posterior' : 'misma precedencia'})`); }
      return out.join('\n');
    },
  },
  {
    id: 'license', name: 'License Selector', desc: 'Compara licencias de código abierto y genera el texto de la MIT.', category: 'Git y desarrollo', icon: '©',
    sample: 'Tu nombre', inputLabel: 'Titular del copyright (para generar el texto MIT)',
    options: [
      { id: 'goal', label: 'Busco', type: 'select', default: 'all', choices: [
        { value: 'all', label: 'Ver comparativa completa' }, { value: 'permisiva', label: 'Máxima libertad de uso' }, { value: 'patentes', label: 'Permisiva con patentes' }, { value: 'copyleft', label: 'Que los derivados sigan siendo libres' },
        { value: 'copyleft débil', label: 'Biblioteca usable desde software propietario' }, { value: 'red', label: 'Cubrir también servicios en red (SaaS)' }, { value: 'dominio público', label: 'Dominio público' }, { value: 'mit-text', label: 'Generar el texto de la licencia MIT' } ] },
      { id: 'year', label: 'Año', type: 'text', default: String(new Date().getFullYear()) },
    ],
    tip: 'Información orientativa, no asesoramiento legal. Consulta el texto oficial (choosealicense.com, spdx.org) antes de decidir.',
    run(input, _e, o) {
      if (o.goal === 'mit-text') return MIT_TEXT(String(o.year).trim() || String(new Date().getFullYear()), input.trim() || 'Nombre del titular');
      const list = Object.entries(LICENSES).filter(([, l]) => o.goal === 'all' || l.goal === o.goal);
      return list.map(([id, l]) => `${l.name}  (${id})\n  Tipo:         ${l.kind}\n  Patentes:     ${l.patents}\n  Condiciones:  ${l.cond}\n  ${l.summary}`).join('\n\n');
    },
  },
  {
    id: 'readme-gen', name: 'README Generator', desc: 'Genera un README.md a partir de datos básicos.', category: 'Git y desarrollo', icon: 'MD',
    sample: 'nombre: Mi Proyecto\ndescripcion: Una herramienta para hacer cosas útiles.\ncaracteristicas:\n- Rápida y ligera\n- Funciona sin conexión\ninstalacion: npm install\nuso: npm start\nlicencia: MIT\nautor: Tu nombre',
    inputLabel: 'Campos (clave: valor). Claves: nombre, descripcion, caracteristicas, instalacion, uso, licencia, autor',
    run(input) {
      const f: Record<string, string> = {}; let key = '';
      for (const l of lines(input)) {
        const m = /^(nombre|descripcion|descripción|caracteristicas|características|instalacion|instalación|uso|licencia|autor)\s*:\s*(.*)$/i.exec(l);
        if (m) { key = m[1].toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''); f[key] = m[2]; } else if (key) f[key] += '\n' + l;
      }
      if (!f.nombre?.trim()) throw new Error('Falta «nombre: …».');
      const feats = (f.caracteristicas ?? '').split('\n').map((x) => x.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      const sec = (title: string, body?: string) => (body?.trim() ? `\n## ${title}\n\n${body.trim()}\n` : '');
      const code = (c?: string) => (c?.trim() ? '```bash\n' + c.trim() + '\n```' : '');
      return [`# ${f.nombre.trim()}\n`, f.descripcion?.trim() ? `${f.descripcion.trim()}\n` : '', sec('Características', feats.map((x) => `- ${x}`).join('\n')), sec('Instalación', code(f.instalacion)), sec('Uso', code(f.uso)), sec('Licencia', f.licencia ? `Distribuido bajo licencia ${f.licencia.trim()}.` : ''), sec('Autoría', f.autor)].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    },
  },
  {
    id: 'changelog-gen', name: 'Changelog Generator', desc: 'Convierte commits convencionales en un CHANGELOG (Keep a Changelog).', category: 'Git y desarrollo', icon: 'Δ',
    sample: 'feat(auth): añadir inicio de sesión con Google\nfix(api): corregir el límite de paginación\nperf: acelerar la carga inicial\nfeat!: eliminar el soporte de Node 16\ndocs: actualizar el README\nfix(security): validar el token JWT',
    inputLabel: 'Commits (uno por línea)',
    options: [
      { id: 'version', label: 'Versión', type: 'text', default: '1.2.0' }, { id: 'date', label: 'Fecha (vacío = hoy)', type: 'text', default: '' },
      { id: 'other', label: 'Incluir docs/chore/test/ci', type: 'checkbox', default: false },
    ],
    run(input, _e, o) {
      const sec: Record<string, string[]> = { Added: [], Changed: [], Deprecated: [], Removed: [], Fixed: [], Security: [], Otros: [] }, breaking: string[] = [];
      for (const raw of lines(input).map((l) => l.trim()).filter(Boolean)) {
        const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(raw);
        const [type, scope, bang, desc] = m ? [m[1].toLowerCase(), m[2], m[3], m[4]] : ['', '', '', raw];
        const text = (scope ? `**${scope}:** ` : '') + desc;
        if (bang || /BREAKING CHANGE/i.test(raw)) breaking.push(text);
        const target = /security|cve-\d/i.test(raw) ? 'Security' : /deprecat/i.test(raw) ? 'Deprecated' : type === 'feat' ? 'Added' : type === 'fix' ? 'Fixed' : ['perf', 'refactor', 'revert'].includes(type) ? 'Changed' : type === '' ? 'Changed' : ['docs', 'chore', 'test', 'ci', 'build', 'style'].includes(type) ? (o.other ? 'Otros' : '') : 'Changed';
        if (target) sec[target].push(text);
      }
      const out = [`## [${String(o.version).trim() || 'Sin publicar'}] - ${String(o.date).trim() || today()}`];
      if (breaking.length) out.push('', '### ⚠ Cambios incompatibles', ...breaking.map((x) => `- ${x}`));
      for (const [k, v] of Object.entries(sec)) if (v.length) out.push('', `### ${k}`, ...v.map((x) => `- ${x}`));
      return out.length === 1 ? out[0] + '\n\n(No hay cambios que mostrar con estos filtros.)' : out.join('\n');
    },
  },
  {
    id: 'package-inspector', name: 'package.json Inspector', desc: 'Analiza un package.json: scripts, dependencias y problemas habituales.', category: 'Git y desarrollo', icon: '{ }',
    sample: '{\n  "name": "mi-app",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": { "dev": "vite", "build": "tsc -b && vite build" },\n  "dependencies": { "react": "latest", "vite": "^8.3.8", "left-pad": "*" },\n  "devDependencies": { "vite": "^8.3.8", "vitest": "^5.1.2", "mi-lib": "git+https://github.com/yo/mi-lib.git" },\n  "engines": { "node": ">=20" }\n}',
    run(input) {
      let p: Record<string, any>;
      try { p = JSON.parse(input); } catch { throw new Error('JSON no válido.'); }
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Se esperaba un objeto package.json.');
      const dep = (k: string) => (p[k] && typeof p[k] === 'object' ? (p[k] as Record<string, string>) : {});
      const groups = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
      const warn: string[] = [];
      for (const g of groups) for (const [n, v] of Object.entries(dep(g))) {
        if (/^(latest|\*|x)?$/i.test(String(v))) warn.push(`${g}.${n} usa «${v || '(vacío)'}»: una versión mayor nueva puede romper tu build. Fija un rango (^x.y.z).`);
        else if (/^(git|github|https?:)/.test(String(v))) warn.push(`${g}.${n} apunta a una URL (${v}): menos reproducible; mejor una versión publicada.`);
      }
      for (const n of Object.keys(dep('dependencies'))) if (n in dep('devDependencies')) warn.push(`«${n}» está en dependencies y en devDependencies.`);
      if (!p.license) warn.push('Falta el campo license.');
      if (!p.engines?.node) warn.push('Falta engines.node (indica la versión mínima de Node).');
      if (p.private !== true && !p.repository) warn.push('Falta repository (si piensas publicarlo).');
      const out = [`${p.name ?? '(sin nombre)'} @ ${p.version ?? '(sin versión)'}`, p.description ? `  ${p.description}` : '', `  Tipo de módulo: ${p.type ?? 'commonjs (por defecto)'}${p.private ? ' · privado' : ''}${p.license ? ` · licencia ${p.license}` : ''}`];
      const entry = ['main', 'module', 'types', 'exports', 'bin'].filter((k) => p[k]);
      if (entry.length) out.push(`  Puntos de entrada: ${entry.join(', ')}`);
      const sc = Object.entries(p.scripts ?? {});
      out.push('', `Scripts (${sc.length})`, ...(sc.length ? sc.map(([k, v]) => `  npm run ${k}  →  ${v}`) : ['  (ninguno)']));
      out.push('', 'Dependencias', ...groups.map((g) => `  ${g}: ${Object.keys(dep(g)).length}${Object.keys(dep(g)).length ? ' → ' + Object.entries(dep(g)).map(([n, v]) => `${n}@${v}`).join(', ') : ''}`));
      out.push('', warn.length ? `AVISOS (${warn.length})` : '✓ Sin avisos', ...warn.map((w) => '  ⚠ ' + w));
      return out.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    },
  },
];
export default tools;
