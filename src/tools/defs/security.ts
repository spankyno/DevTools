import type { ToolDef } from '../types';
import { fromBase64, fromUtf8, toBase64, toHex, utf8 } from '../lib/bytes';
import { md5 } from '../lib/md5';

const ALGOS = [
  { id: 'MD5', weak: true }, { id: 'SHA-1', weak: true }, { id: 'SHA-256', weak: false },
  { id: 'SHA-384', weak: false }, { id: 'SHA-512', weak: false },
];
const HEX_LEN: Record<number, string> = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' };

async function digest(algo: string, data: Uint8Array): Promise<string> {
  if (algo === 'MD5') return md5(data);
  return toHex(await crypto.subtle.digest(algo, data as BufferSource));
}
const WEAK_NOTE = '⚠ MD5 y SHA-1 no son recomendables para seguridad (colisiones conocidas). Úsalos solo para comprobar sumas heredadas.';

async function hashAll(data: Uint8Array, algo: string): Promise<string> {
  const list = algo === 'all' ? ALGOS : ALGOS.filter((a) => a.id === algo);
  const lines = await Promise.all(list.map(async (a) => `${a.id.padEnd(8)} ${await digest(a.id, data)}${a.weak ? '  ⚠' : ''}`));
  return lines.join('\n') + (list.some((a) => a.weak) ? '\n\n' + WEAK_NOTE : '');
}

const algoChoices = [{ value: 'all', label: 'Todos' }, ...ALGOS.map((a) => ({ value: a.id, label: a.id + (a.weak ? ' (no recomendado)' : '') }))];

function b64urlJson(seg: string): unknown {
  return JSON.parse(fromUtf8(fromBase64(seg)));
}
const fmtDate = (s: number) => new Date(s * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
function rel(ms: number) {
  const abs = Math.abs(ms) / 1000;
  const [v, u] = abs < 3600 ? [Math.round(abs / 60), 'min'] : abs < 86400 ? [Math.round(abs / 3600), 'h'] : [Math.round(abs / 86400), 'días'];
  return `${v} ${u}`;
}

const tools: ToolDef[] = [
  {
    id: 'jwt',
    name: 'JWT Decoder / Inspector',
    desc: 'Decodifica un JWT y analiza sus fechas (exp, iat, nbf).',
    category: 'Seguridad',
    icon: '◇',
    sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldlRvb2xzIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.firma-de-ejemplo',
    hint: 'Todo se decodifica en tu navegador y no se guarda. No pegues tokens de producción en equipos que no sean tuyos.',
    tip: 'El decodificador JWT no verifica la firma.',
    run(input) {
      const p = input.trim().replace(/^Bearer\s+/i, '').split('.');
      if (p.length !== 3) throw new Error('Un JWT tiene tres segmentos separados por puntos.');
      let header: Record<string, unknown>, payload: Record<string, unknown>;
      try { header = b64urlJson(p[0]) as Record<string, unknown>; payload = b64urlJson(p[1]) as Record<string, unknown>; }
      catch { throw new Error('No se pudo decodificar la cabecera o el payload (¿es un JWT válido?).'); }
      const now = Date.now();
      const fechas: string[] = [];
      for (const [k, label] of [['iat', 'Emitido (iat)'], ['nbf', 'No válido antes de (nbf)'], ['exp', 'Caduca (exp)']] as const) {
        const v = payload[k];
        if (typeof v === 'number') {
          let extra = '';
          if (k === 'exp') extra = v * 1000 < now ? `  → CADUCADO hace ${rel(now - v * 1000)}` : `  → válido, caduca en ${rel(v * 1000 - now)}`;
          if (k === 'nbf' && v * 1000 > now) extra = `  → aún no válido (empieza en ${rel(v * 1000 - now)})`;
          fechas.push(`${label}: ${fmtDate(v)}${extra}`);
        }
      }
      const avisos: string[] = [];
      if (String(header.alg).toLowerCase() === 'none') avisos.push('⚠ alg=none: el token no está firmado.');
      if (typeof payload.exp !== 'number') avisos.push('⚠ No tiene fecha de caducidad (exp).');
      return [
        'CABECERA', JSON.stringify(header, null, 2), '', 'PAYLOAD', JSON.stringify(payload, null, 2), '',
        'FECHAS', fechas.join('\n') || '(sin claims de fecha)', ...(avisos.length ? ['', 'AVISOS', ...avisos] : []),
        '', 'Firma: no verificada (la clave no se envía a ningún sitio).',
      ].join('\n');
    },
  },
  {
    id: 'hash',
    name: 'Hash Generator',
    desc: 'MD5, SHA-1, SHA-256, SHA-384 y SHA-512 de texto o archivos.',
    category: 'Seguridad',
    icon: '#',
    sample: 'Texto para resumir',
    options: [{ id: 'algo', label: 'Algoritmo', type: 'select', default: 'all', choices: algoChoices }],
    fileInput: { label: 'Calcular de un archivo…' },
    hint: 'Se calcula localmente. MD5 y SHA-1 se marcan como no recomendados para seguridad.',
    run: (input, _e, o) => hashAll(utf8(input), String(o.algo)),
    runFile: async (file, o) => `${file.name} (${file.size} bytes)\n\n` + (await hashAll(new Uint8Array(await file.arrayBuffer()), String(o.algo))),
  },
  {
    id: 'hash-check',
    name: 'Hash Checker',
    desc: 'Comprueba si un texto coincide con un hash dado.',
    category: 'Seguridad',
    icon: '✓#',
    sample: 'Texto para resumir',
    secondLabel: 'Hash esperado (hexadecimal)',
    secondSample: '0afd0c5b4cbec1c5b63b3975da856891928279f38d078d9b83a4dbb7d39d88b9',
    tip: 'El algoritmo se detecta por la longitud del hash (32 → MD5, 40 → SHA-1, 64 → SHA-256…).',
    async run(input, extra) {
      const expected = extra.trim().toLowerCase().replace(/^0x/, '');
      if (!expected) throw new Error('Pega el hash esperado en el segundo campo.');
      if (!/^[0-9a-f]+$/.test(expected)) throw new Error('El hash esperado debe ser hexadecimal.');
      const algo = HEX_LEN[expected.length];
      if (!algo) throw new Error(`Longitud no reconocida (${expected.length} caracteres). Esperaba 32, 40, 64, 96 o 128.`);
      const got = await digest(algo, utf8(input));
      const weak = ALGOS.find((a) => a.id === algo)?.weak;
      return `${got === expected ? '✓ COINCIDE' : '✗ NO COINCIDE'} (${algo})\n\nCalculado: ${got}\nEsperado:  ${expected}` + (weak ? '\n\n' + WEAK_NOTE : '');
    },
  },
  {
    id: 'hmac',
    name: 'HMAC Generator',
    desc: 'Genera HMAC con SHA-256, SHA-384 o SHA-512.',
    category: 'Seguridad',
    icon: 'HM',
    sample: 'mensaje a firmar',
    secondLabel: 'Clave secreta',
    secondSample: 'clave-de-ejemplo',
    options: [{ id: 'algo', label: 'Algoritmo', type: 'select', default: 'SHA-256', choices: ['SHA-256', 'SHA-384', 'SHA-512'].map((v) => ({ value: v, label: v })) }],
    hint: 'La clave nunca sale del navegador ni se guarda. Usa claves de prueba si no estás en tu equipo.',
    async run(input, extra, o) {
      if (!extra) throw new Error('Escribe la clave secreta en el segundo campo.');
      const key = await crypto.subtle.importKey('raw', utf8(extra) as BufferSource, { name: 'HMAC', hash: String(o.algo) }, false, ['sign']);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(input) as BufferSource));
      return `HMAC-${o.algo}\n\nHex:    ${toHex(sig)}\nBase64: ${toBase64(sig)}`;
    },
  },
];
export default tools;
