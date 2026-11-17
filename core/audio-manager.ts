/**
 * AudioManager — Manages game audio via Web Audio API.
 *
 * Architecture:
 *   sfxGain ──┐
 *              ├──► masterGain ──► destination
 *  musicGain ──┘
 *
 * All SFX are procedurally generated oscillators — no audio files required
 * for Phase 1, satisfying FR-AU-001's Web Audio API wrapping requirement.
 * Audio file loading (Phaser asset loader) is deferred to a future phase.
 *
 * FR-AU-003: UI SFX
 * FR-AU-004: Game event SFX
 * FR-AU-005: Volume controls (persisted under `brandedGalaxy_audioSettings`)
 *
 * Spec: 052-audio-spec.md
 */
import { FEATURES } from './feature-flags.js';

const STORAGE_KEY = 'brandedGalaxy_audioSettings';

/** Default volume settings (FR-AU-005). */
const DEFAULT_SETTINGS = {
  masterVolume: 0.7,
  musicVolume:  0.4,
  sfxVolume:    0.8,
  muteAll:      false,
};

/** Named audio keys for external callers (FR-AU-001). */
export const AUDIO_KEYS = {
  UI_CLICK:        'ui_click',
  PANEL_OPEN:      'panel_open',
  PANEL_CLOSE:     'panel_close',
  TOAST_INFO:      'toast_info',
  TOAST_WARNING:   'toast_warning',
  TOAST_CRITICAL:  'toast_critical',
  TURN_END:        'turn_end',
  ERROR:           'error',
  COMBAT:          'combat',
  CAPTURE:         'capture',
  FLEET_ARRIVE:    'fleet_arrive',
  RESEARCH_DONE:   'research_done',
  CHAR_CAPTURE:    'char_capture',
  MISSION_SUCCESS: 'mission_success',
  MISSION_FAIL:    'mission_fail',
  EVENT_TRIGGER:   'event_trigger',
  VICTORY:         'victory',
  DEFEAT:          'defeat',
};

// ─── Ambient music constants ──────────────────────────────────────────────────

/** Base drone frequency in Hz (A1 = 55 Hz). */
const DRONE_BASE_HZ = 55;
/** Detune offset: ~1.26% up from base creates a chorus/beating effect. */
const DRONE_DETUNE_HZ = 55.7;
/** Low-pass cutoff for the drone layer (Hz). */
const DRONE_FILTER_HZ = 320;
/** Target gain for the drone layer (reached after fade-in). */
const DRONE_GAIN_TARGET = 0.016;
/** Seconds over which the drone fades in. */
const DRONE_FADE_IN_S = 6;
/** Harmonic pad frequency (A2 = 110 Hz, one octave above drone). */
const PAD_BASE_HZ = 110;
/** Target gain for the harmonic pad. */
const PAD_GAIN_TARGET = 0.014;
/** Seconds over which the pad fades in. */
const PAD_FADE_IN_S = 9;

interface AudioSettings {
  masterVolume: number;
  musicVolume:  number;
  sfxVolume:    number;
  muteAll:      boolean;
}

interface ToneOptions {
  freq?:   number;
  dur?:    number;
  type?:   OscillatorType;
  peak?:   number;
  attack?: number;
}

interface NoteStep {
  f: number;
  t: number;
}

class AudioManager {
  private _ctx:          AudioContext | null;
  private _masterGain:   GainNode | null;
  private _sfxGain:      GainNode | null;
  private _musicGain:    GainNode | null;
  private _settings:     AudioSettings;
  private _musicNodes:   AudioScheduledSourceNode[];
  private _ready:        boolean;
  private _eventsBound:  boolean;

  constructor() {
    this._ctx          = null;
    this._masterGain   = null;
    this._sfxGain      = null;
    this._musicGain    = null;
    this._settings     = { ...DEFAULT_SETTINGS };
    this._musicNodes   = [];
    this._ready        = false;
    this._eventsBound  = false;
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  /**
   * Initialize the audio system. Idempotent.
   * Audio loading failures are caught and logged per FR-AU constraint.
   */
  initialize(): void {
    if (this._ready) return;
    this._loadSettings();

    try {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[AudioManager] Web Audio API not available — audio disabled');
        return;
      }
      this._ctx = new AudioCtx();

      // Gain graph: sfxGain / musicGain → masterGain → destination
      this._masterGain = this._ctx.createGain();
      this._masterGain.connect(this._ctx.destination);

      this._sfxGain = this._ctx.createGain();
      this._sfxGain.connect(this._masterGain);

      this._musicGain = this._ctx.createGain();
      this._musicGain.connect(this._masterGain);

      this._applyVolumes();
      this._ready = true;

      // Resume AudioContext and start music on first user gesture
      // (browser autoplay policy)
      const onGesture = () => {
        if (this._ctx!.state === 'suspended') {
          this._ctx!.resume().catch(() => {});
        }
        this.startAmbientMusic();
      };
      window.addEventListener('click',   onGesture, { once: true });
      window.addEventListener('keydown', onGesture, { once: true });

      console.log('[AudioManager] Initialized');
    } catch (err) {
      console.warn('[AudioManager] Initialization failed — audio disabled:', err);
    }
  }

  // ─── Settings API (FR-AU-005) ────────────────────────────────────────────────

  /** @returns {Object} Copy of current settings */
  getSettings(): AudioSettings {
    return { ...this._settings };
  }

  /** @param {number} v - 0–1 */
  setMasterVolume(v: number): void {
    this._settings.masterVolume = Math.max(0, Math.min(1, v));
    this._applyVolumes();
    this._saveSettings();
  }

  /** @param {number} v - 0–1 relative to master */
  setMusicVolume(v: number): void {
    this._settings.musicVolume = Math.max(0, Math.min(1, v));
    this._applyVolumes();
    this._saveSettings();
  }

  /** @param {number} v - 0–1 relative to master */
  setSfxVolume(v: number): void {
    this._settings.sfxVolume = Math.max(0, Math.min(1, v));
    this._applyVolumes();
    this._saveSettings();
  }

  /** @param {boolean} muted */
  setMuteAll(muted: boolean): void {
    this._settings.muteAll = !!muted;
    this._applyVolumes();
    this._saveSettings();
    window.dispatchEvent(new CustomEvent('audio:muteChanged', { detail: { muted: this._settings.muteAll } }));
  }

  // ─── Named SFX (FR-AU-003: UI SFX) ──────────────────────────────────────────

  /** Soft click for button interactions */
  playUIClick()        { this._tone({ freq: 800, dur: 0.05, type: 'square', peak: 0.14 }); }
  /** Short whoosh on panel open */
  playPanelOpen()      { this._seq([{ f: 300, t: 0 }, { f: 500, t: 0.07 }], 0.1, 0.18); }
  /** Inverse whoosh on panel close */
  playPanelClose()     { this._seq([{ f: 500, t: 0 }, { f: 300, t: 0.06 }], 0.09, 0.15); }
  /** Subtle info chime (FR-AU-003) */
  playToastInfo()      { this._seq([{ f: 660, t: 0 }, { f: 880, t: 0.07 }], 0.09, 0.14); }
  /** Sharper alert for warnings (FR-AU-003) */
  playToastWarning()   { this._seq([{ f: 440, t: 0 }, { f: 330, t: 0.09 }], 0.12, 0.22); }
  /** Sustained alert for critical notifications */
  playToastCritical()  { this._tone({ freq: 320, dur: 0.35, type: 'sawtooth', peak: 0.22 }); }
  /** Brief submit click for turn end (FR-AU-003) */
  playTurnEnd()        { this._seq([{ f: 550, t: 0 }, { f: 660, t: 0.08 }], 0.1, 0.2); }
  /** Low buzzer for errors / invalid actions (FR-AU-003) */
  playError()          { this._seq([{ f: 180, t: 0 }, { f: 150, t: 0.12 }], 0.15, 0.2); }

  // ─── Named SFX (FR-AU-004: Game Event SFX) ──────────────────────────────────

  /** Percussive battle SFX (1–2s feel) */
  playCombat() {
    this._seq([{ f: 200, t: 0 }, { f: 150, t: 0.1 }, { f: 180, t: 0.2 }], 0.15, 0.32);
  }
  /** Ascending fanfare on system captured */
  playCapture() {
    this._seq([{ f: 440, t: 0 }, { f: 550, t: 0.1 }, { f: 660, t: 0.2 }, { f: 880, t: 0.3 }], 0.18, 0.28);
  }
  /** Hyperspace drop-in on fleet arrival */
  playFleetArrive() {
    this._seq([{ f: 350, t: 0 }, { f: 420, t: 0.15 }], 0.18, 0.2);
  }
  /** Ascending chime sequence on research complete (~1.5s feel) */
  playResearchComplete() {
    this._seq(
      [{ f: 523, t: 0 }, { f: 659, t: 0.18 }, { f: 784, t: 0.36 }, { f: 1047, t: 0.54 }],
      0.25, 0.28
    );
  }
  /** Tense sting on character captured */
  playCharCapture()    { this._seq([{ f: 330, t: 0 }, { f: 220, t: 0.12 }], 0.2, 0.25); }
  /** Positive resolution chime on mission success */
  playMissionSuccess() { this._seq([{ f: 523, t: 0 }, { f: 659, t: 0.12 }, { f: 784, t: 0.24 }], 0.18, 0.25); }
  /** Negative resolution tone on mission failure */
  playMissionFail()    { this._seq([{ f: 330, t: 0 }, { f: 220, t: 0.18 }], 0.22, 0.25); }
  /** Distinctive event notification sting */
  playEventTrigger()   { this._seq([{ f: 500, t: 0 }, { f: 450, t: 0.09 }], 0.12, 0.2); }
  /** Full victory fanfare (3–5s feel) */
  playVictory() {
    this._seq(
      [
        { f: 523,  t: 0    },
        { f: 659,  t: 0.18 },
        { f: 784,  t: 0.36 },
        { f: 1047, t: 0.54 },
        { f: 784,  t: 0.72 },
        { f: 1047, t: 0.84 },
      ],
      0.2, 0.35
    );
  }
  /** Somber defeat tone */
  playDefeat() {
    this._seq([{ f: 440, t: 0 }, { f: 350, t: 0.25 }, { f: 260, t: 0.5 }], 0.3, 0.3);
  }

  // ─── Ambient Music (FR-AU-002) ───────────────────────────────────────────────

  /**
   * Start procedural ambient background music (drone pad + harmonic layer).
   * Fades in slowly to avoid abrupt start. Idempotent.
   */
  startAmbientMusic(): void {
    if (!this._ready || !this._ctx || this._musicNodes.length > 0) return;
    if (this._ctx.state === 'suspended') return; // will retry after gesture

    const ctx = this._ctx;
    const now = ctx.currentTime;
    const nodes: AudioScheduledSourceNode[] = [];

    // Low drone — two slightly detuned sawtooth oscillators for thick pad
    const drone1 = ctx.createOscillator();
    drone1.type = 'sawtooth';
    drone1.frequency.value = DRONE_BASE_HZ;

    const drone2 = ctx.createOscillator();
    drone2.type = 'sawtooth';
    drone2.frequency.value = DRONE_DETUNE_HZ; // slight detune for chorus effect

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = DRONE_FILTER_HZ;
    droneFilter.Q.value = 0.7;

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(DRONE_GAIN_TARGET, now + DRONE_FADE_IN_S);

    drone1.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(this._musicGain!);

    drone1.start(now);
    drone2.start(now);
    nodes.push(drone1, drone2);

    // Harmonic pad — sine wave at an octave up (A2 = 110 Hz)
    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = PAD_BASE_HZ;

    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(PAD_GAIN_TARGET, now + PAD_FADE_IN_S);

    pad.connect(padGain);
    padGain.connect(this._musicGain!);
    pad.start(now);
    nodes.push(pad);

    this._musicNodes = nodes;
    console.log('[AudioManager] Ambient music started');
  }

  /** Stop ambient music (e.g. on return to main menu). */
  stopAmbientMusic(): void {
    for (const node of this._musicNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
      } catch { /* already stopped */ }
    }
    this._musicNodes = [];
  }

  // ─── Event Binding ───────────────────────────────────────────────────────────

  /**
   * Subscribe to game window events and play corresponding SFX.
   * Call once after initialize(). Idempotent.
   */
  bindGameEvents(): void {
    if (!this._ready || this._eventsBound) return;
    this._eventsBound = true;

    // UI SFX
    window.addEventListener('galaxy:panelOpen',  () => this.playPanelOpen());
    window.addEventListener('galaxy:panelClose', () => this.playPanelClose());

    // Turn end — MAINTENANCE phase start means end-turn was processed
    window.addEventListener('galaxy:phaseStart', (e) => {
      if (e.detail?.phase === 'MAINTENANCE') this.playTurnEnd();
    });

    // Notification sounds
    window.addEventListener('galaxy:notify', (e) => {
      const { tier } = e.detail ?? {};
      if (tier === 'warning') this.playToastWarning();
      else if (tier === 'critical') this.playToastCritical();
    });

    // Game event SFX (FR-AU-004)
    window.addEventListener('game:techCompleted',     () => this.playResearchComplete());
    window.addEventListener('game:missionSuccess',    () => this.playMissionSuccess());
    window.addEventListener('game:missionFailed',     () => this.playMissionFail());
    window.addEventListener('game:characterCaptured', () => this.playCharCapture());
    window.addEventListener('game:combatFlash',       () => this.playCombat());
    window.addEventListener('game:systemCaptured',    () => this.playCapture());
    window.addEventListener('game:fleetArrived',      () => this.playFleetArrive());
    window.addEventListener('game:victory',           () => this.playVictory());
    window.addEventListener('game:defeat',            () => this.playDefeat());
    if (FEATURES.EVENT_SYSTEM) {
      window.addEventListener('galaxy:choiceEvent', () => this.playEventTrigger());
    }

    console.log('[AudioManager] Game events bound');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /** Load persisted audio settings from localStorage. */
  _loadSettings(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null;
      if (saved && typeof saved === 'object') {
        this._settings = { ...DEFAULT_SETTINGS, ...saved };
      }
    } catch { /* ignore corrupt data */ }
  }

  /** Save current settings to localStorage (FR-AU-005). */
  _saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch { /* ignore storage errors */ }
  }

  /** Apply current volume settings to gain nodes immediately. */
  _applyVolumes(): void {
    if (!this._masterGain || !this._ctx) return;
    const t    = this._ctx.currentTime;
    const mute = this._settings.muteAll;
    this._masterGain.gain.setTargetAtTime(mute ? 0 : this._settings.masterVolume, t, 0.02);
    this._sfxGain!.gain.setTargetAtTime(   mute ? 0 : this._settings.sfxVolume,    t, 0.02);
    this._musicGain!.gain.setTargetAtTime( mute ? 0 : this._settings.musicVolume,  t, 0.02);
  }

  /** Resume suspended AudioContext (enforces browser autoplay policy). */
  _resumeCtx(): void {
    if (this._ctx?.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /**
   * Play a single procedural tone.
   * @param {{ freq, dur, type, peak, attack }} opts
   */
  _tone({ freq = 440, dur = 0.15, type = 'sine' as OscillatorType, peak = 0.25, attack = 0.006 }: ToneOptions): void {
    if (!this._ready || !this._ctx) return;
    this._resumeCtx();
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);

    osc.connect(gain);
    gain.connect(this._sfxGain!);
    osc.start(now);
    osc.stop(now + attack + dur + 0.05);
  }

  /**
   * Play a sequential multi-note tone sequence (for fanfares, chimes).
   * @param {{ f: number, t: number }[]} notes - [{freq, relativeStartOffset}, ...]
   * @param {number} noteDur - duration of each note in seconds
   * @param {number} peak    - peak gain per note
   */
  _seq(notes: NoteStep[], noteDur: number, peak: number): void {
    if (!this._ready || !this._ctx) return;
    this._resumeCtx();
    const ctx = this._ctx;
    const now = ctx.currentTime;

    for (const { f, t } of notes) {
      const startT = now + t;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startT);
      gain.gain.linearRampToValueAtTime(peak, startT + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, startT + noteDur);

      osc.connect(gain);
      gain.connect(this._sfxGain!);
      osc.start(startT);
      osc.stop(startT + noteDur + 0.05);
    }
  }
}

/** Singleton AudioManager instance (FR-AU-001). */
export const audioManager = new AudioManager();
