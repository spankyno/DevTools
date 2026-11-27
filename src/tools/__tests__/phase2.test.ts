import { domainToASCII } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toolById } from '../registry';
import type { Opts } from '../types';
import { punyDecode, punyEncode } from '../lib/punycode';
import { compressIPv6, expandIPv6, parseIPv6 } from '../lib/ip';
import { isoWeek, parseYmd, zonedTimeToUtc } from '../lib/dates';

const defaults = (id: string): Opts => Object.fromEntries((toolById.get(id)!.options ?? []).map((o) => [o.id, o.default]));
const run = async (id: string, input = '', extra = '', opts: Opts = {}) => {
  const t = toolById.get(id);
  if (!t) throw new Error('No existe ' + id);
  return t.run(input, extra, { ...defaults(id), ...opts });
};
const fails = (id: string, input = '', extra = '', opts: Opts = {}) => expect(run(id, input, extra, opts)).rejects.toThrow();

describe('texto', () => {
  it('text-counter', async () => {
    const out = await run('text-counter', 'Hola mundo.\nOtra línea!\n\nTercero');
    expect(out).toMatch(/Palabras:\s+5/);
    expect(out).toMatch(/Líneas:\s+4/);
    expect(out).toMatch(/Párrafos:\s+2/);
    expect(await run('text-counter', 'ñ👋')).toMatch(/Caracteres:\s+2[\s\S]*Bytes \(UTF-8\):\s+6/);
  });
  it('text-sorter', async () => {
    expect(await run('text-sorter', 'b\nA\nc', '', { order: 'asc' })).toBe('A\nb\nc');
    expect(await run('text-sorter', 'f10\nf2\nf1', '', { order: 'natural' })).toBe('f1\nf2\nf10');
    expect(await run('text-sorter', 'aaa\nb\ncc', '', { order: 'length' })).toBe('b\ncc\naaa');
    expect(await run('text-sorter', 'a\nb\nc', '', { order: 'reverse' })).toBe('c\nb\na');
    const sh = ((await run('text-sorter', '1\n2\n3\n4\n5', '', { order: 'shuffle' })) as string).split('\n').sort();
    expect(sh).toEqual(['1', '2', '3', '4', '5']);
  });
  it('dedupe', async () => {
    expect(await run('dedupe', 'a\nb\na\nB', '', { mode: 'remove' })).toBe('a\nb\nB');
    expect(await run('dedupe', 'a\nb\na\nB', '', { mode: 'remove', ignoreCase: true })).toBe('a\nb');
    expect(await run('dedupe', 'a\nb\na\nc', '', { mode: 'unique' })).toBe('b\nc');
    expect(await run('dedupe', 'a\nb\na\na', '', { mode: 'report' })).toBe('3×  a');
    expect(await run('dedupe', 'a\nb', '', { mode: 'report' })).toContain('No hay líneas repetidas');
  });
  it('line-breaks, whitespace, reverser', async () => {
    expect(await run('line-breaks', 'a\r\nb\rc\nd', '', { to: 'crlf' })).toBe('a\r\nb\r\nc\r\nd');
    expect(await run('line-breaks', 'a\nb', '', { to: 'space' })).toBe('a b');
    expect(await run('whitespace', '  a   b  \n\n  c ')).toBe('a b\nc');
    expect(await run('whitespace', ' a \n b ', '', { all: true })).toBe('ab');
    expect(await run('text-reverser', 'abc', '', { mode: 'chars' })).toBe('cba');
    expect(await run('text-reverser', 'uno dos tres', '', { mode: 'words' })).toBe('tres dos uno');
    expect(await run('text-reverser', 'a\nb', '', { mode: 'lines' })).toBe('b\na');
  });
  it('slug', async () => {
    expect(await run('slug', '¡Cómo estás, Niño! Ñandú & café')).toBe('como-estas-nino-nandu-cafe');
    expect(await run('slug', 'Hola Mundo', '', { sep: '_', lower: false })).toBe('Hola_Mundo');
    expect(await run('slug', 'uno dos tres cuatro', '', { max: 9 })).toBe('uno-dos-t');
  });
  it('string-escape ida y vuelta', async () => {
    const s = 'a"b\'c\\d\ne\tf';
    for (const format of ['json', 'js', 'html', 'xml', 'regex', 'sql', 'csv']) {
      const esc = (await run('string-escape', s, '', { format, mode: 'escape' })) as string;
      const back = await run('string-escape', esc, '', { format, mode: 'unescape' });
      if (['html', 'xml', 'sql', 'csv', 'regex', 'json', 'js'].includes(format)) expect(back, format).toBe(s);
    }
    expect(await run('string-escape', '<a href="x">&</a>', '', { format: 'html' })).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(await run('string-escape', "O'Neil", '', { format: 'sql' })).toBe("O''Neil");
    expect(await run('string-escape', 'a.b*c', '', { format: 'regex' })).toBe('a\\.b\\*c');
    await fails('string-escape', 'a"b', '', { format: 'json', mode: 'unescape' });
  });
  it('text-extractor', async () => {
    const t = 'a@b.com, c.d@e.org. https://x.com/p?q=1. Tel +34 612 345 678. IP 10.0.0.1 y 999.1.1.1. #uno @user 2026-11-26 5/3/2026';
    expect(await run('text-extractor', t, '', { type: 'emails' })).toContain('2 resultado(s)');
    expect(await run('text-extractor', t, '', { type: 'urls' })).toContain('https://x.com/p?q=1');
    expect(await run('text-extractor', t, '', { type: 'urls' })).not.toContain('q=1.');
    expect(await run('text-extractor', t, '', { type: 'phones' })).toContain('+34 612 345 678');
    const ips = (await run('text-extractor', t, '', { type: 'ipv4' })) as string;
    expect(ips).toContain('10.0.0.1');
    expect(ips).not.toContain('999.1.1.1');
    expect(await run('text-extractor', t, '', { type: 'hashtags' })).toContain('#uno');
    expect(await run('text-extractor', t, '', { type: 'mentions' })).toContain('@user');
    expect(await run('text-extractor', t, '', { type: 'dates' })).toContain('2 resultado(s)');
    expect(await run('text-extractor', 'nada', '', { type: 'emails' })).toContain('No se encontró');
  });
  it('lorem y random-number', async () => {
    expect(((await run('lorem', '', '', { unit: 'words', count: 7, classic: false })) as string).split(' ')).toHaveLength(7);
    expect(((await run('lorem', '', '', { unit: 'paragraphs', count: 3 })) as string).split('\n\n')).toHaveLength(3);
    expect(await run('lorem', '', '', { unit: 'paragraphs', count: 1, classic: true })).toMatch(/^Lorem ipsum dolor sit amet, consectetur adipiscing elit\./);
    const nums = ((await run('random-number', '', '', { min: 1, max: 10, count: 10, unique: true, sort: true })) as string).split('\n').map(Number);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await fails('random-number', '', '', { min: 1, max: 3, count: 5, unique: true });
    for (const n of ((await run('random-number', '', '', { min: -5, max: 5, count: 200 })) as string).split('\n').map(Number)) { expect(n).toBeGreaterThanOrEqual(-5); expect(n).toBeLessThanOrEqual(5); }
    const dec = ((await run('random-number', '', '', { min: 0, max: 1, count: 50, integer: false })) as string).split('\n').map(Number);
    expect(dec.some((x) => !Number.isInteger(x))).toBe(true);
  });
  it('html-entities y unicode', async () => {
    expect(await run('html-entities', 'é € < &', '', { mode: 'named' })).toBe('&eacute; &euro; &lt; &amp;');
    expect(await run('html-entities', 'é😀', '', { mode: 'numeric' })).toBe('&#233;&#128512;');
    expect(await run('html-entities', '&eacute;&#233;&#xE9;&amp;lt;&desconocida;', '', { mode: 'decode' })).toBe('ééé&lt;&desconocida;');
    expect(await run('unicode', 'A😀', '', { mode: 'escapes' })).toBe('A\\u{1F600}');
    expect(await run('unicode', 'ñ', '', { mode: 'escapes' })).toBe('\\u00F1');
    expect(await run('unicode', 'U+1F600 \\u00e1 \\u{1F4A9} &#128512;', '', { mode: 'decode' })).toBe('😀 á 💩 😀');
    expect(await run('unicode', '€', '', { mode: 'table' })).toContain('E2 82 AC');
  });
  it('password-strength', async () => {
    const weak = (await run('password-strength', 'Tr0ub4dor&3')) as string;
    expect(weak).toContain('Débil');
    expect(await run('password-strength', 'password')).toContain('Muy débil');
    expect(await run('password-strength', '123456')).toContain('Muy débil');
    expect(await run('password-strength', 'Kq7#vL2$mXp9!zRt4Wb')).toMatch(/Muy fuerte|Fuerte/);
    expect(await run('password-strength', 'abcd1111')).toContain('secuencia');
    await fails('password-strength', '');
  });
});

describe('conversión y cálculo', () => {
  it('number-base', async () => {
    expect(await run('number-base', '255')).toContain('Hexadecimal   FF');
    expect(await run('number-base', '0xff')).toContain('Decimal       255');
    expect(await run('number-base', '1010', '', { from: '2' })).toContain('Decimal       10');
    expect(await run('number-base', 'ff', '', { from: '16' })).toContain('Binario       1111 1111');
    expect(await run('number-base', '-0b101')).toContain('Decimal       -5');
    expect(await run('number-base', String(2n ** 70n))).toContain(`Decimal       ${2n ** 70n}`);
    await fails('number-base', '12', '', { from: '2' });
    await fails('number-base', '');
  });
  it('text-binary ida y vuelta', async () => {
    for (const fmt of ['hex', 'bin', 'oct', 'dec']) {
      const enc = (await run('text-binary', 'Hola ñ€', '', { mode: 'encode', fmt })) as string;
      expect(await run('text-binary', enc, '', { mode: 'decode', fmt }), fmt).toBe('Hola ñ€');
    }
    expect(await run('text-binary', 'A', '', { fmt: 'bin' })).toBe('01000001');
    expect(await run('text-binary', '48656c6c6f', '', { mode: 'decode', fmt: 'hex' })).toBe('Hello');
    await fails('text-binary', 'zz', '', { mode: 'decode', fmt: 'hex' });
  });
  it('byte-converter y data-transfer', async () => {
    expect(await run('byte-converter', '1 KiB')).toMatch(/Bytes\s+1024/);
    expect(await run('byte-converter', '8 Mb')).toMatch(/Bytes\s+1000000\n/);
    expect(await run('byte-converter', '1 GB')).toMatch(/MB\s+1000\n/);
    expect(await run('byte-converter', '1 GiB')).toMatch(/MiB\s+1024\n/);
    expect(await run('data-transfer', '1 GB', '8 Mbps')).toContain('Segundos:   1000');
    expect(await run('data-transfer', '100 MB', '10 MB/s')).toContain('Segundos:   10');
    expect(await run('data-transfer', '1 GB', '8 Mbps', { eff: 50 })).toContain('Segundos:   2000');
    await fails('byte-converter', 'mucho');
    await fails('data-transfer', '1 GB', '100 Mb');
  });
  it('percentage', async () => {
    expect(await run('percentage', '15', '200', { mode: 'of' })).toBe('15 % de 200 = 30');
    expect(await run('percentage', '50', '200', { mode: 'what' })).toBe('50 es el 25 % de 200');
    expect(await run('percentage', '100', '150', { mode: 'change' })).toContain('aumento del 50 %');
    expect(await run('percentage', '200', '100', { mode: 'change' })).toContain('descenso del 50 %');
    expect(await run('percentage', '10', '50', { mode: 'add' })).toContain('= 55');
    expect(await run('percentage', '20', '50', { mode: 'sub' })).toContain('= 40');
    await fails('percentage', '1', '0', { mode: 'what' });
    await fails('percentage', 'a', '1');
  });
  it('unit-converter', async () => {
    expect(await run('unit-converter', '100 C')).toContain('212 °F');
    expect(await run('unit-converter', '32 F')).toContain('0 °C');
    expect(await run('unit-converter', '0 K')).toContain('-273.15 °C');
    expect(await run('unit-converter', '1 mi')).toMatch(/1\.609344\s+km/);
    expect(await run('unit-converter', '1 h')).toMatch(/3600\s+s/);
    expect(await run('unit-converter', '36 km/h')).toMatch(/10\s+m\/s/);
    expect(await run('unit-converter', '1 ha')).toMatch(/10000\s+m2/);
    await fails('unit-converter', '5 parsecs');
    await fails('unit-converter', '-300 C');
  });
  it('css-units, aspect-ratio, dpi', async () => {
    expect(await run('css-units', '1.5 rem')).toMatch(/24\s+px/);
    expect(await run('css-units', '50 vw', '', { vw: 1000 })).toMatch(/500\s+px/);
    expect(await run('css-units', '10 %', '', { parent: 300 })).toMatch(/30\s+px/);
    expect(await run('css-units', '96 px')).toMatch(/1\s+in/);
    expect(await run('aspect-ratio', '1920x1080', 'ancho=1280')).toContain('alto = 720');
    expect(await run('aspect-ratio', '1920x1080', 'alto=540')).toContain('ancho = 960');
    expect(await run('aspect-ratio', '1000x1000')).toContain('Proporción:  1:1');
    expect(await run('aspect-ratio', '1080x1920')).toContain('vertical');
    expect(await run('dpi-ppi', '1920x1080', '15.6')).toContain('141.2 PPI');
    expect(await run('dpi-ppi', '3000x2000')).toContain('6.00 MP');
    await fails('aspect-ratio', '0x10');
  });
  it('color-temperature', async () => {
    expect(await run('color-temperature', '6500')).toMatch(/#ff[0-9a-f]{4}|#ffff|#fff/);
    expect(await run('color-temperature', '1900')).toContain('vela');
    await fails('color-temperature', '500');
  });
  it('punycode coincide con node:url', async () => {
    for (const d of ['münchen.de', 'español.es', '日本語.jp', 'bücher.example', 'пример.рф', 'ñandú.com']) {
      const ascii = (await run('punycode', d, '', { mode: 'toAscii' })) as string;
      expect(ascii, d).toBe(domainToASCII(d));
      expect(await run('punycode', ascii, '', { mode: 'toUnicode' }), d).toBe(d);
    }
    expect(punyEncode('mañana')).toBe('maana-pta');
    expect(punyDecode('maana-pta')).toBe('mañana');
    expect(await run('punycode', 'ejemplo.com', '', { mode: 'toAscii' })).toBe('ejemplo.com');
  });
});

describe('fechas', () => {
  it('date-calc', async () => {
    const r = async (d: string, op: string, amount: number, unit: string) => ((await run('date-calc', d, '', { op, amount, unit })) as string).match(/Resultado:\s+(\S+)/)![1];
    expect(await r('2026-01-31', 'add', 1, 'months')).toBe('2026-02-28');
    expect(await r('2028-02-29', 'add', 1, 'years')).toBe('2029-02-28');
    expect(await r('2026-03-31', 'sub', 1, 'months')).toBe('2026-02-28');
    expect(await r('2026-12-31', 'add', 1, 'days')).toBe('2027-01-01');
    expect(await r('2026-11-26', 'add', 2, 'weeks')).toBe('2026-12-10');
    expect(await r('26/11/2026', 'sub', 26, 'days')).toBe('2026-10-31');
    await fails('date-calc', '2026-02-30');
    await fails('date-calc', 'ayer');
  });
  it('date-diff', async () => {
    expect(await run('date-diff', '2026-01-15', '2026-11-26')).toContain('0 años, 10 meses, 11 días');
    expect(await run('date-diff', '2026-01-31', '2026-03-01')).toContain('0 años, 1 meses, 1 días');
    expect(await run('date-diff', '2024-02-29', '2026-02-28')).toContain('2 años, 0 meses, 0 días');
    expect(await run('date-diff', '2026-03-31', '2026-04-30')).toContain('0 años, 1 meses, 0 días');
    expect(await run('date-diff', '2026-01-31', '2026-02-28')).toContain('0 años, 1 meses, 0 días');
    expect(await run('date-diff', '2026-02-01', '2026-02-28')).toContain('0 años, 0 meses, 27 días');
    expect(await run('date-diff', '2026-05-15', '2026-05-15')).toContain('Son la misma fecha');
    expect(await run('date-diff', '2026-01-01', '2027-01-01')).toContain('Días totales: 365');
    expect(await run('date-diff', '2026-11-26', '2026-01-15')).toContain('inicial es posterior');
  });
  it('semana ISO y fechas', async () => {
    expect(isoWeek(parseYmd('2026-12-31'))).toEqual({ year: 2026, week: 53, weekday: 4 });
    expect(isoWeek(parseYmd('2027-01-01'))).toEqual({ year: 2026, week: 53, weekday: 5 });
    expect(isoWeek(parseYmd('2024-12-30'))).toEqual({ year: 2025, week: 1, weekday: 1 });
    expect(isoWeek(parseYmd('2026-01-01'))).toEqual({ year: 2026, week: 1, weekday: 4 });
  });
  it('iso8601', async () => {
    expect(await run('iso8601', '2026-12-31')).toContain('2026-W53-4');
    expect(await run('iso8601', '2026-W53-4')).toContain('Fecha:         2026-12-31');
    expect(await run('iso8601', '2026W011')).toContain('2025-12-29');
    expect(await run('iso8601', '2026-365')).toContain('2026-12-31');
    expect(await run('iso8601', '2026-11-26T09:30:00+01:00')).toContain('2026-11-26T08:30:00.000Z');
    expect(await run('iso8601', '2026-11-26T09:30:00Z')).toContain('2026-11-26T09:30:00.000Z');
    const dur = (await run('iso8601', 'P1DT12H')) as string;
    expect(dur).toContain('129.600');
    expect(await run('iso8601', 'PT90M')).toContain('5400');
    await fails('iso8601', '2027-W53-1');
    await fails('iso8601', '2026-366');
    await fails('iso8601', 'P');
    await fails('iso8601', 'PT');
    await fails('iso8601', '26/11/2026');
    await fails('iso8601', '2026-13-01');
  });
  it('timezone con horario de verano', async () => {
    expect(new Date(zonedTimeToUtc(2026, 11, 26, 12, 0, 'Europe/Madrid')).toISOString()).toBe('2026-11-26T11:00:00.000Z');
    expect(new Date(zonedTimeToUtc(2026, 7, 1, 12, 0, 'Europe/Madrid')).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(new Date(zonedTimeToUtc(2026, 7, 1, 12, 0, 'America/New_York')).toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(new Date(zonedTimeToUtc(2026, 1, 1, 0, 0, 'Asia/Kolkata')).toISOString()).toBe('2025-12-31T18:30:00.000Z');
    const out = (await run('timezone', '2026-07-01 12:00', '', { from: 'Europe/Madrid', to: 'UTC, America/New_York' })) as string;
    expect(out).toContain('2026-07-01 10:00');
    expect(out).toContain('2026-07-01 06:00');
    await fails('timezone', '2026-07-01 12:00', '', { from: 'Mars/Olympus' });
    await fails('timezone', 'mañana a las 5');
  });
  it('working-days', async () => {
    const wd = async (a: string, b: string, o: Opts = {}) => ((await run('working-days', a, b, { holidays: '', ...o })) as string).match(/laborables: (\d+)/)![1];
    expect(await wd('2026-11-02', '2026-11-06')).toBe('5');
    expect(await wd('2026-11-02', '2026-11-06', { includeEnd: false })).toBe('4');
    expect(await wd('2026-11-02', '2026-11-08')).toBe('5');
    expect(await wd('2026-11-02', '2026-11-06', { holidays: '2026-11-04' })).toBe('4');
    expect(await wd('2026-11-02', '2026-11-08', { weekend: 'none' })).toBe('7');
    expect(await wd('2026-11-06', '2026-11-02')).toBe('5');
  });
  it('leap-year', async () => {
    expect(await run('leap-year', '1900')).toContain('no es bisiesto');
    expect(await run('leap-year', '2000')).toContain('✓ es bisiesto');
    expect(await run('leap-year', '2100')).toContain('✗');
    expect(await run('leap-year', '2000-2012')).toContain('2000, 2004, 2008, 2012');
    expect(await run('leap-year', '2026')).toContain('siguiente: 2028');
    await fails('leap-year', 'abc');
  });
  it('unix-now', async () => {
    expect(await run('unix-now')).toMatch(/Unix \(s\):\s+\d{10}/);
    expect(toolById.get('unix-now')!.live).toBe(1000);
  });
});

describe('red', () => {
  it('IPv6', () => {
    expect(expandIPv6(parseIPv6('2001:db8::1')!)).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(compressIPv6(parseIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')!)).toBe('2001:db8::1');
    expect(compressIPv6(parseIPv6('::')!)).toBe('::');
    expect(compressIPv6(parseIPv6('0:0:0:0:0:0:0:1')!)).toBe('::1');
    expect(compressIPv6(parseIPv6('1:0:0:2:0:0:0:3')!)).toBe('1:0:0:2::3');
    expect(compressIPv6(parseIPv6('1:0:2:3:4:5:6:7')!)).toBe('1:0:2:3:4:5:6:7');
    expect(compressIPv6(parseIPv6('::ffff:192.168.1.1')!)).toBe('::ffff:c0a8:101');
    expect(parseIPv6('[::1]')).not.toBeNull();
    expect(parseIPv6('fe80::1%eth0')).not.toBeNull();
    for (const bad of ['1::2::3', '12345::1', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', ':1:2:3:4:5:6:7', '192.168.1.1']) expect(parseIPv6(bad), bad).toBeNull();
  });
  it('ip-converter e ip-info', async () => {
    expect(await run('ip-converter', '192.168.1.10')).toContain('Decimal       3232235786');
    expect(await run('ip-converter', '3232235786')).toContain('IPv4  192.168.1.10');
    expect(await run('ip-converter', '1.2.3.4')).toContain('0x01020304');
    expect(await run('ip-converter', 'hola')).toContain('✗');
    expect(await run('ip-converter', '256.1.1.1')).toContain('✗');
    const cls = async (ip: string) => (await run('ip-info', ip)) as string;
    expect(await cls('10.1.2.3')).toContain('Privada');
    expect(await cls('172.16.0.1')).toContain('Privada');
    expect(await cls('172.31.255.255')).toContain('Privada');
    expect(await cls('172.32.0.1')).toContain('Pública');
    expect(await cls('192.168.0.1')).toContain('Privada');
    expect(await cls('127.0.0.1')).toContain('Loopback');
    expect(await cls('169.254.1.1')).toContain('Link-local');
    expect(await cls('100.64.0.1')).toContain('CGNAT');
    expect(await cls('224.0.0.1')).toContain('Multicast');
    expect(await cls('8.8.8.8')).toContain('Pública');
    expect(await cls('203.0.113.9')).toContain('Documentación');
    expect(await cls('255.255.255.255')).toContain('Broadcast');
    expect(await cls('::1')).toContain('Loopback');
    expect(await cls('fe80::abcd')).toContain('Link-local');
    expect(await cls('fd12::1')).toContain('Local única');
    expect(await cls('2606:4700::1111')).toContain('Unicast global');
    expect(await cls('::ffff:10.0.0.1')).toContain('IPv4 mapeada (10.0.0.1)');
  });
  it('query-builder', async () => {
    expect(await run('query-builder', 'a=1\nb=x y', '', { mode: 'build' })).toBe('a=1&b=x%20y');
    expect(await run('query-builder', 'a=1', 'https://x.com/p?z=0')).toBe('https://x.com/p?z=0&a=1');
    expect(await run('query-builder', 'a=x y', '', { plus: true })).toBe('a=x+y');
    expect(await run('query-builder', 'k=a=b', '', {})).toBe('k=a%3Db');
    const parsed = (await run('query-builder', 'https://x.com/p?tag=a&tag=b&q=hola%20mundo#h', '', { mode: 'parse' })) as string;
    expect(parsed).toContain('q = hola mundo');
    expect(JSON.parse(parsed.slice(parsed.indexOf('{')))).toEqual({ tag: ['a', 'b'], q: 'hola mundo' });
  });
  it('user-agent', async () => {
    const ua = async (s: string) => (await run('user-agent', s)) as string;
    const iphone = await ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1');
    expect(iphone).toContain('Safari 17.2'); expect(iphone).toContain('iOS 17.2'); expect(iphone).toContain('Móvil'); expect(iphone).toContain('WebKit');
    const android = await ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
    expect(android).toContain('Android 14'); expect(android).toContain('Móvil'); expect(android).toContain('Blink');
    const edge = await ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91');
    expect(edge).toContain('Microsoft Edge 120.0.2210.91');
    const ff = await ua('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0');
    expect(ff).toContain('Firefox 121.0'); expect(ff).toContain('Linux'); expect(ff).toContain('Gecko');
    expect(await ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15')).toContain('macOS 10.15.7');
    expect(await ua('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36')).toContain('Tablet');
    expect(await ua('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toContain('Bot');
    expect(await ua('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36')).toContain('Samsung Internet 23.0');
  });
  it('http-headers', async () => {
    const out = (await run('http-headers', 'Cache-Control: no-store, max-age=60\nSet-Cookie: a=1; Secure; HttpOnly; SameSite=Lax\nX-Powered-By: Express 4.18\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true')) as string;
    expect(out).toContain('no-store: no se guarda');
    expect(out).toContain('max-age=60');
    expect(out).not.toContain('Cookie «a»');
    expect(out).toContain('X-Powered-By revela la versión');
    expect(out).toContain('CORS: «*» junto a credenciales');
    const full = (await run('http-headers', 'Strict-Transport-Security: max-age=63072000; includeSubDomains\nContent-Security-Policy: default-src \'self\'; frame-ancestors \'none\'\nX-Content-Type-Options: nosniff\nReferrer-Policy: no-referrer\nPermissions-Policy: camera=()')) as string;
    expect(full).toContain('✓ Sin avisos de seguridad');
    await fails('http-headers', 'esto no son cabeceras');
  });
  it('mime, ports, dns, status', async () => {
    expect(await run('mime', 'png')).toBe('.png  →  image/png');
    expect(await run('mime', 'archivo.tar.gz')).toBe('.gz  →  application/gzip');
    expect(await run('mime', 'image/jpeg')).toContain('.jpg, .jpeg');
    expect(await run('mime', 'xyz')).toContain('octet-stream');
    expect(await run('ports', '5432')).toContain('PostgreSQL');
    expect(await run('ports', 'redis')).toContain('6379');
    expect(await run('ports', '1')).toContain('Sin resultados');
    expect(((await run('ports', '')) as string).split('\n').length).toBeGreaterThan(40);
    expect(await run('dns-ref', 'caa')).toContain('letsencrypt.org');
    expect(await run('dns-ref', 'zzz')).toBe('Sin resultados.');
    expect(await run('status', '418')).toContain("I'm a teapot");
    expect(((await run('status', '4xx')) as string).match(/^4\d\d /gm)!.length).toBeGreaterThan(20);
    expect(await run('status', 'timeout')).toContain('504');
    expect(await run('status', '299')).toContain('no está en el catálogo');
  });
});

describe('diseño y web', () => {
  it('color y paleta', async () => {
    expect(await run('color', 'red')).toContain('HEX   #ff0000');
    expect(await run('color', 'hsl(120, 100%, 25%)')).toContain('#008000');
    expect(await run('color', 'rgb(0, 0, 255)')).toContain('#0000ff');
    expect(await run('color', '0 128 0')).toContain('#008000');
    expect(await run('color', '#abc')).toContain('#aabbcc');
    expect(await run('color', '#ff0000')).toContain('hsl(0, 100%, 50%)');
    expect(await run('color', '#ff0000')).toContain('hsv(0, 100%, 100%)');
    expect(await run('color', '#ff0000')).toContain('cmyk(0%, 100%, 100%, 0%)');
    expect(await run('color', '#000000')).toContain('cmyk(0%, 0%, 0%, 100%)');
    expect(await run('color', '#ffffff')).toContain('cmyk(0%, 0%, 0%, 0%)');
    await fails('color', 'nope');
    expect(await run('color-palette', '#ff0000', '', { scheme: 'complementary' })).toContain('#00ffff');
    expect(((await run('color-palette', '#ff0000', '', { scheme: 'tetradic' })) as string).split('\n')).toHaveLength(4);
    expect(((await run('color-palette', '#336699', '', { scheme: 'mono' })) as string).split('\n')).toHaveLength(6);
    expect(await run('contrast', '#000000', '#ffffff')).toContain('21.00:1');
    expect(await run('contrast', '#777777', '#ffffff')).toContain('4.48:1');
  });
  it('generadores CSS', async () => {
    expect(await run('box-shadow', '', '', { x: 2, y: 4, blur: 8, spread: 1, color: '#ff0000', opacity: 50, inset: true })).toBe('box-shadow: inset 2px 4px 8px 1px rgba(255, 0, 0, 0.5);');
    expect(await run('border-radius', '', '', { tl: 8, tr: 8, br: 8, bl: 8 })).toBe('border-radius: 8px;');
    expect(await run('border-radius', '', '', { tl: 0, tr: 50, br: 50, bl: 0, unit: '%' })).toBe('border-radius: 0 50% 50% 0;');
    expect(await run('flexbox', '', '', { direction: 'column', justify: 'center', gap: 4 })).toContain('flex-direction: column;');
    expect(await run('grid', '', '', { cols: '200px 1fr', rows: 'auto', gap: 5 })).toContain('grid-template-columns: 200px 1fr;');
    await fails('grid', '', '', { cols: 'red; background: url(x)' });
    expect(await run('css-filter', '', '', { blur: 2, brightness: 120, sepia: 30 })).toBe('filter: blur(2px) brightness(120%) sepia(30%);');
    expect(await run('css-filter')).toBe('filter: none;');
    const prev = toolById.get('flexbox')!.preview!('', '', '', { ...defaults('flexbox'), items: 3 });
    expect(prev).toContain('display:flex');
    expect((prev.match(/border-radius:6px/g) ?? []).length).toBe(3);
  });
  it('specificity', async () => {
    const sp = async (s: string) => ((await run('specificity', s)) as string).split('\n')[0].match(/^\((\d+), (\d+), (\d+)\)/)!.slice(1).join(',');
    expect(await sp('*')).toBe('0,0,0');
    expect(await sp('li')).toBe('0,0,1');
    expect(await sp('ul li')).toBe('0,0,2');
    expect(await sp('ul ol li.red')).toBe('0,1,3');
    expect(await sp('#x34y')).toBe('1,0,0');
    expect(await sp('li:first-child')).toBe('0,1,1');
    expect(await sp('p::first-line')).toBe('0,0,2');
    expect(await sp('a[href^="http"]')).toBe('0,1,1');
    expect(await sp('a:not(#x)')).toBe('1,0,1');
    expect(await sp(':is(#a, .b) p')).toBe('1,0,1');
    expect(await sp(':where(#a, .b) p')).toBe('0,0,1');
    expect(await sp(':nth-child(2n+1 of .x)')).toBe('0,2,0');
    expect(await sp('div > p + span ~ em')).toBe('0,0,4');
    expect(await sp('a:hover:focus')).toBe('0,2,1');
    expect(await sp('input[type="text"]:required')).toBe('0,2,1');
    expect(await sp('a[title="a.b #c"]')).toBe('0,1,1');
    const multi = (await run('specificity', 'a, .b, #c')) as string;
    expect(multi).toContain('Gana: #c');
    await fails('specificity', '');
  });
  it('css-minify', async () => {
    expect(await run('css-minify', 'a { color : red ; }')).toContain('a{color:red}');
    expect(await run('css-minify', '.a :hover { color: red }')).toContain('.a :hover{color:red}');
    expect(await run('css-minify', '@media (min-width: 600px) { a :hover { color: red } }')).toContain('@media (min-width:600px){a :hover{color:red}}');
    expect(await run('css-minify', 'a{width:calc(100% - 2rem);margin:0 auto}')).toContain('calc(100% - 2rem)');
    expect(await run('css-minify', 'li:nth-child(2n + 1) + li{x:y}')).toContain('li:nth-child(2n + 1)+li{x:y}');
    expect(await run('css-minify', '/* x */a{content:"a  b ; c"}')).toContain('content:"a  b ; c"');
    expect(await run('css-minify', '/*! keep */ a{b:c}')).toContain('/*! keep */');
    expect(await run('css-minify', 'a{background:url("a b.png")}')).toContain('url("a b.png")');
    expect(await run('css-minify', 'a > b + c ~ d { x: y }')).toContain('a>b+c~d{x:y}');
    const once = ((await run('css-minify', 'a { b : c ; }\n\n.d  >  .e { f : g h }')) as string).split('\n\n/*')[0];
    expect(((await run('css-minify', once)) as string).split('\n\n/*')[0]).toBe(once);
  });
  it('svg', async () => {
    const ph = (await run('svg-placeholder', '', '', { w: 100, h: 50, bg: 'red', fg: '#fff', text: '<script>alert(1)</script>' })) as string;
    expect(ph).not.toContain('<script>');
    expect(ph).toContain('&lt;script&gt;');
    expect(ph).toContain('fill="#ff0000"');
    expect(ph).toContain('viewBox="0 0 100 50"');
    expect(await run('svg-placeholder', '', '', { w: 300, h: 200, text: '' })).toContain('>300×200<');
    const uri = (await run('svg-datauri', '<svg viewBox="0 0 1 1"><rect width="1" height="1" fill="#f00"/></svg>', '', { mode: 'utf8' })) as string;
    const first = uri.split('\n')[0];
    expect(first.startsWith('data:image/svg+xml,')).toBe(true);
    expect(first).not.toMatch(/[<>"#]/);
    expect(first).toContain("xmlns='http://www.w3.org/2000/svg'");
    const b64 = ((await run('svg-datauri', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', '', { mode: 'base64' })) as string).split('\n')[0];
    expect(Buffer.from(b64.split(',')[1], 'base64').toString()).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await fails('svg-datauri', '<div></div>');
  });
  it('image-tool lee dimensiones sin DOM', async () => {
    const sample = toolById.get('image-tool')!.sample;
    const out = (await run('image-tool', sample)) as string;
    expect(out).toContain('image/png');
    expect(out).toContain('2 × 2 px');
    expect(out).toContain('proporción 1:1');
    expect(await run('image-tool', sample.split(',')[1])).toContain('2 × 2 px');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
    expect(await run('image-tool', 'data:image/jpeg;base64,' + jpeg)).toContain('200 × 100 px');
    const gif = Buffer.from('GIF89a', 'latin1');
    const gifFull = Buffer.concat([gif, Buffer.from([10, 0, 20, 0, 0, 0, 0, 0, 0, 0])]).toString('base64');
    expect(await run('image-tool', gifFull)).toContain('image/gif');
    expect(await run('image-tool', gifFull)).toContain('10 × 20 px');
    await fails('image-tool', 'esto no es una imagen!!');
    const html = toolById.get('image-tool')!.preview!(out, '', '', {});
    expect(html).toContain('<img');
  });
  it('data-uri y meta-tags', async () => {
    expect(await run('data-uri', 'a b', '', { mime: 'text/plain', b64: false })).toBe('data:text/plain;charset=utf-8,a%20b');
    expect(await run('data-uri', 'hola', '', { mime: 'text/plain', b64: true })).toBe('data:text/plain;base64,aG9sYQ==');
    const m = (await run('meta-tags', 'titulo: Uno "dos" <tres>\ndescripcion: ' + 'x'.repeat(170))) as string;
    expect(m).toContain('<title>Uno &quot;dos&quot; &lt;tres&gt;</title>');
    expect(m).toContain('twitter:card" content="summary"');
    expect(m).toContain('descripción tiene 170');
    expect(m).toContain('Sin imagen');
    expect(await run('meta-tags', 'titulo: A\nimagen: https://x/y.png')).toContain('summary_large_image');
    await fails('meta-tags', 'descripcion: sin título');
  });
});

describe('desarrollo', () => {
  it('git-cheatsheet y git-builder', async () => {
    expect(await run('git-cheatsheet', 'reflog')).toContain('git reflog');
    expect(await run('git-cheatsheet', 'zzzz')).toBe('Sin resultados.');
    const gb = async (action: string, a: string, b = '', variant = 'default') => (await run('git-builder', a, b, { action, variant })) as string;
    expect(await gb('commit', 'fix: bug "x"')).toContain('git commit -m "fix: bug \\"x\\""');
    expect(await gb('commit', '', '', 'amend')).toContain('git commit --amend --no-edit');
    expect(await gb('reset', '', '', 'hard')).toContain('git reset --hard HEAD~1');
    expect(await gb('reset', 'abc123', '', 'hard')).toContain('DESTRUCTIVO');
    expect(await gb('reset', '', '', 'soft')).not.toContain('⚠');
    expect(await gb('push', 'main', '', 'force')).toContain('PELIGROSO');
    expect(await gb('push', 'main', '', 'force-with-lease')).toContain('git push --force-with-lease origin main');
    expect(await gb('push', 'main', 'upstream')).toContain('git push -u upstream main');
    expect(await gb('branch-new', 'feat/x', 'develop')).toContain('git switch -c feat/x develop');
    expect(await gb('branch-delete', 'x', '', 'force')).toContain('git branch -D x');
    expect(await gb('merge', 'dev', '', 'no-ff')).toContain('git merge --no-ff dev');
    expect(await gb('pull', 'main', '', 'rebase')).toContain('git pull --rebase origin main');
    expect(await gb('tag', 'v1.0.0')).toContain('git tag -a v1.0.0 -m "v1.0.0"');
    expect(await gb('log', '5')).toContain('-n 5');
    expect(await gb('stash', '')).toContain('git stash push');
    await fails('git-builder', '', '', { action: 'switch' });
  });
  it('commit-builder', async () => {
    const cb = async (d: string, body: string, o: Opts) => (await run('commit-builder', d, body, o)) as string;
    expect(await cb('arreglar el bug', '', { type: 'fix', scope: 'api', breaking: false, refs: '' })).toBe('fix(api): arreglar el bug');
    expect(await cb('arreglar', '', { type: 'fix', scope: '', breaking: false, refs: '' })).toBe('fix: arreglar');
    expect(await cb('cambiar la API', 'Cuerpo.', { type: 'feat', scope: '(a b)', breaking: true, refs: 'Closes #1' })).toBe('feat(ab)!: cambiar la API\n\nCuerpo.\n\nBREAKING CHANGE: cambiar la API\n\nCloses #1');
    const w = await cb('Añadir cosa.', '', { type: 'feat', scope: '', breaking: false, refs: '' });
    expect(w).toContain('minúscula'); expect(w).toContain('punto');
    expect(await cb('x'.repeat(80), '', { type: 'feat', scope: '', breaking: false, refs: '' })).toContain('recomendado ≤ 72');
    await fails('commit-builder', '  ');
  });
  it('semver', async () => {
    const bump = async (v: string, kind: string, preid = 'rc') => ((await run('semver', v, '', { bump: kind, preid })) as string).split('\n').find((l) => l.startsWith(kind + ' →'))!.split('→ ')[1];
    expect(await bump('1.2.3', 'major')).toBe('2.0.0');
    expect(await bump('1.2.3', 'minor')).toBe('1.3.0');
    expect(await bump('1.2.3', 'patch')).toBe('1.2.4');
    expect(await bump('1.2.3-rc.1', 'patch')).toBe('1.2.3');
    expect(await bump('2.0.0-rc.1', 'major')).toBe('2.0.0');
    expect(await bump('1.2.3', 'premajor', 'beta')).toBe('2.0.0-beta.0');
    expect(await bump('1.2.3', 'preminor')).toBe('1.3.0-rc.0');
    expect(await bump('1.2.3', 'prepatch')).toBe('1.2.4-rc.0');
    expect(await bump('1.2.3', 'prerelease')).toBe('1.2.4-rc.0');
    expect(await bump('1.2.3-rc.1', 'prerelease')).toBe('1.2.3-rc.2');
    expect(await bump('1.2.3-rc', 'prerelease')).toBe('1.2.3-rc.0');
    expect(await bump('v1.2.3+build.5', 'patch')).toBe('1.2.4');
    const cmp = async (a: string, b: string) => ((await run('semver', a, b)) as string).match(/ ([<>=]) /)![1];
    expect(await cmp('1.0.0-alpha', '1.0.0')).toBe('<');
    expect(await cmp('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe('<');
    expect(await cmp('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe('<');
    expect(await cmp('1.0.0-rc.1', '1.0.0-beta.11')).toBe('>');
    expect(await cmp('1.10.0', '1.9.9')).toBe('>');
    expect(await cmp('1.0.0+a', '1.0.0+b')).toBe('=');
    for (const bad of ['1.2', '01.2.3', '1.2.3.4', '1.2.3-', 'a.b.c', '']) await fails('semver', bad);
  });
  it('license', async () => {
    const mit = (await run('license', 'Ana Pérez', '', { goal: 'mit-text', year: '2026' })) as string;
    expect(mit).toContain('Copyright (c) 2026 Ana Pérez');
    expect(mit.startsWith('MIT License')).toBe(true);
    expect(mit).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(await run('license', '', '', { goal: 'red' })).toContain('AGPL-3.0');
    expect(await run('license', '', '', { goal: 'red' })).not.toContain('GPL 3.0  (GPL-3.0)');
    expect(((await run('license', '', '', { goal: 'all' })) as string).match(/^\S.*\(\S+\)$/gm)!.length).toBe(10);
  });
  it('readme-gen y changelog-gen', async () => {
    const r = (await run('readme-gen', 'nombre: X\ndescripcion: Una cosa\ncaracteristicas:\n- A\n* B\nuso: x --help')) as string;
    expect(r.startsWith('# X\n')).toBe(true);
    expect(r).toContain('## Características\n\n- A\n- B');
    expect(r).toContain('```bash\nx --help\n```');
    expect(r).not.toContain('## Licencia');
    await fails('readme-gen', 'descripcion: sin nombre');
    const c = (await run('changelog-gen', 'feat(ui): botón\nfix: error\nperf: rápido\ndocs: leer\nfeat!: rompe todo\nrefactor(core): limpiar\nvarios cambios\nfix(auth): CVE-2026-1 parcheado', '', { version: '2.0.0', date: '2026-11-27', other: false })) as string;
    expect(c.startsWith('## [2.0.0] - 2026-11-27')).toBe(true);
    expect(c).toContain('### ⚠ Cambios incompatibles\n- rompe todo');
    expect(c).toContain('### Added\n- **ui:** botón');
    expect(c).toContain('### Fixed\n- error');
    expect(c).toContain('- **core:** limpiar');
    expect(c).toContain('- varios cambios');
    expect(c).toContain('### Security\n- **auth:** CVE-2026-1 parcheado');
    expect(c).not.toContain('leer');
    expect(await run('changelog-gen', 'docs: leer', '', { other: true, version: '1', date: 'x' })).toContain('### Otros\n- leer');
  });
  it('package-inspector', async () => {
    const out = (await run('package-inspector', JSON.stringify({ name: 'x', version: '1.0.0', license: 'MIT', engines: { node: '>=20' }, private: true, dependencies: { a: 'latest', b: '*', c: '^1.0.0', d: 'github:u/r' }, devDependencies: { c: '^1.0.0' } }))) as string;
    expect(out).toContain('dependencies.a usa «latest»');
    expect(out).toContain('dependencies.b usa «*»');
    expect(out).toContain('dependencies.d apunta a una URL');
    expect(out).toContain('«c» está en dependencies y en devDependencies');
    expect(out).not.toContain('Falta el campo license');
    expect(out).not.toContain('Falta repository');
    expect(await run('package-inspector', '{"name":"y","license":"MIT","engines":{"node":"20"},"private":true}')).toContain('✓ Sin avisos');
    await fails('package-inspector', '{no json');
    await fails('package-inspector', '[1]');
  });
});

describe('bases de datos', () => {
  it('sql-minify', async () => {
    expect(await run('sql-minify', "SELECT '-- no  comment' -- real\nFROM  t /* x */ WHERE a = 'it''s'")).toBe("SELECT '-- no  comment' FROM t WHERE a = 'it''s'");
    expect(await run('sql-minify', 'SELECT  a ,  b  FROM  t ;')).toBe('SELECT a,b FROM t;');
    expect(await run('sql-minify', 'SELECT "a  b", `c  d` FROM t')).toBe('SELECT "a  b",`c  d` FROM t');
  });
  it('insert-gen por dialecto', async () => {
    const csv = 'a,b,c\n1,"x\\y",\ntrue,Ñu,2.5';
    const pg = (await run('insert-gen', csv, '', { table: 'public.t', dialect: 'postgres', batch: false })) as string;
    expect(pg).toBe(`INSERT INTO "public"."t" ("a", "b", "c") VALUES (1, 'x\\y', NULL);\nINSERT INTO "public"."t" ("a", "b", "c") VALUES (TRUE, 'Ñu', 2.5);`);
    const my = (await run('insert-gen', csv, '', { table: 't', dialect: 'mysql', batch: true })) as string;
    expect(my).toContain('INSERT INTO `t` (`a`, `b`, `c`) VALUES');
    expect(my).toContain("'x\\\\y'");
    expect(my).toContain('(TRUE,');
    const ms = (await run('insert-gen', csv, '', { table: 't', dialect: 'sqlserver', batch: true })) as string;
    expect(ms).toContain('[a], [b], [c]');
    expect(ms).toContain("N'Ñu'");
    expect(ms).toContain('(1, \'x\\y\', NULL)');
    expect(ms).toContain('(1, N\'Ñu\', 2.5)'.replace("(1, N'Ñu'", '(1, N\'Ñu\'') ? 'N\'Ñu\'' : '');
    expect(await run('insert-gen', csv, '', { table: 't', dialect: 'postgres', batch: true, emptyNull: false })).toContain("'x\\y', '')");
    const js = (await run('insert-gen', '[{"a":1,"o":{"k":"v\'"},"n":null,"f":false,"s":"007"}]', '', { table: 't', dialect: 'sqlite', batch: false })) as string;
    expect(js).toBe(`INSERT INTO "t" ("a", "o", "n", "f", "s") VALUES (1, '{"k":"v''"}', NULL, 0, '007');`);
    await fails('insert-gen', csv, '', { table: 'x; DROP TABLE y' });
    await fails('insert-gen', '');
    await fails('insert-gen', '[1,2]');
  });
  it('create-table infiere tipos', async () => {
    const ct = async (data: unknown, o: Opts = {}) => (await run('create-table', typeof data === 'string' ? data : JSON.stringify(data), '', { table: 't', dialect: 'postgres', ...o })) as string;
    const out = await ct([
      { id: 1, big: 3000000000, price: 1, ts: '2026-01-01 10:00:00', d: '2026-01-01', txt: 'a'.repeat(300), flag: 'true', note: null, obj: { a: 1 } },
      { id: 2, big: 1, price: 2.5, ts: '2026-01-02T10:00:00Z', d: '2026-01-02', txt: 'b', flag: 'false', note: 'x', obj: { b: 2 } },
    ]);
    expect(out).toContain('"id" INTEGER NOT NULL PRIMARY KEY');
    expect(out).toContain('"big" BIGINT NOT NULL');
    expect(out).toContain('"price" DOUBLE PRECISION NOT NULL');
    expect(out).toContain('"ts" TIMESTAMP NOT NULL');
    expect(out).toContain('"d" DATE NOT NULL');
    expect(out).toContain('"txt" TEXT NOT NULL');
    expect(out).toContain('"flag" BOOLEAN NOT NULL');
    expect(out).toContain('"note" VARCHAR(50),');
    expect(out).toContain('"obj" JSONB NOT NULL');
    const my = await ct('id,name\n1,Ana\n1,Luis', { dialect: 'mysql' });
    expect(my).toContain('`id` INT NOT NULL,');
    expect(my).not.toContain('PRIMARY KEY');
    const sq = await ct([{ a: 1, b: 'x', c: true, d: '2026-01-01' }], { dialect: 'sqlite' });
    expect(sq).toContain('"b" TEXT NOT NULL');
    expect(sq).toContain('"c" INTEGER NOT NULL');
    expect(sq).toContain('"d" TEXT NOT NULL');
    const ms = await ct([{ a: 'x', t: 'x'.repeat(120), b: false }], { dialect: 'sqlserver' });
    expect(ms).toContain('[a] NVARCHAR(50) NOT NULL');
    expect(ms).toContain('[t] NVARCHAR(255) NOT NULL');
    expect(ms).toContain('[b] BIT NOT NULL');
    expect(await ct('a,b\n1,\n2,x')).toContain('"b" VARCHAR(50)\n');
    expect(await ct('v\n1\n2.5\n3', {})).toContain('"v" DOUBLE PRECISION NOT NULL');
    expect(await ct('v\n1\n3000000000', {})).toContain('"v" BIGINT NOT NULL');
    expect(await ct('v\n2026-01-01\n2026-01-02 10:00', {})).toContain('"v" TIMESTAMP NOT NULL');
    expect(await ct('v\n1\nabc', {})).toContain('"v" VARCHAR(50) NOT NULL');
  });
  it('sql-data-gen', async () => {
    const out = (await run('sql-data-gen', 'id:id\nnombre:name\napellido:surname\nemail:email\nn:int(5-5)\nok:bool\nestado:pick(solo)\nf:float(2-2)\nu:uuid\nd:date\nt:text(3)', '', { table: 'p', dialect: 'postgres', rows: 25, batch: false })) as string;
    const rows = out.split('\n');
    expect(rows).toHaveLength(25);
    rows.forEach((r, i) => {
      expect(r.startsWith('INSERT INTO "p" ("id", "nombre", "apellido", "email", "n", "ok", "estado", "f", "u", "d", "t") VALUES (' + (i + 1) + ',')).toBe(true);
      const m = /VALUES \(\d+, '([^']+)', '([^']+)', '([^']+)', (\d+), (TRUE|FALSE), '([^']+)', ([\d.]+), '([0-9a-f-]{36})', '(\d{4}-\d{2}-\d{2})', '([^']+)'\);$/.exec(r)!;
      expect(m, r).not.toBeNull();
      const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      expect(m[3]).toBe(`${plain(m[1])}.${plain(m[2])}${i + 1}@example.test`);
      expect(m[4]).toBe('5'); expect(m[6]).toBe('solo'); expect(Number(m[7])).toBe(2); expect(m[10].split(' ')).toHaveLength(3);
    });
    const range = ((await run('sql-data-gen', 'x:int(10-12)', '', { rows: 100, batch: true })) as string).match(/\((\d+)\)/g)!.map((s) => Number(s.slice(1, -1)));
    expect(range).toHaveLength(100);
    expect(Math.min(...range)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...range)).toBeLessThanOrEqual(12);
    await fails('sql-data-gen', 'a:magia');
    await fails('sql-data-gen', 'esto no vale');
    await fails('sql-data-gen', '');
    await fails('sql-data-gen', 'a:pick()');
  });
  it('conn-string', async () => {
    const cs = async (o: Opts) => (await run('conn-string', '', '', { pass: 'p@ss:w/rd#1', user: 'u', host: 'h', db: 'd', port: '', ssl: false, ...o })) as string;
    expect((await cs({ engine: 'postgres-uri' })).split('\n')[0]).toBe('postgresql://u:p%40ss%3Aw%2Frd%231@h:5432/d');
    expect((await cs({ engine: 'postgres-uri', ssl: true })).split('\n')[0]).toContain('?sslmode=require');
    expect((await cs({ engine: 'mysql-uri', port: '3307' })).split('\n')[0]).toBe('mysql://u:p%40ss%3Aw%2Frd%231@h:3307/d');
    expect((await cs({ engine: 'mongodb', ssl: true })).split('\n')[0]).toBe('mongodb://u:p%40ss%3Aw%2Frd%231@h:27017/d?tls=true');
    expect((await cs({ engine: 'sqlserver-ado' })).split('\n')[0]).toBe('Server=h,1433;Database=d;User Id=u;Password=p@ss:w/rd#1;Encrypt=False;TrustServerCertificate=False;');
    expect((await cs({ engine: 'sqlserver-ado', pass: 'a;b"c' })).split('\n')[0]).toContain('Password="a;b""c";');
    expect((await cs({ engine: 'redis', db: '3', user: '' })).split('\n')[0]).toBe('redis://:p%40ss%3Aw%2Frd%231@h:6379/3');
    expect((await cs({ engine: 'redis', ssl: true, db: 'x' })).split('\n')[0]).toMatch(/^rediss:\/\/.*\/0$/);
    expect((await cs({ engine: 'jdbc-postgres' })).split('\n')[0]).toBe('jdbc:postgresql://h:5432/d?user=u&password=p%40ss%3Aw%2Frd%231');
    expect((await cs({ engine: 'jdbc-mysql', ssl: true })).split('\n')[0]).toContain('&useSSL=true');
    expect((await cs({ engine: 'sqlite', db: 'x.db' })).split('\n')[0]).toBe('sqlite:///x.db');
    expect(await cs({ engine: 'postgres-uri' })).toContain("DATABASE_URL=postgresql://");
    expect((await cs({ engine: 'postgres-uri', user: '', pass: '' })).split('\n')[0]).toBe('postgresql://h:5432/d');
    await fails('conn-string', '', '', { engine: 'postgres-uri', port: 'abc' });
  });
});
