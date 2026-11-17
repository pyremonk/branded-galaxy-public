/**
 * AudioSettingsPanel — Volume controls for Master, Music, and SFX channels.
 *
 * Spec: 052-audio-spec.md (FR-AU-005)
 *
 * Controls:
 *  - Master Volume slider (0–100%, default 70%)
 *  - Music Volume slider  (0–100%, default 40%)
 *  - SFX Volume slider    (0–100%, default 80%)
 *  - Mute All toggle
 *
 * Settings persist to localStorage under `brandedGalaxy_audioSettings`.
 * Changes take effect immediately (no restart needed).
 */
import { useState, useCallback, useEffect } from 'react';
import { audioManager } from '../../core/audio-manager.js';
import './AudioSettingsPanel.css';
import { useBlockPhaserInput } from '../hooks/useBlockPhaserInput.js';

export function AudioSettingsPanel({ onClose }: any) {
  useBlockPhaserInput();
  const [settings, setSettings] = useState(() => audioManager.getSettings());

  // Sync if audio manager settings change externally
  useEffect(() => {
    setSettings(audioManager.getSettings());
  }, []);

  const handleMaster = useCallback((e: any) => {
    const v = Number(e.target.value) / 100;
    audioManager.setMasterVolume(v);
    setSettings(audioManager.getSettings());
  }, []);

  const handleMusic = useCallback((e: any) => {
    const v = Number(e.target.value) / 100;
    audioManager.setMusicVolume(v);
    setSettings(audioManager.getSettings());
  }, []);

  const handleSfx = useCallback((e: any) => {
    const v = Number(e.target.value) / 100;
    audioManager.setSfxVolume(v);
    setSettings(audioManager.getSettings());
    // Play a sample to give immediate feedback
    audioManager.playUIClick();
  }, []);

  const handleMute = useCallback(() => {
    audioManager.setMuteAll(!settings.muteAll);
    setSettings(audioManager.getSettings());
  }, [settings.muteAll]);

  return (
    <div className="audio-settings-panel" role="dialog" aria-label="Audio Settings">
      <div className="audio-settings-header">
        <span className="audio-settings-title">Audio Settings</span>
        {onClose && (
          <button className="audio-settings-close" onClick={onClose} aria-label="Close">✕</button>
        )}
      </div>

      <div className="audio-settings-body">
        {/* Mute All */}
        <div className="audio-settings-row audio-settings-row--mute">
          <label className="audio-settings-label">Mute All</label>
          <button
            className={`audio-mute-btn${settings.muteAll ? ' audio-mute-btn--active' : ''}`}
            onClick={handleMute}
            aria-pressed={settings.muteAll}
          >
            {settings.muteAll ? '🔇 Muted' : '🔊 On'}
          </button>
        </div>

        {/* Master Volume */}
        <div className="audio-settings-row">
          <label className="audio-settings-label" htmlFor="audio-master">
            Master
          </label>
          <input
            id="audio-master"
            className="audio-slider"
            type="range"
            min="0" max="100"
            value={Math.round(settings.masterVolume * 100)}
            onChange={handleMaster}
            disabled={settings.muteAll}
            aria-label="Master Volume"
          />
          <span className="audio-settings-value">
            {Math.round(settings.masterVolume * 100)}%
          </span>
        </div>

        {/* Music Volume */}
        <div className="audio-settings-row">
          <label className="audio-settings-label" htmlFor="audio-music">
            Music
          </label>
          <input
            id="audio-music"
            className="audio-slider"
            type="range"
            min="0" max="100"
            value={Math.round(settings.musicVolume * 100)}
            onChange={handleMusic}
            disabled={settings.muteAll}
            aria-label="Music Volume"
          />
          <span className="audio-settings-value">
            {Math.round(settings.musicVolume * 100)}%
          </span>
        </div>

        {/* SFX Volume */}
        <div className="audio-settings-row">
          <label className="audio-settings-label" htmlFor="audio-sfx">
            SFX
          </label>
          <input
            id="audio-sfx"
            className="audio-slider"
            type="range"
            min="0" max="100"
            value={Math.round(settings.sfxVolume * 100)}
            onChange={handleSfx}
            disabled={settings.muteAll}
            aria-label="SFX Volume"
          />
          <span className="audio-settings-value">
            {Math.round(settings.sfxVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
