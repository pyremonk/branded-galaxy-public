/**
 * Typed shapes for JSON config files loaded at runtime.
 */

import type { ResourceMap } from './game-objects.js';

// ─── resource-config.json ────────────────────────────────────────────────────

export interface ResourceFormulaConfig {
  formula: string;
}

export interface LoyaltyModifier {
  min:        number;
  max:        number;
  multiplier: number;
}

export interface CostRange {
  min: number;
  max: number;
}

export interface ResourceConfig {
  baseProduction:       Record<string, ResourceFormulaConfig>;
  loyaltyModifiers:     LoyaltyModifier[];
  specialLocationBonuses: Record<string, ResourceMap & { researchCostMod?: number; defenseMod?: number }>;
  defaultCaps:          ResourceMap;
  shipCosts:            Record<string, ResourceMap>;
  buildingCosts:        Record<string, ResourceMap>;
  missionCosts:         Record<string, ResourceMap>;
  researchCosts:        Record<string, Record<string, CostRange>>;
  emergencyActionCosts: Record<string, { costMultiplier?: number } & Partial<ResourceMap>>;
  refundRates:          Record<string, number>;
}

// ─── fleet-config.json ───────────────────────────────────────────────────────

export interface ShipTypeConfig {
  id:                  string;
  name:                string;
  description:         string;
  faction:             string;
  class:               string;
  combatPower:         number;
  hullPoints:          number;
  speed:               number;
  maintenanceCost:     number;
  productionCost:      ResourceMap;
  productionTime:      number;
  requiresTech:        string | null;
  requiresFacilityLevel: number;
  specialAbility:      string | null;
}

export interface FleetConfig {
  shipTypes: ShipTypeConfig[];
}

// ─── mission-config.json ─────────────────────────────────────────────────────

export interface MissionTypeConfig {
  id:          string;
  name:        string;
  description: string;
  cost:        ResourceMap;
  duration:    number;
  statKey:     string;
  baseSuccessChance: number;
  outcomes:    Record<string, unknown>;
}

export interface MissionConfig {
  missionTypes: MissionTypeConfig[];
  [key: string]: unknown;
}

// ─── construction-config.json ────────────────────────────────────────────────

export interface FacilityLevelConfig {
  level:         number;
  cost:          ResourceMap;
  buildTime:     number;
  effects:       Record<string, number | boolean | string>;
  description?:  string;
}

export interface FacilityTypeConfig {
  id:          string;
  name:        string;
  description: string;
  category:    string;
  maxLevel:    number;
  levels:      FacilityLevelConfig[];
  requiresTech?: string | null;
  unique?:     boolean;
}

export interface ConstructionConfig {
  facilityTypes: FacilityTypeConfig[];
  [key: string]: unknown;
}
