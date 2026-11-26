export type OptionValue = string | number | boolean;
export type Opts = Record<string, OptionValue>;

export type OptionDef = {
  id: string;
  label: string;
  type: 'select' | 'number' | 'text' | 'checkbox';
  default: OptionValue;
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

export type ToolDef = {
  id: string;
  name: string;
  desc: string;
  category: string;
  icon: string;
  /** Orden dentro de la categoría (por defecto 50, después por nombre). */
  order?: number;
  sample: string;
  secondLabel?: string;
  secondSample?: string;
  /** Oculta el área de entrada (herramientas controladas solo por opciones). */
  noInput?: boolean;
  options?: OptionDef[];
  /** Cómo se muestra el resultado. */
  view?: 'text' | 'html' | 'tree';
  runLabel?: string;
  tip?: string;
  /** Aviso fijo bajo la entrada (privacidad, CORS, etc.). */
  hint?: string;
  fileInput?: { label: string; accept?: string };
  run: (input: string, extra: string, opts: Opts) => string | Promise<string>;
  runFile?: (file: File, opts: Opts) => Promise<string>;
};

export const CATEGORY_ORDER = [
  'JSON y XML',
  'Codificación',
  'Seguridad',
  'Generadores',
  'Texto',
  'Fecha y hora',
  'HTML, CSS y JS',
  'Red y HTTP',
  'Diseño',
  'Bases de datos',
  'Git y desarrollo',
] as const;
