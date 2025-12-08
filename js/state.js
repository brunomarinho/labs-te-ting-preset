import { createDefaultSampleConfig } from './effects.js';

// Application state
export const appState = {
  packName: 'MY PACK',
  selectedSlot: 0,
  selectedSample: 'singing',
  isPlaying: false,
  presets: [null, null, null, null]
};

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
