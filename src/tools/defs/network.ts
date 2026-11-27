import type { ToolDef } from '../types';
import { HTTP_STATUS } from '../lib/refdata';

const tools: ToolDef[] = [
  {
    id: 'api',
    browserOnly: true,
    name: 'API Request Tester',
    desc: 'Envía una petición GET desde el navegador y muestra la respuesta.',
    category: 'Red y HTTP',
    icon: '⇢',
    sample: 'https://jsonplaceholder.typicode.com/todos/1',
    runLabel: 'Enviar petición',
    hint: 'La petición sale de tu navegador hacia un servidor remoto y puede bloquearse por CORS.',
    tip: 'El navegador puede bloquear solicitudes por CORS.',
    async run(input) {
      const t0 = performance.now();
      try {
        const r = await fetch(input.trim());
        const body = await r.text();
        return `HTTP ${r.status} ${r.statusText}  ·  ${Math.round(performance.now() - t0)} ms\n\n${body}`;
      } catch (e) {
        return 'Petición fallida: puede ser CORS, red o URL incorrecta.\n' + String(e);
      }
    },
  },
  {
    id: 'status',
    name: 'HTTP Status Codes',
    desc: 'Catálogo completo de códigos de estado HTTP con su significado.',
    category: 'Red y HTTP',
    icon: '200',
    sample: '404',
    tip: 'Busca por código (404), por clase (4xx) o por texto (redirect, timeout…). Vacío = todos.',
    run(input) {
      const q = input.trim().toLowerCase();
      const fmt = ([c, n, d]: [number, string, string]) => `${c}  ${n}\n     ${d}`;
      let list = HTTP_STATUS;
      if (/^\d{3}$/.test(q)) list = HTTP_STATUS.filter(([c]) => c === Number(q));
      else if (/^[1-5](xx)?$/.test(q)) list = HTTP_STATUS.filter(([c]) => String(c)[0] === q[0]);
      else if (q) list = HTTP_STATUS.filter(([c, n, d]) => `${c} ${n} ${d}`.toLowerCase().includes(q));
      if (!list.length) return /^\d{3}$/.test(q) ? `El código ${q} no está en el catálogo estándar.` : 'Sin resultados.';
      return list.map(fmt).join('\n\n');
    },
  },
  {
    id: 'url-parser',
    name: 'URL Parser',
    desc: 'Descompone una URL en sus partes.',
    category: 'Red y HTTP',
    icon: '⌕',
    sample: 'https://ejemplo.com:8080/ruta?busqueda=dev&pagina=2#resultados',
    run(input) {
      let u: URL;
      try { u = new URL(input.trim()); } catch { throw new Error('URL no válida (incluye el protocolo, p. ej. https://).'); }
      return JSON.stringify({
        href: u.href, protocol: u.protocol, host: u.host, hostname: u.hostname, port: u.port,
        pathname: u.pathname, search: u.search, hash: u.hash, params: Object.fromEntries(u.searchParams),
      }, null, 2);
    },
  },
  {
    id: 'cidr',
    name: 'CIDR Calculator',
    desc: 'Calcula red, máscara y rango de hosts IPv4.',
    category: 'Red y HTTP',
    icon: '⌗',
    sample: '192.168.1.10/24',
    run(input) {
      const [ip, bs] = input.trim().split('/');
      const bits = Number(bs), p = ip.split('.').map(Number);
      if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255) || !Number.isInteger(bits) || bits < 0 || bits > 32)
        throw new Error('IPv4/CIDR no válida, ejemplo: 192.168.1.10/24');
      const n = p.reduce((a, x) => ((a * 256 + x) >>> 0), 0);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      const net = (n & mask) >>> 0, bc = (net | ~mask) >>> 0;
      const f = (x: number) => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
      return JSON.stringify({
        mascara: f(mask), red: f(net), broadcast: f(bc),
        primer_host: f(bits >= 31 ? net : net + 1), ultimo_host: f(bits >= 31 ? bc : bc - 1),
        hosts: bits >= 31 ? 2 ** (32 - bits) : 2 ** (32 - bits) - 2,
      }, null, 2);
    },
  },
];
export default tools;
