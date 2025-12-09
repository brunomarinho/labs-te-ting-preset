import { EFFECTS, createDefaultSampleConfig } from './effects.js';
import { appState, ensurePreset } from './state.js';
import { audioEngine } from './audio-engine.js';
import { saveState } from './storage.js';
import {
  renderEffectList,
  renderPresetSlots,
  renderPresetEditor,
  renderModulationPanels,
  updateModulationButtons,
  updateParamOptions,
  openEffectModal,
  closeEffectModal,
  showToast
} from './ui.js';

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
  document.getElementById('handleSimBtn').classList.remove('mod-sim-btn--active');
  document.getElementById('shakeSimBtn').classList.remove('mod-sim-btn--active');

  const preset = appState.presets[index];
  audioEngine.buildChain(preset);

  // Restart LFO if playing
  if (appState.isPlaying) {
    audioEngine.startLfo();
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

export async function togglePlayback() {
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const playText = document.getElementById('playText');

  if (appState.isPlaying) {
    audioEngine.stop();
    audioEngine.stopLfo();
    appState.isPlaying = false;
    playBtn.classList.remove('play-btn--playing');
    playIcon.innerHTML = '&#9654;';
    playText.textContent = 'play';
  } else {
    await audioEngine.play();
    audioEngine.startLfo(); // Start LFO if configured
    appState.isPlaying = true;
    playBtn.classList.add('play-btn--playing');
    playIcon.innerHTML = '&#9632;';
    playText.textContent = 'stop';
  }
}

export function addEffect(effectName) {
  ensurePreset();

  const preset = appState.presets[appState.selectedSlot];
  const effectDef = EFFECTS[effectName];

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
  saveState();
}

export function updateEffectParam(index, param, value) {
  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list || !preset.list[index]) return;

  preset.list[index][param] = value;

  // Update audio engine in real-time
  audioEngine.updateParameter(index, param, value);
  saveState();
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

  // Clear localStorage
  saveState();

  showToast('reset complete', 'success');
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
    if (handleBtn.classList.contains('mod-sim-btn--disabled')) return;
    const isActive = handleBtn.classList.toggle('mod-sim-btn--active');
    audioEngine.setHandleActive(isActive);
  });

  // Shake - momentary (active while pressed)
  shakeBtn.addEventListener('mousedown', () => {
    if (shakeBtn.classList.contains('mod-sim-btn--disabled')) return;
    shakeBtn.classList.add('mod-sim-btn--active');
    audioEngine.setShakeActive(true);
  });
  shakeBtn.addEventListener('mouseup', () => {
    if (shakeBtn.classList.contains('mod-sim-btn--disabled')) return;
    shakeBtn.classList.remove('mod-sim-btn--active');
    audioEngine.setShakeActive(false);
  });
  shakeBtn.addEventListener('mouseleave', () => {
    if (shakeBtn.classList.contains('mod-sim-btn--disabled')) return;
    shakeBtn.classList.remove('mod-sim-btn--active');
    audioEngine.setShakeActive(false);
  });
  // Touch support for shake
  shakeBtn.addEventListener('touchstart', (e) => {
    if (shakeBtn.classList.contains('mod-sim-btn--disabled')) return;
    e.preventDefault();
    shakeBtn.classList.add('mod-sim-btn--active');
    audioEngine.setShakeActive(true);
  });
  shakeBtn.addEventListener('touchend', () => {
    if (shakeBtn.classList.contains('mod-sim-btn--disabled')) return;
    shakeBtn.classList.remove('mod-sim-btn--active');
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
    if (item) {
      addEffect(item.dataset.effect);
      closeEffectModal();
    }
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeEffectModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeEffectModal);

  // Effect list event delegation
  document.getElementById('effectList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.effect-card__delete');
    if (deleteBtn) {
      removeEffect(parseInt(deleteBtn.dataset.index));
    }
  });

  // Parameter sliders
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
}
