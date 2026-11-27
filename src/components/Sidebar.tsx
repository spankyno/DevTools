import { Clock3, Code2, Sparkles, Star, X } from 'lucide-react';

type Props = {
  open: boolean; onClose: () => void;
  category: string; onCategory: (c: string) => void;
  categories: string[]; counts: Record<string, number>;
  total: number; favoritesCount: number;
};

export default function Sidebar({ open, onClose, category, onCategory, categories, counts, total, favoritesCount }: Props) {
  const nav = (id: string) => (category === id ? 'nav active' : 'nav');
  return (
    <aside className={open ? 'sidebar show' : 'sidebar'}>
      <div className="brand">
        <div className="brand-mark"><Code2 size={22} /></div>
        <div><b>DevTools</b><span>TOOLBOX</span></div>
        <button className="mobile-close" onClick={onClose} aria-label="Cerrar menú"><X /></button>
      </div>
      <div className="side-label">ESPACIO DE TRABAJO</div>
      <button className={nav('Todas')} onClick={() => onCategory('Todas')}><Sparkles size={17} /> Todas las herramientas <span>{total}</span></button>
      <button className={nav('Favoritos')} onClick={() => onCategory('Favoritos')}><Star size={17} /> Favoritos <span>{favoritesCount}</span></button>
      <button className={nav('Recientes')} onClick={() => onCategory('Recientes')}><Clock3 size={17} /> Recientes</button>
      <div className="side-label categories-label">CATEGORÍAS</div>
      <div className="category-list">
        {categories.slice(1).map((c) => (
          <button key={c} className={category === c ? 'category active' : 'category'} onClick={() => onCategory(c)}><i />{c}<span>{counts[c]}</span></button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-card">
          <div className="privacy-icon">✦</div><b>Privacidad primero</b>
          <p>La mayoría de herramientas funcionan localmente en tu navegador. Tus datos permanecen en tu dispositivo.</p>
        </div>
        <div className="version">DEVTOOLS TOOLBOX <span>v1.2.0</span></div>
      </div>
    </aside>
  );
}
