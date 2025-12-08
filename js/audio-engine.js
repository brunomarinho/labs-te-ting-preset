import { EFFECTS } from './effects.js';
import { appState } from './state.js';

export class AudioEngine {
  constructor() {
    this.player = null;
    this.effectChain = [];
    this.effectNodes = [];
    this.masterGain = null;
    this.isInitialized = false;
    this.currentSample = 'singing';
    // Modulation simulation state
    this.handleActive = false;
    this.shakeActive = false;
    this.baseParamValues = {}; // Store original param values for modulation
    this.lfo = null;
    this.lfoGain = null;
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

  // Store base parameter value before modulation
  storeBaseValue(row, param, value) {
    const key = `${row}-${param}`;
    if (!(key in this.baseParamValues)) {
      this.baseParamValues[key] = value;
    }
  }

  getBaseValue(row, param) {
    const key = `${row}-${param}`;
    return this.baseParamValues[key];
  }

  // Apply modulation to a parameter
  applyModulation(modConfig, depth) {
    if (!modConfig || modConfig.row === undefined) return;

    const preset = appState.presets[appState.selectedSlot];
    if (!preset || !preset.list) return;

    const effect = preset.list[modConfig.row];
    if (!effect) return;

    const param = modConfig.param;
    const effectDef = EFFECTS[effect.effect];
    if (!effectDef || !effectDef.params || !effectDef.params[param]) return;

    const paramDef = effectDef.params[param];
    const currentValue = effect[param] ?? paramDef.default;

    // Store base value if not stored
    this.storeBaseValue(modConfig.row, param, currentValue);
    const baseValue = this.getBaseValue(modConfig.row, param);

    // Calculate modulated value
    const range = paramDef.max - paramDef.min;
    const modAmount = range * depth * modConfig.depth;
    const newValue = Math.max(paramDef.min, Math.min(paramDef.max, baseValue + modAmount));

    // Apply to audio engine
    this.updateParameter(modConfig.row, param, newValue);
  }

  // Reset parameter to base value
  resetModulation(modConfig) {
    if (!modConfig || modConfig.row === undefined) return;

    const baseValue = this.getBaseValue(modConfig.row, modConfig.param);
    if (baseValue !== undefined) {
      this.updateParameter(modConfig.row, modConfig.param, baseValue);
    }
  }

  // Handle modulation (toggle on/off)
  setHandleActive(active) {
    this.handleActive = active;
    const preset = appState.presets[appState.selectedSlot];

    if (active && preset?.handle) {
      this.applyModulation(preset.handle, 1.0);
    } else if (preset?.handle) {
      this.resetModulation(preset.handle);
    }
  }

  // Shake modulation (momentary)
  setShakeActive(active) {
    this.shakeActive = active;
    const preset = appState.presets[appState.selectedSlot];

    if (active && preset?.shake) {
      this.applyModulation(preset.shake, 1.0);
    } else if (preset?.shake) {
      this.resetModulation(preset.shake);
    }
  }

  // Start LFO modulation
  startLfo() {
    const preset = appState.presets[appState.selectedSlot];
    if (!preset?.lfo) return;

    this.stopLfo(); // Stop any existing LFO

    const lfoConfig = preset.lfo;
    const effect = preset.list?.[lfoConfig.row];
    if (!effect) return;

    const param = lfoConfig.param;
    const effectDef = EFFECTS[effect.effect];
    if (!effectDef?.params?.[param]) return;

    const paramDef = effectDef.params[param];
    const baseValue = effect[param] ?? paramDef.default;
    this.storeBaseValue(lfoConfig.row, param, baseValue);

    // Create LFO using requestAnimationFrame for simplicity
    const range = paramDef.max - paramDef.min;
    const depth = lfoConfig.depth || 0.5;
    const speed = lfoConfig.speed || 1;
    const shape = lfoConfig.shape || 'sine';

    let startTime = performance.now();

    const updateLfo = () => {
      if (!this.lfoActive) return;

      const elapsed = (performance.now() - startTime) / 1000;
      const phase = elapsed * speed * 2 * Math.PI;

      let modValue;
      switch (shape) {
        case 'square':
          modValue = Math.sin(phase) > 0 ? 1 : -1;
          break;
        case 'sawtooth':
          modValue = ((elapsed * speed) % 1) * 2 - 1;
          break;
        case 'random':
          if (Math.floor(elapsed * speed * 4) !== this._lastRandomStep) {
            this._lastRandomStep = Math.floor(elapsed * speed * 4);
            this._randomValue = Math.random() * 2 - 1;
          }
          modValue = this._randomValue || 0;
          break;
        default: // sine
          modValue = Math.sin(phase);
      }

      const modAmount = range * depth * modValue;
      const newValue = Math.max(paramDef.min, Math.min(paramDef.max, baseValue + modAmount));
      this.updateParameter(lfoConfig.row, param, newValue);

      this.lfoAnimationFrame = requestAnimationFrame(updateLfo);
    };

    this.lfoActive = true;
    this._lastRandomStep = -1;
    this._randomValue = 0;
    updateLfo();
  }

  stopLfo() {
    this.lfoActive = false;
    if (this.lfoAnimationFrame) {
      cancelAnimationFrame(this.lfoAnimationFrame);
      this.lfoAnimationFrame = null;
    }

    // Reset LFO parameter to base value
    const preset = appState.presets[appState.selectedSlot];
    if (preset?.lfo) {
      this.resetModulation(preset.lfo);
    }
  }

  // Clear stored base values (call when switching presets)
  clearBaseValues() {
    this.baseParamValues = {};
  }
}

// Global audio engine instance
export const audioEngine = new AudioEngine();
