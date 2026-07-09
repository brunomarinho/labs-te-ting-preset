import { createDefaultSampleConfig } from './effects.js';

// Preview modes
export const PreviewMode = {
  EMULATION: 'emulation',
  HARDWARE: 'hardware'
};

// Default custom WAV samples structure (4 device sample slots)
export function defaultCustomSamples() {
  return [
    { file: '', playmode: 'oneshot' },
    { file: '', playmode: 'oneshot' },
    { file: '', playmode: 'oneshot' },
    { file: '', playmode: 'oneshot' }
  ];
}

// Application state
export const appState = {
  packName: 'MY PACK',
  selectedSlot: 0,
  selectedSample: 'singing',
  isPlaying: false,
  presets: [null, null, null, null],
  // Custom WAV samples: master toggle + 4 slots ({ file, playmode })
  useCustomSamples: false,
  customSamples: defaultCustomSamples(),
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

// Parse a config.json `samples` array into appState (useCustomSamples + customSamples)
export function applyCustomSamplesFromConfig(config) {
  appState.customSamples = defaultCustomSamples();
  const arr = config.samples;
  if (Array.isArray(arr) && arr.length > 0) {
    appState.useCustomSamples = true;
    arr.forEach((s, idx) => {
      const pos = s.pos !== undefined ? s.pos : idx;
      if (pos >= 0 && pos < 4) {
        appState.customSamples[pos] = { file: s.file || '', playmode: s.playmode || 'oneshot' };
      }
    });
  } else {
    appState.useCustomSamples = false;
  }
}

// Serialize appState custom samples into a config.json `samples` array (null if none set)
export function customSamplesToConfig() {
  if (!appState.useCustomSamples) return null;
  const arr = appState.customSamples
    .map((s, i) => ({ pos: i, file: s.file, playmode: s.playmode }))
    .filter(s => s.file.trim() !== '');
  return arr.length > 0 ? arr : null;
}
