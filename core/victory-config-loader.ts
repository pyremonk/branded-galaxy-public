/**
 * VictoryConfigLoader - Loads and validates victory condition definitions
 * from victory-conditions.json
 */
import victoryConditionsJson from './victory-conditions.json';

export class VictoryConfigLoader {
  _config: any = null;
  _conditionMap: Record<string, any> | null = null;

  constructor() {}

  /**
   * Load and validate victory conditions config.
   * @returns {Object} The validated config
   */
  load() {
    this._config = victoryConditionsJson;
    this._validateConfig(this._config);
    this._buildConditionMap();
    return this._config;
  }

  /**
   * Get all conditions for a specific faction.
   * @param {string} factionId - e.g. 'brandAuthority', 'union', 'autoforge'
   * @returns {Array} Array of condition definition objects
   */
  getConditionsForFaction(factionId: string): any[] {
    if (!this._config) this.load();
    return this._config.victoryConditions[factionId] ?? [];
  }

  /**
   * Get a single condition definition by ID (global lookup).
   * @param {string} conditionId - e.g. 'vc-ba-territorial-control'
   * @returns {Object|null} Condition definition or null if not found
   */
  getCondition(conditionId: string): any {
    if (!this._config) this.load();
    return this._conditionMap?.[conditionId] ?? null;
  }

  /**
   * Get all faction IDs that have victory conditions defined.
   * @returns {string[]}
   */
  getFactionIds() {
    if (!this._config) this.load();
    return Object.keys(this._config.victoryConditions);
  }

  /**
   * Get all conditions across all factions as a flat array.
   * @returns {Array}
   */
  getAllConditions() {
    if (!this._config) this.load();
    return Object.values(this._config.victoryConditions).flat();
  }

  /**
   * Build flat map of conditionId → condition for fast lookup.
   * @private
   */
  _buildConditionMap() {
    this._conditionMap = {};
    for (const conditions of Object.values(this._config.victoryConditions) as any[]) {
      for (const condition of conditions) {
        this._conditionMap[condition.id] = condition;
      }
    }
  }

  /**
   * Validate the config structure.
   * @param {Object} config
   * @throws {Error} if validation fails
   * @private
   */
  _validateConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error('[VictoryConfigLoader] Config must be an object');
    }
    if (!config.victoryConditions || typeof config.victoryConditions !== 'object') {
      throw new Error('[VictoryConfigLoader] Config missing "victoryConditions" object');
    }

    const REQUIRED_FIELDS = ['id', 'name', 'description', 'difficulty', 'type'];
    let count = 0;

    for (const [factionId, conditions] of Object.entries(config.victoryConditions)) {
      if (!Array.isArray(conditions)) {
        throw new Error(`[VictoryConfigLoader] Conditions for faction "${factionId}" must be an array`);
      }
      for (const condition of conditions) {
        for (const field of REQUIRED_FIELDS) {
          if (condition[field] == null) {
            throw new Error(`[VictoryConfigLoader] Condition "${condition.id || '?'}" in faction "${factionId}" missing required field: "${field}"`);
          }
        }
        count++;
      }
    }

    console.log(`[VictoryConfigLoader] Validated ${count} victory conditions across ${Object.keys(config.victoryConditions).length} factions`);
  }
}

// Singleton instance
export const victoryConfigLoader = new VictoryConfigLoader();
