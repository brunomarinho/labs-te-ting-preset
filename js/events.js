import { EFFECTS, createDefaultSampleConfig, SINGLE_INSTANCE_EFFECTS } from './effects.js';
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
  document.getElementById('handleSimBtn').classList.remove('btn--mod-active');
  document.getElementById('shakeSimBtn').classList.remove('btn--mod-active');

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
      if (handleBtn.classList.contains('btn--mod-disabled')) return;
      const isActive = handleBtn.classList.toggle('btn--mod-active');
      audioEngine.setHandleActive(isActive);
    }

    if (e.key === 's' || e.key === 'S') {
      if (shakeBtn.classList.contains('btn--mod-disabled')) return;
      shakeBtn.classList.add('btn--mod-active');
      audioEngine.setShakeActive(true);
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 's' || e.key === 'S') {
      if (shakeBtn.classList.contains('btn--mod-disabled')) return;
      shakeBtn.classList.remove('btn--mod-active');
      audioEngine.setShakeActive(false);
    }
  });
}
