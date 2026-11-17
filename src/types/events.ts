/**
 * Typed CustomEvent detail shapes for the window event bus.
 *
 * Usage:
 *   const handler = (e: Event) => {
 *     const { detail } = e as CustomEvent<GalaxyResourceUpdateDetail>;
 *   };
 *
 * Or use the typed window overloads below with window.addEventListener<K>.
 */

import type {
  FactionId,
  SystemId,
  FleetId,
  CharacterId,
  MissionId,
  TechId,
  ResourceMap,
  CombatResult,
  Fleet,
  Character,
  FacilityInstance,
  MissionResult,
  TechNode,
  Alert,
  GameMode,
  TurnPhase,
  VictoryConditionProgress,
  GameConfig,
} from './game-objects.js';

// ─── galaxy:* event details ──────────────────────────────────────────────────

export interface GalaxyResourceUpdateDetail {
  factionId:       FactionId;
  resources:       ResourceMap;
  resourceCaps?:   ResourceMap;
  queuedSpending?: ResourceMap;
  currentPhase?:   TurnPhase;
  availableChars?: number;
  totalChars?:     number;
  fleetsWithOrders?: number;
  totalFleets?:    number;
  hasStagedActions?: boolean;
}

export interface GalaxyPhaseStartDetail {
  phase:    TurnPhase;
  turn:     number;
  factionId: FactionId;
}

export interface GalaxyTurnUpdateDetail {
  turn: number;
}

export interface GalaxyEndTurnStateDetail {
  status: 'idle' | 'resolving' | 'submitted' | 'sync';
}

export interface GalaxySyncModeChangedDetail {
  active:  boolean;
  isHost:  boolean;
  paused?: boolean;
}

export interface GalaxySyncPauseChangedDetail {
  paused: boolean;
}

export interface GalaxySyncTickUpdateDetail {
  tickNumber:     number;
  ticksPerSecond: number;
  timePerTick:    number;
  ticksPerTurn:   number;
  tickInTurn:     number;
}

export interface GalaxySyncTurnSummaryDetail {
  turn:      number;
  factionId: FactionId;
  summary:   string[];
}

export interface GalaxyVictoryUpdateDetail {
  updates: VictoryConditionProgress[];
}

export interface GalaxyStagingErrorDetail {
  message: string;
  code?:   string;
}

export interface GalaxyHotSeatNextPlayerDetail {
  factionId:   FactionId;
  factionName: string;
  turn:        number;
  isHost?:     boolean;
}

export interface GalaxyPanelOpenDetail {
  panel: string;
}

export interface GalaxyPanelCloseDetail {
  panel: string;
}

export interface GalaxyNotifyDetail {
  message:   string;
  tier?:     'info' | 'warning' | 'critical';
  locationId?: string;
  locationCategory?: string;
}

export interface GalaxyChoiceEventDetail {
  eventId:     string;
  title:       string;
  description: string;
  choices:     Array<{ id: string; label: string; description?: string }>;
  factionId:   FactionId;
}

export interface GalaxyChoiceEventResolvedDetail {
  eventId:     string;
  choiceIndex: number;
  choiceId:    string;
}

export interface GalaxyInvasionChoiceRequestDetail {
  systemId:   SystemId;
  systemName: string;
  factionId:  FactionId;
}

export interface GalaxyInvasionChoiceResolvedDetail {
  systemId: SystemId;
  choice:   string;
}

export interface GalaxyStageActionDetail {
  type:      string;
  payload:   Record<string, unknown>;
  factionId: FactionId;
}

export interface GalaxyStageActionResultDetail {
  success:   boolean;
  type:      string;
  payload:   Record<string, unknown>;
  error?:    string;
}

export interface GalaxyUnstageActionDetail {
  type:      string;
  payload:   Record<string, unknown>;
  factionId: FactionId;
}

export interface GalaxyNavigateToDetail {
  systemId: SystemId;
}

export interface GalaxyNavigateToWorldDetail {
  x: number;
  y: number;
}

export interface GalaxyApplyFilterDetail {
  mode:      string;
  subFilter: string | null;
}

export interface GalaxyResolutionStepStartDetail {
  step:        string;
  description: string;
  canSkip:     boolean;
}

export interface GalaxyGameStatusUpdateDetail {
  status:   string;
  gameId:   string;
  factionId: FactionId;
  turn:     number;
}

export interface GalaxyPlayerAlertDetail extends Omit<Alert, 'id' | 'timestamp'> {
  // dispatched from Phaser; id and timestamp assigned by AlertContext
}

export interface GalaxyTutorialCompleteDetail {
  scenarioId?: string;
}

// ─── game:* event details ────────────────────────────────────────────────────

export interface GameCombatResultDetail extends CombatResult {
  // merged shape
}

export interface GameCombatFlashDetail {
  systemId:   SystemId;
  systemName: string;
  attackerFactionId: FactionId;
  defenderFactionId: FactionId;
}

export interface GameSystemCapturedDetail {
  systemId:   SystemId;
  systemName: string;
  newOwnerId: FactionId;
  oldOwnerId: FactionId | null;
}

export interface GameFleetMovedDetail {
  fleetId:         FleetId;
  factionId:       FactionId;
  fromSystemId:    SystemId;
  toSystemId:      SystemId;
  remainingMoves?: number;
}

export interface GameTechCompletedDetail {
  techId:    TechId;
  tech?:     TechNode;
  factionId: FactionId;
}

export interface GameVictoryDetail {
  factionId:    FactionId;
  factionName:  string;
  condition:    string;
  conditionLabel: string;
  turn:         number;
}

export interface GameTurnHistoryRestoredDetail {
  history: unknown[];
}

export interface GameSaveGameDetail {
  slot?: string | number;
}

export interface GameSaveGameResultDetail {
  success: boolean;
  error?:  string;
  slot?:   string | number;
}

export interface GameOpenAssignmentModalDetail {
  characterId: CharacterId;
  factionId:   FactionId;
  initialTab?: string;
}

export interface GameRequestCharacterUpdateDetail {
  factionId: FactionId;
}

export interface GameCharacterUpdateDetail {
  factionId:  FactionId;
  characters: Character[];
}

export interface GameMissionUpdateDetail {
  factionId:   FactionId;
  missions:    MissionResult[];
  activeMissions?: unknown[];
}

export interface GameFleetUpdateDetail {
  factionId: FactionId;
  fleets:    Fleet[];
}

export interface GameConstructionUpdateDetail {
  factionId:  FactionId;
  facilities: FacilityInstance[];
  queue?:     unknown[];
}

export interface GameChangeSyncSpeedDetail {
  speed: number;
}

export interface GameRequestGameStatusDetail {
  factionId?: FactionId;
}

export interface GameRevoltEndedDetail {
  systemId:   SystemId;
  systemName: string;
  factionId:  FactionId;
}

export interface GameIntelUpdateDetail {
  factionId: FactionId;
}

// ─── session:* event details ─────────────────────────────────────────────────

export interface SessionGameStatusChangedDetail {
  status:   string;
  gameId:   string;
  gameMode: GameMode;
}

export interface SessionAllOrdersSubmittedDetail {
  turn:      number;
  factionId: FactionId;
}

export interface SessionHostElectedDetail {
  factionId: FactionId;
  isHost:    boolean;
}

// ─── alertPanel:* event details ──────────────────────────────────────────────

// alertPanel:closed — no detail payload

// ─── Window event map ────────────────────────────────────────────────────────
// Extend this to get typed overloads for window.addEventListener.

export interface WindowGameEventMap {
  // galaxy
  'galaxy:resourceUpdate':        CustomEvent<GalaxyResourceUpdateDetail>;
  'galaxy:phaseStart':            CustomEvent<GalaxyPhaseStartDetail>;
  'galaxy:turnUpdate':            CustomEvent<GalaxyTurnUpdateDetail>;
  'galaxy:endTurnState':          CustomEvent<GalaxyEndTurnStateDetail>;
  'galaxy:syncModeChanged':       CustomEvent<GalaxySyncModeChangedDetail>;
  'galaxy:syncPauseChanged':      CustomEvent<GalaxySyncPauseChangedDetail>;
  'galaxy:syncTickUpdate':        CustomEvent<GalaxySyncTickUpdateDetail>;
  'galaxy:syncTurnSummary':       CustomEvent<GalaxySyncTurnSummaryDetail>;
  'galaxy:victoryUpdate':         CustomEvent<GalaxyVictoryUpdateDetail>;
  'galaxy:stagingError':          CustomEvent<GalaxyStagingErrorDetail>;
  'galaxy:hotSeatNextPlayer':     CustomEvent<GalaxyHotSeatNextPlayerDetail>;
  'galaxy:panelOpen':             CustomEvent<GalaxyPanelOpenDetail>;
  'galaxy:panelClose':            CustomEvent<GalaxyPanelCloseDetail>;
  'galaxy:notify':                CustomEvent<GalaxyNotifyDetail>;
  'galaxy:choiceEvent':           CustomEvent<GalaxyChoiceEventDetail>;
  'galaxy:choiceEventResolved':   CustomEvent<GalaxyChoiceEventResolvedDetail>;
  'galaxy:invasionChoiceRequest': CustomEvent<GalaxyInvasionChoiceRequestDetail>;
  'galaxy:invasionChoiceResolved':CustomEvent<GalaxyInvasionChoiceResolvedDetail>;
  'galaxy:stageAction':           CustomEvent<GalaxyStageActionDetail>;
  'galaxy:stageActionResult':     CustomEvent<GalaxyStageActionResultDetail>;
  'galaxy:unstageAction':         CustomEvent<GalaxyUnstageActionDetail>;
  'galaxy:navigateTo':            CustomEvent<GalaxyNavigateToDetail>;
  'galaxy:navigateToWorld':       CustomEvent<GalaxyNavigateToWorldDetail>;
  'galaxy:applyFilter':           CustomEvent<GalaxyApplyFilterDetail>;
  'galaxy:resolutionStepStart':   CustomEvent<GalaxyResolutionStepStartDetail>;
  'galaxy:resolutionContinue':    CustomEvent<never>;
  'galaxy:resolutionSkipAll':     CustomEvent<never>;
  'galaxy:resolutionPhaseEnd':    CustomEvent<never>;
  'galaxy:turnSubmitted':         CustomEvent<never>;
  'galaxy:combatResultDismissed': CustomEvent<never>;
  'galaxy:requestResourceUpdate': CustomEvent<never>;
  'galaxy:requestFleetUpdate':    CustomEvent<never>;
  'galaxy:intelUpdate':           CustomEvent<GameIntelUpdateDetail>;
  'galaxy:gameStatusUpdate':      CustomEvent<GalaxyGameStatusUpdateDetail>;
  'galaxy:playerAlert':           CustomEvent<GalaxyPlayerAlertDetail>;
  'galaxy:tutorialComplete':      CustomEvent<GalaxyTutorialCompleteDetail>;
  // game
  'game:combatResult':            CustomEvent<GameCombatResultDetail>;
  'game:combatFlash':             CustomEvent<GameCombatFlashDetail>;
  'game:systemCaptured':          CustomEvent<GameSystemCapturedDetail>;
  'game:fleetMoved':              CustomEvent<GameFleetMovedDetail>;
  'game:fleetArrived':            CustomEvent<GameFleetMovedDetail>;
  'game:techCompleted':           CustomEvent<GameTechCompletedDetail>;
  'game:victory':                 CustomEvent<GameVictoryDetail>;
  'game:turnHistoryRestored':     CustomEvent<GameTurnHistoryRestoredDetail>;
  'game:saveGame':                CustomEvent<GameSaveGameDetail>;
  'game:saveGameResult':          CustomEvent<GameSaveGameResultDetail>;
  'game:openSaveMenu':            CustomEvent<never>;
  'game:openLoadMenu':            CustomEvent<never>;
  'game:openAssignmentModal':     CustomEvent<GameOpenAssignmentModalDetail>;
  'game:requestCharacterUpdate':  CustomEvent<GameRequestCharacterUpdateDetail>;
  'game:characterUpdate':         CustomEvent<GameCharacterUpdateDetail>;
  'game:missionUpdate':           CustomEvent<GameMissionUpdateDetail>;
  'game:requestFleetUpdate':      CustomEvent<GameRequestCharacterUpdateDetail>;
  'game:fleetUpdate':             CustomEvent<GameFleetUpdateDetail>;
  'game:constructionUpdate':      CustomEvent<GameConstructionUpdateDetail>;
  'game:requestGameStatus':       CustomEvent<GameRequestGameStatusDetail>;
  'game:changeSyncSpeed':         CustomEvent<GameChangeSyncSpeedDetail>;
  'game:toggleSyncMode':          CustomEvent<never>;
  'game:toggleSyncPause':         CustomEvent<never>;
  'game:toggleReady':             CustomEvent<never>;
  'game:requestAsyncMode':        CustomEvent<never>;
  'game:requestAsyncVote':        CustomEvent<never>;
  'game:uiLayerOpen':             CustomEvent<never>;
  'game:uiLayerClose':            CustomEvent<never>;
  'game:revoltEnded':             CustomEvent<GameRevoltEndedDetail>;
  'game:missionSuccess':          CustomEvent<never>;
  'game:missionFailed':           CustomEvent<never>;
  'game:characterCaptured':       CustomEvent<never>;
  'game:defeat':                  CustomEvent<never>;
  // session
  'session:gameStatusChanged':        CustomEvent<SessionGameStatusChangedDetail>;
  'session:tickLoopPause':            CustomEvent<never>;
  'session:tickLoopResume':           CustomEvent<never>;
  'session:allOrdersSubmitted':       CustomEvent<SessionAllOrdersSubmittedDetail>;
  'session:hostElected':              CustomEvent<SessionHostElectedDetail>;
  'session:asyncVoteThresholdReached':CustomEvent<never>;
  // alertPanel
  'alertPanel:closed':            CustomEvent<never>;
}
