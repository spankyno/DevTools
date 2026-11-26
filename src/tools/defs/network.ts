import type { ToolDef } from '../types';

const STATUS: Record<string, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict',
  422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
};

const tools: ToolDef[] = [
  {
    id: 'api',
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
    desc: 'Consulta códigos de estado HTTP frecuentes.',
    category: 'Red y HTTP',
    icon: '200',
    sample: '404',
    run: (input) => STATUS[input.trim()] ?? 'Código no incluido en la tabla rápida.',
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
