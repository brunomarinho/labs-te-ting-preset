import { EFFECTS, createDefaultSampleConfig, SINGLE_INSTANCE_EFFECTS } from './effects.js';
import { appState, ensurePreset, PreviewMode, markDirty, markClean } from './state.js';
import { audioEngine } from './audio-engine.js';
import { saveState } from './storage.js';
import { tingUSB, ConnectionState, TingUSB } from './webusb.js';
import {
  renderEffectList,
  renderPresetSlots,
  renderPresetEditor,
  renderModulationPanels,
  updateModulationButtons,
  updateParamOptions,
  openEffectModal,
  closeEffectModal,
  openHelpModal,
  closeHelpModal,
  showToast
} from './ui.js';

// ========================================
// Hardware slot polling
// Syncs app state when user presses hardware button
// ========================================

let slotPollingInterval = null;
const SLOT_POLLING_INTERVAL_MS = 500;

function startSlotPolling() {
  if (slotPollingInterval) return; // Already polling

  slotPollingInterval = setInterval(async () => {
    // Skip if not connected, not in hardware mode, or polling is paused (during param adjustment)
    if (tingUSB.state !== ConnectionState.CONNECTED ||
        appState.previewMode !== PreviewMode.HARDWARE ||
        tingUSB.isPollingPaused()) {
      return;
    }

    try {
      const deviceSlot = await tingUSB.pollCurrentSlot();
      if (deviceSlot >= 0 && deviceSlot !== appState.selectedSlot) {
        // Device slot changed (user pressed hardware button) - sync app
        console.log(`[Polling] Hardware slot changed: ${appState.selectedSlot} -> ${deviceSlot}`);
        appState.selectedSlot = deviceSlot;
        renderPresetSlots();
        renderPresetEditor();
        audioEngine.buildChain(appState.presets[deviceSlot]);
        saveState();
      }
    } catch (err) {
      console.warn('[Polling] Error checking device slot:', err);
    }
  }, SLOT_POLLING_INTERVAL_MS);

  console.log('[Polling] Started slot polling');
}

function stopSlotPolling() {
  if (slotPollingInterval) {
    clearInterval(slotPollingInterval);
    slotPollingInterval = null;
    console.log('[Polling] Stopped slot polling');
  }
}

// State management functions with side effects

export function selectSlot(index) {
  appState.selectedSlot = index;
  renderPresetSlots();
  renderPresetEditor();

  // Reset modulation state
  audioEngine.clearBaseValues();
  audioEngine.stopLfo();
  audioEngine.setHandleActive(false);
  audioEngine.setShakeActive(false);
  document.getElementById('handleSimBtn').classList.remove('btn--mod-active');
  document.getElementById('shakeSimBtn').classList.remove('btn--mod-active');

  const preset = appState.presets[index];
  audioEngine.buildChain(preset);

  // Restart LFO if playing
  if (appState.isPlaying) {
    audioEngine.startLfo();
  }

  // Switch slot on hardware if in hardware mode and connected
  if (appState.previewMode === PreviewMode.HARDWARE && tingUSB.state === ConnectionState.CONNECTED) {
    tingUSB.selectSlot(index).catch(err => {
      console.warn('Failed to switch slot on hardware:', err);
    });
  }

  saveState();
}

export function clearSlot(index) {
  appState.presets[index] = null;
  renderPresetSlots();

  if (index === appState.selectedSlot) {
    renderPresetEditor();
    audioEngine.buildChain(null);
  }
  markDirty();
  saveState();
}

export async function selectSample(sampleType) {
  appState.selectedSample = sampleType;

  document.getElementById('singSampleBtn').classList.toggle('sample-btn--active', sampleType === 'singing');
  document.getElementById('spokenSampleBtn').classList.toggle('sample-btn--active', sampleType === 'spoken');

  // If playing, stop first, load new sample, then restart
  const wasPlaying = appState.isPlaying;
  if (wasPlaying) {
    audioEngine.stop();
  }

  await audioEngine.loadSample(sampleType);

  if (wasPlaying) {
    audioEngine.player.start();
  }

  saveState();
}

const PLAY_ICON = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 12.7484C0.00387125 12.9732 0.0692511 13.1925 0.189023 13.3827C0.308794 13.5728 0.478385 13.7265 0.679356 13.8269C0.880046 13.9404 1.10664 14 1.33714 14C1.56765 14 1.79425 13.9404 1.99493 13.8269L11.3226 8.05692C11.5255 7.95913 11.6968 7.80603 11.8167 7.61525C11.9365 7.42446 12 7.20372 12 6.97841C12 6.7531 11.9365 6.53236 11.8167 6.34157C11.6968 6.15078 11.5255 5.99769 11.3226 5.8999L1.99493 0.173011C1.79425 0.0595984 1.56765 0 1.33714 0C1.10664 0 0.880046 0.0595984 0.679356 0.173011C0.478385 0.273516 0.308794 0.427191 0.189023 0.617338C0.0692511 0.807479 0.00387125 1.02683 0 1.25152V12.7484Z" fill="currentColor"/></svg>';
const STOP_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="14" height="14" rx="1" fill="currentColor"/></svg>';

export async function togglePlayback() {
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const playText = document.getElementById('playText');

  if (appState.isPlaying) {
    audioEngine.stop();
    audioEngine.stopLfo();
    appState.isPlaying = false;
    playBtn.classList.remove('play-btn--playing');
    playIcon.innerHTML = PLAY_ICON;
    playText.textContent = 'play';
  } else {
    await audioEngine.play();
    audioEngine.startLfo(); // Start LFO if configured
    appState.isPlaying = true;
    playBtn.classList.add('play-btn--playing');
    playIcon.innerHTML = STOP_ICON;
    playText.textContent = 'stop';
  }
}

export function addEffect(effectName) {
  ensurePreset();

  const preset = appState.presets[appState.selectedSlot];
  const effectDef = EFFECTS[effectName];

  // Check if this is a single-instance effect that's already in the chain
  if (SINGLE_INSTANCE_EFFECTS.includes(effectName)) {
    const alreadyExists = preset.list.some(e => e.effect === effectName);
    if (alreadyExists) {
      showToast(`${effectName} can only be added once`, 'error');
      return;
    }
  }

  // Create effect config with default params
  const effectConfig = { effect: effectName };

  if (effectDef && effectDef.params) {
    Object.entries(effectDef.params).forEach(([param, def]) => {
      effectConfig[param] = def.default;
    });
  }

  // Ensure MIC IN (SAMPLE) exists - add at end if missing
  const hasSample = preset.list.some(e => e.effect === 'SAMPLE');
  if (!hasSample) {
    preset.list.push(createDefaultSampleConfig());
  }

  preset.list.push(effectConfig);

  renderEffectList();
  renderModulationPanels();
  renderPresetSlots();

  audioEngine.buildChain(preset);
  markDirty();
  saveState();
}

export function removeEffect(index) {
  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list) return;

  // Prevent removing MIC IN (SAMPLE) - it's required
  if (preset.list[index]?.effect === 'SAMPLE') return;

  preset.list.splice(index, 1);

  // Update modulation references if they point to removed or higher indices
  if (preset.handle && preset.handle.row >= index) {
    if (preset.handle.row === index) {
      preset.handle = null;
    } else {
      preset.handle.row--;
    }
  }
  if (preset.shake && preset.shake.row >= index) {
    if (preset.shake.row === index) {
      preset.shake = null;
    } else {
      preset.shake.row--;
    }
  }
  if (preset.lfo && preset.lfo.row >= index) {
    if (preset.lfo.row === index) {
      preset.lfo = null;
    } else {
      preset.lfo.row--;
    }
  }
  if (preset.trigger && preset.trigger.row >= index) {
    if (preset.trigger.row === index) {
      preset.trigger = null;
    } else {
      preset.trigger.row--;
    }
  }

  renderEffectList();
  renderModulationPanels();

  if (preset.list.length === 0) {
    renderPresetSlots();
  }

  audioEngine.buildChain(preset);
  markDirty();
  saveState();
}

// Update effect parameter locally (state + emulation audio)
// Does NOT send to hardware - use sendEffectParamToHardware for that
export function updateEffectParam(index, param, value) {
  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list || !preset.list[index]) return;

  preset.list[index][param] = value;

  // Update audio engine in real-time (emulation mode only)
  if (appState.previewMode === PreviewMode.EMULATION) {
    audioEngine.updateParameter(index, param, value);
  }

  markDirty();
  saveState();
}

// Send parameter to hardware device (called on slider release)
export function sendEffectParamToHardware(index, param, value) {
  if (appState.previewMode !== PreviewMode.HARDWARE || tingUSB.state !== ConnectionState.CONNECTED) {
    return;
  }

  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list || !preset.list[index]) return;

  // Use the device's row number if available, otherwise fall back to index
  const row = preset.list[index]._row !== undefined ? preset.list[index]._row : index;
  tingUSB.setParamDebounced(appState.selectedSlot, row, param, value);
}

export function updateHandleModulation() {
  ensurePreset();
  const preset = appState.presets[appState.selectedSlot];

  if (document.getElementById('handleEnabled').checked) {
    preset.handle = {
      row: parseInt(document.getElementById('handleRow').value) || 0,
      param: document.getElementById('handleParam').value || '',
      depth: parseFloat(document.getElementById('handleDepth').value) || 0.5
    };
  } else {
    preset.handle = null;
  }
  updateModulationButtons();
  markDirty();
  saveState();
}

export function updateShakeModulation() {
  ensurePreset();
  const preset = appState.presets[appState.selectedSlot];

  if (document.getElementById('shakeEnabled').checked) {
    preset.shake = {
      row: parseInt(document.getElementById('shakeRow').value) || 0,
      param: document.getElementById('shakeParam').value || '',
      depth: parseFloat(document.getElementById('shakeDepth').value) || 0.5
    };
  } else {
    preset.shake = null;
  }
  updateModulationButtons();
  markDirty();
  saveState();
}

export function updateLfoModulation() {
  ensurePreset();
  const preset = appState.presets[appState.selectedSlot];

  if (document.getElementById('lfoEnabled').checked) {
    preset.lfo = {
      row: parseInt(document.getElementById('lfoRow').value) || 0,
      param: document.getElementById('lfoParam').value || '',
      depth: parseFloat(document.getElementById('lfoDepth').value) || 0.5,
      shape: document.getElementById('lfoShape').value || 'sine',
      speed: parseFloat(document.getElementById('lfoSpeed').value) || 1
    };
  } else {
    preset.lfo = null;
  }
  markDirty();
  saveState();
}

export function updateTrigger() {
  ensurePreset();
  const preset = appState.presets[appState.selectedSlot];

  if (document.getElementById('triggerEnabled').checked) {
    preset.trigger = {
      row: parseInt(document.getElementById('triggerRow').value) || 0
    };
  } else {
    preset.trigger = null;
  }
  markDirty();
  saveState();
}

// Import/Export handlers

export function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const config = JSON.parse(event.target.result);

      // Validate structure
      if (!config.presets || !Array.isArray(config.presets)) {
        throw new Error('Invalid config format: missing presets array');
      }

      // Load pack name
      appState.packName = config.name || 'MY PACK';
      document.getElementById('packName').value = appState.packName;

      // Clear existing presets
      appState.presets = [null, null, null, null];

      // Load presets
      config.presets.forEach((preset) => {
        const pos = preset.pos ?? appState.presets.findIndex(p => p === null);
        if (pos >= 0 && pos < 4) {
          let list = preset.list || [];

          // Ensure MIC IN (SAMPLE) exists - add at end if missing
          const hasSample = list.some(e => e.effect === 'SAMPLE');
          if (!hasSample) {
            list.push(createDefaultSampleConfig());
          }

          appState.presets[pos] = {
            name: preset.name || '',
            comment: preset.comment || '',
            list: list,
            handle: preset.handle || null,
            shake: preset.shake || null,
            lfo: preset.lfo || null,
            trigger: preset.trigger || null
          };
        }
      });

      // Update UI
      appState.selectedSlot = 0;
      renderPresetSlots();
      renderPresetEditor();

      // Rebuild audio chain
      audioEngine.buildChain(appState.presets[0]);

      // Mark as clean since we just imported
      markClean();

      // Save to localStorage
      saveState();

      showToast('config imported successfully', 'success');
    } catch (err) {
      console.error('Import error:', err);
      showToast('failed to import config: ' + err.message, 'error');
    }
  };

  reader.readAsText(file);

  // Reset file input so same file can be imported again
  e.target.value = '';
}

export function handleExport() {
  const config = {
    name: appState.packName,
    presets: []
  };

  appState.presets.forEach((preset, index) => {
    if (preset) {
      const exportPreset = {
        pos: index,
        name: preset.name || '',
        comment: preset.comment || '',
        list: preset.list || []
      };

      if (preset.handle) exportPreset.handle = preset.handle;
      if (preset.shake) exportPreset.shake = preset.shake;
      if (preset.lfo) exportPreset.lfo = preset.lfo;
      if (preset.trigger) exportPreset.trigger = preset.trigger;

      config.presets.push(exportPreset);
    }
  });

  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Mark as clean since we just exported
  markClean();

  showToast('config exported', 'success');
}

export function handleReset() {
  if (!confirm('Clear all presets and settings?')) {
    return;
  }

  // Reset to defaults
  appState.packName = 'MY PACK';
  appState.selectedSlot = 0;
  appState.selectedSample = 'singing';
  appState.presets = [null, null, null, null];

  // Update UI
  document.getElementById('packName').value = appState.packName;
  document.getElementById('singSampleBtn').classList.add('sample-btn--active');
  document.getElementById('spokenSampleBtn').classList.remove('sample-btn--active');

  renderPresetSlots();
  renderPresetEditor();

  // Reset audio
  audioEngine.buildChain(null);
  audioEngine.loadSample('singing');

  // Mark as clean since we just reset
  markClean();

  // Clear localStorage
  saveState();

  showToast('reset complete', 'success');
}

// ========================================
// Mode switching and WebUSB connection
// ========================================

// Switch between emulation and hardware preview modes
export function setPreviewMode(mode, isInit = false) {
  // Don't switch if already in this mode (unless initializing)
  if (!isInit && appState.previewMode === mode) return;

  // Warn about unsaved changes when switching to hardware mode
  // (hardware mode will import from device, overwriting local changes)
  if (!isInit && mode === PreviewMode.HARDWARE && appState.isDirty) {
    const confirmed = confirm(
      'You have unsaved changes. Switching to Live mode will import presets from the device, replacing your current work.\n\nExport first to save your changes, or click OK to continue.'
    );
    if (!confirmed) return;
  }

  // Disconnect when switching from live to emulation to avoid state conflicts
  if (!isInit && mode === PreviewMode.EMULATION && tingUSB.state === ConnectionState.CONNECTED) {
    const confirmed = confirm(
      'Switching to Emulation mode will disconnect from the device.\n\nYour current presets will be kept for editing. Click OK to continue.'
    );
    if (!confirmed) return;
    tingUSB.disconnect();
    showToast('disconnected from device', 'info');
  }

  appState.previewMode = mode;

  const emulationControls = document.getElementById('emulationControls');
  const hardwareControls = document.getElementById('hardwareControls');
  const emulationBtn = document.getElementById('emulationModeBtn');
  const hardwareBtn = document.getElementById('hardwareModeBtn');

  // Get UI elements that need mode-specific behavior
  const addEffectBtn = document.getElementById('addEffectBtn');

  if (mode === PreviewMode.EMULATION) {
    emulationControls.style.display = 'flex';
    hardwareControls.style.display = 'none';
    emulationBtn.classList.add('mode-toggle__btn--active');
    hardwareBtn.classList.remove('mode-toggle__btn--active');

    // Enable effect editing in emulation mode
    addEffectBtn.disabled = false;
    addEffectBtn.title = '';
    document.body.classList.remove('hardware-mode');
    document.body.classList.remove('hardware-mode--no-edit');

    // Stop slot polling when leaving hardware mode
    stopSlotPolling();

    // Stop any playing audio when switching to emulation
    if (appState.isPlaying) {
      togglePlayback();
    }
  } else {
    emulationControls.style.display = 'none';
    hardwareControls.style.display = 'flex';
    emulationBtn.classList.remove('mode-toggle__btn--active');
    hardwareBtn.classList.add('mode-toggle__btn--active');

    // Disable adding/removing effects in hardware mode (only parameter tweaks allowed)
    addEffectBtn.disabled = true;
    addEffectBtn.title = 'Adding effects is disabled in Live mode';
    document.body.classList.add('hardware-mode');
    document.body.classList.add('hardware-mode--no-edit');

    // Stop emulation audio when switching to hardware
    if (appState.isPlaying) {
      togglePlayback();
    }

    // Start slot polling if connected
    if (tingUSB.state === ConnectionState.CONNECTED) {
      startSlotPolling();
    }

    // Check WebUSB support
    if (!TingUSB.isSupported()) {
      updateConnectionUI(ConnectionState.ERROR, 'WebUSB not supported');
    }
  }

  // Save mode preference (skip on init to avoid unnecessary write)
  if (!isInit) {
    saveState();
  }
}

// Update connection status UI
export function updateConnectionUI(state, message = '') {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');
  const btn = document.getElementById('connectBtn');
  const saveBtn = document.getElementById('saveToDeviceBtn');

  // Remove all state classes
  dot.classList.remove(
    'connection-status__dot--connecting',
    'connection-status__dot--connected',
    'connection-status__dot--error'
  );
  btn.classList.remove('btn--connect--connected');

  switch (state) {
    case ConnectionState.CONNECTING:
      dot.classList.add('connection-status__dot--connecting');
      text.textContent = 'connecting...';
      btn.textContent = 'connecting...';
      btn.disabled = true;
      saveBtn.disabled = true;
      break;

    case ConnectionState.CONNECTED:
      dot.classList.add('connection-status__dot--connected');
      text.textContent = 'connected to EP-2350';
      btn.textContent = 'disconnect';
      btn.classList.add('btn--connect--connected');
      btn.disabled = false;
      saveBtn.disabled = false;
      break;

    case ConnectionState.ERROR:
      dot.classList.add('connection-status__dot--error');
      text.textContent = message || 'connection error';
      btn.textContent = 'connect device';
      btn.disabled = false;
      saveBtn.disabled = true;
      break;

    case ConnectionState.DISCONNECTED:
    default:
      text.textContent = 'disconnected';
      btn.textContent = 'connect device';
      btn.disabled = false;
      saveBtn.disabled = true;
      break;
  }
}

// Import presets from connected device using config.json
async function importPresetsFromDevice() {
  try {
    // Check if still connected
    if (tingUSB.state !== ConnectionState.CONNECTED) {
      console.warn('[Events] Not connected, skipping import');
      return;
    }

    showToast('reading config.json from device...', 'info');

    // Test connection first
    const connectionOk = await tingUSB.testConnection();
    if (!connectionOk) {
      console.warn('[Events] Connection test failed, communication may not be working');
    }

    // Check again after test
    if (tingUSB.state !== ConnectionState.CONNECTED) {
      console.warn('[Events] Device disconnected during test, aborting import');
      return;
    }

    // Read config.json from device
    const config = await tingUSB.readConfigJson();

    // Check again after read
    if (tingUSB.state !== ConnectionState.CONNECTED) {
      console.warn('[Events] Device disconnected during import');
      showToast('device disconnected during import', 'error');
      return;
    }

    // Always sync to slot 0 on connect for consistent initial state
    const currentSlot = 0;
    try {
      await tingUSB.selectSlot(currentSlot);
    } catch (err) {
      console.warn('[Events] Could not sync to slot 0:', err);
    }

    // Parse config and convert to app format
    const devicePresets = [null, null, null, null];
    const packName = config.name || 'DEVICE PACK';

    if (config.presets && Array.isArray(config.presets)) {
      config.presets.forEach((preset) => {
        const pos = preset.pos ?? 0;
        if (pos >= 0 && pos < 4) {
          let list = preset.list || [];

          // Ensure MIC IN (SAMPLE) exists - add at end if missing
          const hasSample = list.some(e => e.effect === 'SAMPLE');
          if (!hasSample) {
            list.push(createDefaultSampleConfig());
          }

          devicePresets[pos] = {
            name: preset.name || '',
            comment: preset.comment || '',
            list: list,
            handle: preset.handle || null,
            shake: preset.shake || null,
            lfo: preset.lfo || null,
            trigger: preset.trigger || null
          };
        }
      });
    }

    // Update app state with device presets
    appState.presets = devicePresets;
    appState.selectedSlot = currentSlot;
    appState.packName = packName;

    // Update UI
    document.getElementById('packName').value = appState.packName;
    renderPresetSlots();
    renderPresetEditor();

    // Rebuild audio chain for emulation (even though we're in hardware mode)
    audioEngine.buildChain(appState.presets[currentSlot]);

    // Mark as clean since we just imported from device
    markClean();

    // Save to localStorage
    saveState();

    const presetCount = devicePresets.filter(p => p !== null).length;
    showToast(`imported ${presetCount} preset(s) from device`, 'success');

  } catch (err) {
    console.error('Failed to import presets:', err);
    showToast('failed to read config from device: ' + err.message, 'error');
  }
}

// Show/hide save progress modal
function showSaveProgress(show) {
  const modal = document.getElementById('saveProgressModal');
  if (show) {
    modal.classList.add('modal--open');
  } else {
    modal.classList.remove('modal--open');
  }
}

// Update save progress UI
function updateSaveProgress(current, total, status) {
  const progressBar = document.getElementById('saveProgressBar');
  const statusEl = document.getElementById('saveProgressStatus');
  const percent = Math.round((current / total) * 100);
  progressBar.style.width = `${percent}%`;
  statusEl.textContent = status;
}

// Save presets to connected device using config.json
export async function savePresetsToDevice() {
  try {
    // Check if still connected
    if (tingUSB.state !== ConnectionState.CONNECTED) {
      showToast('not connected to device', 'error');
      return false;
    }

    // Show progress modal
    showSaveProgress(true);
    updateSaveProgress(0, 100, 'preparing...');

    // Build config object from app state
    const config = {
      name: appState.packName || 'MY PACK',
      presets: []
    };

    appState.presets.forEach((preset, index) => {
      if (preset) {
        const exportPreset = {
          pos: index,
          name: preset.name || '',
          comment: preset.comment || '',
          list: preset.list || []
        };

        if (preset.handle) exportPreset.handle = preset.handle;
        if (preset.shake) exportPreset.shake = preset.shake;
        if (preset.lfo) exportPreset.lfo = preset.lfo;
        if (preset.trigger) exportPreset.trigger = preset.trigger;

        config.presets.push(exportPreset);
      }
    });

    // Write config to device with progress callback
    await tingUSB.writeConfigJson(config, updateSaveProgress);

    // Check if still connected after write
    if (tingUSB.state !== ConnectionState.CONNECTED) {
      console.warn('[Events] Device disconnected during save');
      showSaveProgress(false);
      showToast('device disconnected during save', 'error');
      return false;
    }

    // Reload the current preset on device and update LED
    try {
      await tingUSB.loadPreset(appState.selectedSlot);
      await tingUSB.updateLED(appState.selectedSlot);
    } catch (err) {
      console.warn('[Events] Could not reload preset after save:', err);
    }

    // Mark as clean since we just saved to device
    markClean();

    // Hide modal and show success
    showSaveProgress(false);
    showToast('saved to device successfully', 'success');
    return true;

  } catch (err) {
    console.error('Failed to save presets to device:', err);
    showSaveProgress(false);
    showToast('failed to save to device: ' + err.message, 'error');
    return false;
  }
}

// Handle connect/disconnect button click
export async function handleConnectionToggle() {
  if (tingUSB.state === ConnectionState.CONNECTED) {
    stopSlotPolling();
    await tingUSB.disconnect();
    showToast('device disconnected', 'info');
  } else {
    const success = await tingUSB.connect();
    if (success) {
      showToast('connected to EP-2350', 'success');

      // Import presets from device
      await importPresetsFromDevice();

      // Start polling for hardware button presses
      startSlotPolling();
    } else if (tingUSB.errorMessage) {
      // Show connection error to user
      showToast(tingUSB.errorMessage, 'error');
    }
  }
}

// Main event listener setup

export function setupEventListeners() {
  // Pack name
  document.getElementById('packName').addEventListener('input', (e) => {
    appState.packName = e.target.value.toUpperCase();
    saveState();
  });

  // Sample selection
  document.getElementById('singSampleBtn').addEventListener('click', () => selectSample('singing'));
  document.getElementById('spokenSampleBtn').addEventListener('click', () => selectSample('spoken'));

  // Modulation simulation buttons
  const handleBtn = document.getElementById('handleSimBtn');
  const shakeBtn = document.getElementById('shakeSimBtn');

  // Handle - toggle on/off
  handleBtn.addEventListener('click', () => {
    if (handleBtn.classList.contains('btn--mod-disabled')) return;
    const isActive = handleBtn.classList.toggle('btn--mod-active');
    audioEngine.setHandleActive(isActive);
  });

  // Shake - momentary (active while pressed)
  shakeBtn.addEventListener('mousedown', () => {
    if (shakeBtn.classList.contains('btn--mod-disabled')) return;
    shakeBtn.classList.add('btn--mod-active');
    audioEngine.setShakeActive(true);
  });
  shakeBtn.addEventListener('mouseup', () => {
    if (shakeBtn.classList.contains('btn--mod-disabled')) return;
    shakeBtn.classList.remove('btn--mod-active');
    audioEngine.setShakeActive(false);
  });
  shakeBtn.addEventListener('mouseleave', () => {
    if (shakeBtn.classList.contains('btn--mod-disabled')) return;
    shakeBtn.classList.remove('btn--mod-active');
    audioEngine.setShakeActive(false);
  });
  // Touch support for shake
  shakeBtn.addEventListener('touchstart', (e) => {
    if (shakeBtn.classList.contains('btn--mod-disabled')) return;
    e.preventDefault();
    shakeBtn.classList.add('btn--mod-active');
    audioEngine.setShakeActive(true);
  });
  shakeBtn.addEventListener('touchend', () => {
    if (shakeBtn.classList.contains('btn--mod-disabled')) return;
    shakeBtn.classList.remove('btn--mod-active');
    audioEngine.setShakeActive(false);
  });

  // Play/Stop
  document.getElementById('playBtn').addEventListener('click', togglePlayback);

  // Preset slots
  document.querySelectorAll('.preset-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      if (e.target.classList.contains('preset-slot__clear')) return;
      selectSlot(parseInt(slot.dataset.slot));
    });
  });

  // Clear slot buttons
  document.querySelectorAll('.preset-slot__clear').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(parseInt(btn.dataset.slot));
    });
  });

  // Preset name/comment
  document.getElementById('presetName').addEventListener('input', (e) => {
    ensurePreset();
    appState.presets[appState.selectedSlot].name = e.target.value.toUpperCase();
    renderPresetSlots();
    saveState();
  });

  document.getElementById('presetComment').addEventListener('input', (e) => {
    ensurePreset();
    appState.presets[appState.selectedSlot].comment = e.target.value;
    saveState();
  });

  // Add effect button
  document.getElementById('addEffectBtn').addEventListener('click', openEffectModal);

  // Effect picker
  document.getElementById('effectPicker').addEventListener('click', (e) => {
    const item = e.target.closest('.effect-picker__item');
    if (item && !item.dataset.disabled) {
      addEffect(item.dataset.effect);
      closeEffectModal();
    }
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeEffectModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeEffectModal);

  // Help modal
  document.getElementById('helpLink').addEventListener('click', (e) => {
    e.preventDefault();
    openHelpModal();
  });
  document.getElementById('helpModalClose').addEventListener('click', closeHelpModal);
  document.getElementById('helpModalBackdrop').addEventListener('click', closeHelpModal);

  // ESC key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEffectModal();
      closeHelpModal();
    }
  });

  // Effect list event delegation
  document.getElementById('effectList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.effect-card__delete');
    if (deleteBtn) {
      removeEffect(parseInt(deleteBtn.dataset.index));
    }
  });

  // Parameter sliders - input event (fires continuously during drag)
  // Updates local state and emulation audio, but NOT hardware
  document.getElementById('effectList').addEventListener('input', (e) => {
    if (e.target.classList.contains('param-control__slider')) {
      const index = parseInt(e.target.dataset.effectIndex);
      const param = e.target.dataset.param;
      const value = parseFloat(e.target.value);

      updateEffectParam(index, param, value);

      // Update display value
      const valueEl = document.getElementById(`value-${index}-${param}`);
      if (valueEl) {
        const preset = appState.presets[appState.selectedSlot];
        const effectConfig = preset?.list?.[index];
        const effectDef = EFFECTS[effectConfig?.effect];
        const paramDef = effectDef?.params?.[param];

        if (paramDef && paramDef.max > 100) {
          valueEl.textContent = Math.round(value);
        } else {
          valueEl.textContent = value.toFixed(2);
        }
      }
    }
  });

  // Parameter sliders - change event (fires on release)
  // Sends to hardware only when user releases the slider
  document.getElementById('effectList').addEventListener('change', (e) => {
    if (e.target.classList.contains('param-control__slider')) {
      const index = parseInt(e.target.dataset.effectIndex);
      const param = e.target.dataset.param;
      const value = parseFloat(e.target.value);

      sendEffectParamToHardware(index, param, value);
    }
  });

  // Modulation panel toggles
  document.querySelectorAll('.mod-panel__header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      const panel = header.closest('.mod-panel');
      panel.classList.toggle('mod-panel--open');
    });
  });

  // Handle modulation
  document.getElementById('handleEnabled').addEventListener('change', updateHandleModulation);
  document.getElementById('handleRow').addEventListener('change', (e) => {
    updateParamOptions('handle', parseInt(e.target.value));
    updateHandleModulation();
  });
  document.getElementById('handleParam').addEventListener('change', updateHandleModulation);
  document.getElementById('handleDepth').addEventListener('input', updateHandleModulation);

  // Shake modulation
  document.getElementById('shakeEnabled').addEventListener('change', updateShakeModulation);
  document.getElementById('shakeRow').addEventListener('change', (e) => {
    updateParamOptions('shake', parseInt(e.target.value));
    updateShakeModulation();
  });
  document.getElementById('shakeParam').addEventListener('change', updateShakeModulation);
  document.getElementById('shakeDepth').addEventListener('input', updateShakeModulation);

  // LFO modulation
  document.getElementById('lfoEnabled').addEventListener('change', updateLfoModulation);
  document.getElementById('lfoRow').addEventListener('change', (e) => {
    updateParamOptions('lfo', parseInt(e.target.value));
    updateLfoModulation();
  });
  document.getElementById('lfoParam').addEventListener('change', updateLfoModulation);
  document.getElementById('lfoDepth').addEventListener('input', updateLfoModulation);
  document.getElementById('lfoShape').addEventListener('change', updateLfoModulation);
  document.getElementById('lfoSpeed').addEventListener('input', updateLfoModulation);

  // Trigger
  document.getElementById('triggerEnabled').addEventListener('change', updateTrigger);
  document.getElementById('triggerRow').addEventListener('change', updateTrigger);

  // Reset
  document.getElementById('resetBtn').addEventListener('click', handleReset);

  // Import
  document.getElementById('importFile').addEventListener('change', handleImport);

  // Export
  document.getElementById('exportBtn').addEventListener('click', handleExport);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    // Ignore key repeat (holding key down)
    if (e.repeat) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayback();
    }

    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      if (handleBtn.classList.contains('btn--mod-disabled')) return;
      const isActive = handleBtn.classList.toggle('btn--mod-active');
      audioEngine.setHandleActive(isActive);
    }

    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (shakeBtn.classList.contains('btn--mod-disabled')) return;
      shakeBtn.classList.add('btn--mod-active');
      audioEngine.setShakeActive(true);
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (shakeBtn.classList.contains('btn--mod-disabled')) return;
      shakeBtn.classList.remove('btn--mod-active');
      audioEngine.setShakeActive(false);
    }
  });

  // ========================================
  // Mode toggle and WebUSB connection
  // ========================================

  // Mode toggle buttons
  document.getElementById('emulationModeBtn').addEventListener('click', () => {
    setPreviewMode(PreviewMode.EMULATION);
  });

  document.getElementById('hardwareModeBtn').addEventListener('click', () => {
    setPreviewMode(PreviewMode.HARDWARE);
  });

  // Connect button
  document.getElementById('connectBtn').addEventListener('click', handleConnectionToggle);

  // Save to device button
  document.getElementById('saveToDeviceBtn').addEventListener('click', savePresetsToDevice);

  // Set up WebUSB state change listener
  tingUSB.onStateChange = (state, message) => {
    updateConnectionUI(state, message);
  };

  // Set up WebUSB disconnect listener (for unexpected disconnections)
  tingUSB.onDisconnect = () => {
    stopSlotPolling();
    showToast('device disconnected unexpectedly - check USB connection', 'error');
  };
}
