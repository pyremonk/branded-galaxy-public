/**
 * FactionDefinitionLoader - Loads and validates faction configurations
 * Provides access to faction definitions from JSON data
 */
import factionData from './faction-definitions.json';

// Required top-level fields for each faction definition
const REQUIRED_FIELDS = [
  'id', 'displayName', 'description', 'color', 'difficulty',
  'lore', 'bonuses', 'restrictions', 'startingConditions', 'victoryConditions'
];

// Required lore fields
const REQUIRED_LORE_FIELDS = ['origin', 'motivations', 'leadership', 'culture'];

// Required startingConditions fields
const REQUIRED_STARTING_FIELDS = ['systemCount', 'systemCriteria', 'resources', 'fleets', 'technologies'];

// Valid difficulty values
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

export class FactionDefinitionLoader {
  /** Cached loaded faction definitions */
  static _definitions: any[] | null = null;

  /**
   * Load all faction definitions, validating schemas.
   * Returns cached definitions on subsequent calls.
   * @returns {Array} Array of faction definition objects
   */
  static load() {
    if (this._definitions) return this._definitions;

    const defs = factionData.factions;
    this.validateSchemas(defs);
    this._definitions = defs;

    console.log(`[FactionLoader] Loaded ${defs.length} faction definitions`);
    return this._definitions;
  }

  /**
   * Get a single faction definition by ID.
   * @param {string} id - Faction ID (e.g. 'brandAuthority')
   * @returns {Object|null} Faction definition or null if not found
   */
  static getFactionById(id: string): any {
    const defs = this.load();
    return defs.find((f: any) => f.id === id) || null;
  }

  /**
   * Get all faction definitions.
   * @returns {Array} All faction definitions
   */
  static getAllFactions() {
    return this.load();
  }

  /**
   * Validate all faction schemas, logging warnings for issues.
   * @param {Array} definitions - Array of faction definition objects
   */
  static validateSchemas(definitions: any[]): void {
    if (!Array.isArray(definitions) || definitions.length === 0) {
      console.error('[FactionLoader] No faction definitions found in data');
      return;
    }

    definitions.forEach((faction, index) => {
      const label = faction.id || `index ${index}`;

      // Check required top-level fields
      REQUIRED_FIELDS.forEach(field => {
        if (faction[field] === undefined || faction[field] === null) {
          console.warn(`[FactionLoader] Faction "${label}" missing required field: ${field}`);
        }
      });

      // Validate difficulty
      if (faction.difficulty && !VALID_DIFFICULTIES.includes(faction.difficulty)) {
        console.warn(`[FactionLoader] Faction "${label}" has invalid difficulty: ${faction.difficulty}`);
      }

      // Validate lore fields
      if (faction.lore) {
        REQUIRED_LORE_FIELDS.forEach(field => {
          if (!faction.lore[field]) {
            console.warn(`[FactionLoader] Faction "${label}" missing lore.${field}`);
          }
        });
      }

      // Validate startingConditions
      if (faction.startingConditions) {
        REQUIRED_STARTING_FIELDS.forEach(field => {
          if (faction.startingConditions[field] === undefined) {
            console.warn(`[FactionLoader] Faction "${label}" missing startingConditions.${field}`);
          }
        });

        // Validate systemCount range
        const sc = faction.startingConditions.systemCount;
        if (sc && (typeof sc.min !== 'number' || typeof sc.max !== 'number' || sc.min > sc.max)) {
          console.warn(`[FactionLoader] Faction "${label}" has invalid startingConditions.systemCount range`);
        }

        // Validate resource values are non-negative numbers
        const resources = faction.startingConditions.resources;
        if (resources) {
          ['credits', 'materials', 'recruits', 'influence'].forEach(r => {
            if (typeof resources[r] !== 'number' || resources[r] < 0) {
              console.warn(`[FactionLoader] Faction "${label}" has invalid resource value for: ${r}`);
            }
          });
        }
      }

      // Validate color fields
      if (faction.color) {
        ['primary', 'dark', 'accent'].forEach(c => {
          if (!faction.color[c] || !faction.color[c].startsWith('#')) {
            console.warn(`[FactionLoader] Faction "${label}" has invalid color.${c}`);
          }
        });
      }
    });

    console.log(`[FactionLoader] Schema validation complete for ${definitions.length} factions`);
  }

  /**
   * Clear cached definitions (useful for testing).
   */
  static clearCache() {
    this._definitions = null;
  }
}
