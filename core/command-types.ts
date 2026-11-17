/**
 * Command Types — Central registry of all command type strings used by
 * the sync tick loop (spec 058) and AI command generation.
 *
 * Commands are deterministic, serializable objects submitted per-tick in
 * sync mode. Both player UI and AIController produce Commands; the
 * SyncTickManager.applyInputBundle() dispatches them.
 *
 * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-002)
 */

// ─── Command Type Constants ─────────────────────────────────────────────────

export const CMD = {
  MOVE_FLEET:          'move_fleet',
  ASSIGN_FLEET_CMD:    'assign_fleet_command',
  CLAIM_SECTOR:        'claim_sector',
  START_RESEARCH:      'start_research',
  QUEUE_CONSTRUCTION:  'queue_construction',
  UPGRADE_FACILITY:    'upgrade_facility',
  STAGE_MISSION:       'stage_mission',
  STAGE_DIPLOMATIC:    'stage_diplomatic',
  INVADE_PLANET:       'invade_planet',
  EVENT_CHOICE:        'event_choice',
  ASSIGN_CHARACTER:    'assign_character',
};

export type CommandType = typeof CMD[keyof typeof CMD];

export interface Command {
  type:    CommandType;
  payload: Record<string, unknown>;
  seq:     number;
}

export interface CommandValidationResult {
  valid:   boolean;
  reason?: string;
}

// ─── Payload Validators ─────────────────────────────────────────────────────

const _nonEmpty = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/** Minimal required-field validators per command type. */
const VALIDATORS: Record<string, (p: Record<string, unknown>) => boolean> = {
  [CMD.MOVE_FLEET]:         (p) => _nonEmpty(p?.fleetId) && _nonEmpty(p?.destinationId),
  [CMD.ASSIGN_FLEET_CMD]:   (p) => _nonEmpty(p?.fleetId) && _nonEmpty(p?.command),
  [CMD.CLAIM_SECTOR]:       (p) => _nonEmpty(p?.sectorId) && _nonEmpty(p?.factionId),
  [CMD.START_RESEARCH]:     (p) => _nonEmpty(p?.factionId) && _nonEmpty(p?.techId),
  [CMD.QUEUE_CONSTRUCTION]: (p) => _nonEmpty(p?.systemId) && _nonEmpty(p?.facilityType) && _nonEmpty(p?.factionId),
  [CMD.UPGRADE_FACILITY]:   (p) => _nonEmpty(p?.systemId) && _nonEmpty(p?.instanceId) && _nonEmpty(p?.factionId),
  [CMD.STAGE_MISSION]:      (p) => _nonEmpty(p?.factionId) && _nonEmpty(p?.missionType),
  [CMD.STAGE_DIPLOMATIC]:   (p) => _nonEmpty(p?.factionId) && _nonEmpty(p?.type),
  [CMD.INVADE_PLANET]:      (p) => _nonEmpty(p?.systemId) && _nonEmpty(p?.choice),
  [CMD.EVENT_CHOICE]:       (p) => _nonEmpty(p?.eventId) && p?.choiceIndex !== undefined,
  [CMD.ASSIGN_CHARACTER]:   (p) => _nonEmpty(p?.characterId) && _nonEmpty(p?.factionId),
};

/**
 * Validate a command's payload against required-field constraints.
 * @param {string} type - One of CMD.* constants
 * @param {Object} payload
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateCommandPayload(type: string, payload: unknown): CommandValidationResult {
  const validator = VALIDATORS[type];
  if (!validator) {
    return { valid: false, reason: `Unknown command type: ${type}` };
  }
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'Payload must be a non-null object' };
  }
  if (!validator(payload as Record<string, unknown>)) {
    return { valid: false, reason: `Invalid payload for command type '${type}'` };
  }
  return { valid: true };
}

/**
 * Build a Command object ready for submission.
 * @param {string} type   - One of CMD.* constants
 * @param {Object} payload - Command-specific data (no timestamps or random values)
 * @param {number} seq     - Ordering index within the player's commands for this tick
 * @returns {{ type: string, payload: Object, seq: number }}
 */
export function makeCommand(type: CommandType, payload: Record<string, unknown>, seq = 0): Command {
  return { type, payload, seq };
}
