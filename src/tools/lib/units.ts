export type UnitCat = { name: string; units: Record<string, number>; base: string };

// Factor = cuántas unidades base vale 1 de esa unidad.
export const UNIT_CATS: UnitCat[] = [
  { name: 'Longitud', base: 'm', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 } },
  { name: 'Masa', base: 'kg', units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 } },
  { name: 'Volumen', base: 'l', units: { ml: 0.001, l: 1, m3: 1000, tsp: 0.00492892159375, tbsp: 0.01478676478125, floz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784 } },
  { name: 'Área', base: 'm2', units: { mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 1e4, km2: 1e6, in2: 0.00064516, ft2: 0.09290304, yd2: 0.83612736, ac: 4046.8564224, mi2: 2589988.110336 } },
  { name: 'Velocidad', base: 'm/s', units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 1852 / 3600, 'ft/s': 0.3048 } },
  { name: 'Tiempo', base: 's', units: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, sem: 604800 } },
];

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e12 || a < 1e-6) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(n.toPrecision(10)));
}

export function convertUnits(input: string): string {
  const m = /^\s*(-?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)\s*(?:°\s*)?([a-zA-Z0-9/²³]+)\s*$/i.exec(input);
  if (!m) throw new Error('Formato: «valor unidad», por ejemplo «10 km», «5 lb», «30 C» o «100 mph».');
  const value = Number(m[1].replace(',', '.'));
  const raw = m[2].toLowerCase().replace('²', '2').replace('³', '3');
  if (['c', 'f', 'k'].includes(raw)) {
    const c = raw === 'c' ? value : raw === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    if (c < -273.15) throw new Error('Temperatura por debajo del cero absoluto.');
    return ['Temperatura', '', `${fmtNum(c)} °C`, `${fmtNum((c * 9) / 5 + 32)} °F`, `${fmtNum(c + 273.15)} K`].join('\n');
  }
  const cat = UNIT_CATS.find((c) => raw in c.units);
  if (!cat) throw new Error(`Unidad no reconocida: «${m[2]}».\nDisponibles: ${UNIT_CATS.map((c) => `${c.name} (${Object.keys(c.units).join(', ')})`).join(' · ')}, temperatura (C, F, K).`);
  const inBase = value * cat.units[raw];
  return [cat.name, '', ...Object.entries(cat.units).map(([u, f]) => `${fmtNum(inBase / f).padStart(16)} ${u}${u === raw ? '   ← entrada' : ''}`)].join('\n');
}
