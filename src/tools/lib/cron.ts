const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

export type CronSpec = {
  raw: string[];
  minutes: number[]; hours: number[]; days: number[]; months: number[]; dows: number[];
  domRestricted: boolean; dowRestricted: boolean;
};

function parseField(raw: string, min: number, max: number, names: string[] | null, nameBase: number, label: string): number[] {
  const set = new Set<number>();
  const val = (t: string): number => {
    if (names) {
      const i = names.indexOf(t.toUpperCase());
      if (i !== -1) return i + nameBase;
    }
    if (!/^\d+$/.test(t)) throw new Error(`Valor no válido en ${label}: «${t}»`);
    return Number(t);
  };
  for (const part of raw.replace('?', '*').split(',')) {
    if (!part) throw new Error(`Lista vacía en ${label}`);
    const [range, stepStr, extra] = part.split('/');
    if (extra !== undefined) throw new Error(`Demasiadas «/» en ${label}: «${part}»`);
    const step = stepStr === undefined ? 1 : val(stepStr);
    if (step < 1) throw new Error(`El paso en ${label} debe ser 1 o mayor`);
    let lo: number, hi: number;
    if (range === '*') { lo = min; hi = max; }
    else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = val(a); hi = val(b);
    } else { lo = val(range); hi = stepStr === undefined ? lo : max; }
    if (lo < min || hi > max || lo > hi) throw new Error(`Fuera de rango en ${label}: «${part}» (permitido ${min}-${max})`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

export function parseCron(expr: string): CronSpec {
  const e = expr.trim();
  const full = ALIASES[e.toLowerCase()] ?? e;
  const f = full.split(/\s+/);
  if (f.length !== 5) throw new Error('Una expresión cron estándar tiene 5 campos: minuto hora día-mes mes día-semana.');
  const dows = parseField(f[4], 0, 7, DOWS, 0, 'día de la semana').map((d) => d % 7);
  return {
    raw: f,
    minutes: parseField(f[0], 0, 59, null, 0, 'minuto'),
    hours: parseField(f[1], 0, 23, null, 0, 'hora'),
    days: parseField(f[2], 1, 31, null, 0, 'día del mes'),
    months: parseField(f[3], 1, 12, MONTHS, 1, 'mes'),
    dows: [...new Set(dows)].sort((a, b) => a - b),
    domRestricted: !f[2].startsWith('*') && f[2] !== '?',
    dowRestricted: !f[4].startsWith('*') && f[4] !== '?',
  };
}

export function nextRuns(spec: CronSpec, from: Date, count: number, utc: boolean): Date[] {
  const out: Date[] = [];
  const y0 = utc ? from.getUTCFullYear() : from.getFullYear();
  const m0 = utc ? from.getUTCMonth() : from.getMonth();
  const d0 = utc ? from.getUTCDate() : from.getDate();
  for (let off = 0; off < 366 * 8 && out.length < count; off++) {
    const day = utc ? new Date(Date.UTC(y0, m0, d0 + off)) : new Date(y0, m0, d0 + off);
    const y = utc ? day.getUTCFullYear() : day.getFullYear();
    const mo = utc ? day.getUTCMonth() : day.getMonth();
    const dom = utc ? day.getUTCDate() : day.getDate();
    const dow = utc ? day.getUTCDay() : day.getDay();
    if (!spec.months.includes(mo + 1)) continue;
    const domOk = spec.days.includes(dom), dowOk = spec.dows.includes(dow);
    const dayOk = spec.domRestricted && spec.dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (!dayOk) continue;
    for (const h of spec.hours) for (const mi of spec.minutes) {
      const t = utc ? new Date(Date.UTC(y, mo, dom, h, mi)) : new Date(y, mo, dom, h, mi);
      if (t.getTime() > from.getTime()) { out.push(t); if (out.length >= count) return out; }
    }
  }
  return out;
}

const pad = (n: number | string) => String(n).padStart(2, '0');
const isNum = (s: string) => /^\d+$/.test(s);
const dowName = (t: string) => DIA_ES[(isNum(t) ? Number(t) : DOWS.indexOf(t.toUpperCase())) % 7];
const monName = (t: string) => MES_ES[(isNum(t) ? Number(t) : MONTHS.indexOf(t.toUpperCase()) + 1) - 1];
const joinEs = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

function describeTime(min: string, hour: string): string {
  if (min === '*' && hour === '*') return 'Cada minuto';
  if (/^\*\/\d+$/.test(min) && hour === '*') return `Cada ${min.slice(2)} minutos`;
  if (isNum(min) && isNum(hour)) return `A las ${pad(hour)}:${pad(min)}`;
  if (isNum(min) && hour === '*') return `En el minuto ${min} de cada hora`;
  if (isNum(min) && /^\*\/\d+$/.test(hour)) return `En el minuto ${min}, cada ${hour.slice(2)} horas`;
  if (isNum(min) && /^\d+-\d+$/.test(hour)) {
    const [a, b] = hour.split('-');
    return `Al minuto ${min} de cada hora, de ${pad(a)}:00 a ${pad(b)}:59`;
  }
  if (isNum(min) && /^\d+(,\d+)+$/.test(hour)) return `A las ${joinEs(hour.split(',').map((h) => `${pad(h)}:${pad(min)}`))}`;
  if (/^\*\/\d+$/.test(min) && /^\d+-\d+$/.test(hour)) {
    const [a, b] = hour.split('-');
    return `Cada ${min.slice(2)} minutos, de ${pad(a)}:00 a ${pad(b)}:59`;
  }
  return `Minutos «${min}», horas «${hour}»`;
}

function describeDow(f: string): string | null {
  if (f === '*' || f === '?') return null;
  if (/^[\w]+-[\w]+$/.test(f)) {
    const [a, b] = f.split('-');
    return `de ${dowName(a)} a ${dowName(b)}`;
  }
  if (/^[\w]+(,[\w]+)*$/.test(f)) return `los ${joinEs(f.split(',').map(dowName))}`;
  return `día de la semana «${f}»`;
}
function describeDom(f: string): string | null {
  if (f === '*' || f === '?') return null;
  if (/^\*\/\d+$/.test(f)) return `cada ${f.slice(2)} días`;
  if (isNum(f)) return `el día ${f} del mes`;
  if (/^\d+-\d+$/.test(f)) return `del día ${f.split('-')[0]} al ${f.split('-')[1]} del mes`;
  if (/^\d+(,\d+)+$/.test(f)) return `los días ${joinEs(f.split(','))} del mes`;
  return `día del mes «${f}»`;
}
function describeMonth(f: string): string | null {
  if (f === '*') return null;
  if (/^\*\/\d+$/.test(f)) return `cada ${f.slice(2)} meses`;
  if (/^\w+-\w+$/.test(f)) return `de ${monName(f.split('-')[0])} a ${monName(f.split('-')[1])}`;
  if (/^\w+(,\w+)*$/.test(f)) return `en ${joinEs(f.split(',').map(monName))}`;
  return `mes «${f}»`;
}

export function describeCron(spec: CronSpec): string {
  const [min, hour, dom, mon, dow] = spec.raw;
  const parts = [describeTime(min, hour)];
  const d = describeDom(dom), w = describeDow(dow), m = describeMonth(mon);
  if (!d && !w && !m) parts.push('todos los días');
  else {
    if (d && w) parts.push(`${d} o ${w}`);
    else if (d || w) parts.push((d || w) as string);
    if (m) parts.push(m);
  }
  let text = parts.join(', ');
  if (d && w) text += ' (cron ejecuta cuando coincide el día del mes O el día de la semana)';
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}
