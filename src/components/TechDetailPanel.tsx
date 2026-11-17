import { useEffect, useCallback, useState } from 'react';
import { RESOURCE_ICONS } from '../icons.js';
import './TechDetailPanel.css';
import { useGameTime } from '../contexts/GameTimeContext.jsx';
import { formatDuration } from '../utils/time-format.js';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

const EFFECT_LABELS: Record<string, (e: any) => string> = {
  'production-bonus':  (e: any) => `+${Math.round(e.value * 100)}% ${formatTarget(e.target)}`,
  'military-bonus':    (e: any) => `+${Math.round(e.value * 100)}% ${formatTarget(e.target)}`,
  'storage-cap-bonus': (e: any) => `+${Math.round(e.value * 100)}% ${e.target === 'all' ? 'All Resource Caps' : `${formatTarget(e.target)} Cap`}`,
  'mission-bonus':     (e: any) => `+${Math.round(e.value * 100)}% ${formatTarget(e.target)}`,
  'research-bonus':    (e: any) => `+${Math.round(e.value * 100)}% ${formatTarget(e.target)}`,
  'cost-reduction':    (e: any) => `-${Math.round(e.value * 100)}% ${formatTarget(e.target)}`,
  'unique-capability': (e: any) => `Unique: ${formatTarget(e.target)}`,
  'multi-research':    (e: any) => `Unlocks ${e.value} Simultaneous Research Slots`
};

const TARGET_LABELS: Record<string, string> = {
  fleetProductionSpeed:      'Fleet Production Speed',
  creditIncome:              'Credit Income',
  materialProduction:        'Materials Production',
  recruitGeneration:         'Recruit Generation',
  influenceGeneration:       'Influence Generation',
  tradeHubBonus:             'Trade Hub Bonus',
  specialLocationOutput:     'Special Location Output',
  fighterProduction:         'Fighter Production',
  facilityConstructionSpeed: 'Facility Construction Speed',
  autoforgeSytemOutput:      'Autoforge System Output',
  systemDependencyGain:      'System Dependency Gain',
  liberationLoyaltyGain:     'Liberation Loyalty Gain',
  diplomacyEffectiveness:    'Diplomacy Effectiveness',
  shipCombatPower:           'Ship Combat Power',
  defenseRating:             'Defense Rating',
  fleetCapacity:             'Fleet Capacity',
  defensiveCombatPower:      'Defensive Combat Power',
  espionageSuccess:          'Espionage Success',
  sabotageSuccess:           'Sabotage Success',
  diplomacySuccess:          'Diplomacy Success Rate',
  sabotageDefense:           'Sabotage Defense',
  researchSpeed:             'Research Speed',
  researchCostModifier:      'Research Cost',
  constructionCost:          'Construction Cost',
  researchCost:              'Research Cost',
  missionCost:               'Mission Cost',
  'loyalty-decay-elimination':     'No Loyalty Decay',
  'remote-system-management':      'Remote System Management',
  'influence-to-credits-conversion': 'Influence → Credits Conversion',
  'reduced-ship-maintenance':       'Reduced Ship Maintenance',
  'reduced-loyalty-decay':          'Reduced Loyalty Decay',
  'extra-secret-bases':             'Extra Secret Bases',
  'free-combat-retreat':            'Free Combat Retreat',
  'instant-loyalty-chance':         'Instant Loyalty Conversion',
  'galaxy-wide-uprising':           'Galaxy-Wide Uprising',
  'zero-resource-cap-waste':        'Zero Resource Cap Waste',
  'zero-fleet-upkeep':              'Zero Fleet Upkeep',
  'networked-systems':              'Networked Systems',
  'building-auto-repair':           'Buildings Auto-Repair',
  'reduced-fleet-maintenance':      'Reduced Fleet Maintenance',
  'auto-complete-lower-tiers':      'Auto-Completes All Tier 1-4 Techs',
  researchSlots:            'Research Slots'
};

function formatTarget(target: any) {
  return TARGET_LABELS[target] ?? target.replace(/-/g, ' ').replace(/\b\w/g, (c: any) => c.toUpperCase());
}

function formatEffectLabel(effect: any) {
  const fn = EFFECT_LABELS[effect.type];
  return fn ? fn(effect) : `${effect.type}: ${effect.target} (${effect.value})`;
}

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#f0883e',
  autoforge:      '#3fb950'
};

/**
 * TechDetailPanel — information panel for a clicked technology node.
 *
 * Props:
 *   factionId   {string}
 *   tech        {Object}    Tech definition from TechTreeLoader
 *   techNodeState  {string} 'locked' | 'available' | 'researching' | 'completed'
 *   activeProject  {Object|null}  Active research project if researching
 *   onClose     {Function}
 */
export default function TechDetailPanel({ factionId, tech, techNodeState, activeProject, onClose }: any) {
  useBlockPhaserInput();
  const { mode, ticksPerSecond, ticksPerTurn } = useGameTime();
  const [actionResult, setActionResult] = useState<any>(null);
  const [techState, setTechState]       = useState<any>({ completedTechnologies: [], researchQueue: [], multiResearchSlots: 1 });
  const [resources, setResources]       = useState<any>({});
  const factionColor = FACTION_COLORS[factionId] ?? '#58a6ff';

  // Subscribe to tech and resource updates
  useEffect(() => {
    const techHandler = (e: any) => {
      if (e.detail?.factionId === factionId) {
        setTechState({
          completedTechnologies:  e.detail.completedTechnologies  ?? [],
          activeResearchProjects: e.detail.activeResearchProjects ?? [],
          researchQueue:          e.detail.researchQueue          ?? [],
          multiResearchSlots:     e.detail.multiResearchSlots     ?? 1
        });
      }
    };
    const resHandler = (e: any) => {
      if (e.detail?.factionId === factionId) {
        setResources(e.detail.resources ?? {});
      }
    };
    window.addEventListener('game:techUpdate', techHandler);
    window.addEventListener('galaxy:resourceUpdate', resHandler);
    return () => {
      window.removeEventListener('game:techUpdate', techHandler);
      window.removeEventListener('galaxy:resourceUpdate', resHandler);
    };
  }, [factionId]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: any) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Listen for begin-research result
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.techId === tech?.id) {
        setActionResult(e.detail.success ? null : { error: e.detail.error });
        if (e.detail.success) onClose?.();
      }
    };
    window.addEventListener('game:beginResearchResult', handler);
    return () => window.removeEventListener('game:beginResearchResult', handler);
  }, [tech?.id, onClose]);

  if (!tech) return null;

  // Compute faction cost modifier display
  const FACTION_MODIFIERS: Record<string, number> = { brandAuthority: 1.10, union: 1.00, autoforge: 0.80 };
  const modifier = FACTION_MODIFIERS[factionId] ?? 1.00;
  const displayCredits   = Math.max(1, Math.floor(tech.cost.credits   * modifier));
  const displayInfluence = Math.max(1, Math.floor(tech.cost.influence * modifier));

  const hasCredits   = (resources.credits   ?? 0) >= displayCredits;
  const hasInfluence = (resources.influence ?? 0) >= displayInfluence;
  const canAfford    = hasCredits && hasInfluence;

  const isSlotsFull = (techState.activeResearchProjects?.length ?? 0) >= (techState.multiResearchSlots ?? 1);
  const isQueueFull = (techState.researchQueue?.length ?? 0) >= 3;
  const isQueued    = techState.researchQueue?.includes(tech.id);

  const prereqComplete = (tech.prerequisites ?? []).map((reqId: any) => ({
    id: reqId,
    met: techState.completedTechnologies.includes(reqId)
  }));
  const allPrereqsMet = prereqComplete.every((p: any) => p.met);

  function handleBeginResearch() {
    window.dispatchEvent(new CustomEvent('game:beginResearch', {
      detail: { factionId, techId: tech.id }
    }));
    window.dispatchEvent(new CustomEvent('galaxy:researchStarted'));
  }

  function handleQueue() {
    window.dispatchEvent(new CustomEvent('game:queueResearch', {
      detail: { factionId, techId: tech.id }
    }));
    window.dispatchEvent(new CustomEvent('galaxy:researchStarted'));
    onClose?.();
  }

  function getButtonState() {
    if (!allPrereqsMet)            return { text: 'Locked', disabled: true, tooltip: `Complete prerequisites: ${prereqComplete.filter((p: any) => !p.met).map((p: any) => p.id).join(', ')}` };
    if (techNodeState === 'researching') return { text: 'Researching…', disabled: true, tooltip: 'Currently in research' };
    if (techNodeState === 'completed')   return { text: 'Completed',    disabled: true, tooltip: 'Already researched' };
    if (!canAfford)                return { text: 'Begin Research', disabled: true, tooltip: `${!hasCredits ? `Need ${displayCredits - (resources.credits ?? 0)} more Credits` : ''}${!hasCredits && !hasInfluence ? ' & ' : ''}${!hasInfluence ? `Need ${displayInfluence - (resources.influence ?? 0)} more Influence` : ''}` };
    if (isSlotsFull)               return { text: 'Add to Queue', disabled: false, isQueue: true, tooltip: isQueueFull ? 'Queue full (max 3)' : 'Add to research queue' };
    return { text: 'Begin Research', disabled: false };
  }

  const btnState = getButtonState();

  const modifierLabel = modifier > 1 ? `+${Math.round((modifier - 1) * 100)}% faction cost`
                      : modifier < 1 ? `-${Math.round((1 - modifier) * 100)}% faction cost`
                      : null;

  return (
    <div className="tech-detail-panel" role="dialog" aria-label={`Tech details: ${tech.name}`}>
      <div className="tech-detail-panel__overlay" onClick={onClose} />
      <div className="tech-detail-panel__content" style={({ '--faction-color': factionColor } as any)}>
        {/* Header */}
        <div className="tech-detail-panel__header">
          <span className="tech-detail-panel__icon">{tech.icon}</span>
          <div className="tech-detail-panel__titles">
            <h3 className="tech-detail-panel__name">{tech.name}</h3>
            <span className="tech-detail-panel__tier">Tier {tech.tier}</span>
          </div>
          <button className="tech-detail-panel__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Description */}
        <p className="tech-detail-panel__desc">{tech.description}</p>

        {/* Cost */}
        <div className="tech-detail-panel__section">
          <div className="tech-detail-panel__section-title">Research Cost</div>
          <div className="tech-detail-panel__cost-row">
            <span className={`tech-detail-panel__cost-item ${!hasCredits ? 'insufficient' : ''}`}>
              {RESOURCE_ICONS.credits} <strong>{displayCredits.toLocaleString()}</strong> Credits
            </span>
            <span className={`tech-detail-panel__cost-item ${!hasInfluence ? 'insufficient' : ''}`}>
              {RESOURCE_ICONS.influence} <strong>{displayInfluence.toLocaleString()}</strong> Influence
            </span>
            <span className="tech-detail-panel__cost-item">
              &#x21BB; <strong>{formatDuration(tech.cost.turns, mode, ticksPerSecond, ticksPerTurn)}</strong>
            </span>
          </div>
          {modifierLabel && (
            <div className="tech-detail-panel__modifier-note">({modifierLabel})</div>
          )}
        </div>

        {/* Prerequisites */}
        {tech.prerequisites.length > 0 && (
          <div className="tech-detail-panel__section">
            <div className="tech-detail-panel__section-title">Prerequisites</div>
            <ul className="tech-detail-panel__prereq-list">
              {prereqComplete.map((p: any) => (
                <li key={p.id} className={`tech-detail-panel__prereq ${p.met ? 'met' : 'unmet'}`}>
                  {p.met ? '✓' : '✗'} {p.id}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Effects */}
        <div className="tech-detail-panel__section">
          <div className="tech-detail-panel__section-title">Effects</div>
          <ul className="tech-detail-panel__effects-list">
            {tech.effects.map((e: any, i: any) => (
              <li key={i} className="tech-detail-panel__effect">{formatEffectLabel(e)}</li>
            ))}
          </ul>
        </div>

        {/* Unlocks */}
        {([...tech.unlocks.units, ...tech.unlocks.buildings, ...tech.unlocks.missions].length > 0) && (
          <div className="tech-detail-panel__section">
            <div className="tech-detail-panel__section-title">Unlocks</div>
            <div className="tech-detail-panel__unlocks">
              {tech.unlocks.units.map((u: any)      => <span key={u}      className="unlock-badge unlock-badge--unit">⚔ {u}</span>)}
              {tech.unlocks.buildings.map((b: any)  => <span key={b}      className="unlock-badge unlock-badge--building">🏛 {b}</span>)}
              {tech.unlocks.missions.map((m: any)   => <span key={m}      className="unlock-badge unlock-badge--mission">📋 {m}</span>)}
            </div>
          </div>
        )}

        {/* Active research progress */}
        {activeProject && (
          <div className="tech-detail-panel__section">
            <div className="tech-detail-panel__section-title">Research Progress</div>
            <div className="tech-detail-panel__progress-row">
              <div className="tech-detail-panel__progress-bar">
                <div
                  className="tech-detail-panel__progress-fill"
                  style={{ width: `${Math.round(((activeProject.totalTurns - activeProject.turnsRemaining) / activeProject.totalTurns) * 100)}%` }}
                />
              </div>
              <span className="tech-detail-panel__progress-label">
                {formatDuration(activeProject.turnsRemaining, mode, ticksPerSecond, ticksPerTurn)} remaining
              </span>
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="tech-detail-panel__actions">
          {actionResult?.error && (
            <div className="tech-detail-panel__error">{actionResult.error}</div>
          )}
          <button
            className={`tech-detail-panel__btn ${btnState.disabled ? 'disabled' : 'primary'}`}
            disabled={btnState.disabled || (btnState.isQueue && isQueueFull)}
            title={btnState.tooltip ?? ''}
            onClick={btnState.isQueue ? handleQueue : handleBeginResearch}
          >
            {btnState.text}
          </button>
          {/* Also offer queue when able to begin, as an alternative */}
          {!isSlotsFull && techNodeState === 'available' && allPrereqsMet && !isQueued && (
            <button
              className="tech-detail-panel__btn secondary"
              disabled={isQueueFull}
              title={isQueueFull ? 'Queue full (max 3)' : 'Add to queue'}
              onClick={handleQueue}
            >
              + Queue
            </button>
          )}
          {isQueued && (
            <span className="tech-detail-panel__queued-badge">📋 Queued</span>
          )}
        </div>
      </div>
    </div>
  );
}
