import { useState, useRef, useCallback } from 'react';
import { LoginPanel } from './LoginPanel.jsx';
import { FEATURES as FLAGS } from '../../core/feature-flags.js';
import updates from '../data/updates.json';
import './LandingPage.css';

const BASE = import.meta.env.BASE_URL;

// Feature showcase data
const FEATURES = [
  {
    id: 'galaxy',
    icon: '\u2B21',           // ⬡  hexagon (hyperspace lane)
    iconColor: '#58a6ff',
    title: 'Procedural Galaxy',
    description:
      'Every game seeds a unique galaxy of star systems connected by hyperspace lanes. Discover chokepoints, trade hubs, research facilities, and strategic strongholds — no two galaxies are alike.',
    screenshot: 'galaxy-map.png',
  },
  {
    id: 'factions',
    icon: '\u2605',           // ★
    iconColor: '#d29922',
    title: 'Three Asymmetric Factions',
    description:
      'Brand Authority dominates through economic leverage and loyalty manipulation. Union wins through covert tactics and diplomacy. Autoforge expands rapidly with synthetic production.',
    screenshot: 'factions.png',
  },
  {
    id: 'fleet',
    icon: '\u25B6',           // ▶  in-transit
    iconColor: '#3fb950',
    title: 'Fleet Combat & Missions',
    description:
      'Command fleets across hyperspace lanes or direct-travel routes. Deploy characters on covert missions — capture enemy leaders, sabotage installations, gather intelligence.',
    screenshot: 'fleet-combat.png',
  },
  {
    id: 'multiplayer',
    icon: '\u27F3',           // ⟳  sync
    iconColor: '#58a6ff',
    title: 'Turn-Based ↔ Realtime Multiplayer',
    description:
      'Built for small friend groups. Play turns throughout the day; the game resolves each turn when all players complete their orders. Switch to real-time sync mode when everyone is online.',
    screenshot: 'multiplayer.png',
  },
];

// Category styles for update badges
const CATEGORY_META: Record<string, { label: string; className: string }> = {
  release:  { label: 'Release',  className: 'upd-badge--release' },
  devlog:   { label: 'Devlog',   className: 'upd-badge--devlog'  },
  patch:    { label: 'Patch',    className: 'upd-badge--patch'   },
};

const UPDATES_INITIAL_COUNT = 3;

function FeatureCard({ feature }: any) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgSrc = `${BASE}screenshots/${feature.screenshot}`;

  return (
    <div className="feat-card">
      <div className="feat-media">
        {!imgFailed ? (
          <img
            src={imgSrc}
            alt={feature.title}
            className="feat-img"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="feat-icon-placeholder" style={{ color: feature.iconColor }}>
            {feature.icon}
          </div>
        )}
      </div>
      <div className="feat-body">
        <h3 className="feat-title" style={{ color: feature.iconColor }}>
          <span className="feat-title-icon">{feature.icon}</span>
          {feature.title}
        </h3>
        <p className="feat-desc">{feature.description}</p>
      </div>
    </div>
  );
}

function UpdateCard({ entry }: any) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[entry.category] || { label: entry.category, className: '' };

  const dateStr = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <article className="upd-card">
      <div className="upd-header">
        <span className={`upd-badge ${meta.className}`}>{meta.label}</span>
        <time className="upd-date" dateTime={entry.date}>{dateStr}</time>
      </div>
      <h3 className="upd-title">{entry.title}</h3>
      <p className={`upd-body ${expanded ? 'upd-body--expanded' : ''}`}>{entry.body}</p>
      {entry.body.length > 180 && (
        <button className="upd-toggle" onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}

/**
 * LandingPage — Two-column marketing landing page.
 * Left column: hero, features, updates/devlog.
 * Right column: sticky login/sign-up panel.
 *
 * Props:
 *   onAuthSuccess — () => void
 */
export function LandingPage({ onAuthSuccess }: any) {
  const [loginView, setLoginView] = useState('signin');
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const authPanelRef = useRef<HTMLDivElement | null>(null);

  const handleSignUpCTA = useCallback(() => {
    setLoginView('signup');
    if (authPanelRef.current) {
      authPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const visibleUpdates = showAllUpdates ? updates : updates.slice(0, UPDATES_INITIAL_COUNT);

  return (
    <div className="landing-root">
      <div className="landing-inner">

        {/* ── Hero row: marketing copy + auth panel ─────────────────────── */}
        <div className="hero-row">
          <section className="hero">
            <div className="hero-eyebrow">Compact Strategy &bull; Sci-Fi Universe &bull; Turn-Based ↔ Realtime Gameplay</div>
            <h1 className="hero-title">BRANDED<br />GALAXY</h1>
            <p className="hero-tagline">Command. Conquer. Persist.</p>
            <p className="hero-pitch">
              A compact strategy game where you manage fleets, resources, and planets across a
              procedurally-generated galaxy. Inspired by classic space strategy, built for
              small friend groups who want depth without waiting for schedules to align or
              require an overwhelming time-commitment.
            </p>
            <div className="hero-actions">
              <button className="hero-cta hero-cta--primary" onClick={handleSignUpCTA}>
                {FLAGS.SIGNUPS ? 'Sign Up Free' : 'Request Access'}
              </button>
              <a className="hero-cta hero-cta--secondary" href="#updates">
                View latest updates
              </a>
            </div>
          </section>

          <div className="hero-auth" ref={authPanelRef}>
            <div className="login-col-header">
              <div className="login-col-logo">BG</div>
              <p className="login-col-sub">Sign in to play</p>
            </div>
            <LoginPanel
              onAuthSuccess={onAuthSuccess}
              initialView={loginView}
            />
            <p className="login-col-new">
              {FLAGS.SIGNUPS ? 'New to the galaxy?' : 'Want to play?'}{' '}
              <button className="login-col-link" onClick={handleSignUpCTA}>
                {FLAGS.SIGNUPS ? 'Create a free account' : 'Request access'}
              </button>
            </p>
          </div>
        </div>

        {/* Features */}
        <section className="features">
          <h2 className="section-heading">Features</h2>
          <div className="feat-grid">
            {FEATURES.map(f => <FeatureCard key={f.id} feature={f} />)}
          </div>
        </section>

        {/* Updates */}
        <section id="updates" className="updates">
          <h2 className="section-heading">Updates</h2>
          <div className="upd-list">
            {visibleUpdates.map(entry => (
              <UpdateCard key={entry.id} entry={entry} />
            ))}
          </div>
          {updates.length > UPDATES_INITIAL_COUNT && (
            <button
              className="upd-show-more"
              onClick={() => setShowAllUpdates(v => !v)}
            >
              {showAllUpdates
                ? '\u25B2 Show fewer'
                : `\u25BC Show all ${updates.length} updates`}
            </button>
          )}
        </section>

        <footer className="landing-footer">
          <span>Branded Galaxy &copy; {new Date().getFullYear()}</span>
        </footer>

      </div>
    </div>
  );
}
