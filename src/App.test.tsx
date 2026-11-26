import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App (render de servidor)', () => {
  const html = renderToString(<App />);

  it('el explorador va antes que la herramienta seleccionada', () => {
    const explorer = html.indexOf('class="catalog"');
    const workspace = html.indexOf('class="workspace"');
    expect(explorer).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(explorer);
  });
  it('no incluye la cabecera grande', () => {
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain('Sin complicaciones');
  });
  it('muestra la herramienta por defecto con sus opciones', () => {
    expect(html).toContain('JSON Formatter / Validator');
    expect(html).toContain('Indentación');
  });
});
