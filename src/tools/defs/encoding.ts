import type { ToolDef } from '../types';
import { fromBase64, toBase64, toBase64Url, utf8 } from '../lib/bytes';

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

const tools: ToolDef[] = [
  {
    id: 'base64',
    name: 'Base64 Encoder / Decoder',
    desc: 'Codifica y decodifica Base64 (texto o archivos, estándar o URL-safe).',
    category: 'Codificación',
    icon: '64',
    sample: 'Hola, mundo! ¿Qué tal? 👋',
    options: [
      { id: 'mode', label: 'Modo', type: 'select', default: 'encode', choices: [
        { value: 'encode', label: 'Codificar' }, { value: 'decode', label: 'Decodificar' } ] },
      { id: 'urlsafe', label: 'URL-safe (sin + / =)', type: 'checkbox', default: false },
    ],
    fileInput: { label: 'Codificar un archivo…' },
    tip: 'Al decodificar se aceptan las dos variantes de Base64, con o sin relleno «=».',
    run(input, _e, o) {
      if (o.mode === 'decode') {
        const bytes = fromBase64(input);
        try { return strictUtf8.decode(bytes); }
        catch { throw new Error(`Se decodificaron ${bytes.length} bytes, pero no son texto UTF-8 (¿archivo binario?).`); }
      }
      const b64 = toBase64(utf8(input));
      return o.urlsafe ? toBase64Url(b64) : b64;
    },
    async runFile(file, o) {
      const b64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      return o.urlsafe ? toBase64Url(b64) : b64;
    },
  },
  {
    id: 'url',
    name: 'URL Encoder / Decoder',
    desc: 'Codifica y decodifica componentes o URLs completas.',
    category: 'Codificación',
    icon: '↗',
    sample: 'https://ejemplo.com/buscar?q=hola mundo&lang=es',
    options: [
      { id: 'mode', label: 'Modo', type: 'select', default: 'encode', choices: [
        { value: 'encode', label: 'Codificar' }, { value: 'decode', label: 'Decodificar' } ] },
      { id: 'scope', label: 'Alcance', type: 'select', default: 'component', choices: [
        { value: 'component', label: 'Componente (encodeURIComponent)' }, { value: 'full', label: 'URL completa (encodeURI)' } ] },
    ],
    run(input, _e, o) {
      try {
        if (o.mode === 'decode') return o.scope === 'full' ? decodeURI(input) : decodeURIComponent(input);
        return o.scope === 'full' ? encodeURI(input) : encodeURIComponent(input);
      } catch { throw new Error('Secuencia % no válida en la entrada.'); }
    },
  },
];
export default tools;
