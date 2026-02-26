import { createDefaultSampleConfig } from './effects.js';

// Preview modes
export const PreviewMode = {
  EMULATION: 'emulation',
  HARDWARE: 'hardware'
};

// Application state
export const appState = {
  packName: 'MY PACK',
  selectedSlot: 0,
  selectedSample: 'singing',
  isPlaying: false,
  presets: [null, null, null, null],
  // Custom sample pack from imported config.json (preserved on export)
  samples: null,
  // Hardware mode state
  previewMode: PreviewMode.EMULATION,
  // Track if presets have been modified since last import/export
  isDirty: false
};

// Mark state as dirty (has unsaved changes)
export function markDirty() {
  appState.isDirty = true;
}

// Mark state as clean (just imported/exported)
export function markClean() {
  appState.isDirty = false;
}

// Ensure a preset exists in the current slot (creates with default MIC IN)
export function ensurePreset() {
  if (!appState.presets[appState.selectedSlot]) {
    appState.presets[appState.selectedSlot] = {
      name: '',
      comment: '',
      list: [createDefaultSampleConfig()]
    };
  }
}
