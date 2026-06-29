// Main application entry point
import { appState, PreviewMode } from './state.js';
import { audioEngine } from './audio-engine.js';
import { loadState } from './storage.js';
import { setupEventListeners, setPreviewMode } from './events.js';
import {
  renderEffectPicker,
  renderPresetSlots,
  renderPresetEditor,
  renderSamplesEditor
} from './ui.js';
import { tingUSB } from './webusb.js';

// Expose tingUSB to window for console debugging
window.tingUSB = tingUSB;

function init() {
  // Load saved state first
  loadState();

  // Update sample button UI
  document.getElementById('singSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'singing');
  document.getElementById('spokenSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'spoken');

  renderEffectPicker();
  renderPresetSlots();
  renderPresetEditor();
  renderSamplesEditor();
  setupEventListeners();

  // Apply saved preview mode (must be after setupEventListeners)
  if (appState.previewMode !== PreviewMode.EMULATION) {
    setPreviewMode(appState.previewMode, true);  // isInit=true to skip early return
  }

  // Initialize audio engine and load the saved sample
  audioEngine.init().then(() => {
    audioEngine.loadSample(appState.selectedSample);
  });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
