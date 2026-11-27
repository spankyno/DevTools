import { forwardRef, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Play, RotateCcw, Sparkles, Star, Upload } from 'lucide-react';
import type { OptionValue, Opts, ToolDef } from '../tools/types';
import OptionsBar from './OptionsBar';
import JsonTree from './JsonTree';

type Props = { tool: ToolDef; favorite: boolean; onToggleFavorite: () => void };

const defaultsOf = (t: ToolDef): Opts => Object.fromEntries((t.options ?? []).map((o) => [o.id, o.default]));

// Se monta con key={tool.id}: al cambiar de herramienta el estado se reinicia solo.
const ToolWorkspace = forwardRef<HTMLElement, Props>(function ToolWorkspace({ tool, favorite, onToggleFavorite }, ref) {
  const [input, setInput] = useState(tool.sample);
  const [extra, setExtra] = useState(tool.secondSample ?? '');
  const [opts, setOpts] = useState<Opts>(() => defaultsOf(tool));
  const [output, setOutput] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const runId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exec(job: () => string | Promise<string>) {
    const id = ++runId.current;
    setBusy(true);
    try {
      const out = await job();
      if (id === runId.current) { setOutput(out); setError(false); }
    } catch (e) {
      if (id === runId.current) { setOutput('Error: ' + (e instanceof Error ? e.message : String(e))); setError(true); }
    } finally {
      if (id === runId.current) setBusy(false);
    }
  }

  // Herramientas «en vivo» (p. ej. Unix Time Now): se actualizan solas mientras están abiertas.
  useEffect(() => {
    if (!tool.live) return;
    let alive = true;
    const tick = async () => {
      try { const out = await tool.run(input, extra, opts); if (alive) { setOutput(out); setError(false); } } catch { /* se ignora en bucle */ }
    };
    tick();
    const id = setInterval(tick, tool.live);
    return () => { alive = false; clearInterval(id); };
  }, [tool, input, extra, opts]);

  const run = () => exec(() => tool.run(input, extra, opts));
  const onFile = (f?: File) => { if (f && tool.runFile) exec(() => tool.runFile!(f, opts)); if (fileRef.current) fileRef.current.value = ''; };
  const reset = () => { setInput(tool.sample); setExtra(tool.secondSample ?? ''); setOpts(defaultsOf(tool)); setOutput(''); setError(false); };

  async function copy() {
    try { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* sin permisos */ }
  }
  function download() {
    const ext = tool.view === 'html' ? 'html' : tool.view === 'tree' ? 'json' : 'txt';
    const mime = tool.view === 'html' ? 'text/html' : tool.view === 'tree' ? 'application/json' : 'text/plain';
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([output], { type: mime }));
    a.href = url; a.download = `${tool.id}-result.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  const showResult = output && !error;
  return (
    <section className="workspace" ref={ref}>
      <div className="workspace-head">
        <div>
          <div className="tool-kicker">{tool.category.toUpperCase()} <span>•</span> UTILIDAD</div>
          <h2>{tool.name}</h2>
          <p>{tool.desc}</p>
        </div>
        <button className={'favorite ' + (favorite ? 'selected' : '')} onClick={onToggleFavorite} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
          <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="editor-grid">
        <div className="panel">
          <div className="panel-head">
            <div><i className="panel-dot purple" /> {tool.noInput ? 'OPCIONES' : 'ENTRADA'}</div>
            <button className="subtle" onClick={reset}><RotateCcw size={14} /> Restablecer</button>
          </div>
          {tool.options && <OptionsBar options={tool.options} values={opts} onChange={(id: string, v: OptionValue) => setOpts((p) => ({ ...p, [id]: v }))} />}
          {!tool.noInput && tool.inputLabel && <div className="second-label">{tool.inputLabel}</div>}
          {!tool.noInput && <textarea spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe o pega aquí..." aria-label="Entrada" />}
          {tool.secondLabel && (
            <>
              <div className="second-label">{tool.secondLabel}</div>
              <textarea className="second-area" value={extra} onChange={(e) => setExtra(e.target.value)} spellCheck={false} aria-label={tool.secondLabel} />
            </>
          )}
          {tool.hint && <div className="hint">{tool.hint}</div>}
          <div className="panel-foot">
            <span>{tool.noInput ? '' : `${input.length} caracteres`}</span>
            <div className="foot-actions">
              {tool.fileInput && (
                <>
                  <input ref={fileRef} type="file" hidden accept={tool.fileInput.accept} onChange={(e) => onFile(e.target.files?.[0])} />
                  <button className="subtle" onClick={() => fileRef.current?.click()}><Upload size={14} /> {tool.fileInput.label}</button>
                </>
              )}
              <button className="run-btn" onClick={run} disabled={busy}>
                <Play size={14} fill="currentColor" /> {busy ? 'Procesando…' : tool.runLabel ?? (tool.noInput ? 'Generar' : 'Ejecutar herramienta')} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="panel output-panel">
          <div className="panel-head">
            <div><i className="panel-dot green" /> RESULTADO</div>
            <div className="output-actions">
              <button className="subtle" disabled={!output} onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}</button>
              <button className="subtle" disabled={!output} onClick={download}><Download size={14} /> Exportar</button>
            </div>
          </div>
          {showResult && tool.view === 'html' ? <iframe title="Vista previa" sandbox="" srcDoc={output} />
            : showResult && tool.view === 'tree' ? <JsonTree text={output} />
            : <pre className={output ? (error ? 'result error' : 'result') : 'empty-result'}>{output || 'El resultado aparecerá aquí cuando ejecutes la herramienta.'}</pre>}
          {showResult && tool.preview && <iframe className="preview-frame" title="Vista previa" sandbox="" srcDoc={tool.preview(output, input, extra, opts)} />}
          <div className="panel-foot">
            <span>{output.length} caracteres</span>
            <span className={'ready' + (error ? ' bad' : '')}><i /> {error ? 'ERROR' : 'LISTO'}</span>
          </div>
        </div>
      </div>

      <div className="tip"><Sparkles size={16} /><span><b>Consejo:</b> {tool.tip ?? 'Tus datos se procesan en el navegador siempre que la función lo permite.'}</span></div>
    </section>
  );
});
export default ToolWorkspace;
