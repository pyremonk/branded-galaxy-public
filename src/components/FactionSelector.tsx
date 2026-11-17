import React, { useState, useEffect } from 'react';
import { FactionDefinitionLoader } from '../../core/faction-loader.js';
import { BonusApplier } from '../../core/bonus-applier.js';
import './FactionSelector.css';

// ─── FactionCard ──────────────────────────────────────────────────────────────

function FactionCard({ faction, selected, hovered, onClick, onHoverEnter, onHoverLeave }: any) {
  return (
    <div
      className={`faction-card ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''}`}
      style={{ '--faction-color': faction.color.primary, '--faction-accent': faction.color.accent } as any}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="faction-card-icon" aria-hidden="true">
        <FactionEmblem factionId={faction.id} color={faction.color.primary} />
      </div>
      <h2 className="faction-card-name">{faction.displayName}</h2>
      <p className="faction-card-difficulty">
        Difficulty: <span className={`difficulty-${faction.difficulty}`}>{capitalize(faction.difficulty)}</span>
      </p>
      <p className="faction-card-description">{faction.description.slice(0, 100)}…</p>
    </div>
  );
}

// ─── FactionEmblem ─────────────────────────────────────────────────────────────

function FactionEmblem({ factionId, color }: any) {
  const size = 64;
  switch (factionId) {
    case 'brandAuthority':
      // Corporate diamond / shield emblem
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Brand Authority emblem">
          <polygon points="32,4 60,20 60,44 32,60 4,44 4,20" stroke={color} strokeWidth="3" fill="none" opacity="0.9"/>
          <polygon points="32,14 50,24 50,40 32,50 14,40 14,24" fill={color} opacity="0.25"/>
          <line x1="32" y1="4" x2="32" y2="60" stroke={color} strokeWidth="1.5" opacity="0.5"/>
          <line x1="4" y1="20" x2="60" y2="44" stroke={color} strokeWidth="1.5" opacity="0.5"/>
          <line x1="4" y1="44" x2="60" y2="20" stroke={color} strokeWidth="1.5" opacity="0.5"/>
          <circle cx="32" cy="32" r="6" fill={color} opacity="0.9"/>
        </svg>
      );
    case 'union':
      // Resistance fist / uprising symbol
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="The Union emblem">
          <circle cx="32" cy="32" r="28" stroke={color} strokeWidth="2.5" fill="none" opacity="0.8"/>
          <circle cx="32" cy="32" r="18" stroke={color} strokeWidth="1.5" fill="none" opacity="0.4"/>
          {/* Upward arrows symbolizing uprising */}
          <path d="M22 42 L32 16 L42 42" stroke={color} strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
          <path d="M24 36 L32 16 L40 36" fill={color} opacity="0.3"/>
          <line x1="22" y1="42" x2="42" y2="42" stroke={color} strokeWidth="2.5"/>
        </svg>
      );
    case 'autoforge':
      // Gear / circuit node emblem
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="The Autoforge emblem">
          <circle cx="32" cy="32" r="12" stroke={color} strokeWidth="2.5" fill="none" opacity="0.9"/>
          <circle cx="32" cy="32" r="5" fill={color} opacity="0.9"/>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 32 + Math.cos(rad) * 12;
            const y1 = 32 + Math.sin(rad) * 12;
            const x2 = 32 + Math.cos(rad) * 26;
            const y2 = 32 + Math.sin(rad) * 26;
            const xTip = 32 + Math.cos(rad) * 29;
            const yTip = 32 + Math.sin(rad) * 29;
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" opacity="0.7"/>
                <rect
                  x={xTip - 3} y={yTip - 3}
                  width="6" height="6"
                  fill={color} opacity="0.6"
                  transform={`rotate(${deg}, ${xTip}, ${yTip})`}
                />
              </g>
            );
          })}
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke={color} strokeWidth="2" fill="none"/>
          <circle cx="32" cy="32" r="8" fill={color} opacity="0.7"/>
        </svg>
      );
  }
}

// ─── FactionDetails ─────────────────────────────────────────────────────────────

function FactionDetails({ faction }: any) {
  if (!faction) {
    return (
      <div className="faction-details faction-details--empty">
        <p>Select a faction to view details</p>
      </div>
    );
  }

  return (
    <div className="faction-details" style={{ '--faction-color': faction.color.primary, '--faction-accent': faction.color.accent } as any}>
      <div className="faction-details-header">
        <FactionEmblem factionId={faction.id} color={faction.color.primary} />
        <div>
          <h2>{faction.displayName}</h2>
          <span className={`difficulty-badge difficulty-${faction.difficulty}`}>
            {capitalize(faction.difficulty)}
          </span>
        </div>
      </div>

      <p className="faction-details-description">{faction.description}</p>

      <section className="faction-section">
        <h3>Background</h3>
        <p>{faction.lore.origin}</p>
        <p>{faction.lore.motivations}</p>
        <p><em>{faction.lore.leadership}</em></p>
      </section>

      <div className="faction-two-col">
        <section className="faction-section faction-section--bonuses">
          <h3>Strengths</h3>
          <ul>
            {Object.entries(faction.bonuses).map(([key, value]) => (
              <li key={key}>{BonusApplier.formatBonus(key, value)}</li>
            ))}
          </ul>
        </section>

        <section className="faction-section faction-section--restrictions">
          <h3>Weaknesses</h3>
          <ul>
            {Object.entries(faction.restrictions).map(([key, value]) => (
              <li key={key}>{BonusApplier.formatRestriction(key, value)}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="faction-section">
        <h3>Starting Resources</h3>
        <div className="resources-grid">
          {(Object.entries(faction.startingConditions.resources) as [string, any][]).map(([res, val]) => (
            <div key={res} className="resource-item">
              <span className="resource-label">{capitalize(res)}</span>
              <span className="resource-value">{val.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="faction-section">
        <h3>Victory Paths</h3>
        <ul className="victory-list">
          {faction.victoryConditions.map((vc: any) => (
            <li key={vc}>{formatVictoryCondition(vc)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── FactionSelector ─────────────────────────────────────────────────────────────

export default function FactionSelector({ onFactionSelected }: any) {
  const [factions, setFactions] = useState<any[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<any>(null);
  const [hoveredFaction, setHoveredFaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const defs = FactionDefinitionLoader.getAllFactions();
      setFactions(defs);
    } catch (err) {
      console.error('[FactionSelector] Failed to load factions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirm = () => {
    if (selectedFaction) {
      onFactionSelected(selectedFaction);
    }
  };

  if (loading) {
    return (
      <div className="faction-selector faction-selector--loading">
        <p>Loading factions…</p>
      </div>
    );
  }

  const detailFaction = hoveredFaction || selectedFaction;

  return (
    <div className="faction-selector">
      <div className="faction-selector-header">
        <h1>Choose Your Faction</h1>
        <p className="faction-selector-subtitle">
          Your choice is permanent. Study each faction carefully before committing.
        </p>
      </div>

      <div className="faction-selector-body">
        <div className="faction-grid">
          {factions.map(faction => (
            <FactionCard
              key={faction.id}
              faction={faction}
              selected={selectedFaction?.id === faction.id}
              hovered={hoveredFaction?.id === faction.id}
              onClick={() => setSelectedFaction(faction)}
              onHoverEnter={() => setHoveredFaction(faction)}
              onHoverLeave={() => setHoveredFaction(null)}
            />
          ))}
        </div>

        <FactionDetails faction={detailFaction} />
      </div>

      <div className="faction-selector-footer">
        <button
          className="confirm-btn"
          onClick={handleConfirm}
          disabled={!selectedFaction}
          style={selectedFaction ? ({ '--faction-color': selectedFaction.color.primary } as any) : undefined}
        >
          {selectedFaction
            ? `Confirm — ${selectedFaction.displayName}`
            : 'Select a Faction to Continue'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str: any) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatVictoryCondition(id: any) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c: any) => c.toUpperCase());
}
