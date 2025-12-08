import { appState } from './state.js';

const STORAGE_KEY = 'ting-preset-editor-state';

export function saveState() {
  const stateToSave = {
    packName: appState.packName,
    selectedSlot: appState.selectedSlot,
    selectedSample: appState.selectedSample,
    presets: appState.presets
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (e) {
    console.warn('Could not save state to localStorage:', e);
  }
}

export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);

      if (parsed.packName) appState.packName = parsed.packName;
      if (typeof parsed.selectedSlot === 'number') appState.selectedSlot = parsed.selectedSlot;
      if (parsed.selectedSample) appState.selectedSample = parsed.selectedSample;
      if (parsed.presets) appState.presets = parsed.presets;

      // Update UI with loaded pack name
      document.getElementById('packName').value = appState.packName;

      return true;
    }
  } catch (e) {
    console.warn('Could not load state from localStorage:', e);
  }
  return false;
}
