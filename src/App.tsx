import { useState, useEffect, useCallback } from 'react';
import { LandingPage } from './components/LandingPage.jsx';
import { SystemDetails } from './components/SystemDetails';
import { SystemTooltip } from './components/SystemTooltip';
import { SystemOverlays } from './components/SystemOverlays';
import FactionSelector from './components/FactionSelector';
import { TopBarHUD } from './components/TopBarHUD';
import { LeftSidePanel } from './components/LeftSidePanel';
import { ZoomControlsHUD } from './components/ZoomControlsHUD';
import { MiniMap } from './components/MiniMap';
import { ResourceBreakdown } from './components/ResourceBreakdown';
import { TransactionLog } from './components/TransactionLog';
import { VictoryScreen } from './components/VictoryScreen';
import { VictoryEndScreen } from './components/VictoryEndScreen';
import TechDetailPanel from './components/TechDetailPanel';
import { ResearchSidePanel } from './components/ResearchSidePanel';
import { ActionPhaseSequencer } from './components/ActionPhaseSequencer';
import { ResolutionHUD } from './components/ResolutionHUD';
import { TurnHistoryPanel } from './components/TurnHistoryPanel';
import { SyncTickHUD } from './components/SyncTickHUD';
import { SyncTurnToast } from './components/SyncTurnToast.jsx';
import { MapFilterHUD } from './components/MapFilterHUD';
import { GameSetupScreen } from './components/GameSetupScreen';
import { FleetStatusPanel } from './components/FleetStatusPanel';
import { CharacterRosterPanel } from './components/CharacterRosterPanel';
import { IntelReportsPanel } from './components/IntelReportsPanel';
import { CommandOverviewPanel } from './components/CommandOverviewPanel';
import { ActiveMissionsPanel } from './components/ActiveMissionsPanel';
import { InfoNavHUD } from './components/InfoNavHUD';
import { MainMenu } from './components/MainMenu';
import { SaveLoadScreen } from './components/SaveLoadScreen';
import { EventChoiceModal } from './components/EventChoiceModal';
import { CombatResultModal } from './components/CombatResultModal';
import { InvasionChoiceModal } from './components/InvasionChoiceModal';
import { AssignmentModal } from './components/AssignmentModal';
import { PassDeviceInterstitial } from './components/PassDeviceInterstitial';
import { NetworkLobby } from './components/NetworkLobby';
import { TutorialOverlay } from './components/TutorialOverlay';
import { HelpPanel } from './components/HelpPanel';
import { AlertHistoryPanel } from './components/AlertHistoryPanel.jsx';
import { AudioSettingsPanel } from './components/AudioSettingsPanel';
import { dataBridge } from '../core/data-bridge.js';
import { FactionStateManager } from '../core/faction-state-manager.js';
import { networkSessionManager } from '../core/network-session-manager.js';
import { audioManager } from '../core/audio-manager.js';
import { GameTimeProvider } from './contexts/GameTimeContext.jsx';
import { AlertProvider } from './contexts/AlertContext.jsx';

// Delay to allow smooth transition animation
const AUTH_TRANSITION_DELAY_MS = 600;

// Application flow states
const APP_STATE = {
  AUTH:           'auth',
  MAIN_MENU:      'main_menu',
  FACTION_SELECT: 'faction_select',
  GAME_SETUP:     'game_setup',
  NETWORK_LOBBY:  'network_lobby',
  GAME:           'game'
};

export function App() {
  const [appState, setAppState] = useState(APP_STATE.AUTH);
  const [phaserGame, setPhaserGame] = useState<any>(null);
  const [factionManager, setFactionManager] = useState<any>(null);
  const [playerFactionId, setPlayerFactionId] = useState<any>(null);
  const [selectedFactionDef, setSelectedFactionDef] = useState<any>(null); // held between FACTION_SELECT and GAME_SETUP
  const [pendingGameConfig,  setPendingGameConfig]  = useState<any>(null);  // enriched config held for NETWORK_LOBBY route

  // Save/Load UI state
  const [hasAutoSave,        setHasAutoSave]        = useState(false);
  const [showSaveScreen,     setShowSaveScreen]      = useState(false);
  const [showLoadScreen,     setShowLoadScreen]      = useState(false);
  const [inGameLoadConfirm,  setInGameLoadConfirm]   = useState(false); // confirm before discarding

  // Tutorial & help state
  const [tutorialComplete, setTutorialComplete] = useState(
    () => localStorage.getItem('brandedGalaxy_tutorialComplete') === 'true'
  );
  // true while a tutorial game session is active (suppresses MapFilterHUD)
  const [isTutorial, setIsTutorial] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  // Resource UI overlay state
  const [showBreakdown,    setShowBreakdown]    = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactionLog,   setTransactionLog]   = useState<any[]>([]);

  // Victory UI state
  const [showVictoryScreen, setShowVictoryScreen] = useState(false);
  const [victoryData,       setVictoryData]       = useState<any>(null);  // from galaxy:victoryUpdate
  const [victoryEndData,    setVictoryEndData]     = useState<any>(null);  // from game:victory

  // Alert UI state (spec 063)
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  // Combat result modal state — driven by game:combatResult from Phaser
  const [combatResult, setCombatResult] = useState<any>(null);

  // Tech tree UI state
  const [selectedTech,      setSelectedTech]      = useState<any>(null);   // { tech, nodeState, activeProject }

  // Turn phase state
  const [currentPhase,      setCurrentPhase]      = useState('ACTION'); // from galaxy:phaseStart

  // Current turn
  const [currentTurn, setCurrentTurn] = useState(1);

  // Turn history panel state
  const [showTurnHistory, setShowTurnHistory] = useState(false);
  const [turnHistory,     setTurnHistory]     = useState<any[]>([]);

  // Action staging error toast
  const [stagingError,      setStagingError]      = useState<any>(null);   // string | null

  // Hot-seat interstitial state (spec 049 FR-MP-002)
  // null when hidden; { factionId, playerName, playerNumber, factionName } when visible
  const [hotSeatInterstitial, setHotSeatInterstitial] = useState<any>(null);

  // Info panel — which secondary panel is open ('fleet' | 'characters' | 'intel' | 'system' | null)
  const [activePanel,     setActivePanel]     = useState<any>(null);
  // Tracks whether the SystemDetails panel is visible (managed by SystemDetails itself, mirrored
  // here so InfoNavHUD stays shifted while a second panel is open on top of it).
  const [systemPanelOpen, setSystemPanelOpen] = useState(false);
  const openPanel = useCallback((id: any) => {
    setActivePanel(id ?? null);
    // Notify tutorial engine when a panel is opened
    if (id) {
      window.dispatchEvent(new CustomEvent('galaxy:panelOpen', { detail: { panel: id } }));
    }
  }, []);

  // Audio settings panel (spec 052 FR-AU-005)
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  // Sync mode state (spec 058)
  const [syncModeActive, setSyncModeActive] = useState(false);
  const [isSyncHost,     setIsSyncHost]     = useState(false);

  // Keep transaction log updated whenever resource data arrives
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.transactionLog) {
        setTransactionLog(e.detail.transactionLog);
      }
    };
    window.addEventListener('galaxy:resourceUpdate', handler);
    return () => window.removeEventListener('galaxy:resourceUpdate', handler);
  }, []);

  // Track current turn phase (ACTION / RESOLUTION / MAINTENANCE)
  // Also capture turnHistory when ACTION phase begins
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.phase) {
        setCurrentPhase(e.detail.phase);
      }
      if (e.detail?.phase === 'ACTION' && e.detail?.turnHistory != null) {
        setTurnHistory(e.detail.turnHistory);
      }
    };
    window.addEventListener('galaxy:phaseStart', handler);
    return () => window.removeEventListener('galaxy:phaseStart', handler);
  }, []);

  // Track turn number
  useEffect(() => {
    const handler = (e: any) => setCurrentTurn(e.detail?.turn ?? 1);
    window.addEventListener('galaxy:turnUpdate', handler);
    return () => window.removeEventListener('galaxy:turnUpdate', handler);
  }, []);

  // Restore turn history when a saved game is loaded (history is in the save
  // but isn't propagated via the initial galaxy:phaseStart since TSM is fresh)
  useEffect(() => {
    const handler = (e: any) => {
      if (Array.isArray(e.detail?.turnHistory)) {
        setTurnHistory(e.detail.turnHistory);
      }
    };
    window.addEventListener('game:turnHistoryRestored', handler);
    return () => window.removeEventListener('game:turnHistoryRestored', handler);
  }, []);

  // Sync mode state tracking (spec 058)
  useEffect(() => {
    const handler = (e: any) => {
      setSyncModeActive(e.detail?.active ?? false);
      setIsSyncHost(e.detail?.isHost ?? false);
    };
    window.addEventListener('galaxy:syncModeChanged', handler);
    return () => window.removeEventListener('galaxy:syncModeChanged', handler);
  }, []);

  // Listen for action staging errors (budget over-run, AP exhausted, etc.)
  useEffect(() => {
    const handler = (e: any) => {
      const msg = e.detail?.message ?? (e.detail?.conflicts ?? []).join('; ') ?? 'Action not allowed';
      setStagingError(msg);
      // Auto-dismiss after 3 s
      setTimeout(() => setStagingError(null), 3000);
    };
    window.addEventListener('galaxy:stagingError', handler);
    return () => window.removeEventListener('galaxy:stagingError', handler);
  }, []);

  // Listen for victory progress updates from Phaser
  useEffect(() => {
    const handler = (e: any) => setVictoryData(e.detail ?? null);
    window.addEventListener('galaxy:victoryUpdate', handler);
    return () => window.removeEventListener('galaxy:victoryUpdate', handler);
  }, []);

  // Listen for game:victory (end-game event)
  useEffect(() => {
    const handler = (e: any) => {
      setVictoryEndData(e.detail ?? null);
    };
    window.addEventListener('game:victory', handler);
    return () => window.removeEventListener('game:victory', handler);
  }, []);

  // Sync activePanel with Phaser panel events
  useEffect(() => {
    const onOpen  = (e: any) => {
      if (e.detail?.panel === 'system') setSystemPanelOpen(true);
      setActivePanel(e.detail?.panel ?? null);
    };
    const onClose = (e: any) => {
      if (!e.detail?.panel || e.detail.panel === 'system') setSystemPanelOpen(false);
      setActivePanel((prev: any) =>
        prev === (e.detail?.panel ?? 'system') ? null : prev
      );
    };
    window.addEventListener('galaxy:panelOpen',  onOpen);
    window.addEventListener('galaxy:panelClose', onClose);
    return () => {
      window.removeEventListener('galaxy:panelOpen',  onOpen);
      window.removeEventListener('galaxy:panelClose', onClose);
    };
  }, []);

  // Hot-seat: show Pass Device interstitial between players (spec 049 FR-MP-002)
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e.detail ?? {};
      // Update which faction the React HUD reflects (their resources, etc.)
      if (detail.factionId) setPlayerFactionId(detail.factionId);
      // Show the interstitial overlay
      setHotSeatInterstitial({
        factionId:    detail.factionId,
        playerName:   detail.playerName,
        playerNumber: detail.playerNumber,
        factionName:  detail.factionName,
      });
    };
    window.addEventListener('galaxy:hotSeatNextPlayer', handler);
    return () => window.removeEventListener('galaxy:hotSeatNextPlayer', handler);
  }, []);

  // V key toggles victory screen
  useEffect(() => {
    if (appState !== APP_STATE.GAME) return;
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === 'v' || e.key === 'V') && !victoryEndData) {
        setShowVictoryScreen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState, victoryEndData]);

  // I key toggles Intel Reports panel (FR-IR-001)
  useEffect(() => {
    if (appState !== APP_STATE.GAME) return;
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey) {
        setActivePanel((prev: any) => prev === 'intel' ? null : 'intel');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState]);

  // F key toggles Fleet Status panel
  useEffect(() => {
    if (appState !== APP_STATE.GAME) return;
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        setActivePanel((prev: any) => {
          const next = prev === 'fleet' ? null : 'fleet';
          if (next) window.dispatchEvent(new CustomEvent('galaxy:panelOpen', { detail: { panel: next } }));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState]);

  // R key toggles Research panel
  useEffect(() => {
    if (appState !== APP_STATE.GAME) return;
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        setActivePanel((prev: any) => {
          const next = prev === 'research' ? null : 'research';
          if (next) window.dispatchEvent(new CustomEvent('galaxy:panelOpen', { detail: { panel: next } }));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState]);

  const handleAuthSuccess = () => {
    setTimeout(async () => {
      // Check for auto-save to show Continue button (FR-LG-005)
      const autoSave = await dataBridge.loadGameState('auto');
      setHasAutoSave(!!autoSave);
      setAppState(APP_STATE.MAIN_MENU);
    }, AUTH_TRANSITION_DELAY_MS);
  };

  const handleFactionSelected = (factionDefinition: any) => {
    // Hold faction definition until game-setup screen confirms
    setSelectedFactionDef(factionDefinition);
    setAppState(APP_STATE.GAME_SETUP);
  };

  const handleGameSetupConfirmed = async (enrichedGameConfig: any) => {
    // Spec 057: Attach user identity fields for SessionPresenceManager init
    enrichedGameConfig.userId      = dataBridge.currentPlayer?.id ?? 'local';
    enrichedGameConfig.displayName = enrichedGameConfig.playerNames?.[selectedFactionDef?.id] ?? 'Player';
    enrichedGameConfig.gameId      = enrichedGameConfig.gameId ?? null; // will be set by network lobby or default to 'local-solo'

    // Network modes go to the lobby screen; GameSetupScreen already includes
    // the pre-generated galaxy in enrichedGameConfig so all data is available.
    if (enrichedGameConfig.gameMode?.startsWith('network-')) {
      setPendingGameConfig(enrichedGameConfig);
      setAppState(APP_STATE.NETWORK_LOBBY);
      return;
    }

    const factionDefinition = selectedFactionDef;

    // Initialize faction state manager
    const manager = new FactionStateManager(factionDefinition);
    setFactionManager(manager);
    setPlayerFactionId(factionDefinition.id);

    // Persist faction selection
    await dataBridge.saveFactionState(factionDefinition.id, manager.serialize());

    // Transition to game
    setAppState(APP_STATE.GAME);

    // Start Phaser game with the fully-enriched config (includes preGeneratedGalaxy)
    if (window.startPhaserGame) {
      const game = window.startPhaserGame(factionDefinition.id, enrichedGameConfig);
      setPhaserGame(game);
    }
  };

  /**
   * Launch tutorial mode — uses the tutorial scenario and skips faction/setup screens.
   */
  const launchTutorial = useCallback(() => {
    if (phaserGame) {
      phaserGame.destroy(true);
      setPhaserGame(null);
    }
    setPlayerFactionId('brandAuthority');
    setAppState(APP_STATE.GAME);
    setIsTutorial(true);
    if (window.startPhaserGame) {
      const game = window.startPhaserGame('brandAuthority', {
        isTutorial: true,
        gameMode: 'single-1p',
        aiDifficulty: 'easy',
      });
      setPhaserGame(game);
    }
  }, [phaserGame]);

  /**
   * Launch (or relaunch) the Phaser game from a loaded save snapshot.
   * Destroys the current Phaser instance if one is running, then restarts.
   * @param {Object} saveData - Snapshot from SaveStateManager / DataBridge
   */
  const launchFromSave = useCallback((saveData: any) => {
    // Tear down existing Phaser game if present
    if (phaserGame) {
      phaserGame.destroy(true);
      setPhaserGame(null);
    }

    const factionId  = saveData.factionId  ?? 'brandAuthority';
    const gameConfig = { ...(saveData.gameConfig ?? {}), savedState: saveData };

    setPlayerFactionId(factionId);
    setAppState(APP_STATE.GAME);
    setShowLoadScreen(false);
    setInGameLoadConfirm(false);

    if (window.startPhaserGame) {
      const game = window.startPhaserGame(factionId, gameConfig);
      setPhaserGame(game);
    }
  }, [phaserGame]);

  // Return to main menu from in-game menu (TopBarHUD hamburger)
  const handleReturnToMenu = useCallback(() => {
    if (phaserGame) { phaserGame.destroy(true); setPhaserGame(null); }
    setAppState(APP_STATE.MAIN_MENU);
    dataBridge.loadGameState('auto').then(s => setHasAutoSave(!!s));
  }, [phaserGame]);

  // Listen for Phaser → React "open save menu" event (FR-SG-001)
  useEffect(() => {
    const handler = () => setShowSaveScreen(true);
    window.addEventListener('game:openSaveMenu', handler);
    return () => window.removeEventListener('game:openSaveMenu', handler);
  }, []);

  // Listen for Phaser → React "open load menu" event (in-game pause)
  useEffect(() => {
    const handler = () => setInGameLoadConfirm(true);
    window.addEventListener('game:openLoadMenu', handler);
    return () => window.removeEventListener('game:openLoadMenu', handler);
  }, []);

  // Persist tutorial completion when the engine fires galaxy:tutorialComplete
  useEffect(() => {
    const handler = () => {
      localStorage.setItem('brandedGalaxy_tutorialComplete', 'true');
      setTutorialComplete(true);
    };
    window.addEventListener('galaxy:tutorialComplete', handler);
    return () => window.removeEventListener('galaxy:tutorialComplete', handler);
  }, []);

  // Block Phaser input while the in-game load-confirm dialog is visible
  useEffect(() => {
    if (!inGameLoadConfirm) return;
    window.dispatchEvent(new CustomEvent('game:uiLayerOpen'));
    return () => {
      window.dispatchEvent(new CustomEvent('game:uiLayerClose'));
    };
  }, [inGameLoadConfirm]);

  // Listen for combat results from Phaser — show CombatResultModal for player-involved combats only
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e.detail ?? null;
      if (!detail) return;
      // Only show the modal when the player's faction is a combatant
      const { playerFactionId: pfid, attackerFactionId, defenderFactionId } = detail;
      if (pfid && pfid !== attackerFactionId && pfid !== defenderFactionId) return;
      setCombatResult(detail);
    };
    window.addEventListener('game:combatResult', handler);
    return () => window.removeEventListener('game:combatResult', handler);
  }, []);

  // ? / F1 key toggles HelpPanel (only during GAME state)
  useEffect(() => {
    if (appState !== APP_STATE.GAME) return;
    const handler = (e: any) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.key === '?' || e.key === 'F1') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowHelpPanel(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState]);

  return (
    <div id="galaxy-app">
      {appState === APP_STATE.AUTH && (
        <LandingPage onAuthSuccess={handleAuthSuccess} />
      )}
      {appState === APP_STATE.MAIN_MENU && (
        <MainMenu
          hasAutoSave={hasAutoSave}
          tutorialComplete={tutorialComplete}
          onContinue={async () => {
            audioManager.playUIClick();
            const saveData = await dataBridge.loadGameState('auto');
            if (saveData) launchFromSave(saveData);
          }}
          onNewGame={() => { audioManager.playUIClick(); setAppState(APP_STATE.FACTION_SELECT); }}
          onLoadGame={() => { audioManager.playUIClick(); setShowLoadScreen(true); }}
          onTutorial={() => { audioManager.playUIClick(); launchTutorial(); }}
          onAudioSettings={() => { audioManager.playUIClick(); setShowAudioSettings(s => !s); }}
        />
      )}
      {/* Audio settings panel — accessible from main menu (spec 052 FR-AU-005) */}
      {appState === APP_STATE.MAIN_MENU && showAudioSettings && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 600 }}>
          <AudioSettingsPanel onClose={() => setShowAudioSettings(false)} />
        </div>
      )}
      {/* Load Game screen shown from main menu */}
      {appState === APP_STATE.MAIN_MENU && showLoadScreen && (
        <SaveLoadScreen
          mode="load"
          onClose={() => setShowLoadScreen(false)}
          onLoaded={(saveData: any) => launchFromSave(saveData)}
        />
      )}
      {appState === APP_STATE.FACTION_SELECT && (
        <FactionSelector onFactionSelected={handleFactionSelected} />
      )}
      {appState === APP_STATE.GAME_SETUP && selectedFactionDef && (
        <GameSetupScreen
          factionDef={selectedFactionDef}
          onConfirm={handleGameSetupConfirmed}
        />
      )}
      {appState === APP_STATE.NETWORK_LOBBY && selectedFactionDef && pendingGameConfig && (
        <NetworkLobby
          gameConfig={pendingGameConfig}
          factionDef={selectedFactionDef}
          playerName={pendingGameConfig.playerNames?.[selectedFactionDef.id] ?? 'Player 1'}
          onGameStart={async (enrichedConfig: any) => {
            const factionDefinition = selectedFactionDef;
            const manager = new FactionStateManager(factionDefinition);
            setFactionManager(manager);
            setPlayerFactionId(factionDefinition.id);
            await dataBridge.saveFactionState(factionDefinition.id, manager.serialize());
            setAppState(APP_STATE.GAME);
            if (window.startPhaserGame) {
              const game = window.startPhaserGame(factionDefinition.id, enrichedConfig);
              setPhaserGame(game);
            }
          }}
          onBack={() => setAppState(APP_STATE.GAME_SETUP)}
        />
      )}
      {appState === APP_STATE.GAME && phaserGame && (
        <AlertProvider playerFactionId={playerFactionId}>
        <GameTimeProvider>
          <SystemDetails phaserGame={phaserGame} />
          <SystemTooltip />
          <SystemOverlays />

          {/* ── Consolidated top bar (Turn, Resources, Victory, Bell, Audio, Menu) */}
          <TopBarHUD
            playerFactionId={playerFactionId}
            onOpenBreakdown={() => setShowBreakdown(true)}
            onOpenVictoryScreen={() => setShowVictoryScreen(true)}
            onReturnToMenu={handleReturnToMenu}
            onOpenTurnHistory={() => { audioManager.playUIClick(); setShowTurnHistory(true); }}
            onOpenAlertHistory={() => { audioManager.playUIClick(); setShowAlertHistory(true); }}
          />

          {/* Resource breakdown modal */}
          {showBreakdown && (
            <ResourceBreakdown
              onClose={() => setShowBreakdown(false)}
              onOpenTransactionLog={() => {
                setShowBreakdown(false);
                setShowTransactions(true);
              }}
            />
          )}

          {/* Transaction log modal */}
          {showTransactions && (
            <TransactionLog
              transactions={transactionLog}
              onClose={() => setShowTransactions(false)}
            />
          )}

          {/* Full victory progress screen (V key or click in top bar) */}
          {showVictoryScreen && !victoryEndData && (
            <VictoryScreen
              onClose={() => setShowVictoryScreen(false)}
              playerFactionId={playerFactionId ?? victoryData?.playerFactionId}
              allFactions={victoryData?.allFactions ?? {}}
              currentTurn={Math.max(currentTurn ?? 1, victoryData?.currentTurn ?? 1)}
              gameState={null}
            />
          )}

          {/* End-game screen */}
          {victoryEndData && (
            <VictoryEndScreen
              winner={victoryEndData}
              playerFactionId={playerFactionId ?? victoryData?.playerFactionId}
              allFactions={victoryData?.allFactions ?? {}}
              finalStats={victoryEndData?.finalStats}
              onContinue={() => setVictoryEndData(null)}
              onReturnToMenu={() => {
                setVictoryEndData(null);
                if (phaserGame) { phaserGame.destroy(true); setPhaserGame(null); }
                setAppState(APP_STATE.MAIN_MENU);
                // Refresh auto-save status for main menu
                dataBridge.loadGameState('auto').then(s => setHasAutoSave(!!s));
              }}
            />
          )}

          {/* Research progress and queue are inside ResearchSidePanel (R key or tab) */}

          {/* Tech detail panel */}
          {selectedTech && playerFactionId && (
            <TechDetailPanel
              factionId={playerFactionId}
              tech={selectedTech.tech}
              techNodeState={selectedTech.nodeState}
              activeProject={selectedTech.activeProject}
              onClose={() => setSelectedTech(null)}
            />
          )}

          {/* Sequential alert sequencer: criticals → turn summary */}
          <ActionPhaseSequencer />

          {/* Resolution phase step-by-step presenter (fleet moves, combats, missions…) */}
          <ResolutionHUD />

          {/* Combat result overlay — shows detailed result; dismissed independently of ResolutionHUD */}
          <CombatResultModal
            combatResult={combatResult}
            onDismiss={() => {
              setCombatResult(null);
              window.dispatchEvent(new CustomEvent('galaxy:combatResultDismissed'));
            }}
          />

          {/* Left-side panel containing initiative and action limits */}
          <LeftSidePanel playerFactionId={playerFactionId} />

          {/* Sync mode tick counter, speed controls, turn progress (spec 058) */}
          {syncModeActive && <SyncTickHUD isHost={isSyncHost} />}

          {/* Sync mode turn summary toasts (spec 062 FR-UTD-010) */}
          {syncModeActive && <SyncTurnToast />}

          {/* Galaxy-map filter toolbar — hidden during resolution/maintenance so it doesn't
              interfere with navigating through the resolution phase menus */}
          {currentPhase === 'ACTION' && !isTutorial && <MapFilterHUD />}

          {/* Blocking overlay during resolution/maintenance — sits above all normal HUDs
              (z-index < 600) but below ResolutionHUD + TurnSummaryHUD, so only resolution
              controls remain interactive. */}
          {currentPhase !== 'ACTION' && (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 595,
              pointerEvents: 'all',
              cursor: 'default',
              background: 'transparent',
            }} />
          )}

          {/* Zoom in/out controls + Galaxy overview mini-map — combined panel */}
          <div className="map-nav-panel">
            <MiniMap />
            <ZoomControlsHUD />
          </div>

          {/* Notification system now embedded in top bar */}
          
          {/* Fleet / Character / Intel / Command Overview info panels */}
          {activePanel === 'fleet'           && <FleetStatusPanel       onClose={() => openPanel(null)} />}
          {activePanel === 'characters'      && <CharacterRosterPanel   onClose={() => openPanel(null)} playerFactionId={playerFactionId} />}
          {activePanel === 'intel'           && <IntelReportsPanel      onClose={() => openPanel(null)} playerFactionId={playerFactionId} />}
          {activePanel === 'commandOverview' && <CommandOverviewPanel   onClose={() => openPanel(null)} playerFactionId={playerFactionId} />}
          {activePanel === 'missions'        && <ActiveMissionsPanel    onClose={() => openPanel(null)} playerFactionId={playerFactionId} />}
          {activePanel === 'research'        && playerFactionId && (
            <ResearchSidePanel
              factionId={playerFactionId}
              onClose={() => openPanel(null)}
              onSelectTech={(tech: any, nodeState: any, activeProject: any) => setSelectedTech({ tech, nodeState, activeProject })}
            />
          )}

          {/* Side nav — Characters and Intel access buttons */}
          <InfoNavHUD onOpenPanel={openPanel} panelOpen={activePanel !== null || systemPanelOpen} />

          {/* Staging error toast */}
          {stagingError && (
            <div style={{
              position: 'fixed',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(248,81,73,0.15)',
              border: '1px solid #f85149',
              borderRadius: '6px',
              padding: '8px 20px',
              color: '#f85149',
              fontSize: '13px',
              fontFamily: 'monospace',
              zIndex: 500,
              pointerEvents: 'none',
            }}>
              {stagingError}
            </div>
          )}

          {/* In-game Save Game overlay (triggered by Phaser [SAVE] button) */}
          {showSaveScreen && (
            <SaveLoadScreen
              mode="save"
              onClose={() => setShowSaveScreen(false)}
              onLoaded={() => {}}
            />
          )}

          {/* In-game Load Game — confirm before discarding unsaved progress */}
          {inGameLoadConfirm && !showLoadScreen && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(13,17,23,0.88)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 700,
              fontFamily: 'monospace',
            }}>
              <div style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                padding: '28px 36px',
                textAlign: 'center',
                color: '#c9d1d9',
                maxWidth: '400px',
              }}>
                <p style={{ marginTop: 0, lineHeight: 1.6 }}>
                  Abandon the current game and load a save?<br />
                  <span style={{ color: '#f85149', fontSize: '13px' }}>
                    Unsaved progress will be lost.
                  </span>
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    style={{ fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer',
                      background: 'rgba(88,166,255,0.1)', border: '1px solid #58a6ff',
                      color: '#58a6ff', borderRadius: '4px', padding: '8px 20px' }}
                    onClick={() => { setInGameLoadConfirm(false); setShowLoadScreen(true); }}
                  >Load Game</button>
                  <button
                    style={{ fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer',
                      background: 'transparent', border: '1px solid #484f58',
                      color: '#8b949e', borderRadius: '4px', padding: '8px 20px' }}
                    onClick={() => setInGameLoadConfirm(false)}
                  >Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* In-game Load Screen (after confirmation) */}
          {showLoadScreen && appState === APP_STATE.GAME && (
            <SaveLoadScreen
              mode="load"
              onClose={() => setShowLoadScreen(false)}
              onLoaded={(saveData: any) => launchFromSave(saveData)}
            />
          )}

          {/* Event choice modal — blocks input until player resolves the event */}
          <EventChoiceModal />

          {/* Turn history panel — opened via turn number button in TopBarHUD */}
          {showTurnHistory && (
            <TurnHistoryPanel
              turnHistory={turnHistory}
              onClose={() => setShowTurnHistory(false)}
              playerFactionId={playerFactionId}
            />
          )}

          {/* Invasion choice modal — Invade vs Blockade decision after winning space combat */}
          <InvasionChoiceModal />

          {/* Character assignment modal — Fleet, Facility, Mission, Unassign tabs (spec 010 FR-CA-006) */}
          <AssignmentModal />

          {/* Tutorial overlay — lower-left, above the minimap, non-blocking */}
          <TutorialOverlay
            onNewGame={() => {
              if (phaserGame) { phaserGame.destroy(true); setPhaserGame(null); }
              setIsTutorial(false);
              setAppState(APP_STATE.FACTION_SELECT);
            }}
            onReturnToMenu={() => {
              if (phaserGame) { phaserGame.destroy(true); setPhaserGame(null); }
              setIsTutorial(false);
              setAppState(APP_STATE.MAIN_MENU);
              dataBridge.loadGameState('auto').then(s => setHasAutoSave(!!s));
            }}
            onReplay={() => launchTutorial()}
            onComplete={() => {
              localStorage.setItem('brandedGalaxy_tutorialComplete', 'true');
              setTutorialComplete(true);
              setIsTutorial(false);
            }}
          />

          {/* Hot-seat Pass Device interstitial (spec 049 FR-MP-002) */}
          {hotSeatInterstitial && (
            <PassDeviceInterstitial
              playerName={hotSeatInterstitial.playerName}
              playerNumber={hotSeatInterstitial.playerNumber}
              factionName={hotSeatInterstitial.factionName}
              onReady={() => setHotSeatInterstitial(null)}
            />
          )}

          {/* Help button — always accessible during game */}
          <button
            className="help-open-btn"
            onClick={() => setShowHelpPanel(true)}
            title="Help (? or F1)"
            style={{
              position: 'fixed',
              bottom: '16px',
              right: '16px',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'rgba(22,27,34,0.9)',
              border: '1px solid #30363d',
              color: '#8b949e',
              fontFamily: 'monospace',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              zIndex: 400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ?
          </button>

          {/* Help panel modal */}
          {showHelpPanel && (
            <HelpPanel isOpen={showHelpPanel} onClose={() => setShowHelpPanel(false)} />
          )}

          {/* Alert history panel (spec 063) */}
          {showAlertHistory && (
            <AlertHistoryPanel onClose={() => setShowAlertHistory(false)} />
          )}
        </GameTimeProvider>
        </AlertProvider>
      )}
    </div>
  );
}
