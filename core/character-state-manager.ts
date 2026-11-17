/**
 * CharacterStateManager — Per-faction character roster state.
 *
 * Manages named leader/hero characters: status tracking, XP/leveling,
 * assignment operations, recruitment, and serialization for save/load.
 *
 * Spec: 009-character-roster-spec.md, 010-character-assignment-spec.md
 */

import { SeededRandom } from './seeded-random.js';
import characterDefinitions from './character-definitions.json';

// All available portrait image filenames from assets/transparent-character-portraits/.
// When generating a new character, pick one at random using the seeded RNG.
export const PORTRAIT_POOL = [
  // A-series (android / synthetic)
  'A_01_t.png', 'A_02_t.png', 'A_03_t.png', 'A_04_t.png', 'A_05_t.png',
  'A_06_t.png', 'A_07_t.png', 'A_08_t.png', 'A_09_t.png', 'A_10_t.png',
  'A_11_t.png', 'A_12_t.png', 'A_13_t.png', 'A_14_t.png', 'A_15_t.png',
  'A_16_t.png', 'A_17_t.png', 'A_18_t.png',
  // F-series (female)
  'F_01_t.png', 'F_02_t.png', 'F_03_t.png', 'F_04_t.png', 'F_05_t.png',
  'F_06_t.png', 'F_07_t.png', 'F_08_t.png', 'F_09_t.png', 'F_10_t.png',
  'F_11_t.png', 'F_12_t.png',
  // K-series
  'K_01_t.png', 'K_02_t.png', 'K_03_t.png', 'K_04_t.png', 'K_05_t.png',
  'K_06_t.png', 'K_07_t.png', 'K_08_t.png', 'K_09_t.png', 'K_10_t.png',
  'K_11_t.png', 'K_12_t.png', 'K_13_t.png', 'K_14_t.png', 'K_15_t.png',
  'K_16_t.png', 'K_17_t.png',
  // M-series (male)
  'M_01_t.png', 'M_02_t.png', 'M_03_t.png', 'M_04_t.png', 'M_05_t.png',
  'M_06_t.png', 'M_07_t.png', 'M_08_t.png', 'M_09_t.png', 'M_10_t.png',
  'M_11_t.png', 'M_12_t.png', 'M_13_t.png',
];

// Valid character statuses
export const CHARACTER_STATUS = {
  AVAILABLE:   'available',
  ON_MISSION:  'on-mission',
  IN_FLEET:    'in-fleet',
  STATIONED:   'stationed',
  CAPTURED:    'captured',
  DEAD:        'dead'
};

// XP threshold for levelling: level × 100
const XP_PER_LEVEL = 100;
const MAX_LEVEL = 10;
const MAX_ROSTER_SIZE = 12;
const CHARACTER_STATE_VERSION = 1;

export class CharacterStateManager {
  factionId: any;
  state: any;
  _recruitSeq: number = 0;
  _exchangeSeq: number = 0;

  /**
   * @param {string} factionId - Faction this roster belongs to
   * @param {Object[]} [startingCharacters=[]] - Starting character definitions from config
   */
  constructor(factionId: any, startingCharacters = []) {
    this.factionId = factionId;
    this.state = this._initializeState(factionId, startingCharacters);

    /**
     * Deterministic ID sequence counters (spec 055 FR-DET-002).
     * Persisted via serialize()/deserialize().
     */
    this._recruitSeq  = 0;
    this._exchangeSeq = 0;
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  _initializeState(factionId: any, startingCharacters: any) {
    return {
      characterStateVersion: CHARACTER_STATE_VERSION,
      factionId,
      /** @type {Map-like Object<string, Object>} characterId → character data */
      characters: {},
      /** Turn counters for captured characters: characterId → turnsCapt */
      capturedTurnCounters: {},
      /** Prisoner exchange proposals: { proposalId, offeredCharId, requestedCharId, proposingFactionId, turnsRemaining } */
      exchangeProposals: []
    };
  }

  /**
   * Load starting roster from config definitions.
   * @param {Object[]} characters - Array of character definition objects
   */
  loadStartingRoster(characters: any) {
    for (const def of characters) {
      (this.state.characters as Record<string, any>)[def.id] = this._createCharacterFromDef(def);
    }
    console.log(`[CharacterState] Loaded ${characters.length} starting characters for ${this.factionId}`);
  }

  /** @private */
  _createCharacterFromDef(def: any) {
    return {
      id:               def.id,
      name:             def.name,
      faction:          def.faction,
      portrait:         def.portrait ?? '□',
      background:       def.background ?? '',
      level:            Math.max(1, Math.min(MAX_LEVEL, def.level ?? 1)),
      xp:               def.xp ?? 0,
      status:           def.status ?? CHARACTER_STATUS.AVAILABLE,
      locationSystemId: def.locationSystemId ?? null,
      stats: {
        combat:     this._clampStat(def.stats?.combat     ?? 5),
        espionage:  this._clampStat(def.stats?.espionage  ?? 5),
        diplomacy:  this._clampStat(def.stats?.diplomacy  ?? 5),
        leadership: this._clampStat(def.stats?.leadership ?? 5),
        research:   this._clampStat(def.stats?.research   ?? 5)
      },
      specializations:  [...(def.specializations ?? [])],
      // Assignment tracking
      assignedMissionId:  def.assignedMissionId  ?? null,
      assignedFleetId:    def.assignedFleetId    ?? null,
      assignedFacility:   def.assignedFacility   ?? null,   // { systemId, facilityType }
      // Capture metadata
      capturingFactionId: def.capturingFactionId ?? null,
      turnsInCaptivity:   def.turnsInCaptivity   ?? 0,
      // Per-turn state
      interrogatedThisTurn: false
    };
  }

  /** @private */
  _clampStat(value: any) {
    return Math.max(1, Math.min(10, Math.round(value)));
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  /** Get a character by ID. @returns {Object|null} */
  getCharacter(id: any) {
    return (this.state.characters as Record<string, any>)[id] ?? null;
  }

  /** Get all characters (including Dead). @returns {Object[]} */
  getAllCharacters() {
    return (Object.values(this.state.characters) as any[]);
  }

  /** Get active (non-Dead) roster. @returns {Object[]} */
  getActiveRoster() {
    return this.getAllCharacters().filter(c => c.status !== CHARACTER_STATUS.DEAD);
  }

  /** Get characters by status. @returns {Object[]} */
  getByStatus(status: any) {
    return this.getAllCharacters().filter(c => c.status === status);
  }

  /** Get characters that can be assigned (Available or Stationed). @returns {Object[]} */
  getAssignable() {
    return this.getAllCharacters().filter(c =>
      c.status === CHARACTER_STATUS.AVAILABLE || c.status === CHARACTER_STATUS.STATIONED
    );
  }

  /** Count active (non-Dead) characters. @returns {number} */
  getActiveCount() {
    return this.getActiveRoster().length;
  }

  /**
   * Get a character's effective stat value, including specialization bonuses.
   * @param {string} characterId
   * @param {string} statName - 'combat' | 'espionage' | 'diplomacy' | 'leadership' | 'research'
   * @param {Object} [context] - { missionType?, isFleetCommander?, facilityType?, isEnemySystem?, factionId? }
   * @returns {number} Effective stat (may exceed 10 with bonuses)
   */
  getEffectiveStat(characterId: any, statName: any, context = {}) {
    const char = this.getCharacter(characterId);
    if (!char) return 0;
    const base = char.stats[statName] ?? 0;
    let bonus = 0;

    for (const tag of char.specializations) {
      const specDef = (characterDefinitions.specializations as Record<string, any>)[tag];
      if (!specDef) continue;

      if (specDef.stat !== statName) {
        // droid-interface also gives leadership bonus
        if (tag === 'droid-interface' && statName === 'leadership') bonus += specDef.bonus;
        continue;
      }

      // Check if this specialization applies in context
      if (specDef.context === 'fleet' && (context as any).isFleetCommander) {
        bonus += specDef.bonus;
      } else if (specDef.context === 'research-facility' && (context as any).facilityType === 'research') {
        bonus += specDef.bonus;
      } else if (specDef.missions && (context as any).missionType && specDef.missions.includes((context as any).missionType)) {
        bonus += specDef.bonus;
      } else if (specDef.condition === 'enemy-controlled-system' && (context as any).isEnemySystem) {
        bonus += specDef.bonus;
      } else if (specDef.faction && specDef.faction === ((context as any).factionId ?? char.faction)) {
        // droid-interface espionage for autoforge
        if (tag === 'droid-interface' && statName === 'espionage') bonus += specDef.bonus;
      }
    }

    return base + bonus;
  }

  // ─── Status Transitions ───────────────────────────────────────────────────────

  /**
   * Assign character to a mission.
   * @param {string} characterId
   * @param {string} missionId
   * @param {string} targetSystemId
   * @returns {{ success: boolean, error?: string }}
   */
  assignToMission(characterId: any, missionId: any, targetSystemId: any) {
    const char = this.getCharacter(characterId);
    if (!char) return { success: false, error: `Character ${characterId} not found` };
    if (char.status !== CHARACTER_STATUS.AVAILABLE && char.status !== CHARACTER_STATUS.STATIONED) {
      return { success: false, error: `${char.name} is not available (status: ${char.status})` };
    }

    char.status = CHARACTER_STATUS.ON_MISSION;
    char.assignedMissionId = missionId;
    char.locationSystemId = targetSystemId ?? char.locationSystemId;
    this._emitStatusChange(char, 'on-mission', { missionId, targetSystemId });
    this._emitAssigned(characterId, 'mission', missionId);
    return { success: true };
  }

  /**
   * Assign character as fleet commander.
   * @param {string} characterId
   * @param {string} fleetId
   * @returns {{ success: boolean, error?: string }}
   */
  assignToFleet(characterId: any, fleetId: any) {
    const char = this.getCharacter(characterId);
    if (!char) return { success: false, error: `Character ${characterId} not found` };
    if (char.status !== CHARACTER_STATUS.AVAILABLE && char.status !== CHARACTER_STATUS.STATIONED) {
      return { success: false, error: `${char.name} is not available (status: ${char.status})` };
    }

    char.status = CHARACTER_STATUS.IN_FLEET;
    char.assignedFleetId = fleetId;
    this._emitStatusChange(char, 'in-fleet', { fleetId });
    this._emitAssigned(characterId, 'fleet', fleetId);
    return { success: true };
  }

  /**
   * Assign character to staff a facility.
   * @param {string} characterId
   * @param {string} systemId
   * @param {string} facilityType
   * @returns {{ success: boolean, error?: string }}
   */
  assignToFacility(characterId: any, systemId: any, facilityType: any) {
    const char = this.getCharacter(characterId);
    if (!char) return { success: false, error: `Character ${characterId} not found` };
    if (char.status !== CHARACTER_STATUS.AVAILABLE) {
      return { success: false, error: `${char.name} is not available (status: ${char.status})` };
    }

    char.status = CHARACTER_STATUS.STATIONED;
    char.assignedFacility = { systemId, facilityType };
    char.locationSystemId = systemId;
    this._emitStatusChange(char, 'stationed', { systemId, facilityType });
    this._emitAssigned(characterId, 'facility', systemId);
    return { success: true };
  }

  /**
   * Return character to Available (unassign from fleet or facility).
   * @param {string} characterId
   * @returns {{ success: boolean, error?: string }}
   */
  unassign(characterId: any) {
    const char = this.getCharacter(characterId);
    if (!char) return { success: false, error: `Character ${characterId} not found` };
    if (char.status === CHARACTER_STATUS.AVAILABLE) return { success: true };
    if (char.status === CHARACTER_STATUS.ON_MISSION) {
      return { success: false, error: `${char.name} is on an active mission and cannot be unassigned` };
    }
    if (char.status === CHARACTER_STATUS.CAPTURED || char.status === CHARACTER_STATUS.DEAD) {
      return { success: false, error: `${char.name} cannot be unassigned in status: ${char.status}` };
    }

    const prev = char.status;
    char.status = CHARACTER_STATUS.AVAILABLE;
    char.assignedMissionId = null;
    char.assignedFleetId = null;
    char.assignedFacility = null;
    this._emitStatusChange(char, 'available', { previousStatus: prev });
    this._emitUnassigned(characterId, prev);
    return { success: true };
  }

  /**
   * Complete a mission — return character to Available and award XP.
   * @param {string} characterId
   * @param {number} xpReward
   * @returns {{ success: boolean, leveledUp?: boolean }}
   */
  completeMission(characterId: any, xpReward = 0) {
    const char = this.getCharacter(characterId);
    if (!char) return { success: false };

    char.status = CHARACTER_STATUS.AVAILABLE;
    char.assignedMissionId = null;
    this._emitStatusChange(char, 'available', { previousStatus: 'on-mission' });

    const leveledUp = this.addXP(characterId, xpReward);
    return { success: true, leveledUp };
  }

  /**
   * Capture a character.
   * @param {string} characterId
   * @param {string} holdingSystemId - System where the character is held
   * @param {string} capturingFactionId - Faction that captured this character
   */
  capture(characterId: any, holdingSystemId: any, capturingFactionId: any) {
    const char = this.getCharacter(characterId);
    if (!char || char.status === CHARACTER_STATUS.DEAD) return;

    char.status = CHARACTER_STATUS.CAPTURED;
    char.assignedMissionId = null;
    char.assignedFleetId = null;
    char.assignedFacility = null;
    char.locationSystemId = holdingSystemId;
    char.capturingFactionId = capturingFactionId;
    char.turnsInCaptivity = 0;
    char.interrogatedThisTurn = false;
    this.state.capturedTurnCounters[characterId] = 0;

    this._emitStatusChange(char, 'captured', { holdingSystemId, capturingFactionId });
    window.dispatchEvent(new CustomEvent('galaxy:characterCaptured', {
      detail: { characterId, characterName: char.name, factionId: this.factionId, capturingFactionId, holdingSystemId }
    }));
    console.log(`[CharacterState] ${char.name} captured by ${capturingFactionId} at ${holdingSystemId}`);
  }

  /**
   * Release/rescue a captured character.
   * @param {string} characterId
   * @param {string} [newLocationSystemId]
   */
  rescue(characterId: any, newLocationSystemId = null) {
    const char = this.getCharacter(characterId);
    if (!char || char.status !== CHARACTER_STATUS.CAPTURED) return;

    char.status = CHARACTER_STATUS.AVAILABLE;
    char.capturingFactionId = null;
    char.turnsInCaptivity = 0;
    if (newLocationSystemId) char.locationSystemId = newLocationSystemId;
    delete this.state.capturedTurnCounters[characterId];

    this._emitStatusChange(char, 'available', { previousStatus: 'captured', rescued: true });
    window.dispatchEvent(new CustomEvent('galaxy:characterRescued', {
      detail: { characterId, characterName: char.name, factionId: this.factionId }
    }));
    console.log(`[CharacterState] ${char.name} rescued`);
  }

  /**
   * Execute a captured character (permanent).
   * @param {string} characterId
   */
  execute(characterId: any) {
    const char = this.getCharacter(characterId);
    if (!char || char.status !== CHARACTER_STATUS.CAPTURED) return;

    char.status = CHARACTER_STATUS.DEAD;
    delete this.state.capturedTurnCounters[characterId];

    this._emitStatusChange(char, 'dead', { previousStatus: 'captured' });
    window.dispatchEvent(new CustomEvent('galaxy:characterExecuted', {
      detail: { characterId, characterName: char.name, factionId: this.factionId }
    }));
    console.log(`[CharacterState] ${char.name} executed`);
  }

  /**
   * Increment capture turn counters for all captured characters.
   * Called once per turn resolution.
   */
  tickCapturedCounters() {
    for (const char of this.getAllCharacters()) {
      if (char.status === CHARACTER_STATUS.CAPTURED) {
        char.turnsInCaptivity++;
        this.state.capturedTurnCounters[char.id] = char.turnsInCaptivity;
        char.interrogatedThisTurn = false;
      }
    }
    // Expire prisoner exchange proposals
    this.state.exchangeProposals = this.state.exchangeProposals
      .map((p: any) => ({ ...p, turnsRemaining: p.turnsRemaining - 1 }))
      .filter((p: any) => p.turnsRemaining > 0);
  }

  // ─── XP and Leveling ─────────────────────────────────────────────────────────

  /**
   * Add XP to a character, triggering level-up if threshold reached.
   * @param {string} characterId
   * @param {number} amount
   * @returns {boolean} True if leveled up
   */
  addXP(characterId: any, amount: any) {
    const char = this.getCharacter(characterId);
    if (!char || char.status === CHARACTER_STATUS.DEAD) return false;
    if (char.status === CHARACTER_STATUS.CAPTURED) return false; // Captured chars don't gain XP
    if (amount <= 0) return false;
    if (char.level >= MAX_LEVEL) return false;

    char.xp += amount;
    const threshold = char.level * XP_PER_LEVEL;
    if (char.xp >= threshold) {
      char.xp -= threshold;
      return this._levelUp(char);
    }
    return false;
  }

  /** @private */
  _levelUp(char: any) {
    if (char.level >= MAX_LEVEL) return false;
    char.level++;

    // Increase most-used stat by 1 (determined by highest stat)
    const stats = char.stats;
    const maxStat = Math.max(...(Object.values(stats) as number[]));
    const candidates = (Object.entries(stats) as [string, number][]).filter(([, v]) => v === maxStat && v < 10);
    if (candidates.length > 0) {
      const [key] = candidates[0];
      stats[key]++;
    } else {
      // Increase first stat not at max
      const notMax = (Object.entries(stats) as [string, number][]).find(([, v]) => v < 10);
      if (notMax) stats[notMax[0]]++;
    }

    window.dispatchEvent(new CustomEvent('galaxy:characterLevelUp', {
      detail: { characterId: char.id, characterName: char.name, factionId: this.factionId, newLevel: char.level }
    }));
    console.log(`[CharacterState] ${char.name} leveled up to Level ${char.level}`);
    return true;
  }

  // ─── Recruitment ─────────────────────────────────────────────────────────────

  /**
   * Recruit a new character procedurally.
   * @param {Object} recruitingCharacter - The character performing recruitment (for Diplomacy stat)
   * @param {SeededRandom} random - Seeded RNG
   * @returns {{ success: boolean, character?: Object, error?: string }}
   */
  recruitCharacter(recruitingCharacter: any, random: any) {
    if (this.getActiveCount() >= MAX_ROSTER_SIZE) {
      return { success: false, error: 'Roster is full (max 12 characters)' };
    }

    const diplomacy = recruitingCharacter?.stats?.diplomacy ?? 5;
    const namePool = (characterDefinitions.namePools as Record<string, string[]>)[this.factionId] ?? ['Recruit'];

    // Determine stat tier from diplomacy
    let statRange;
    if (diplomacy <= 3)      statRange = [1, 4];
    else if (diplomacy <= 7) statRange = [3, 6];
    else                     statRange = [5, 8];

    // Generate unique name
    const existingNames = new Set(this.getAllCharacters().map(c => c.name));
    let name;
    let attempts = 0;
    do {
      const raw = random.choice(namePool);
      name = this.factionId === 'autoforge'
        ? `${raw}-${random.nextInt(100, 999)}`
        : raw;
      attempts++;
    } while (existingNames.has(name) && attempts < 50);

    const id = `${this.factionId}-recruit-${this._recruitSeq++}-${random.nextInt(1000, 9999)}`;
    // Pick a random portrait from the shared pool, preferring the A-series for Autoforge.
    const portraitPool = this.factionId === 'autoforge'
      ? PORTRAIT_POOL.filter(p => p.startsWith('A_'))
      : PORTRAIT_POOL;
    const portrait = random.choice(portraitPool);
    const newChar = {
      id,
      name,
      faction:          this.factionId,
      portrait,
      background:       'A newly recruited operative with potential yet to be realized.',
      level:            1,
      xp:               0,
      status:           CHARACTER_STATUS.AVAILABLE,
      locationSystemId: recruitingCharacter?.locationSystemId ?? null,
      stats: {
        combat:     random.nextInt(statRange[0], statRange[1]),
        espionage:  random.nextInt(statRange[0], statRange[1]),
        diplomacy:  random.nextInt(statRange[0], statRange[1]),
        leadership: random.nextInt(statRange[0], statRange[1]),
        research:   random.nextInt(statRange[0], statRange[1])
      },
      specializations:      [],
      assignedMissionId:    null,
      assignedFleetId:      null,
      assignedFacility:     null,
      capturingFactionId:   null,
      turnsInCaptivity:     0,
      interrogatedThisTurn: false
    };

    (this.state.characters as Record<string, any>)[id] = newChar;
    window.dispatchEvent(new CustomEvent('galaxy:characterRecruited', {
      detail: { characterId: id, characterName: name, factionId: this.factionId }
    }));
    console.log(`[CharacterState] Recruited ${name} for ${this.factionId}`);
    return { success: true, character: newChar };
  }

  // ─── Facility Bonuses ─────────────────────────────────────────────────────────

  /**
   * Calculate facility bonus for a stationed character (spec FR-CA-004).
   * @param {string} characterId
   * @returns {{ multiplier: number, stat: string } | null}
   */
  getFacilityBonus(characterId: any) {
    const char = this.getCharacter(characterId);
    if (!char || char.status !== CHARACTER_STATUS.STATIONED || !char.assignedFacility) return null;

    const { facilityType } = char.assignedFacility;
    switch (facilityType) {
      case 'research':  return { stat: 'research',  multiplier: 1 + Math.max(0, char.stats.research  - 5) * 0.05 };
      case 'training':  return { stat: 'diplomacy', multiplier: 1 + Math.max(0, char.stats.diplomacy - 5) * 0.10 };
      case 'shipyard':  return { stat: 'leadership',multiplier: 1 + Math.max(0, char.stats.leadership- 5) * 0.05 };
      case 'trade-hub': return { stat: 'diplomacy', multiplier: 1 + Math.max(0, char.stats.diplomacy - 5) * 0.08 };
      default: return null;
    }
  }

  // ─── Prisoner Exchange ────────────────────────────────────────────────────────

  /**
   * Propose a prisoner exchange.
   * @param {string} offeredCharId - Our captured char we offer to release
   * @param {string} requestedCharId - Enemy captured char we want back
   * @param {string} proposingFactionId
   * @returns {{ success: boolean, proposalId?: string, error?: string }}
   */
  proposeExchange(offeredCharId: any, requestedCharId: any, proposingFactionId: any) {
    const offered   = this.getCharacter(offeredCharId);
    const requested = this.getCharacter(requestedCharId);
    if (!offered   || offered.status   !== CHARACTER_STATUS.CAPTURED) {
      return { success: false, error: 'Offered character is not captured' };
    }
    if (!requested || requested.status !== CHARACTER_STATUS.CAPTURED) {
      return { success: false, error: 'Requested character is not captured' };
    }

    const proposalId = `exchange-${this._exchangeSeq++}-${proposingFactionId}`;
    this.state.exchangeProposals.push({
      proposalId, offeredCharId, requestedCharId, proposingFactionId, turnsRemaining: 2
    });
    return { success: true, proposalId };
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  /** @private */
  _emitStatusChange(char: any, newStatus: any, detail = {}) {
    window.dispatchEvent(new CustomEvent('galaxy:characterStatusChange', {
      detail: { characterId: char.id, characterName: char.name, factionId: this.factionId, newStatus, ...detail }
    }));
    window.dispatchEvent(new CustomEvent('galaxy:characterUpdate', {
      detail: { factionId: this.factionId }
    }));
  }

  /** @private */
  _emitAssigned(characterId: any, assignmentType: any, targetId: any) {
    window.dispatchEvent(new CustomEvent('galaxy:characterAssigned', {
      detail: { characterId, assignmentType, targetId, factionId: this.factionId }
    }));
  }

  /** @private */
  _emitUnassigned(characterId: any, previousAssignmentType: any) {
    window.dispatchEvent(new CustomEvent('galaxy:characterUnassigned', {
      detail: { characterId, previousAssignmentType, factionId: this.factionId }
    }));
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize state to a plain object for persistence.
   * @returns {Object} Plain JS object (safe to embed in JSONB)
   */
  serialize() {
    return JSON.parse(JSON.stringify({
      ...this.state,
      _recruitSeq:  this._recruitSeq,
      _exchangeSeq: this._exchangeSeq
    }));
  }

  /**
   * Reconstruct a CharacterStateManager from a previously serialized object or JSON string.
   * Accepts both formats for backward compatibility with older saves.
   * @param {Object|string} data - Plain object or JSON string from serialize()
   * @returns {CharacterStateManager}
   */
  static deserialize(data: any) {
    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (err) {
      throw new Error(`[CharacterStateManager] Failed to parse serialized state: ${(err as Error).message}`);
    }

    const instance = new CharacterStateManager(parsed.factionId ?? 'unknown');
    instance.state = {
      characterStateVersion:  parsed.characterStateVersion ?? CHARACTER_STATE_VERSION,
      factionId:              parsed.factionId ?? 'unknown',
      characters:             parsed.characters ?? {},
      capturedTurnCounters:   parsed.capturedTurnCounters ?? {},
      exchangeProposals:      parsed.exchangeProposals ?? []
    };
    instance._recruitSeq  = parsed._recruitSeq  ?? 0;
    instance._exchangeSeq = parsed._exchangeSeq ?? 0;

    // Migrate legacy emoji/glyph portraits to PNG filenames for named characters.
    // This fixes saves created before the PNG portrait migration.
    const defLookup: Record<string, any> = {};
    (Object.values(characterDefinitions.startingRosters ?? {}) as any[]).flat().forEach((def: any) => {
      if (def.id) defLookup[def.id] = def;
    });
    (Object.values(instance.state.characters) as any[]).forEach((ch: any) => {
      if (typeof ch.portrait !== 'string' || !ch.portrait.endsWith('.png')) {
        const def = defLookup[ch.id];
        if (def?.portrait?.endsWith('.png')) {
          ch.portrait = def.portrait;
        }
      }
    });

    return instance;
  }

  /**
   * Create a CharacterStateManager from a plain state object.
   * @param {Object} stateObj
   * @returns {CharacterStateManager}
   */
  static fromStateObject(stateObj: any) {
    return CharacterStateManager.deserialize(stateObj);
  }
}
