import { CATEGORY_ORDER, type ToolDef } from './types';

// Cada archivo de ./defs exporta (por defecto) una herramienta o un array de ellas.
// Para añadir una herramienta basta con crear o editar un archivo en esa carpeta.
const modules = import.meta.glob('./defs/*.ts', { eager: true, import: 'default' }) as Record<
  string,
  ToolDef | ToolDef[]
>;

const catRank = (c: string) => {
  const i = (CATEGORY_ORDER as readonly string[]).indexOf(c);
  return i === -1 ? 99 : i;
};

export const tools: ToolDef[] = Object.values(modules)
  .flat()
  .sort(
    (a, b) =>
      catRank(a.category) - catRank(b.category) ||
      (a.order ?? 50) - (b.order ?? 50) ||
      a.name.localeCompare(b.name, 'es'),
  );

export const toolById = new Map(tools.map((t) => [t.id, t]));

export const categories: string[] = [
  'Todas',
  ...CATEGORY_ORDER.filter((c) => tools.some((t) => t.category === c)),
];
