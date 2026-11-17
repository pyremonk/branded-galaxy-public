/// <reference types="vite/client" />
/**
 * DevTools - Browser console testing utilities for local development only.
 *
 * Access via:  window.devTools.<command>()
 * Help:        devTools.help()
 *
 * Only initialised when import.meta.env.DEV is true. The guard at the top of
 * initDevTools() causes Vite's dead-code elimination to strip the entire module
 * body from production builds — window.devTools is never defined in prod.
 *
 * @module dev-tools
 */

import { SeededRandom } from './seeded-random.js';

// ─── Scene interface ──────────────────────────────────────────────────────────
// Minimal duck-typed interface covering the MainStage properties accessed by
// dev-tools. Typed as `any` for manager instances until those files are migrated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DevToolsScene extends Phaser.Scene {
  galaxy:                   any;
  resourceStates:           any;
  resourceEngine:           any;
  techStates:               any;
  characterStates:          Record<string, any>;
  victoryGameState:         any;
  currentTurn:              number;
  fleetStateManager:        any;
  combatEngine:             any;
  loyaltyStateManager:      any;
  constructionEngine:       any;
  constructionStateManager: any;
  missionStateManager:      any;
  eventEngine:              any;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Initialise the dev tools and attach them to window.devTools.
 * Called at the end of MainStage.create() after all managers are ready.
 *
 * @param {Phaser.Scene} scene - The MainStage scene instance.
 */
export function initDevTools(scene: DevToolsScene): void {
  if (!import.meta.env.DEV) return;

  // Expose scene globally so ad-hoc console scripts can reach it directly.
  window.__bg = scene;

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** @returns {string} Player faction from Phaser registry */
  function _playerFaction() {
    return scene.game.registry.get('playerFactionId') || 'brandAuthority';
  }

  /** @returns {Object|null} Flat galaxy system by ID */
  function _findSystem(systemId: string) {
    return scene.galaxy.systems.find((s: any) => s.id === systemId) ?? null;
  }

  /** @returns {Object|null} Fleet by ID across all factions */
  function _findFleet(fleetId: string) {
    return scene.fleetStateManager.getFleetById(fleetId) ?? null;
  }

  /**
   * Iterate all per-faction CharacterStateManagers and find a character by ID.
   * @returns {{ manager: CharacterStateManager, char: Object }|null}
   */
  function _findCharacter(charId: string) {
    for (const [, mgr] of Object.entries(scene.characterStates)) {
      const char = (mgr as any).getCharacter(charId);
      if (char) return { manager: mgr, char };
    }
    return null;
  }

  /** @returns {Object|null} Active mission by ID from internal state */
  function _findMission(missionId: string) {
    return scene.missionStateManager.state?.activeMissions?.[missionId] ?? null;
  }

  /** Build a minimal resolution context for event helpers */
  function _buildContext() {
    return {
      galaxy:                   scene.galaxy,
      resourceStates:           scene.resourceStates,
      resourceEngine:           scene.resourceEngine,
      techStates:               scene.techStates,
      characterStates:          scene.characterStates,
      victoryGameState:         scene.victoryGameState,
      currentTurn:              scene.currentTurn,
      fleetStateManager:        scene.fleetStateManager,
      combatEngine:             scene.combatEngine,
      loyaltyStateManager:      scene.loyaltyStateManager,
      constructionEngine:       scene.constructionEngine,
      constructionStateManager: scene.constructionStateManager,
      playerFactionId:          _playerFaction(),
    };
  }

  // ── DevTools Object ───────────────────────────────────────────────────────

  const dt = {

    // ── Help ──────────────────────────────────────────────────────────────

    help() {
      const s = 'color: #58a6ff; font-weight: bold;';
      const h = 'color: #f0883e; font-weight: bold;';
      const d = 'color: #8b949e;';
      console.group('%c  Branded Galaxy DevTools ', 'background:#161b22;color:#58a6ff;font-size:13px;font-weight:bold;border:1px solid #30363d;padding:3px 8px;border-radius:4px;');

      console.log('%cInspect', h);
      console.log('%c  devTools.listSystems()                             list all systems with IDs, owner, loyalty', d);
      console.log('%c  devTools.listFleets()                              list all fleets with IDs and locations', d);
      console.log('%c  devTools.listCharacters(factionId?)                list characters (optional: filter by faction)', d);
      console.log('%c  devTools.listMissions(factionId?)                  list active missions (optional: filter by faction)', d);
      console.log('%c  devTools.listQueues(systemId?)                     list construction queues', d);

      console.log('%cCombat', h);
      console.log('%c  devTools.triggerCombat(fleetIdA, fleetIdB)         teleport fleet B to fleet A\'s system and resolve combat immediately', d);

      console.log('%cConstruction', h);
      console.log('%c  devTools.completeConstruction(systemId?)           instantly finish all queued items (optional: one system)', d);

      console.log('%cMissions', h);
      console.log('%c  devTools.completeMission(missionId?)               set turnsRemaining to 0 and tick (all if no ID given)', d);
      console.log('%c  devTools.setMissionDuration(missionId, turns)      override turnsRemaining on a specific mission', d);

      console.log('%cMovement', h);
      console.log('%c  devTools.moveFleet(fleetId, systemId)              teleport a fleet to a system', d);
      console.log('%c  devTools.moveCharacter(charId, systemId)           teleport a character to a system', d);

      console.log('%cCapture', h);
      console.log('%c  devTools.captureSystem(systemId, factionId)        force a faction to capture a system', d);

      console.log('%cEvents', h);
      console.log('%c  devTools.triggerEvent(eventId, factionId?)         fire a game event immediately (default: player faction)', d);
      console.log('%c  devTools.listEvents()                              list all loaded event IDs and types', d);

      console.log('%c\n  window.__bg  →  raw MainStage scene reference', s);
      console.groupEnd();
    },

    // ── Inspect ───────────────────────────────────────────────────────────

    listSystems() {
      const rows = scene.galaxy.systems.map((s: any) => ({
        id:         s.id,
        name:       s.name,
        owner:      s.loyalty ?? 'neutral',
        loyaltyVal: s.loyaltyValue ?? 0,
        sector:     s.sectorId,
      }));
      console.table(rows);
      return scene.galaxy.systems;
    },

    listFleets() {
      // fleets is { factionId: Fleet[] } — flatten across all factions
      const all: any[] = Object.values(scene.fleetStateManager.fleets ?? {}).flat();
      const rows = all.map((f: any) => ({
        id:       f.id,
        name:     f.name,
        faction:  f.factionId,
        systemId: f.systemId,
        inTransit: f.inTransit != null,
        ships:    f.ships?.length ?? 0,
      }));
      console.table(rows);
      return all;
    },

    listCharacters(factionId?: string) {
      const result: any[] = [];
      for (const [fid, mgr] of Object.entries(scene.characterStates)) {
        if (factionId && fid !== factionId) continue;
        const chars = mgr.getAllCharacters?.() ?? [];
        result.push(...chars);
      }
      const rows = result.map(c => ({
        id:         c.id,
        name:       c.name,
        faction:    c.faction,
        location:   c.locationSystemId,
        status:     c.status,
        mission:    c.assignedMissionId ?? '—',
        fleet:      c.assignedFleetId ?? '—',
      }));
      console.table(rows);
      return result;
    },

    listMissions(factionId?: string) {
      const missions: any[] = scene.missionStateManager.getActiveMissions(factionId);
      const rows = missions.map((m: any) => ({
        missionId:    m.missionId,
        faction:      m.factionId,
        type:         m.type ?? m.missionType ?? '?',
        character:    m.characterId ?? m.assignedCharacterId ?? '—',
        turnsLeft:    m.turnsRemaining,
        totalTurns:   m.totalTurns,
      }));
      console.table(rows);
      return missions;
    },

    listQueues(systemId?: string) {
      const sm = scene.constructionStateManager;
      const systemIds = systemId
        ? [systemId]
        : Object.keys(sm._systemStates ?? {});

      for (const sysId of systemIds) {
        const queue = sm.getQueue(sysId);
        if (!queue?.length) continue;
        const sys = _findSystem(sysId);
        console.group(`${sys?.name ?? sysId}  (${sysId})`);
        console.table(queue.map((q: any) => ({
          id:           q.id,
          facilityId:   q.facilityId,
          action:       q.action,
          turnsLeft:    q.turnsRemaining,
        })));
        console.groupEnd();
      }
    },

    listEvents() {
      const events: any[] = scene.eventEngine?._events ?? [];
      console.table(events.map((e: any) => ({ id: e.id, type: e.type, title: e.title })));
      return events;
    },

    // ── Combat ────────────────────────────────────────────────────────────

    /**
     * Teleport fleet B to fleet A's current system then resolve space combat
     * between them immediately using the real CombatEngine.
     */
    triggerCombat(fleetIdA: string, fleetIdB: string) {
      if (!fleetIdA || !fleetIdB) {
        console.error('Usage: devTools.triggerCombat(fleetIdA, fleetIdB)');
        return;
      }
      const fleetA = _findFleet(fleetIdA);
      const fleetB = _findFleet(fleetIdB);
      if (!fleetA) { console.error(`[DevTools] Fleet not found: ${fleetIdA}`); return; }
      if (!fleetB) { console.error(`[DevTools] Fleet not found: ${fleetIdB}`); return; }

      const systemId = fleetA.systemId;
      const systemData = _findSystem(systemId);
      if (!systemData) { console.error(`[DevTools] System not found for fleet A: ${systemId}`); return; }

      // Teleport fleet B into the same system
      fleetB.systemId = systemId;
      fleetB.inTransit = null;

      const rng = new SeededRandom(`dev-combat-${fleetIdA}-${fleetIdB}`);

      try {
        const result = scene.combatEngine.resolveCombat(
          fleetA.factionId, [fleetA],
          fleetB.factionId, [fleetB],
          systemData,
          scene.techStates,
          rng,
          {}
        );
        console.log(`%c[DevTools] Combat resolved — winner: ${result.winner ?? 'draw'}`, 'color:#3fb950');
        console.log(result);

        // Refresh UI
        window.dispatchEvent(new CustomEvent('game:combatFlash', {
          detail: { systemId, attackerFactionId: fleetA.factionId, defenderFactionId: fleetB.factionId }
        }));
        window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
      } catch (err) {
        console.error('[DevTools] triggerCombat failed:', err);
      }
    },

    // ── Construction ─────────────────────────────────────────────────────

    /**
     * Set all in-queue items' turnsRemaining to 0, then call advanceAllQueues()
     * to let the real construction engine process completions.
     */
    completeConstruction(systemId?: string) {
      const sm = scene.constructionStateManager;
      const systemIds = systemId
        ? [systemId]
        : Object.keys(sm._systemStates ?? {});

      let count = 0;
      for (const sysId of systemIds) {
        const queue = sm.getQueue(sysId);
        if (!queue?.length) continue;
        for (const item of queue) {
          if (item.turnsRemaining > 0) {
            item.turnsRemaining = 0;
            count++;
          }
        }
      }

      if (count === 0) {
        console.warn('[DevTools] No in-progress construction items found.');
        return;
      }

      const completed = sm.advanceAllQueues();
      console.log(`%c[DevTools] Zeroed ${count} item(s); advanceAllQueues returned ${completed.length} completion(s)`, 'color:#3fb950');
      console.log(completed);

      window.dispatchEvent(new CustomEvent('galaxy:requestConstructionUpdate'));
    },

    // ── Missions ─────────────────────────────────────────────────────────

    /**
     * Set turnsRemaining to 0 on one or all active missions, then tick
     * advanceTurn so the real mission resolution path fires.
     */
    completeMission(missionId?: string) {
      const activeMissions: Record<string, any> = scene.missionStateManager.state?.activeMissions ?? {};

      if (missionId) {
        const m: any = activeMissions[missionId];
        if (!m) { console.error(`[DevTools] Mission not found: ${missionId}`); return; }
        m.turnsRemaining = 0;
        console.log(`%c[DevTools] Mission ${missionId} set to complete`, 'color:#3fb950');
      } else {
        let count = 0;
        for (const m of Object.values(activeMissions) as any[]) {
          if (m.turnsRemaining > 0) { m.turnsRemaining = 0; count++; }
        }
        console.log(`%c[DevTools] Set ${count} mission(s) to complete`, 'color:#3fb950');
      }

      // Tick through the real mission resolution path
      const ready = scene.missionStateManager.advanceTurn(scene.currentTurn);
      console.log(`[DevTools] advanceTurn returned ${ready.length} ready mission(s) for resolution`);
      window.dispatchEvent(new CustomEvent('game:requestMissionUpdate'));
    },

    /** Directly override turnsRemaining on a specific mission. */
    setMissionDuration(missionId: string, turns: number) {
      if (!missionId || turns === undefined) {
        console.error('Usage: devTools.setMissionDuration(missionId, turns)');
        return;
      }
      const m = (scene.missionStateManager.state?.activeMissions ?? {})[missionId];
      if (!m) { console.error(`[DevTools] Mission not found: ${missionId}`); return; }
      m.turnsRemaining = Number(turns);
      console.log(`%c[DevTools] Mission ${missionId} turnsRemaining → ${turns}`, 'color:#3fb950');
      window.dispatchEvent(new CustomEvent('game:requestMissionUpdate'));
    },

    // ── Movement ─────────────────────────────────────────────────────────

    /** Teleport a fleet to any system, clearing any active transit/command. */
    moveFleet(fleetId: string, systemId: string) {
      if (!fleetId || !systemId) {
        console.error('Usage: devTools.moveFleet(fleetId, systemId)');
        return;
      }
      const fleet = _findFleet(fleetId);
      if (!fleet) { console.error(`[DevTools] Fleet not found: ${fleetId}`); return; }
      const system = _findSystem(systemId);
      if (!system) { console.error(`[DevTools] System not found: ${systemId}`); return; }

      fleet.systemId  = systemId;
      fleet.inTransit = null;
      fleet.command   = null;

      console.log(`%c[DevTools] Fleet "${fleet.name}" teleported to ${system.name} (${systemId})`, 'color:#3fb950');
      window.dispatchEvent(new CustomEvent('galaxy:requestFleetUpdate'));
    },

    /** Teleport a character to any system, unassigning them first. */
    moveCharacter(charId: string, systemId: string) {
      if (!charId || !systemId) {
        console.error('Usage: devTools.moveCharacter(charId, systemId)');
        return;
      }
      const found = _findCharacter(charId);
      if (!found) { console.error(`[DevTools] Character not found: ${charId}`); return; }
      const system = _findSystem(systemId);
      if (!system) { console.error(`[DevTools] System not found: ${systemId}`); return; }

      const { manager, char } = found;
      manager.unassign(charId);
      char.locationSystemId = systemId;

      console.log(`%c[DevTools] Character "${char.name}" teleported to ${system.name} (${systemId})`, 'color:#3fb950');
      window.dispatchEvent(new CustomEvent('game:requestCharacterUpdate', {
        detail: { factionId: char.faction }
      }));
    },

    // ── System Capture ────────────────────────────────────────────────────

    /**
     * Force a faction to capture a system using the canonical
     * applyCaptureLoyalty path, which syncs both system.loyalty and the
     * per-faction loyalty values.
     */
    captureSystem(systemId: string, factionId: string) {
      if (!systemId || !factionId) {
        console.error('Usage: devTools.captureSystem(systemId, factionId)');
        return;
      }
      const system = _findSystem(systemId);
      if (!system) { console.error(`[DevTools] System not found: ${systemId}`); return; }

      const previousOwner = system.loyalty ?? 'neutral';

      scene.loyaltyStateManager.applyCaptureLoyalty(system, factionId, previousOwner);

      console.log(`%c[DevTools] "${system.name}" captured by ${factionId} (was: ${previousOwner})`, 'color:#3fb950');

      // Fire the standard system-captured event so MainStage visual listeners react
      window.dispatchEvent(new CustomEvent('game:systemCaptured', {
        detail: { systemId, newOwner: factionId, previousOwner }
      }));
      window.dispatchEvent(new CustomEvent('galaxy:requestLoyaltyUpdate'));
    },

    // ── Events ────────────────────────────────────────────────────────────

    /**
     * Find an event definition by ID and fire it immediately via the real
     * _handleFiredEvent path so all effects and notifications are applied.
     *
     * @param {string} eventId    - ID from events.json
     * @param {string} [factionId] - target faction (defaults to player faction)
     */
    triggerEvent(eventId: string, factionId?: string) {
      if (!eventId) {
        console.error('Usage: devTools.triggerEvent(eventId, factionId?)');
        return;
      }
      const ee = scene.eventEngine;
      if (!ee) { console.error('[DevTools] eventEngine not initialised'); return; }

      const evt = ee._events?.find((e: any) => e.id === eventId);
      if (!evt) {
        console.error(`[DevTools] Event not found: "${eventId}". Use devTools.listEvents() to see available IDs.`);
        return;
      }

      const targetFaction   = factionId ?? _playerFaction();
      const context         = _buildContext();
      const pendingChoices: any[]  = [];
      const appliedEvents: any[]   = [];

      // Call the private handler directly — same path used during real turn resolution
      ee._handleFiredEvent(
        evt, targetFaction, _playerFaction(),
        scene.currentTurn, context,
        pendingChoices, appliedEvents
      );

      if (pendingChoices.length > 0) {
        // Choice events need player input — fire the same CustomEvent MainStage uses
        window.dispatchEvent(new CustomEvent('galaxy:choiceEventPending', {
          detail: { events: pendingChoices }
        }));
        console.log(`%c[DevTools] Choice event "${eventId}" queued for player input`, 'color:#58a6ff');
      } else {
        console.log(`%c[DevTools] Event "${eventId}" fired on faction ${targetFaction}`, 'color:#3fb950');
        console.log(appliedEvents[0] ?? evt);
      }

      // Refresh galaxy state panels
      window.dispatchEvent(new CustomEvent('game:requestGalaxySystems'));
    },

  };

  window.devTools = dt;

  console.log(
    '%c  DevTools loaded  %c type devTools.help() ',
    'background:#161b22;color:#3fb950;font-size:12px;font-weight:bold;border:1px solid #3fb950;padding:3px 8px;border-radius:4px 0 0 4px;',
    'background:#0d1117;color:#8b949e;font-size:12px;border:1px solid #30363d;border-left:none;padding:3px 8px;border-radius:0 4px 4px 0;'
  );
}
