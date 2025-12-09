# Ting Preset Editor

An unofficial web-based preset editor for the [Teenage Engineering EP-2350 Ting](https://teenage.engineering/products/ep-2350) microphone.

Create, edit, and export custom effect chains and modulation settings without using the official app.

**Live demo:** [ting.brunomarinho.com](https://ting.brunomarinho.com)

## Features

- **Effect Chain Builder** - Add and reorder effects with drag-and-drop
- **Real-time Audio Preview** - Hear your presets with sample audio
- **Modulation Settings** - Configure handle, shake, LFO, and trigger
- **Import/Export** - Load existing presets or export for use on the device
- **4 Preset Slots** - Just like the actual device
- **Keyboard Shortcuts** - Quick access to playback and modulation

## Supported Effects

| Effect | Parameters |
|--------|------------|
| BALANCE | balance |
| LOWPASS | cutoff |
| HIGHPASS | cutoff |
| DIST | amount, mix, lowpass-cutoff, highpass-cutoff |
| DELAY* | time, echo, wet-level, dry-level, lowpass-cutoff, highpass-cutoff, cross-feed, balance |
| REVERB* | time, wet-level, dry-level, spring-mix, highpass-cutoff |
| RING | frequency, mix |
| HARMONY* | pitch, dry-level |
| SSB* | frequency |

*Single instance only (can only be added once per preset)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Stop |
| `H` | Toggle handle modulation |
| `S` | Hold for shake modulation |

## Usage

1. Select a preset slot (1-4)
2. Add effects using the "+ add effect" button
3. Adjust parameters with the sliders
4. Configure modulation (handle, shake, LFO, trigger)
5. Preview with the play button
6. Export your config.json file
7. Copy to your EP-2350 device

## How to Load on Device

1. Connect your EP-2350 to your computer via USB
2. The device will appear as a storage device
3. Replace or merge with the existing `config.json` file
4. Safely eject and restart the device

## Development

This is a static site with no build step required.

```bash
# Clone the repository
git clone https://github.com/brunomarinho/labs-te-ting-preset.git

# Serve locally (any static server works)
npx serve .
```

### Project Structure

```
├── index.html          # Main HTML
├── styles.css          # Styles
├── js/
│   ├── app.js          # Entry point
│   ├── effects.js      # Effect definitions
│   ├── events.js       # Event handlers
│   ├── ui.js           # UI rendering
│   ├── state.js        # App state
│   ├── storage.js      # LocalStorage
│   └── audio-engine.js # Tone.js audio
├── samples/            # Preview audio files
└── examples/           # Example preset packs
```

## Disclaimer

This is an unofficial tool and is not affiliated with Teenage Engineering.

If the device freezes after loading a preset, connect to a computer and hold the green + white buttons during startup to access and fix the config file.

For official documentation, visit the [EP-2350 Guide](https://teenage.engineering/guides/ep-2350).

## Credits

A tiny tool by [Bruno Marinho](https://brunomarinho.com)
