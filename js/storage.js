import { appState, PreviewMode, defaultCustomSamples } from './state.js';

const STORAGE_KEY = 'ting-preset-editor-state';

export function saveState() {
  const stateToSave = {
    packName: appState.packName,
    selectedSlot: appState.selectedSlot,
    selectedSample: appState.selectedSample,
    presets: appState.presets,
    useCustomSamples: appState.useCustomSamples,
    customSamples: appState.customSamples,
    previewMode: appState.previewMode
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
      if (typeof parsed.useCustomSamples === 'boolean') appState.useCustomSamples = parsed.useCustomSamples;
      if (parsed.customSamples && Array.isArray(parsed.customSamples)) appState.customSamples = parsed.customSamples;
      if (parsed.previewMode && Object.values(PreviewMode).includes(parsed.previewMode)) {
        appState.previewMode = parsed.previewMode;
      }

      // Update UI with loaded pack name
      document.getElementById('packName').value = appState.packName;

      return true;
    }
  } catch (e) {
    console.warn('Could not load state from localStorage:', e);
  }
  return false;
}
