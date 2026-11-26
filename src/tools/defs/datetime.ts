import type { ToolDef } from '../types';
import { describeCron, nextRuns, parseCron } from '../lib/cron';

const ZONES = ['local', 'UTC', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Mexico_City',
  'America/Argentina/Buenos_Aires', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

function relative(ms: number): string {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const s = Math.round(ms / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 60) return rtf.format(Math.round(s / 86400), 'day');
  if (abs < 86400 * 730) return rtf.format(Math.round(s / (86400 * 30.44)), 'month');
  return rtf.format(Math.round(s / (86400 * 365.25)), 'year');
}

const tools: ToolDef[] = [
  {
    id: 'timestamp',
    name: 'Timestamp Converter',
    desc: 'Convierte timestamps Unix (s/ms) y fechas, con zonas horarias.',
    category: 'Fecha y hora',
    icon: '◷',
    sample: String(Math.floor(Date.now() / 1000)),
    options: [
      { id: 'unit', label: 'Unidad', type: 'select', default: 'auto', choices: [
        { value: 'auto', label: 'Detectar' }, { value: 's', label: 'Segundos' }, { value: 'ms', label: 'Milisegundos' } ] },
      { id: 'zone', label: 'Zona horaria', type: 'select', default: 'local', choices: ZONES.map((z) => ({ value: z, label: z === 'local' ? 'Local del navegador' : z })) },
    ],
    tip: 'Acepta números (s o ms) o fechas como 2026-11-26 09:30. Si lo dejas vacío usa la hora actual.',
    run(input, _e, o) {
      const t = input.trim();
      let ms: number;
      if (!t) ms = Date.now();
      else if (/^-?\d+(\.\d+)?$/.test(t)) {
        const n = Number(t);
        ms = o.unit === 's' ? n * 1000 : o.unit === 'ms' ? n : Math.abs(n) >= 1e11 ? n : n * 1000;
      } else ms = new Date(t).getTime();
      if (!Number.isFinite(ms)) throw new Error('Fecha o timestamp no válido.');
      const d = new Date(ms);
      if (isNaN(d.getTime())) throw new Error('Fuera del rango de fechas representable.');
      const tz = o.zone === 'local' ? undefined : String(o.zone);
      const fmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'long', timeZone: tz }).format(d);
      const unit = !t || !/^-?\d+(\.\d+)?$/.test(t) ? '' : o.unit === 'auto' ? (Math.abs(Number(t)) >= 1e11 ? ' (interpretado como milisegundos)' : ' (interpretado como segundos)') : '';
      return [
        `ISO 8601 (UTC): ${d.toISOString()}`,
        `${(tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone).padEnd(15)} ${fmt}`,
        `Unix (s):       ${Math.floor(ms / 1000)}`,
        `Unix (ms):      ${Math.floor(ms)}`,
        `Relativo:       ${relative(ms - Date.now())}${unit}`,
      ].join('\n');
    },
  },
  {
    id: 'cron',
    name: 'Cron Helper',
    desc: 'Explica expresiones cron en español y calcula las próximas ejecuciones.',
    category: 'Fecha y hora',
    icon: '◴',
    sample: '0 9 * * 1-5',
    options: [
      { id: 'count', label: 'Próximas', type: 'number', default: 5, min: 1, max: 20 },
      { id: 'tz', label: 'Hora', type: 'select', default: 'local', choices: [{ value: 'local', label: 'Local del navegador' }, { value: 'utc', label: 'UTC' }] },
    ],
    tip: 'Formato: minuto hora día-mes mes día-semana. También admite @daily, @hourly, @weekly, @monthly y @yearly.',
    run(input, _e, o) {
      const spec = parseCron(input);
      const utc = o.tz === 'utc';
      const n = Math.min(20, Math.max(1, Math.floor(Number(o.count)) || 5));
      const runs = nextRuns(spec, new Date(), n, utc);
      const f = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'short', timeZone: utc ? 'UTC' : undefined });
      return [
        describeCron(spec), '',
        `Expresión: ${spec.raw.join(' ')}`, '',
        `Próximas ejecuciones (${utc ? 'UTC' : 'hora local'}):`,
        ...(runs.length ? runs.map((r, i) => `  ${String(i + 1).padStart(2)}. ${f.format(r)}`) : ['  (no hay ejecuciones en los próximos 8 años)']),
      ].join('\n');
    },
  },
];
export default tools;
