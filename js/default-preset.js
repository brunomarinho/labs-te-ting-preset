// Default preset pack, seeded into state on first run when localStorage is empty.
// Source: Broken Radio Pack (config.json). Keep this shape identical to a device config.json.
export const DEFAULT_PACK = {
  "name": "BROKEN RADIO PACK",
  "presets": [
    {
      "pos": 0,
      "name": "WALKIE TALKIE",
      "comment": "bandpass filter + dist. handle tunes frequency.",
      "list": [
        {
          "effect": "HIGHPASS",
          "cutoff": 0.1
        },
        {
          "effect": "LOWPASS",
          "cutoff": 0.4
        },
        {
          "effect": "DIST",
          "amount": 15,
          "mix": 0.5
        },
        {
          "effect": "SAMPLE"
        }
      ],
      "handle": {
        "row": 1,
        "param": "cutoff",
        "depth": 0.5
      },
      "shake": {
        "row": 2,
        "param": "mix",
        "depth": 0.5
      },
      "trigger": {
        "row": 3
      }
    },
    {
      "pos": 1,
      "name": "AM TUNER",
      "comment": "ssb frequency shift. handle searches for station.",
      "list": [
        {
          "effect": "SSB",
          "frequency": -500
        },
        {
          "effect": "DIST",
          "amount": 5,
          "mix": 0.2
        },
        {
          "effect": "SAMPLE"
        }
      ],
      "handle": {
        "row": 0,
        "param": "frequency",
        "depth": 1000
      },
      "shake": {
        "row": 0,
        "param": "frequency",
        "depth": 200
      },
      "trigger": {
        "row": 2
      }
    },
    {
      "pos": 2,
      "name": "CRYPTIC",
      "comment": "ring modulator. handle changes pitch tone.",
      "list": [
        {
          "effect": "RING",
          "frequency": 100,
          "mix": 0.8
        },
        {
          "effect": "REVERB",
          "time": 0.5,
          "wet-level": 0.4
        },
        {
          "effect": "SAMPLE"
        }
      ],
      "handle": {
        "row": 0,
        "param": "frequency",
        "depth": 2000
      },
      "lfo": {
        "row": 0,
        "param": "frequency",
        "depth": 50,
        "shape": "random",
        "speed": 8
      },
      "trigger": {
        "row": 2
      }
    },
    {
      "pos": 3,
      "name": "LOSING SIGNAL",
      "comment": "sound gets choppy and distant when handle is pushed.",
      "list": [
        {
          "effect": "BALANCE",
          "balance": 0.5
        },
        {
          "effect": "REVERB",
          "time": 1,
          "wet-level": 0,
          "dry-level": 1
        },
        {
          "effect": "SAMPLE"
        }
      ],
      "handle": {
        "row": 1,
        "param": "wet-level",
        "depth": 1
      },
      "lfo": {
        "row": 0,
        "param": "balance",
        "depth": 1,
        "shape": "square",
        "speed": 10
      },
      "shake": {
        "row": 1,
        "param": "dry-level",
        "depth": -1
      },
      "trigger": {
        "row": 2
      }
    }
  ]
};
