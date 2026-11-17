import Phaser from 'phaser';
import { Sector } from '../ui/sector.ts';
import { System } from '../ui/system.ts';
import { dataBridge } from '../core/data-bridge.ts';
import { SaveStateManager } from '../core/save-state-manager.ts';
import { TurnStateManager } from '../core/turn-state-manager.ts';
import { TurnResolutionEngine } from '../core/turn-resolution-engine.ts';
import { InitiativeEngine } from '../core/initiative-engine.ts';
import { GalaxyGenerator } from '../core/galaxy-generator.ts';
import { ResourceEngine } from '../core/resource-engine.ts';
import { ResourceStateManager } from '../core/resource-state-manager.ts';
import resourceConfig from '../core/resource-config.json';
import { VictoryStateManager } from '../core/victory-state-manager.ts';
import { victoryProgressUpdater } from '../core/victory-progress-updater.ts';
import { victoryValidator } from '../core/victory-validator.ts';
import { victoryNotificationEngine } from '../core/victory-notification-engine.ts';
import { TechTreeLoader } from '../core/tech-loader.ts';
import { TechStateManager } from '../core/tech-state-manager.ts';
import { TechResearchEngine } from '../core/tech-research-engine.ts';
import { CharacterStateManager } from '../core/character-state-manager.ts';
import characterDefinitions from '../core/character-definitions.json';
import { FleetStateManager } from '../core/fleet-state-manager.ts';
import { CombatEngine } from '../core/combat-engine.ts';
import { ConstructionStateManager } from '../core/construction-state-manager.ts';
import { ConstructionEngine } from '../core/construction-engine.ts';
import constructionConfig from '../core/construction-config.json';
import { AIController } from '../core/ai-controller.ts';
import { LoyaltyStateManager } from '../core/loyalty-state-manager.ts';
import { DiplomacyEngine } from '../core/diplomacy-engine.ts';
import { MissionStateManager } from '../core/mission-state-manager.ts';
import { missionEngine } from '../core/mission-engine.ts';
import { GroundCombatEngine } from '../core/ground-combat-engine.ts';
import { EventEngine } from '../core/event-engine.ts';
import eventsData from '../core/events.json';
import { IntelStateManager } from '../core/intel-state-manager.ts';
import { intelEngine } from '../core/intel-engine.ts';
import { HotSeatManager } from '../core/hot-seat-manager.ts';
import { networkSessionManager } from '../core/network-session-manager.ts';
import { sessionPresenceManager } from '../core/session-presence-manager.ts';
import { TutorialEngine } from '../core/tutorial-engine.ts';
import tutorialSteps from '../core/tutorial-steps.json';
import tutorialScenario from '../core/tutorial-scenario.json';
import { audioManager } from '../core/audio-manager.ts';
import { FactionDefinitionLoader } from '../core/faction-loader.ts';
import { syncTickManager, DEFAULT_TICKS_PER_TURN } from '../core/sync-tick-manager.ts';
import { snapshotManager, registerSnapshotConstructors, SNAPSHOT_VERSION } from '../core/snapshot-manager.ts';
import { CMD } from '../core/command-types.ts';
import { turnManager } from '../core/turn-manager.ts';
import { initDevTools } from '../core/dev-tools.ts';
import { FEATURES } from '../core/feature-flags.js';

export class MainStage extends Phaser.Scene {
  constructor() {
    super('MainStage');
    this.sectorList = [];
    this.systems = [];
    this.connections = [];
    this.selectedSystem = null;
    this.galaxy = null;
    this.playerEnergy = 100;
    this.capturedCount = 0;

    // Resource management
    this.resourceEngine = null;
    this.resourceStates = {}; // factionId → ResourceStateManager
    this.currentTurn = 1;

    // Research system
    this.techResearchEngine = null;
    this.techStates = {}; // factionId → TechStateManager

    // Character/leader system (spec 009-012)
    this.characterStates = {}; // factionId → CharacterStateManager

    // Victory conditions
    this.victoryGameState = null;  // Shared game state object for victory system

    // Turn phase system (specs 028-029)
    this.turnStateManager     = null;
    this.initiativeEngine     = null;
    this.turnResolutionEngine = null;
    this.inputLocked          = false;  // True during Resolution/Maintenance phases
    this.endTurnBtn           = null;   // stub; state managed via galaxy:endTurnState events

    // Galaxy map filter (spec 034)
    this.activeFilter    = null;   // null = no filter active (FR-GMF-002 default state)
    this.activeSubFilter = null;

    // Fleet management (specs 013–016)
    this.fleetStateManager = null;
    this.combatEngine      = null;

    // Construction system (specs 017–020)
    this.constructionStateManager = null;
    this.constructionEngine       = null;
    // AI opponent controllers (specs 032–033) — factionId → AIController
    this.aiControllers = {};
    // Diplomacy & Loyalty (specs 024–027)
    this.loyaltyStateManager = null;
    this.diplomacyEngine     = null;
    // Mission system (specs 021–023)
    this.missionStateManager = null;
    // Ground combat system (spec 048)
    this.groundCombatEngine  = null;
    // Event system (spec 045)
    this.eventEngine = null;
    // Intel system (specs 042–044)
    this.intelStateManager = null;
    // Hot-seat multiplayer (spec 049)
    this.hotSeatManager = null;
    // Network multiplayer (spec 050)
    this.networkMode = false; // true when gameMode starts with 'network-'
    // Sync mode (spec 058)
    this._syncMode = false;   // true when sync tick loop is active
    this._syncPaused = false; // true when sync tick loop is paused by user
    this._syncSeqCounter = 0; // per-tick command sequence counter
    // Game pacing status (spec 060) — 'async' or 'sync'
    this.gameStatus = 'async';
    // Tutorial engine (specs 053-054)
    this.tutorialEngine = null;
    this.shownTips = new Set(); // context-sensitive tip tracking
  }

  create() {
    this.cameras.main.fadeIn(500, 13, 17, 23);
    
    // Generate galaxy
    this.generateGalaxy();
    
    // Initialize resource management
    this.initializeResourceManagement();

    // Initialize tech research system (async — runs in background)
    this.initializeTechSystem();

    // Initialize character/leader system
    this.initializeCharacterSystem();

    // Initialize victory conditions system
    this.initializeVictorySystem();
    
    // Setup rendering
    this.addStarfield();

    // Recreate starfield and mark overlay dirty on viewport resize
    this.scale.on('resize', () => {
      this.addStarfield();
      this._overlayDirty = true;
    }, this);

    this.renderGalaxy();
    this._overlayDirty = true; // kick first overlay emission after systems are placed
    this.setupCamera();
    this.buildHUD();

    // Initialize turn phase system — after galaxy + resources are ready
    this.initializeTurnSystem();

    // Initialize fleet management system (specs 013–016)
    this.initializeFleetSystem();

    // Initialize construction system (specs 017–020)
    this.initializeConstructionSystem();
    // Initialize diplomacy & loyalty system (specs 024–027)
    this.initializeLoyaltySystem();
    // Initialize mission system (specs 021–023)
    this.initializeMissionSystem();

    // Initialize event system (spec 045)
    this.initializeEventSystem();

    // Initialize intel system (specs 042–044)
    this.initializeIntelSystem();

    // Setup interactions
    this.setupInput();
    this.restorePlayerData();

    // Register visual particle effects for game events (spec 051 FR-VS-007)
    this._registerParticleEffects();

    // Register state-manager constructors for snapshot reconciliation (spec 059)
    registerSnapshotConstructors({
      ResourceStateManager,
      TechStateManager,
      CharacterStateManager,
      FleetStateManager,
      ConstructionStateManager,
      MissionStateManager,
      LoyaltyStateManager,
      IntelStateManager,
      TurnStateManager,
      HotSeatManager,
      AIController,
    });

    // Start ambient music now that the game scene is running (spec 052 FR-AU-002)
    audioManager.startAmbientMusic();

    // Initialize tutorial engine if tutorial mode is active (specs 053-054)
    this._initializeTutorialEngine();

    // Attach browser-console testing utilities (dev builds only)
    initDevTools(this);
  }

  addStarfield() {
    // Destroy previous static stars + their tweens
    if (this._stars) {
      for (const star of this._stars) {
        this.tweens.killTweensOf(star);
        star.destroy();
      }
    }
    this._stars = [];

    // Spread stars across a world region large enough to fill the viewport at
    // any zoom level and camera position.
    //
    // A star at world position wx with scrollFactor 0.15 is visible when:
    //   wx ∈ [scrollX × 0.15, scrollX × 0.15 + viewW / zoom]
    //
    // Worst case (min zoom 0.5, scrollX at bounds min -300, widest likely screen 2560):
    //   left edge: -300 × 0.15 = -45  → start stars at -500 for margin
    //   right edge: -45 + 2560 / 0.5 = 5075  → end stars at 5500 for margin
    //
    // Same reasoning for Y (min zoom 0.5, viewH 1440 large monitor):
    //   top edge: -300 × 0.15 = -45  → start stars at -500
    //   bottom edge: -45 + 1440 / 0.5 = 2835  → end stars at 3500 for margin
    const STAR_ORIGIN_X = -500;
    const STAR_ORIGIN_Y = -500;
    const STAR_WORLD_W  = 6500;   // covers to x = 6000
    const STAR_WORLD_H  = 4500;   // covers to y = 4000
    const count = 1000;

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(STAR_ORIGIN_X, STAR_ORIGIN_X + STAR_WORLD_W);
      const y = Phaser.Math.Between(STAR_ORIGIN_Y, STAR_ORIGIN_Y + STAR_WORLD_H);
      const r = Phaser.Math.FloatBetween(0.4, 1.8);

      const star = this.add.circle(x, y, r, 0xffffff, 1);
      // Gentle parallax: stars move at 15% of camera pan speed
      star.setScrollFactor(0.15);
      star.setDepth(-1);
      star.setAlpha(Phaser.Math.FloatBetween(0.1, 0.8));

      // Independent randomised twinkle for each star
      this.tweens.add({
        targets:  star,
        alpha:    {
          from: Phaser.Math.FloatBetween(0.05, 0.25),
          to:   Phaser.Math.FloatBetween(0.55, 1.0),
        },
        duration: Phaser.Math.Between(600, 5000),
        yoyo:     true,
        repeat:   -1,
        delay:    Phaser.Math.Between(0, 5000),
        ease:     'Sine.easeInOut',
      });

      this._stars.push(star);
    }
  }

  /**
   * Register window event listeners that trigger Phaser particle effects.
   * Spec: 051-visual-style-spec.md (FR-VS-007)
   *   - game:combatFlash   → red burst at system node (15 particles, 0.5s)
   *   - game:systemCaptured → faction-color spray (20 particles, 1.0s)
   *   - game:techCompleted  → purple ring (30 particles, 0.8s)
   * @private
   */
  _registerParticleEffects() {
    // Combat flash — brief red particle burst at system node
    window.addEventListener('game:combatFlash', (e) => {
      const { systemId } = e.detail ?? {};
      const systemObj = this.systems.find(s => s.data?.id === systemId);
      if (!systemObj) return;
      const { x, y } = systemObj.data.position;
      const burst = this.add.particles(x, y, 'particle', {
        speed:     { min: 60, max: 120 },
        scale:     { start: 0.35, end: 0 },
        alpha:     { start: 1, end: 0 },
        tint:      0xf85149,
        blendMode: 'ADD',
        lifespan:  500,
        quantity:  15,
        emitting:  false,
        depth:     50
      });
      burst.explode(15);
      this.time.delayedCall(600, () => burst.destroy());
    });

    // System capture — faction-color particle spray
    window.addEventListener('game:systemCaptured', (e) => {
      const { systemId, factionId } = e.detail ?? {};
      const systemObj = this.systems.find(s => s.data?.id === systemId);
      if (!systemObj) return;
      const { x, y } = systemObj.data.position;

      // Faction color tints
      const FACTION_TINTS = {
        brandAuthority: 0x58a6ff,
        union:          0x3fb950,
        autoforge:      0xf0883e,
      };
      const tint = FACTION_TINTS[factionId] ?? 0xffffff;

      const spray = this.add.particles(x, y, 'particle', {
        speed:     { min: 50, max: 100 },
        scale:     { start: 0.4, end: 0 },
        alpha:     { start: 1, end: 0 },
        tint,
        blendMode: 'ADD',
        lifespan:  1000,
        quantity:  20,
        emitting:  false,
        depth:     50
      });
      spray.explode(20);
      this.time.delayedCall(1100, () => spray.destroy());
    });

    // Fleet transit dot — animate a faction-colored dot along the hyperspace lane
    window.addEventListener('game:fleetMoved', (e) => {
      const { fromSystemId, toSystemId, factionId } = e.detail ?? {};
      const srcObj = this.systems.find(s => s.data?.id === fromSystemId);
      const dstObj = this.systems.find(s => s.data?.id === toSystemId);
      if (!srcObj || !dstObj) return;
      const { x: sx, y: sy } = srcObj.data.position;
      const { x: dx, y: dy } = dstObj.data.position;
      const FACTION_TINTS = {
        brandAuthority: 0x58a6ff,
        union:          0x3fb950,
        autoforge:      0xf0883e,
      };
      const tint = FACTION_TINTS[factionId] ?? 0xffffff;
      const dot = this.add.circle(sx, sy, 4, tint).setDepth(30).setAlpha(0.9);
      this.tweens.add({
        targets:  dot,
        x:        dx,
        y:        dy,
        duration: 1000,
        ease:     'Linear',
        onComplete: () => dot.destroy()
      });
    });

    // Research complete — purple ring expanding from research HUD area
    window.addEventListener('game:techCompleted', (e) => {
      const { factionId } = e.detail ?? {};
      const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
      if (factionId && factionId !== playerFactionId) return; // only for player's own research

      // Emit from top-center area where research HUD is displayed
      const cx = 640, cy = 60;
      const ring = this.add.particles(cx, cy, 'particle', {
        speed:     { min: 80, max: 140 },
        scale:     { start: 0.3, end: 0 },
        alpha:     { start: 0.9, end: 0 },
        tint:      0xbc8cff,
        blendMode: 'ADD',
        lifespan:  800,
        quantity:  30,
        emitting:  false,
        depth:     200
      });
      ring.explode(30);
      this.time.delayedCall(900, () => ring.destroy());
    });
  }

  /**
   * Generate galaxy using galaxy generator
   * Uses the player's selected faction ID (from game registry) for faction-aware placement
   */
  generateGalaxy() {
    const player = dataBridge.getPlayer();
    const seed = player?.id || 'default-seed';

    // Retrieve player faction from registry (set by startPhaserGame in main.jsx)
    const playerFactionId = this.game.registry.get('playerFactionId');
    const activeFactions = playerFactionId
      ? [playerFactionId, ...['brandAuthority', 'union', 'autoforge'].filter(f => f !== playerFactionId)]
      : ['brandAuthority', 'union', 'autoforge'];

    const gameConfig = this.game.registry.get('gameConfig') ?? {};

    // If loading from a save, use the saved galaxy directly (FR-LG-004)
    if (gameConfig.savedState?.galaxy) {
      this.galaxy = gameConfig.savedState.galaxy;
      console.log('[MainStage] Using galaxy from save state (',
        this.galaxy.systems.length, 'systems)');
      return;
    }

    // If tutorial mode, use the fixed tutorial scenario
    if (gameConfig.isTutorial) {
      this.galaxy = tutorialScenario;
      console.log('[MainStage] Using tutorial scenario');
      return;
    }

    // If a pre-generated galaxy was passed from GalaxySetupScreen's preview,
    // use it directly — guarantees Phaser renders the exact layout the player confirmed.
    if (gameConfig.preGeneratedGalaxy) {
      this.galaxy = gameConfig.preGeneratedGalaxy;
      console.log('[MainStage] Using pre-generated galaxy from gameConfig (',
        this.galaxy.systems.length, 'systems)');
      return;
    }

    const galaxySeed = gameConfig.galaxySeed ?? seed;
    const size       = gameConfig.galaxySize ?? 'medium';
    console.log('[MainStage] Generating galaxy with seed:', galaxySeed, '| player faction:', playerFactionId);
    const generator = new GalaxyGenerator(galaxySeed, size);
    this.galaxy = generator.generate(activeFactions);
    console.log('[MainStage] Galaxy generated:', this.galaxy.systems.length, 'systems');
  }

  /**
   * Initialize ResourceEngine and per-faction ResourceStateManagers.
   * Reads faction starting resources from the galaxy factionData if available,
   * otherwise falls back to reasonable defaults.
   */
  initializeResourceManagement() {
    this.resourceEngine = new ResourceEngine(resourceConfig);

    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    const mult = gameConfig.startingResourceMultiplier ?? 1.0;

    const factionIds = ['brandAuthority', 'union', 'autoforge'];
    const baseStartingResources = {
      brandAuthority: { credits: 2000, materials: 1500, recruits: 500,  influence: 300 },
      union:          { credits: 1000, materials:  800, recruits: 600,  influence: 500 },
      autoforge:      { credits: 1500, materials: 3000, recruits: 200,  influence: 200 }
    };
    const defaultStartingResources = Object.fromEntries(
      Object.entries(baseStartingResources).map(([id, r]) => [
        id,
        {
          credits:   Math.round(r.credits   * mult),
          materials: Math.round(r.materials * mult),
          recruits:  Math.round(r.recruits  * mult),
          influence: Math.round(r.influence * mult),
        }
      ])
    );

    factionIds.forEach(factionId => {
      const starting = defaultStartingResources[factionId] ?? { credits: 500, materials: 250, recruits: 100, influence: 50 };
      this.resourceStates[factionId] = new ResourceStateManager(factionId, starting, resourceConfig);
    });

    // Override with tutorial starting resources if in tutorial mode
    if (gameConfig.isTutorial && tutorialScenario.factionData) {
      for (const [fid, fData] of Object.entries(tutorialScenario.factionData)) {
        if (fData.startingResources && this.resourceStates[fid]) {
          this.resourceStates[fid] = new ResourceStateManager(fid, fData.startingResources, resourceConfig);
        }
      }
    }

    console.log('[MainStage] Resource management initialized for', factionIds.length, 'factions');
    this._notifyReactResourceUpdate();

    // Allow React components to request a data refresh
    window.addEventListener('galaxy:requestResourceUpdate', () => {
      this._notifyReactResourceUpdate();
    });
  }

  /**
   * Initialize the turn phase system (TurnStateManager, InitiativeEngine, TurnResolutionEngine).
   * Must be called after initializeResourceManagement() and generateGalaxy().
   * Spec: 028-turn-structure-spec.md, 029-turn-order-spec.md
   */
  initializeTurnSystem() {
    // Determine initiative order from game seed (same seed as galaxy)
    const player = dataBridge.getPlayer();
    const seed = player?.id || 'default-seed';
    const factionIds = Object.keys(this.resourceStates);

    this.initiativeEngine = new InitiativeEngine();
    this.initiativeEngine.rollInitiative(factionIds, seed);

    // TurnStateManager owns phase state, staged actions, and turn summary
    this.turnStateManager = new TurnStateManager(() => this.currentTurn);

    // TurnResolutionEngine sequences Resolution Phase steps by initiative order
    this.turnResolutionEngine = new TurnResolutionEngine(
      this.turnStateManager,
      this.initiativeEngine.getOrder(),
      this.fleetStateManager,
      this.combatEngine,
      this.diplomacyEngine,
      this.missionStateManager,
      this.characterStates,
      this.groundCombatEngine,
      this.eventEngine
    );

    // Begin Turn 1 Action Phase
    this.turnStateManager.beginActionPhase();

    // Initialize AI controllers for non-player factions (specs 032–033)
    this._initializeAIControllers();

    // Initialize hot-seat multiplayer if mode requires it (spec 049)
    this._initializeHotSeat();

    // Initialize network multiplayer if mode requires it (spec 050)
    this._initializeNetworkMode();

    // Spec 057: Initialize SessionPresenceManager for single-player (solo) if
    // neither hot-seat nor network mode claimed it.  This enables solo players
    // to toggle sync mode for the real-time tick loop (spec 058).
    if (!sessionPresenceManager._initialized) {
      const gcfg        = this.game.registry.get('gameConfig') ?? {};
      const userId      = gcfg.userId ?? 'local';
      const displayName = gcfg.displayName ?? 'Player';
      const gameId      = gcfg.gameId ?? 'local-solo';
      sessionPresenceManager.initialize(gameId, userId, displayName, gcfg.factionId ?? this.game.registry.get('playerFactionId'), {
        requiredPlayerCount: 1,
        isSolo:    true,
        isHotSeat: false,
      });
    }

    // Spec 058: Listen for sync/async mode transitions
    window.addEventListener('session:gameStatusChanged', (e) => {
      const { status } = e.detail ?? {};
      if (status === 'sync') {
        this._enterSyncMode();
      } else if (status === 'async' && this._syncMode) {
        this._exitSyncMode();
      }
    });

    // Spec 058: Speed change requests from SyncTickHUD
    window.addEventListener('game:changeSyncSpeed', (e) => {
      const { ticksPerSecond } = e.detail ?? {};
      if (ticksPerSecond && syncTickManager.isRunning()) {
        syncTickManager.changeSpeed(ticksPerSecond);
      }
    });

    // Spec 060: Solo mode toggle from SessionPanel
    window.addEventListener('game:toggleSyncMode', () => {
      sessionPresenceManager.toggleSyncMode();
    });

    // Sync pause/unpause — any player can pause; only host (or solo) can unpause
    window.addEventListener('game:toggleSyncPause', () => {
      if (!this._syncMode) return;
      const isSolo = sessionPresenceManager.isSolo();
      const isHost = isSolo || (sessionPresenceManager.isHost?.() ?? false);

      if (this._syncPaused) {
        // Unpause — guard: multiplayer non-host cannot unpause
        if (!isSolo && !isHost) {
          console.warn('[MainStage] Only the host can unpause in multiplayer.');
          return;
        }
        this._syncPaused = false;
        window.dispatchEvent(new CustomEvent('session:tickLoopResume'));
        // Broadcast to other clients in multiplayer
        if (this.networkMode) {
          networkSessionManager.broadcastSyncPause(false);
        }
        window.dispatchEvent(new CustomEvent('galaxy:syncPauseChanged', {
          detail: { paused: false },
        }));
        console.log('[MainStage] Sync mode unpaused.');
      } else {
        // Pause — any player can pause
        this._syncPaused = true;
        window.dispatchEvent(new CustomEvent('session:tickLoopPause'));
        if (this.networkMode) {
          networkSessionManager.broadcastSyncPause(true);
        }
        window.dispatchEvent(new CustomEvent('galaxy:syncPauseChanged', {
          detail: { paused: true },
        }));
        console.log('[MainStage] Sync mode paused.');
      }
    });

    // Multiplayer: receive pause broadcast from another client
    window.addEventListener('network:syncPauseChanged', (e) => {
      const paused = e.detail?.paused ?? false;
      if (paused === this._syncPaused) return; // already in that state
      this._syncPaused = paused;
      if (paused) {
        window.dispatchEvent(new CustomEvent('session:tickLoopPause'));
      } else {
        window.dispatchEvent(new CustomEvent('session:tickLoopResume'));
      }
      window.dispatchEvent(new CustomEvent('galaxy:syncPauseChanged', {
        detail: { paused },
      }));
      console.log(`[MainStage] Sync pause state received from network: ${paused ? 'paused' : 'resumed'}.`);
    });

    // Spec 060: React can request current game status
    window.addEventListener('game:requestGameStatus', () => {
      window.dispatchEvent(new CustomEvent('galaxy:gameStatusUpdate', {
        detail: {
          gameStatus: this.gameStatus,
          isSolo: sessionPresenceManager.isSolo(),
          isHotSeat: sessionPresenceManager.isHotSeat(),
          isHost: sessionPresenceManager.isHost?.() ?? false,
          syncPaused: this._syncPaused ?? false,
        },
      }));
    });

    // Spec 060: Ready toggle from SessionPanel (multiplayer)
    window.addEventListener('game:toggleReady', () => {
      const isNowReady = !sessionPresenceManager.isLocalReady();
      const result = sessionPresenceManager.setReady(isNowReady);
      if (!result.success) {
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: { tier: 'warning', message: result.reason ?? 'Cannot toggle ready.' },
        }));
      }
    });

    // Spec 060: Host requests immediate return to async mode
    window.addEventListener('game:requestAsyncMode', () => {
      if (!sessionPresenceManager.isHost?.()) return;
      sessionPresenceManager.requestAsyncMode('host_request');
    });

    // Spec 060: Non-host votes to return to async mode
    window.addEventListener('game:requestAsyncVote', () => {
      networkSessionManager.requestAsyncVote();
    });

    // Spec 060: When async vote threshold is reached, host transitions
    window.addEventListener('session:asyncVoteThresholdReached', () => {
      if (sessionPresenceManager.isHost?.()) {
        sessionPresenceManager.requestAsyncMode('vote');
      }
    });

    // Spec 060: Initialize TurnManager for solo/offline mode
    if (!this.networkMode && !this.hotSeatManager) {
      const gcfg2      = this.game.registry.get('gameConfig') ?? {};
      const soloGameId = gcfg2.gameId ?? 'local-solo';
      const soloUserId = gcfg2.userId ?? 'local';
      turnManager.initialize({
        gameId: soloGameId,
        userId: soloUserId,
        requiredPlayers: [soloUserId],
        turnTimerMinutes: 0,
      });
    }

    // React → Phaser: stage / unstage actions during Action Phase
    window.addEventListener('galaxy:stageAction', (e) => {
      const { type, payload } = e.detail ?? {};
      if (type) {
        const result = this.stagePlayerAction(type, payload ?? {});
        window.dispatchEvent(new CustomEvent('galaxy:stageActionResult', {
          detail: result
        }));
      }
    });
    window.addEventListener('galaxy:unstageAction', (e) => {
      const { id } = e.detail ?? {};
      if (id) this.unstagePlayerAction(id);
    });

    // Camera navigation from React notifications / turn summary (spec 036 FR-NA-007)
    window.addEventListener('galaxy:navigateTo', (e) => {
      const { systemId } = e.detail ?? {};
      if (!systemId) return;
      const systemObj = this.systems.find(s => s.data.id === systemId);
      if (systemObj) {
        // Select the system (shows pulsing ring + opens SystemDetailsPanel)
        this.onSystemClick(systemObj);
        // Smooth pan + zoom to the system
        this.centerOnSystem(systemObj);
      }
    });

    // Galaxy map filter switching (spec 034)
    window.addEventListener('galaxy:applyFilter', (e) => {
      const { mode, subFilter = null } = e.detail ?? {};
      if (mode !== undefined && mode !== null) this.applyGalaxyFilter(mode, subFilter);
    });

    // Minimap world-space navigation
    window.addEventListener('galaxy:navigateToWorld', (e) => {
      const { worldX, worldY } = e.detail ?? {};
      if (worldX != null && worldY != null) {
        this.cameras.main.pan(worldX, worldY, 400, 'Power2');
      }
    });

    // Re-render fog + intel indicators when intel state changes
    window.addEventListener('galaxy:intelUpdate', () => {
      this._updateFogOfWar();
    });

    // React → Phaser: perform a manual save (game:saveGame)
    window.addEventListener('game:saveGame', async (e) => {
      const { slotId, slotName } = e.detail ?? {};
      if (!slotId) {
        window.dispatchEvent(new CustomEvent('game:saveGameResult', {
          detail: { success: false, error: 'No slot ID specified.' }
        }));
        return;
      }
      const result = await this.saveGame(slotId, slotName);
      window.dispatchEvent(new CustomEvent('game:saveGameResult', { detail: result }));
    });

    console.log('[MainStage] Turn phase system initialized — initiative order:',
      this.initiativeEngine.getOrder().join(' > '));
  }

  /**
   * Apply a galaxy-map filter overlay to all System instances.
   * Dispatched by the React MapFilterHUD via 'galaxy:applyFilter'.
   * Passing mode='none' clears all filters and restores the default state.
   *
   * @param {string}      mode      - Filter mode key (see FR-GMF-001), or 'none' to clear
   * @param {string|null} subFilter - Optional sub-filter (faction ID, facility type ID, etc.)
   * @spec 034-galaxy-map-filters-spec.md
   */
  applyGalaxyFilter(mode, subFilter = null) {
    // 'none' clears all filters and returns to the default (no filter) state (FR-GMF-002)
    if (mode === 'none') {
      this.activeFilter    = null;
      this.activeSubFilter = null;
      this._overlayFleetData      = {};
      this._overlayMissionSystems = null;
      for (const system of this.systems) system.clearFilter();
      this._overlayDirty = true;
      console.log('[MainStage] Galaxy filter cleared');
      return;
    }

    this.activeFilter    = mode;
    this.activeSubFilter = subFilter;

    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';

    // Build mode-specific extra data before iterating
    const extraData = { subFilter };

    if (mode === 'resources') {
      const total = this.galaxy.systems.reduce((sum, s) =>
        sum + (s.resources?.credits ?? 0) + (s.resources?.materials ?? 0), 0);
      extraData.avgOutput = this.galaxy.systems.length > 0
        ? total / this.galaxy.systems.length
        : 1;
    }

    if (mode === 'loyalty') {
      // Build per-system loyalty values for the focus faction (FR-GMF-004)
      const focusFactionId     = subFilter ?? playerFactionId;
      extraData.focusFactionId = focusFactionId;
      const loyaltyData = {};
      if (this.loyaltyStateManager) {
        for (const sys of this.galaxy.systems) {
          loyaltyData[sys.id] = this.loyaltyStateManager.getLoyalty(sys.id, focusFactionId);
        }
      } else {
        // Fallback: use loyaltyValue from galaxy data when focus faction controls the system
        for (const sys of this.galaxy.systems) {
          loyaltyData[sys.id] = sys.loyalty === focusFactionId ? (sys.loyaltyValue ?? 0) : 0;
        }
      }
      extraData.loyaltyData = loyaltyData;
    }

    if (mode === 'threat') {
      // 2-hop BFS from player systems; only enemy systems WITH stationed fleets qualify
      // (D-09 extended from 1-hop to 2-hop; adds stationed-fleet requirement)
      const playerSystemIds = new Set(
        this.galaxy.systems.filter(s => s.loyalty === playerFactionId).map(s => s.id)
      );

      // Build set of systems that have at least one non-transit fleet stationed
      const systemsWithFleets = new Set();
      if (this.fleetStateManager) {
        for (const fleetList of Object.values(this.fleetStateManager.fleets)) {
          for (const fleet of fleetList) {
            if (fleet.inTransit) continue;
            const sid = fleet.systemId;
            if (sid) systemsWithFleets.add(sid);
          }
        }
      }

      // 1-hop neighbours (excluding player systems)
      const hop1 = new Set();
      for (const sysId of playerSystemIds) {
        const sys = this.galaxy.systems.find(s => s.id === sysId);
        for (const connId of (sys?.connections ?? [])) {
          if (!playerSystemIds.has(connId)) hop1.add(connId);
        }
      }

      // 2-hop neighbours (excluding player systems and hop1)
      const hop2 = new Set();
      for (const sysId of hop1) {
        const sys = this.galaxy.systems.find(s => s.id === sysId);
        for (const connId of (sys?.connections ?? [])) {
          if (!playerSystemIds.has(connId) && !hop1.has(connId)) hop2.add(connId);
        }
      }

      // Threat = enemy systems within 2 hops that have stationed fleets
      const threatSystems = new Set();
      for (const sysId of [...hop1, ...hop2]) {
        const sys = this.galaxy.systems.find(s => s.id === sysId);
        if (!sys) continue;
        const isEnemy = sys.loyalty && sys.loyalty !== 'neutral' && sys.loyalty !== playerFactionId;
        if (isEnemy && systemsWithFleets.has(sysId)) threatSystems.add(sysId);
      }
      extraData.threatSystems = threatSystems;
    }

    if (mode === 'fleet') {
      const playerFactionItems = this.intelStateManager
        ? this.intelStateManager.getActiveItems(playerFactionId, this.currentTurn)
        : [];
      const fleetIntelSystems = new Set(
        playerFactionItems.filter(i => i.type === 'fleet_composition').map(i => i.systemId)
      );
      const fleetData = {};
      playerFactionItems
        .filter(i => i.type === 'fleet_composition')
        .forEach(i => { fleetData[i.systemId] = i.data?.shipCount ?? i.data?.strength ?? 0; });

      const playerFleetSystems    = new Set();
      const inTransitDestinations = new Set();
      if (this.fleetStateManager) {
        const playerFleets = this.fleetStateManager.getFleetsForFaction(playerFactionId);
        for (const fleet of playerFleets) {
          if (fleet.inTransit) {
            // Fix 1: use correct field name (was destinationId)
            const dest = fleet.inTransit.destinationSystemId;
            if (dest) inTransitDestinations.add(dest);
            // Fix 2: also mark current position so the fleet is visible mid-transit
            const curSys = fleet.systemId;
            if (curSys) {
              playerFleetSystems.add(curSys);
              fleetIntelSystems.add(curSys);
              fleetData[curSys] = (fleetData[curSys] ?? 0) + (fleet.ships?.length ?? 0);
            }
          } else {
            const systemId = fleet.systemId ?? fleet.locationSystemId;
            if (!systemId) continue;
            playerFleetSystems.add(systemId);
            fleetIntelSystems.add(systemId);
            fleetData[systemId] = (fleetData[systemId] ?? 0) + (fleet.ships?.length ?? 0);
          }
        }

        // Fix 3: reveal enemy stationed fleets at systems where the player has a fleet
        const ALL_FACTIONS = ['brandAuthority', 'union', 'autoforge'];
        for (const fid of ALL_FACTIONS) {
          if (fid === playerFactionId) continue;
          const enemyFleets = this.fleetStateManager.getFleetsForFaction(fid);
          for (const ef of enemyFleets) {
            if (!ef.inTransit && ef.systemId && playerFleetSystems.has(ef.systemId)) {
              fleetData[ef.systemId] = (fleetData[ef.systemId] ?? 0) + (ef.ships?.length ?? 0);
            }
          }
        }
      }

      extraData.fleetIntelSystems     = fleetIntelSystems;
      extraData.fleetData             = fleetData;
      extraData.playerFleetSystems    = playerFleetSystems;
      extraData.inTransitDestinations = inTransitDestinations;
      this._overlayFleetData = fleetData;
    }

    // Clear cached fleet/mission overlay data when switching away from those filters
    if (mode !== 'fleet') {
      this._overlayFleetData = {};
    }
    if (mode !== 'missions') {
      this._overlayMissionSystems = null;
    }

    if (mode === 'facilities') {
      const playerFactionItems = this.intelStateManager
        ? this.intelStateManager.getActiveItems(playerFactionId, this.currentTurn)
        : [];
      const facilityIntelSystems = new Set(
        playerFactionItems.filter(i => i.type === 'facility_status').map(i => i.systemId)
      );
      extraData.facilityIntelSystems = facilityIntelSystems;
    }

    // Player-owned systems set (needed by fleet and facilities fog-gating)
    if (mode === 'fleet' || mode === 'facilities') {
      extraData.playerOwnedSystems = new Set(
        this.galaxy.systems.filter(s => s.loyalty === playerFactionId).map(s => s.id)
      );
    }

    // Pre-compute idle-state sets for the two new Facilities sub-filters
    if (mode === 'facilities' && (subFilter === 'idle_shipyard' || subFilter === 'idle_queue')) {
      const facilityIntelSystems = extraData.facilityIntelSystems ?? new Set();
      const playerOwnedSystems   = extraData.playerOwnedSystems   ?? new Set();
      const knownSystems = new Set([...playerOwnedSystems, ...facilityIntelSystems]);

      if (subFilter === 'idle_shipyard') {
        const idleShipyardSystems = new Set();
        for (const system of this.galaxy.systems) {
          if (!playerOwnedSystems.has(system.id)) continue;
          const sysState = this.constructionStateManager?.getSystemState(system.id);
          if (!sysState?.facilities?.some(f => f.facilityId === 'shipyard')) continue;
          const prodQueue = this.fleetStateManager?.productionQueues?.[system.id] ?? [];
          if (prodQueue.length === 0) idleShipyardSystems.add(system.id);
        }
        extraData.idleShipyardSystems = idleShipyardSystems;
      }

      if (subFilter === 'idle_queue') {
        const idleQueueSystems = new Set();
        for (const system of this.galaxy.systems) {
          if (!knownSystems.has(system.id)) continue;
          const queue = this.constructionStateManager?.getQueue(system.id) ?? [];
          if (queue.length === 0) idleQueueSystems.add(system.id);
        }
        extraData.idleQueueSystems = idleQueueSystems;
      }
    }

    if (mode === 'missions') {
      // Build set of system IDs with player-visible active missions (FR-GMF-009)
      const allMissions = this.missionStateManager
        ? this.missionStateManager.getActiveMissions()
        : [];
      const playerIntelSystems = this.intelStateManager
        ? new Set(
            this.intelStateManager.getActiveItems(playerFactionId, this.currentTurn)
              .map(i => i.systemId)
          )
        : new Set();
      const missionSystems = new Set();
      for (const mission of allMissions) {
        const sysId = mission.targetSystemId ?? mission.targetId;
        if (!sysId) continue;
        const isOwn = mission.factionId === playerFactionId;
        if (isOwn || playerIntelSystems.has(sysId)) {
          if (subFilter === null || mission.factionId === subFilter) {
            missionSystems.add(sysId);
          }
        }
      }
      extraData.missionSystems       = missionSystems;
      this._overlayMissionSystems = missionSystems; // cache for minimap
    }

    this._overlayDirty = true;

    for (const system of this.systems) {
      system.applyFilter(mode, playerFactionId, extraData);
    }

    console.log('[MainStage] Galaxy filter applied:', mode, subFilter ? `(sub: ${subFilter})` : '');
  }

  /**
   * @deprecated Use submitActionPhase() directly. Kept as alias for backward compatibility.
   */
  resolveTurn() {
    this.submitActionPhase();
  }

  /**
   * Submit the Action Phase (End Turn). Delegates to the appropriate submission
   * strategy based on game mode (solo, hot-seat, async network, sync, solo-sync).
   * Called by the End Turn button.
   *
   * Spec: 028-turn-structure-spec.md (FR-TS-002), 049-multiplayer-modes-spec.md (FR-MP-002),
   *       050-network-features-spec.md (FR-NF-003), 060-async-flow-mode-switching-spec.md (FR-MSW-006)
   */
  submitActionPhase() {
    if (this.inputLocked) {
      console.warn('[MainStage] Input locked — End Turn blocked during Resolution/Maintenance');
      return;
    }

    if (!this.turnStateManager) {
      // Fallback: turn system not yet ready, run legacy maintenance pipeline
      this._runMaintenancePhase();
      return;
    }

    const strategy = this._getSubmissionStrategy();
    if (!strategy.canSubmit()) return;
    strategy.submit();
  }

  /**
   * Return the submission strategy object for the current game mode.
   * Spec: 060-async-flow-mode-switching-spec.md (FR-MSW-006)
   * @private
   * @returns {{ submit: Function, canSubmit: Function, getStatusLabel: Function }}
   */
  _getSubmissionStrategy() {
    if (this.gameStatus === 'sync' && !this.networkMode) return this._soloSyncStrategy;
    if (this.gameStatus === 'sync')                      return this._syncSubmissionStrategy;
    if (this.networkMode)                                return this._asyncNetworkStrategy;
    if (this.hotSeatManager)                             return this._hotSeatStrategy;
    return this._soloStrategy;
  }

  /**
   * Solo async strategy — resolve turn immediately (single-player, turn-based).
   * @private
   */
  get _soloStrategy() {
    const stage = this;
    return {
      canSubmit() { return true; },
      getStatusLabel() { return 'Your turn'; },
      submit() {
        // Run AI turns before locking the Action Phase (specs 032–033)
        stage._runAITurns();

        const result = stage.turnStateManager.submitActionPhase(
          () => {
            const playerFactionId = stage.game.registry.get('playerFactionId') || 'brandAuthority';
            const rsm = stage.resourceStates[playerFactionId];
            if (!rsm) return { valid: true, conflicts: [] };
            return stage.resourceEngine.validateStagedBudget(rsm.state);
          }
        );
        if (!result.success) return;

        if (stage.tutorialEngine) {
          window.dispatchEvent(new CustomEvent('galaxy:turnSubmitted'));
        }

        stage.inputLocked = true;
        window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'resolving' } }));
        stage._runResolutionPhase();
      },
    };
  }

  /**
   * Hot-seat strategy — cycle through human players, resolve on last.
   * @private
   */
  get _hotSeatStrategy() {
    const stage = this;
    return {
      canSubmit() { return true; },
      getStatusLabel() {
        const cur = stage.hotSeatManager?.getCurrentPlayer();
        return cur ? `${cur.name}'s turn` : 'Your turn';
      },
      submit() {
        if (stage.hotSeatManager && !stage.hotSeatManager.isLastPlayer()) {
          // Validate the current player's staged budget before passing the device
          const currentFactionId = stage.game.registry.get('playerFactionId') || 'brandAuthority';
          const rsm = stage.resourceStates[currentFactionId];
          if (rsm) {
            const validation = stage.resourceEngine.validateStagedBudget(rsm.state);
            if (!validation.valid) {
              window.dispatchEvent(new CustomEvent('galaxy:stagingError', {
                detail: { conflicts: validation.conflicts }
              }));
              return;
            }
          }

          stage.hotSeatManager.advanceToNextPlayer();
          const nextPlayer = stage.hotSeatManager.getCurrentPlayer();
          const nextIndex  = stage.hotSeatManager.currentIndex;

          stage.game.registry.set('playerFactionId', nextPlayer.factionId);
          stage._notifyReactResourceUpdate();

          window.dispatchEvent(new CustomEvent('galaxy:hotSeatNextPlayer', {
            detail: {
              factionId:    nextPlayer.factionId,
              playerName:   nextPlayer.name,
              playerNumber: nextIndex + 1,
              factionName:  MainStage._FACTION_DISPLAY_NAMES[nextPlayer.factionId] ?? nextPlayer.factionId,
            },
          }));

          console.log(`[MainStage] Hot-seat: passing to ${nextPlayer.name} (${nextPlayer.factionId})`);
          return; // Await this player's Action Phase
        }

        // All hot-seat players done — resolve
        stage._runAITurns();

        const result = stage.turnStateManager.submitActionPhase(
          () => {
            const playerFactionId = stage.game.registry.get('playerFactionId') || 'brandAuthority';
            const rsm = stage.resourceStates[playerFactionId];
            if (!rsm) return { valid: true, conflicts: [] };
            return stage.resourceEngine.validateStagedBudget(rsm.state);
          }
        );
        if (!result.success) return;

        if (stage.tutorialEngine) {
          window.dispatchEvent(new CustomEvent('galaxy:turnSubmitted'));
        }

        stage.inputLocked = true;
        window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'resolving' } }));
        stage._runResolutionPhase();
      },
    };
  }

  /**
   * Async network strategy — write orders to turn_orders table via TurnManager,
   * wait for all players to submit.   Replaces the old _submitNetworkOrders() broadcast path.
   * Spec: 060-async-flow-mode-switching-spec.md (FR-ATF-001)
   * @private
   */
  get _asyncNetworkStrategy() {
    const stage = this;
    return {
      canSubmit() { return true; },
      getStatusLabel() {
        const status = turnManager.getSubmissionStatus();
        return `${status.submitted}/${status.total} submitted`;
      },
      async submit() {
        // Delegate to the existing network order submission pipeline (which now
        // writes to turn_orders via TurnManager instead of the legacy broadcast).
        stage._submitNetworkOrders();
      },
    };
  }

  /**
   * Sync mode submission strategy (network) — reject, tick loop drives resolution.
   * @private
   */
  get _syncSubmissionStrategy() {
    return {
      canSubmit() {
        console.warn('[MainStage] Sync mode active — End Turn disabled.');
        return false;
      },
      getStatusLabel() { return 'Realtime mode'; },
      submit() { /* no-op */ },
    };
  }

  /**
   * Solo sync strategy — reject, tick loop drives resolution.
   * @private
   */
  get _soloSyncStrategy() {
    return {
      canSubmit() {
        console.warn('[MainStage] Solo sync mode active — End Turn disabled.');
        return false;
      },
      getStatusLabel() { return 'Realtime mode'; },
      submit() { /* no-op */ },
    };
  }

  /**
   * Run the Resolution Phase: sequential async presentation with player confirmation
   * at each step (fleet arrivals, combat, invasions, missions, construction, events).
   * After all steps are confirmed, maintenance runs and the turn summary is shown.
   *
   * Spec: 028-turn-structure-spec.md (FR-TS-003)
   * @private
   */
  async _runResolutionPhase() {
    const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';

    const resContext = {
      galaxy:                  this.galaxy,
      resourceStates:          this.resourceStates,
      resourceEngine:          this.resourceEngine,
      techStates:              this.techStates,
      characterStates:         this.characterStates,
      victoryGameState:        this.victoryGameState,
      currentTurn:             this.currentTurn,
      fleetStateManager:       this.fleetStateManager,
      combatEngine:            this.combatEngine,
      loyaltyStateManager:     this.loyaltyStateManager,
      constructionEngine:      this.constructionEngine,
      constructionStateManager:this.constructionStateManager,
      playerFactionId
    };

    if (!this.turnResolutionEngine) {
      if (this.turnStateManager) this.turnStateManager.beginMaintenancePhase();
      await this._runMaintenancePhase();
      return;
    }

    // Reset per-resolution state
    this._resolutionSkipAll = false;

    // Clear any stale invasion choices from a previous turn
    this.fleetStateManager?.clearInvasionChoices?.();

    // Clear per-turn fleet order tracking (FR-APL-002) and diplomatic action counters (FR-APL-004/007)
    this.fleetStateManager?.clearTurnOrders?.();
    this.diplomacyEngine?.resetTurnTracking?.();

    // Capture current turnSummary position — all events from here on belong to this
    // turn's resolution and will be grouped per-system at the end of maintenance.
    this._resolutionPhaseMark = this.turnStateManager?.turnSummary?.length ?? 0;

    // ── Phase 1: Fleet arrivals + space combat (queues invasions) ────────────
    const { arrivals, combatResults } = this.turnResolutionEngine.runPreInvasionPhase(resContext);

    // Dispatch all fleet arrival animations immediately; outcomes shown in per-system walk
    for (const arrival of arrivals) {
      window.dispatchEvent(new CustomEvent('game:fleetMoved', {
        detail: {
          fromSystemId: arrival.fromSystemId,
          toSystemId:   arrival.toSystemId,
          factionId:    arrival.factionId
        }
      }));
    }
    // Give animations time to render before continuing
    if (arrivals.length > 0) await this._resolutionSleep(900);

    // Show CombatResultModal for each player-involved combat, one at a time.
    // AI-vs-AI engagements are skipped (camera flash only, no modal).
    for (const combatPayload of combatResults) {
      const isPlayerInvolved = combatPayload.attackerFactionId === playerFactionId
                            || combatPayload.defenderFactionId === playerFactionId;
      if (!isPlayerInvolved) continue;
      window.dispatchEvent(new CustomEvent('game:combatResult', { detail: combatPayload }));
      await new Promise((resolve) => {
        const handler = () => {
          window.removeEventListener('galaxy:combatResultDismissed', handler);
          resolve();
        };
        window.addEventListener('galaxy:combatResultDismissed', handler);
      });
    }

    // ── Invasion choice gate ──────────────────────────────────────────────────
    // Hide ResolutionHUD while InvasionChoiceModal is active
    const pendingInvasions = this.fleetStateManager?.getPendingInvasions?.() ?? [];
    const playerInvasions  = pendingInvasions.filter(inv => inv.attackerFactionId === playerFactionId);

    if (playerInvasions.length > 0) {
      window.dispatchEvent(new CustomEvent('galaxy:resolutionPhaseEnd')); // hide HUD during modal
      await new Promise((resolve) => {
        let pending = playerInvasions.length;
        for (const inv of playerInvasions) {
          const sys = this.galaxy.systems.find(s => s.id === inv.systemId);
          const attackerFleets = this.fleetStateManager?.getFleetsForFactionAtSystem(playerFactionId, inv.systemId) ?? [];
          const groundTroops   = attackerFleets.reduce((sum, f) => sum + Math.max(1, Math.floor((f.ships?.length ?? 0))), 0);
          window.dispatchEvent(new CustomEvent('galaxy:invasionChoiceRequest', {
            detail: {
              systemId:          inv.systemId,
              systemName:        sys?.name ?? inv.systemId,
              attackerFactionId: inv.attackerFactionId,
              defenderFactionId: inv.defenderFactionId,
              groundTroops
            }
          }));
        }
        const choiceHandler = (e) => {
          const { systemId, choice } = e.detail ?? {};
          if (systemId) {
            this.fleetStateManager.recordInvasionChoice(systemId, choice);
          }
          pending--;
          if (pending <= 0) {
            window.removeEventListener('galaxy:invasionChoiceResolved', choiceHandler);
            resolve();
          }
        };
        window.addEventListener('galaxy:invasionChoiceResolved', choiceHandler);
      });
    }

    // ── Post-invasion steps (invoking TRE internal methods individually) ─────
    const tsm = this.turnStateManager;
    const tre = this.turnResolutionEngine;

    // Step 3: Planetary invasions (own step card before per-system walk)
    const preMark = tsm?.turnSummary?.length ?? 0;
    tre._resolvePlanetaryInvasions(resContext);
    await this._resolutionGroupStep(preMark, playerFactionId, 'invasion');

    // Step 4: Character assignments (internal logistics, no player step needed)
    tre._resolveCharacterAssignments(resContext);

    // Step 5: Missions (results surfaced in per-system walk)
    tre._resolveMissions(resContext);

    // Step 6: Construction (results surfaced in per-system walk)
    tre._resolveConstruction(resContext);
    // Notify React immediately so newly-completed facilities (e.g. a just-built
    // Shipyard) are visible and usable from the very next action phase.
    this._notifyReactConstructionUpdate();

    // Step 7: Diplomatic effects
    tre._resolveDiplomaticEffects(resContext);

    // Step 8: Intel updates
    tre._resolveIntelUpdates(resContext);

    // Step 9: Triggered events — await player choices before proceeding
    let pendingPlayerChoices = 0;
    const _choiceCounter = (e) => {
      if ((e.detail?.factionId ?? null) === playerFactionId) pendingPlayerChoices++;
    };
    window.addEventListener('galaxy:choiceEvent', _choiceCounter);
    tre._resolveEvents(resContext);
    window.removeEventListener('galaxy:choiceEvent', _choiceCounter);

    if (pendingPlayerChoices > 0) {
      await new Promise((resolve) => {
        let resolved = 0;
        const _choiceResolvedHandler = () => {
          resolved++;
          if (resolved >= pendingPlayerChoices) {
            window.removeEventListener('galaxy:choiceEventResolved', _choiceResolvedHandler);
            resolve();
          }
        };
        window.addEventListener('galaxy:choiceEventResolved', _choiceResolvedHandler);
      });
    }

    // ── Maintenance Phase ────────────────────────────────────────────────────
    if (this.turnStateManager) {
      this.turnStateManager.beginMaintenancePhase();
    }
    await this._runMaintenancePhase();
  }

  // ─── Resolution Phase Helpers ─────────────────────────────────────────────

  /**
   * Returns a Promise that resolves after the player confirms the current step
   * (galaxy:resolutionContinue) or skips all (galaxy:resolutionSkipAll).
   *
   * Dispatches galaxy:resolutionStepStart to show the ResolutionHUD card,
   * and optionally pans the camera to a system.
   *
   * @param {string} label - Human-readable step description
   * @param {string} stepType - 'fleetArrival'|'combat'|'invasion'|'missions'|'construction'|'events'|'turnSummary'
   * @param {Object|null} detail - Extra payload (e.g. { summary, turn } for turnSummary)
   * @param {string|null} systemId - System to pan to (or null to skip pan)
   * @private
   */
  _waitForContinue(label, stepType, detail, systemId) {
    // If skip was pressed earlier, resolve instantly without showing HUD
    if (this._resolutionSkipAll) return Promise.resolve();

    // Pan camera to the relevant system
    if (systemId) this._panCameraToSystem(systemId);

    // Show the ResolutionHUD step card
    window.dispatchEvent(new CustomEvent('galaxy:resolutionStepStart', {
      detail: { label, stepType, systemId, detail }
    }));

    return new Promise((resolve) => {
      const continueHandler = () => {
        window.removeEventListener('galaxy:resolutionContinue', continueHandler);
        window.removeEventListener('galaxy:resolutionSkipAll',  skipHandler);
        resolve();
      };
      const skipHandler = () => {
        window.removeEventListener('galaxy:resolutionContinue', continueHandler);
        window.removeEventListener('galaxy:resolutionSkipAll',  skipHandler);
        this._resolutionSkipAll = true;
        resolve();
      };
      window.addEventListener('galaxy:resolutionContinue', continueHandler);
      window.addEventListener('galaxy:resolutionSkipAll',  skipHandler);
    });
  }

  /**
   * Show a grouped post-invasion step if there are player-relevant events since preMark.
   * @param {number} preMark - turnSummary length before this step ran
   * @param {string} playerFactionId
   * @param {string} stepType - 'invasion'|'missions'|'construction'|'events'
   * @private
   */
  async _resolutionGroupStep(preMark, playerFactionId, stepType) {
    if (this._resolutionSkipAll || !this.turnStateManager) return;

    const allEvents = this.turnStateManager.turnSummary ?? [];
    const newEvents = allEvents.slice(preMark);
    if (newEvents.length === 0) return;

    // Show step if: any event is urgent, OR the event's system is player-owned
    const relevant = newEvents.filter(e =>
      e.urgent ||
      (e.systemId && this.galaxy?.systems?.find(s => s.id === e.systemId)?.loyalty === playerFactionId)
    );
    if (relevant.length === 0) return;

    const STEP_LABELS = {
      invasion:     'Invasion results',
      missions:     'Mission results',
      construction: 'Construction complete',
      events:       'Events',
    };

    const firstSysId = relevant.find(e => e.systemId)?.systemId ?? null;
    const detail = { events: relevant, stepLabel: STEP_LABELS[stepType] ?? stepType };
    await this._waitForContinue(null, stepType, detail, firstSysId);
  }

  /**
   * Present resolution + maintenance outcomes grouped by impacted system, then a
   * final "General Events" card for outcomes with no system context.
   *
   * Called from _runMaintenancePhase after all resolution and maintenance have run.
   * Reads all events recorded since this._resolutionPhaseMark, filters to
   * player-relevant, and presents one _waitForContinue card per system
   * (player-owned first, alphabetical within each tier), then one card for
   * events with no systemId.  Respects this._resolutionSkipAll.
   *
   * @param {string} playerFactionId
   * @private
   */
  async _presentSystemGroupedOutcomes(playerFactionId) {
    if (this._resolutionSkipAll || !this.turnStateManager) return;

    const allEvents = this.turnStateManager.turnSummary ?? [];
    const events = allEvents.slice(this._resolutionPhaseMark ?? 0);

    // Filter to player-relevant events only
    const relevant = events.filter(e =>
      e.factionId === playerFactionId ||
      e.urgent ||
      this._isPlayerOwnedSystem(e.systemId, playerFactionId) ||
      e.systemOwnerFactionId === playerFactionId
    );

    if (relevant.length === 0) return;

    // Partition events by systemId
    const systemBuckets = new Map();
    const noSystem = [];
    for (const e of relevant) {
      if (e.systemId) {
        if (!systemBuckets.has(e.systemId)) systemBuckets.set(e.systemId, []);
        systemBuckets.get(e.systemId).push(e);
      } else {
        noSystem.push(e);
      }
    }

    // Sort: player-owned systems first; alphabetical within each tier
    const sortedSystemIds = [...systemBuckets.keys()].sort((a, b) => {
      const aOwned = this._isPlayerOwnedSystem(a, playerFactionId) ? 0 : 1;
      const bOwned = this._isPlayerOwnedSystem(b, playerFactionId) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return this._resolutionSysName(a).localeCompare(this._resolutionSysName(b));
    });

    // One card per system, camera pans to each
    for (const systemId of sortedSystemIds) {
      if (this._resolutionSkipAll) return;
      const systemEvents = systemBuckets.get(systemId);
      const systemName   = this._resolutionSysName(systemId);
      await this._waitForContinue(null, 'systemGroup', {
        events:    systemEvents,
        stepLabel: systemName,
      }, systemId);
    }

    // Final card for non-system events (resource production, fleet maintenance, etc.)
    if (noSystem.length > 0 && !this._resolutionSkipAll) {
      await this._waitForContinue(null, 'systemGroup', {
        events:    noSystem,
        stepLabel: 'General Events',
      }, null);
    }
  }

  /**
   * Smoothly pan the camera to the galaxy-space position of a system.
   * @param {string} systemId
   * @private
   */
  _panCameraToSystem(systemId) {
    if (!systemId || !this.systems) return;
    const sysObj = this.systems.find(s => s.data?.id === systemId);
    if (!sysObj) return;
    const { x, y } = sysObj.data.position;
    // Zoom to a comfortable level and pan
    const targetZoom = Math.max(this._targetZoom ?? 1, 1.0);
    this._targetZoom = targetZoom;
    this.cameras.main.setZoom(targetZoom);
    this.systems.forEach(s => s.updateVisibility(targetZoom));
    this.cameras.main.pan(x, y, 500, 'Power2');
  }

  /**
   * Look up a human-readable system name.
   * @param {string} systemId
   * @returns {string}
   * @private
   */
  _resolutionSysName(systemId) {
    if (!systemId) return '(unknown)';
    const sys = this.galaxy?.systems?.find(s => s.id === systemId);
    return sys?.name ?? systemId;
  }

  /**
   * Look up a fleet's display name.
   * @param {string} fleetId
   * @param {string} factionId
   * @returns {string}
   * @private
   */
  _resolutionFleetName(fleetId, factionId) {
    if (!fleetId || !this.fleetStateManager) return 'Fleet';
    const factionFleets = this.fleetStateManager.fleets?.[factionId] ?? [];
    const fleet = factionFleets.find(f => f.id === fleetId);
    return fleet?.name ?? 'Fleet';
  }

  /**
   * Returns true if the player owns the given system.
   * @param {string} systemId
   * @param {string} playerFactionId
   * @returns {boolean}
   * @private
   */
  _isPlayerOwnedSystem(systemId, playerFactionId) {
    if (!systemId || !this.galaxy) return false;
    const sys = this.galaxy.systems?.find(s => s.id === systemId);
    return sys?.loyalty === playerFactionId;
  }

  /**
   * Returns true if the player has a stationed fleet at the given system.
   * @param {string} systemId
   * @param {string} playerFactionId
   * @returns {boolean}
   * @private
   */
  _isPlayerFleetAtSystem(systemId, playerFactionId) {
    if (!systemId || !this.fleetStateManager) return false;
    const fleets = this.fleetStateManager.getFleetsForFaction(playerFactionId);
    return fleets.some(f => f.systemId === systemId && !f.inTransit);
  }

  /**
   * Returns a Promise that resolves after `ms` milliseconds.
   * Used to let animations play before showing confirmation prompts.
   * @param {number} ms
   * @private
   */
  _resolutionSleep(ms) {
    if (this._resolutionSkipAll) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run the Maintenance Phase: resource production, victory checks, tech advance.
   * Turn counter increments at the END of this phase per FR-TT-001.
   * After maintenance, shows the turn summary via ResolutionHUD before beginning
   * the next Action Phase (spec 028-turn-structure-spec.md FR-TS-006).
   * Spec: 028-turn-structure-spec.md (FR-TS-004)
   * @private
   */
  async _runMaintenancePhase() {
    const factionIds = Object.keys(this.resourceStates);
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';


    // 0. Loyalty drift — must run BEFORE resource production (FR-LS-002)
    if (this.loyaltyStateManager) {
      // Build occupation map from fleet positions
      const isOccupied = (systemId) => {
        if (!this.fleetStateManager) return { occupied: false };
        const system = this.galaxy.systems.find(s => s.id === systemId);
        if (!system || !system.loyalty || system.loyalty === 'neutral') return { occupied: false };
        // Flatten all fleets and find an enemy fleet at this system
        const allFleets = Object.values(this.fleetStateManager.fleets ?? {}).flat();
        const enemyFleet = allFleets.find(
          f => f.systemId === systemId && f.factionId !== system.loyalty && !f.inTransit
        );
        return enemyFleet
          ? { occupied: true, occupierFactionId: enemyFleet.factionId }
          : { occupied: false };
      };

      this.loyaltyStateManager.applyPassiveDrift(this.galaxy.systems, isOccupied);

      // Advance timed production bonuses (Trade Agreements etc.)
      this.loyaltyStateManager.advanceTimedBonuses();

      // High-loyalty bonuses (+1 troop @ 80+, +1 influence @ 100)
      this.loyaltyStateManager.applyHighLoyaltyBonuses(
        this.galaxy.systems, this.resourceStates, this.resourceEngine, this.currentTurn
      );

      // Low-loyalty warnings (30–39 range) for player
      const warnings = this.loyaltyStateManager.applyLowLoyaltyEffects(
        this.galaxy.systems, playerFactionId
      );
      for (const w of warnings) {
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: { tier: 'warning', message: w.message, locationId: w.systemId, locationCategory: 'loyalty' }
        }));
        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance', w.message, {
            systemId: w.systemId,
            urgent: true,
            factionId: playerFactionId,
            outcome: 'info',
            domain: 'loyalty',
            systemOwnerFactionId: playerFactionId,
          });
        }
      }
    }

    // 1. Resource production (per-system, loyalty-adjusted, with facility bonuses)
    factionIds.forEach(factionId => {
      const rsm = this.resourceStates[factionId];
      rsm.resetTurnTracking();

      const controlledSystems = this.galaxy.systems.filter(s => {
        if (s.loyalty !== factionId) return false;
        if (s.loyaltyValue == null) s.loyaltyValue = s.loyaltyScore ?? 75;
        return true;
      });

      const factionData    = this.galaxy.factionData?.[factionId];
      const factionBonuses = factionData?.bonuses ?? this._getDefaultFactionBonuses(factionId);

      // Apply per-system construction bonuses (facility + base production multipliers)
      let production;
      if (this.constructionEngine) {
        production = { credits: 0, materials: 0, recruits: 0, influence: 0 };
        for (const system of controlledSystems) {
          const sysProd    = this.resourceEngine.calculateSystemProduction(system, factionBonuses);
          const bonuses    = this.constructionEngine.csm.getSystemBonuses(system.id, factionId);
          production.credits   += Math.floor(sysProd.credits   * bonuses.creditsMultiplier);
          production.materials += Math.floor(sysProd.materials * bonuses.materialsMultiplier);
          production.recruits  += Math.floor(sysProd.recruits  * (1 + bonuses.recruitGenBonus));
          production.influence += sysProd.influence + bonuses.influenceFlat;
        }
      } else {
        production = this.resourceEngine.calculateFactionProduction(controlledSystems, factionBonuses);
      }
      this.resourceEngine.applyProduction(rsm.state, production, this.currentTurn);
    });

    // 1b. Ground troop generation (FR-PD-001)
    if (this.constructionEngine) {
      this.constructionEngine.generateGroundTroops(this.galaxy);
    }

    // 2. Victory system
    this._syncVictoryGameState();

    const baFaction = this.victoryGameState.factions?.brandAuthority;
    if (baFaction?.victoryProgress) {
      const discovered = victoryProgressUpdater.rollSecretBaseDiscovery(this.victoryGameState);
      if (discovered) this._notifyReactVictoryUpdate();
    }

    victoryProgressUpdater.updateAll(this.victoryGameState);

    const victoryResult = victoryValidator.checkAll(this.victoryGameState);
    if (victoryResult?.victory) {
      console.log('[MainStage] Game over \u2014 victory detected on turn', this.currentTurn);
    }

    victoryNotificationEngine.checkThresholds(this.victoryGameState);
    this._notifyReactVictoryUpdate();

    // 3. Tech research advancement
    if (this.techResearchEngine) {
      const techFactionIds = Object.keys(this.techStates);
      techFactionIds.forEach(factionId => {
        const techState = this.techStates[factionId];
        const rsm = this.resourceStates[factionId];
        if (!techState || !rsm) return;

        const faction = this._buildFactionObjectForTech(factionId);
        const completed = this.techResearchEngine.advanceResearch(
          faction, techState, rsm.state, this.currentTurn
        );

        completed.forEach(techId => {
          const tech = TechTreeLoader.getTech(factionId, techId);
          const techName = tech?.name ?? techId;
          window.dispatchEvent(new CustomEvent('game:techCompleted', {
            detail: { factionId, techId, techName }
          }));
          // Notify React notification system (spec 036 FR-NA-002)
          // Research completion is surfaced in the Turn Summary via TurnStateManager.recordEvent
          // in the ResearchEngine or via the game:techCompleted event consumers.
          console.log(`[MainStage] ${factionId}: research completed \u2192 "${techId}"`);
        });

        if (completed.length > 0) {
          this._notifyReactTechUpdate(factionId);
        }
      });
    }

    // 4. Fleet maintenance deduction (FR-FC-005)
    if (this.fleetStateManager && this.resourceEngine) {
      const maintenanceResults = this.fleetStateManager.deductMaintenance(
        this.resourceStates, this.resourceEngine, this.currentTurn
      );
      const unpaid = maintenanceResults.filter(r => !r.paid);
      if (unpaid.length > 0 && this.turnStateManager) {
        const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
        const playerUnpaid = unpaid.filter(r => r.factionId === playerFactionId);
        if (playerUnpaid.length > 0) {
          this.turnStateManager.recordEvent('maintenance',
            `${playerUnpaid.length} fleet(s) could not pay maintenance — combat penalty applied`,
            { urgent: true, factionId: playerFactionId, outcome: 'failure', domain: 'resource' }
          );
        }
      }

      // Advance ship production queues
      const produced = this.fleetStateManager.advanceProduction();
      for (const item of produced) {
        if (this.turnStateManager) {
          const prodSys = this.galaxy?.systems?.find(s => s.id === item.systemId);
          const prodSysName = prodSys?.name ?? item.systemId;
          this.turnStateManager.recordEvent('maintenance',
            `Ship production complete at ${prodSysName}: ${item.shipTypeId}`,
            {
              systemId: item.systemId,
              factionId: item.factionId,
              outcome: 'success',
              domain: 'construction',
              systemOwnerFactionId: item.factionId,
            }
          );
        }

        // Auto-assign completed ship to first available fleet at this system,
        // or create a new fleet if none exists (skipping staging area).
        const factionFleets = this.fleetStateManager.fleets[item.factionId] ?? [];
        const MAX_SHIPS = 12;
        let targetFleet = factionFleets.find(
          f => f.systemId === item.systemId && !f.inTransit && f.ships.length < MAX_SHIPS
        );
        if (!targetFleet) {
          targetFleet = this.fleetStateManager.createFleet(
            item.factionId, item.systemId, 'New Fleet'
          );
        }
        this.fleetStateManager.addShipToFleet(targetFleet.id, item.shipTypeId);
      }

      this._notifyReactFleetUpdate();
      // Fix 4: re-apply active filter so Phaser border graphics reflect updated fleet positions
      if (this.activeFilter) {
        this.applyGalaxyFilter(this.activeFilter, this.activeSubFilter);
      }
    }

    // 5. Record maintenance summary event for TurnSummaryHUD
    if (this.turnStateManager) {
      const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[playerFactionId];
      if (rsm) {
        const prod    = rsm.getProductionThisTurn();
        const summary = Object.entries(prod)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}: +${v}`)
          .join(', ');
        if (summary) {
          this.turnStateManager.recordEvent('maintenance', `Resources produced — ${summary}`, {
            factionId: playerFactionId,
            outcome: 'info',
            domain: 'resource',
          });
          const RESOURCE_LABELS = { credits: 'Credits', materials: 'Materials', recruits: 'Recruits', influence: 'Influence' };
          const details = Object.entries(prod)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: RESOURCE_LABELS[k] ?? k, value: `+${v}` }));
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category: 'resource',
              factionId: playerFactionId,
              message: `Resources produced — ${summary}`,
              outcome: {
                summary: 'Maintenance complete',
                details,
                systemId: null,
                systemName: null,
              },
              turn: this.currentTurn,
            }
          }));
        }
      }
    }

    // 5b. Loyalty defection checks (FR-LS-004) — after resource production
    if (this.loyaltyStateManager) {
      const defectionSeed = `turn-${this.currentTurn}`;
      const defections = this.loyaltyStateManager.processDefections(
        this.galaxy.systems, defectionSeed
      );
      for (const def of defections) {
        // Losing faction loses the system from controlled list
        const losingFsm = this.galaxy.factionData?.[def.oldFaction];
        if (losingFsm?.controlledSystems) {
          const idx = losingFsm.controlledSystems.indexOf(def.systemId);
          if (idx !== -1) losingFsm.controlledSystems.splice(idx, 1);
        }

        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance', def.message, {
            systemId: def.systemId,
            urgent: true,
            factionId: def.newFaction ?? null,
            outcome: def.oldFaction === playerFactionId ? 'critical_failure' : 'info',
            domain: 'loyalty',
            systemOwnerFactionId: def.oldFaction ?? null,
          });
        }
        // Player-specific critical alert when one of their own systems defects
        if (def.oldFaction === playerFactionId) {
          window.dispatchEvent(new CustomEvent('galaxy:notify', {
            detail: { tier: 'critical', message: `${def.systemName} has defected to ${def.newFaction ?? 'another faction'}!`, locationId: def.systemId, locationCategory: 'loyalty' }
          }));
        }
      }

      // Diplomatic conversions (FR-SCP-007)
      const conversions = this.loyaltyStateManager.processDiplomaticConversions(
        this.galaxy.systems, this.currentTurn
      );
      for (const conv of conversions) {
        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance', conv.message, {
            systemId: conv.systemId,
            urgent: true,
            factionId: conv.newFaction ?? null,
            outcome: 'info',
            domain: 'loyalty',
            systemOwnerFactionId: conv.oldFaction ?? null,
          });
        }
        // Diplomatic conversion is already recorded in turnSummary via recordEvent above
      }

      if (defections.length > 0 || conversions.length > 0) {
        // Re-render affected systems with updated control colors
        this._notifyReactLoyaltyUpdate();
        this.refreshHUD();
      }
    }

    // 5b. Mission maintenance — advance revolts, purge old reports (FR-MO-007)
    if (this.missionStateManager) {
      // Advance system revolt timers; restore systems whose revolt has expired
      const expiredRevolts = this.missionStateManager.advanceRevolts();
      for (const { systemId, originalFaction } of expiredRevolts) {
        const system = this.galaxy?.systems?.find(s => s.id === systemId);
        if (system) {
          system.loyalty = originalFaction;
          system.loyaltyValue = 30; // Restored with low loyalty after revolt
          window.dispatchEvent(new CustomEvent('game:revoltEnded', {
            detail: { systemId, faction: originalFaction }
          }));
          if (this.turnStateManager) {
            this.turnStateManager.recordEvent('maintenance',
              `Revolt ended at ${system.name ?? systemId} — ${originalFaction} regains control`,
              {
                systemId,
                factionId: originalFaction,
                outcome: 'success',
                domain: 'loyalty',
                systemOwnerFactionId: originalFaction,
              }
            );
          }
        }
      }

      // Purge old mission reports (FR-MO-007: last 30 retained)
      this.missionStateManager.purgeOldReports();

      // Clear expired stat penalties
      this.missionStateManager.clearExpiredPenalties(this.currentTurn);

      // Notify React of updated mission state
      this._notifyReactMissionUpdate();
    }

    // 5c. Intel maintenance — advance CI presence, notify React (FR-CI-001, FR-IS-002)
    if (this.intelStateManager) {
      intelEngine.advanceCIPresence(this.galaxy, this.characterStates, this.constructionStateManager);
      this._notifyReactIntelUpdate();
    }

    // 6. 🔑  Increment turn counter — LAST step of Maintenance Phase (FR-TT-001)
    this.currentTurn++;
    console.log(`[MainStage] Maintenance Phase complete — now Turn ${this.currentTurn}`);

    // Keep React turn state in sync in async mode (matches headless sync behavior).
    window.dispatchEvent(new CustomEvent('galaxy:turnUpdate', {
      detail: { turn: this.currentTurn }
    }));

    // 7. Notify React
    this._notifyReactResourceUpdate();
    this._notifyReactConstructionUpdate();
    this.refreshHUD();

    // 9. Unlock input; present per-system outcomes; begin next Action Phase
    this.inputLocked = false;
    window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));

    // Present outcomes grouped by impacted system, then a general events card,
    // before beginning the next Action Phase.
    // Spec: 028-turn-structure-spec.md FR-TS-006
    await this._presentSystemGroupedOutcomes(playerFactionId);
    window.dispatchEvent(new CustomEvent('galaxy:resolutionPhaseEnd'));

    if (this.turnStateManager) {
      this.turnStateManager.beginActionPhase();
    }

    // 9b. In hot-seat mode, reset to Player 1 and show Pass Device interstitial
    if (this.hotSeatManager) {
      this._beginHotSeatTurn();
    }

    // 9c. Context-sensitive tips check
    this._checkContextSensitiveTips();

    // 10. Auto-save at end of Maintenance Phase (FR-SG-002) — runs async, non-blocking
    this._autoSave();
  }

  // ─── AI Opponent System (specs 032–033) ──────────────────────────────────────

  /**
   * Initialize AIController instances for all non-player factions.
   * Called after initializeTurnSystem(). Difficulty sourced from gameConfig.
   * Spec: 032-ai-strategy-spec.md, 033-ai-actions-spec.md
   * @private
   */
  _initializeAIControllers() {
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const gameConfig      = this.game.registry.get('gameConfig') ?? {};
    const difficulty      = (gameConfig.aiDifficulty ?? 'medium').toLowerCase();
    const FACTION_IDS     = ['brandAuthority', 'union', 'autoforge'];

    // In hot-seat mode, skip all human-controlled factions (not just player 1)
    const humanFactions = new Set(gameConfig.humanFactions ?? [playerFactionId]);

    for (const factionId of FACTION_IDS) {
      if (humanFactions.has(factionId)) continue;
      this.aiControllers[factionId] = new AIController(factionId, difficulty);
    }

    console.log('[MainStage] AI controllers initialized for:',
      Object.keys(this.aiControllers).join(', ') || '(none)', `(${difficulty})`);
  }

  /**
   * Run all AI faction turns. Called during the Action Phase, before
   * submitActionPhase() locks the phase for Resolution.
   * Spec: 032-ai-strategy-spec.md (FR-AIS-003), 033-ai-actions-spec.md
   * @private
   */
  _runAITurns() {
    if (!this.turnStateManager || Object.keys(this.aiControllers).length === 0) return;

    const context = {
      galaxy:                  this.galaxy,
      resourceStates:          this.resourceStates,
      techStates:              this.techStates,
      characterStates:         this.characterStates,
      fleetStateManager:       this.fleetStateManager,
      techResearchEngine:      this.techResearchEngine,
      constructionEngine:      this.constructionEngine,
      constructionStateManager: this.constructionStateManager,
      resourceEngine:          this.resourceEngine,
      currentTurn:             this.currentTurn
    };

    for (const [factionId, controller] of Object.entries(this.aiControllers)) {
      try {
        controller.takeTurn(context, this.turnStateManager);
      } catch (err) {
        console.error(`[MainStage] AI turn failed for ${factionId}:`, err);
      }
    }
  }

  // ─── Sync Mode (spec 058) ────────────────────────────────────────────────────

  /**
   * Enter sync (realtime) mode. Initializes and starts the tick loop.
   * Called when session:gameStatusChanged fires with status 'sync'.
   * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-008)
   * @private
   */
  _enterSyncMode() {
    if (this._syncMode) return;
    console.log('[MainStage] Entering sync mode.');
    this._syncMode = true;
    this.gameStatus = 'sync';

    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    const gameId     = gameConfig.gameId ?? 'local-solo';
    const isSolo     = !this.networkMode;
    const isHost     = isSolo || (this._syncHostId === (gameConfig.userId ?? 'local'));

    // Initialize SyncTickManager with all dependencies
    syncTickManager.initialize({
      fleetStateManager:       this.fleetStateManager,
      turnStateManager:        this.turnStateManager,
      constructionEngine:      this.constructionEngine,
      constructionStateManager: this.constructionStateManager,
      techStates:              this.techStates,
      techResearchEngine:      this.techResearchEngine,
      characterStates:         this.characterStates,
      resourceStates:          this.resourceStates,
      resourceEngine:          this.resourceEngine,
      galaxy:                  this.galaxy,
      aiControllers:           this.aiControllers,
      sessionPresenceManager,
      missionStateManager:     this.missionStateManager,
      eventEngine:             this.eventEngine,
      getCurrentTurn:          () => this.currentTurn,
    });

    // Register sync tick event listeners
    this._syncBundleHandler = (e) => this._onSyncBundleApplied(e.detail);
    this._syncTurnBoundaryHandler = (e) => this._onSyncTurnBoundary(e.detail);
    this._syncSubTurnBoundaryHandler = (e) => this._onSyncSubTurnBoundary(e.detail);
    this._syncStoppedHandler = () => this._exitSyncMode();

    window.addEventListener('syncTick:bundleApplied', this._syncBundleHandler);
    window.addEventListener('syncTick:turnBoundary', this._syncTurnBoundaryHandler);
    window.addEventListener('syncTick:subTurnBoundary', this._syncSubTurnBoundaryHandler);
    window.addEventListener('syncTick:stopped', this._syncStoppedHandler);

    // Seal Turn N into history before the tick loop takes over.
    // The first tick boundary resolves Turn N+1, so Turn N would otherwise be
    // absent from Turn History. Archive it now with a mode-switch label.
    if (this.turnStateManager) {
      this.turnStateManager.sealTurnForModeSwitch('Switched to Realtime mode');
    }

    // Start the tick loop if this client is the host (or solo)
    if (isHost) {
      const expectedPlayers = isSolo
        ? undefined
        : new Set(sessionPresenceManager.getTrackedPlayerIds());

      // Spec 061: pass ticksPerTurn and baseTurn for timescale conversion
      const ticksPerTurn = gameConfig.ticksPerTurn ?? DEFAULT_TICKS_PER_TURN;
      syncTickManager.startTickLoop(gameId, 1, 1, {
        solo: isSolo,
        expectedPlayers,
        ticksPerTurn,
        baseTurn: this.currentTurn,
      });
    }

    // Lock the End Turn button (not used in sync mode)
    window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'sync' } }));

    // Subscribe to snapshot notifications for reconciliation (spec 059 FR-SNP-005)
    const snapshotGameId = gameId;
    this._snapshotUnsub = snapshotManager.subscribeToSnapshots(snapshotGameId, (snapshot) => {
      this._onSnapshotReceived(snapshot);
    });

    // Listen for player re-join to trigger snapshot load (spec 059 FR-SNP-008)
    this._rejoinHandler = async (e) => {
      const rejoiningId = e.detail?.playerId ?? e.detail?.key;
      const localId = gameConfig.userId ?? 'local';
      if (rejoiningId === localId) {
        console.log('[MainStage] Local player re-joined — loading latest snapshot.');
        const latest = await snapshotManager.loadLatestSnapshot(snapshotGameId);
        if (latest) this._applyReconciliation(latest);
      }
    };
    window.addEventListener('network:playerRejoined', this._rejoinHandler);

    // Host: handle out-of-cycle snapshot requests from reconnecting clients (spec 059)
    if (isHost) {
      this._snapshotRequestHandler = () => {
        const tick = syncTickManager.getCurrentTick();
        const turn = this.currentTurn;
        console.log(`[MainStage] Snapshot requested — writing immediate snapshot at tick ${tick}`);
        snapshotManager.writeSnapshot(snapshotGameId, tick, turn, {
          galaxy:                  this.galaxy,
          resourceStates:          this.resourceStates,
          techStates:              this.techStates,
          characterStates:         this.characterStates,
          fleetStateManager:       this.fleetStateManager,
          constructionStateManager: this.constructionStateManager,
          missionStateManager:     this.missionStateManager,
          loyaltyStateManager:     this.loyaltyStateManager,
          intelStateManager:       this.intelStateManager,
          eventEngine:             this.eventEngine,
          initiativeEngine:        this.initiativeEngine,
          turnStateManager:        this.turnStateManager,
          victoryGameState:        this.victoryGameState,
          hotSeatManager:          this.hotSeatManager,
          aiControllers:           this.aiControllers,
          currentTurn:             turn,
        });
      };
      window.addEventListener('network:snapshotRequested', this._snapshotRequestHandler);
    }

    // Notify React HUDs about mode change
    window.dispatchEvent(new CustomEvent('galaxy:syncModeChanged', {
      detail: { active: true, isHost, paused: false }
    }));

    console.log('[MainStage] Sync mode active — tick loop ' + (isHost ? 'started (host)' : 'listening (client)'));
  }

  /**
   * Exit sync mode. Stops the tick loop and restores async (turn-based) flow.
   * @private
   */
  _exitSyncMode() {
    if (!this._syncMode) return;
    console.log('[MainStage] Exiting sync mode.');

    // Spec 061 FR-TCL-008 (sync → async): currentTurn is already set to the
    // correct value by the last completed turn boundary's maintenance phase.
    // Pending commands issued since the last boundary are already applied
    // (immediate-apply model) — they carry forward into async as the player's
    // current action-phase state, consistent with async mode expectations.
    console.log(`[MainStage] Sync→Async: continuing from turn ${this.currentTurn}.`);

    this._syncMode = false;
    this.gameStatus = 'async';

    // Stop tick loop (no-op if already stopped)
    syncTickManager.stopTickLoop();
    syncTickManager.destroy();

    // Remove sync event listeners
    if (this._syncBundleHandler) {
      window.removeEventListener('syncTick:bundleApplied', this._syncBundleHandler);
      window.removeEventListener('syncTick:turnBoundary', this._syncTurnBoundaryHandler);
      window.removeEventListener('syncTick:subTurnBoundary', this._syncSubTurnBoundaryHandler);
      window.removeEventListener('syncTick:stopped', this._syncStoppedHandler);
      this._syncBundleHandler = null;
      this._syncTurnBoundaryHandler = null;
      this._syncSubTurnBoundaryHandler = null;
      this._syncStoppedHandler = null;
    }

    // Clean up snapshot subscription (spec 059)
    if (this._snapshotUnsub) {
      this._snapshotUnsub();
      this._snapshotUnsub = null;
    }
    if (this._rejoinHandler) {
      window.removeEventListener('network:playerRejoined', this._rejoinHandler);
      this._rejoinHandler = null;
    }
    if (this._snapshotRequestHandler) {
      window.removeEventListener('network:snapshotRequested', this._snapshotRequestHandler);
      this._snapshotRequestHandler = null;
    }

    // Record the mode-switch event into turnSummary so it appears in the next
    // Turn History entry when the player resolves their first turn-based turn.
    if (this.turnStateManager) {
      this.turnStateManager.recordEvent('system', 'Switched to Turn-Based mode', {
        factionId: null, outcome: 'info', domain: null,
      });
    }

    // Restore async UI state
    this.inputLocked = false;
    this._syncPaused = false;
    window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));
    window.dispatchEvent(new CustomEvent('galaxy:syncModeChanged', { detail: { active: false, isHost: false, paused: false } }));
    console.log('[MainStage] Returned to async (turn-based) mode.');
  }

  /**
   * Submit a player command via the sync tick loop.
   * Called during sync mode instead of directly mutating state managers.
   *
   * @param {string} type    - One of CMD.* constants
   * @param {Object} payload
   * @returns {{ success: boolean, seq?: number }}
   */
  submitSyncCommand(type, payload) {
    if (!this._syncMode || !syncTickManager.isRunning()) {
      return { success: false, reason: 'Not in sync mode.' };
    }
    return syncTickManager.submitCommand(type, payload);
  }

  /** @private Handle syncTick:bundleApplied — refresh React state. */
  _onSyncBundleApplied(detail) {
    // Trigger React refreshes after each applied bundle
    this._notifyReactResourceUpdate();
    this._notifyReactFleetUpdate();
    this._notifyReactConstructionUpdate();
    this.refreshHUD();

    // Spec 061: derive ticksPerTurn and tickInTurn from the manager
    const ticksPerTurn = syncTickManager.getTicksPerTurn();

    // Dispatch tick update for SyncTickHUD
    window.dispatchEvent(new CustomEvent('galaxy:syncTickUpdate', {
      detail: {
        tickNumber:     detail.tickNumber,
        ticksPerSecond: syncTickManager.getTicksPerSecond(),
        timePerTick:    syncTickManager.getTimePerTick(),
        ticksPerTurn,
        tickInTurn:     detail.tickNumber % ticksPerTurn,
      }
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Snapshot Reconciliation (spec 059)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a new snapshot received via Postgres Changes subscription.
   * Compares local tick to the snapshot tick and triggers reconciliation
   * if divergence exceeds the threshold.
   *
   * @param {Object} snapshot - GameSnapshot from SnapshotManager
   * @private
   */
  _onSnapshotReceived(snapshot) {
    if (!snapshot) return;

    const localTick = syncTickManager.getCurrentTick?.() ?? 0;

    if (snapshotManager.detectDivergence(localTick, snapshot.tickNumber)) {
      console.warn(
        `[MainStage] Divergence detected: local tick ${localTick}, snapshot tick ${snapshot.tickNumber} — reconciling.`
      );
      this._applyReconciliation(snapshot);
    }
  }

  /**
   * Fully reconcile local game state from a snapshot.
   * Applies the snapshot, re-wires engine cross-references, patches visuals,
   * and refreshes all React HUDs.
   *
   * @param {Object} snapshot - GameSnapshot from SnapshotManager
   * @private
   */
  _applyReconciliation(snapshot) {
    console.log(`[MainStage] Applying snapshot reconciliation — tick ${snapshot.tickNumber}, turn ${snapshot.turnNumber}`);

    const factionIds = Object.keys(this.resourceStates);

    // Build the managers reference bag
    const managers = {
      galaxy:                  this.galaxy,
      resourceStates:          this.resourceStates,
      techStates:              this.techStates,
      characterStates:         this.characterStates,
      victoryGameState:        this.victoryGameState,
      fleetStateManager:       this.fleetStateManager,
      constructionStateManager: this.constructionStateManager,
      missionStateManager:     this.missionStateManager,
      loyaltyStateManager:     this.loyaltyStateManager,
      intelStateManager:       this.intelStateManager,
      eventEngine:             this.eventEngine,
      initiativeEngine:        this.initiativeEngine,
      turnStateManager:        this.turnStateManager,
      hotSeatManager:          this.hotSeatManager,
      aiControllers:           this.aiControllers,
    };

    // Build extra deps for deserialization
    const extraDeps = {
      factionIds,
      constructionConfig,
      getTurnFn: () => this.currentTurn,
      factionDefinitions: {},  // Not used by most paths; populated if needed
    };

    // Apply the snapshot — returns newly-created instances that need re-wiring
    const created = snapshotManager.applySnapshot(snapshot, managers, extraDeps);

    // ── Re-wire engine cross-references for newly-created instances ──────
    if (created.fleetStateManager) {
      this.fleetStateManager = created.fleetStateManager;
      if (this.combatEngine)          this.combatEngine.fleetStateManager = this.fleetStateManager;
      if (this.groundCombatEngine)    this.groundCombatEngine.fsm         = this.fleetStateManager;
      if (this.turnResolutionEngine)  this.turnResolutionEngine.fleetStateManager = this.fleetStateManager;
    }

    if (created.constructionStateManager) {
      this.constructionStateManager = created.constructionStateManager;
      if (this.constructionEngine)  this.constructionEngine.csm  = this.constructionStateManager;
      if (this.combatEngine)        this.combatEngine.csm        = this.constructionStateManager;
      if (this.groundCombatEngine)  this.groundCombatEngine.csm  = this.constructionStateManager;
    }

    if (created.missionStateManager) {
      this.missionStateManager = created.missionStateManager;
      if (this.turnResolutionEngine) this.turnResolutionEngine.missionStateManager = this.missionStateManager;
    }

    if (created.loyaltyStateManager) {
      this.loyaltyStateManager = created.loyaltyStateManager;
      if (this.diplomacyEngine)    this.diplomacyEngine.loyaltyStateManager = this.loyaltyStateManager;
      if (this.groundCombatEngine) this.groundCombatEngine.lsm              = this.loyaltyStateManager;
    }

    if (created.intelStateManager) {
      this.intelStateManager = created.intelStateManager;
    }

    if (created.turnStateManager) {
      this.turnStateManager = created.turnStateManager;
    }

    if (created.hotSeatManager) {
      this.hotSeatManager = created.hotSeatManager;
    }

    // Restore turn counter from snapshot
    if (snapshot.turnNumber) {
      this.currentTurn = snapshot.turnNumber;
    }

    // Update SyncTickManager deps to point to new instances
    if (syncTickManager._deps) {
      syncTickManager._deps.fleetStateManager       = this.fleetStateManager;
      syncTickManager._deps.constructionStateManager = this.constructionStateManager;
      syncTickManager._deps.missionStateManager      = this.missionStateManager;
      syncTickManager._deps.resourceStates           = this.resourceStates;
      syncTickManager._deps.techStates               = this.techStates;
      syncTickManager._deps.characterStates          = this.characterStates;
      syncTickManager._deps.galaxy                   = this.galaxy;
    }

    // ── Patch Phaser visuals in-place ───────────────────────────────────
    this._patchSystemVisuals();

    // ── Refresh all React HUDs ──────────────────────────────────────────
    this._notifyReactResourceUpdate();
    this._notifyReactFleetUpdate();
    this._notifyReactConstructionUpdate();
    this._notifyReactMissionUpdate();
    this._notifyReactIntelUpdate();
    this._notifyReactVictoryUpdate();
    this.refreshHUD();

    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    this.capturedCount = this.galaxy.systems.filter(s => s.loyalty === playerFactionId).length;

    console.log(`[MainStage] Reconciliation complete — now at tick ${snapshot.tickNumber}, turn ${this.currentTurn}`);
  }

  /**
   * Update existing System Phaser objects in-place from the current
   * galaxy state, without destroying and recreating them.
   * Spec 059 FR-SNP-007 (in-place patching variant).
   * @private
   */
  _patchSystemVisuals() {
    for (const systemVis of this.systems) {
      const updatedData = this.galaxy.systems.find(s => s.id === systemVis.data.id);
      if (!updatedData) continue;

      // Sync data reference fields
      const oldLoyalty = systemVis.data.loyalty;
      const oldLoyaltyValue = systemVis.data.loyaltyValue;

      // Update the data backing object (System reads from this for rendering)
      Object.assign(systemVis.data, updatedData);

      // If loyalty changed, animate the color transition
      if (updatedData.loyalty !== oldLoyalty || updatedData.loyaltyValue !== oldLoyaltyValue) {
        systemVis.updateLoyalty(updatedData.loyalty, updatedData.loyaltyValue ?? 100);
      }
    }

    // Redraw connections (cheap operation — just graphics lines)
    for (const gfx of this.connections) {
      if (gfx?.destroy) gfx.destroy();
    }
    this.connections = [];
    this.renderConnections();
  }

  /**
   * Handle syncTick:turnBoundary — run headless resolution and maintenance.
   * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-007)
   * @private
   */
  async _onSyncTurnBoundary(detail) {
    const { tickNumber, turnNumber } = detail;
    // Spec 061: set currentTurn from the timescale-derived turn number
    // (includes baseTurn offset for async→sync continuity)
    this.currentTurn = turnNumber;
    console.log(`[MainStage] Sync turn boundary at tick ${tickNumber} — running headless resolution for turn ${turnNumber}`);

    // Spec 045: Before headless resolution, preview choice events for the player faction.
    // If any exist, pause the tick loop, show the EventChoiceModal for each, collect the
    // player's answers, then resume the tick loop so resolution uses the chosen options.
    if (this.eventEngine) {
      const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';
      const previewCtx = this._buildEventContext();
      previewCtx.playerFactionId = playerFactionId;

      const pendingChoices = this.eventEngine.previewPlayerChoiceEvents(previewCtx);

      if (pendingChoices.length > 0) {
        window.dispatchEvent(new CustomEvent('session:tickLoopPause'));
        console.log(`[MainStage] Pausing tick loop for ${pendingChoices.length} player choice event(s)`);

        const eventChoices = {};

        for (const { event, factionId } of pendingChoices) {
          const resolvedDescription = this.eventEngine.resolveTokens
            ? this.eventEngine.resolveTokens(event.description ?? '', factionId, previewCtx, this.currentTurn ?? 0)
            : (event.description ?? '');

          const choiceIndex = await new Promise((resolve) => {
            const handler = (ev) => {
              if (ev.detail?.eventId === event.id) {
                window.removeEventListener('galaxy:choiceEventResolved', handler);
                resolve(ev.detail.choiceIndex ?? 0);
              }
            };
            window.addEventListener('galaxy:choiceEventResolved', handler);
            window.dispatchEvent(new CustomEvent('galaxy:choiceEvent', {
              detail: { event, factionId, resolvedDescription }
            }));
          });

          eventChoices[event.id] = choiceIndex;
        }

        // Store choices so _runHeadlessResolution picks them up
        if (syncTickManager._deps) {
          syncTickManager._deps._eventChoices = eventChoices;
        }

        window.dispatchEvent(new CustomEvent('session:tickLoopResume'));
        console.log('[MainStage] Tick loop resumed after player choice events');
      }
    }

    this._runHeadlessResolution();  // fire-and-forget; async but solo pause is internal
  }

  /**
   * Handle syncTick:subTurnBoundary — resolve completions at .25/.50/.75 quarter checkpoints.
   * Runs a lightweight pass checking missions, construction, ship production, and tech
   * for items whose completionTurn has been reached.  Does NOT run full resolution.
   * @private
   */
  _onSyncSubTurnBoundary(detail) {
    const { quarterTurn } = detail;
    if (!this.turnResolutionEngine) return;

    const context = {
      galaxy:                   this.galaxy,
      resourceStates:           this.resourceStates,
      techStates:               this.techStates,
      characterStates:          this.characterStates,
      currentTurn:              this.currentTurn,
      fleetStateManager:        this.fleetStateManager,
      constructionStateManager: this.constructionStateManager,
      missionStateManager:      this.missionStateManager,
    };

    const completed = this.turnResolutionEngine.resolveCompletions(quarterTurn, context);

    if (completed.length > 0) {
      // Refresh React panels so newly-completed items appear immediately
      this._notifyReactResourceUpdate();
      this._notifyReactFleetUpdate();
      this._notifyReactConstructionUpdate();

      // Dispatch player alerts for each completed item
      const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';
      for (const item of completed) {
        if (item.factionId === playerFactionId || item.factionId == null) {
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  item.category  ?? 'info',
              factionId: item.factionId ?? playerFactionId,
              message:   item.message   ?? 'Action completed.',
              outcome:   item.outcome   ?? null,
              turn:      this.currentTurn,
            }
          }));
        }
      }
    }
  }

  /**
   * Run the Resolution + Maintenance phases without blocking modals.
   * All results are pushed to the notification queue for async display.
   * In solo sync mode, dispatches session:tickLoopPause around each combat
   * result modal so the player can dismiss before the next tick fires.
   * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-007)
   * @private
   */
  async _runHeadlessResolution() {
    if (!this.turnResolutionEngine || !this.turnStateManager) return;

    const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';

    const resContext = {
      galaxy:                   this.galaxy,
      resourceStates:           this.resourceStates,
      resourceEngine:           this.resourceEngine,
      techStates:               this.techStates,
      characterStates:          this.characterStates,
      victoryGameState:         this.victoryGameState,
      currentTurn:              this.currentTurn,
      fleetStateManager:        this.fleetStateManager,
      combatEngine:             this.combatEngine,
      loyaltyStateManager:      this.loyaltyStateManager,
      constructionEngine:       this.constructionEngine,
      constructionStateManager: this.constructionStateManager,
      playerFactionId,
      headless:                 true,  // Signal to TRE that we're in headless mode
      eventChoices:             syncTickManager._deps?._eventChoices ?? {},
    };

    // Begin resolution phase in turn state
    this.turnStateManager.submitActionPhase(() => ({ valid: true, conflicts: [] }));

    try {
      // Clear stale state from previous turn
      this.fleetStateManager?.clearInvasionChoices?.();
      this.fleetStateManager?.clearTurnOrders?.();
      this.diplomacyEngine?.resetTurnTracking?.();

      // Phase 1: Fleet arrivals + space combat
      const { arrivals, combatResults } = this.turnResolutionEngine.runPreInvasionPhase(resContext);

      // Dispatch non-blocking visual events for arrivals and combat
      for (const arrival of arrivals) {
        window.dispatchEvent(new CustomEvent('game:fleetMoved', {
          detail: {
            fromSystemId: arrival.fromSystemId,
            toSystemId:   arrival.toSystemId,
            factionId:    arrival.factionId,
          }
        }));
      }

      for (const combatPayload of combatResults) {
        // Dispatch combat result — CombatResultModal in React picks it up
        window.dispatchEvent(new CustomEvent('game:combatResult', { detail: combatPayload }));

        // In solo sync mode, pause the tick loop so the player can dismiss the
        // modal before the next tick fires.  Only block for player-involved combats;
        // skip the pause for AI-vs-AI engagements.  In multiplayer sync the modal
        // is non-blocking (game time continues for other players).
        const isPlayerInvolved = combatPayload.attackerFactionId === playerFactionId
                              || combatPayload.defenderFactionId === playerFactionId;
        if (isPlayerInvolved && sessionPresenceManager.isSolo()) {
          window.dispatchEvent(new CustomEvent('session:tickLoopPause'));
          await new Promise((resolve) => {
            const handler = () => {
              window.removeEventListener('galaxy:combatResultDismissed', handler);
              resolve();
            };
            window.addEventListener('galaxy:combatResultDismissed', handler);
          });
          window.dispatchEvent(new CustomEvent('session:tickLoopResume'));
        }
      }

      // Invasion decisions: in headless mode, check for pre-submitted invasion commands.
      // If no command was submitted for a pending invasion, default to 'blockade' (no invasion).
      const pendingInvasions = this.fleetStateManager?.getPendingInvasions?.() ?? [];
      for (const inv of pendingInvasions) {
        const choice = this.fleetStateManager?.getInvasionChoice(inv.systemId);
        if (!choice) {
          this.fleetStateManager?.recordInvasionChoice(inv.systemId, 'blockade');
        }
      }

      // Post-invasion resolution steps
      this.turnResolutionEngine.runPostInvasionPhase(resContext);

    } catch (err) {
      console.error('[MainStage] Headless resolution error:', err);
    }

    // Maintenance phase
    this.turnStateManager.beginMaintenancePhase();

    // Capture summary BEFORE _runHeadlessMaintenance() clears turnSummary via
    // beginActionPhase(). Previously read after maintenance, always yielding [].
    const summaryEvents = [...(this.turnStateManager.turnSummary ?? [])];
    const summaryTurn   = this.currentTurn;  // before maintenance increments the counter

    this._runHeadlessMaintenance();

    // Clear event choices for next turn
    if (syncTickManager._deps) {
      syncTickManager._deps._eventChoices = {};
    }

    // Dispatch turn summary as a non-blocking notification for the toast system
    // Spec 062 FR-UTD-010: sync-mode turn summary appears as a compact toast
    if (summaryEvents.length > 0) {
      window.dispatchEvent(new CustomEvent('galaxy:syncTurnSummary', {
        detail: {
          summary:         summaryEvents,
          turn:            summaryTurn,
          playerFactionId: this.game.registry.get('playerFactionId') ?? 'brandAuthority',
          initiativeOrder: this.initiativeEngine?.getOrder() ?? [],
        }
      }));
    }

    // Notify React of all changes
    this._notifyReactResourceUpdate();
    this._notifyReactFleetUpdate();
    this._notifyReactConstructionUpdate();
    this._notifyReactMissionUpdate();
    this._notifyReactIntelUpdate();
    this.refreshHUD();
  }

  /**
   * Run the Maintenance Phase headlessly (no blocking modals or player confirmation).
   * Same steps as _runMaintenancePhase() but synchronous.
   * Spec: 058-sync-mode-tick-loop-spec.md (FR-STL-007)
   * @private
   */
  _runHeadlessMaintenance() {
    const factionIds = Object.keys(this.resourceStates);
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';

    // 0. Loyalty drift
    if (this.loyaltyStateManager) {
      const isOccupied = (systemId) => {
        if (!this.fleetStateManager) return { occupied: false };
        const system = this.galaxy.systems.find(s => s.id === systemId);
        if (!system || !system.loyalty || system.loyalty === 'neutral') return { occupied: false };
        const allFleets = Object.values(this.fleetStateManager.fleets ?? {}).flat();
        const enemyFleet = allFleets.find(
          f => f.systemId === systemId && f.factionId !== system.loyalty && !f.inTransit
        );
        return enemyFleet
          ? { occupied: true, occupierFactionId: enemyFleet.factionId }
          : { occupied: false };
      };

      this.loyaltyStateManager.applyPassiveDrift(this.galaxy.systems, isOccupied);
      this.loyaltyStateManager.advanceTimedBonuses();
      this.loyaltyStateManager.applyHighLoyaltyBonuses(
        this.galaxy.systems, this.resourceStates, this.resourceEngine, this.currentTurn
      );
      // Low-loyalty effects — record as notifications, don't block
      const warnings = this.loyaltyStateManager.applyLowLoyaltyEffects(
        this.galaxy.systems, playerFactionId
      );
      for (const w of warnings) {
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: { tier: 'warning', message: w.message, locationId: w.systemId, locationCategory: 'loyalty' }
        }));
        this.turnStateManager?.recordEvent('maintenance', w.message, {
          systemId: w.systemId, urgent: true, factionId: playerFactionId,
          outcome: 'info', domain: 'loyalty', systemOwnerFactionId: playerFactionId,
        });
      }
    }

    // 1. Resource production
    factionIds.forEach(factionId => {
      const rsm = this.resourceStates[factionId];
      rsm.resetTurnTracking();

      const controlledSystems = this.galaxy.systems.filter(s => {
        if (s.loyalty !== factionId) return false;
        if (s.loyaltyValue == null) s.loyaltyValue = s.loyaltyScore ?? 75;
        return true;
      });

      const factionData    = this.galaxy.factionData?.[factionId];
      const factionBonuses = factionData?.bonuses ?? this._getDefaultFactionBonuses(factionId);

      let production;
      if (this.constructionEngine) {
        production = { credits: 0, materials: 0, recruits: 0, influence: 0 };
        for (const system of controlledSystems) {
          const sysProd = this.resourceEngine.calculateSystemProduction(system, factionBonuses);
          const bonuses = this.constructionEngine.csm.getSystemBonuses(system.id, factionId);
          production.credits   += Math.floor(sysProd.credits   * bonuses.creditsMultiplier);
          production.materials += Math.floor(sysProd.materials * bonuses.materialsMultiplier);
          production.recruits  += Math.floor(sysProd.recruits  * (1 + bonuses.recruitGenBonus));
          production.influence += sysProd.influence + bonuses.influenceFlat;
        }
      } else {
        production = this.resourceEngine.calculateFactionProduction(controlledSystems, factionBonuses);
      }
      this.resourceEngine.applyProduction(rsm.state, production, this.currentTurn);
    });

    // 1b. Ground troop generation
    if (this.constructionEngine) {
      this.constructionEngine.generateGroundTroops(this.galaxy);
    }

    // 1c. Record resources-produced event + alert for the player faction
    // (mirrors the same block in _runMaintenancePhase so headless turns show
    // resource production in Turn History and Alert History)
    if (this.turnStateManager) {
      const rsm = this.resourceStates[playerFactionId];
      if (rsm) {
        const prod    = rsm.getProductionThisTurn?.() ?? {};
        const summary = Object.entries(prod)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}: +${v}`)
          .join(', ');
        if (summary) {
          this.turnStateManager.recordEvent('maintenance', `Resources produced \u2014 ${summary}`, {
            factionId: playerFactionId,
            outcome:   'info',
            domain:    'resource',
          });
          const RESOURCE_LABELS = { credits: 'Credits', materials: 'Materials', recruits: 'Recruits', influence: 'Influence' };
          const details = Object.entries(prod)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: RESOURCE_LABELS[k] ?? k, value: `+${v}` }));
          window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
            detail: {
              category:  'resource',
              factionId: playerFactionId,
              message:   `Resources produced \u2014 ${summary}`,
              outcome: {
                summary:    'Maintenance complete',
                details,
                systemId:   null,
                systemName: null,
              },
              turn: this.currentTurn,
            },
          }));
        }
      }
    }

    // 2. Victory system
    this._syncVictoryGameState();
    const baFaction = this.victoryGameState.factions?.brandAuthority;
    if (baFaction?.victoryProgress) {
      victoryProgressUpdater.rollSecretBaseDiscovery(this.victoryGameState);
    }
    victoryProgressUpdater.updateAll(this.victoryGameState);
    victoryValidator.checkAll(this.victoryGameState);
    victoryNotificationEngine.checkThresholds(this.victoryGameState);
    this._notifyReactVictoryUpdate();

    // 3. Tech research advancement
    if (this.techResearchEngine) {
      Object.keys(this.techStates).forEach(factionId => {
        const techState = this.techStates[factionId];
        const rsm = this.resourceStates[factionId];
        if (!techState || !rsm) return;

        const faction = this._buildFactionObjectForTech(factionId);
        const completed = this.techResearchEngine.advanceResearch(
          faction, techState, rsm.state, this.currentTurn
        );
        completed.forEach(techId => {
          const tech = TechTreeLoader.getTech(factionId, techId);
          const techName = tech?.name ?? techId;
          window.dispatchEvent(new CustomEvent('game:techCompleted', {
            detail: { factionId, techId, techName }
          }));
        });
      });
    }

    // 4. Fleet maintenance
    if (this.fleetStateManager && this.resourceEngine) {
      this.fleetStateManager.deductMaintenance(
        this.resourceStates, this.resourceEngine, this.currentTurn
      );
      const produced = this.fleetStateManager.advanceProduction();
      const MAX_SHIPS = 12;
      for (const item of produced) {
        if (this.turnStateManager) {
          const prodSys = this.galaxy?.systems?.find(s => s.id === item.systemId);
          const prodSysName = prodSys?.name ?? item.systemId;
          this.turnStateManager.recordEvent('maintenance',
            `Ship production complete at ${prodSysName}: ${item.shipTypeId}`,
            {
              systemId: item.systemId,
              factionId: item.factionId,
              outcome: 'success',
              domain: 'construction',
              systemOwnerFactionId: item.factionId,
            }
          );
        }
        const factionFleets = this.fleetStateManager.fleets[item.factionId] ?? [];
        let targetFleet = factionFleets.find(
          f => f.systemId === item.systemId && !f.inTransit && f.ships.length < MAX_SHIPS
        );
        if (!targetFleet) {
          targetFleet = this.fleetStateManager.createFleet(
            item.factionId, item.systemId, 'New Fleet'
          );
        }
        this.fleetStateManager.addShipToFleet(targetFleet.id, item.shipTypeId);
      }
    }

    // 5. Loyalty defections + diplomatic conversions
    if (this.loyaltyStateManager) {
      const defectionSeed = `turn-${this.currentTurn}`;
      this.loyaltyStateManager.processDefections(this.galaxy.systems, defectionSeed);
      this.loyaltyStateManager.processDiplomaticConversions(this.galaxy.systems, this.currentTurn);
    }

    // 5b. Mission maintenance
    if (this.missionStateManager) {
      this.missionStateManager.advanceRevolts();
      this.missionStateManager.purgeOldReports();
      this.missionStateManager.clearExpiredPenalties(this.currentTurn);
    }

    // 5c. Intel maintenance
    if (this.intelStateManager) {
      intelEngine.advanceCIPresence(this.galaxy, this.characterStates, this.constructionStateManager);
    }

    // 6. Increment turn counter
    this.currentTurn++;
    console.log(`[MainStage] Headless maintenance complete — now Turn ${this.currentTurn}`);

    // Begin next action phase
    if (this.turnStateManager) {
      this.turnStateManager.beginActionPhase();
    }

    // Turn update for HUDs
    window.dispatchEvent(new CustomEvent('galaxy:turnUpdate', {
      detail: { turn: this.currentTurn }
    }));
  }

  // ─── Hot-Seat Multiplayer (spec 049) ─────────────────────────────────────────

  /** Human-readable faction names for hot-seat event details. @private */
  static _FACTION_DISPLAY_NAMES = {
    brandAuthority: 'Brand Authority',
    union:          'The Union',
    autoforge:      'The Autoforge',
  };

  /**
   * Initialize HotSeatManager if the selected game mode is hot-seat.
   * Fires the first Pass Device interstitial after a brief delay so React
   * event listeners are guaranteed to be mounted.
   * Spec: 049-multiplayer-modes-spec.md (FR-MP-002)
   * @private
   */
  _initializeHotSeat() {
    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    const mode       = gameConfig.gameMode ?? '';
    if (!mode.startsWith('hotseat-')) return;

    const humanFactions = gameConfig.humanFactions ?? [];
    if (humanFactions.length < 2) return;

    // Spec 057: Initialize SessionPresenceManager for hot-seat (async-only, FR-HER-008)
    const userId      = gameConfig.userId ?? 'local';
    const displayName = gameConfig.displayName ?? 'Player 1';
    const gameId      = gameConfig.gameId ?? 'local-hotseat';
    sessionPresenceManager.initialize(gameId, userId, displayName, humanFactions[0], {
      requiredPlayerCount: humanFactions.length,
      isSolo:    false,
      isHotSeat: true,
    });

    const playerNames = gameConfig.playerNames ?? {};
    const players = humanFactions.map((fId, idx) => ({
      factionId: fId,
      name:      playerNames[fId] ?? `Player ${idx + 1}`,
    }));

    this.hotSeatManager = new HotSeatManager(players);
    console.log('[MainStage] Hot-seat initialized with', players.length, 'players:',
      players.map(p => `${p.name} (${p.factionId})`).join(', '));

    // Restore from saved snapshot if available, then fire interstitial for the saved player
    const savedHotSeat = gameConfig.savedState?.hotSeatState;
    if (savedHotSeat) {
      this.hotSeatManager = HotSeatManager.deserialize(savedHotSeat);
      console.log('[MainStage] Hot-seat state restored — resuming at player index',
        this.hotSeatManager.currentIndex);
      this.time.delayedCall(300, () => {
        const player       = this.hotSeatManager.getCurrentPlayer();
        const playerNumber = this.hotSeatManager.currentIndex + 1;
        this.game.registry.set('playerFactionId', player.factionId);
        this._notifyReactResourceUpdate();
        window.dispatchEvent(new CustomEvent('galaxy:hotSeatNextPlayer', {
          detail: {
            factionId:    player.factionId,
            playerName:   player.name,
            playerNumber,
            factionName:  MainStage._FACTION_DISPLAY_NAMES[player.factionId] ?? player.factionId,
          },
        }));
      });
      return;
    }

    // Fire first interstitial after a brief delay to ensure React is mounted
    this.time.delayedCall(300, () => this._beginHotSeatTurn());
  }

  /**
   * Reset to the first hot-seat player and fire the Pass Device interstitial.
   * Called at the start of each turn (including Turn 1).
   * @private
   */
  _beginHotSeatTurn() {
    if (!this.hotSeatManager) return;
    this.hotSeatManager.reset();
    const player = this.hotSeatManager.getCurrentPlayer();

    // Update registry so all React components reflect the current player
    this.game.registry.set('playerFactionId', player.factionId);

    // Refresh intel state (and fog-of-war) for the incoming player
    this._notifyReactIntelUpdate(player.factionId);

    // Refresh HUD data for the incoming player
    this._notifyReactResourceUpdate();

    window.dispatchEvent(new CustomEvent('galaxy:hotSeatNextPlayer', {
      detail: {
        factionId:    player.factionId,
        playerName:   player.name,
        playerNumber: 1,
        factionName:  MainStage._FACTION_DISPLAY_NAMES[player.factionId] ?? player.factionId,
      },
    }));
  }

  // ─── Network Multiplayer (spec 050) ──────────────────────────────────────────

  /**
   * Initialize network multiplayer mode if the selected game mode requires it.
   * Sets up event listeners for order accumulation, turn resolution, and disconnect
   * handling.
   * Spec: 050-network-features-spec.md (FR-NF-002, FR-NF-003, FR-NF-005, FR-NF-006)
   * @private
   */
  _initializeNetworkMode() {
    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    const mode       = gameConfig.gameMode ?? '';
    if (!mode.startsWith('network-')) return;

    this.networkMode = true;

    const sessionId = gameConfig.networkSessionId;
    const role      = gameConfig.networkRole ?? 'guest';

    console.log('[MainStage] Network mode initialized — role:', role, '| session:', sessionId);

    // ── Spec 057: Initialize SessionPresenceManager ─────────────────────
    const humanFactions = gameConfig.humanFactions ?? [];
    const isSolo        = humanFactions.length <= 1;
    const userId        = gameConfig.userId ?? dataBridge.currentPlayer?.id ?? 'local';
    const displayName   = gameConfig.displayName ?? 'Player';
    const gameId        = gameConfig.gameId ?? sessionId ?? 'local';

    sessionPresenceManager.initialize(gameId, userId, displayName, gameConfig.factionId ?? this.game.registry.get('playerFactionId'), {
      requiredPlayerCount: humanFactions.length,
      isSolo,
      isHotSeat: false,
    });

    // Set a ready-check callback so players can't ready up without submitted orders
    sessionPresenceManager.setCanReadyCheck(() => this._hasSubmittedNetworkOrders);

    // Track whether this client has submitted orders this turn
    this._hasSubmittedNetworkOrders = false;

    // ── Spec 060: Initialize TurnManager ────────────────────────────────
    const playerIds = humanFactions.map((_, idx) => gameConfig.playerIds?.[idx] ?? `player_${idx}`);
    turnManager.initialize({
      gameId,
      userId,
      requiredPlayers: playerIds,
      turnTimerMinutes: gameConfig.turnTimerMinutes ?? 0,
      onAllSubmitted: () => {
        console.log('[MainStage] TurnManager: all orders submitted — triggering resolution');
        window.dispatchEvent(new CustomEvent('session:allOrdersSubmitted', {
          detail: { gameId },
        }));
      },
      onTurnAdvanced: (detail) => {
        console.log(`[MainStage] TurnManager: turn advanced ${detail.previousTurn} → ${detail.currentTurn}`);
        this.currentTurn = detail.currentTurn;
        this._notifyReactResourceUpdate();
        this.refreshHUD();
        this.inputLocked = false;
        this._hasSubmittedNetworkOrders = false;
        sessionPresenceManager.markOrdersSubmitted(false);
        window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));
        window.dispatchEvent(new CustomEvent('galaxy:turnUpdate', { detail: { turn: detail.currentTurn } }));
        if (this.turnStateManager) this.turnStateManager.beginActionPhase();
        // Subscribe to order updates for the new turn
        turnManager.subscribeToOrderUpdates(detail.currentTurn);
        turnManager.resetTurnTimer(gameId);
      },
      onOrderUpdate: (detail) => {
        window.dispatchEvent(new CustomEvent('galaxy:notify', {
          detail: { tier: 'info', message: `Orders received: ${detail.submitted}/${detail.total}` },
        }));
      },
    });
    // Start listening for orders on the current turn
    turnManager.subscribeToOrderUpdates(this.currentTurn);
    turnManager.subscribeToTurnAdvance();

    // ── Spec 057: Session event listeners ───────────────────────────────
    window.addEventListener('session:hostElected', (e) => {
      const { hostId, hostName } = e.detail ?? {};
      console.log(`[MainStage] Sync host elected: ${hostName} (${hostId})`);
      this._syncHostId = hostId;

      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'info', message: `Sync mode — ${hostName} is host.` },
      }));
    });

    window.addEventListener('session:hostChanged', (e) => {
      const { oldHostId, newHostId } = e.detail ?? {};
      console.log(`[MainStage] Sync host changed: ${oldHostId} → ${newHostId}`);
      this._syncHostId = newHostId;

      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'warning', message: 'Host disconnected — new host elected.' },
      }));
    });

    window.addEventListener('session:fallbackToAsync', (e) => {
      const { reason } = e.detail ?? {};
      console.log(`[MainStage] Falling back to async mode — reason: ${reason}`);
      this._syncHostId = null;

      // Re-enable async turn UI
      this.inputLocked = false;
      window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'warning', message: 'Returned to turn-based mode.' },
      }));
    });

    window.addEventListener('session:allPlayersReady', (e) => {
      console.log(`[MainStage] All ${e.detail?.playerCount} players ready.`);
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'info', message: 'All players ready!' },
      }));

      // Spec 060: Auto-trigger sync transition when all players are ready.
      // attemptSyncTransition checks all 4 entry conditions internally and
      // no-ops if any fail (e.g. already in sync, not at turn boundary).
      const phase = this.turnStateManager?.currentPhase ?? 'ACTION';
      sessionPresenceManager.attemptSyncTransition(phase).then((result) => {
        if (!result.success) {
          console.log('[MainStage] Sync transition not attempted:', result.reasons);
        }
      });
    });
    // ── End spec 057 listeners ──────────────────────────────────────────

    // Set the expected players on the networkSessionManager so it can detect
    // when all orders have been collected (host only).
    if (role === 'host' && gameConfig.humanFactions) {
      const playerIds = gameConfig.humanFactions.map((_, idx) => `player_${idx}`);
      networkSessionManager.setExpectedPlayers(playerIds);
    }

    // Host: when all orders received → validate, then resolve the turn
    window.addEventListener('network:allOrdersReceived', (e) => {
      if (role !== 'host') return;
      const { orders } = e.detail ?? {};
      console.log('[MainStage] Network: all orders received — validating and resolving');

      // Validate each player's orders (FR-NF-006)
      const gameState = { resourceStates: this.resourceStates, galaxy: this.galaxy };
      for (const [playerId, _submitted] of Object.entries(orders ?? {})) {
        // In a full implementation each player would send their staged actions.
        // Here we use the playerId as the factionId proxy and validate accordingly.
        const validation = networkSessionManager.validateOrders(playerId, {}, gameState);
        if (!validation.valid) {
          console.warn(`[MainStage] Network: invalid orders from ${playerId}:`, validation.errors);
          // Reject and notify submitter (FR-NF-006)
          if (networkSessionManager._channel) {
            networkSessionManager._channel.send({
              type:    'broadcast',
              event:   'orders_rejected',
              payload: { playerId, errors: validation.errors },
            });
          }
        }
      }

      // Run AI turns + full resolution as host
      this._runAITurns();
      const result = this.turnStateManager.submitActionPhase(() => {
        const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
        const rsm = this.resourceStates[playerFactionId];
        if (!rsm) return { valid: true, conflicts: [] };
        return this.resourceEngine.validateStagedBudget(rsm.state);
      });
      if (!result.success) return;

      this.inputLocked = true;
      window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'resolving' } }));
      this._runResolutionPhase();
    });

    // All clients: receive resolved state delta from host and apply it
    window.addEventListener('network:turnResolved', async (e) => {
      const { stateDelta } = e.detail ?? {};
      if (!stateDelta) return;
      console.log('[MainStage] Network: applying resolved state delta');

      // Apply galaxy state delta
      if (stateDelta.galaxy) {
        Object.assign(this.galaxy, stateDelta.galaxy);
      }
      // Apply resource state deltas
      if (stateDelta.resourceStates) {
        for (const [fId, state] of Object.entries(stateDelta.resourceStates)) {
          if (this.resourceStates[fId]) {
            Object.assign(this.resourceStates[fId].state, state);
          }
        }
      }
      // Advance turn counter
      if (stateDelta.currentTurn !== undefined) {
        this.currentTurn = stateDelta.currentTurn;
      }

      // Refresh UI
      this._notifyReactResourceUpdate();
      this.refreshHUD();

      // Unlock and begin next Action Phase
      this.inputLocked = false;
      window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));
      if (this.turnStateManager) this.turnStateManager.beginActionPhase();
    });

    // Handle order rejection feedback (FR-NF-006)
    window.addEventListener('network:ordersRejected', (e) => {
      const { errors } = e.detail ?? {};
      const msg = (errors ?? ['Your orders were rejected by the host.']).join(' ');
      window.dispatchEvent(new CustomEvent('galaxy:stagingError', {
        detail: { message: msg },
      }));
    });

    // Convert disconnected player's faction to AI control (FR-NF-005)
    window.addEventListener('network:playerKicked', (e) => {
      const { playerId } = e.detail ?? {};
      console.log(`[MainStage] Network: player kicked (${playerId}) — converting faction to AI`);

      const difficulty = (gameConfig.aiDifficulty ?? 'medium').toLowerCase();
      // Convert every non-local human faction to AI (maps to the kicked player)
      for (const factionId of (gameConfig.humanFactions ?? [])) {
        if (factionId !== this.game.registry.get('playerFactionId') &&
            !this.aiControllers[factionId]) {
          this.aiControllers[factionId] = new AIController(factionId, difficulty);
          console.log(`[MainStage] Network: AI controller created for ${factionId}`);
        }
      }
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'warning', message: 'A player disconnected — their faction is now AI-controlled.' },
      }));
    });
  }

  /**
   * Initialize the TutorialEngine if this is a tutorial game.
   * Wires up advance/skip listeners from React overlay and camera events.
   * Spec: 053-tutorial-campaign-spec.md
   * @private
   */
  _initializeTutorialEngine() {
    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    if (!gameConfig.isTutorial) return;

    const savedStep = gameConfig.savedState?.tutorialStep ?? 0;
    this.tutorialEngine = new TutorialEngine(tutorialSteps);

    // Camera pan fires galaxy:tutorialPanZoom with type 'pan'
    this.cameras.main.on('pan', () => {
      window.dispatchEvent(new CustomEvent('galaxy:tutorialPanZoom', { detail: { type: 'pan' } }));
    });

    // Start at the saved step
    this.tutorialEngine.start(savedStep);

    // Register context tip listeners
    this._initializeContextTips();

    console.log('[MainStage] Tutorial engine initialized at step', savedStep);
  }

  /**
   * Register context-sensitive tip event listeners.
   * Fires informational notifications via galaxy:notify.
   * Spec: 054-in-game-help-spec.md
   * @private
   */
  _initializeContextTips() {
    window.addEventListener('game:missionFailed', () => {
      if (this.shownTips.has('tip-missionfail')) return;
      this.shownTips.add('tip-missionfail');
      if (this.turnStateManager) {
        const pfid = this.game.registry.get('playerFactionId') || 'brandAuthority';
        this.turnStateManager.recordEvent('maintenance',
          'Tip: Mission success depends on matching character stats to the mission type. Assign characters with high relevant stats for better outcomes.',
          { factionId: pfid, outcome: 'info', domain: 'tip' }
        );
      }
    });

    window.addEventListener('game:techCompleted', () => {
      if (this.shownTips.has('tip-researchchain')) return;
      this.shownTips.add('tip-researchchain');
      if (this.turnStateManager) {
        const pfid = this.game.registry.get('playerFactionId') || 'brandAuthority';
        this.turnStateManager.recordEvent('maintenance',
          'Tip: Many advanced technologies require prerequisite research. Chain your research projects to unlock the most powerful upgrades.',
          { factionId: pfid, outcome: 'info', domain: 'tip' }
        );
      }
    });
  }

  /**
   * Fire context-sensitive tips that require maintenance-phase data checks.
   * Called at end of _runMaintenancePhase() before auto-save.
   * Spec: 054-in-game-help-spec.md
   * @private
   */
  _checkContextSensitiveTips() {
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';

    if (!this.shownTips.has('tip-3chars')) {
      const csm   = this.characterStates[playerFactionId];
      const count = csm ? Object.keys(csm.characters ?? {}).length : 0;
      if (count >= 3) {
        this.shownTips.add('tip-3chars');
        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance',
            'Tip: Assign characters to CI Duty at your bases to gather counter-intelligence and protect against enemy missions.',
            { factionId: playerFactionId, outcome: 'info', domain: 'tip' }
          );
        }
      }
    }

    if (!this.shownTips.has('tip-bigfleet') && this.fleetStateManager) {
      const fleets = this.fleetStateManager.getFleetsForFaction?.(playerFactionId) ?? [];
      if (fleets.some(f => (f.ships?.length ?? 0) >= 6)) {
        this.shownTips.add('tip-bigfleet');
        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance',
            'Tip: Large fleets benefit from having a Commander character assigned. Commanders increase fleet combat effectiveness significantly.',
            { factionId: playerFactionId, outcome: 'info', domain: 'tip' }
          );
        }
      }
    }

    if (!this.shownTips.has('tip-lowloyalty') && this.loyaltyStateManager) {
      const lowSystem = this.galaxy?.systems.find(s =>
        s.loyalty === playerFactionId && (s.loyaltyValue ?? 100) < 40
      );
      if (lowSystem) {
        this.shownTips.add('tip-lowloyalty');
        if (this.turnStateManager) {
          this.turnStateManager.recordEvent('maintenance',
            'Tip: Systems with loyalty below 40 may defect. Use Diplomatic missions or station troops to stabilize them.',
            { systemId: lowSystem.id, factionId: playerFactionId, outcome: 'info', domain: 'tip', systemOwnerFactionId: playerFactionId }
          );
        }
      }
    }
  }

  /**
   * Collect this player's staged orders and submit them via TurnManager.
   * Falls back to legacy NetworkSessionManager broadcast for un-migrated sessions.
   * Shows a "waiting" indicator until all players have submitted.
   * Spec: 050-network-features-spec.md (FR-NF-003), 060-async-flow-mode-switching-spec.md (FR-ATF-001)
   * @private
   */
  async _submitNetworkOrders() {
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const rsm = this.resourceStates[playerFactionId];

    // Validate budget before submission (FR-NF-006)
    if (rsm) {
      const validation = this.resourceEngine.validateStagedBudget(rsm.state);
      if (!validation.valid) {
        window.dispatchEvent(new CustomEvent('galaxy:stagingError', {
          detail: { conflicts: validation.conflicts },
        }));
        return;
      }
    }

    // Serialize staged actions for submission
    const orders = {
      factionId: playerFactionId,
      pendingActions: this.turnStateManager?.getActions?.() ?? [],
      resourceSpend: rsm?.state?.staged ?? {},
    };

    window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'submitted' } }));
    this.inputLocked = true;

    // Spec 060: Submit via TurnManager (persistent turn_orders table) if initialized.
    // Falls back to legacy NetworkSessionManager broadcast for pre-060 sessions.
    const gameConfig = this.game.registry.get('gameConfig') ?? {};
    const gameId     = gameConfig.gameId ?? gameConfig.networkSessionId ?? 'local';
    const userId     = gameConfig.userId ?? dataBridge.currentPlayer?.id ?? 'local';

    let result;
    if (turnManager.isInitialized()) {
      result = await turnManager.submitOrders(gameId, this.currentTurn, userId, orders);
    } else {
      result = await networkSessionManager.submitOrders(orders);
    }

    if (!result.success) {
      // Submission failed — allow retry
      this.inputLocked = false;
      window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));
      window.dispatchEvent(new CustomEvent('galaxy:stagingError', {
        detail: { message: result.error ?? 'Failed to submit orders. Please try again.' },
      }));
    } else {
      // Spec 057: Mark orders as submitted so the player can toggle ready
      this._hasSubmittedNetworkOrders = true;
      sessionPresenceManager.markOrdersSubmitted(true);
    }
  }

  // ─── Fleet Management System ─────────────────────────────────────────────────

  /**
   * Initialize fleet management system (FleetStateManager + CombatEngine).
   * Tries to restore persisted fleet state; seeds starting fleets from faction
   * definitions if no persisted state is found.
   * Specs: 013–016
   */
  async initializeFleetSystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    // Create fresh fleet manager (always — overwritten by restore if available)
    this.fleetStateManager = new FleetStateManager(FACTION_IDS);
    this.combatEngine      = new CombatEngine(this.fleetStateManager, this.constructionStateManager);

    // Wire fleet / combat references into TurnResolutionEngine if already created
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.fleetStateManager = this.fleetStateManager;
      this.turnResolutionEngine.combatEngine      = this.combatEngine;
    }

    // Restore fleet state — from savedState if loading, otherwise from DataBridge
    const savedStateFleet = this.game.registry.get('gameConfig')?.savedState;
    if (savedStateFleet?.fleetState) {
      try {
        this.fleetStateManager = FleetStateManager.deserialize(savedStateFleet.fleetState, FACTION_IDS);
        this.combatEngine      = new CombatEngine(this.fleetStateManager, this.constructionStateManager);
        if (this.turnResolutionEngine) {
          this.turnResolutionEngine.fleetStateManager = this.fleetStateManager;
          this.turnResolutionEngine.combatEngine      = this.combatEngine;
        }
        console.log('[MainStage] Fleet state restored from save');
      } catch (err) {
        console.warn('[MainStage] Failed to restore fleet state from save:', err);
      }
    } else {
      // Attempt to restore persisted fleet state (merged from per-faction columns)
      const player = dataBridge.getPlayer();
      if (player) {
        try {
          const serialized = await dataBridge.loadAllFleetState();
          if (serialized) {
            this.fleetStateManager = FleetStateManager.deserialize(JSON.parse(serialized), FACTION_IDS);
            this.combatEngine      = new CombatEngine(this.fleetStateManager, this.constructionStateManager);
            if (this.turnResolutionEngine) {
              this.turnResolutionEngine.fleetStateManager = this.fleetStateManager;
              this.turnResolutionEngine.combatEngine      = this.combatEngine;
            }
            console.log('[MainStage] Fleet state restored from save');
          }
        } catch (err) {
          console.warn('[MainStage] Failed to restore fleet state:', err);
        }
      }
    }

    // Seed starting fleets from faction definitions if no fleets exist yet
    for (const factionId of FACTION_IDS) {
      if (this.fleetStateManager.getFleetsForFaction(factionId).length === 0) {
        this._seedStartingFleets(factionId);
      }
    }

    // Register React ↔ Phaser fleet event bridge
    this._registerFleetEvents();

    // Push initial fleet state to React
    this._notifyReactFleetUpdate();

    console.log('[MainStage] Fleet management system initialized');
  }

  // ─── Loyalty & Diplomacy System (specs 024–027) ──────────────────────────────

  /**
   * Initialize LoyaltyStateManager and DiplomacyEngine.
   * Attempts to restore persisted loyalty state; seeds from galaxy if unavailable.
   * Registers React event bridge for diplomacy actions.
   */
  async initializeLoyaltySystem() {
    const gameConfig  = this.game.registry.get('gameConfig') ?? {};
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    // Build faction definitions map for DiplomacyEngine modifiers
    const factionDefs = {};
    for (const fId of FACTION_IDS) {
      const fData = this.galaxy?.factionData?.[fId];
      if (fData) factionDefs[fId] = fData;
    }

    this.loyaltyStateManager = new LoyaltyStateManager(FACTION_IDS);
    this.diplomacyEngine     = new DiplomacyEngine(this.loyaltyStateManager, factionDefs);

    // Attempt to restore persisted loyalty state
    // Skip legacy DataBridge path when a full snapshot provides loyaltyState
    const player = dataBridge.getPlayer();
    let restored = false;
    if (player && !gameConfig.savedState?.loyaltyState) {
      try {
        const serialized = await dataBridge.loadLoyaltyState?.();
        if (serialized) {
          this.loyaltyStateManager = LoyaltyStateManager.deserialize(
            JSON.parse(serialized),
            this.galaxy.systems,
            FACTION_IDS
          );
          this.diplomacyEngine = new DiplomacyEngine(this.loyaltyStateManager, factionDefs);
          restored = true;
          console.log('[MainStage] Loyalty state restored from save');
        }
      } catch (err) {
        console.warn('[MainStage] Failed to restore loyalty state:', err);
      }
    }

    if (!restored) {
      // Initialize loyalty maps from current galaxy state
      this.loyaltyStateManager.initialize(this.galaxy.systems);
    }

    // Wire diplomacy engine into TurnResolutionEngine if already created
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.diplomacyEngine = this.diplomacyEngine;
    }

    // Wire loyalty state manager into GroundCombatEngine (spec 048 FR-GC-007)
    if (this.groundCombatEngine) {
      this.groundCombatEngine.lsm = this.loyaltyStateManager;
    }

    // Register React event bridge for loyalty/diplomacy
    this._registerLoyaltyEvents();

    console.log('[MainStage] Loyalty & diplomacy system initialized');
  }

  /**
   * Register window event listeners for React ↔ Phaser loyalty/diplomacy bridge.
   * @private
   */
  _registerLoyaltyEvents() {
    // React → Phaser: request full loyalty state for a system
    window.addEventListener('galaxy:requestLoyaltyUpdate', (e) => {
      const { systemId } = e.detail ?? {};
      this._notifyReactLoyaltyUpdate(systemId);
    });

    // React → Phaser: get available diplomatic actions for player at a system
    window.addEventListener('galaxy:requestDiplomacyActions', (e) => {
      const { systemId, factionId } = e.detail ?? {};
      if (!systemId || !factionId || !this.diplomacyEngine) return;
      const system = this.galaxy?.systems?.find(s => s.id === systemId);
      if (!system) return;

      const context = {
        galaxy: this.galaxy,
        resourceStates: this.resourceStates,
        currentTurn: this.currentTurn
      };
      const actions = this.diplomacyEngine.getAvailableActions(factionId, system, context);
      const history = this.loyaltyStateManager?.getActionHistory(systemId) ?? [];
      window.dispatchEvent(new CustomEvent('galaxy:diplomacyActionsResult', {
        detail: { systemId, factionId, actions, history }
      }));
    });

    // React → Phaser: stage diplomatic action
    window.addEventListener('galaxy:stageDiplomaticAction', (e) => {
      const { actionType, factionId, targetSystemId } = e.detail ?? {};
      if (!actionType || !factionId || !targetSystemId) return;

      const system = this.galaxy?.systems?.find(s => s.id === targetSystemId);
      if (!system) {
        window.dispatchEvent(new CustomEvent('galaxy:stageDiplomaticActionResult', {
          detail: { success: false, error: `System ${targetSystemId} not found` }
        }));
        return;
      }

      const context = {
        galaxy: this.galaxy,
        resourceStates: this.resourceStates,
        currentTurn: this.currentTurn
      };
      const eligible = this.diplomacyEngine?.validate(actionType, factionId, system, context);
      if (!eligible?.valid) {
        window.dispatchEvent(new CustomEvent('galaxy:stageDiplomaticActionResult', {
          detail: { success: false, error: eligible?.reason ?? 'Action not valid' }
        }));
        return;
      }

      const costs = this.diplomacyEngine.getEffectiveCost(actionType, factionId);
      const result = this.stagePlayerAction('diplomatic', {
        type: actionType,
        factionId,
        targetSystemId,
        costs
      });

      // Track action against the per-system-per-faction-per-turn cap (FR-APL-004, FR-APL-007)
      if (result.success) {
        this.diplomacyEngine.recordAction(targetSystemId, factionId);
      }

      window.dispatchEvent(new CustomEvent('galaxy:stageDiplomaticActionResult', {
        detail: result
      }));
    });

    // React → Phaser: place diplomatic hold
    window.addEventListener('galaxy:placeDiplomaticHold', (e) => {
      const { systemId, factionId } = e.detail ?? {};
      if (!systemId || !factionId || !this.loyaltyStateManager) return;
      const system = this.galaxy?.systems?.find(s => s.id === systemId);
      if (!system || system.loyalty !== factionId) return;

      const rsm = this.resourceStates[factionId];
      if (!rsm) return;

      // Cost: 200 influence
      const cost = { influence: 200 };
      const spend = this.resourceEngine?.spendResources(rsm.state, cost, 'diplomaticHold', this.currentTurn);
      if (spend?.success) {
        this.loyaltyStateManager.placeDiplomaticHold(systemId, this.currentTurn);
        this._notifyReactResourceUpdate();
      } else {
        window.dispatchEvent(new CustomEvent('galaxy:insufficientResources', {
          detail: { message: spend?.error ?? 'Insufficient influence for Diplomatic Hold' }
        }));
      }
    });
  }

  /**
   * Notify React of updated loyalty state for a system (or all systems).
   * @param {string} [systemId] — If omitted, broadcasts all loyalty data
   * @private
   */
  _notifyReactLoyaltyUpdate(systemId = null) {
    if (!this.loyaltyStateManager) return;

    const systems = systemId
      ? (this.galaxy?.systems?.filter(s => s.id === systemId) ?? [])
      : (this.galaxy?.systems ?? []);

    const loyaltyData = {};
    for (const system of systems) {
      loyaltyData[system.id] = {
        loyalties:   this.loyaltyStateManager.getAllLoyalties(system.id),
        controlling: system.loyalty,
        loyaltyValue: system.loyaltyValue,
        trends: {}
      };
      for (const fId of ['brandAuthority', 'union', 'autoforge']) {
        loyaltyData[system.id].trends[fId] = this.loyaltyStateManager.getTrend(system.id, fId);
      }
    }

    window.dispatchEvent(new CustomEvent('galaxy:loyaltyUpdate', {
      detail: { loyaltyData }
    }));
  }

  /**
   * Seed starting fleets from faction-definitions for a faction.
   * Places the first fleet at the faction's first controlled system.
   * @param {string} factionId
   * @private
   */
  _seedStartingFleets(factionId) {
    const factionDef    = FactionDefinitionLoader.getFactionById(factionId);
    const startingFleet = factionDef?.startingConditions?.fleets ?? [];
    if (startingFleet.length === 0) return;

    // Find the first system controlled by this faction
    const homeSystem = this.galaxy?.systems?.find(s => s.loyalty === factionId);
    if (!homeSystem) return;

    const SHIP_TYPE_MAP = {
      capital:  'capitalShip',
      cruiser:  'cruiser',
      corvette: 'corvette',
      fighter:  'fighter'
    };

    const fleet = this.fleetStateManager.createFleet(factionId, homeSystem.id);
    let shipsAdded = 0;

    for (const entry of startingFleet) {
      const shipTypeId = SHIP_TYPE_MAP[entry.type];
      if (!shipTypeId) continue;
      for (let i = 0; i < (entry.count ?? 1) && shipsAdded < 12; i++) {
        const result = this.fleetStateManager.addShipToFleet(fleet.id, shipTypeId);
        if (result.success) shipsAdded++;
      }
    }

    console.log(`[MainStage] Seeded starting fleet for ${factionId} at ${homeSystem.id} (${shipsAdded} ships)`);
  }

  /**
   * Register all fleet-related window event listeners for React ↔ Phaser bridge.
   * @private
   */
  _registerFleetEvents() {
    // React → Phaser: request fleet data refresh
    window.addEventListener('galaxy:requestFleetUpdate', () => {
      this._notifyReactFleetUpdate();
    });

    // React → Phaser: stage fleet movement
    window.addEventListener('galaxy:stageFleetMove', (e) => {
      const { fleetId, destinationId, travelMode } = e.detail ?? {};
      if (!fleetId || !destinationId || !travelMode) return;
      const result = this.fleetStateManager.stageMoveFleet(fleetId, destinationId, travelMode, this.galaxy);
      window.dispatchEvent(new CustomEvent('galaxy:stageFleetMoveResult', { detail: result }));
      if (result.success) {
        this._notifyReactFleetUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: cancel fleet movement
    window.addEventListener('galaxy:cancelFleetMove', (e) => {
      const { fleetId } = e.detail ?? {};
      if (!fleetId) return;
      this.fleetStateManager.cancelMoveFleet(fleetId);
      this._notifyReactFleetUpdate();
      this._notifyReactResourceUpdate();
    });

    // React → Phaser: assign fleet command
    window.addEventListener('galaxy:assignFleetCommand', (e) => {
      const { fleetId, commandType, commandData } = e.detail ?? {};
      if (!fleetId || !commandType) return;
      const result = this.fleetStateManager.assignCommand(fleetId, commandType, commandData ?? {});
      window.dispatchEvent(new CustomEvent('galaxy:assignFleetCommandResult', { detail: result }));
      if (result.success) {
        this._notifyReactFleetUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: cancel fleet command
    window.addEventListener('galaxy:cancelFleetCommand', (e) => {
      const { fleetId } = e.detail ?? {};
      if (!fleetId) return;
      this.fleetStateManager.cancelCommand(fleetId);
      this._notifyReactFleetUpdate();
      this._notifyReactResourceUpdate();
    });

    // React → Phaser: merge fleets
    window.addEventListener('galaxy:mergeFleets', (e) => {
      const { targetFleetId, sourceFleetId } = e.detail ?? {};
      if (!targetFleetId || !sourceFleetId) return;
      const result = this.fleetStateManager.mergeFleets(targetFleetId, sourceFleetId);
      window.dispatchEvent(new CustomEvent('galaxy:mergeFleetsResult', { detail: result }));
      if (result.success) this._notifyReactFleetUpdate();
    });

    // React → Phaser: split fleet
    window.addEventListener('galaxy:splitFleet', (e) => {
      const { fleetId, shipIds, newFleetName } = e.detail ?? {};
      if (!fleetId || !shipIds) return;
      const result = this.fleetStateManager.splitFleet(fleetId, shipIds, newFleetName);
      window.dispatchEvent(new CustomEvent('galaxy:splitFleetResult', { detail: result }));
      if (result.success) this._notifyReactFleetUpdate();
    });

    // React → Phaser: get combat log
    window.addEventListener('galaxy:requestCombatLog', () => {
      window.dispatchEvent(new CustomEvent('galaxy:combatLogUpdate', {
        detail: { combatLog: this.fleetStateManager.getCombatLog() }
      }));
    });
  }

  /**
   * Dispatch current fleet state to React layer.
   * @private
   */
  _notifyReactFleetUpdate() {
    if (!this.fleetStateManager) return;
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const fleets          = this.fleetStateManager.getFleetsForFaction(playerFactionId);
    const allFleets       = Object.fromEntries(
      ['brandAuthority', 'union', 'autoforge'].map(fid => [
        fid,
        this.fleetStateManager.getFleetsForFaction(fid)
      ])
    );

    window.dispatchEvent(new CustomEvent('galaxy:fleetUpdate', {
      detail: {
        playerFactionId,
        fleets,
        allFleets,
        combatLog:        this.fleetStateManager.getCombatLog(),
        currentTurn:      this.currentTurn,
        galaxyDimensions: this.galaxy?.dimensions ?? null,
        systems: (this.galaxy?.systems ?? []).map(s => ({
          id:          s.id,
          name:        s.name,
          connections: s.connections ?? [],
          position:    s.position ?? { x: 0, y: 0 }
        }))
      }
    }));
  }

  // ─── Construction System (specs 017–020) ────────────────────────────────────

  /**
   * Initialize ConstructionStateManager + ConstructionEngine.
   * Seeds starting bases, wires React ↔ Phaser event bridge.
   * Must be called after generateGalaxy() and initializeResourceManagement().
   * Specs: 017–020
   */
  initializeConstructionSystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    this.constructionStateManager = new ConstructionStateManager(FACTION_IDS, constructionConfig);
    this.constructionEngine       = new ConstructionEngine(this.constructionStateManager, constructionConfig);

    // Wire into TurnResolutionEngine if already created
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.constructionEngine = this.constructionEngine;
    }

    // Initialize GroundCombatEngine (spec 048) — depends on constructionStateManager
    this.groundCombatEngine = new GroundCombatEngine(
      this.constructionStateManager,
      this.loyaltyStateManager  // may be null here; wired below in initializeLoyaltySystem
    );
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.groundCombatEngine = this.groundCombatEngine;
    }

    // Also wire CSM into CombatEngine for facility bonus lookups (spec 047 FR-CB-001)
    if (this.combatEngine) {
      this.combatEngine.csm = this.constructionStateManager;
    }

    // Seed starting bases from faction starting conditions
    this.constructionEngine.seedStartingBases(this.galaxy);

    // Register React ↔ Phaser construction events
    this._registerConstructionEvents();

    // Push initial state to React
    this._notifyReactConstructionUpdate();

    console.log('[MainStage] Construction system initialized');
  }

  /**
   * Register all construction-related window event listeners.
   * @private
   */
  _registerConstructionEvents() {
    // React → Phaser: request construction state refresh
    window.addEventListener('galaxy:requestConstructionUpdate', () => {
      this._notifyReactConstructionUpdate();
    });

    // React → Phaser: queue a facility build
    window.addEventListener('galaxy:queueFacilityBuild', (e) => {
      const { systemId, facilityId, factionId } = e.detail ?? {};
      if (!systemId || !facilityId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.queueFacilityBuild(
        systemId, facilityId, fid, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:queueFacilityBuildResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: queue a facility upgrade
    window.addEventListener('galaxy:queueFacilityUpgrade', (e) => {
      const { systemId, instanceId, factionId } = e.detail ?? {};
      if (!systemId || !instanceId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.queueFacilityUpgrade(
        systemId, instanceId, fid, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:queueFacilityUpgradeResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: queue facility repair
    window.addEventListener('galaxy:queueFacilityRepair', (e) => {
      const { systemId, instanceId, factionId } = e.detail ?? {};
      if (!systemId || !instanceId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.queueFacilityRepair(
        systemId, instanceId, fid, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:queueFacilityRepairResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: queue facility demolish
    window.addEventListener('galaxy:queueFacilityDemolish', (e) => {
      const { systemId, instanceId, factionId } = e.detail ?? {};
      if (!systemId || !instanceId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.queueFacilityDemolish(
        systemId, instanceId, fid, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:queueFacilityDemolishResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
      }
    });

    // React → Phaser: cancel queued item
    window.addEventListener('galaxy:cancelQueueItem', (e) => {
      const { systemId, qitemId, factionId } = e.detail ?? {};
      if (!systemId || !qitemId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.cancelQueueItem(
        systemId, qitemId, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:cancelQueueItemResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: reorder construction queue
    window.addEventListener('galaxy:reorderConstructionQueue', (e) => {
      const { systemId, orderedIds } = e.detail ?? {};
      if (!systemId || !orderedIds) return;
      this.constructionStateManager.reorderQueue(systemId, orderedIds);
      this._notifyReactConstructionUpdate();
    });

    // React → Phaser: reinforce troops
    window.addEventListener('galaxy:reinforceTroops', (e) => {
      const { systemId, factionId } = e.detail ?? {};
      if (!systemId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;
      const result = this.constructionEngine.reinforceTroops(
        systemId, rsm.state, this.resourceEngine, this.currentTurn
      );
      window.dispatchEvent(new CustomEvent('galaxy:reinforceTroopsResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: queue a ship build at a Shipyard
    window.addEventListener('galaxy:queueShipProduction', (e) => {
      const { systemId, shipTypeId, factionId } = e.detail ?? {};
      if (!systemId || !shipTypeId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: 'Resource state not found for faction' }
        }));
        return;
      }

      // Verify a Shipyard exists at this system and is owned by the faction
      const sysState = this.constructionStateManager?.getSystemState(systemId);
      const shipyard = sysState?.facilities?.find(f => f.facilityId === 'shipyard');
      if (!shipyard) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: 'No Shipyard at this system' }
        }));
        return;
      }

      // Look up ship type and validate faction + level gate
      const shipTypes = this.fleetStateManager.getShipTypes();
      const type = shipTypes.find(t => t.id === shipTypeId);
      if (!type) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: `Unknown ship type: ${shipTypeId}` }
        }));
        return;
      }
      if (type.faction !== 'all' && type.faction !== fid) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: 'Ship type not available to this faction' }
        }));
        return;
      }
      if (type.requiresFacilityLevel > (shipyard.level ?? 1)) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: `Shipyard level ${type.requiresFacilityLevel} required` }
        }));
        return;
      }
      if (type.requiresTech) {
        const completedTechs = this.techStates?.[fid]?.state?.completedTechnologies ?? [];
        if (!completedTechs.includes(type.requiresTech)) {
          window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
            detail: { success: false, error: `Tech required: ${type.requiresTech}` }
          }));
          return;
        }
      }

      // Deduct production cost
      const cost = type.productionCost ?? {};
      const spendResult = this.resourceEngine.spendResources(
        rsm.state,
        { credits: cost.credits ?? 0, materials: cost.materials ?? 0 },
        `shipproduction:${shipTypeId}`,
        this.currentTurn
      );
      if (!spendResult.success) {
        window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', {
          detail: { success: false, error: spendResult.error ?? 'Insufficient resources' }
        }));
        return;
      }

      // Apply Brand Authority -20% build time bonus
      const productionTimeOverride = fid === 'brandAuthority'
        ? Math.ceil(type.productionTime * 0.8)
        : undefined;

      const result = this.fleetStateManager.enqueueProduction(fid, systemId, shipTypeId, productionTimeOverride);
      window.dispatchEvent(new CustomEvent('galaxy:queueShipProductionResult', { detail: result }));
      if (result.success) {
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });

    // React → Phaser: cancel a queued ship build (full refund)
    window.addEventListener('galaxy:cancelShipProduction', (e) => {
      const { systemId, queueItemId, factionId } = e.detail ?? {};
      if (!systemId || !queueItemId) return;
      const fid = factionId || this.game.registry.get('playerFactionId') || 'brandAuthority';
      const rsm = this.resourceStates[fid];
      if (!rsm) return;

      const result = this.fleetStateManager.cancelProductionQueueItem(systemId, queueItemId);
      window.dispatchEvent(new CustomEvent('galaxy:cancelShipProductionResult', { detail: result }));
      if (result.success) {
        // Full refund
        const type = this.fleetStateManager.getShipTypes().find(t => t.id === result.cancelledEntry.shipTypeId);
        if (type) {
          const cost = type.productionCost ?? {};
          this.resourceEngine.processRefund(
            rsm.state,
            { credits: cost.credits ?? 0, materials: cost.materials ?? 0 },
            1.0,
            `shipproduction:cancel:${result.cancelledEntry.shipTypeId}`,
            this.currentTurn
          );
        }
        this._notifyReactConstructionUpdate();
        this._notifyReactResourceUpdate();
      }
    });
  }

  /**
   * Dispatch current construction state to React layer.
   * Emits 'galaxy:constructionUpdate' with all system states for the player faction.
   * @private
   */
  _notifyReactConstructionUpdate() {
    if (!this.constructionStateManager) return;
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';

    // Collect per-system construction state for all systems controlled by the player
    const systemsData = {};
    for (const system of (this.galaxy?.systems ?? [])) {
      const state = this.constructionStateManager.getSystemState(system.id)
        ?? { facilities: [], queue: [], groundTroops: 0 };
      systemsData[system.id] = {
        name:           system.name ?? system.id,
        ownerFactionId: system.loyalty ?? 'neutral',
        // Deep-clone so React always receives a new array reference and can
        // correctly detect facility additions / level changes after construction.
        facilities:     JSON.parse(JSON.stringify(state.facilities)),
        queue:          JSON.parse(JSON.stringify(state.queue)),
        groundTroops:   state.groundTroops
      };
    }

    const bases = this.constructionStateManager.getBases(playerFactionId);
    const facilityDefs = constructionConfig.facilityTypes;

    // Ship production extras — included here so FacilitiesTab has one data channel
    const productionQueues = this.fleetStateManager
      ? JSON.parse(JSON.stringify(this.fleetStateManager.productionQueues))
      : {};
    const shipTypes = this.fleetStateManager ? this.fleetStateManager.getShipTypes() : [];
    const completedTechs = this.techStates?.[playerFactionId]?.state?.completedTechnologies ?? [];
    const rsm = this.resourceStates?.[playerFactionId];
    const resourceState = rsm ? { ...rsm.state.resources } : { credits: 0, materials: 0, recruits: 0, influence: 0 };

    window.dispatchEvent(new CustomEvent('galaxy:constructionUpdate', {
      detail: {
        playerFactionId,
        systems:     systemsData,
        bases,
        facilityDefs,
        currentTurn: this.currentTurn,
        productionQueues,
        shipTypes,
        completedTechs,
        resourceState
      }
    }));
  }

  // ─── Mission System ──────────────────────────────────────────────────────────

  /**
   * Initialize the mission system — MissionStateManager, event listeners, and
   * wires missionStateManager + characterStates into TurnResolutionEngine.
   * Spec: 021–023
   */
  initializeMissionSystem() {
    this.missionStateManager = new MissionStateManager();

    // Wire into TurnResolutionEngine if already created
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.missionStateManager = this.missionStateManager;
      this.turnResolutionEngine.characterStates     = this.characterStates;
    }

    // React → Phaser: stage a mission
    window.addEventListener('game:stageMission', (e) => {
      const payload = e.detail ?? {};
      this._handleStageMission(payload);
    });

    // React → Phaser: cancel a staged mission
    window.addEventListener('game:cancelMission', (e) => {
      const { actionId } = e.detail ?? {};
      if (actionId) this._handleCancelMission(actionId);
    });

    // React → Phaser: request mission state
    window.addEventListener('game:requestMissionUpdate', (e) => {
      const { factionId } = e.detail ?? {};
      this._notifyReactMissionUpdate(factionId);
    });

    // Push initial state to React
    this._notifyReactMissionUpdate();

    console.log('[MainStage] Mission system initialized');
  }

  // ─── Event System (spec 045) ─────────────────────────────────────────────────

  /**
   * Initialize the EventEngine — load events.json, restore persisted state if available,
   * wire into TurnResolutionEngine, and register the galaxy:choiceEventResolved listener.
   * Spec: 045-event-system-spec.md
   */
  initializeEventSystem() {
    if (!FEATURES.EVENT_SYSTEM) return;

    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    this.eventEngine = new EventEngine(FACTION_IDS);
    this.eventEngine.loadEvents(eventsData);

    // Restore persisted event state (from save) if available
    const savedState = this.game.registry.get('gameConfig')?.savedState;
    // Restore alert history from save (spec 063 FR-PA-009)
    if (savedState?.alertState?.length) {
      window.dispatchEvent(new CustomEvent('game:restoreAlertState', {
        detail: { alerts: savedState.alertState }
      }));
    }
    if (savedState?.eventState) {
      try {
        this.eventEngine.deserializeState(savedState.eventState);
        console.log('[MainStage] Event state restored from save');
      } catch (err) {
        console.warn('[MainStage] Failed to restore event state from save:', err);
      }
    }

    // Wire into TurnResolutionEngine if already created
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.eventEngine = this.eventEngine;
    }

    // React → Phaser: player resolved a choice event
    window.addEventListener('galaxy:choiceEventResolved', (e) => {
      const { eventId, factionId, choiceIndex } = e.detail ?? {};
      if (!eventId || !factionId || choiceIndex == null) return;
      const context = this._buildEventContext();
      this.eventEngine.resolvePlayerChoice(eventId, factionId, choiceIndex, context);
      // Refresh resources after effect application
      this._notifyReactResourceUpdate();

      // Record the resolved choice in the turn summary and dispatch an alert
      const evt = this.eventEngine.getEventById(eventId);
      if (evt) {
        const choiceLabel = evt.choices?.[choiceIndex]?.label ?? `Option ${choiceIndex + 1}`;
        const message = `${evt.title} \u2014 chose "${choiceLabel}"`;
        this.turnStateManager?.recordEvent(
          'resolution',
          message,
          { urgent: false, factionId, outcome: 'info', domain: 'event' }
        );
        const resolvedDesc = this.eventEngine.resolveTokens
          ? this.eventEngine.resolveTokens(evt.description ?? '', factionId, context, this.currentTurn ?? 0)
          : (evt.description ?? '');
        window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
          detail: {
            category:  'event',
            factionId,
            message,
            outcome:   {
              summary:    evt.title,
              details:    [
                ...(resolvedDesc ? [{ label: 'Description', value: resolvedDesc }] : []),
                { label: 'Choice', value: choiceLabel },
              ],
              systemId:   null,
              systemName: null,
            },
            turn: this.currentTurn ?? 0,
          }
        }));
      }
    });

    console.log('[MainStage] Event system initialized');
  }

  // ─── Intel System (specs 042–044) ────────────────────────────────────────────

  /**
   * Initialize the IntelStateManager, wire into TurnResolutionEngine, and
   * register React event listeners.
   * Spec: 042-intel-system-spec.md, 043-intelligence-reports-spec.md,
   *       044-counter-intelligence-spec.md
   */
  initializeIntelSystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    this.intelStateManager = new IntelStateManager(FACTION_IDS);

    // Restore from save if available
    const savedState = this.game.registry.get('gameConfig')?.savedState;
    if (savedState?.intelState) {
      try {
        this.intelStateManager = IntelStateManager.deserialize(savedState.intelState, FACTION_IDS);
        console.log('[MainStage] Intel state restored from save');
      } catch (err) {
        console.warn('[MainStage] Failed to restore intel state from save:', err);
      }
    }

    // Wire into TurnResolutionEngine
    if (this.turnResolutionEngine) {
      this.turnResolutionEngine.intelStateManager = this.intelStateManager;
      this.turnResolutionEngine.intelEngine       = intelEngine;
    }

    // Register React ↔ Phaser intel event bridge
    this._registerIntelEvents();

    // Push initial state to React
    this._notifyReactIntelUpdate();

    console.log('[MainStage] Intel system initialized');
  }

  /**
   * Register window event listeners for React ↔ Phaser intel bridge.
   * @private
   */
  _registerIntelEvents() {
    // React → Phaser: request full intel state refresh
    window.addEventListener('galaxy:requestIntelUpdate', () => {
      this._notifyReactIntelUpdate();
    });

    // React → Phaser: assign character to CI Duty
    window.addEventListener('game:assignCIDuty', (e) => {
      const { factionId, characterId, systemId } = e.detail ?? {};
      if (!factionId || !characterId || !systemId) return;
      const csm = this.characterStates[factionId];
      if (!csm) return;
      const result = csm.assignToFacility(characterId, systemId, 'ci-duty');
      window.dispatchEvent(new CustomEvent('game:assignCIDutyResult', { detail: { ...result, factionId, characterId, systemId } }));
      if (result.success) this._notifyReactCharacterUpdate(factionId);
    });

    // React → Phaser: cancel CI Duty assignment
    window.addEventListener('game:cancelCIDuty', (e) => {
      const { factionId, characterId } = e.detail ?? {};
      if (!factionId || !characterId) return;
      const csm = this.characterStates[factionId];
      if (!csm) return;
      const result = csm.unassign(characterId);
      window.dispatchEvent(new CustomEvent('game:cancelCIDutyResult', { detail: { ...result, factionId, characterId } }));
      if (result.success) this._notifyReactCharacterUpdate(factionId);
    });
  }

  /**
   * Dispatch current intel state to React layer.
   * @param {string} [factionId]
   * @private
   */
  _notifyReactIntelUpdate(factionId = null) {
    if (!this.intelStateManager) return;
    const playerFactionId = factionId ?? this.game.registry.get('playerFactionId') ?? 'brandAuthority';
    const items = this.intelStateManager.getActiveItems(playerFactionId, this.currentTurn);
    window.dispatchEvent(new CustomEvent('galaxy:intelUpdate', {
      detail: { factionId: playerFactionId, items, currentTurn: this.currentTurn }
    }));
    // Sync fog-of-war rendering after any intel state change
    this._updateFogOfWar();
  }

  /**
   * Apply fog-of-war to every system node based on ownership and active intel.
   * Own systems are always fully visible; non-owned systems are fogged unless
   * the player has at least one active intel item for that system.
   * Also refreshes intel indicator icons.
   * @private
   */
  _updateFogOfWar() {
    if (!this.systems?.length) return;
    const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';
    for (const system of this.systems) {
      const isOwn = system.data.loyalty === playerFactionId;
      if (isOwn) {
        system.applyFogState(false);
        system.setIntelIndicator(false); // own systems never need an intel badge
      } else {
        const hasIntel = this.intelStateManager
          ? this.intelStateManager.hasActiveIntel(playerFactionId, system.data.id, this.currentTurn)
          : false;
        // FR-IS-001: faction ownership (color) is always publicly visible without intel.
        // Never fog the circle — all systems render in their controlling faction's color.
        // isFogged is only used to gate detail-panel intel content, not map rendering.
        system.applyFogState(false);
        system.setIntelIndicator(hasIntel);
      }
    }
    // Force overlay re-emission so React labels reflect the updated fog states.
    this._overlayDirty = true;
  }

  /**
   * Build the context object required by EventEngine for effect application.
   * @returns {Object}
   * @private
   */
  _buildEventContext() {
    return {
      galaxy:              this.galaxy,
      resourceStates:      this.resourceStates,
      resourceEngine:      this.resourceEngine,
      loyaltyStateManager: this.loyaltyStateManager,
      characterStates:     this.characterStates,
      fleetStateManager:   this.fleetStateManager,
      currentTurn:         this.currentTurn,
      playerFactionId:     this.game.registry.get('playerFactionId') ?? 'brandAuthority'
    };
  }

  /**
   * Handle staging a mission from React.
   * Validates, assigns characters to On Mission, and stages in TurnStateManager.
   * @param {Object} payload - Mission payload from React
   * @private
   */
  _handleStageMission(payload) {
    const factionId = payload.factionId ?? this.game.registry.get('playerFactionId') ?? 'brandAuthority';
    const csm = this.characterStates[factionId];

    // Validate
    const validation = missionEngine.validateMission(
      { ...payload, factionId },
      { characterStates: this.characterStates, galaxy: this.galaxy, techStates: this.techStates }
    );
    if (!validation.valid) {
      window.dispatchEvent(new CustomEvent('game:stageMissionResult', {
        detail: { success: false, error: validation.error, factionId }
      }));
      return;
    }

    // Generate mission ID
    const missionId = this.missionStateManager.generateMissionId();
    const typeDef = missionEngine.getMissionType(payload.missionType);

    // Assign characters to On Mission
    const characterIds = payload.characterIds ?? [];
    const assignErrors = [];
    const assignedIds  = [];
    for (const charId of characterIds) {
      const result = csm?.assignToMission(charId, missionId, payload.targetSystemId ?? payload.targetId);
      if (result?.success) {
        assignedIds.push(charId);
      } else {
        assignErrors.push(result?.error ?? `Failed to assign ${charId}`);
      }
    }
    if (assignErrors.length > 0) {
      // Rollback any successful assignments
      for (const charId of assignedIds) csm?.unassign(charId);
      window.dispatchEvent(new CustomEvent('game:stageMissionResult', {
        detail: { success: false, error: assignErrors.join('; '), factionId }
      }));
      return;
    }

    // Stage in TurnStateManager
    const fullPayload = {
      ...payload,
      factionId,
      missionId,
      tier: typeDef?.tier ?? 'support',
      characterIds: assignedIds
    };

    const stageResult = this.turnStateManager?.stageAction('mission', fullPayload);
    if (!stageResult?.success) {
      for (const charId of assignedIds) csm?.unassign(charId);
      window.dispatchEvent(new CustomEvent('game:stageMissionResult', {
        detail: { success: false, error: stageResult?.error ?? 'Cannot stage action', factionId }
      }));
      return;
    }

    // Register multi-turn missions in MissionStateManager
    const duration = typeDef?.duration ?? 1;
    if (duration > 1) {
      this.missionStateManager.registerActiveMission(fullPayload, duration);
    }

    window.dispatchEvent(new CustomEvent('game:stageMissionResult', {
      detail: { success: true, missionId, actionId: stageResult.id, factionId }
    }));

    this._notifyReactMissionUpdate(factionId);
    this._notifyReactCharacterUpdate(factionId);
    this._notifyReactResourceUpdate();
  }

  /**
   * Handle cancellation of a staged mission.
   * @param {string} actionId - Action ID from TurnStateManager
   * @private
   */
  _handleCancelMission(actionId) {
    if (!this.turnStateManager) return;
    const staged = this.turnStateManager.getStagedActions('mission');
    const action = staged.find(a => a.id === actionId);
    if (!action) {
      window.dispatchEvent(new CustomEvent('game:cancelMissionResult', {
        detail: { success: false, error: 'Mission not found' }
      }));
      return;
    }

    const payload = action.payload;
    const csm = this.characterStates[payload.factionId];

    // Unstage from TurnStateManager
    const result = this.turnStateManager.unstageAction(actionId);

    // Release characters back to Available
    if (csm) {
      for (const charId of (payload.characterIds ?? [])) {
        csm.unassign(charId);
      }
    }

    // Remove multi-turn registration if needed
    this.missionStateManager?.removeActiveMission(payload.missionId);

    window.dispatchEvent(new CustomEvent('game:cancelMissionResult', {
      detail: { success: result.success, factionId: payload.factionId }
    }));

    this._notifyReactMissionUpdate(payload.factionId);
    this._notifyReactCharacterUpdate(payload.factionId);
    this._notifyReactResourceUpdate();
  }

  /**
   * Dispatch current mission state to React layer.
   * @param {string} [factionId]
   * @private
   */
  _notifyReactMissionUpdate(factionId = null) {
    const playerFactionId = factionId ?? this.game.registry.get('playerFactionId') ?? 'brandAuthority';
    const staged = (this.turnStateManager?.getStagedActions('mission') ?? [])
      .filter(a => a.payload?.factionId === playerFactionId);
    const active  = this.missionStateManager?.getActiveMissions(playerFactionId) ?? [];
    const log     = this.missionStateManager?.getMissionLog(playerFactionId) ?? [];
    const types   = missionEngine.getMissionTypes();

    window.dispatchEvent(new CustomEvent('game:missionUpdate', {
      detail: { factionId: playerFactionId, staged, active, log, missionTypes: types, currentTurn: this.currentTurn }
    }));
  }

  // ─── Tech Research System ─────────────────────────────────────────────────────

  /**
   * Initialize the technology research system — loads all trees, creates per-faction
   * TechStateManagers, wires the TechResearchEngine, registers event listeners.
   */
  async initializeTechSystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
    try {
      await TechTreeLoader.loadAllTrees();
      this.techResearchEngine = new TechResearchEngine(TechTreeLoader, this.resourceEngine);

      for (const factionId of FACTION_IDS) {
        const startingTechId = {
          brandAuthority: 'military-logistics-1',
          union:          'guerrilla-tactics-1',
          autoforge:      'automated-production-1'
        }[factionId];

        const tsm = new TechStateManager(factionId);
        if (startingTechId) {
          tsm.state.completedTechnologies.push(startingTechId);
          tsm.state.appliedEffects.push({ techId: startingTechId, effects: [] });
        }
        this.techStates[factionId] = tsm;
      }

      console.log('[MainStage] Tech research system initialized');

      // Restore tech states — from savedState if loading, otherwise from DataBridge
      const savedState = this.game.registry.get('gameConfig')?.savedState;
      if (savedState?.techStates) {
        for (const factionId of FACTION_IDS) {
          const savedTech = savedState.techStates[factionId];
          if (savedTech) {
            try {
              this.techStates[factionId] = TechStateManager.deserialize(savedTech);
              console.log(`[MainStage] Tech state restored from save for ${factionId}`);
            } catch (err) {
              console.warn(`[MainStage] Failed to restore tech state from save for ${factionId}:`, err);
            }
          }
        }
      } else {
        // Attempt to restore previously saved tech states
        const player = dataBridge.getPlayer();
        if (player) {
          for (const factionId of FACTION_IDS) {
            const serialized = await dataBridge.loadTechState(factionId);
            if (serialized) {
              try {
                const loaded = TechStateManager.deserialize(serialized);
                this.techStates[factionId] = loaded;
                console.log(`[MainStage] Tech state restored for ${factionId}`);
              } catch (err) {
                console.warn(`[MainStage] Failed to restore tech state for ${factionId}:`, err);
              }
            }
          }
        }
      }

      // React → Phaser: begin research
      window.addEventListener('game:beginResearch', (e) => {
        const { factionId, techId } = e.detail ?? {};
        this._handleBeginResearch(factionId, techId);
      });

      // React → Phaser: queue research
      window.addEventListener('game:queueResearch', (e) => {
        const { factionId, techId } = e.detail ?? {};
        this._handleQueueResearch(factionId, techId);
      });

      // React → Phaser: remove from queue
      window.addEventListener('game:removeResearchQueue', (e) => {
        const { factionId, techId } = e.detail ?? {};
        this._handleRemoveFromQueue(factionId, techId);
      });

      // React → Phaser: reorder queue
      window.addEventListener('game:reorderResearchQueue', (e) => {
        const { factionId, orderedTechIds } = e.detail ?? {};
        this._handleReorderQueue(factionId, orderedTechIds);
      });

      // React → Phaser: request current state (e.g. on component mount)
      window.addEventListener('game:requestTechUpdate', (e) => {
        const { factionId } = e.detail ?? {};
        if (factionId) {
          this._notifyReactTechUpdate(factionId);
        } else {
          FACTION_IDS.forEach(id => this._notifyReactTechUpdate(id));
        }
      });

      // Push initial state to React
      FACTION_IDS.forEach(id => this._notifyReactTechUpdate(id));

    } catch (err) {
      console.error('[MainStage] Failed to initialize tech system:', err);
    }
  }

  /**
   * Initialize the character/leader system — creates per-faction CharacterStateManagers
   * from starting roster definitions, wires event listeners, and restores persisted state.
   * Spec: 009-character-roster-spec.md, 010-character-assignment-spec.md
   */
  async initializeCharacterSystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    for (const factionId of FACTION_IDS) {
      const csm = new CharacterStateManager(factionId);
      const rosterDefs = characterDefinitions.startingRosters[factionId] ?? [];
      csm.loadStartingRoster(rosterDefs);
      this.characterStates[factionId] = csm;
    }

    // Restore character states — from savedState if loading, otherwise from DataBridge
    const savedStateChar = this.game.registry.get('gameConfig')?.savedState;
    if (savedStateChar?.characterStates) {
      for (const factionId of FACTION_IDS) {
        const savedChar = savedStateChar.characterStates[factionId];
        if (savedChar) {
          try {
            this.characterStates[factionId] = CharacterStateManager.deserialize(savedChar);
            console.log(`[MainStage] Character state restored from save for ${factionId}`);
          } catch (err) {
            console.warn(`[MainStage] Failed to restore character state from save for ${factionId}:`, err);
          }
        }
      }
    } else {
      // Attempt to restore previously saved character states
      const player = dataBridge.getPlayer();
      if (player) {
        for (const factionId of FACTION_IDS) {
          const serialized = await dataBridge.loadCharacterState(factionId);
          if (serialized) {
            try {
              this.characterStates[factionId] = CharacterStateManager.deserialize(serialized);
              console.log(`[MainStage] Character state restored for ${factionId}`);
            } catch (err) {
              console.warn(`[MainStage] Failed to restore character state for ${factionId}:`, err);
            }
          }
        }
      }
    }

    // React → Phaser: request galaxy systems list
    window.addEventListener('game:requestGalaxySystems', () => {
      const systems = (this.galaxy?.systems ?? []).map(s => ({
        id:      s.id,
        name:    s.name ?? s.id,
        loyalty: s.loyalty ?? 'neutral'
      }));
      window.dispatchEvent(new CustomEvent('game:galaxySystems', { detail: { systems } }));
    });

    // React → Phaser: request character update
    window.addEventListener('game:requestCharacterUpdate', (e) => {
      const { factionId } = e.detail ?? {};
      if (factionId) {
        this._notifyReactCharacterUpdate(factionId);
      } else {
        FACTION_IDS.forEach(id => this._notifyReactCharacterUpdate(id));
      }
    });

    // React → Phaser: assign character to mission
    window.addEventListener('game:assignCharacter', (e) => {
      const { factionId, characterId, assignmentType, targetId, targetSystemId, facilityType } = e.detail ?? {};
      const csm = this.characterStates[factionId];
      if (!csm) return;
      let result;
      if (assignmentType === 'mission') {
        result = csm.assignToMission(characterId, targetId, targetSystemId);
      } else if (assignmentType === 'fleet') {
        result = csm.assignToFleet(characterId, targetId);
      } else if (assignmentType === 'facility') {
        result = csm.assignToFacility(characterId, targetSystemId, facilityType);
      } else {
        result = csm.unassign(characterId);
      }
      window.dispatchEvent(new CustomEvent('game:assignCharacterResult', { detail: { ...result, factionId, characterId } }));
      if (result.success) {
        this._notifyReactCharacterUpdate(factionId);
        this._notifyReactResourceUpdate();
      }
    });

    // Push initial state to React
    FACTION_IDS.forEach(id => this._notifyReactCharacterUpdate(id));

    console.log('[MainStage] Character system initialized for', FACTION_IDS.length, 'factions');
  }

  /**
   * Dispatch current character state to React layer.
   * @param {string} factionId
   * @private
   */
  _notifyReactCharacterUpdate(factionId) {
    const csm = this.characterStates[factionId];
    if (!csm) return;

    const systemNames = Object.fromEntries(
      (this.galaxy?.systems ?? []).map(s => [s.id, s.name ?? s.id])
    );

    window.dispatchEvent(new CustomEvent('game:characterUpdate', {
      detail: {
        factionId,
        characters: csm.getActiveRoster(),
        allCharacters: csm.getAllCharacters(),
        currentTurn: this.currentTurn,
        systemNames
      }
    }));
  }

  /**
   * Build a minimal faction object suitable for TechResearchEngine from live game state.
   * @param {string} factionId
   * @returns {Object}
   * @private
   */
  _buildFactionObjectForTech(factionId) {
    const factionData = this.galaxy?.factionData?.[factionId] ?? {};
    const rsm = this.resourceStates[factionId];
    const techState = this.techStates[factionId];

    return {
      id:                factionId,
      bonuses:           { ...(factionData.bonuses ?? {}) },
      militaryBonuses:   { ...(factionData.militaryBonuses ?? {}) },
      resourceCaps:      { ...(rsm?.state?.resourceCaps ?? {}) },
      missionBonuses:    { ...(factionData.missionBonuses ?? {}) },
      costReductions:    { ...(factionData.costReductions ?? {}) },
      uniqueCapabilities: { ...(factionData.uniqueCapabilities ?? {}) },
      unlockedContent:   { ...(factionData.unlockedContent ?? {}) },
      controlledSystems: (this.galaxy?.systems ?? []).filter(s => s.loyalty === factionId)
    };
  }

  /**
   * Handle begin-research request from React.
   * @param {string} factionId
   * @param {string} techId
   * @private
   */
  _handleBeginResearch(factionId, techId) {
    const techState = this.techStates[factionId];
    const rsm = this.resourceStates[factionId];
    if (!techState || !rsm || !this.techResearchEngine) {
      window.dispatchEvent(new CustomEvent('game:beginResearchResult', {
        detail: { factionId, techId, success: false, error: 'Research system not ready' }
      }));
      return;
    }

    const faction = this._buildFactionObjectForTech(factionId);
    const result = this.techResearchEngine.beginResearch(
      faction, techState, rsm.state, techId, this.currentTurn
    );

    window.dispatchEvent(new CustomEvent('game:beginResearchResult', {
      detail: { factionId, techId, success: result.success, error: result.error ?? null }
    }));

    if (result.success) {
      this._notifyReactTechUpdate(factionId);
    }
  }

  /**
   * Handle queue-research request from React.
   * @param {string} factionId
   * @param {string} techId
   * @private
   */
  _handleQueueResearch(factionId, techId) {
    const techState = this.techStates[factionId];
    if (!techState || !this.techResearchEngine) return;

    const result = this.techResearchEngine.queueTechnology(techState, factionId, techId);
    if (result.success) {
      this._notifyReactTechUpdate(factionId);
    }
  }

  /**
   * Handle remove-from-queue request from React.
   * @param {string} factionId
   * @param {string} techId
   * @private
   */
  _handleRemoveFromQueue(factionId, techId) {
    const techState = this.techStates[factionId];
    if (!techState || !this.techResearchEngine) return;

    this.techResearchEngine.removeFromQueue(techState, techId);
    this._notifyReactTechUpdate(factionId);
  }

  /**
   * Handle queue-reorder request from React.
   * @param {string} factionId
   * @param {string[]} orderedTechIds
   * @private
   */
  _handleReorderQueue(factionId, orderedTechIds) {
    const techState = this.techStates[factionId];
    if (!techState || !this.techResearchEngine) return;

    this.techResearchEngine.reorderQueue(techState, orderedTechIds);
    this._notifyReactTechUpdate(factionId);
  }

  /**
   * Dispatch current tech state to React layer for rendering.
   * @param {string} factionId
   * @private
   */
  _notifyReactTechUpdate(factionId) {
    const techState = this.techStates[factionId];
    if (!techState) return;

    window.dispatchEvent(new CustomEvent('game:techUpdate', {
      detail: {
        factionId,
        completedTechnologies: [...techState.state.completedTechnologies],
        activeResearchProjects: techState.state.activeResearchProjects.map(p => ({ ...p })),
        researchQueue:          [...techState.state.researchQueue],
        multiResearchSlots:     techState.state.multiResearchSlots,
        currentTurn:            this.currentTurn
      }
    }));
  }

  // ─── Victory System ─────────────────────────────────────────────────────────

  /**
   * Initialize the victory conditions system for all factions.
   * Creates victoryGameState and initializes per-faction victoryProgress.
   */
  initializeVictorySystem() {
    const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

    // Build the shared game state object that the victory modules read
    this.victoryGameState = {
      systems:                  this.galaxy.systems,
      factions:                 {},
      currentTurn:              this.currentTurn,
      gameOver:                 false,
      winner:                   null,
      finalStats:               null,
      _startTime:               Date.now(),
      // Union secret base state (stub for Phase 1B integration)
      unionSecretBase:          { destroyed: false },
      unionSecretBaseLocation:  { revealedTo: [] },
      // Fleet data (stub — populated by Phase 1B fleet system)
      fleets:                   []
    };

    FACTION_IDS.forEach(factionId => {
      this.victoryGameState.factions[factionId] = {
        id:             factionId,
        victoryProgress: VictoryStateManager.initializeFactionState(
          factionId,
          (this.game.registry.get('gameConfig') ?? {}).victoryThresholdModifier ?? 1.0
        ),
        resources:      this.resourceStates[factionId]?.getResources() ?? {},
        technologies:   [],
        techState:      { completedTechnologies: [] },
        peakSystems:    0
      };
    });

    console.log('[MainStage] Victory system initialized for', FACTION_IDS.length, 'factions');

    // Listen for tech completion events (Phase 1B: fire unlock notifications)
    window.addEventListener('game:techCompleted', (e) => {
      const { factionId, techId } = e.detail ?? {};
      this._handleTechVictoryUnlock(factionId, techId);
    });
  }

  /**
   * Sync victory game state before each victory check.
   * Reads current galaxy + resource state into victoryGameState.
   * @private
   */
  _syncVictoryGameState() {
    if (!this.victoryGameState) return;

    this.victoryGameState.systems     = this.galaxy.systems;
    this.victoryGameState.currentTurn = this.currentTurn;

    // Sync per-faction resources and system counts
    for (const [factionId, faction] of Object.entries(this.victoryGameState.factions)) {
      const rsm = this.resourceStates[factionId];
      faction.resources  = rsm?.getResources() ?? {};

      const controlled = this.galaxy.systems.filter(s => s.loyalty === factionId).length;
      if (controlled > (faction.peakSystems ?? 0)) faction.peakSystems = controlled;
    }
  }

  /**
   * Handle tech-gated victory unlock events.
   * @param {string} factionId
   * @param {string} techId
   * @private
   */
  _handleTechVictoryUnlock(factionId, techId) {
    if (!this.victoryGameState?.factions?.[factionId]) return;
    const vp = this.victoryGameState.factions[factionId].victoryProgress;

    const UNLOCK_MAP = {
      'galactic-administration': 'vc-ba-economic-dominance',
      'revolutionary-spark':     'vc-un-heroic'
    };

    const conditionId = UNLOCK_MAP[techId];
    if (!conditionId) return;

    const notification = VictoryStateManager.unlockCondition(vp, conditionId);
    if (notification) {
      const { victoryNotificationEngine: vne } = (this._vne ?? (this._vne = { victoryNotificationEngine }));
      victoryNotificationEngine.notifyVictoryUnlocked(factionId, conditionId, techId);
      this._notifyReactVictoryUpdate();
    }
  }

  /**
   * Notify React layer of updated victory state.
   * Dispatches 'galaxy:victoryUpdate' event.
   * @private
   */
  _notifyReactVictoryUpdate() {
    if (!this.victoryGameState) return;
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const playerFaction   = this.victoryGameState.factions?.[playerFactionId];

    window.dispatchEvent(new CustomEvent('galaxy:victoryUpdate', {
      detail: {
        playerFactionId,
        currentTurn:      this.currentTurn,
        victoryProgress:  playerFaction?.victoryProgress ?? null,
        gameOver:         this.victoryGameState.gameOver,
        winner:           this.victoryGameState.winner,
        allFactions:      Object.fromEntries(
          Object.entries(this.victoryGameState.factions).map(([id, f]) => [
            id,
            { id, victoryProgress: f.victoryProgress }
          ])
        )
      }
    }));
  }

  /**
   * Expose victory game state for React components (used by VictoryScreen).
   * @returns {Object|null}
   */
  getVictoryGameState() {
    return this.victoryGameState;
  }

  /**
   * Default faction bonuses when factionData not available in galaxy.
   * @param {string} factionId
   * @returns {Object}
   * @private
   */
  _getDefaultFactionBonuses(factionId) {
    const defaults = {
      brandAuthority: { creditIncome: 1.15, tradeHubBonus: 1.10 },
      union:          { baseResourceProduction: 0.90 },
      autoforge:      { resourceProduction: 1.40, recruitGeneration: 0.50 }
    };
    return defaults[factionId] ?? {};
  }

  /**
   * Emit resource state to React layer via a custom browser event.
   * React HUD listens for 'galaxy:resourceUpdate' on window.
   * @private
   */
  _notifyReactResourceUpdate() {
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const rsm = this.resourceStates[playerFactionId];
    if (!rsm) return;

    // ── Characters readiness (FR-APL-006) ────────────────────────────────────
    const csm = this.characterStates?.[playerFactionId];
    const allChars       = csm?.getAllCharacters() ?? [];
    const availableChars = allChars.filter(c =>
      c.status === 'available' || c.status === 'stationed'
    ).length;
    const totalChars = allChars.filter(c => c.status !== 'dead').length;

    // ── Fleet readiness (FR-APL-006) ─────────────────────────────────────────
    const playerFleets    = this.fleetStateManager?.fleets?.[playerFactionId] ?? [];
    const totalFleets     = playerFleets.length;
    const ordersSet       = this.fleetStateManager?._ordersThisTurn?.[playerFactionId];
    const fleetsWithOrders = ordersSet ? ordersSet.size : 0;
    const fleetsWithoutOrders = totalFleets - fleetsWithOrders;

    // ── Construction readiness (FR-APL-006) ──────────────────────────────────
    const controlledSystems = this.galaxy?.systems?.filter(s => s.loyalty === playerFactionId) ?? [];
    const totalControlledSystems = controlledSystems.length;
    const csManager = this.constructionStateManager;
    const queueMax  = csManager?.config?.queueMaxSize ?? 3;
    const systemsWithQueueSpace = controlledSystems.filter(s => {
      const q = csManager?.getQueue?.(s.id) ?? [];
      return q.length < queueMax;
    }).length;
    const systemsWithActiveQueue = controlledSystems.filter(s => {
      const q = csManager?.getQueue?.(s.id) ?? [];
      return q.length > 0;
    }).length;

    const event = new CustomEvent('galaxy:resourceUpdate', {
      detail: {
        factionId:          playerFactionId,
        resources:          rsm.getResources(),
        caps:               rsm.getCaps(),
        productionThisTurn: rsm.getProductionThisTurn(),
        spendingThisTurn:   rsm.getSpendingThisTurn(),
        productionHistory:  rsm.getProductionHistory(),
        queuedSpending:     rsm.getQueuedSpending(),
        transactionLog:     rsm.getTransactionLog(),
        currentTurn:        this.currentTurn,
        currentPhase:       this.turnStateManager?.currentPhase ?? 'ACTION',
        // Characters (FR-APL-006)
        availableChars,
        totalChars,
        // Fleets (FR-APL-006)
        fleetsWithoutOrders,
        totalFleets,
        // Construction (FR-APL-006)
        systemsWithQueueSpace,
        systemsWithActiveQueue,
        totalControlledSystems
      }
    });
    window.dispatchEvent(event);
  }

  /**
   * Attempt to spend resources for the player faction.
   * Emits 'galaxy:insufficientResources' if spending fails.
   * @param {Object} costs - { credits?, materials?, recruits?, influence? }
   * @param {string} source - Description of what action is spending
   * @returns {{ success: boolean, error?: string }}
   */
  spendPlayerResources(costs, source) {
    const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
    const rsm = this.resourceStates[playerFactionId];
    if (!rsm) return { success: false, error: 'No resource state for player faction' };

    const result = this.resourceEngine.spendResources(rsm.state, costs, source, this.currentTurn);

    if (!result.success) {
      window.dispatchEvent(new CustomEvent('galaxy:insufficientResources', {
        detail: { message: result.error }
      }));
    } else {
      this._notifyReactResourceUpdate();
    }

    return result;
  }

  /**
   * Get the ResourceStateManager for a faction (used by React components).
   * @param {string} factionId
   * @returns {ResourceStateManager|undefined}
   */
  getResourceState(factionId) {
    return this.resourceStates[factionId];
  }

  /**
   * Stage a player action during the Action Phase.
   * - Reserves any resource costs via soft-lock (queuedSpending)
   * - Tracks action point usage on the ResourceStateManager
   * - Notifies React of the updated resource state
   * Spec: 030-action-points-limits-spec.md (FR-APL-005)
   *
   * @param {string} type - Action type ('mission', 'construction', 'diplomatic', etc.)
   * @param {Object} payload - Action-specific data; may include `costs` and `factionId`
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  stagePlayerAction(type, payload) {
    if (!this.turnStateManager) return { success: false, error: 'Turn system not ready' };

    const playerFactionId = payload?.factionId ||
      this.game.registry.get('playerFactionId') || 'brandAuthority';
    const rsm = this.resourceStates[playerFactionId];
    if (!rsm) return { success: false, error: `No resource state for ${playerFactionId}` };

    // Reserve resource costs if the action has any
    if (payload?.costs && Object.keys(payload.costs).length > 0) {
      const reservation = this.resourceEngine.reserveResources(rsm.state, payload.costs);
      if (!reservation.success) {
        window.dispatchEvent(new CustomEvent('galaxy:insufficientResources', {
          detail: { message: reservation.error }
        }));
        return { success: false, error: reservation.error };
      }
    }

    const result = this.turnStateManager.stageAction(type, payload);
    if (result.success) {
      this._notifyReactResourceUpdate();
    }
    return result;
  }

  /**
   * Un-stage (cancel) a previously staged player action.
   * - Releases any reserved resource costs
   * - Decrements action point counter
   * - Notifies React
   * Spec: 030-action-points-limits-spec.md (FR-APL-005)
   *
   * @param {string} id - Action ID returned by stagePlayerAction()
   * @returns {{ success: boolean }}
   */
  unstagePlayerAction(id) {
    if (!this.turnStateManager) return { success: false };

    const action = this.turnStateManager.pendingActions.find(a => a.id === id);
    if (!action) return { success: false };

    const playerFactionId = action.payload?.factionId ||
      this.game.registry.get('playerFactionId') || 'brandAuthority';
    const rsm = this.resourceStates[playerFactionId];

    // Release reserved costs if any
    if (rsm && action.payload?.costs && Object.keys(action.payload.costs).length > 0) {
      this.resourceEngine.releaseReserved(rsm.state, action.payload.costs);
    }

    const result = this.turnStateManager.unstageAction(id);
    if (result.success && rsm) {
      this._notifyReactResourceUpdate();
    }
    return result;
  }

  /**
   * Render galaxy map (systems and connections)
   */
  renderGalaxy() {
    // Create a container for galaxy elements
    this.galaxyContainer = this.add.container(0, 0);
    
    // Draw connections first (behind systems)
    this.renderConnections();
    
    // Create system visuals
    this.renderSystems();
  }

  /**
   * Render hyperspace connections between systems
   */
  renderConnections() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x484f58, 0.4);
    
    const drawnConnections = new Set();
    
    this.galaxy.systems.forEach(system => {
      system.connections.forEach(targetId => {
        // Draw each connection only once
        const key = [system.id, targetId].sort().join('-');
        if (drawnConnections.has(key)) return;
        drawnConnections.add(key);
        
        const target = this.galaxy.systems.find(s => s.id === targetId);
        if (target) {
          graphics.lineBetween(
            system.position.x,
            system.position.y,
            target.position.x,
            target.position.y
          );
        }
      });
    });
    
    this.connections.push(graphics);
  }

  /**
   * Render all star systems
   */
  renderSystems() {
    this.galaxy.systems.forEach(systemData => {
      const system = new System(this, systemData);
      this.systems.push(system);
    });
  }

  /**
   * Setup camera controls (pan and zoom)
   */
  setupCamera() {
    const camera = this.cameras.main;
    
    // Set camera bounds to galaxy size
    const padding = 300;
    camera.setBounds(
      -padding,
      -padding,
      this.galaxy.sectors[0] ? 4000 : 3000,
      this.galaxy.sectors[0] ? 3000 : 2000
    );
    
    // Center camera on galaxy center
    const centerX = 1500;
    const centerY = 1000;
    camera.centerOn(centerX, centerY);
    
    // Enable drag to pan
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown()) {
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
      }
    });
    
    this.input.on('pointermove', (pointer) => {
      if (this.isDragging) {
        const deltaX = this.dragStartX - pointer.x;
        const deltaY = this.dragStartY - pointer.y;
        
        camera.scrollX += deltaX;
        camera.scrollY += deltaY;
        
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;

        // Notify tutorial engine that the player has panned the map
        if (deltaX !== 0 || deltaY !== 0) {
          window.dispatchEvent(new CustomEvent('galaxy:tutorialPanZoom', { detail: { type: 'pan' } }));
        }
      }
    });
    
    this.input.on('pointerup', () => {
      this.isDragging = false;
    });
    
    // Mouse wheel zoom.
    // _targetZoom tracks the *intended* final zoom level independently of the
    // animated camera.zoom value, which is mid-interpolation during a zoomTo()
    // tween.  Computing the clamp against camera.zoom (not the target) would
    // compound errors on rapid successive wheel events, causing the zoom level
    // to overshoot or stall at unexpected values.
    this._targetZoom = camera.zoom;
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoomAmount = deltaY > 0 ? -0.1 : 0.1;
      this._targetZoom = Phaser.Math.Clamp(this._targetZoom + zoomAmount, 0.5, 2.0);

      camera.zoomTo(this._targetZoom, 150);

      // Update system name visibility based on zoom
      this.systems.forEach(system => system.updateVisibility(this._targetZoom));
    });
  }

  /**
   * Setup input handlers
   */
  setupInput() {
    this.input.on('gameobjectdown', (pointer, obj) => {
      // Only process clicks if not dragging
      if (!this.isDragging) {
        if (obj.systemRef) {
          this.onSystemClick(obj.systemRef);
        }
      }
    });
    
    // Double-click to center on system
    this.input.on('gameobjectup', (pointer, obj) => {
      const now = Date.now();
      if (obj.systemRef) {
        if (this.lastClickTime && now - this.lastClickTime < 300 && this.lastClickedSystem === obj.systemRef) {
          this.centerOnSystem(obj.systemRef);
        }
        this.lastClickTime = now;
        this.lastClickedSystem = obj.systemRef;
      }
    });
    
    // Click empty space to deselect
    this.input.on('pointerup', (pointer) => {
      if (!this.isDragging && pointer.leftButtonReleased()) {
        const hitObjects = this.input.hitTestPointer(pointer);
        if (hitObjects.length === 0) {
          this.deselectSystem();
        }
      }
    });
    
    // Forward system hover events to React (SystemTooltip component handles rendering)
    this.events.on('system-hover', (systemData) => {
      window.dispatchEvent(new CustomEvent('galaxy:systemHover', { detail: systemData }));
    });

    this.events.on('system-hover-end', () => {
      window.dispatchEvent(new CustomEvent('galaxy:systemHoverEnd'));
    });
    
    // Keyboard shortcuts
    this.setupKeyboardControls();

    // Block Phaser input when React UI layers are open
    this.setupUIInputBlocking();
  }

  /**
   * Track how many React UI layers are open so Phaser input can be blocked
   * while any modal or panel is visible.  Uses a depth counter so stacked
   * overlays don't prematurely re-enable input when an inner one closes.
   */
  setupUIInputBlocking() {
    this.uiOverlayDepth = 0;

    this._onUiLayerOpen = () => {
      this.uiOverlayDepth++;
      if (this.uiOverlayDepth > 0) {
        this.input.enabled = false;
        this.input.keyboard.enabled = false;
      }
    };

    this._onUiLayerClose = () => {
      this.uiOverlayDepth = Math.max(0, this.uiOverlayDepth - 1);
      if (this.uiOverlayDepth === 0) {
        this.input.enabled = true;
        this.input.keyboard.enabled = true;
      }
    };

    window.addEventListener('game:uiLayerOpen', this._onUiLayerOpen);
    window.addEventListener('game:uiLayerClose', this._onUiLayerClose);

    // Clean up on scene shutdown so listeners don't leak if the scene restarts
    this.events.once('shutdown', () => {
      window.removeEventListener('game:uiLayerOpen', this._onUiLayerOpen);
      window.removeEventListener('game:uiLayerClose', this._onUiLayerClose);

      // Spec 057: Tear down SessionPresenceManager channels & state
      sessionPresenceManager.destroy();
    });
  }

  /**
   * Setup keyboard controls
   */
  setupKeyboardControls() {
    // Arrow keys for panning
    this.cursors = this.input.keyboard.createCursorKeys();
    
    // Additional keys
    this.keys = {
      space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      esc: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      plus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      minus: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      tab: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB)
    };
    
    // Space to center on selected system
    this.keys.space.on('down', () => {
      if (this.selectedSystem) {
        this.centerOnSystem(this.selectedSystem);
      }
    });
    
    // ESC to deselect
    this.keys.esc.on('down', () => {
      this.deselectSystem();
    });
    
    // Plus/Minus for zoom
    this.keys.plus.on('down', () => {
      this.zoomCamera(0.2);
    });
    
    this.keys.minus.on('down', () => {
      this.zoomCamera(-0.2);
    });
    
    // Tab to cycle through player systems
    this.keys.tab.on('down', () => {
      this.cyclePlayerSystems();
    });
  }

  /**
   * Update method for keyboard panning
   */
  update() {
    const camera = this.cameras.main;
    const panSpeed = 10 / camera.zoom;

    // Skip arrow-key panning when a React UI overlay is open or a text field
    // has focus (e.g. save-file name input)
    const textFieldFocused = (
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA'
    );
    if (this.uiOverlayDepth > 0 || textFieldFocused) {
      this._emitSystemOverlays();
      return;
    }

    // Arrow key panning
    if (this.cursors.left.isDown) {
      camera.scrollX -= panSpeed;
    } else if (this.cursors.right.isDown) {
      camera.scrollX += panSpeed;
    }
    
    if (this.cursors.up.isDown) {
      camera.scrollY -= panSpeed;
    } else if (this.cursors.down.isDown) {
      camera.scrollY += panSpeed;
    }

    // Emit screen-space positions to React overlay every frame when camera changed
    this._emitSystemOverlays();
  }

  /**
   * Emit screen-space system positions + metadata to the React SystemOverlays
   * component.  Only dispatches when camera state has changed since last tick.
   */
  _emitSystemOverlays() {
    if (!this.systems?.length) return;

    const cam     = this.cameras.main;
    const scrollX = cam.scrollX;
    const scrollY = cam.scrollY;
    const zoom    = cam.zoom;

    if (
      !this._overlayDirty &&
      this._lastOvScrollX === scrollX &&
      this._lastOvScrollY === scrollY &&
      this._lastOvZoom    === zoom
    ) return;

    this._overlayDirty   = false;
    this._lastOvScrollX  = scrollX;
    this._lastOvScrollY  = scrollY;
    this._lastOvZoom     = zoom;

    // Phaser zooms around the viewport centre, not the top-left corner.
    // Correct world→screen formula:
    //   screenX = screenCX + (worldX - worldCX) * zoom
    // where worldCX = scrollX + camW/2  (world coord pinned at screen centre,
    // unchanged by zoomTo() since scrollX doesn't move during the tween).
    const halfW   = cam.x + cam.width  / 2;
    const halfH   = cam.y + cam.height / 2;
    const worldCX = scrollX + cam.width  / 2;
    const worldCY = scrollY + cam.height / 2;

    // Compute world bounds from system positions for the minimap
    let maxWX = 0, maxWY = 0;
    for (const sys of this.systems) {
      if (sys.data.position.x > maxWX) maxWX = sys.data.position.x;
      if (sys.data.position.y > maxWY) maxWY = sys.data.position.y;
    }
    const worldW = maxWX * 1.15;
    const worldH = maxWY * 1.15;

    // Pre-compute threat systems for the minimap threat filter:
    // 2-hop BFS from player systems; enemy systems WITH stationed fleets qualify (spec 034 FR-GMF-008, D-09)
    const _playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';
    const _playerSysIds = new Set(
      this.systems.filter(s => s.data.loyalty === _playerFactionId).map(s => s.data.id)
    );
    // Systems that have at least one stationed (non-transit) fleet
    const _symsWithFleets = new Set();
    if (this.fleetStateManager) {
      for (const fleetList of Object.values(this.fleetStateManager.fleets)) {
        for (const fleet of fleetList) {
          if (!fleet.inTransit && fleet.systemId) _symsWithFleets.add(fleet.systemId);
        }
      }
    }
    // 1-hop and 2-hop expansion
    const _hop1 = new Set();
    for (const sysId of _playerSysIds) {
      const sys = this.systems.find(s => s.data.id === sysId);
      for (const connId of (sys?.data.connections ?? [])) {
        if (!_playerSysIds.has(connId)) _hop1.add(connId);
      }
    }
    const _hop2 = new Set();
    for (const sysId of _hop1) {
      const sys = this.systems.find(s => s.data.id === sysId);
      for (const connId of (sys?.data.connections ?? [])) {
        if (!_playerSysIds.has(connId) && !_hop1.has(connId)) _hop2.add(connId);
      }
    }
    const _threatSysIds = new Set();
    for (const sysId of [..._hop1, ..._hop2]) {
      const sys = this.systems.find(s => s.data.id === sysId);
      if (!sys) continue;
      const loy = sys.data.loyalty;
      const isEnemy = loy && loy !== 'neutral' && loy !== _playerFactionId;
      if (isEnemy && _symsWithFleets.has(sysId)) _threatSysIds.add(sysId);
    }

    const overlays = this.systems.map(sys => {
      // World → screen coordinate transform (zoom-stable)
      const sx = halfW + (sys.data.position.x - worldCX) * zoom;
      const sy = halfH + (sys.data.position.y - worldCY) * zoom;
      const r  = (8 + sys.data.population * 2) * zoom;
      const facState  = this.constructionStateManager?.getSystemState(sys.data.id);
      const prodQueue  = this.fleetStateManager?.productionQueues?.[sys.data.id] ?? [];
      const hasShipyard = facState?.facilities?.some(f => f.facilityId === 'shipyard') ?? false;
      const isOwned     = sys.data.loyalty === _playerFactionId;
      return {
        id:             sys.data.id,
        name:           sys.data.name,
        x:              sx,
        y:              sy,
        wx:             sys.data.position.x,
        wy:             sys.data.position.y,
        radius:         r,
        specialType:    sys.data.specialType ?? null,
        isFogged:       sys.isFogged,
        loyalty:        sys.data.loyalty,
        loyaltyValue:   sys.data.loyaltyValue ?? 75,
        resourceOutput: (sys.data.resources?.credits ?? 0) + (sys.data.resources?.materials ?? 0),
        hasFacilities:  !!(facState?.facilities?.length),
        isThreat:       _threatSysIds.has(sys.data.id),
        hasMission:     this.activeFilter === 'missions' && (this._overlayMissionSystems?.has(sys.data.id) ?? false),
        idleShipyard:   isOwned && hasShipyard && prodQueue.length === 0,
        idleQueue:      isOwned && (facState?.queue?.length ?? 0) === 0,
      };
    });

    // Build per-faction fleet presence (always-on, not filter-dependent)
    // fleetPresence: { systemId: [{ factionId, count }] }
    const fleetPresence = {};
    if (this.fleetStateManager) {
      for (const [factionId, fleetList] of Object.entries(this.fleetStateManager.fleets)) {
        for (const fleet of fleetList) {
          // Fix 5: show player's own in-transit fleets at their current systemId;
          // enemy in-transit fleets stay hidden (fog of war)
          if (fleet.inTransit && factionId !== _playerFactionId) continue;
          const sid = fleet.systemId;
          if (!sid) continue;
          if (!fleetPresence[sid]) fleetPresence[sid] = [];
          const entry = fleetPresence[sid].find(e => e.factionId === factionId);
          if (entry) {
            entry.count += fleet.ships?.length ?? 0;
          } else {
            fleetPresence[sid].push({ factionId, count: fleet.ships?.length ?? 0 });
          }
        }
      }
    }

    // Camera bounds origin (set in setupCamera via setBounds(-padding, ...))
    // The minimap must know the minimum possible scrollX/Y so its coordinate
    // space covers the full scrollable range, including the negative-padding region.
    const boundsMinX = cam._bounds ? cam._bounds.x      : 0;
    const boundsMinY = cam._bounds ? cam._bounds.y      : 0;
    const boundsTotalW = cam._bounds ? cam._bounds.width  : worldW;
    const boundsTotalH = cam._bounds ? cam._bounds.height : worldH;

    window.dispatchEvent(new CustomEvent('galaxy:systemOverlays', {
      detail: {
        overlays,
        zoom,
        filterMode:      this.activeFilter ?? 'none',
        subFilter:       this.activeSubFilter ?? null,
        playerFactionId: _playerFactionId,
        fleetData:       this._overlayFleetData ?? {},
        fleetPresence,
        camera: {
          scrollX,
          scrollY,
          zoom,
          viewW: cam.width,
          viewH: cam.height,
        },
        worldBounds: {
          w:      worldW,
          h:      worldH,
          // Full scrollable range including the bounds padding
          minX:   boundsMinX,
          minY:   boundsMinY,
          totalW: boundsTotalW,
          totalH: boundsTotalH,
        },
      }
    }));
  }

  /**
   * Center camera on system
   * @param {System} system - System to center on
   */
  centerOnSystem(system) {
    const camera = this.cameras.main;
    const pos = system.getPosition();
    
    this.tweens.add({
      targets: camera,
      scrollX: pos.x - camera.width / 2 / camera.zoom,
      scrollY: pos.y - camera.height / 2 / camera.zoom,
      duration: 500,
      ease: 'Power2'
    });
    
    // Zoom in if not already zoomed
    if (camera.zoom < 1.5) {
      camera.zoomTo(1.5, 500);
      this.systems.forEach(s => s.updateVisibility(1.5));
    }
  }

  /**
   * Deselect current system
   */
  deselectSystem() {
    if (this.selectedSystem) {
      this.selectedSystem.deselect();
      this.selectedSystem = null;
      this.events.emit('system-deselected');
      window.dispatchEvent(new CustomEvent('galaxy:panelClose', {
        detail: { panel: 'system' }
      }));
    }
  }

  /**
   * Cycle through player-controlled systems
   */
  cyclePlayerSystems() {
    const playerSystems = this.systems.filter(s => s.data.loyalty === 'brandAuthority');
    if (playerSystems.length === 0) return;
    
    let currentIndex = -1;
    if (this.selectedSystem) {
      currentIndex = playerSystems.findIndex(s => s === this.selectedSystem);
    }
    
    const nextIndex = (currentIndex + 1) % playerSystems.length;
    const nextSystem = playerSystems[nextIndex];
    
    this.onSystemClick(nextSystem);
    this.centerOnSystem(nextSystem);
  }

  buildSectors() {
    // Legacy method - kept for compatibility but not used with galaxy generation
    const labels = [
      'Orion Nexus', 'Andromeda Gate', 'Centauri Hub',
      'Pegasus Array', 'Phoenix Station', 'Draco Outpost',
      'Lyra Complex', 'Cygnus Port', 'Vega Terminal'
    ];

    const grid = { cols: 3, rows: 3 };
    const spacing = { x: 360, y: 205 };
    const offset = { x: 260, y: 135 };

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const idx = r * grid.cols + c;
        const pos = {
          x: offset.x + c * spacing.x,
          y: offset.y + r * spacing.y
        };
        
        const sector = new Sector(
          this,
          pos.x,
          pos.y,
          labels[idx],
          idx
        );
        
        this.sectorList.push(sector);
      }
    }
  }

  buildHUD() {
    // Top bar, end-turn button, and zoom controls are now React components.
    // Phaser listens for actions from React via window events.

    // React → Phaser: submit turn
    window.addEventListener('game:submitTurn', () => {
      if (!this.inputLocked) this.submitActionPhase();
    });

    // React → Phaser: zoom controls
    window.addEventListener('game:zoomIn',     () => this.zoomCamera(0.2));
    window.addEventListener('game:zoomOut',    () => this.zoomCamera(-0.2));
    // 100% step zoom
    window.addEventListener('game:zoomIn100',  () => this.zoomCamera(1.0));
    window.addEventListener('game:zoomOut100', () => this.zoomCamera(-1.0));

    // Emit initial state so React top bar populates immediately
    window.dispatchEvent(new CustomEvent('galaxy:turnUpdate',   { detail: { turn: this.currentTurn } }));
    window.dispatchEvent(new CustomEvent('galaxy:endTurnState', { detail: { status: 'idle' } }));

    // Tooltip is now rendered by React (SystemTooltip component).
    // galaxy:systemHover / galaxy:systemHoverEnd window events drive it.
  }

  /**
   * Zoom camera by delta amount
   * @param {number} delta - Zoom delta
   */
  zoomCamera(delta) {
    const camera = this.cameras.main;
    // Use _targetZoom (set by the wheel handler) so that rapid calls always
    // accumulate from the intended final zoom, not the mid-tween camera.zoom.
    if (this._targetZoom == null) this._targetZoom = camera.zoom;
    this._targetZoom = Phaser.Math.Clamp(this._targetZoom + delta, 0.5, 2.0);
    camera.zoomTo(this._targetZoom, 150);

    // Update system name visibility
    this.systems.forEach(system => system.updateVisibility(this._targetZoom));
  }

  /**
   * Handle system click
   * @param {System} system - Clicked system
   */
  onSystemClick(system) {
    if (this.inputLocked) return; // Block interaction during Resolution / Maintenance phases

    // Deselect previous system
    if (this.selectedSystem && this.selectedSystem !== system) {
      this.selectedSystem.deselect();
    }
    
    // Select new system
    this.selectedSystem = system;
    system.select();
    
    // Enrich connections with resolved names (FR-IP-001)
    const enrichedData = {
      ...system.data,
      connections: (system.data.connections ?? []).map(id => {
        const target = this.galaxy.systems.find(s => s.id === id);
        return { id, name: target?.name ?? id };
      })
    };

    // Emit to Phaser (scene-level listeners)
    this.events.emit('system-selected', enrichedData);

    // Notify React panel manager (FR-IP-008) — include enrichedData so React
    // components don't need a direct Phaser scene reference to receive system data.
    window.dispatchEvent(new CustomEvent('galaxy:panelOpen', {
      detail: { panel: 'system', systemId: system.data.id, systemData: enrichedData }
    }));

    console.log('[MainStage] System selected:', system.data.name);
  }

  onSectorClick(sector) {
    // Legacy method - kept for compatibility
    if (sector.owned) {
      this.flash(sector, 'Already owned', '#8b949e');
      return;
    }

    if (this.playerEnergy >= sector.cost) {
      this.claimSector(sector);
    } else {
      this.flash(sector, 'Need more energy', '#f85149');
    }
  }

  claimSector(sector) {
    // Legacy method - kept for compatibility
    this.playerEnergy -= sector.cost;
    sector.claim();
    this.capturedCount++;
    this.refreshHUD();
    this.flash(sector, `${sector.label} claimed!`, '#3fb950', -70);
    
    if (this.capturedCount === 9) {
      this.showWin();
    }
  }

  flash(target, text, color, offsetY = -60) {
    const x = target.visual?.x || target.data.position.x;
    const y = target.visual?.y || target.data.position.y;
    
    const msg = this.add.text(x, y + offsetY, text, {
      fontSize: '15px', color, fontFamily: 'monospace',
      fontStyle: 'bold', stroke: '#0d1117', strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({
      targets: msg,
      y: y + offsetY - 35,
      alpha: 0,
      duration: 1600,
      onComplete: () => msg.destroy()
    });
  }

  refreshHUD() {
    // Notify React top bar of the new turn number
    window.dispatchEvent(new CustomEvent('galaxy:turnUpdate', { detail: { turn: this.currentTurn } }));
  }

  async persistPlayerData() {
    const player = dataBridge.getPlayer();
    if (!player) return;

    // Save galaxy state
    const galaxyState = {
      seed: this.galaxy.seed,
      size: this.galaxy.size,
      systems: this.galaxy.systems.map(s => ({
        id: s.id,
        loyalty: s.loyalty
      }))
    };

    await dataBridge.storeProgress(player.id, galaxyState, this.playerEnergy);

    // Save resource states for all factions
    const savePromises = Object.entries(this.resourceStates).map(([factionId, rsm]) =>
      dataBridge.saveResourceState(factionId, rsm.serialize())
    );
    await Promise.all(savePromises);

    // Save victory progress for all factions
    if (this.victoryGameState?.factions) {
      const victoryPromises = Object.entries(this.victoryGameState.factions).map(([factionId, faction]) => {
        if (!faction.victoryProgress) return Promise.resolve();
        const serialized = VictoryStateManager.serialize(faction.victoryProgress);
        return dataBridge.saveVictoryState(factionId, serialized);
      });
      await Promise.all(victoryPromises);
    }

    // Save tech state for all factions
    if (Object.keys(this.techStates).length > 0) {
      const techPromises = Object.entries(this.techStates).map(([factionId, tsm]) =>
        dataBridge.saveTechState(factionId, tsm.serialize())
      );
      await Promise.all(techPromises);
    }

    // Save character state for all factions
    if (Object.keys(this.characterStates).length > 0) {
      const charPromises = Object.entries(this.characterStates).map(([factionId, csm]) =>
        dataBridge.saveCharacterState(factionId, csm.serialize())
      );
      await Promise.all(charPromises);
    }

    // Save fleet state (per-faction to match Supabase schema)
    if (this.fleetStateManager) {
      const fleetData = this.fleetStateManager.serialize();
      const FLEET_FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];
      const fleetPromises = FLEET_FACTION_IDS.map(fid => {
        const perFactionData = {
          fleets:           { [fid]: fleetData.fleets?.[fid] ?? [] },
          productionQueues: { [fid]: fleetData.productionQueues?.[fid] ?? {} },
          combatLog:        fleetData.combatLog,
          _fleetIdCounter:  fleetData._fleetIdCounter,
          _shipIdCounter:   fleetData._shipIdCounter,
          _prodSeq:         fleetData._prodSeq,
        };
        return dataBridge.saveFleetState(fid, JSON.stringify(perFactionData));
      });
      await Promise.all(fleetPromises);
    }

    // Save turn phase state (currentTurn inside TurnStateManager serialization)
    if (this.turnStateManager) {
      const turnData = {
        ...this.turnStateManager.serialize(),
        currentTurn:      this.currentTurn,
        initiativeOrder:  this.initiativeEngine?.getOrder()  ?? [],
        initiativeScores: this.initiativeEngine?.serialize()?.scores ?? {}
      };
      await dataBridge.saveTurnState(JSON.stringify(turnData));
    }

    const notice = this.add.text(640, 370, 'DATA PERSISTED', {
      fontSize: '34px', color: '#3fb950', fontFamily: 'monospace',
      fontStyle: 'bold', stroke: '#0d1117', strokeThickness: 7
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150);

    this.tweens.add({
      targets: notice,
      alpha: 0,
      duration: 1700,
      delay: 500,
      onComplete: () => notice.destroy()
    });
  }

  /**
   * Save full game state to a specific slot.
   * Called by the game:saveGame event handler and the auto-save trigger.
   *
   * @param {string} slotId   - 'auto' | '1'–'5'
   * @param {string|null} slotName - Display name; auto-generated if null
   * @returns {{ success: boolean, error?: string }}
   */
  async saveGame(slotId, slotName = null) {
    try {
      const playerFactionId = this.game.registry.get('playerFactionId') ?? 'brandAuthority';
      const defaultName     = `Month ${this.currentTurn}`;
      const resolvedName    = slotName?.trim() || defaultName;

      const snapshot = SaveStateManager.createSnapshot(this, slotId, resolvedName, Array.isArray(window.__alertState) ? window.__alertState : []);
      const result   = await dataBridge.saveGameState(slotId, snapshot);

      if (result.success) {
        console.log(`[MainStage] Game saved to slot "${slotId}" — "${resolvedName}"`);
      }
      return result;
    } catch (err) {
      console.error('[MainStage] saveGame error:', err);
      return { success: false, error: err.message ?? 'Unknown save error.' };
    }
  }

  /**
   * Trigger the auto-save routine at the end of each Maintenance Phase (FR-SG-002).
   * Runs silently; fires a warning notification on failure.
   * @private
   */
  async _autoSave() {
    try {
      const result = await this.saveGame('auto', `Auto-Save Month ${this.currentTurn - 1}`);
      if (!result.success) {
        const msg = `Auto-save failed: ${result.error ?? 'Unknown error'}. Please save manually.`;
        const pfid = this.game.registry.get('playerFactionId') || 'brandAuthority';
        if (this.turnStateManager) this.turnStateManager.recordEvent('maintenance', msg, { urgent: true, factionId: pfid, outcome: 'info', domain: 'resource' });
      } else {
        console.log('[MainStage] Auto-save complete');
      }
    } catch (err) {
      const msg = `Auto-save failed: ${err.message ?? 'Storage error'}. Please save manually.`;
      const pfid = this.game.registry.get('playerFactionId') || 'brandAuthority';
      if (this.turnStateManager) this.turnStateManager.recordEvent('maintenance', msg, { urgent: true, factionId: pfid, outcome: 'info', domain: 'resource' });
    }
  }

  async restorePlayerData() {
    const gameConfig   = this.game.registry.get('gameConfig') ?? {};
    const savedState   = gameConfig.savedState;

    // ── Restore from unified save snapshot (FR-LG-003, FR-LG-004) ──────────
    if (savedState) {
      // Resource states
      const factionIds = Object.keys(this.resourceStates);
      for (const factionId of factionIds) {
        const savedRsm = savedState.resourceStates?.[factionId];
        if (savedRsm) {
          try {
            const rsm = ResourceStateManager.deserialize(savedRsm);
            const caps = rsm.state.resourceCaps;
            for (const [r, v] of Object.entries(rsm.state.resources)) {
              rsm.state.resources[r] = Math.min(v, caps[r] ?? Infinity);
            }
            this.resourceStates[factionId] = rsm;
          } catch (err) {
            console.warn(`[MainStage] Failed to restore resource state from save for ${factionId}:`, err);
          }
        }
      }

      // Victory states
      if (this.victoryGameState?.factions && savedState.victoryStates) {
        for (const factionId of Object.keys(this.victoryGameState.factions)) {
          const savedVictory = savedState.victoryStates[factionId];
          if (savedVictory) {
            try {
              const loaded = VictoryStateManager.deserialize(savedVictory, factionId);
              this.victoryGameState.factions[factionId].victoryProgress = loaded;
            } catch (err) {
              console.warn(`[MainStage] Failed to restore victory state from save for ${factionId}:`, err);
            }
          }
        }
        this._notifyReactVictoryUpdate();
      }

      // Turn state
      const savedTurn = savedState.turnState;
      if (savedTurn) {
        if (typeof savedTurn.currentTurn === 'number' && savedTurn.currentTurn >= 1) {
          this.currentTurn = savedTurn.currentTurn;
          this.refreshHUD();
        }
        if (Array.isArray(savedTurn.initiativeOrder) && savedTurn.initiativeOrder.length > 0) {
          this.initiativeEngine?.deserialize({
            order:  savedTurn.initiativeOrder,
            scores: savedTurn.initiativeScores ?? {}
          });
          if (this.turnResolutionEngine) {
            this.turnResolutionEngine.initiativeOrder = savedTurn.initiativeOrder;
          }
        }
        if (Array.isArray(savedTurn.turnHistory) && savedTurn.turnHistory.length > 0) {
          this.turnStateManager.turnHistory = savedTurn.turnHistory;
          window.dispatchEvent(new CustomEvent('game:turnHistoryRestored', {
            detail: { turnHistory: savedTurn.turnHistory }
          }));
        }
        console.log(`[MainStage] Turn state restored from save — Turn ${this.currentTurn}`);
      }

      // Construction state (specs 017–020) ────────────────────────────────
      if (savedState.constructionState && this.constructionStateManager) {
        try {
          this.constructionStateManager = ConstructionStateManager.deserialize(
            savedState.constructionState,
            ['brandAuthority', 'union', 'autoforge'],
            constructionConfig
          );
          // Re-wire all engines that hold a direct CSM reference
          if (this.constructionEngine)  this.constructionEngine.csm  = this.constructionStateManager;
          if (this.combatEngine)        this.combatEngine.csm        = this.constructionStateManager;
          if (this.groundCombatEngine)  this.groundCombatEngine.csm  = this.constructionStateManager;
          console.log('[MainStage] Construction state restored from save');
        } catch (err) {
          console.warn('[MainStage] Failed to restore construction state from save:', err);
        }
      }

      // Mission state (specs 021–023) ──────────────────────────────────────
      if (savedState.missionState && this.missionStateManager) {
        try {
          this.missionStateManager = MissionStateManager.deserialize(savedState.missionState);
          if (this.turnResolutionEngine) {
            this.turnResolutionEngine.missionStateManager = this.missionStateManager;
          }
          console.log('[MainStage] Mission state restored from save');
        } catch (err) {
          console.warn('[MainStage] Failed to restore mission state from save:', err);
        }
      }

      // Loyalty state (specs 015–016) ──────────────────────────────────────
      if (savedState.loyaltyState && this.loyaltyStateManager) {
        try {
          this.loyaltyStateManager = LoyaltyStateManager.deserialize(
            savedState.loyaltyState,
            this.galaxy.systems,
            ['brandAuthority', 'union', 'autoforge']
          );
          // Re-wire engines that hold a direct LSM reference
          if (this.diplomacyEngine)    this.diplomacyEngine.loyaltyStateManager = this.loyaltyStateManager;
          if (this.groundCombatEngine) this.groundCombatEngine.lsm              = this.loyaltyStateManager;
          console.log('[MainStage] Loyalty state restored from save snapshot');
        } catch (err) {
          console.warn('[MainStage] Failed to restore loyalty state from snapshot:', err);
        }
      }

      // Update captured count based on loaded galaxy loyalty
      const playerFactionId = this.game.registry.get('playerFactionId') || 'brandAuthority';
      this.capturedCount = this.galaxy.systems.filter(s => s.loyalty === playerFactionId).length;
      this.refreshHUD();

      this._notifyReactResourceUpdate();
      console.log('[MainStage] Full game state restored from save');
      return;
    }

    // ── Legacy per-subsystem DataBridge restore (new game) ─────────────────
    const player = dataBridge.getPlayer();
    if (!player) return;

    const saved = await dataBridge.fetchProgress(player.id);
    
    if (saved && saved.systems) {
      // Restore system loyalties
      saved.systems.forEach(savedSystem => {
        const system = this.systems.find(s => s.data.id === savedSystem.id);
        if (system) {
          system.updateLoyalty(savedSystem.loyalty);
        }
      });

      if (typeof saved.energy === 'number') {
        this.playerEnergy = saved.energy;
      }

      // Count player-controlled systems
      this.capturedCount = this.galaxy.systems.filter(s => s.loyalty === 'brandAuthority').length;

      this.refreshHUD();
    }

    // Restore resource states for all factions
    const factionIds = Object.keys(this.resourceStates);
    for (const factionId of factionIds) {
      const serialized = await dataBridge.loadResourceState(factionId);
      if (serialized) {
        try {
          const loaded = ResourceStateManager.deserialize(serialized);
          // Validate resource values within caps (guard against corrupted saves)
          const rsm = loaded;
          const caps = rsm.state.resourceCaps;
          for (const [r, v] of Object.entries(rsm.state.resources)) {
            rsm.state.resources[r] = Math.min(v, caps[r] ?? Infinity);
          }
          this.resourceStates[factionId] = rsm;
          console.log(`[MainStage] Resource state restored for ${factionId}`);
        } catch (err) {
          console.warn(`[MainStage] Failed to restore resource state for ${factionId}:`, err);
        }
      }
    }

    // Restore victory progress for all factions
    if (this.victoryGameState?.factions) {
      for (const factionId of Object.keys(this.victoryGameState.factions)) {
        const serialized = await dataBridge.loadVictoryState(factionId);
        if (serialized) {
          try {
            const loaded = VictoryStateManager.deserialize(serialized, factionId);
            const { valid, missing } = VictoryStateManager.validate(loaded, factionId);
            if (!valid) {
              console.warn(`[MainStage] Victory state for ${factionId} missing keys: ${missing.join(', ')} — re-initializing`);
            }
            this.victoryGameState.factions[factionId].victoryProgress = loaded;
            console.log(`[MainStage] Victory state restored for ${factionId}`);
          } catch (err) {
            console.warn(`[MainStage] Failed to restore victory state for ${factionId}:`, err);
          }
        }
      }
      // Recompute closest victory after load
      this._notifyReactVictoryUpdate();
    }

    // Restore turn state (turn counter + phase)
    const savedTurnState = await dataBridge.loadTurnState();
    if (savedTurnState) {
      try {
        const parsed = JSON.parse(savedTurnState);
        // Restore turn counter (FR-TT-001: must be restored accurately on load)
        if (typeof parsed.currentTurn === 'number' && parsed.currentTurn >= 1) {
          this.currentTurn = parsed.currentTurn;
          this.refreshHUD();
        }
        // Restore initiative order if saved
        if (Array.isArray(parsed.initiativeOrder) && parsed.initiativeOrder.length > 0) {
          this.initiativeEngine?.deserialize({
            order:  parsed.initiativeOrder,
            scores: parsed.initiativeScores ?? {}
          });
          this.turnResolutionEngine && (this.turnResolutionEngine.initiativeOrder = parsed.initiativeOrder);
        }
        console.log(`[MainStage] Turn state restored — Turn ${this.currentTurn}`);
      } catch (err) {
        console.warn('[MainStage] Failed to restore turn state:', err);
      }
    }

    this._notifyReactResourceUpdate();
  }

  showWin() {
    const cx = this.scale.width  / 2;
    const cy = this.scale.height / 2;
    const overlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x0d1117, 0.95)
      .setDepth(100)
      .setScrollFactor(0);

    const winText = this.add.text(cx, cy - 50, 'GALAXY SECURED!', {
      fontSize: '66px', color: '#3fb950', fontFamily: 'monospace',
      fontStyle: 'bold', stroke: '#0d1117', strokeThickness: 8
    }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

    const subText = this.add.text(cx, cy + 30, 'All sectors under your control', {
      fontSize: '24px', color: '#58a6ff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
  }
}
