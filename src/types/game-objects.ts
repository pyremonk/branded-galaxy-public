/**
 * Core game object interfaces shared across React and Phaser layers.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export type ResourceMap = Record<string, number>;

export type FactionId = string;
export type SystemId  = string;
export type SectorId  = string;
export type FleetId   = string;
export type CharacterId = string;
export type MissionId   = string;
export type TechId      = string;
export type FacilityId  = string;

// ─── Character ───────────────────────────────────────────────────────────────

export type CharacterStatus =
  | 'available'
  | 'on-mission'
  | 'in-fleet'
  | 'stationed'
  | 'captured'
  | 'dead';

export interface CharacterStats {
  combat:      number;
  espionage:   number;
  diplomacy:   number;
  leadership:  number;
  research:    number;
}

export interface Character {
  id:              CharacterId;
  name:            string;
  faction:         FactionId;
  portrait:        string;
  background:      string;
  level:           number;
  xp:              number;
  status:          CharacterStatus;
  locationSystemId: SystemId | null;
  stats:           CharacterStats;
  specializations: string[];
  assignedTo?:     string | null;
}

// ─── Fleet ───────────────────────────────────────────────────────────────────

export interface FleetComposition {
  [shipType: string]: number;
}

export type FleetOrderType = 'move' | 'attack' | 'defend' | 'patrol';

export interface FleetOrder {
  type:        FleetOrderType;
  targetId?:   string;
  destinationId?: SystemId;
}

export interface Fleet {
  id:               FleetId;
  factionId:        FactionId;
  name:             string;
  currentSystemId:  SystemId;
  composition:      FleetComposition;
  power:            number;
  orders:           FleetOrder[];
  commanderId?:     CharacterId | null;
  enroute?:         boolean;
  destinationId?:   SystemId | null;
}

// ─── System / Sector ─────────────────────────────────────────────────────────

export interface Sector {
  id:        SectorId;
  systemId:  SystemId;
  ownerId:   FactionId | null;
  cost:      number;
  x:         number;
  y:         number;
}

export interface StarSystem {
  id:             SystemId;
  name:           string;
  x:              number;
  y:              number;
  sectors:        Sector[];
  ownerId:        FactionId | null;
  population:     number;
  loyalty:        number;
  facilities:     FacilityInstance[];
  connections:    SystemId[];
  locationType?:  string;
}

// ─── Facility ────────────────────────────────────────────────────────────────

export interface FacilityInstance {
  instanceId:   FacilityId;
  type:         string;
  level:        number;
  systemId:     SystemId;
  factionId:    FactionId;
  completionTurn?: number;
}

// ─── Faction ─────────────────────────────────────────────────────────────────

export interface VictoryConditionProgress {
  condition: string;
  progress:  number;
  target:    number;
  label:     string;
}

export interface FactionState {
  id:                FactionId;
  name:              string;
  color:             number;
  colorHex:          string;
  controlledSystems: SystemId[];
  systemCount:       number;
  resources:         ResourceMap;
  resourceCaps:      ResourceMap;
  bonuses:           Record<string, number | boolean>;
  restrictions:      Record<string, number | boolean>;
  technologies:      TechId[];
  fleets:            Fleet[];
  characters:        Character[];
  victoryProgress:   Record<string, VictoryConditionProgress>;
  relationships:     Record<FactionId, number>;
}

// ─── Combat ──────────────────────────────────────────────────────────────────

export interface CombatRound {
  round:        number;
  attackerPower: number;
  defenderPower: number;
  attackerLosses: number;
  defenderLosses: number;
}

export interface CombatResult {
  systemId:       SystemId;
  systemName:     string;
  attackerFactionId: FactionId;
  defenderFactionId: FactionId;
  attackerFleetId:   FleetId;
  defenderFleetId?:  FleetId | null;
  rounds:         CombatRound[];
  winner:         FactionId;
  systemCaptured: boolean;
  attackerLosses: FleetComposition;
  defenderLosses: FleetComposition;
}

// ─── Mission ─────────────────────────────────────────────────────────────────

export type MissionOutcome = 'critical_success' | 'success' | 'failure' | 'critical_failure';

export interface MissionResult {
  missionId:   MissionId;
  type:        string;
  outcome:     MissionOutcome;
  factionId:   FactionId;
  targetId?:   string;
  message:     string;
  details:     string[];
}

// ─── Technology ──────────────────────────────────────────────────────────────

export interface TechNode {
  id:          TechId;
  name:        string;
  description: string;
  tier:        number;
  cost:        ResourceMap;
  prerequisites: TechId[];
  effects:     Record<string, number | boolean | string>;
  icon?:       string;
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export type AlertCategory = 'event' | 'combat' | 'mission' | 'diplomacy' | 'system' | 'tech' | 'construction' | 'character' | 'victory';
export type AlertSeverity = 'critical_success' | 'success' | 'failure' | 'critical_failure' | 'info' | 'tip';

export interface AlertOutcome {
  summary:    string;
  details:    string[];
  systemId:   SystemId | null;
  systemName: string | null;
}

export interface Alert {
  id:             string;
  category:       AlertCategory;
  factionId:      FactionId | null;
  actorFactionId: FactionId | null;
  message:        string;
  outcome:        AlertOutcome;
  turn:           number;
  severity:       AlertSeverity;
  timestamp:      number;
}

// ─── Game Config ─────────────────────────────────────────────────────────────

export type GameMode = 'async' | 'sync';
export type TurnPhase = 'ACTION' | 'RESOLUTION' | 'MAINTENANCE';

export interface GameConfig {
  mode?:        GameMode;
  galaxySize?:  'small' | 'medium' | 'large';
  difficulty?:  'easy' | 'normal' | 'hard';
  maxPlayers?:  number;
  gameId?:      string;
  [key: string]: unknown;
}
