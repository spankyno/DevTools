# DevTools Toolbox

Aplicación web React + TypeScript + Vite. Incluye catálogo de herramientas, búsqueda, categorías, favoritos, historial reciente, tema oscuro/claro y PWA.

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
- Añade una entrada al catálogo `tools` en `src/tools.ts`.
- Añade su lógica a `runTool(id, input, extra)`.
- Añade una muestra inicial en `samples` de `src/App.tsx`.
- Si necesita segundo campo, añade su etiqueta al objeto `second`.
- Para una interfaz avanzada, crea un componente React específico y móntalo según el id activo.

## Catálogo
30 utilidades: JSON Formatter, JSON Diff, Base64, URL Encoder/Decoder, JWT Decoder, SHA-256, UUID, Password Generator, Regex Tester, Timestamp Converter, Cron Helper, Text Diff, Case Converter, Markdown Preview, HTML Formatter, CSS Formatter, CSS Gradient, Color Converter, WCAG Contrast, HTML Live Preview, SQL Formatter, SQL Playground demostrativo, CSV/JSON, XML/JSON básico, API Request Tester, HTTP Status Codes, URL Parser, CIDR IPv4, .gitignore Generator y Fake Data Generator.

## Limitaciones y privacidad
La mayoría de operaciones se ejecutan localmente. El probador API contacta con un servidor remoto y puede verse limitado por CORS. JWT Decoder no verifica firmas. SQL Playground es demostrativo, no ejecuta SQL real. CSV/XML son conversores básicos. Google Fonts se solicita externamente; elimina el `@import` CSS para evitarlo.

Licencia MIT.
