// =====================================================
// EFFECT DEFINITIONS
// =====================================================
const EFFECTS = {
  BALANCE: {
    params: { balance: { min: 0, max: 1, default: 0.5 } }
  },
  LOWPASS: {
    params: { cutoff: { min: 0, max: 1, default: 0.5 } }
  },
  HIGHPASS: {
    params: { cutoff: { min: 0, max: 1, default: 0.5 } }
  },
  DIST: {
    params: {
      amount: { min: 0, max: 40, default: 10 },
      mix: { min: 0, max: 1, default: 0.5 },
      'lowpass-cutoff': { min: 0, max: 1, default: 1 },
      'highpass-cutoff': { min: 0, max: 1, default: 0 }
    }
  },
  DELAY: {
    params: {
      time: { min: 0, max: 1.1, default: 0.5 },
      echo: { min: 0, max: 1, default: 0.5 },
      'wet-level': { min: 0, max: 1, default: 0.5 },
      'dry-level': { min: 0, max: 1, default: 1 },
      'lowpass-cutoff': { min: 0, max: 1, default: 1 },
      'highpass-cutoff': { min: 0, max: 1, default: 0 },
      'cross-feed': { min: 0, max: 1, default: 0 }
    }
  },
  REVERB: {
    params: {
      time: { min: 0, max: 1, default: 0.5 },
      'wet-level': { min: 0, max: 1, default: 0.5 },
      'dry-level': { min: 0, max: 1, default: 1 },
      'spring-mix': { min: 0, max: 1, default: 0 },
      'highpass-cutoff': { min: 0, max: 1, default: 0 }
    }
  },
  RING: {
    params: {
      frequency: { min: 0, max: 20000, default: 400 },
      mix: { min: 0, max: 1, default: 0.5 }
    }
  },
  HARMONY: {
    params: {
      pitch: { min: 0.5, max: 2, default: 1 },
      'dry-level': { min: 0, max: 1, default: 0 }
    }
  },
  SSB: {
    params: { frequency: { min: -20000, max: 20000, default: 0 } }
  },
  SAMPLE: {
    params: {
      speed: { min: 0, max: 4, default: 1 },
      pitch: { min: -24, max: 24, default: 0 },
      level: { min: 0, max: 1, default: 1 },
      balance: { min: 0, max: 1, default: 0.5 }
    }
  }
};

// =====================================================
// APPLICATION STATE
// =====================================================
const appState = {
  packName: 'MY PACK',
  selectedSlot: 0,
  selectedSample: 'singing',
  isPlaying: false,
  presets: [null, null, null, null]
};

// =====================================================
// AUDIO ENGINE
// =====================================================
class AudioEngine {
  constructor() {
    this.player = null;
    this.effectChain = [];
    this.effectNodes = [];
    this.masterGain = null;
    this.isInitialized = false;
    this.currentSample = 'singing';
  }

  async init() {
    if (this.isInitialized) return;

    await Tone.start();

    this.masterGain = new Tone.Gain(0.8).toDestination();
    this.player = new Tone.Player({
      loop: true,
      autostart: false
    });

    this.isInitialized = true;
  }

  async loadSample(sampleType) {
    await this.init();

    this.currentSample = sampleType;
    const url = `./${sampleType}.mp3`;

    try {
      await this.player.load(url);
    } catch (e) {
      console.warn(`Could not load ${url}, using silent buffer`);
      // Create a silent buffer as fallback
      const buffer = Tone.context.createBuffer(2, 44100 * 2, 44100);
      this.player.buffer = new Tone.ToneAudioBuffer(buffer);
    }
  }

  disposeEffects() {
    this.effectNodes.forEach(node => {
      if (node && node.dispose) {
        node.dispose();
      }
    });
    this.effectNodes = [];
    this.effectChain = [];
  }

  // Map cutoff 0-1 to frequency 20-20000Hz (logarithmic)
  cutoffToFreq(cutoff) {
    const minFreq = 20;
    const maxFreq = 20000;
    return minFreq * Math.pow(maxFreq / minFreq, cutoff);
  }

  createEffect(effectConfig) {
    const { effect } = effectConfig;
    let node = null;

    switch (effect) {
      case 'BALANCE': {
        // Convert 0-1 to -1 to 1
        const pan = (effectConfig.balance ?? 0.5) * 2 - 1;
        node = new Tone.Panner(pan);
        node._tingType = 'BALANCE';
        break;
      }

      case 'LOWPASS': {
        const freq = this.cutoffToFreq(effectConfig.cutoff ?? 0.5);
        node = new Tone.Filter(freq, 'lowpass');
        node._tingType = 'LOWPASS';
        break;
      }

      case 'HIGHPASS': {
        const freq = this.cutoffToFreq(effectConfig.cutoff ?? 0.5);
        node = new Tone.Filter(freq, 'highpass');
        node._tingType = 'HIGHPASS';
        break;
      }

      case 'DIST': {
        // Create a chain: highpass -> distortion -> lowpass
        const amount = (effectConfig.amount ?? 10) / 40; // normalize to 0-1
        const mix = effectConfig.mix ?? 0.5;

        const distortion = new Tone.Distortion(amount);
        distortion.wet.value = mix;

        const lowpass = new Tone.Filter(
          this.cutoffToFreq(effectConfig['lowpass-cutoff'] ?? 1),
          'lowpass'
        );
        const highpass = new Tone.Filter(
          this.cutoffToFreq(effectConfig['highpass-cutoff'] ?? 0),
          'highpass'
        );

        // Chain them together
        highpass.connect(distortion);
        distortion.connect(lowpass);

        node = highpass;
        node._tingType = 'DIST';
        node._output = lowpass;
        node._distortion = distortion;
        node._lowpass = lowpass;
        node._highpass = highpass;
        break;
      }

      case 'DELAY': {
        const time = effectConfig.time ?? 0.5;
        const feedback = effectConfig.echo ?? 0.5;
        const wet = effectConfig['wet-level'] ?? 0.5;

        node = new Tone.FeedbackDelay(time, feedback);
        node.wet.value = wet;
        node._tingType = 'DELAY';
        break;
      }

      case 'REVERB': {
        const time = (effectConfig.time ?? 0.5) * 10 + 0.1; // 0.1 to 10.1 seconds
        const wet = effectConfig['wet-level'] ?? 0.5;

        node = new Tone.Reverb(time);
        node.wet.value = wet;
        node._tingType = 'REVERB';
        break;
      }

      case 'RING': {
        const freq = effectConfig.frequency ?? 400;
        const mix = effectConfig.mix ?? 0.5;

        // Use frequency shifter for ring modulation effect
        node = new Tone.FrequencyShifter(freq);
        node.wet.value = mix;
        node._tingType = 'RING';
        break;
      }

      case 'HARMONY': {
        const pitch = effectConfig.pitch ?? 1;
        // Convert ratio to semitones: pitch of 2 = +12 semitones
        const semitones = Math.log2(pitch) * 12;

        node = new Tone.PitchShift(semitones);
        node.wet.value = 1 - (effectConfig['dry-level'] ?? 0);
        node._tingType = 'HARMONY';
        break;
      }

      case 'SSB': {
        const freq = effectConfig.frequency ?? 0;
        node = new Tone.FrequencyShifter(freq);
        node._tingType = 'SSB';
        break;
      }

      case 'SAMPLE': {
        // SAMPLE is a marker, not an effect - create a pass-through gain
        const level = effectConfig.level ?? 1;
        node = new Tone.Gain(level);
        node._tingType = 'SAMPLE';
        break;
      }

      default:
        // Unknown effect - pass through
        node = new Tone.Gain(1);
        node._tingType = 'UNKNOWN';
    }

    return node;
  }

  buildChain(presetConfig) {
    // Dispose existing effects
    this.disposeEffects();

    // Guard: if player not initialized yet, skip
    if (!this.player) return;

    if (!presetConfig || !presetConfig.list || presetConfig.list.length === 0) {
      // No effects - connect player directly to master
      this.player.disconnect();
      this.player.connect(this.masterGain);
      return;
    }

    const effectList = presetConfig.list;

    // For preview: process all effects except SAMPLE (which is just a marker)
    // In typical presets, SAMPLE is at the end and effects before it shape the sound
    const effectsToProcess = effectList.filter(e => e.effect !== 'SAMPLE');

    // Create effect nodes
    effectsToProcess.forEach(config => {
      const node = this.createEffect(config);
      if (node) {
        this.effectNodes.push(node);
        this.effectChain.push(config);
      }
    });

    // Disconnect player
    this.player.disconnect();

    // Build the signal chain
    if (this.effectNodes.length === 0) {
      this.player.connect(this.masterGain);
    } else {
      // Connect player to first effect
      let currentNode = this.effectNodes[0];
      this.player.connect(currentNode);

      // Chain effects together
      for (let i = 0; i < this.effectNodes.length - 1; i++) {
        const fromNode = this.effectNodes[i];
        const toNode = this.effectNodes[i + 1];

        // Handle compound effects (like DIST) that have custom output
        const output = fromNode._output || fromNode;
        output.connect(toNode);
      }

      // Connect last effect to master
      const lastNode = this.effectNodes[this.effectNodes.length - 1];
      const lastOutput = lastNode._output || lastNode;
      lastOutput.connect(this.masterGain);
    }
  }

  updateParameter(effectIndex, param, value) {
    // Find the actual node index in our chain
    // effectIndex is the index in the preset's list array
    const preset = appState.presets[appState.selectedSlot];
    if (!preset || !preset.list) return;

    const effectConfig = preset.list[effectIndex];
    if (!effectConfig || effectConfig.effect === 'SAMPLE') return;

    // Find the corresponding node index (count non-SAMPLE effects before this one)
    let nodeIndex = 0;
    for (let i = 0; i < effectIndex; i++) {
      if (preset.list[i].effect !== 'SAMPLE') {
        nodeIndex++;
      }
    }

    if (nodeIndex >= this.effectNodes.length) return;

    const node = this.effectNodes[nodeIndex];
    if (!node) return;

    // Update the node based on effect type
    switch (node._tingType) {
      case 'BALANCE':
        node.pan.value = value * 2 - 1;
        break;
      case 'LOWPASS':
      case 'HIGHPASS':
        node.frequency.value = this.cutoffToFreq(value);
        break;
      case 'DIST':
        if (param === 'amount') {
          node._distortion.distortion = value / 40;
        } else if (param === 'mix') {
          node._distortion.wet.value = value;
        } else if (param === 'lowpass-cutoff') {
          node._lowpass.frequency.value = this.cutoffToFreq(value);
        } else if (param === 'highpass-cutoff') {
          node._highpass.frequency.value = this.cutoffToFreq(value);
        }
        break;
      case 'DELAY':
        if (param === 'time') {
          node.delayTime.value = value;
        } else if (param === 'echo') {
          node.feedback.value = value;
        } else if (param === 'wet-level') {
          node.wet.value = value;
        }
        break;
      case 'REVERB':
        if (param === 'time') {
          node.decay = value * 10 + 0.1;
        } else if (param === 'wet-level') {
          node.wet.value = value;
        }
        break;
      case 'RING':
        if (param === 'frequency') {
          node.frequency.value = value;
        } else if (param === 'mix') {
          node.wet.value = value;
        }
        break;
      case 'HARMONY':
        if (param === 'pitch') {
          node.pitch = Math.log2(value) * 12;
        } else if (param === 'dry-level') {
          node.wet.value = 1 - value;
        }
        break;
      case 'SSB':
        if (param === 'frequency') {
          node.frequency.value = value;
        }
        break;
      case 'SAMPLE':
        if (param === 'level') {
          node.gain.value = value;
        }
        break;
    }
  }

  async play() {
    await this.init();
    // Always ensure the correct sample is loaded based on app state
    if (!this.player.loaded || this.currentSample !== appState.selectedSample) {
      await this.loadSample(appState.selectedSample);
    }
    // Rebuild chain for current preset (in case import happened before init)
    const preset = appState.presets[appState.selectedSlot];
    this.buildChain(preset);
    this.player.start();
  }

  stop() {
    if (this.player) {
      this.player.stop();
    }
  }
}

// Global audio engine instance
const audioEngine = new AudioEngine();

// =====================================================
// UI RENDERING
// =====================================================

function renderEffectCard(effectConfig, index) {
  const effectDef = EFFECTS[effectConfig.effect];
  const isSample = effectConfig.effect === 'SAMPLE';

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

  return `
    <div class="effect-card ${isSample ? 'effect-card--sample' : ''}" data-index="${index}">
      <div class="effect-card__header">
        <div class="effect-card__left">
          <span class="effect-card__drag">&#9776;</span>
          <span class="effect-card__row">${index}</span>
          <span class="effect-card__name">${effectConfig.effect}</span>
        </div>
        <button class="effect-card__delete" data-index="${index}" title="remove">×</button>
      </div>
      ${paramsHtml ? `<div class="effect-card__params">${paramsHtml}</div>` : ''}
    </div>
  `;
}

function renderEffectList() {
  const effectList = document.getElementById('effectList');
  const preset = appState.presets[appState.selectedSlot];

  if (!preset || !preset.list || preset.list.length === 0) {
    effectList.innerHTML = '<div class="effect-list--empty">no effects - add one below</div>';
    return;
  }

  effectList.innerHTML = preset.list.map((effect, index) =>
    renderEffectCard(effect, index)
  ).join('');

  // Initialize SortableJS
  initSortable();
}

function renderPresetSlots() {
  for (let i = 0; i < 4; i++) {
    const slot = document.querySelector(`.preset-slot[data-slot="${i}"]`);
    const nameEl = document.getElementById(`slotName${i}`);
    const preset = appState.presets[i];

    slot.classList.toggle('preset-slot--active', i === appState.selectedSlot);
    nameEl.textContent = preset ? preset.name || 'unnamed' : 'empty';
  }
}

function renderPresetEditor() {
  const preset = appState.presets[appState.selectedSlot];

  document.getElementById('presetName').value = preset?.name || '';
  document.getElementById('presetComment').value = preset?.comment || '';

  renderEffectList();
  renderModulationPanels();
}

function renderModulationPanels() {
  const preset = appState.presets[appState.selectedSlot];
  const effectList = preset?.list || [];

  // Populate row selectors
  const rowOptions = effectList.map((e, i) =>
    `<option value="${i}">${i}: ${e.effect}</option>`
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

function updateParamOptions(modType, rowIndex) {
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

function renderEffectPicker() {
  const picker = document.getElementById('effectPicker');
  const effectNames = Object.keys(EFFECTS);

  picker.innerHTML = effectNames.map(name => `
    <div class="effect-picker__item ${name === 'SAMPLE' ? 'effect-picker__item--sample' : ''}" data-effect="${name}">
      ${name}
    </div>
  `).join('');
}

// =====================================================
// DRAG AND DROP
// =====================================================

let sortableInstance = null;

function initSortable() {
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

// =====================================================
// EVENT HANDLERS
// =====================================================

function setupEventListeners() {
  // Pack name
  document.getElementById('packName').addEventListener('input', (e) => {
    appState.packName = e.target.value.toUpperCase();
    saveState();
  });

  // Sample selection
  document.getElementById('singSampleBtn').addEventListener('click', () => selectSample('singing'));
  document.getElementById('spokenSampleBtn').addEventListener('click', () => selectSample('spoken'));

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

  // Import
  document.getElementById('importFile').addEventListener('change', handleImport);

  // Export
  document.getElementById('exportBtn').addEventListener('click', handleExport);
}

// =====================================================
// STATE MANAGEMENT FUNCTIONS
// =====================================================

function ensurePreset() {
  if (!appState.presets[appState.selectedSlot]) {
    appState.presets[appState.selectedSlot] = {
      name: '',
      comment: '',
      list: []
    };
  }
}

function selectSlot(index) {
  appState.selectedSlot = index;
  renderPresetSlots();
  renderPresetEditor();

  const preset = appState.presets[index];
  audioEngine.buildChain(preset);
  saveState();
}

function clearSlot(index) {
  appState.presets[index] = null;
  renderPresetSlots();

  if (index === appState.selectedSlot) {
    renderPresetEditor();
    audioEngine.buildChain(null);
  }
  saveState();
}

async function selectSample(sampleType) {
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

async function togglePlayback() {
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const playText = document.getElementById('playText');

  if (appState.isPlaying) {
    audioEngine.stop();
    appState.isPlaying = false;
    playBtn.classList.remove('play-btn--playing');
    playIcon.innerHTML = '&#9654;';
    playText.textContent = 'play';
  } else {
    await audioEngine.play();
    appState.isPlaying = true;
    playBtn.classList.add('play-btn--playing');
    playIcon.innerHTML = '&#9632;';
    playText.textContent = 'stop';
  }
}

function addEffect(effectName) {
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

  preset.list.push(effectConfig);

  renderEffectList();
  renderModulationPanels();
  renderPresetSlots();

  audioEngine.buildChain(preset);
  saveState();
}

function removeEffect(index) {
  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list) return;

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

function updateEffectParam(index, param, value) {
  const preset = appState.presets[appState.selectedSlot];
  if (!preset || !preset.list || !preset.list[index]) return;

  preset.list[index][param] = value;

  // Update audio engine in real-time
  audioEngine.updateParameter(index, param, value);
  saveState();
}

function updateHandleModulation() {
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
  saveState();
}

function updateShakeModulation() {
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
  saveState();
}

function updateLfoModulation() {
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

function updateTrigger() {
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

// =====================================================
// MODAL
// =====================================================

function openEffectModal() {
  document.getElementById('effectModal').classList.add('modal--open');
}

function closeEffectModal() {
  document.getElementById('effectModal').classList.remove('modal--open');
}

// =====================================================
// IMPORT / EXPORT
// =====================================================

function handleImport(e) {
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
          appState.presets[pos] = {
            name: preset.name || '',
            comment: preset.comment || '',
            list: preset.list || [],
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

function handleExport() {
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

// =====================================================
// TOAST NOTIFICATIONS
// =====================================================

function showToast(message, type = 'info') {
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

// =====================================================
// INITIALIZATION
// =====================================================

// =====================================================
// LOCAL STORAGE PERSISTENCE
// =====================================================

const STORAGE_KEY = 'ting-preset-editor-state';

function saveState() {
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

function loadState() {
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

// =====================================================
// INITIALIZATION
// =====================================================

function init() {
  // Load saved state first
  loadState();

  // Update sample button UI
  document.getElementById('singSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'singing');
  document.getElementById('spokenSampleBtn').classList.toggle('sample-btn--active', appState.selectedSample === 'spoken');

  renderEffectPicker();
  renderPresetSlots();
  renderPresetEditor();
  setupEventListeners();

  // Initialize audio engine and load the saved sample
  audioEngine.init().then(() => {
    audioEngine.loadSample(appState.selectedSample);
  });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
