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
100 utilidades en 12 categorías (todas funcionan en el navegador salvo el probador de API):

- **JSON y XML (5):** JSON Formatter/Validator, JSON Viewer, JSON Diff, CSV↔JSON, XML→JSON.
- **Codificación (5):** Base64, URL, HTML Entities, Unicode, Punycode.
- **Seguridad (5):** JWT, Hash (MD5/SHA), Hash Checker, HMAC, Password Strength.
- **Generadores (5):** UUID v4/v7, Password, Fake Data, Lorem Ipsum, Random Number.
- **Texto (13):** Counter, Sorter, Duplicate Remover, Line Breaks, Whitespace, Reverser, Slug, String Escape, Extractor, Regex, Text Diff, Case Converter, Markdown Preview.
- **Fecha y hora (9):** Timestamp, Cron, Date Calculator, Date Difference, Timezone, ISO 8601, Unix Time Now, Working Days, Leap Year.
- **Conversión y cálculo (10):** Number Base, Text↔Hex/Binary, Byte, Percentage, Unit, CSS Units, Aspect Ratio, DPI/PPI, Data Transfer, Color Temperature.
- **HTML, CSS y JS (11):** HTML/CSS Formatter, HTML Preview, CSS Minifier, Specificity, Selector Tester, SVG Placeholder, SVG→Data URI, Image Base64, Data URI, Meta Tags.
- **Red y HTTP (12):** API Tester, HTTP Status, URL Parser, CIDR, Query String, IPv4/IPv6, IP Info, User-Agent, HTTP Headers, MIME, Puertos, DNS.
- **Diseño (9):** Gradient, Color Converter, Palette, Contrast, Box Shadow, Border Radius, Flexbox, Grid, CSS Filter.
- **Bases de datos (7):** SQL Formatter, SQL Minifier, INSERT Generator, CREATE TABLE Generator, Test Data Generator, Connection String, SQL Playground (demo).
- **Git y desarrollo (9):** .gitignore, Cheat Sheet, Command Builder, Commit Builder, SemVer, Licencias, README, Changelog, package.json Inspector.

## Limitaciones y privacidad
La mayoría de operaciones se ejecutan localmente. El probador API contacta con un servidor remoto y puede verse limitado por CORS. JWT Decoder no verifica firmas. SQL Playground es demostrativo, no ejecuta SQL real. XML→JSON es un conversor básico. IP Address Info clasifica rangos reservados en local: no da geolocalización. Los resultados de Password Strength son orientativos (no usa diccionarios). Google Fonts se solicita externamente; elimina el `@import` CSS para evitarlo.

Licencia MIT.
