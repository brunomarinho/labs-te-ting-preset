import { EFFECTS, getEffectDisplayName } from './effects.js';
import { appState } from './state.js';
import { audioEngine } from './audio-engine.js';
import { saveState } from './storage.js';

// Sortable instance reference
let sortableInstance = null;

export function renderEffectCard(effectConfig, index) {
  const effectDef = EFFECTS[effectConfig.effect];
  const isSample = effectConfig.effect === 'SAMPLE';
  const displayName = getEffectDisplayName(effectConfig.effect);

  let paramsHtml = '';

  if (effectDef && effectDef.params) {
    const params = Object.entries(effectDef.params);
    paramsHtml = params.map(([paramName, paramDef]) => {
      const value = effectConfig[paramName] ?? paramDef.default;
      const displayValue = paramDef.max > 100
        ? Math.round(value)
        : value.toFixed(2);

      return `
        <div class="param-control">
          <div class="param-control__header">
            <span class="param-control__label">${paramName}</span>
            <span class="param-control__value" id="value-${index}-${paramName}">${displayValue}</span>
          </div>
          <input
            type="range"
            class="param-control__slider"
            data-effect-index="${index}"
            data-param="${paramName}"
            min="${paramDef.min}"
            max="${paramDef.max}"
            step="${(paramDef.max - paramDef.min) / 100}"
            value="${value}"
          >
        </div>
      `;
    }).join('');
  }

  // MIC IN (SAMPLE) cannot be deleted
  const deleteBtn = isSample
    ? ''
    : `<button class="effect-card__delete" data-index="${index}" title="remove">×</button>`;

  return `
    <div class="effect-card ${isSample ? 'effect-card--sample' : ''}" data-index="${index}">
      <div class="effect-card__header">
        <div class="effect-card__left">
          <span class="effect-card__drag">&#9776;</span>
          <span class="effect-card__row">${index}</span>
          <span class="effect-card__name">${displayName}</span>
        </div>
        ${deleteBtn}
      </div>
      ${paramsHtml ? `<div class="effect-card__params">${paramsHtml}</div>` : ''}
    </div>
  `;
}

export function renderEffectList() {
  const effectList = document.getElementById('effectList');
  const preset = appState.presets[appState.selectedSlot];

  if (!preset || !preset.list || preset.list.length === 0) {
    effectList.innerHTML = '<div class="effect-list--empty">no effects - add one below</div>';
    return;
  }

  // Check if only MIC IN exists (no additional effects)
  const hasOnlyMicIn = preset.list.length === 1 && preset.list[0].effect === 'SAMPLE';

  effectList.innerHTML = preset.list.map((effect, index) =>
    renderEffectCard(effect, index)
  ).join('');

  if (hasOnlyMicIn) {
    effectList.innerHTML += '<div class="effect-list--hint">add effects above to process the audio</div>';
  }

  // Initialize SortableJS
  initSortable();
}

export function renderPresetSlots() {
  for (let i = 0; i < 4; i++) {
    const slot = document.querySelector(`.preset-slot[data-slot="${i}"]`);
    const nameEl = document.getElementById(`slotName${i}`);
    const preset = appState.presets[i];

    slot.classList.toggle('preset-slot--active', i === appState.selectedSlot);
    nameEl.textContent = preset ? preset.name || 'unnamed' : 'empty';
  }
}

export function renderPresetEditor() {
  const preset = appState.presets[appState.selectedSlot];

  document.getElementById('presetName').value = preset?.name || '';
  document.getElementById('presetComment').value = preset?.comment || '';

  renderEffectList();
  renderModulationPanels();
  updateModulationButtons();
}

export function updateModulationButtons() {
  const preset = appState.presets[appState.selectedSlot];
  const handleBtn = document.getElementById('handleSimBtn');
  const shakeBtn = document.getElementById('shakeSimBtn');

  // Show disabled state if no modulation configured
  // Check if handle/shake exists and has both row and param defined
  const hasHandle = preset?.handle != null && preset.handle.row !== undefined && preset.handle.param;
  const hasShake = preset?.shake != null && preset.shake.row !== undefined && preset.shake.param;

  handleBtn.classList.toggle('mod-sim-btn--disabled', !hasHandle);
  shakeBtn.classList.toggle('mod-sim-btn--disabled', !hasShake);

  handleBtn.title = hasHandle
    ? `handle: ${preset.handle.param} on row ${preset.handle.row}`
    : 'no handle modulation configured';
  shakeBtn.title = hasShake
    ? `shake: ${preset.shake.param} on row ${preset.shake.row}`
    : 'no shake modulation configured';
}

export function renderModulationPanels() {
  const preset = appState.presets[appState.selectedSlot];
  const effectList = preset?.list || [];

  // Populate row selectors (use display names)
  const rowOptions = effectList.map((e, i) =>
    `<option value="${i}">${i}: ${getEffectDisplayName(e.effect)}</option>`
  ).join('');

  ['handle', 'shake', 'lfo', 'trigger'].forEach(modType => {
    const rowSelect = document.getElementById(`${modType}Row`);
    if (rowSelect) {
      rowSelect.innerHTML = rowOptions || '<option value="">no effects</option>';
    }
  });

  // Handle modulation
  const handleEnabled = document.getElementById('handleEnabled');
  const handleRow = document.getElementById('handleRow');
  const handleParam = document.getElementById('handleParam');
  const handleDepth = document.getElementById('handleDepth');

  if (preset?.handle) {
    handleEnabled.checked = true;
    handleRow.value = preset.handle.row ?? 0;
    updateParamOptions('handle', preset.handle.row);
    handleParam.value = preset.handle.param || '';
    handleDepth.value = preset.handle.depth ?? 0.5;
  } else {
    handleEnabled.checked = false;
    handleDepth.value = 0.5;
  }

  // Shake modulation
  const shakeEnabled = document.getElementById('shakeEnabled');
  const shakeRow = document.getElementById('shakeRow');
  const shakeParam = document.getElementById('shakeParam');
  const shakeDepth = document.getElementById('shakeDepth');

  if (preset?.shake) {
    shakeEnabled.checked = true;
    shakeRow.value = preset.shake.row ?? 0;
    updateParamOptions('shake', preset.shake.row);
    shakeParam.value = preset.shake.param || '';
    shakeDepth.value = preset.shake.depth ?? 0.5;
  } else {
    shakeEnabled.checked = false;
    shakeDepth.value = 0.5;
  }

  // LFO modulation
  const lfoEnabled = document.getElementById('lfoEnabled');
  const lfoRow = document.getElementById('lfoRow');
  const lfoParam = document.getElementById('lfoParam');
  const lfoDepth = document.getElementById('lfoDepth');
  const lfoShape = document.getElementById('lfoShape');
  const lfoSpeed = document.getElementById('lfoSpeed');

  if (preset?.lfo) {
    lfoEnabled.checked = true;
    lfoRow.value = preset.lfo.row ?? 0;
    updateParamOptions('lfo', preset.lfo.row);
    lfoParam.value = preset.lfo.param || '';
    lfoDepth.value = preset.lfo.depth ?? 0.5;
    lfoShape.value = preset.lfo.shape || 'sine';
    lfoSpeed.value = preset.lfo.speed ?? 1;
  } else {
    lfoEnabled.checked = false;
    lfoDepth.value = 0.5;
    lfoSpeed.value = 1;
  }

  // Trigger
  const triggerEnabled = document.getElementById('triggerEnabled');
  const triggerRow = document.getElementById('triggerRow');

  if (preset?.trigger) {
    triggerEnabled.checked = true;
    triggerRow.value = preset.trigger.row ?? 0;
  } else {
    triggerEnabled.checked = false;
  }
}

export function updateParamOptions(modType, rowIndex) {
  const preset = appState.presets[appState.selectedSlot];
  const effect = preset?.list?.[rowIndex];
  const paramSelect = document.getElementById(`${modType}Param`);

  if (!effect || !EFFECTS[effect.effect]) {
    paramSelect.innerHTML = '<option value="">no parameters</option>';
    return;
  }

  const params = Object.keys(EFFECTS[effect.effect].params);
  paramSelect.innerHTML = params.map(p =>
    `<option value="${p}">${p}</option>`
  ).join('');
}

export function renderEffectPicker() {
  const picker = document.getElementById('effectPicker');
  // Exclude SAMPLE from picker - it's auto-added and required
  const effectNames = Object.keys(EFFECTS).filter(name => name !== 'SAMPLE');

  picker.innerHTML = effectNames.map(name => `
    <div class="effect-picker__item" data-effect="${name}">
      ${name}
    </div>
  `).join('');
}

// Drag and drop initialization
export function initSortable() {
  const effectList = document.getElementById('effectList');

  if (sortableInstance) {
    sortableInstance.destroy();
  }

  const effectCards = effectList.querySelectorAll('.effect-card');
  if (effectCards.length === 0) return;

  sortableInstance = new Sortable(effectList, {
    animation: 150,
    handle: '.effect-card__drag',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd: function(evt) {
      const preset = appState.presets[appState.selectedSlot];
      if (!preset || !preset.list) return;

      const item = preset.list.splice(evt.oldIndex, 1)[0];
      preset.list.splice(evt.newIndex, 0, item);

      // Re-render to update indices
      renderEffectList();
      renderModulationPanels();

      // Rebuild audio chain
      audioEngine.buildChain(preset);
      saveState();
    }
  });
}

// Modal functions
export function openEffectModal() {
  document.getElementById('effectModal').classList.add('modal--open');
}

export function closeEffectModal() {
  document.getElementById('effectModal').classList.remove('modal--open');
}

// Toast notifications
export function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
