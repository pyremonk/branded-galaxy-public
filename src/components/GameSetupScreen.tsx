/**
 * GameSetupScreen — combined single-page game configuration.
 * Merges former GameSetupScreen (mode + difficulty) and GalaxySetupScreen
 * (seed, scenario, combat mode, galaxy preview) into one step.
 *
 * Flow: FactionSelector → GameSetupScreen → game launch (or NetworkLobby)
 *
 * Specs: 037-game-mode-selection-spec.md, 038-difficulty-settings-spec.md,
 *        039-galaxy-setup-spec.md
 */
import { useState, useEffect, useCallback } from 'react';
import { GalaxyGenerator } from '../../core/galaxy-generator.js';
import './GameSetupScreen.css';

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Four game mode variants grouped into two display groups.
 * Hot-Seat modes removed. Online modes route to NetworkLobby.
 */
const GAME_MODE_GROUPS = [
  {
    groupId:    'solo',
    groupLabel: 'Solo vs. AI',
    groupIcon:  '\u2605', // ★
    groupColor: '#58a6ff',
    modes: [
      {
        id:          'solo-vs-ai-2faction',
        label:       '2 Factions',
        description: 'You vs. one AI opponent',
      },
      {
        id:          'solo-vs-ai-3faction',
        label:       '3 Factions',
        description: 'You vs. two AI opponents',
      },
    ],
  },
  {
    groupId:    'online',
    groupLabel: 'Online',
    groupIcon:  '\u25c6', // ◆
    groupColor: '#3fb950',
    modes: [
      {
        id:          'network-2p',
        label:       '2 Players',
        description: 'Online \u2014 2 players',
      },
      {
        id:          'network-3p',
        label:       '3 Players',
        description: 'Online \u2014 3 players',
      },
    ],
  },
];

const DIFFICULTY_PRESETS: Record<string, any> = {
  easy: {
    label:                      'Easy',
    icon:                       '\u25cc', // ◌
    galaxySize:                 'small',
    startingResourceMultiplier: 1.5,
    victoryThresholdModifier:   0.80,
    aiDifficulty:               'easy',
    hints: ['Small galaxy', 'High resources', '\u221220% victory thresholds', 'AI: Easy'],
    color: '#3fb950',
  },
  standard: {
    label:                      'Standard',
    icon:                       '\u25ce', // ◎
    galaxySize:                 'medium',
    startingResourceMultiplier: 1.0,
    victoryThresholdModifier:   1.0,
    aiDifficulty:               'medium',
    hints: ['Medium galaxy', 'Standard resources', 'Default thresholds', 'AI: Medium'],
    color: '#58a6ff',
  },
  hard: {
    label:                      'Hard',
    icon:                       '\u25cf', // ●
    galaxySize:                 'large',
    startingResourceMultiplier: 0.75,
    victoryThresholdModifier:   1.15,
    aiDifficulty:               'hard',
    hints: ['Large galaxy', 'Low resources', '+15% victory thresholds', 'AI: Hard'],
    color: '#f85149',
  },
};

const SCENARIOS = [
  {
    id:          'open-galaxy',
    name:        'Open Galaxy',
    icon:        '\u2b21', // ⬡
    description: 'Standard start \u2014 equal opportunity for all factions',
    locked:      false,
  },
  {
    id:          'contested',
    name:        'Contested Galaxy',
    icon:        '\u2295', // ⊕
    description: 'Pre-existing territorial disputes',
    locked:      true,
  },
  {
    id:          'siege',
    name:        'Siege Scenario',
    icon:        '\u2297', // ⊗
    description: 'One faction is already besieged',
    locked:      true,
  },
  {
    id:          'diplomatic',
    name:        'Diplomatic Crisis',
    icon:        '\u25c8', // ◈
    description: 'All factions on the brink of collapse',
    locked:      true,
  },
];

const COMBAT_MODES = [
  {
    id:          'auto_resolve',
    name:        'Auto-Resolve',
    icon:        '\u26a1', // ⚡
    description: 'All fleet engagements are calculated instantly',
    locked:      false,
  },
  {
    id:          'tactical',
    name:        'Tactical Combat',
    icon:        '\u229b', // ⊛
    description: 'Coming Soon',
    locked:      true,
  },
];

// World map dimensions by galaxy size (matches GalaxyGenerator SIZE_CONFIG)
const MAP_DIMS: Record<string, { width: number; height: number }> = {
  small:  { width: 2000, height: 1500 },
  medium: { width: 3000, height: 2000 },
  large:  { width: 4000, height: 3000 },
};

const FACTION_COLORS: Record<string, string> = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#484f58',
};

const FACTION_NAMES: Record<string, string> = {
  brandAuthority: 'Brand Authority',
  union:          'The Union',
  autoforge:      'The Autoforge',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRandomSeed() {
  return crypto.randomUUID();
}

function buildActiveFactions(factionId: any) {
  const all = ['brandAuthority', 'union', 'autoforge'];
  return [factionId, ...all.filter(f => f !== factionId)];
}

/** Returns faction IDs that will be AI-controlled for the selected mode. */
function getAIOpponents(factionId: any, mode: any) {
  const all    = ['brandAuthority', 'union', 'autoforge'];
  const others = all.filter(f => f !== factionId);
  if (mode === 'solo-vs-ai-2faction') return [others[0]];
  if (mode === 'network-2p')          return [others[1]]; // 1 AI fill-in for 3rd faction
  if (mode === 'network-3p')          return [];          // all 3 factions are network players
  return others; // solo-vs-ai-3faction / default
}

/** Returns human-controlled opponent faction IDs for online network modes. */
function getNetworkOpponents(factionId: any, mode: any) {
  const all    = ['brandAuthority', 'union', 'autoforge'];
  const others = all.filter(f => f !== factionId);
  if (mode === 'network-2p') return [others[0]];
  if (mode === 'network-3p') return [others[0], others[1]];
  return [];
}

function isNetworkMode(mode: any) {
  return mode === 'network-2p' || mode === 'network-3p';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * A selectable mode card within a group (e.g. "2 Factions" inside "Solo vs. AI").
 */
function ModeCard({ modeId, label, description, selected, groupColor, onSelect }: any) {
  const cls = [
    'gss-mode-card',
    selected ? 'gss-mode-card--selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      style={({ '--mode-color': groupColor } as any)}
      onClick={() => onSelect(modeId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(modeId)}
    >
      <span className="gss-mode-label">{label}</span>
      <p className="gss-mode-desc">{description}</p>
    </div>
  );
}

/**
 * A difficulty selection card (Easy / Standard / Hard / Custom-locked).
 */
function DifficultyCard({ id, preset, selected, onSelect }: any) {
  const locked = id === 'custom';
  const cls = [
    'gss-diff-card',
    selected ? 'gss-diff-card--selected' : '',
    locked  ? 'gss-diff-card--locked'   : '',
  ].filter(Boolean).join(' ');
  const color = locked ? '#8b949e' : preset.color;

  return (
    <div
      className={cls}
      style={({ '--diff-color': color } as any)}
      onClick={locked ? undefined : () => onSelect(id)}
      role={locked ? 'presentation' : 'button'}
      tabIndex={locked ? -1 : 0}
      onKeyDown={locked ? undefined : (e) => e.key === 'Enter' && onSelect(id)}
    >
      {locked && <span className="gss-lock-badge">{'\u2298'}</span>}
      <div className="gss-diff-header">
        <span className="gss-diff-icon">{locked ? '\u2699' : preset.icon}</span>
        <span className="gss-diff-label" style={{ color }}>{locked ? 'Custom' : preset.label}</span>
      </div>
      {locked ? (
        <p className="gss-diff-hint gss-muted">Coming Soon</p>
      ) : (
        <ul className="gss-diff-hints">
          {preset.hints.map((h: any) => <li key={h}>{h}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * A generic selectable/locked option card (used for Scenario and Combat Mode).
 */
function OptionCard({ item, selected, onSelect }: any) {
  const cls = [
    'gss-option-card',
    selected    ? 'gss-option-card--selected' : '',
    item.locked ? 'gss-option-card--locked'   : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={item.locked ? undefined : () => onSelect(item.id)}
      role={item.locked ? 'presentation' : 'button'}
      tabIndex={item.locked ? -1 : 0}
      onKeyDown={item.locked ? undefined : (e) => e.key === 'Enter' && onSelect(item.id)}
    >
      {item.locked && <span className="gss-lock-badge">{'\u2298'}</span>}
      <span className="gss-option-icon">{item.icon}</span>
      <div className="gss-option-text">
        <span className="gss-option-name">{item.name}</span>
        <span className="gss-option-desc">
          {item.locked ? 'Coming Soon' : item.description}
        </span>
      </div>
    </div>
  );
}

/**
 * Inline SVG minimap — live preview of the generated galaxy.
 */
function GalaxyMinimap({ galaxy, galaxySize }: any) {
  if (!galaxy) {
    return (
      <div className="gss-minimap-loading">
        <span className="gss-minimap-spinner">\u27f3</span>
        <span>Generating galaxy\u2026</span>
      </div>
    );
  }

  const dims = (MAP_DIMS as Record<string, { width: number; height: number }>)[galaxySize] ?? MAP_DIMS.medium;
  const { systems, factionStartingSystems = {} } = galaxy;
  const startingSystemIds = new Set(Object.values(factionStartingSystems).flat());

  // Deduplicate hyperlane edges
  const drawnEdges = new Set();
  const edges = [];
  for (const sys of systems) {
    for (const targetId of sys.connections) {
      const key = [sys.id, targetId].sort().join('|');
      if (!drawnEdges.has(key)) {
        drawnEdges.add(key);
        const target = systems.find((s: any) => s.id === targetId);
        if (target) {
          edges.push({
            x1: sys.position.x, y1: sys.position.y,
            x2: target.position.x, y2: target.position.y,
          });
        }
      }
    }
  }

  return (
    <svg
      className="gss-minimap-svg"
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke="#30363d"
          strokeWidth="6"
        />
      ))}
      {systems.map((sys: any) => {
        const isStart = startingSystemIds.has(sys.id);
        const color   = FACTION_COLORS[sys.loyalty] ?? FACTION_COLORS.neutral;
        return (
          <g key={sys.id}>
            {isStart && (
              <circle
                cx={sys.position.x} cy={sys.position.y}
                r={22}
                fill="none" stroke={color} strokeWidth="6" opacity="0.6"
              />
            )}
            <circle
              cx={sys.position.x} cy={sys.position.y}
              r={isStart ? 14 : 9}
              fill={color}
              opacity={isStart ? 1 : 0.75}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {{ factionDef: object, onConfirm: (enrichedGameConfig: object) => void }} props
 *
 * onConfirm receives the fully-enriched config including preGeneratedGalaxy,
 * so App.jsx can launch the Phaser game immediately without double-generating.
 */
export function GameSetupScreen({ factionDef, onConfirm }: any) {
  // ── Mode & difficulty ──────────────────────────────────────────────────────
  const [selectedMode,       setSelectedMode]       = useState<any>('solo-vs-ai-3faction');
  const [selectedDifficulty, setSelectedDifficulty] = useState<any>('standard');

  // ── Galaxy seed ───────────────────────────────────────────────────────────
  const [seedMode,   setSeedMode]   = useState<any>('random');
  const [seedInput,  setSeedInput]  = useState('');
  const [activeSeed, setActiveSeed] = useState<any>(() => generateRandomSeed());
  const [copied,     setCopied]     = useState(false);

  // ── Galaxy preview ────────────────────────────────────────────────────────
  const [generatedGalaxy, setGeneratedGalaxy] = useState<any>(null);

  // ── Scenario & combat ─────────────────────────────────────────────────────
  const [selectedScenario, setSelectedScenario] = useState('open-galaxy');
  const [combatMode,       setCombatMode]       = useState('auto_resolve');

  // ── Derived values ────────────────────────────────────────────────────────
  const preset         = DIFFICULTY_PRESETS[selectedDifficulty];
  const galaxySize     = preset?.galaxySize ?? 'medium';
  const network        = isNetworkMode(selectedMode);
  const factionColor   = FACTION_COLORS[factionDef.id] ?? '#8b949e';
  const factionName    = FACTION_NAMES[factionDef.id]  ?? factionDef.id;
  const activeFactions = buildActiveFactions(factionDef.id);

  // ── Galaxy generation: re-runs whenever seed or galaxy size changes ───────
  useEffect(() => {
    setGeneratedGalaxy(null);
    const timer = setTimeout(() => {
      const gen    = new GalaxyGenerator(activeSeed, galaxySize);
      const galaxy = gen.generate(activeFactions);
      setGeneratedGalaxy(galaxy);
    }, 0); // defer to next tick so spinner renders first
    return () => clearTimeout(timer);
  }, [activeSeed, galaxySize]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seed handlers ─────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    setActiveSeed(generateRandomSeed());
  }, []);

  const handleSeedInputCommit = useCallback(() => {
    const trimmed = seedInput.trim();
    setActiveSeed(trimmed || generateRandomSeed());
  }, [seedInput]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(activeSeed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [activeSeed]);

  const handleSeedModeChange = (mode: any) => {
    setSeedMode(mode);
    if (mode === 'random') setActiveSeed(generateRandomSeed());
  };

  // ── Confirm: build and pass fully-enriched config ─────────────────────────
  const handleConfirm = () => {
    const p             = DIFFICULTY_PRESETS[selectedDifficulty];
    const networkOpps   = network ? getNetworkOpponents(factionDef.id, selectedMode) : [];
    const humanFactions = [factionDef.id, ...networkOpps];
    const playerNames   = Object.fromEntries(
      humanFactions.map((fId, idx) => [fId, `Player ${idx + 1}`])
    );

    onConfirm({
      gameMode:                   selectedMode,
      galaxySize:                 p.galaxySize,
      difficulty:                 selectedDifficulty,
      startingResourceMultiplier: p.startingResourceMultiplier,
      victoryThresholdModifier:   p.victoryThresholdModifier,
      aiDifficulty:               p.aiDifficulty,
      humanFactions,
      playerNames,
      galaxySeed:                 activeSeed,
      seedMode,
      scenario:                   selectedScenario,
      combatMode,
      preGeneratedGalaxy:         generatedGalaxy,
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="gss-screen">

      {/* ── Header ── */}
      <header className="gss-header">
        <h1 className="gss-title">Game Setup</h1>
        <p className="gss-subtitle">
          Playing as{' '}
          <span style={{ color: factionColor, fontWeight: 600 }}>{factionName}</span>
        </p>
      </header>

      {/* ── Two-column scrollable body ── */}
      <div className="gss-body">

        {/* ── Left column: Game Mode + Scenario ── */}
        <div className="gss-col">

          {/* Game Mode */}
          <section className="gss-section">
            <h2 className="gss-section-title">Game Mode</h2>
            {GAME_MODE_GROUPS.map(group => (
              <div key={group.groupId} className="gss-mode-group">
                <div
                  className="gss-mode-group-label"
                  style={({ '--group-color': group.groupColor } as any)}
                >
                  <span className="gss-mode-group-icon">{group.groupIcon}</span>
                  {group.groupLabel}
                </div>
                <div className="gss-mode-pair">
                  {group.modes.map(mode => (
                    <ModeCard
                      key={mode.id}
                      modeId={mode.id}
                      label={mode.label}
                      description={mode.description}
                      selected={selectedMode === mode.id}
                      groupColor={group.groupColor}
                      onSelect={setSelectedMode}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Scenario */}
          <section className="gss-section">
            <h2 className="gss-section-title">Scenario</h2>
            <div className="gss-option-grid">
              {SCENARIOS.map(s => (
                <OptionCard
                  key={s.id}
                  item={s}
                  selected={selectedScenario === s.id}
                  onSelect={setSelectedScenario}
                />
              ))}
            </div>
          </section>

          {/* Combat Mode */}
          <section className="gss-section">
            <h2 className="gss-section-title">Combat Mode</h2>
            <div className="gss-option-grid">
              {COMBAT_MODES.map(mode => (
                <OptionCard
                  key={mode.id}
                  item={mode}
                  selected={combatMode === mode.id}
                  onSelect={setCombatMode}
                />
              ))}
            </div>
          </section>

        </div>{/* /left column */}

        {/* ── Right column: Galaxy (difficulty + seed + preview) + Combat Mode ── */}
        <div className="gss-col">

          {/* Galaxy */}
          <section className="gss-section">
            <h2 className="gss-section-title">Galaxy</h2>

            {/* Difficulty sub-section */}
            <p className="gss-subsection-label">Difficulty</p>
            <div className="gss-diff-grid">
              {Object.entries(DIFFICULTY_PRESETS).map(([id, p]) => (
                <DifficultyCard
                  key={id}
                  id={id}
                  preset={p}
                  selected={selectedDifficulty === id}
                  onSelect={setSelectedDifficulty}
                />
              ))}
              {/* Custom — locked Coming Soon stub */}
              <DifficultyCard
                key="custom"
                id="custom"
                preset={null}
                selected={false}
                onSelect={() => {}}
              />
            </div>

            {/* Seed sub-section */}
            <p className="gss-subsection-label">Seed</p>
            <div className="gss-seed-toggle">
              <button
                className={`gss-seed-toggle-btn${seedMode === 'random' ? ' gss-seed-toggle-btn--active' : ''}`}
                onClick={() => handleSeedModeChange('random')}
              >
                {'\u27f3'} Random
              </button>
              <button
                className={`gss-seed-toggle-btn${seedMode === 'fixed' ? ' gss-seed-toggle-btn--active' : ''}`}
                onClick={() => handleSeedModeChange('fixed')}
              >
                # Fixed Seed
              </button>
            </div>

            {seedMode === 'random' ? (
              <div className="gss-seed-random">
                <span className="gss-seed-display" title={activeSeed}>{activeSeed}</span>
                <button className="gss-seed-action-btn" onClick={handleCopy}>
                  {copied ? '\u2713 Copied' : '\u2398 Copy'}
                </button>
                <button className="gss-seed-action-btn" onClick={handleRegenerate}>
                  {'\u21bb'} Regenerate
                </button>
              </div>
            ) : (
              <div className="gss-seed-fixed">
                <input
                  className="gss-seed-input"
                  type="text"
                  placeholder="Enter seed string\u2026"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onBlur={handleSeedInputCommit}
                  onKeyDown={(e) => e.key === 'Enter' && handleSeedInputCommit()}
                />
                <p className="gss-seed-hint">
                  Same seed {'\u2192'} identical galaxy layout every time.
                </p>
                {activeSeed && seedInput && (
                  <span className="gss-seed-active">Active: <code>{activeSeed}</code></span>
                )}
              </div>
            )}

            {/* Galaxy Preview minimap */}
            <div className="gss-minimap-container">
              <div className="gss-minimap-label">Galaxy Preview</div>
              <GalaxyMinimap galaxy={generatedGalaxy} galaxySize={galaxySize} />
            </div>
          </section>

        </div>{/* /right column */}

      </div>{/* /body */}

      {/* ── Static footer ── */}
      <div className="gss-footer">

        {/* Active seed display */}
        <div className="gss-footer-seed">
          <span className="gss-footer-seed-label">Seed</span>
          <code className="gss-footer-seed-value" title={activeSeed}>{activeSeed}</code>
          <button className="gss-seed-action-btn" onClick={handleCopy}>
            {copied ? '\u2713 Copied' : '\u2398 Copy'}
          </button>
        </div>

        {/* AI / network opponent summary */}
        <div className="gss-footer-summary">
          {network
            ? getNetworkOpponents(factionDef.id, selectedMode).map((opId, idx) => (
                <span key={opId} className="gss-footer-slot">
                  <span className="gss-footer-role">Player {idx + 2} {'\u00b7'} Online</span>
                  <span style={{ color: FACTION_COLORS[opId] ?? '#8b949e' }}>
                    {FACTION_NAMES[opId] ?? opId}
                  </span>
                </span>
              ))
            : getAIOpponents(factionDef.id, selectedMode).map(opId => (
                <span key={opId} className="gss-footer-slot">
                  <span className="gss-footer-role">AI {'\u00b7'} {preset?.aiDifficulty ?? 'medium'}</span>
                  <span style={{ color: FACTION_COLORS[opId] ?? '#8b949e' }}>
                    {FACTION_NAMES[opId] ?? opId}
                  </span>
                </span>
              ))
          }
        </div>

        <div className="gss-footer-spacer" />

        <button
          className="gss-confirm-btn"
          onClick={handleConfirm}
          disabled={!generatedGalaxy}
        >
          {!generatedGalaxy
            ? 'Generating \u2026'
            : network
              ? 'Set Up Lobby \u2192'
              : 'Confirm & Start Game \u2192'}
        </button>

      </div>

    </div>
  );
}
