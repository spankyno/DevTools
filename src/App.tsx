import { useMemo, useRef, useState } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { categories, toolById, tools } from './tools/registry';
import Sidebar from './components/Sidebar';
import Explorer from './components/Explorer';
import ToolWorkspace from './components/ToolWorkspace';

const FAV_KEY = 'dt-favs';
const loadFavs = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v.filter((id) => toolById.has(id)) : [];
  } catch { return []; }
};

export default function App() {
  const [active, setActive] = useState('json');
  const [category, setCategory] = useState('Todas');
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(true);
  const [favorites, setFavorites] = useState<string[]>(loadFavs);
  const [recent, setRecent] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);

  const tool = toolById.get(active) ?? tools[0];
  const counts = useMemo(() => Object.fromEntries(categories.slice(1).map((c) => [c, tools.filter((t) => t.category === c).length])), []);

  const visible = useMemo(() => {
    const base = category === 'Favoritos' ? tools.filter((t) => favorites.includes(t.id))
      : category === 'Recientes' ? recent.map((id) => toolById.get(id)!).filter(Boolean)
      : tools.filter((t) => category === 'Todas' || t.category === category);
    const q = query.trim().toLowerCase();
    return q ? base.filter((t) => `${t.name} ${t.desc} ${t.category}`.toLowerCase().includes(q)) : base;
  }, [category, query, favorites, recent]);

  function select(id: string) {
    setActive(id);
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 5));
    setSidebar(false);
    setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  function toggleFavorite() {
    const next = favorites.includes(active) ? favorites.filter((x) => x !== active) : [...favorites, active];
    setFavorites(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* almacenamiento no disponible */ }
  }

  const title = category === 'Todas' ? 'Todas las herramientas' : category === 'Favoritos' ? 'Tus favoritas' : category === 'Recientes' ? 'Usadas recientemente' : category;
  const emptyMessage = query ? 'No hay herramientas que coincidan con tu búsqueda.'
    : category === 'Favoritos' ? 'Todavía no tienes favoritos. Marca la estrella de una herramienta.'
    : category === 'Recientes' ? 'Aún no has usado ninguna herramienta en esta sesión.'
    : 'No hay herramientas en esta categoría.';

  return (
    <div className={dark ? 'app dark' : 'app light'}>
      <Sidebar open={sidebar} onClose={() => setSidebar(false)} category={category} onCategory={(c) => { setCategory(c); setSidebar(false); }}
        categories={categories} counts={counts} total={tools.length} favoritesCount={favorites.length} />
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebar(true)} aria-label="Abrir menú"><Menu /></button>
          <div className="breadcrumbs">Workspace <span>/</span> <b>{title}</b></div>
          <div className="top-actions">
            <span className="local-pill"><i /> LOCAL*</span>
            <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Cambiar tema">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="avatar">DT</div>
          </div>
        </header>
        <div className="content">
          <Explorer query={query} onQuery={setQuery} title={title} visible={visible} active={active} favorites={favorites} emptyMessage={emptyMessage} onSelect={select} />
          <ToolWorkspace key={tool.id} ref={workspaceRef} tool={tool} favorite={favorites.includes(tool.id)} onToggleFavorite={toggleFavorite} />
          <footer><span>© 2026 DevTools Toolbox</span><span>Hecho para trabajar mejor <b>✦</b></span></footer>
        </div>
      </main>
    </div>
  );
}
