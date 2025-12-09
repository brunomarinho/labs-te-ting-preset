// Effects that can only be added once per preset
export const SINGLE_INSTANCE_EFFECTS = ['SSB', 'REVERB', 'HARMONY', 'DELAY'];

// Effect definitions with parameter ranges and defaults
export const EFFECTS = {
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
      'cross-feed': { min: 0, max: 1, default: 0 },
      balance: { min: 0, max: 1, default: 0.5 }
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

// Display name mapping (internal SAMPLE -> UI "MIC IN")
export function getEffectDisplayName(effectName) {
  return effectName === 'SAMPLE' ? 'MIC IN' : effectName;
}

// Create a default SAMPLE config
export function createDefaultSampleConfig() {
  const sampleDef = EFFECTS.SAMPLE;
  const config = { effect: 'SAMPLE' };
  Object.entries(sampleDef.params).forEach(([param, def]) => {
    config[param] = def.default;
  });
  return config;
}
