# Ting Preset Editor

An unofficial web-based preset editor for the [Teenage Engineering EP-2350 Ting](https://teenage.engineering/products/ep-2350) microphone.

Create, edit, and export custom effect chains and modulation settings without using the official app.

**Live demo:** [ting.brunomarinho.com](https://ting.brunomarinho.com)

## Features

- **Effect Chain Builder** - Add and reorder effects with drag-and-drop
- **Real-time Audio Preview** - Hear your presets with sample audio (emulation mode)
- **Live Hardware Connection** - Connect to your Ting via Web Serial to tweak parameters and sync presets
- **Save to Device** - Write presets directly to device config.json
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

## Preview Modes

### Emulation Mode
Uses Tone.js in the browser to simulate effects. Full editing capabilities - add, remove, reorder effects and adjust parameters with real-time audio preview. **Recommended for designing presets.**

### Live Hardware Mode
Connects to your Ting via Web Serial and allows parameter tweaking and preset switching on the actual device.

**Requirements:**
- Chrome, Edge, or other Chromium-based browser (Web Serial required)
- Ting connected via USB
- Audio output from Ting routed to speakers/headphones

**To use Live Mode:**
1. Click "live" toggle in the header
2. Click "connect device" and select your EP-2350
3. Presets are imported from the device
4. Adjust sliders - changes are sent when you release the slider
5. Click "save to device" to write changes to config.json

**Live Mode Limitations:**
- Parameter changes are sent on slider release (not during drag) to prevent device freeze
- Adding, removing, or reordering effects is disabled - use Emulation mode for structural changes
- Preset slot switching syncs between app and hardware button

## Usage

### Recommended Workflow
1. Use **Emulation mode** to design and preview your presets
2. Add effects, adjust parameters, configure modulation
3. Preview with the play button (uses browser audio)
4. Connect to device in **Live mode** to transfer presets
5. Click "save to device" to write to the device

### Manual Export
1. Design presets in Emulation mode
2. Click "export json" to download config.json
3. Connect EP-2350 via USB (appears as storage device)
4. Replace the existing `config.json` file
5. Safely eject and restart the device

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
│   ├── audio-engine.js # Tone.js audio
│   └── webusb.js       # WebUSB device control
├── samples/            # Preview audio files
└── examples/           # Example preset packs
```

## Disclaimer

This is an unofficial tool and is not affiliated with Teenage Engineering.

If the device freezes after loading a preset, connect to a computer and hold the green + white buttons during startup to access and fix the config file.

For official documentation, visit the [EP-2350 Guide](https://teenage.engineering/guides/ep-2350).

## Credits

A tiny tool by [Bruno Marinho](https://brunomarinho.com)
