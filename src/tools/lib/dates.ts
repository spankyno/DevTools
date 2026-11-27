export const DAY = 86400000;
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const fmtYmd = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m0: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m0];

/** Acepta AAAA-MM-DD, DD/MM/AAAA, «hoy» o vacío (hoy). Devuelve la fecha a medianoche UTC. */
export function parseYmd(input: string): Date {
  const s = input.trim().toLowerCase();
  if (!s || s === 'hoy' || s === 'today') { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); }
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else throw new Error(`Fecha no válida: «${input.trim()}». Usa AAAA-MM-DD o DD/MM/AAAA.`);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error(`La fecha «${input.trim()}» no existe en el calendario.`);
  return date;
}

export function addMonths(d: Date, n: number): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12), m = ((total % 12) + 12) % 12;
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m))));
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export function isoWeek(d: Date): { year: number; week: number; weekday: number } {
  const weekday = ((d.getUTCDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo
  const thu = new Date(d.getTime() + (4 - weekday) * DAY);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return { year: thu.getUTCFullYear(), week: Math.ceil(((thu.getTime() - jan1) / DAY + 1) / 7), weekday };
}
export const dayOfYear = (d: Date) => Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;

function tzOffsetMs(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at.getTime() / 1000) * 1000;
}
/** Hora «de reloj» en una zona IANA → instante UTC (ms). */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, zone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - tzOffsetMs(zone, new Date(guess));
  const off2 = tzOffsetMs(zone, new Date(utc));
  if (guess - off2 !== utc) utc = guess - off2;
  return utc;
}
export const validZone = (z: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
