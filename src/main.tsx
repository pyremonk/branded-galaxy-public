import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { dataBridge } from '../core/data-bridge.js';
import { audioManager } from '../core/audio-manager.js';
import Phaser from 'phaser';
import { BootStage } from '../engine/boot-stage.js';
import { MainStage } from '../engine/main-stage.js';
import './styles/global.css';

// Initialize data bridge
dataBridge.initialize();

// Initialize audio system (loads settings, sets up Web Audio API)
// Spec: 052-audio-spec.md FR-AU-001
audioManager.initialize();
audioManager.bindGameEvents();

// Render React UI
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root mount element');
}
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Setup Phaser game when authenticated
// factionId is passed from the FactionSelector after player confirms their choice
// gameConfig carries mode, galaxy size, difficulty, and resource/threshold modifiers
window.startPhaserGame = (factionId = null, gameConfig = {}) => {
  const config = {
    type: Phaser.AUTO,
    parent: 'galaxy-app',
    backgroundColor: '#0d1117',
    scale: {
      mode:       Phaser.Scale.RESIZE,
      width:      window.innerWidth,
      height:     window.innerHeight,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      resolution: window.devicePixelRatio || 1,
    },
    input: {
      mouse: {
        // Prevent wheel events from reaching the browser so the overscroll
        // rubber-band effect cannot physically shift the canvas in the DOM.
        preventDefaultWheel: true,
      },
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: [BootStage, MainStage]
  };

  const game = new Phaser.Game(config as unknown as Phaser.Types.Core.GameConfig);

  // Expose selected faction ID so scenes can use it during galaxy generation
  game.registry.set('playerFactionId', factionId);
  // Expose game config (galaxy size, difficulty, resource/threshold modifiers)
  game.registry.set('gameConfig', gameConfig);

  return game;
};
