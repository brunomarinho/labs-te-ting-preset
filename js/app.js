// Main application entry point
import { appState, PreviewMode, applyCustomSamplesFromConfig } from './state.js';
import { createDefaultSampleConfig } from './effects.js';
import { audioEngine } from './audio-engine.js';
import { loadState, saveState } from './storage.js';
import { DEFAULT_PACK } from './default-preset.js';
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

// Seed appState from a config.json-shaped pack (first-run default)
function applyConfigToState(config) {
  appState.packName = config.name || 'MY PACK';
  applyCustomSamplesFromConfig(config);
  appState.presets = [null, null, null, null];
  (config.presets || []).forEach((preset) => {
    const pos = preset.pos ?? appState.presets.findIndex(p => p === null);
    if (pos >= 0 && pos < 4) {
      const list = preset.list || [];
      if (!list.some(e => e.effect === 'SAMPLE')) {
        list.push(createDefaultSampleConfig());
      }
      appState.presets[pos] = {
        name: preset.name || '',
        comment: preset.comment || '',
        list,
        handle: preset.handle || null,
        shake: preset.shake || null,
        lfo: preset.lfo || null,
        trigger: preset.trigger || null
      };
    }
  });
  appState.selectedSlot = 0;
}

function init() {
  // Load saved state; if nothing is saved (first run), seed the default pack
  const hadSavedState = loadState();
  if (!hadSavedState) {
    applyConfigToState(DEFAULT_PACK);
    document.getElementById('packName').value = appState.packName;
    saveState();
  }

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
