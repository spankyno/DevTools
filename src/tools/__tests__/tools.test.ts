import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { categories, toolById, tools } from '../registry';
import { CATEGORY_ORDER, type Opts } from '../types';
import { md5 } from '../lib/md5';
import { checkJson } from '../lib/json';
import { describeCron, nextRuns, parseCron } from '../lib/cron';
import { splitWords } from '../lib/words';

const defaults = (id: string): Opts => Object.fromEntries((toolById.get(id)!.options ?? []).map((o) => [o.id, o.default]));
const run = (id: string, input = '', extra = '', opts: Opts = {}) => {
  const t = toolById.get(id);
  if (!t) throw new Error('No existe la herramienta ' + id);
  return t.run(input, extra, { ...defaults(id), ...opts });
};

const rej = (...a: Parameters<typeof run>) => (async () => run(...a))();

describe('registro', () => {
  it('ids únicos y categorías conocidas', () => {
    const ids = tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of tools) expect(CATEGORY_ORDER as readonly string[]).toContain(t.category);
    expect(categories[0]).toBe('Todas');
  });

  it('la muestra de cada herramienta se ejecuta sin errores', async () => {
    // las marcadas browserOnly (red, DOMParser…) solo se pueden probar en el navegador
    for (const t of tools.filter((t) => !t.browserOnly)) {
      const out = await t.run(t.sample, t.secondSample ?? '', defaults(t.id));
      expect(typeof out, t.id).toBe('string');
      expect(out.startsWith('Error:'), `${t.id}: ${out}`).toBe(false);
    }
  });
});

describe('MD5 y hashes', () => {
  it('md5 coincide con node:crypto (incluye límites de bloque)', () => {
    for (const len of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 7 + 3) % 256);
      expect(md5(bytes), `len ${len}`).toBe(createHash('md5').update(bytes).digest('hex'));
    }
  });
  it('hash SHA-256 y MD5 de "abc"', async () => {
    expect(await run('hash', 'abc', '', { algo: 'SHA-256' })).toContain('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await run('hash', 'abc', '', { algo: 'MD5' })).toContain('900150983cd24fb0d6963f7d28e17f72');
  });
  it('marca MD5 y SHA-1 como no recomendados', async () => {
    expect(await run('hash', 'abc', '', { algo: 'SHA-1' })).toContain('no son recomendables');
    expect(await run('hash', 'abc', '', { algo: 'SHA-256' })).not.toContain('no son recomendables');
  });
  it('hash-check detecta algoritmo y compara', async () => {
    const ok = await run('hash-check', 'abc', 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
    expect(ok).toContain('✓ COINCIDE (SHA-256)');
    expect(await run('hash-check', 'abd', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toContain('✗ NO COINCIDE');
    await expect(rej('hash-check', 'abc', 'zz')).rejects.toThrow();
  });
  it('HMAC coincide con node:crypto', async () => {
    const expected = createHmac('sha512', 'clave').update('mensaje').digest('hex');
    expect(await run('hmac', 'mensaje', 'clave', { algo: 'SHA-512' })).toContain(expected);
  });
});

describe('JSON', () => {
  it('validador da línea y columna', () => {
    const e = checkJson('{\n  "a": 1,\n  "b": }\n}');
    expect(e).toMatchObject({ line: 3, col: 8 });
    expect(checkJson('{"a":[1,2,{"b":null}],"c":"x\\n"}')).toBeNull();
    expect(checkJson('{"a":1,}')).not.toBeNull();
    expect(checkJson("{'a':1}")).not.toBeNull();
    expect(checkJson('[01]')).not.toBeNull();
  });
  it('formatea, minifica, ordena y valida', async () => {
    expect(await run('json', '{"b":1,"a":[1]}', '', { indent: '4' })).toBe('{\n    "b": 1,\n    "a": [\n        1\n    ]\n}');
    expect(await run('json', '{ "b" : 1 }', '', { mode: 'minify' })).toBe('{"b":1}');
    expect(await run('json', '{"b":1,"a":2}', '', { mode: 'minify', sort: true })).toBe('{"a":2,"b":1}');
    expect(await run('json', '{"a":}', '', { mode: 'validate' })).toContain('Línea 1, columna 6');
    expect(await run('json', '[1,2]', '', { mode: 'validate' })).toContain('array de 2 elementos');
    await expect(rej('json', '{"a":}')).rejects.toThrow(/Línea 1, columna 6/);
  });
  it('json-diff lista rutas', async () => {
    const out = (await run('json-diff', '{"a":1,"b":[1,2],"c":1}', '{"a":2,"b":[1],"d":true}')) as string;
    expect(out).toContain('~ a: 1 → 2');
    expect(out).toContain('- b[1]: 2');
    expect(out).toContain('- c: 1');
    expect(out).toContain('+ d: true');
  });
});

describe('UUID', () => {
  it('v4 y v7 con formato correcto', async () => {
    const v4 = (await run('uuid', '', '', { version: 'v4', count: 3 })) as string;
    expect(v4.split('\n')).toHaveLength(3);
    for (const u of v4.split('\n')) expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const before = Date.now();
    const v7 = ((await run('uuid', '', '', { version: 'v7', count: 5 })) as string).split('\n');
    for (const u of v7) expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const ms = parseInt(v7[0].replace(/-/g, '').slice(0, 12), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(Date.now());
  });
  it('opciones de formato', async () => {
    const u = (await run('uuid', '', '', { count: 1, upper: true, nodash: true })) as string;
    expect(u).toMatch(/^[0-9A-F]{32}$/);
  });
});

describe('Base64', () => {
  it('ida y vuelta con Unicode y URL-safe', async () => {
    const enc = (await run('base64', 'Hola ¿qué tal? 👋', '', { mode: 'encode' })) as string;
    expect(await run('base64', enc, '', { mode: 'decode' })).toBe('Hola ¿qué tal? 👋');
    const u = (await run('base64', '???>>>', '', { mode: 'encode', urlsafe: true })) as string;
    expect(u).not.toMatch(/[+/=]/);
    expect(await run('base64', u, '', { mode: 'decode' })).toBe('???>>>');
  });
  it('rechaza entradas no válidas', async () => {
    await expect(rej('base64', '@@@', '', { mode: 'decode' })).rejects.toThrow();
  });
});

describe('Case Converter', () => {
  it('reconoce palabras de distintos formatos', () => {
    expect(splitWords('miVariableHTTPServer_nueva-cosa')).toEqual(['mi', 'Variable', 'HTTP', 'Server', 'nueva', 'cosa']);
  });
  it('convierte a todos los formatos', async () => {
    const f = async (mode: string, s = 'hello_world fooBar') => run('case', s, '', { mode });
    expect(await f('camel')).toBe('helloWorldFooBar');
    expect(await f('pascal')).toBe('HelloWorldFooBar');
    expect(await f('snake')).toBe('hello_world_foo_bar');
    expect(await f('kebab')).toBe('hello-world-foo-bar');
    expect(await f('constant')).toBe('HELLO_WORLD_FOO_BAR');
    expect(await f('dot')).toBe('hello.world.foo.bar');
    expect(await f('camel', 'línea uno\nlínea dos')).toBe('líneaUno\nlíneaDos');
  });
});

describe('Cron', () => {
  it('describe en español', () => {
    expect(describeCron(parseCron('0 9 * * 1-5'))).toBe('A las 09:00, de lunes a viernes.');
    expect(describeCron(parseCron('*/15 * * * *'))).toBe('Cada 15 minutos, todos los días.');
    expect(describeCron(parseCron('30 8 1 * *'))).toBe('A las 08:30, el día 1 del mes.');
    expect(describeCron(parseCron('@daily'))).toBe('A las 00:00, todos los días.');
    expect(describeCron(parseCron('0 0 * jan,mar *'))).toContain('en enero y marzo');
  });
  it('calcula próximas ejecuciones (UTC)', () => {
    const from = new Date('2026-11-26T10:00:00Z'); // jueves
    const r = nextRuns(parseCron('0 9 * * 1-5'), from, 3, true).map((d) => d.toISOString());
    expect(r).toEqual(['2026-11-27T09:00:00.000Z', '2026-11-30T09:00:00.000Z', '2026-12-01T09:00:00.000Z']);
    const q = nextRuns(parseCron('*/15 * * * *'), new Date('2026-11-26T10:07:00Z'), 3, true).map((d) => d.toISOString());
    expect(q).toEqual(['2026-11-26T10:15:00.000Z', '2026-11-26T10:30:00.000Z', '2026-11-26T10:45:00.000Z']);
    // día del mes OR día de la semana cuando ambos están restringidos
    const or = nextRuns(parseCron('0 0 13 * 5'), new Date('2026-11-01T00:00:00Z'), 2, true).map((d) => d.toISOString().slice(0, 10));
    expect(or).toEqual(['2026-11-06', '2026-11-13']);
  });
  it('rechaza expresiones no válidas', () => {
    expect(() => parseCron('* * * *')).toThrow(/5 campos/);
    expect(() => parseCron('61 * * * *')).toThrow(/rango/);
    expect(() => parseCron('a * * * *')).toThrow();
    expect(() => parseCron('*/0 * * * *')).toThrow();
  });
});

describe('Timestamp', () => {
  it('segundos, milisegundos y zona', async () => {
    const s = (await run('timestamp', '1700000000', '', { zone: 'UTC' })) as string;
    expect(s).toContain('2023-11-14T22:13:20.000Z');
    expect(s).toContain('interpretado como segundos');
    expect(await run('timestamp', '1700000000000', '', { zone: 'UTC' })).toContain('interpretado como milisegundos');
    expect(await run('timestamp', '1700000000', '', { zone: 'UTC', unit: 'ms' })).toContain('1970-01-20');
    expect(await run('timestamp', '2023-11-14T22:13:20Z', '', { zone: 'Europe/Madrid' })).toContain('23:13:20');
  });
  it('error con fechas no válidas', async () => {
    await expect(rej('timestamp', 'no es fecha')).rejects.toThrow();
  });
});

describe('JWT', () => {
  it('decodifica la muestra y detecta caducidad', async () => {
    const out = (await run('jwt', toolById.get('jwt')!.sample)) as string;
    expect(out).toContain('"name": "DevTools"');
    expect(out).toContain('CADUCADO');
    expect(out).toContain('2023-11-14');
  });
  it('avisa de alg=none y de falta de exp', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const out = (await run('jwt', `${b({ alg: 'none' })}.${b({ sub: 'x' })}.`)) as string;
    expect(out).toContain('alg=none');
    expect(out).toContain('No tiene fecha de caducidad');
  });
});

describe('Resto', () => {
  it('CSV con comillas ida y vuelta', async () => {
    const json = (await run('csv', 'a,b\n1,"x, ""y"""\n2,z')) as string;
    expect(JSON.parse(json)).toEqual([{ a: 1, b: 'x, "y"' }, { a: 2, b: 'z' }]);
    expect(await run('csv', json)).toBe('a,b\n1,"x, ""y"""\n2,z');
  });
  it('text-diff con saltos de línea reales', async () => {
    expect(await run('text-diff', 'a\nb\nc', 'a\nc\nd')).toBe('  a\n- b\n  c\n+ d');
    expect(await run('text-diff', 'x', 'x')).toContain('Sin diferencias');
  });
  it('regex con varias líneas, grupos y flags', async () => {
    const out = (await run('regex', '(?<user>\\w+)@(\\w+)', 'a@b\nc@d')) as string;
    expect(out).toContain('2 coincidencia(s)');
    expect(out).toContain('«user»: a');
  });
  it('contraseñas con las opciones pedidas', async () => {
    const list = ((await run('password', '', '', { length: 30, count: 4, symbols: false, upper: false, digits: true })) as string).split('\n');
    expect(list).toHaveLength(4);
    for (const p of list) { expect(p).toHaveLength(30); expect(p).toMatch(/^[a-z0-9]+$/); expect(p).toMatch(/\d/); }
  });
  it('markdown escapa HTML', async () => {
    const out = (await run('markdown', '# T\n\n<script>alert(1)</script> **b**')) as string;
    expect(out).not.toContain('<script>');
    expect(out).toContain('<h1>T</h1>');
    expect(out).toContain('<strong>b</strong>');
  });
  it('formateadores HTML y CSS (saltos de línea reales)', async () => {
    expect(await run('html', '<ul><li>Uno</li><br><li>Dos</li></ul>', '', { indent: '2' })).toBe('<ul>\n  <li>\n    Uno\n  </li>\n  <br>\n  <li>\n    Dos\n  </li>\n</ul>');
    expect(await run('css', 'a{color:red;margin:0;}', '', { indent: '2' })).toBe('a {\n  color:red;\n  margin:0;\n}');
    expect(await run('css', 'a{b:url(data:x;base64,AA)}', '', { indent: '2' })).toContain('url(data:x;base64,AA)');
  });
  it('gitignore usa saltos de línea reales', async () => {
    expect(await run('gitignore', '', '', { tech: 'Node' })).toBe('node_modules/\ndist/\n.env\n*.log');
  });
  it('cidr', async () => {
    expect(JSON.parse((await run('cidr', '192.168.1.10/24')) as string)).toMatchObject({ red: '192.168.1.0', broadcast: '192.168.1.255', hosts: 254 });
  });
});
