/**
 * TechTreeLoader - Loads and validates technology tree JSON definitions per faction.
 *
 * Stateless loader with an in-memory cache to avoid re-importing on every call.
 * Validates schema on first load; subsequent calls return cached data.
 */

const VALID_FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

const VALID_EFFECT_TYPES = [
  'production-bonus',
  'military-bonus',
  'storage-cap-bonus',
  'mission-bonus',
  'research-bonus',
  'cost-reduction',
  'unique-capability',
  'multi-research'
];

/** Static-path imports so Vite can analyse them at build time */
const FACTION_TREE_LOADERS = {
  brandAuthority: () => import('./tech-trees/brand-authority-tree.json'),
  union:          () => import('./tech-trees/union-tree.json'),
  autoforge:      () => import('./tech-trees/autoforge-tree.json')
};

export class TechTreeLoader {
  static _cache: Map<string, any> = new Map();

  /**
   * Load and validate the tech tree for a given faction.
   * Subsequent calls return the cached result.
   *
   * @param {string} factionId - One of 'brandAuthority', 'union', 'autoforge'
   * @returns {Promise<Object>} Parsed and validated tech tree
   * @throws {Error} If factionId is invalid or tree fails validation
   */
  static async loadTree(factionId: string): Promise<any> {
    if (TechTreeLoader._cache.has(factionId)) {
      return TechTreeLoader._cache.get(factionId);
    }

    if (!VALID_FACTION_IDS.includes(factionId)) {
      throw new Error(`[TechTreeLoader] Unknown factionId: "${factionId}". Valid: ${VALID_FACTION_IDS.join(', ')}`);
    }

    let tree;
    try {
      const module = await FACTION_TREE_LOADERS[factionId as keyof typeof FACTION_TREE_LOADERS]();
      tree = module.default;
    } catch (err) {
      throw new Error(`[TechTreeLoader] Failed to load tree for "${factionId}": ${(err as Error).message}`);
    }

    TechTreeLoader.validateTree(tree, factionId);
    TechTreeLoader._cache.set(factionId, tree);
    console.log(`[TechTreeLoader] Loaded ${tree.technologies.length} technologies for ${factionId}`);
    return tree;
  }

  /**
   * Load all faction trees and validate global ID uniqueness.
   * Call this at startup.
   *
   * @returns {Promise<Map<string, Object>>} Map of factionId → tree
   */
  static async loadAllTrees() {
    const trees = await Promise.all(
      VALID_FACTION_IDS.map(id => TechTreeLoader.loadTree(id))
    );
    const treeMap = new Map(VALID_FACTION_IDS.map((id, i) => [id, trees[i]]));
    TechTreeLoader.validateGlobalUniqueness([...treeMap.values()]);
    return treeMap;
  }

  /**
   * Get a single technology by ID within a loaded faction tree.
   * Requires the tree to be already loaded (call loadTree first).
   *
   * @param {string} factionId
   * @param {string} techId
   * @returns {Object|null} Tech definition or null if not found
   */
  static getTech(factionId: string, techId: string): any {
    const tree = TechTreeLoader._cache.get(factionId);
    if (!tree) return null;
    return tree.technologies.find((t: any) => t.id === techId) ?? null;
  }

  /**
   * Get all technologies for a faction (requires tree to be loaded).
   *
   * @param {string} factionId
   * @returns {Object[]} Array of tech definitions
   */
  static getAllTechs(factionId: string): any[] {
    const tree = TechTreeLoader._cache.get(factionId);
    return tree ? [...tree.technologies] : [];
  }

  /**
   * Get all technologies for a faction filtered by tier.
   *
   * @param {string} factionId
   * @param {number} tier - 1–5
   * @returns {Object[]}
   */
  static getTechsByTier(factionId: string, tier: number): any[] {
    return TechTreeLoader.getAllTechs(factionId).filter(t => t.tier === tier);
  }

  /**
   * Check whether a faction's tree is cached/loaded.
   *
   * @param {string} factionId
   * @returns {boolean}
   */
  static isLoaded(factionId: string): boolean {
    return TechTreeLoader._cache.has(factionId);
  }

  /**
   * Clear the cache (useful in tests).
   */
  static clearCache() {
    TechTreeLoader._cache.clear();
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate a loaded tech tree against the expected schema.
   * Throws a descriptive Error on any schema violation.
   *
   * @param {Object} tree - Parsed JSON data
   * @param {string} expectedFactionId - The faction we expected to load
   */
  static validateTree(tree: any, expectedFactionId: string): void {
    if (!tree || typeof tree !== 'object') {
      throw new Error(`[TechTreeLoader] Tree for "${expectedFactionId}" is not a valid object`);
    }
    if (!tree.factionId || typeof tree.factionId !== 'string') {
      throw new Error(`[TechTreeLoader] Missing or invalid "factionId" in tree for "${expectedFactionId}"`);
    }
    if (tree.factionId !== expectedFactionId) {
      throw new Error(`[TechTreeLoader] factionId mismatch: file declares "${tree.factionId}", expected "${expectedFactionId}"`);
    }
    if (!Array.isArray(tree.technologies) || tree.technologies.length === 0) {
      throw new Error(`[TechTreeLoader] "${expectedFactionId}" tree must have a non-empty "technologies" array`);
    }

    const seenIds = new Set<string>();
    for (const tech of tree.technologies) {
      TechTreeLoader._validateTech(tech, tree.factionId, seenIds);
    }

    TechTreeLoader.validatePrerequisites(tree);
  }

  /**
   * Validate a single technology entry.
   * @private
   */
  static _validateTech(tech: any, factionId: string, seenIds: Set<string>): void {
    const ctx = `[TechTreeLoader] Tech in "${factionId}"`;

    const requiredStrings = ['id', 'name', 'description', 'icon'];
    for (const field of requiredStrings) {
      if (typeof tech[field] !== 'string' || tech[field].trim() === '') {
        throw new Error(`${ctx}: missing or empty field "${field}" (tech: ${JSON.stringify(tech.id ?? '?')})`);
      }
    }

    if (seenIds.has(tech.id)) {
      throw new Error(`${ctx}: duplicate tech ID "${tech.id}"`);
    }
    seenIds.add(tech.id);

    if (!Number.isInteger(tech.tier) || tech.tier < 1 || tech.tier > 5) {
      throw new Error(`${ctx}: "${tech.id}" has invalid tier ${tech.tier} (must be integer 1-5)`);
    }

    // Validate cost
    const cost = tech.cost;
    if (!cost || typeof cost !== 'object') {
      throw new Error(`${ctx}: "${tech.id}" missing "cost" object`);
    }
    for (const field of ['credits', 'influence']) {
      if (!Number.isInteger(cost[field]) || cost[field] <= 0) {
        throw new Error(`${ctx}: "${tech.id}" cost.${field} must be a positive integer (got ${cost[field]})`);
      }
    }
    if (typeof cost.turns !== 'number' || cost.turns <= 0) {
      throw new Error(`${ctx}: "${tech.id}" cost.turns must be a positive number (got ${cost.turns})`);
    }

    // Validate prerequisites
    if (!Array.isArray(tech.prerequisites)) {
      throw new Error(`${ctx}: "${tech.id}" "prerequisites" must be an array`);
    }
    for (const req of tech.prerequisites) {
      if (typeof req !== 'string') {
        throw new Error(`${ctx}: "${tech.id}" prerequisites must be strings`);
      }
    }

    // Validate effects
    if (!Array.isArray(tech.effects)) {
      throw new Error(`${ctx}: "${tech.id}" "effects" must be an array`);
    }
    for (const effect of tech.effects) {
      if (!VALID_EFFECT_TYPES.includes(effect.type)) {
        throw new Error(`${ctx}: "${tech.id}" has unknown effect type "${effect.type}"`);
      }
      if (typeof effect.target !== 'string') {
        throw new Error(`${ctx}: "${tech.id}" effect missing "target" string`);
      }
      if (typeof effect.value !== 'number') {
        throw new Error(`${ctx}: "${tech.id}" effect missing numeric "value"`);
      }
    }

    // Validate unlocks
    const unlocks = tech.unlocks;
    if (!unlocks || typeof unlocks !== 'object') {
      throw new Error(`${ctx}: "${tech.id}" missing "unlocks" object`);
    }
    for (const field of ['units', 'buildings', 'missions', 'victoryConditions']) {
      if (!Array.isArray(unlocks[field])) {
        throw new Error(`${ctx}: "${tech.id}" unlocks.${field} must be an array`);
      }
    }
  }

  /**
   * Validate that all prerequisite IDs in a tree resolve to existing tech IDs within the same tree.
   * Warns (does not throw) on zero prerequisites for Tier 2+ techs.
   *
   * @param {Object} tree
   */
  static validatePrerequisites(tree: any): void {
    const allIds = new Set(tree.technologies.map((t: any) => t.id));
    for (const tech of tree.technologies) {
      for (const prereqId of tech.prerequisites) {
        if (!allIds.has(prereqId)) {
          throw new Error(
            `[TechTreeLoader] "${tree.factionId}" tech "${tech.id}" has dangling prerequisite "${prereqId}" (not found in same tree)`
          );
        }
      }
    }
  }

  /**
   * Validate that all tech IDs across multiple faction trees are globally unique.
   *
   * @param {Object[]} trees - Array of loaded tree objects
   * @throws {Error} If any ID appears in more than one tree
   */
  static validateGlobalUniqueness(trees: any[]): void {
    const globalIds = new Map(); // id → factionId
    for (const tree of trees) {
      for (const tech of tree.technologies) {
        if (globalIds.has(tech.id)) {
          throw new Error(
            `[TechTreeLoader] Duplicate global tech ID "${tech.id}" appears in both "${globalIds.get(tech.id)}" and "${tree.factionId}"`
          );
        }
        globalIds.set(tech.id, tree.factionId);
      }
    }
    console.log(`[TechTreeLoader] Global uniqueness check passed (${globalIds.size} total tech IDs)`);
  }
}
