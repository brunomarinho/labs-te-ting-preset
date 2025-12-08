// Main application entry point
import { appState } from './state.js';
import { audioEngine } from './audio-engine.js';
import { loadState } from './storage.js';
import { setupEventListeners } from './events.js';
import {
  renderEffectPicker,
  renderPresetSlots,
  renderPresetEditor
} from './ui.js';

function init() {
  // Load saved state first
  loadState();

  // Update sample button UI
  document.getElementById('singSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'singing');
  document.getElementById('spokenSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'spoken');

  renderEffectPicker();
  renderPresetSlots();
  renderPresetEditor();
  setupEventListeners();

  // Initialize audio engine and load the saved sample
  audioEngine.init().then(() => {
    audioEngine.loadSample(appState.selectedSample);
  });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
