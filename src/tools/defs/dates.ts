import type { ToolDef } from '../types';
import { DAY, DIAS, addDays, addMonths, dayOfYear, fmtYmd, isLeap, isoWeek, parseYmd, validZone, zonedTimeToUtc } from '../lib/dates';

const longDate = (d: Date) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'UTC' }).format(d);
const pad = (n: number) => String(n).padStart(2, '0');
const wk = (d: Date) => { const w = isoWeek(d); return `${w.year}-W${pad(w.week)}-${w.weekday}`; };

function offsetLabel(zone: string, at: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

const tools: ToolDef[] = [
  {
    id: 'date-calc', name: 'Date Calculator', desc: 'Suma o resta días, semanas, meses o años a una fecha.', category: 'Fecha y hora', icon: '±d',
    sample: '2026-01-31', inputLabel: 'Fecha de partida (AAAA-MM-DD; vacío = hoy)',
    options: [
      { id: 'op', label: 'Operación', type: 'select', default: 'add', choices: [{ value: 'add', label: 'Sumar' }, { value: 'sub', label: 'Restar' }] },
      { id: 'amount', label: 'Cantidad', type: 'number', default: 1, min: 0 },
      { id: 'unit', label: 'Unidad', type: 'select', default: 'months', choices: [{ value: 'days', label: 'Días' }, { value: 'weeks', label: 'Semanas' }, { value: 'months', label: 'Meses' }, { value: 'years', label: 'Años' }] },
    ],
    tip: 'Al sumar meses, si el día no existe se usa el último del mes (31 ene + 1 mes = 28 feb).',
    run(input, _e, o) {
      const d = parseYmd(input), n = (o.op === 'sub' ? -1 : 1) * Math.floor(Number(o.amount) || 0);
      const r = o.unit === 'days' ? addDays(d, n) : o.unit === 'weeks' ? addDays(d, n * 7) : o.unit === 'months' ? addMonths(d, n) : addMonths(d, n * 12);
      const today = parseYmd('');
      const diff = Math.round((r.getTime() - today.getTime()) / DAY);
      return [`Resultado:   ${fmtYmd(r)}`, `             ${longDate(r)}`, `Semana ISO:  ${wk(r)}`, `Día del año: ${dayOfYear(r)}`, `Respecto a hoy: ${diff === 0 ? 'es hoy' : diff > 0 ? `dentro de ${diff} días` : `hace ${-diff} días`}`].join('\n');
    },
  },
  {
    id: 'date-diff', name: 'Date Difference', desc: 'Diferencia entre dos fechas en días, semanas, meses y años.', category: 'Fecha y hora', icon: 'Δd',
    sample: '2026-01-15', inputLabel: 'Fecha inicial', secondLabel: 'Fecha final', secondSample: '2026-11-26',
    tip: 'Los meses se cuentan como en un calendario: se suman todos los meses completos posibles (31 ene + 1 mes = 28 feb) y el resto son días.',
    run(input, extra) {
      const a = parseYmd(input), b = parseYmd(extra);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const days = Math.round((hi.getTime() - lo.getTime()) / DAY);
      // Meses completos = los máximos que se pueden sumar a la fecha inicial sin pasarse; el resto son días.
      let total = (hi.getUTCFullYear() - lo.getUTCFullYear()) * 12 + (hi.getUTCMonth() - lo.getUTCMonth());
      if (addMonths(lo, total) > hi) total--;
      const y = Math.floor(total / 12), m = total % 12, d = Math.round((hi.getTime() - addMonths(lo, total).getTime()) / DAY);
      return [`Diferencia:  ${y} años, ${m} meses, ${d} días`, `Días totales: ${days}`, `Semanas:      ${Math.floor(days / 7)} semanas y ${days % 7} días`, `Horas:        ${days * 24}`, '', a > b ? 'La fecha inicial es posterior a la final.' : a < b ? 'La fecha final es posterior a la inicial.' : 'Son la misma fecha.'].join('\n');
    },
  },
  {
    id: 'timezone', name: 'Timezone Converter', desc: 'Convierte una hora entre zonas horarias (con horario de verano).', category: 'Fecha y hora', icon: '🌐',
    sample: '2026-11-26 12:00',
    inputLabel: 'Fecha y hora (AAAA-MM-DD HH:mm; vacío = ahora)',
    options: [
      { id: 'from', label: 'Zona de origen', type: 'text', default: 'Europe/Madrid' },
      { id: 'to', label: 'Zonas de destino (separadas por comas)', type: 'text', default: 'UTC, America/New_York, America/Mexico_City, Asia/Tokyo' },
    ],
    tip: 'Usa nombres IANA: Europe/Madrid, America/Bogota, Asia/Kolkata, UTC…',
    run(input, _e, o) {
      const from = String(o.from).trim(), tos = String(o.to).split(',').map((z) => z.trim()).filter(Boolean);
      for (const z of [from, ...tos]) if (!validZone(z)) throw new Error(`Zona horaria no válida: «${z}».`);
      let ms: number;
      if (!input.trim()) ms = Date.now();
      else {
        const m = /^\s*(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})\s*$/.exec(input);
        if (!m) throw new Error('Formato: AAAA-MM-DD HH:mm, por ejemplo 2026-11-26 12:00.');
        parseYmd(`${m[1]}-${m[2]}-${m[3]}`);
        if (+m[4] > 23 || +m[5] > 59) throw new Error('Hora no válida.');
        ms = zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], from);
      }
      const at = new Date(ms);
      const show = (z: string) => `${new Intl.DateTimeFormat('sv-SE', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)}  (${offsetLabel(z, at)})`;
      return [`Origen   ${from.padEnd(30)} ${show(from)}`, '', ...tos.map((z) => `Destino  ${z.padEnd(30)} ${show(z)}`), '', `UTC: ${at.toISOString()}`].join('\n');
    },
  },
  {
    id: 'iso8601', name: 'ISO 8601 Tool', desc: 'Valida y convierte fechas, horas, semanas, ordinales y duraciones ISO 8601.', category: 'Fecha y hora', icon: '8601',
    sample: '2026-11-26T09:30:00+01:00',
    tip: 'Admite 2026-11-26, 2026-11-26T09:30Z, 2026-W48-4, 2026-330 y duraciones como P1Y2M3DT4H5M6S.',
    run(input) {
      const s = input.trim();
      if (!s) throw new Error('Introduce un valor ISO 8601.');
      if (/^P/i.test(s)) {
        const m = /^P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(s);
        if (!m || s.toUpperCase() === 'P' || /T$/i.test(s)) throw new Error('Duración ISO 8601 no válida (ejemplo: P1Y2M3DT4H5M6S).');
        const [y, mo, w, d, h, mi, se] = m.slice(1).map((x) => (x ? Number(x.replace(',', '.')) : 0));
        const total = y * 365.2425 * 86400 + mo * 30.436875 * 86400 + w * 604800 + d * 86400 + h * 3600 + mi * 60 + se;
        return [`Duración: ${[y && `${y} años`, mo && `${mo} meses`, w && `${w} semanas`, d && `${d} días`, h && `${h} h`, mi && `${mi} min`, se && `${se} s`].filter(Boolean).join(', ')}`, `Total aproximado: ${Math.round(total).toLocaleString('es-ES')} segundos`, '(años y meses se aproximan a 365,24 y 30,44 días)'].join('\n');
      }
      let d: Date | null = null, kind = '';
      let r: RegExpExecArray | null;
      if ((r = /^(\d{4})-?W(\d{2})(?:-?([1-7]))?$/i.exec(s))) {
        const [y, w, wd] = [+r[1], +r[2], +(r[3] ?? 1)];
        const jan4 = new Date(Date.UTC(y, 0, 4));
        const mon1 = addDays(jan4, -(((jan4.getUTCDay() + 6) % 7)));
        d = addDays(mon1, (w - 1) * 7 + (wd - 1));
        if (w < 1 || w > 53 || isoWeek(d).year !== y) throw new Error(`El año ${y} no tiene semana ${w}.`);
        kind = 'fecha de semana';
      } else if ((r = /^(\d{4})-(\d{3})$/.exec(s))) {
        const y = +r[1], n = +r[2];
        if (n < 1 || n > (isLeap(y) ? 366 : 365)) throw new Error(`El año ${y} no tiene día ${n}.`);
        d = new Date(Date.UTC(y, 0, n)); kind = 'fecha ordinal';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { d = parseYmd(s); kind = 'fecha'; }
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(s)) {
        parseYmd(s.slice(0, 10));
        const t = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : s);
        if (isNaN(t.getTime())) throw new Error('Fecha y hora no válidas.');
        d = t; kind = /[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? 'fecha y hora con zona' : 'fecha y hora SIN zona (se interpreta en la hora local del navegador)';
      } else throw new Error('Formato ISO 8601 no reconocido.');
      const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      return [`✓ Válido: ${kind}`, '', `UTC:           ${d.toISOString()}`, `Fecha:         ${fmtYmd(day)}  (${DIAS[day.getUTCDay()]})`, `Semana ISO:    ${wk(day)}`, `Ordinal:       ${day.getUTCFullYear()}-${String(dayOfYear(day)).padStart(3, '0')}`, `Unix (s):      ${Math.floor(d.getTime() / 1000)}`].join('\n');
    },
  },
  {
    id: 'unix-now', name: 'Unix Time Now', desc: 'Hora Unix actual en tiempo real.', category: 'Fecha y hora', icon: '⏱',
    sample: '', noInput: true, live: 1000,
    run() {
      const n = new Date();
      return [`Unix (s):   ${Math.floor(n.getTime() / 1000)}`, `Unix (ms):  ${n.getTime()}`, `ISO (UTC):  ${n.toISOString()}`, `Local:      ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'medium' }).format(n)}`, `Zona:       ${Intl.DateTimeFormat().resolvedOptions().timeZone}`].join('\n');
    },
    tip: 'Se actualiza cada segundo mientras esta herramienta está abierta.',
  },
  {
    id: 'working-days', name: 'Working Days Calculator', desc: 'Cuenta los días laborables entre dos fechas, con festivos.', category: 'Fecha y hora', icon: '🗓',
    sample: '2026-11-02', inputLabel: 'Fecha inicial', secondLabel: 'Fecha final', secondSample: '2026-11-30',
    options: [
      { id: 'weekend', label: 'Fin de semana', type: 'select', default: 'sat-sun', choices: [{ value: 'sat-sun', label: 'Sábado y domingo' }, { value: 'fri-sat', label: 'Viernes y sábado' }, { value: 'sun', label: 'Solo domingo' }, { value: 'none', label: 'Ninguno' }] },
      { id: 'holidays', label: 'Festivos (AAAA-MM-DD, separados por comas)', type: 'text', default: '2026-11-09' },
      { id: 'includeEnd', label: 'Incluir fecha final', type: 'checkbox', default: true },
    ],
    run(input, extra, o) {
      let a = parseYmd(input), b = parseYmd(extra);
      if (a > b) [a, b] = [b, a];
      if ((b.getTime() - a.getTime()) / DAY > 366 * 100) throw new Error('Rango demasiado grande (máx. 100 años).');
      const off = { 'sat-sun': [0, 6], 'fri-sat': [5, 6], sun: [0], none: [] }[String(o.weekend)] ?? [0, 6];
      const hol = new Set(String(o.holidays).split(/[,;\s]+/).filter(Boolean).map((h) => fmtYmd(parseYmd(h))));
      let work = 0, weekend = 0, holiday = 0, total = 0;
      for (let t = a.getTime(); t <= b.getTime() - (o.includeEnd ? 0 : DAY); t += DAY) {
        const d = new Date(t);
        total++;
        if (off.includes(d.getUTCDay())) weekend++;
        else if (hol.has(fmtYmd(d))) holiday++;
        else work++;
      }
      return [`Días laborables: ${work}`, '', `Días naturales:   ${total}`, `Fines de semana:  ${weekend}`, `Festivos (en día laborable): ${holiday}`].join('\n');
    },
  },
  {
    id: 'leap-year', name: 'Leap Year Checker', desc: 'Comprueba años bisiestos o lista los de un rango.', category: 'Fecha y hora', icon: '366',
    sample: '2028',
    tip: 'Escribe un año (2028), un rango (2000-2040) o déjalo vacío para el año actual.',
    run(input) {
      const s = input.trim() || String(new Date().getFullYear());
      const r = /^(\d{1,4})\s*[-–]\s*(\d{1,4})$/.exec(s);
      if (r) {
        const [a, b] = [Math.min(+r[1], +r[2]), Math.max(+r[1], +r[2])];
        if (b - a > 2000) throw new Error('Rango demasiado grande (máx. 2000 años).');
        const list: number[] = [];
        for (let y = Math.max(a, 1); y <= b; y++) if (isLeap(y)) list.push(y);
        return `${list.length} años bisiestos entre ${a} y ${b}:\n\n${list.join(', ')}`;
      }
      if (!/^\d{1,4}$/.test(s) || +s < 1) throw new Error('Introduce un año entre 1 y 9999.');
      const y = +s;
      const why = y % 400 === 0 ? 'divisible entre 400' : y % 100 === 0 ? 'divisible entre 100 pero no entre 400' : y % 4 === 0 ? 'divisible entre 4 y no entre 100' : 'no es divisible entre 4';
      let next = y + 1; while (!isLeap(next)) next++;
      let prev = y - 1; while (prev > 0 && !isLeap(prev)) prev--;
      return [`${y}: ${isLeap(y) ? '✓ es bisiesto' : '✗ no es bisiesto'}  (${why})`, `Días del año: ${isLeap(y) ? 366 : 365}  ·  Febrero: ${isLeap(y) ? 29 : 28} días`, `Bisiesto anterior: ${prev > 0 ? prev : '–'}  ·  siguiente: ${next}`].join('\n');
    },
  },
];
export default tools;
