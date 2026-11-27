import type { ToolDef } from '../types';
import { DNS_TYPES, MIME, PORTS } from '../lib/refdata';
import { classifyV4, classifyV6, compressIPv6, expandIPv6, ipv4ToStr, parseIPv4, parseIPv6 } from '../lib/ip';

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// ---------- User-Agent ----------
function parseUA(ua: string) {
  const m = (re: RegExp) => re.exec(ua)?.[1];
  let browser = 'Desconocido', version = '';
  const tests: [RegExp, string][] = [[/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge'], [/(?:OPR|Opera)\/([\d.]+)/, 'Opera'], [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'], [/CriOS\/([\d.]+)/, 'Chrome (iOS)'], [/Chrome\/([\d.]+)/, 'Chrome / Chromium'], [/Version\/([\d.]+).*Safari/, 'Safari'], [/(?:MSIE |rv:)([\d.]+).*Trident|Trident.*rv:([\d.]+)/, 'Internet Explorer']];
  for (const [re, name] of tests) { const r = re.exec(ua); if (r) { browser = name; version = r[1] ?? r[2] ?? ''; break; } }
  let os = 'Desconocido';
  const win = m(/Windows NT ([\d.]+)/);
  if (win) os = 'Windows ' + (({ '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[win] ?? win);
  else if (/Android/.test(ua)) os = 'Android ' + (m(/Android ([\d.]+)/) ?? '');
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS ' + (m(/OS ([\d_]+)/)?.replace(/_/g, '.') ?? '');
  else if (/Mac OS X/.test(ua)) os = 'macOS ' + (m(/Mac OS X ([\d_.]+)/)?.replace(/_/g, '.') ?? '');
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const bot = /bot|crawler|spider|slurp|facebookexternalhit|curl|wget|python-requests/i.test(ua);
  const device = bot ? 'Bot / cliente automático' : /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Móvil' : 'Escritorio';
  const engine = /Trident/.test(ua) ? 'Trident' : /Firefox|FxiOS/.test(ua) && /Gecko\//.test(ua) ? 'Gecko' : /AppleWebKit/.test(ua) ? (/Chrome|Edg|OPR|CriOS/.test(ua) && !/CriOS/.test(ua) ? 'Blink' : 'WebKit') : 'Desconocido';
  return { browser, version, os, device, engine };
}

// ---------- Cabeceras HTTP ----------
const HEADERS: Record<string, string> = {
  'content-type': 'Tipo de medio del cuerpo (y codificación de caracteres).', 'content-length': 'Tamaño del cuerpo en bytes.', 'content-encoding': 'Compresión aplicada al cuerpo (gzip, br…).',
  'content-language': 'Idioma del contenido.', 'content-disposition': 'Si se muestra en el navegador o se descarga, y el nombre del archivo.', 'cache-control': 'Reglas de caché para navegadores y proxies.',
  etag: 'Identificador de versión del recurso, para validar la caché.', 'last-modified': 'Fecha de la última modificación del recurso.', expires: 'Fecha a partir de la cual la respuesta caduca (anticuada: usa Cache-Control).',
  age: 'Segundos que lleva la respuesta en una caché intermedia.', vary: 'Cabeceras de petición que cambian la respuesta (afecta a la caché).', location: 'URL de destino de una redirección o recurso creado.',
  server: 'Software del servidor (revela información).', 'x-powered-by': 'Tecnología del servidor (revela información; conviene ocultarla).', date: 'Momento en que se generó la respuesta.',
  'set-cookie': 'Crea una cookie en el navegador.', 'access-control-allow-origin': 'CORS: orígenes autorizados a leer la respuesta.', 'access-control-allow-methods': 'CORS: métodos permitidos.',
  'access-control-allow-headers': 'CORS: cabeceras que se pueden enviar.', 'access-control-allow-credentials': 'CORS: permite enviar cookies o credenciales.', 'access-control-max-age': 'CORS: segundos que se cachea el preflight.',
  'strict-transport-security': 'HSTS: obliga a usar HTTPS durante un tiempo.', 'content-security-policy': 'CSP: restringe de dónde se cargan scripts, estilos, imágenes…', 'x-content-type-options': 'Con «nosniff» impide que el navegador adivine el tipo MIME.',
  'x-frame-options': 'Controla si la página puede mostrarse en un iframe (anticlickjacking).', 'referrer-policy': 'Qué información de origen se envía en la cabecera Referer.', 'permissions-policy': 'Activa o desactiva funciones del navegador (cámara, geolocalización…).',
  'cross-origin-opener-policy': 'COOP: aísla el contexto de navegación frente a ventanas de otros orígenes.', 'cross-origin-resource-policy': 'CORP: quién puede cargar este recurso.', 'cross-origin-embedder-policy': 'COEP: exige que los recursos incrustados lo permitan.',
  'x-xss-protection': 'Obsoleta; los navegadores modernos la ignoran. Usa CSP.', 'retry-after': 'Cuánto esperar antes de reintentar (429, 503).', 'www-authenticate': 'Esquema de autenticación requerido (401).',
  'accept-ranges': 'Indica si el servidor admite peticiones parciales (Range).', link: 'Enlaces relacionados (preload, paginación…).', 'alt-svc': 'Servicios alternativos, p. ej. HTTP/3.', 'x-request-id': 'Identificador de la petición para trazabilidad.',
  'cf-ray': 'Identificador de la petición en Cloudflare.', 'transfer-encoding': 'Codificación de transferencia (p. ej. chunked).', connection: 'Control de la conexión (keep-alive, close).',
};
const SEC = [
  ['strict-transport-security', 'Falta Strict-Transport-Security (HSTS).'], ['content-security-policy', 'Falta Content-Security-Policy.'], ['x-content-type-options', 'Falta X-Content-Type-Options: nosniff.'],
  ['referrer-policy', 'Falta Referrer-Policy.'], ['permissions-policy', 'Falta Permissions-Policy.'],
] as const;

function analyzeHeaders(input: string): string {
  const out: string[] = [], warn: string[] = [];
  const present = new Map<string, string>();
  for (const raw of input.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || /^HTTP\/[\d.]+/i.test(l) || /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(l)) continue;
    const i = l.indexOf(':');
    if (i < 1) { warn.push(`Línea sin formato «Nombre: valor»: ${l.slice(0, 50)}`); continue; }
    const name = l.slice(0, i).trim().toLowerCase(), value = l.slice(i + 1).trim();
    if (name !== 'set-cookie') present.set(name, value);
    out.push(`■ ${l.slice(0, i).trim()}: ${value.length > 90 ? value.slice(0, 90) + '…' : value}`);
    if (HEADERS[name]) out.push(`    ${HEADERS[name]}`);
    if (name === 'cache-control') {
      for (const d of value.split(',').map((x) => x.trim().toLowerCase())) {
        const [k, v] = d.split('=');
        const e: Record<string, string> = { 'no-store': 'no se guarda en ninguna caché', 'no-cache': 'se puede guardar, pero hay que revalidar antes de usarla', public: 'cacheable por cualquier caché', private: 'solo la caché del navegador', 'must-revalidate': 'una vez caducada, hay que revalidar', immutable: 'no cambiará mientras esté vigente', 'max-age': `vigente ${v} s (${Math.round(Number(v) / 3600 * 10) / 10} h)`, 's-maxage': `vigencia en cachés compartidas: ${v} s`, 'stale-while-revalidate': `sirve caducada hasta ${v} s mientras revalida` };
        if (e[k]) out.push(`    · ${d}: ${e[k]}`);
      }
    }
    if (name === 'set-cookie') {
      const attrs = value.split(';').map((x) => x.trim().toLowerCase());
      if (!attrs.includes('secure')) warn.push(`Cookie «${value.split('=')[0]}» sin Secure.`);
      if (!attrs.includes('httponly')) warn.push(`Cookie «${value.split('=')[0]}» sin HttpOnly (accesible desde JavaScript).`);
      if (!attrs.some((a) => a.startsWith('samesite'))) warn.push(`Cookie «${value.split('=')[0]}» sin SameSite.`);
    }
    if (name === 'strict-transport-security') { const age = Number(/max-age=(\d+)/i.exec(value)?.[1] ?? 0); if (age < 31536000) warn.push('HSTS con max-age inferior a 1 año (31536000).'); }
    if (name === 'content-security-policy') { if (/unsafe-inline|unsafe-eval/.test(value)) warn.push("CSP permite 'unsafe-inline' o 'unsafe-eval', lo que debilita la protección."); if (/(^|[\s;])\*(\s|;|$)/.test(value)) warn.push('CSP con comodín * en alguna directiva.'); }
    if (name === 'x-xss-protection') warn.push('X-XSS-Protection está obsoleta; sustitúyela por una buena CSP.');
    if ((name === 'server' || name === 'x-powered-by') && /\d/.test(value)) warn.push(`${l.slice(0, i)} revela la versión («${value}»).`);
  }
  if (!out.length) throw new Error('No se encontró ninguna cabecera. Pega líneas «Nombre: valor».');
  if (present.get('access-control-allow-origin') === '*' && present.get('access-control-allow-credentials')?.toLowerCase() === 'true') warn.push('CORS: «*» junto a credenciales no es válido ni seguro.');
  for (const [h, msg] of SEC) if (!present.has(h)) warn.push(msg);
  if (!present.has('x-frame-options') && !/frame-ancestors/.test(present.get('content-security-policy') ?? '')) warn.push('Sin X-Frame-Options ni frame-ancestors en la CSP (riesgo de clickjacking).');
  return [...out, '', warn.length ? 'AVISOS DE SEGURIDAD' : '✓ Sin avisos de seguridad', ...warn.map((w) => '  ⚠ ' + w)].join('\n');
}

const tools: ToolDef[] = [
  {
    id: 'query-builder', name: 'Query String Builder', desc: 'Construye o analiza query strings de URLs.', category: 'Red y HTTP', icon: '?=',
    sample: 'q=hola mundo\nlang=es\ntag=a&b\ntag=ñ', inputLabel: 'Parámetros (clave=valor, uno por línea) o la URL a analizar', secondLabel: 'URL base (opcional)', secondSample: 'https://ejemplo.com/buscar',
    options: [
      { id: 'mode', label: 'Modo', type: 'select', default: 'build', choices: [{ value: 'build', label: 'Construir' }, { value: 'parse', label: 'Analizar' }] },
      { id: 'plus', label: 'Espacio como «+»', type: 'checkbox', default: false },
    ],
    tip: 'Las claves repetidas (tag=a, tag=b) se mantienen. Los valores se codifican automáticamente.',
    run(input, extra, o) {
      if (o.mode === 'parse') {
        const q = input.trim().replace(/#.*$/, '');
        const sp = new URLSearchParams(q.includes('?') ? q.slice(q.indexOf('?') + 1) : q.replace(/^\?/, ''));
        const entries = [...sp.entries()];
        if (!entries.length) return 'No hay parámetros.';
        return [...entries.map(([k, v]) => `${k} = ${v}`), '', JSON.stringify(Object.fromEntries([...new Set(entries.map(([k]) => k))].map((k) => [k, sp.getAll(k).length > 1 ? sp.getAll(k) : sp.get(k)])), null, 2)].join('\n');
      }
      const sp = new URLSearchParams();
      for (const l of input.split(/\r?\n/)) { if (!l.trim()) continue; const i = l.indexOf('='); sp.append(i < 0 ? l : l.slice(0, i), i < 0 ? '' : l.slice(i + 1)); }
      let qs = sp.toString();
      if (!o.plus) qs = qs.replace(/\+/g, '%20');
      const base = extra.trim();
      return base ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : qs;
    },
  },
  {
    id: 'ip-converter', name: 'IPv4 / IPv6 Converter', desc: 'Convierte IPv4 a decimal, hex y binario; expande y comprime IPv6.', category: 'Red y HTTP', icon: 'IP',
    sample: '192.168.1.10\n2001:db8:0:0:0:0:0:1\n3232235786',
    tip: 'Una por línea. Un número entero se interpreta como IPv4 en formato decimal.',
    run(input) {
      return lines(input).map((l) => {
        const asInt = /^\d+$/.test(l) && Number(l) <= 0xffffffff ? Number(l) : null;
        const v4 = asInt ?? parseIPv4(l);
        if (v4 !== null) {
          return [`IPv4  ${ipv4ToStr(v4)}`, `  Decimal       ${v4}`, `  Hexadecimal   0x${v4.toString(16).toUpperCase().padStart(8, '0')}`, `  Binario       ${ipv4ToStr(v4).split('.').map((x) => Number(x).toString(2).padStart(8, '0')).join('.')}`, `  IPv6 mapeada  ::ffff:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}  (::ffff:${ipv4ToStr(v4)})`].join('\n');
        }
        const v6 = parseIPv6(l);
        if (v6) return [`IPv6  ${l}`, `  Completa      ${expandIPv6(v6)}`, `  Comprimida    ${compressIPv6(v6)}`, `  Tipo          ${classifyV6(v6)}`].join('\n');
        return `✗ «${l}» no es una IPv4 ni una IPv6 válida.`;
      }).join('\n\n');
    },
  },
  {
    id: 'ip-info', name: 'IP Address Info', desc: 'Clasifica una IP (privada, pública, loopback…). Análisis local, sin consultas externas.', category: 'Red y HTTP', icon: 'ⓘ',
    sample: '10.0.0.5\n8.8.8.8\nfe80::1',
    hint: 'No consulta servicios externos: no da geolocalización ni proveedor, solo el tipo de dirección según los rangos reservados.',
    run(input) {
      return lines(input).map((l) => {
        const v4 = parseIPv4(l);
        if (v4 !== null) {
          const first = v4 >>> 24, cls = first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : first < 240 ? 'D (multicast)' : 'E (reservada)';
          const t = classifyV4(v4);
          return [`${l}  (IPv4)`, `  Tipo         ${t}`, `  Clase        ${cls} (clasificación histórica)`, `  Enrutable    ${t.startsWith('Pública') ? 'sí, en Internet' : 'no'}`, `  DNS inverso  ${ipv4ToStr(v4).split('.').reverse().join('.')}.in-addr.arpa`].join('\n');
        }
        const v6 = parseIPv6(l);
        if (v6) return [`${compressIPv6(v6)}  (IPv6)`, `  Tipo         ${classifyV6(v6)}`, `  Completa     ${expandIPv6(v6)}`, `  DNS inverso  ${expandIPv6(v6).replace(/:/g, '').split('').reverse().join('.')}.ip6.arpa`].join('\n');
        return `✗ «${l}» no es una IP válida.`;
      }).join('\n\n');
    },
  },
  {
    id: 'user-agent', name: 'User-Agent Parser', desc: 'Identifica navegador, sistema, dispositivo y motor de un User-Agent.', category: 'Red y HTTP', icon: 'UA',
    sample: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    tip: 'Si lo dejas vacío analiza el de tu propio navegador. Los navegadores modernos reducen la información del UA, así que versiones y sistema pueden ser aproximados.',
    run(input) {
      const ua = input.trim() || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
      if (!ua) throw new Error('Pega un User-Agent.');
      const r = parseUA(ua);
      return [`Navegador:    ${r.browser} ${r.version}`.trimEnd(), `Sistema:      ${r.os}`, `Dispositivo:  ${r.device}`, `Motor:        ${r.engine}`, '', 'User-Agent analizado:', ua].join('\n');
    },
  },
  {
    id: 'http-headers', name: 'HTTP Headers Analyzer', desc: 'Explica cabeceras HTTP y detecta problemas de seguridad.', category: 'Red y HTTP', icon: 'H:',
    sample: 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nCache-Control: public, max-age=3600\nServer: nginx/1.24.0\nStrict-Transport-Security: max-age=300\nContent-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'\nSet-Cookie: sid=abc123; Path=/',
    hint: 'Se analiza en tu navegador. Antes de pegar cabeceras reales, quita cookies o tokens de sesión.',
    run: analyzeHeaders,
  },
  {
    id: 'mime', name: 'MIME Type Lookup', desc: 'Busca el tipo MIME de una extensión o las extensiones de un tipo.', category: 'Red y HTTP', icon: 'mime',
    sample: 'png\n.webp\nfoto.JPG\napplication/json',
    tip: 'Admite extensión (png, .png), nombre de archivo, tipo MIME (image/png) o texto parcial (image).',
    run(input) {
      return lines(input).map((l) => {
        const q = l.toLowerCase();
        if (q.includes('/')) { const ext = Object.entries(MIME).filter(([, t]) => t === q).map(([e]) => '.' + e); return ext.length ? `${q}  →  ${ext.join(', ')}` : `${q}  →  (sin extensión conocida en la tabla)`; }
        const ext = q.includes('.') ? q.slice(q.lastIndexOf('.') + 1) : q;
        if (MIME[ext]) return `.${ext}  →  ${MIME[ext]}`;
        const part = Object.entries(MIME).filter(([e, t]) => e.includes(ext) || t.includes(q));
        return part.length ? `Coincidencias para «${l}»:\n` + part.map(([e, t]) => `  .${e.padEnd(12)} ${t}`).join('\n') : `${l}  →  no está en la tabla (se usaría application/octet-stream).`;
      }).join('\n');
    },
  },
  {
    id: 'ports', name: 'Port Reference', desc: 'Puertos TCP/UDP habituales y los servicios que los usan.', category: 'Red y HTTP', icon: ':80',
    sample: '443', tip: 'Busca por número (443), servicio (redis) o texto (correo). Vacío = todos.',
    run(input) {
      const q = input.trim().toLowerCase();
      const list = q ? PORTS.filter(([p, pr, s, d]) => String(p) === q || `${pr} ${s} ${d}`.toLowerCase().includes(q)) : PORTS;
      if (!list.length) return 'Sin resultados. La tabla incluye los puertos más habituales, no todos los registrados por IANA.';
      return list.map(([p, pr, s, d]) => `${String(p).padStart(5)}  ${pr.padEnd(8)} ${s.padEnd(22)} ${d}`).join('\n');
    },
  },
  {
    id: 'dns-ref', name: 'DNS Record Reference', desc: 'Guía de tipos de registro DNS con ejemplos.', category: 'Red y HTTP', icon: 'DNS',
    sample: 'MX', tip: 'Escribe un tipo (A, MX, TXT…) o un texto para filtrar. Vacío = todos.',
    run(input) {
      const q = input.trim().toLowerCase();
      const list = q ? DNS_TYPES.filter(([t, d]) => t.toLowerCase() === q || `${t} ${d}`.toLowerCase().includes(q)) : DNS_TYPES;
      if (!list.length) return 'Sin resultados.';
      return list.map(([t, d, e]) => `${t}\n  ${d}\n  Ejemplo: ${e}`).join('\n\n');
    },
  },
];
export default tools;
