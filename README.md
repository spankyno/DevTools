# DevTools Toolbox

Aplicación web React + TypeScript + Vite. Incluye catálogo de herramientas, búsqueda, categorías, favoritos, recientes, tema oscuro/claro y PWA con modo offline tras la primera visita.

## Requisitos
Node.js 20+ y npm.

## Ejecutar
```bash
npm install
npm run dev
```

## Compilar
```bash
npm run build
npm run preview
```
Salida de producción: `dist/`.

## Publicar en Cloudflare Pages (gratis)
1. Sube el proyecto a GitHub.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Despliega. `public/_redirects` configura el fallback de la SPA.

## Añadir herramientas
Cada herramienta es un objeto `ToolDef` (ver `src/tools/types.ts`). Los archivos de `src/tools/defs/` exportan por defecto una herramienta o un array de ellas, y `src/tools/registry.ts` las descubre solas: **no hay que tocar nada más**.

```ts
// src/tools/defs/mi-herramienta.ts
import type { ToolDef } from '../types';
const tool: ToolDef = {
  id: 'reverse', name: 'Text Reverser', desc: 'Invierte un texto.',
  category: 'Texto', icon: '↔', sample: 'hola',
  options: [{ id: 'lines', label: 'Por líneas', type: 'checkbox', default: false }],
  run: (input, _extra, o) => (o.lines ? input.split('\n').map((l) => [...l].reverse().join('')).join('\n') : [...input].reverse().join('')),
};
export default tool;
```
Campos útiles: `secondLabel`/`secondSample` (segundo campo), `options` (selectores, números, casillas), `noInput` (herramientas solo con opciones), `view: 'html' | 'tree'` (vista previa o árbol), `fileInput` + `runFile` (archivos), `hint` y `tip`. Las librerías pesadas deben cargarse con `await import('...')` dentro de `run`.
Las categorías válidas están en `CATEGORY_ORDER`.

## Pruebas
```bash
npm test            # Vitest: lógica de las herramientas y render de la app
npm run typecheck   # comprueba los tipos también en las pruebas
```
Hay una prueba que ejecuta la muestra de **todas** las herramientas (salvo API y XML, que necesitan navegador), así que una herramienta nueva con una muestra rota hace fallar los tests.

## Catálogo
33 utilidades en 11 categorías: JSON Formatter/Validator/Minifier, JSON Viewer, JSON Diff, CSV/JSON, XML/JSON, Base64 (texto y archivos), URL Encoder/Decoder, JWT Decoder/Inspector, Hash Generator (MD5, SHA-1/256/384/512), Hash Checker, HMAC, UUID v4/v7, Password Generator, Regex Tester, Text Diff, Case Converter, Markdown Preview, Timestamp Converter, Cron Helper, HTML/CSS Formatter, HTML Live Preview, CSS Gradient, Color Converter, Color Contrast, SQL Formatter, SQL Playground demostrativo, API Request Tester, HTTP Status Codes, URL Parser, CIDR Calculator, .gitignore Generator y Fake Data Generator.

## Limitaciones y privacidad
La mayoría de operaciones se ejecutan localmente. El probador API contacta con un servidor remoto y puede verse limitado por CORS. JWT Decoder no verifica firmas. SQL Playground es demostrativo, no ejecuta SQL real. CSV/XML son conversores básicos. Google Fonts se solicita externamente; elimina el `@import` CSS para evitarlo.

Licencia MIT.
