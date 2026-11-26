import { ArrowRight, Search, Star } from 'lucide-react';
import type { ToolDef } from '../tools/types';

type Props = {
  query: string; onQuery: (q: string) => void;
  title: string; visible: ToolDef[]; active: string; favorites: string[];
  emptyMessage: string; onSelect: (id: string) => void;
};

export default function Explorer({ query, onQuery, title, visible, active, favorites, emptyMessage, onSelect }: Props) {
  return (
    <>
      <div className="search-row">
        <div className="searchbox">
          <Search size={19} />
          <input placeholder="Buscar una herramienta..." value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Buscar herramientas" />
        </div>
        <div className="result-count">{visible.length} herramientas</div>
      </div>
      <section className="catalog">
        <div className="catalog-title">
          <div><div className="tool-kicker">EXPLORA</div><h2>{title}</h2></div>
          <span>{visible.length} disponibles</span>
        </div>
        <div className="tool-grid">
          {visible.map((t) => (
            <button key={t.id} className={'tool-card ' + (active === t.id ? 'chosen' : '')} onClick={() => onSelect(t.id)}>
              <div className="card-top"><div className="tool-icon">{t.icon}</div><span className="card-arrow"><ArrowRight size={16} /></span></div>
              <b>{t.name}</b><p>{t.desc}</p>
              <div className="card-meta"><span>{t.category}</span>{favorites.includes(t.id) && <Star size={13} fill="currentColor" />}</div>
            </button>
          ))}
        </div>
        {!visible.length && <div className="no-results">{emptyMessage}</div>}
      </section>
    </>
  );
}
