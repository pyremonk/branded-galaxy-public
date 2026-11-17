import { useState, useEffect, useRef, useCallback } from 'react';
import helpArticles from '../../core/help-articles.json';
import './HelpPanel.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

const CATEGORIES = [
  { id: 'galaxy',    label: 'Galaxy' },
  { id: 'factions',  label: 'Factions' },
  { id: 'characters',label: 'Characters' },
  { id: 'fleets',    label: 'Fleets' },
  { id: 'bases',     label: 'Bases' },
  { id: 'missions',  label: 'Missions' },
  { id: 'diplomacy', label: 'Diplomacy' },
  { id: 'combat',    label: 'Combat' },
  { id: 'research',  label: 'Research' },
  { id: 'victory',   label: 'Victory' },
  { id: 'game-loop', label: 'Game Loop' },
  { id: 'intel',     label: 'Intel' },
  { id: 'events',    label: 'Events' },
  { id: 'save-load', label: 'Save / Load' },
  { id: 'glossary',  label: 'Glossary' },
];

/**
 * Render article body — supports **bold**, and [text](articleId) cross-links.
 */
function ArticleBody({ body, onNavigate }: any) {
  const parts = [];
  // Split on **bold** and [text](id) patterns
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else {
      // [text](articleId)
      const articleId = match[3];
      parts.push(
        <button
          key={match.index}
          className="help-crossref"
          onClick={() => onNavigate(articleId)}
        >
          {match[2]}
        </button>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return <p className="help-article-body">{parts}</p>;
}

/**
 * HelpPanel — full-screen modal help browser.
 *
 * Props:
 *   isOpen   boolean
 *   onClose  () => void
 */
export function HelpPanel({ isOpen, onClose }: any) {
  useBlockPhaserInput();
  const [query,           setQuery]           = useState('');
  const [activeCategory,  setActiveCategory]  = useState(CATEGORIES[0].id);
  const [activeArticleId, setActiveArticleId] = useState(helpArticles[0]?.id ?? null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus search when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: any) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, onClose]);

  const navigate = useCallback((articleId: any) => {
    const article = helpArticles.find(a => a.id === articleId);
    if (!article) return;
    setActiveArticleId(articleId);
    setActiveCategory(article.categoryId);
    setQuery('');
  }, []);

  const filteredArticles = query.trim()
    ? helpArticles.filter(a =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.body.toLowerCase().includes(query.toLowerCase())
      )
    : helpArticles.filter(a => a.categoryId === activeCategory);

  const activeArticle = helpArticles.find(a => a.id === activeArticleId) ?? filteredArticles[0] ?? null;

  if (!isOpen) return null;

  return (
    <div className="help-backdrop" role="dialog" aria-modal="true" aria-label="Help">
      <div className="help-modal">
        {/* Header */}
        <div className="help-header">
          <span className="help-logo">?</span>
          <span className="help-title">Help &amp; Reference</span>
          <input
            ref={searchRef}
            className="help-search"
            type="text"
            placeholder="Search help…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search help articles"
          />
          <button className="help-close" onClick={onClose} aria-label="Close help">✕</button>
        </div>

        {/* Body: sidebar + content */}
        <div className="help-body">
          {/* Category sidebar */}
          <nav className="help-sidebar" aria-label="Help categories">
            {query.trim() ? (
              <div className="help-sidebar-search-label">Search results</div>
            ) : (
              CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`help-cat-btn${activeCategory === cat.id ? ' help-cat-btn--active' : ''}`}
                  onClick={() => { setActiveCategory(cat.id); setQuery(''); }}
                >
                  {cat.label}
                </button>
              ))
            )}
            {query.trim() && filteredArticles.map(a => (
              <button
                key={a.id}
                className={`help-cat-btn${activeArticleId === a.id ? ' help-cat-btn--active' : ''}`}
                onClick={() => navigate(a.id)}
              >
                {a.title}
              </button>
            ))}
          </nav>

          {/* Article list + viewer */}
          <div className="help-content">
            {/* Article list (only shown when not searching) */}
            {!query.trim() && (
              <div className="help-article-list">
                {filteredArticles.map(a => (
                  <button
                    key={a.id}
                    className={`help-article-item${activeArticleId === a.id ? ' help-article-item--active' : ''}`}
                    onClick={() => setActiveArticleId(a.id)}
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            )}

            {/* Article viewer */}
            <div className="help-article-pane">
              {activeArticle ? (
                <>
                  <h2 className="help-article-title">{activeArticle.title}</h2>
                  <ArticleBody body={activeArticle.body} onNavigate={navigate} />
                </>
              ) : (
                <p className="help-empty">No articles found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
