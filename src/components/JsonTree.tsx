import { useState } from 'react';

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const isContainer = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 2);
  const label = name !== undefined ? <span className="jt-key">{name}: </span> : null;

  if (!isContainer) {
    const cls = typeof value === 'string' ? 'jt-str' : typeof value === 'number' ? 'jt-num' : value === null ? 'jt-null' : 'jt-bool';
    return <div className="jt-row jt-leaf">{label}<span className={cls}>{typeof value === 'string' ? JSON.stringify(value) : String(value)}</span></div>;
  }
  const isArr = Array.isArray(value);
  const entries: [string, unknown][] = isArr ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as object);
  return (
    <div>
      <button type="button" className="jt-row jt-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="jt-arrow">{open ? '▾' : '▸'}</span>{label}
        <span className="jt-meta">{isArr ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {open && <div className="jt-children">{entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} />)}</div>}
    </div>
  );
}

export default function JsonTree({ text }: { text: string }) {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return <pre className="result">{text}</pre>; }
  return <div className="jt"><Node value={data} depth={0} /></div>;
}
