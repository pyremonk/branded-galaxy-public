/**
 * System - Represents a star system in the galaxy
 * Handles rendering and state for individual systems
 */

// Faction colors (must match faction-definitions.json primary colors)
const FACTION_COLORS = {
  brandAuthority: 0x58a6ff, // Blue
  union: 0x3fb950,           // Green
  autoforge: 0xf0883e,       // Orange/Gold
  neutral: 0x8b949e,         // Gray
  secretBase: 0x3fb950       // Union secret base — same as union color but hidden initially
};

// CSS hex equivalents used for Phaser text labels
const FACTION_LABEL_COLORS = {
  brandAuthority: '#58a6ff',
  union:          '#3fb950',
  autoforge:      '#f0883e',
  neutral:        '#8b949e'
};

// Special type icons/indicators
const SPECIAL_ICONS = {
  manufacturingCenter: '⚙',
  researchFacility: '🔬',
  tradeHub: '💰',
  strategicChokepoint: '🛡'
};

export class System {
  scene: any;
  data: any;
  visual: any = null;
  selectedIndicator: any = null;
  _resourceLabel: any = null;
  _currentZoom: number = 1;
  _currentFilterMode: string | null = null;
  _fleetIndicatorState: any = null;
  isFogged: boolean = false;
  intelIndicator: any = null;
  selected: boolean = false;
  hovered: boolean = false;
  _prevAlpha: number = 0.9;
  _hasIntel: boolean = false;

  /**
   * @param {Phaser.Scene} scene - Phaser scene
   * @param {Object} systemData - System data from generator
   */
  constructor(scene: any, systemData: any) {
    this.scene = scene;
    this.data = systemData;
    
    // Visual elements
    this.visual            = null;
    this.selectedIndicator = null;

    // Filter overlay state
    this._resourceLabel = null;

    // Fleet-filter visual tracking (for zoom-aware stroke scaling)
    /** @type {number} last zoom level reported via updateVisibility */
    this._currentZoom = 1;
    /** @type {string|null} active filter mode, null when cleared */
    this._currentFilterMode = null;
    /** @type {{ color: number, alpha: number, hasShips: boolean }|null} */
    this._fleetIndicatorState = null;

    // Fog / intel state
    this.isFogged = false;
    this.intelIndicator = null;

    // State
    this.selected = false;
    this.hovered = false;
    
    this.render();
  }

  /**
   * Render system visual elements
   */
  render() {
    // Calculate radius based on population (larger = more populous)
    const baseRadius = 8;
    const radius = baseRadius + (this.data.population * 2);
    
    // Get faction color
    const fillColor = (FACTION_COLORS as Record<string, number>)[this.data.loyalty] || FACTION_COLORS.neutral;
    
    // Create main system circle
    this.visual = this.scene.add.circle(
      this.data.position.x,
      this.data.position.y,
      radius,
      fillColor,
      0.9
    );
    
    this.visual.setStrokeStyle(2, 0xffffff, 0.3);
    this.visual.setInteractive({ useHandCursor: true });
    this.visual.systemRef = this;
    
    // Add selection indicator (initially hidden)
    this.selectedIndicator = this.scene.add.circle(
      this.data.position.x,
      this.data.position.y,
      radius + 6,
      0xffffff,
      0
    );
    this.selectedIndicator.setStrokeStyle(2, 0xffffff, 0.8);
    this.selectedIndicator.setVisible(false);
    this.selectedIndicator.setDepth(5);
    
    // Intel indicator state — rendered by React SystemOverlays layer
    this._hasIntel = false;

    // Add hover effects
    this.visual.on('pointerover', () => this.onHoverStart());
    this.visual.on('pointerout', () => this.onHoverEnd());

    // Apply faction visual identity based on loyaltyValue
    this.updateVisuals();
  }

  /**
   * Get faction color for a given faction ID.
   * @param {string} factionId - Faction ID or null for neutral
   * @returns {number} Phaser color integer
   */
  getFactionColor(factionId: any) {
    return (FACTION_COLORS as Record<string, number>)[factionId] || FACTION_COLORS.neutral;
  }

  /**
   * Update visual appearance based on current loyalty and loyaltyValue.
   * - Full loyalty (≥ 80): solid faction color
   * - Contested (40–79): faction color, semi-transparent fill
   * - Low/neutral (< 40 or neutral): gray
   * - Secret base (hidden): rendered as neutral to non-allied factions
   */
  updateVisuals() {
    // Skip visual update while fogged — fog appearance is managed by applyFogState()
    if (this.isFogged) return;

    const loyalty = this.data.loyalty;
    const isSecretBase = this.data.specialType === 'secretBase' && this.data.secretBaseHidden;

    let fillColor;
    let fillAlpha;
    let strokeColor;
    let strokeAlpha;

    if (!loyalty || loyalty === 'neutral' || isSecretBase) {
      // Neutral or hidden secret base — show as gray
      fillColor   = FACTION_COLORS.neutral;
      fillAlpha   = 0.35;
      strokeColor = 0xffffff;
      strokeAlpha = 0.2;
    } else {
      // Default (no filter): flat faction color — no loyalty-based opacity scaling (D-01 removed)
      fillColor   = this.getFactionColor(loyalty);
      fillAlpha   = 0.70;
      strokeColor = fillColor;
      strokeAlpha = 0.75;
    }

    this.visual.setFillStyle(fillColor, fillAlpha);
    this.visual.setStrokeStyle(2, strokeColor, strokeAlpha);
  }

  /**
   * Handle hover start
   */
  onHoverStart() {
    this.hovered = true;

    // Fogged systems show minimal hover feedback — no scale change
    if (this.isFogged) {
      this.scene.events.emit('system-hover', this.data);
      return;
    }

    // Remember previous alpha so we can restore it later (filter logic may
    // have reduced opacity).
    this._prevAlpha = this.visual.alpha;
    // Brighten visual
    this.visual.setAlpha(1);
    this.visual.setScale(1.1);

    // Emit hover event for tooltip
    this.scene.events.emit('system-hover', this.data);
  }

  /**
   * Handle hover end
   */
  onHoverEnd() {
    this.hovered = false;
    
    // Reset visual – restore stored alpha or fall back to default
    this.visual.setAlpha(typeof this._prevAlpha === 'number' ? this._prevAlpha : 0.9);
    this.visual.setScale(1);
    
    // Emit hover end event
    this.scene.events.emit('system-hover-end');
  }

  /**
   * Select this system
   */
  select() {
    this.selected = true;
    this.selectedIndicator.setVisible(true);
    
    // Pulse animation
    this.scene.tweens.add({
      targets: this.selectedIndicator,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.8, to: 0.4 },
      duration: 1000,
      yoyo: true,
      repeat: -1
    });
  }

  /**
   * Deselect this system
   */
  deselect() {
    this.selected = false;
    this.selectedIndicator.setVisible(false);
    
    // Stop pulse animation
    this.scene.tweens.killTweensOf(this.selectedIndicator);
  }

  /**
   * Update system loyalty/faction
   * @param {string} newLoyalty - New faction loyalty
   * @param {number} [loyaltyValue=100] - Loyalty strength (0–100)
   */
  updateLoyalty(newLoyalty: any, loyaltyValue = 100) {
    this.data.loyalty = newLoyalty;
    this.data.loyaltyValue = loyaltyValue;
    // Don't animate color while fogged — snap when fog is cleared
    if (this.isFogged) return;
    const newColor = (FACTION_COLORS as Record<string, number>)[newLoyalty] || FACTION_COLORS.neutral;
    
    // Animate color transition
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 500,
      onUpdate: (tween: any) => {
        const value = tween.getValue();
        const oldColor = this.visual.fillColor;
        const r = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(oldColor),
          Phaser.Display.Color.IntegerToColor(newColor),
          1,
          value
        );
        this.visual.setFillStyle(Phaser.Display.Color.GetColor(r.r, r.g, r.b));
      },
      onComplete: () => {
        // Snap to final visual state after animation
        this.updateVisuals();
      }
    });
  }

  /**
   * Update rendering based on current zoom level.
   * Re-scales the fleet-filter stroke so it stays a constant screen-pixel width
   * as the camera zooms in/out — mirroring how React system-name labels stay constant.
   * @param {number} zoom - Current camera zoom
   */
  updateVisibility(zoom: any) {
    this._currentZoom = zoom;
    // Fogged systems stay fully hidden regardless of zoom
    if (this.isFogged) return;
    // Re-apply zoom-scaled stroke when fleet filter is active
    if (this._currentFilterMode === 'fleet' && this._fleetIndicatorState) {
      const { color, alpha, hasShips } = this._fleetIndicatorState;
      if (hasShips) {
        const scaledWidth = Math.max(0.5, 2 / zoom);
        this.visual.setStrokeStyle(scaledWidth, color, alpha);
      }
    }
  }

  // ─── Filter overlay ────────────────────────────────────────────────────────

  /**
   * Apply or remove fog-of-war on this system node.
   * Fogged systems render as a near-invisible dark dot.
   * @param {boolean} fogged
   */
  applyFogState(fogged: any) {
    this.isFogged = fogged;
    if (fogged) {
      this.visual.setFillStyle(0x333333, 0.15);
      this.visual.setStrokeStyle(1, 0x555555, 0.15);
      this._hasIntel = false;
    } else {
      this.updateVisuals();
    }
  }

  /**
   * Show or hide the intel indicator icon on this system node.
   * Hidden automatically when the system is fogged.
   * @param {boolean} hasIntel
   */
  setIntelIndicator(hasIntel: any) {
    this._hasIntel = hasIntel && !this.isFogged;
  }

  /**
   * Apply a galaxy-map filter overlay to this system.
   * Overrides the default faction-control appearance.
   * Call clearFilter() to restore normal visuals.
   *
   * @param {string} mode - 'faction'|'loyalty'|'resources'|'fleet'|'facilities'|'threat'|'missions'
   * @param {string} playerFactionId - The local player's faction ID
   * @param {Object} [extraData={}] - Mode-specific data passed from applyGalaxyFilter()
   */
  applyFilter(mode: any, playerFactionId: any, extraData: Record<string, any> = {}) {
    // 'fleet' and 'facilities' handle their own visibility gating internally.
    // All other modes must respect fog-of-war: fogged systems stay dimmed.
    const selfGating = mode === 'fleet' || mode === 'facilities';
    if (this.isFogged && !selfGating) {
      // Keep fog appearance — do not reveal faction/loyalty/resources/threat/mission info
      this.visual.setFillStyle(0x333333, 0.15);
      this.visual.setStrokeStyle(1, 0x555555, 0.15);
      this.visual.setScale(1);
      this._destroyResourceLabel();
      return;
    }

    switch (mode) {

      case 'faction': {
        // FR-GMF-003 — highlight focus faction; grey out all others (D-01, D-11 removed)
        // subFilter = null → player's own faction. 'neutral' → neutral only. factionId → that faction.
        const subFilter = extraData.subFilter ?? null;
        const targetId  = subFilter ?? playerFactionId;
        const loyalty   = this.data.loyalty;

        const isHighlighted = targetId === 'neutral'
          ? !loyalty || loyalty === 'neutral'
          : loyalty === targetId;

        if (isHighlighted) {
          const color = targetId === 'neutral'
            ? FACTION_COLORS.neutral
            : this.getFactionColor(targetId);
          this.visual.setFillStyle(color, 0.75);
          this.visual.setStrokeStyle(2, color, 0.85);
        } else {
          this.visual.setFillStyle(0x484f58, 0.25);
          this.visual.setStrokeStyle(1, 0x484f58, 0.2);
        }
        this.visual.setScale(1);
        this._destroyResourceLabel();
        break;
      }

      case 'loyalty': {
        // FR-GMF-004 — circle SCALED by loyalty value; no color tiers (D-02 removed)
        // Controlled systems: faction color. Non-controlled: transparent white.
        const focusFactionId = extraData.focusFactionId ?? playerFactionId;
        const loyaltyData    = extraData.loyaltyData ?? {};
        const loyalty        = this.data.loyalty;
        const isControlled   = loyalty === focusFactionId;

        // Loyalty value toward the focus faction for this system
        const lv    = loyaltyData[this.data.id] ?? (isControlled ? (this.data.loyaltyValue ?? 0) : 0);
        // Scale: 0.5×  at loyalty 0 → 1.5× at loyalty 100
        const scale = 0.5 + (lv / 100);
        this.visual.setScale(scale);

        if (isControlled) {
          const color = this.getFactionColor(focusFactionId);
          this.visual.setFillStyle(color, 0.75);
          this.visual.setStrokeStyle(2, color, 0.8);
        } else {
          // Non-controlled systems: transparent white — size conveys loyalty level
          this.visual.setFillStyle(0xffffff, 0.18);
          this.visual.setStrokeStyle(1, 0xffffff, 0.25);
        }
        this._destroyResourceLabel();
        break;
      }

      case 'resources': {
        // FR-GMF-005 — circle scaled by output vs. average; faction color (not hardcoded blue)
        const output = (this.data.resources?.credits ?? 0) + (this.data.resources?.materials ?? 0);
        const avg    = extraData.avgOutput ?? 1;
        const ratio  = avg > 0 ? output / avg : 1;
        const scale  = Math.min(Math.max(ratio, 0.55), 1.5);

        this.visual.setScale(scale);
        const color = this.getFactionColor(this.data.loyalty);
        this.visual.setFillStyle(color, 0.65);
        this.visual.setStrokeStyle(2, color, 0.75);
        this._destroyResourceLabel();
        break;
      }

      case 'fleet': {
        // FR-GMF-006 — stationed fleets highlighted; en-route destinations distinct
        // D-04 (hover-restore opacity), D-05 (directional arrows), D-06 (ship count badge) removed
        const playerOwnedSystems    = extraData.playerOwnedSystems    ?? new Set();
        const fleetIntelSystems     = extraData.fleetIntelSystems     ?? new Set();
        const playerFleetSystems    = extraData.playerFleetSystems    ?? new Set();
        const fleetData             = extraData.fleetData             ?? {};
        const inTransitDestinations = extraData.inTransitDestinations ?? new Set();

        const isVisible = playerOwnedSystems.has(this.data.id)
                       || fleetIntelSystems.has(this.data.id)
                       || playerFleetSystems.has(this.data.id);

        this._currentFilterMode   = 'fleet';
        this._fleetIndicatorState = null;
        this._destroyResourceLabel();
        this.visual.setScale(1);

        if (inTransitDestinations.has(this.data.id)) {
          // En-route fleet destination — distinct light-blue border (D-05: no arrow)
          this.updateVisuals();
          const scaledWidth = Math.max(0.5, 3 / this._currentZoom);
          this.visual.setStrokeStyle(scaledWidth, 0x79c0ff, 0.9);
          this._fleetIndicatorState = { color: 0x79c0ff, alpha: 0.9, hasShips: true };
        } else if (isVisible) {
          const shipCount = fleetData[this.data.id] ?? 0;
          if (shipCount > 0) {
            // Stationed fleets — faction color with zoom-stable thick stroke
            this.updateVisuals();
            const factionColor = this.getFactionColor(this.data.loyalty) || 0xffffff;
            const scaledWidth  = Math.max(0.5, 2 / this._currentZoom);
            this.visual.setStrokeStyle(scaledWidth, factionColor, 0.9);
            this._fleetIndicatorState = { color: factionColor, alpha: 0.9, hasShips: true };
          } else {
            // Visible but no fleets — greyed out (D-04: no hover-restore opacity logic)
            this.visual.setFillStyle(0x484f58, 0.3);
            this.visual.setStrokeStyle(1, 0x484f58, 0.25);
            this._fleetIndicatorState = { color: 0x484f58, alpha: 0.25, hasShips: false };
          }
        } else {
          // Not visible / no intel
          this.visual.setFillStyle(0x484f58, 0.2);
          this.visual.setStrokeStyle(1, 0x484f58, 0.15);
        }
        break;
      }

      case 'facilities': {
        // FR-GMF-007 — faction color for systems with facilities; sub-filter by type
        // D-10 (HP tooltip) is a React concern; removed from this Phaser layer
        const playerOwnedSystems   = extraData.playerOwnedSystems   ?? new Set();
        const facilityIntelSystems = extraData.facilityIntelSystems ?? new Set();
        const subFilter            = extraData.subFilter ?? null;

        const isKnown = playerOwnedSystems.has(this.data.id)
                     || facilityIntelSystems.has(this.data.id);

        this._destroyResourceLabel();
        this.visual.setScale(1);

        if (!isKnown) {
          this.visual.setFillStyle(0x484f58, 0.2);
          this.visual.setStrokeStyle(1, 0x484f58, 0.15);
          break;
        }

        const facilities = this.data.facilities ?? [];
        let hasFacilities;
        if (subFilter === 'idle_shipyard') {
          hasFacilities = (extraData.idleShipyardSystems ?? new Set()).has(this.data.id);
        } else if (subFilter === 'idle_queue') {
          hasFacilities = (extraData.idleQueueSystems ?? new Set()).has(this.data.id);
        } else {
          hasFacilities = subFilter
            ? facilities.some((f: any) => f.facilityId === subFilter)
            : facilities.length > 0;
        }

        if (hasFacilities) {
          const color = this.getFactionColor(this.data.loyalty);
          this.visual.setFillStyle(color, 0.7);
          this.visual.setStrokeStyle(3, color, 0.85);
        } else {
          this.visual.setFillStyle(0x484f58, 0.25);
          this.visual.setStrokeStyle(2, 0x484f58, 0.3);
        }
        break;
      }

      case 'threat': {
        // FR-GMF-008 — red border on qualifying threat systems only
        // D-07 (amber contested border) and D-08 (green well-defended border) removed
        // D-09 extended: 2-hop adjacency + stationed enemy fleets (computed in MainStage)
        const threatSystems = extraData.threatSystems ?? new Set();

        this._destroyResourceLabel();
        this.visual.setScale(1);
        // Restore faction fill first, then overlay the border
        this.updateVisuals();

        if (threatSystems.has(this.data.id)) {
          this.visual.setStrokeStyle(3, 0xf85149, 0.9);
        } else {
          this.visual.setStrokeStyle(2, 0xffffff, 0.2);
        }
        break;
      }

      case 'missions': {
        // FR-GMF-009 — systems with known missions shown in faction color; others greyed
        const missionSystems = extraData.missionSystems ?? new Set();

        this._destroyResourceLabel();
        this.visual.setScale(1);

        if (missionSystems.has(this.data.id)) {
          const color = this.getFactionColor(this.data.loyalty);
          this.visual.setFillStyle(color, 0.75);
          this.visual.setStrokeStyle(2, color, 0.85);
        } else {
          this.visual.setFillStyle(0x484f58, 0.25);
          this.visual.setStrokeStyle(1, 0x484f58, 0.2);
        }
        break;
      }

      default:
        this.clearFilter();
    }
  }

  /**
   * Remove any active filter override and restore normal faction-control appearance.
   */
  clearFilter() {
    this._currentFilterMode   = null;
    this._fleetIndicatorState = null;
    this.visual.setScale(1);
    this._destroyResourceLabel();
    // restore standard faction visuals and visible alpha
    this.updateVisuals();
    this.visual.setAlpha(0.9);
  }

  /** @private */
  _destroyResourceLabel() {
    if (this._resourceLabel) {
      this._resourceLabel.destroy();
      this._resourceLabel = null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Destroy all visual elements
   */
  destroy() {
    if (this.visual) this.visual.destroy();
    if (this.selectedIndicator) this.selectedIndicator.destroy();
    this._destroyResourceLabel();
  }

  /**
   * Get center position
   * @returns {Object} {x, y} position
   */
  getPosition() {
    return { x: this.data.position.x, y: this.data.position.y };
  }
}
