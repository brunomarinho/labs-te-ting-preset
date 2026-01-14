# Teenage Engineering EP-2350 (Ting) REPL API Reference

This document describes the MicroPython REPL API available on the Teenage Engineering EP-2350 Ting microphone. This API can be used to control the device programmatically via USB serial connection.

## Connection

| Property | Value |
|----------|-------|
| Vendor ID | `0x2367` (9063) |
| Product ID | `0x0620` (1568) |
| Device Name | TEENAGE ENGINEERING EP-2350 |
| Protocol | MicroPython REPL over USB Serial |
| Baud Rate | 115200 |
| Data Bits | 8 |
| Stop Bits | 1 |
| Parity | None |

### Connection Methods

**Using mpremote (Python tool):**
```bash
mpremote connect /dev/cu.usbmodemEPTXN3D61 repl
```

**Using Web Serial API (Browser):**
```javascript
const port = await navigator.serial.requestPort({
  filters: [{ usbVendorId: 0x2367, usbProductId: 0x0620 }]
});
await port.open({ baudRate: 115200 });
```

### Initialization

After connecting, send `Ctrl+C` (`\x03`) to interrupt any running program and get a clean REPL prompt (`>>>`). Then import the required modules:

```python
import fx, teenage, ui
```

---

## Modules Overview

| Module | Description |
|--------|-------------|
| `fx` | Effects control - the main API for managing presets and parameters |
| `teenage` | State properties - current slot position, primed states |
| `ui` | Hardware inputs - handle position, accelerometer, LEDs, buttons |
| `spl` | Signal processing - sample loading and triggering |

---

## fx Module - Effects Control

The `fx` module is the primary interface for controlling effects and presets.

### Core Functions

#### `fx.map()`
Shows all available effects with their parameters and value ranges.

**Returns:** Prints formatted text output

**Example:**
```python
>>> fx.map()
0 NONE:
    nothing             [0.00,0.00]
1 LOWPASS:
    cutoff              [0.00,1.00]
2 DELAY:
    time                [0.00,1.10]
    lowpass-cutoff      [0.00,1.00]
    highpass-cutoff     [0.00,1.00]
    wet-level           [0.00,1.00]
    dry-level           [0.00,1.00]
    echo                [0.00,1.00]
    cross-feed          [0.00,1.00]
    balance             [0.00,1.00]
...
```

#### `fx.timing()`
Shows CPU cycle usage per effect (profiling/debugging).

**Returns:** Prints formatted text output

**Example:**
```python
>>> fx.timing()
          effect : cycles,    c/s
      compressor :   1195,     37
       noisegate :   2231,     69
          SAMPLE :     76,      2
             SUM :   3509,    109
```

#### `fx.list_preset(slot)`
Shows the preset definition (effect chain + modulation configuration) for a slot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |

**Returns:** Prints formatted text output (does not return a value)

**Example:**
```python
>>> fx.list_preset(0)
0 [ 8 HIGHPASS ]
    cutoff              0.30
1 [ 1 LOWPASS ]
    cutoff              0.40
2 [ 4 DIST ]
    amount              15.00
    highpass-cutoff     0.20
    lowpass-cutoff      0.80
    mix                 0.60
3 [ 6 SAMPLE ]
    speed               1.00
    pitch               0.00
    level               1.00
    balance             0.50

HANDLE:
    row                    1
    param                  0
    depth               0.50
```

#### `fx.list_loaded(slot)`
Shows the currently active/loaded effects for a slot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |

**Returns:** Prints formatted text output

#### `fx.load_preset(slot)`
Loads a preset into the active state, making it the current slot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |

**Returns:** `True` on success

**Example:**
```python
>>> fx.load_preset(0)
True
```

#### `fx.param(slot, row, param, value)`
Sets an effect parameter in real-time. This is the main function for live control.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Effect row/position in chain (0-n) |
| `param` | str | Parameter name (e.g., "cutoff", "frequency") |
| `value` | float | Parameter value |

**Returns:** `True` on success

**Example:**
```python
>>> fx.param(0, 0, "cutoff", 0.75)
True
>>> fx.param(0, 1, "frequency", 500.0)
True
```

#### `fx.flip()`
Toggles effects on/off (bypass).

**Returns:** None

**Example:**
```python
>>> fx.flip()
```

### Effect Chain Manipulation

#### `fx.add(slot, effect_id)`
Adds an effect to the end of the chain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `effect_id` | int | Effect type ID (see Effect Types) |

**Returns:** Row index where the effect was added

**Example:**
```python
>>> fx.add(0, 1)  # Add LOWPASS to slot 0
1
>>> fx.list_loaded(0)
0 [ 6 SAMPLE ]
    speed               1.00
    ...
1 [ 1 LOWPASS ]
    cutoff              1.00
```

#### `fx.insert(slot, row, effect_id)`
Inserts an effect at a specific position in the chain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Position to insert at |
| `effect_id` | int | Effect type ID |

**Returns:** `True` on success

**Example:**
```python
>>> fx.insert(0, 0, 8)  # Insert HIGHPASS at row 0
True
```

#### `fx.remove(slot, row)`
Removes an effect from the chain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Effect row to remove |

**Returns:** Effect ID that was removed

**Example:**
```python
>>> fx.remove(0, 1)
1  # Returns the effect_id (LOWPASS) that was removed
```

#### `fx.clear(slot)`
Clears ALL effects from a slot (including SAMPLE).

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |

**Returns:** None

**Warning:** This removes everything including SAMPLE. You may need to re-add it:
```python
>>> fx.clear(0)
>>> fx.add(0, 6)  # Re-add SAMPLE
0
```

### Preset Configuration Functions

These functions modify the stored preset definition (not the live state).

#### `fx.preset_param(slot, row, param, value)`
Modifies a parameter in the stored preset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Effect row |
| `param` | str | Parameter name |
| `value` | float | New value |

**Returns:** `True` on success, `False` on failure

#### `fx.preset_handle(slot, key, value)`
Configures handle modulation for a preset (one key at a time).

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `key` | str | Parameter key: `'row'`, `'param'`, `'depth'` |
| `value` | int/float/str | Parameter value |

**Returns:** `True` on success, `False` on failure

**Example:**
```python
>>> fx.preset_handle(0, 'row', 1)      # Target row 1
>>> fx.preset_handle(0, 'param', 'cutoff')  # Modulate 'cutoff'
>>> fx.preset_handle(0, 'depth', 0.5)  # Modulation depth
>>> fx.preset_handle(0, 'row', -1)     # Disable handle modulation
```

#### `fx.preset_shake(slot, key, value)`
Configures shake modulation for a preset (one key at a time).

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `key` | str | Parameter key: `'row'`, `'param'`, `'depth'` |
| `value` | int/float/str | Parameter value |

**Returns:** `True` on success, `False` on failure

**Example:**
```python
>>> fx.preset_shake(0, 'row', 2)
>>> fx.preset_shake(0, 'param', 'amount')
>>> fx.preset_shake(0, 'depth', 1.0)
```

#### `fx.preset_lfo(slot, key, value)`
Configures LFO modulation for a preset (one key at a time).

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `key` | str | `'row'`, `'param'`, `'depth'`, `'shape'`, `'speed'`, `'phase'`, `'mpy'` |
| `value` | int/float/str | Parameter value |

**Returns:** `True` on success, `False` on failure

**Example:**
```python
>>> fx.preset_lfo(0, 'row', 0)
>>> fx.preset_lfo(0, 'param', 'cutoff')
>>> fx.preset_lfo(0, 'depth', 0.3)
>>> fx.preset_lfo(0, 'shape', 'sine')   # sine, square, sawtooth, random
>>> fx.preset_lfo(0, 'speed', 2.0)
```

#### `fx.preset_trigger_row(slot, row)`
Sets which effect row is triggered by the sample trigger.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Effect row to trigger |

**Returns:** `True` on success

**Example:**
```python
>>> fx.preset_trigger_row(0, 0)
True
```

#### `fx.preset_mods_disable(slot)`
Disables all modulation (handle, shake, LFO) for a preset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |

**Returns:** `True` on success

**Example:**
```python
>>> fx.preset_mods_disable(0)
True
```

### Live Modulation Functions

These functions control modulation in real-time.

#### `fx.handle(slot, param)`
Applies handle modulation to a parameter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `param` | str | Parameter name to modulate |

**Returns:** `True` on success, `False` on failure

#### `fx.shake(slot, param)`
Applies shake modulation to a parameter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `param` | str | Parameter name to modulate |

**Returns:** `True` on success, `False` on failure

#### `fx.lfo(slot, param)`
Applies LFO modulation to a parameter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `param` | str | Parameter name to modulate |

**Returns:** `True` on success, `False` on failure

### Preset Effect Configuration

#### `fx.preset(slot, row, effect_name)`
Sets the effect type at a specific row in a preset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Preset slot (0-3) |
| `row` | int | Effect row (0-15) |
| `effect_name` | str | Effect name or `'END'` to mark end of chain |

**Returns:** `True` on success

**Example:**
```python
>>> fx.preset(0, 0, 'LOWPASS')  # Set row 0 to LOWPASS
True
>>> fx.preset(0, 1, 'REVERB')   # Set row 1 to REVERB
True
>>> fx.preset(0, 2, 'END')      # Mark end of chain
True
```

**Valid Effect Names:**
`'NONE'`, `'LOWPASS'`, `'DELAY'`, `'REVERB'`, `'DIST'`, `'HARMONY'`, `'SAMPLE'`, `'BALANCE'`, `'HIGHPASS'`, `'SSB'`, `'RING'`, `'END'`

---

## ui Module - Hardware Inputs

The `ui` module provides access to hardware inputs and LED control.

### Handle & Sensors

#### `ui.handle()`
Returns the current handle position.

**Returns:** `float` (0.0 = released, 1.0 = fully pushed)

**Example:**
```python
>>> ui.handle()
0.0
>>> ui.handle()
0.75
```

#### `ui.handle_raw()`
Returns the raw ADC value from the handle sensor.

**Returns:** `float`

#### `ui.acc()`
Returns accelerometer values for shake detection.

**Returns:** `list` of `[x, y, z]` values

**Example:**
```python
>>> ui.acc()
[2432, 624, 15776]
```

#### `ui.shaker()`
Returns the current shake intensity.

**Returns:** `float` (typically very small when at rest, e.g., 3.097807e-20)

**Example:**
```python
>>> ui.shaker()
3.097807e-20
```

#### `ui.adc()`
Returns raw ADC values from all analog channels.

**Returns:** `list` of 5 int values

**Example:**
```python
>>> ui.adc()
[1022, 2042, 1951, 4076, 709]
```

### Device Status

#### `ui.get_temp()`
Returns the device temperature.

**Returns:** `float`

#### `ui.get_vbat()`
Returns the battery voltage.

**Returns:** `float`

**Example:**
```python
>>> ui.get_vbat()
4.12
```

#### `ui.get_vbus()`
Returns the USB bus voltage.

**Returns:** `float`

### Button/Switch Access

#### `ui.sw(index)`
Returns the state of a button/switch.

| Parameter | Type | Description |
|-----------|------|-------------|
| `index` | int | Button index (0-4) |

**Returns:** `int` - 1 = not pressed, 0 = pressed, -1 = invalid index

**Example:**
```python
>>> ui.sw(0)  # Check button 0
1  # Not pressed
>>> ui.sw(4)  # Check button 4 (possibly handle trigger)
0  # Pressed/active
>>> ui.sw(7)  # Invalid index
-1
```

**Button Indices:**
- 0-3: Physical buttons (orange, green, white, ?)
- 4: Possibly handle trigger state

### LED Control

The device has 8 LEDs in two columns:
- **Orange LEDs (0-3):** Preset/FX slot indicators
- **White LEDs (4-7):** Sample slot indicators

#### `ui.leds(fx_pos, sam_pos)`
Sets both LED columns at once based on current FX and sample positions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fx_pos` | int | FX slot position (0-3, or -1 for none) |
| `sam_pos` | int | Sample slot position (0-3) |

**Returns:** None

**Example:**
```python
>>> ui.leds(0, 0)  # FX slot 0 active, sample slot 0 active
>>> ui.leds(2, 1)  # FX slot 2 active, sample slot 1 active
>>> ui.leds(-1, 0) # No FX active, sample slot 0 active
```

**Note:** This function can also be called with a single LED index and state for individual control:
```python
>>> ui.leds(0, 1)  # Turn on orange LED 0
>>> ui.leds(0, 0)  # Turn off orange LED 0
```

#### `ui.led_control(mode)`
Controls LED mode (manual vs automatic).

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | int | Control mode (0 or 1) |

**Returns:** None

#### `ui.led_level(index, brightness)`
Sets LED brightness level.

| Parameter | Type | Description |
|-----------|------|-------------|
| `index` | int | LED index |
| `brightness` | int/float | Brightness level |

**Returns:** `False` (may require specific conditions to work)

### Callback System

#### `ui.callback(func)`
Registers a callback function for hardware events.

| Parameter | Type | Description |
|-----------|------|-------------|
| `func` | function/int | Callback function, or `0` to disable |

**Returns:** None

**Callback Message Format:**
The callback receives a 32-bit integer message:
```python
def my_callback(message):
    mess_type = message >> 16      # Upper 16 bits
    mess_val = message & 0xFFFF    # Lower 16 bits
```

**Message Types:**

| Type | Value | Description | Default Action |
|------|-------|-------------|----------------|
| 1 | 0 | White button pressed | `spl.trigger(-1, sam_pos, True)` |
| 1 | 1 | Green button pressed | Start sam_primed countdown (if handle held) |
| 1 | 2 | Orange button pressed | Start fx_primed countdown (if handle held) |
| 2 | 0 | White button released | `spl.trigger(-1, sam_pos, False)` |
| 2 | 1 | Green button released | Cancel sam_primed |
| 2 | 2 | Orange button released | Cancel fx_primed |
| 3 | * | Timer tick | Decrement primed counters, switch slots at 0 |
| 4 | 1 | USB drive ejected | `examine_drive(True)` + reload preset |
| 0x10-0x1F | * | ADC readings | type & 0x0F = ADC channel |

**Primed State:** When green/orange button is held while handle is down (`ui.sw(4) == 0`), a countdown starts. After 10 ticks, the sample/FX slot advances.

**Example:**
```python
def my_callback(message):
    mess_type = message >> 16
    mess_val = message & 0xFFFF
    if mess_type == 1 and mess_val == 0:
        print("White button pressed!")
        spl.trigger(-1, sam_pos, True)

ui.callback(my_callback)
```

### Other ui Functions

| Function | Args | Description |
|----------|------|-------------|
| `ui.shutdown()` | 0 | Shutdown the device |

---

## teenage Module - State Properties

The `teenage` module provides read-only state properties and utility functions.

### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `teenage.fx_pos` | int | Currently selected FX slot (0-3), -1 if none |
| `teenage.fx_primed` | int | Whether FX is active (0 or 1) |
| `teenage.sam_pos` | int | Sample slot position |
| `teenage.sam_primed` | int | Sample primed state |

**Example:**
```python
>>> teenage.fx_pos
0
>>> teenage.fx_primed
1
```

### Utility Functions

#### `teenage.examine_drive(path)`
Examines a filesystem path.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | str | Filesystem path |

**Returns:** Unknown

#### `teenage.python_callback(func)`
Registers a Python callback function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `func` | function | Callback function |

**Returns:** Unknown

### Module References

The `teenage` module also provides references to other modules:
- `teenage.fx` - Reference to fx module
- `teenage.ui` - Reference to ui module
- `teenage.spl` - Reference to spl module
- `teenage.json` - Reference to json module
- `teenage.os` - Reference to os module

---

## spl Module - Signal Processing

The `spl` module handles sample loading and triggering.

#### `spl.init(slot)`
Initializes a sample slot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Sample slot (0-3) |

**Returns:** None

#### `spl.load_wav(slot, file_handle, playmode)`
Loads a WAV file into a sample slot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Sample slot (0-3) |
| `file_handle` | file | Open file handle (opened with `'rb'`) |
| `playmode` | str/int | Playmode: `'oneshot'`, `'startstop'`, `'hold'`, or `0` |

**Returns:** `True` on success, `False` on failure

**Example:**
```python
>>> f = open('/fat/1.wav', 'rb')
>>> spl.load_wav(0, f, 'oneshot')
True
>>> f.close()
```

**Note:** The file must be opened in binary read mode (`'rb'`). If loading fails, call `spl.rom(slot)` to restore the ROM sample.

#### `spl.rom(slot)`
Loads the built-in ROM sample for a slot (restores factory sample).

| Parameter | Type | Description |
|-----------|------|-------------|
| `slot` | int | Sample slot (0-3) |

**Returns:** `True` on success

**Example:**
```python
>>> spl.rom(0)
True
```

#### `spl.trigger(?, slot, start)`
Starts or stops sample playback.

| Parameter | Type | Description |
|-----------|------|-------------|
| `?` | int | Usually `-1` (current context) |
| `slot` | int | Sample slot (0-3) |
| `start` | bool | `True` to start, `False` to stop |

**Returns:** `True` on success

**Example:**
```python
>>> spl.trigger(-1, 0, True)   # Start playing sample 0
True
>>> spl.trigger(-1, 0, False)  # Stop playing sample 0
True
```

---

## Effect Types

### Effect Type IDs

Effects are identified by numeric type IDs:

| ID | Effect | Description |
|----|--------|-------------|
| 0 | NONE | No effect (pass-through) |
| 1 | LOWPASS | Low-pass filter |
| 2 | DELAY | Delay/echo effect |
| 3 | REVERB | Reverb effect |
| 4 | DIST | Distortion |
| 5 | HARMONY | Pitch shifting/harmony |
| 6 | SAMPLE | Internal MIC IN (required) |
| 7 | BALANCE | Stereo balance |
| 8 | HIGHPASS | High-pass filter |
| 9 | SSB | Single sideband (frequency shift) |
| 10 | RING | Ring modulator |

### Effect Parameters

Each effect has specific parameters with defined ranges:

#### NONE (0)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `nothing` | 0.0-0.0 | No parameters |

#### LOWPASS (1)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `cutoff` | 0.0-1.0 | Filter cutoff frequency |

#### DELAY (2)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `time` | 0.0-1.1 | Delay time |
| `lowpass-cutoff` | 0.0-1.0 | Delay lowpass filter |
| `highpass-cutoff` | 0.0-1.0 | Delay highpass filter |
| `wet-level` | 0.0-1.0 | Wet signal level |
| `dry-level` | 0.0-1.0 | Dry signal level |
| `echo` | 0.0-1.0 | Feedback amount |
| `cross-feed` | 0.0-1.0 | Stereo cross-feed |
| `balance` | 0.0-1.0 | Stereo balance |

#### REVERB (3)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `dry-level` | 0.0-1.0 | Dry signal level |
| `wet-level` | 0.0-1.0 | Wet signal level |
| `time` | 0.0-1.0 | Reverb time |
| `spring-mix` | 0.0-1.0 | Spring reverb character |
| `highpass-cutoff` | 0.0-1.0 | Reverb highpass filter |

#### DIST (4)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `amount` | 0.0-40.0 | Distortion amount |
| `highpass-cutoff` | 0.0-1.0 | Pre-distortion highpass |
| `lowpass-cutoff` | 0.0-1.0 | Post-distortion lowpass |
| `mix` | 0.0-1.0 | Dry/wet mix |

#### HARMONY (5)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `dry-level` | 0.0-1.0 | Dry signal level |
| `pitch` | 0.5-2.0 | Pitch multiplier (0.5 = octave down, 2.0 = octave up) |

#### SAMPLE (6)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `speed` | 0.0-4.0 | Playback speed |
| `pitch` | -24.0-24.0 | Pitch adjustment (semitones) |
| `level` | 0.0-1.0 | Output level |
| `balance` | 0.0-1.0 | Stereo balance |

#### BALANCE (7)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `balance` | 0.0-1.0 | Stereo balance (0.5 = center) |

#### HIGHPASS (8)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `cutoff` | 0.0-1.0 | Filter cutoff frequency |

#### SSB (9)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `frequency` | -20000.0-20000.0 | Frequency shift in Hz |

#### RING (10)
| Parameter | Range | Description |
|-----------|-------|-------------|
| `frequency` | 0.0-20000.0 | Modulation frequency |
| `mix` | 0.0-1.0 | Dry/wet mix |

### Effect Routing

Effects can include a `BUS` parameter for routing:
```json
{ "effect": "HARMONY", "pitch": 2.0, "BUS": 2 }
```

---

## Modulation

Presets can have modulation configured for handle, shake, and LFO sources.

### Modulation Types

- **HANDLE:** Position of the handle modulates a parameter
- **SHAKE:** Shaking the device modulates a parameter
- **LFO:** Low-frequency oscillator modulates a parameter
- **TRIGGER:** Which row is triggered by sample playback

### Modulation Configuration Format

```json
{
  "handle": { "row": 1, "param": "time", "depth": 0.6 },
  "shake": { "row": 2, "param": "echo", "depth": 1.0 },
  "lfo": {
    "row": 3,
    "param": "echo",
    "depth": 1.0,
    "mpy": 1.0,
    "shape": "random",
    "phase": 0,
    "speed": 4.0
  },
  "trigger": { "row": 3 }
}
```

### Modulation Fields

| Field | Type | Description |
|-------|------|-------------|
| `row` | int | Target effect row (0-n), -1 to disable |
| `param` | str/int | Parameter name or index (0 = first param) |
| `depth` | float | Modulation depth/amount (can be negative) |
| `mpy` | float | Multiplier (LFO only) |
| `shape` | str/int | LFO shape (see table below) |
| `phase` | float | LFO phase offset |
| `speed` | float | LFO speed |

### LFO Shape Values

| Shape | String | Numeric |
|-------|--------|---------|
| Sine wave | `'sine'` | 0 |
| Square wave | `'square'` | 1 |
| Sawtooth wave | `'sawtooth'` | 2 |
| Random | `'random'` | 3 |

**Example:**
```python
>>> fx.preset_lfo(0, 'shape', 'sine')     # Using string
>>> fx.preset_lfo(0, 'shape', 0)          # Using numeric (same as 'sine')
```

### REPL Modulation Output Format

When calling `fx.list_preset(slot)`, modulation sections are displayed:

```
HANDLE:
    row                    1
    param                  0
    depth               0.50

SHAKE:
    row                    1
    param                  0
    depth               0.60

LFO:
    row                    0
    param                  0
    depth               0.30
    shape                  0    # 0=sine, 1=square, 2=sawtooth, 3=random
    speed                1.0
    speed mpy            1.0    # Speed multiplier

TRIGGER:
    row                    3
```

**Note:** A `row` value of `-1` indicates the modulation is disabled.

---

## Filesystem

The device has two filesystem mounts:

| Mount | Description |
|-------|-------------|
| `/rom` | Read-only firmware (README.md, main.py) |
| `/fat` | User-accessible FAT filesystem |

### Filesystem Access

```python
>>> import os
>>> os.listdir("/")
['rom', 'fat']
>>> os.listdir("/fat")
['1_.wav', 'readme.pdf', 'config.json', ...]
>>> os.listdir("/rom")
['README.md', 'main.py']
```

### Reading Files

```python
>>> f = open("/fat/config.json", "r")
>>> content = f.read()
>>> f.close()
>>> print(content)
{"name": "BROKEN RADIO PACK", ...}
```

### Writing Files

```python
>>> f = open("/fat/config.json", "w")
>>> f.write('{"name": "NEW PACK", ...}')
>>> f.close()
```

**Note:** `f.write()` returns the number of bytes written.

### Using the JSON Module

The `json` module is available for parsing and serializing:

```python
>>> import json

# Reading JSON
>>> f = open("/fat/config.json", "r")
>>> data = json.load(f)
>>> f.close()
>>> print(type(data))
<class 'dict'>
>>> print(list(data.keys()))
['name', 'presets']

# Writing JSON
>>> data["name"] = "MY NEW PACK"
>>> f = open("/fat/config.json", "w")
>>> json.dump(data, f)
>>> f.close()
```

### Deleting Files

```python
>>> import os
>>> os.remove("/fat/test.txt")
```

### Directory Operations

```python
>>> os.mkdir("/fat/mydir")       # Create directory
>>> os.rmdir("/fat/mydir")       # Remove empty directory
>>> os.rename("/fat/a.txt", "/fat/b.txt")  # Rename/move file
>>> os.getcwd()                  # Get current directory
'/fat'
>>> os.chdir("/fat")             # Change directory
```

### Filesystem Statistics

```python
>>> os.statvfs("/fat")
(4096, 4096, 250, 136, 136, 0, 0, 0, 0, 255)
# (block_size, frag_size, total_blocks, free_blocks, avail_blocks, ...)
# Total: 250 * 4096 = ~1MB
# Free: 136 * 4096 = ~557KB

>>> os.stat("/fat/config.json")
(32768, 0, 0, 0, 0, 0, 1386, 1609460578, 1609460578, 1609460578)
# (mode, ino, dev, nlink, uid, gid, size, atime, mtime, ctime)
# size = 1386 bytes
```

### Sync to Disk

```python
>>> os.sync()  # Flush all pending writes to disk
```

**Important:** Call `os.sync()` after writing files to ensure data is persisted.

### Device Information

```python
>>> os.uname()
(sysname='rp2', nodename='rp2', release='1.26.0-preview',
 version='v1.26.0-preview.136.g4085bf4de on 2025-12-04',
 machine='EP-2350 with RP2350')
```

---

## Reloading Configuration

After writing to config.json, the device does **not** automatically reload the presets. You must explicitly reload:

### `teenage.examine_drive(mount)`

Reloads config.json and all presets/samples from disk.

| Parameter | Type | Description |
|-----------|------|-------------|
| `mount` | bool | `True` = unmount and remount filesystem first, `False` = just reload |

**Returns:** None

**Example:**
```python
# After writing config.json, reload without remounting
>>> teenage.examine_drive(False)

# Force remount and reload (use if filesystem was modified externally)
>>> teenage.examine_drive(True)

# Then activate a preset
>>> fx.load_preset(0)
True
```

### Complete Save Workflow

To save presets from the web app to the device:

```python
# 1. Read current config
>>> import json
>>> f = open("/fat/config.json", "r")
>>> data = json.load(f)
>>> f.close()

# 2. Modify the data
>>> data["presets"][0]["name"] = "NEW PRESET NAME"

# 3. Write back to disk
>>> f = open("/fat/config.json", "w")
>>> json.dump(data, f)
>>> f.close()

# 4. Reload configuration
>>> teenage.examine_drive(False)

# 5. Activate the preset
>>> fx.load_preset(0)
True
```

**Important Notes:**
- `json.dump()` writes minified JSON (no formatting)
- The device parses up to 16 effects per preset
- Invalid JSON will cause config loading to fail (device falls back to ROM samples)
- Always close file handles after reading/writing

### Writing Readable/Formatted JSON

MicroPython's `json.dump()` does not support the `indent` parameter, so it writes minified JSON. To write human-readable formatted JSON, write the pre-formatted string directly:

```python
>>> f = open("/fat/config.json", "w")
>>> f.write('{\n  "name": "MY PACK",\n  "presets": []\n}')
>>> f.close()
>>> os.sync()
```

### Programmatic Writing Methods

When writing config.json programmatically via USB serial (e.g., from a web app), there are two approaches:

#### Method 1: Line-by-Line in Normal REPL (Recommended for Large Files)

For large config files (100+ lines), send each write command individually. This is slower but **prevents device crashes** from buffer overflows.

**⚠️ Important:** Raw REPL mode and large scripts (5000+ characters) can freeze/crash the device.

```javascript
// Open file
await sendCommand('import os');
await sendCommand('_f = open("/fat/config.json", "w")');

// Write each line separately
const lines = jsonString.split('\n');
for (let i = 0; i < lines.length; i++) {
  const escaped = lines[i].replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (i < lines.length - 1) {
    await sendCommand(`_f.write('${escaped}\\n')`);
  } else {
    await sendCommand(`_f.write('${escaped}')`);
  }
}

// Close, sync, and reload
await sendCommand('_f.close()');
await sendCommand('os.sync()');
await sendCommand('teenage.examine_drive(False)');
await sendCommand('del _f');
```

**Advantages:**
- Reliable for any file size
- No buffer overflow issues
- Can show progress to user (line X of Y)

**Disadvantages:**
- Slower (~200ms per line due to command echo)

#### Method 2: Raw REPL Mode (Small Scripts Only)

For small scripts (<2000 characters), raw REPL mode is faster but has strict size limits.

**Control Characters:**
| Key | Code | Description |
|-----|------|-------------|
| Ctrl+A | `\x01` | Enter raw REPL mode |
| Ctrl+B | `\x02` | Exit to normal REPL mode |
| Ctrl+C | `\x03` | Interrupt / cancel |
| Ctrl+D | `\x04` | Execute (in raw mode) / soft reset |

**Workflow:**
```
1. Send Ctrl+C (\x03) to interrupt any running code
2. Send Ctrl+A (\x01) to enter raw REPL mode
3. Send your Python script (must be <2000 chars)
4. Send Ctrl+D (\x04) to execute the script
5. Wait for execution to complete
6. Send Ctrl+B (\x02) to return to normal REPL mode
```

**⚠️ Script Size Limits:**
- Scripts over ~5000 characters can crash/freeze the device
- The device may disconnect without warning
- Always use line-by-line method for config.json (typically 3000-5000+ chars)

#### Paste Mode (Not Recommended)

Paste mode (Ctrl+E) exists but can cause connection state issues and is not recommended for programmatic use.

---

## config.json Format

The config.json file overrides presets and sample configuration.

### Full Example

```json
{
  "name": "We count from zero",
  "samples": [
    { "pos": 1, "file": "samples/whistle1.wav", "playmode": "oneshot" },
    { "pos": 0, "file": "live1/loop.wav", "playmode": "startstop" },
    { "file": "horn.wav", "playmode": "hold" },
    { "file": "live1/shottis.wav", "playmode": "oneshot" }
  ],
  "presets": [
    {
      "pos": 0,
      "name": "WALKIE TALKIE",
      "comment": "bandpass filter + distortion for radio effect",
      "list": [
        { "effect": "HIGHPASS", "cutoff": 0.3 },
        { "effect": "LOWPASS", "cutoff": 0.4 },
        { "effect": "DIST", "amount": 15.0, "mix": 0.6, "lowpass-cutoff": 0.8, "highpass-cutoff": 0.2 },
        { "effect": "SAMPLE", "speed": 1, "pitch": 0, "level": 1, "balance": 0.5 }
      ],
      "handle": { "row": 1, "param": "cutoff", "depth": 0.5 },
      "shake": { "row": 2, "param": "amount", "depth": 1.0 },
      "lfo": { "row": 0, "param": "cutoff", "depth": 0.3, "shape": "sine", "speed": 2.0 },
      "trigger": { "row": 3 }
    }
  ]
}
```

### Sample Configuration

| Field | Type | Description |
|-------|------|-------------|
| `pos` | int | Sample slot (0-3), optional |
| `file` | str | Path to WAV file |
| `playmode` | str | `oneshot`, `startstop`, or `hold` |

### Sample File Requirements

- Format: WAV only
- Channels: Mono or stereo
- Bit depth: 8, 16, 24-bit, or 32-bit float
- Sample rate: Up to 96 kHz
- Total size: ~1 MB limit
- Files: `1.wav`, `2.wav`, `3.wav`, `4.wav` on TING DISK

### Preset Configuration

| Field | Type | Description |
|-------|------|-------------|
| `pos` | int | Preset slot (0-3) |
| `name` | str | Preset name |
| `comment` | str | Preset description |
| `list` | array | Effect chain configuration |
| `handle` | object | Handle modulation config |
| `shake` | object | Shake modulation config |
| `lfo` | object | LFO modulation config |
| `trigger` | object | Trigger row config |

---

## Example Session

```python
# Connect and import modules
>>> import fx, teenage, ui

# Check current slot
>>> teenage.fx_pos
-1

# Load preset 0
>>> fx.load_preset(0)
True

# Check slot again
>>> teenage.fx_pos
0

# View all effects with parameters
>>> fx.map()
0 NONE:
    nothing             [0.00,0.00]
1 LOWPASS:
    cutoff              [0.00,1.00]
...

# View preset configuration
>>> fx.list_preset(0)
0 [ 8 HIGHPASS ]
    cutoff              0.30
...

# Modify parameter in real-time
>>> fx.param(0, 0, "cutoff", 0.8)
True

# Add an effect to the chain
>>> fx.add(0, 1)  # Add LOWPASS
1
>>> fx.list_loaded(0)
...
1 [ 1 LOWPASS ]
    cutoff              1.00

# Remove the effect
>>> fx.remove(0, 1)
1

# Read handle position
>>> ui.handle()
0.0

# Read accelerometer
>>> ui.acc()
[2432, 624, 15776]

# Read shake intensity
>>> ui.shaker()
3.097807e-20

# Check button states
>>> ui.sw(0)
1  # Not pressed
>>> ui.sw(1)
1  # Not pressed

# Control LEDs
>>> ui.leds(0, 1)  # Turn on preset 1 LED
>>> ui.leds(1, 1)  # Turn on preset 2 LED
>>> ui.leds(0, 0)  # Turn off preset 1 LED

# Toggle effects bypass
>>> fx.flip()

# Get battery voltage
>>> ui.get_vbat()
4.12

# View CPU usage
>>> fx.timing()
          effect : cycles,    c/s
      compressor :   1195,     37
...

# Access filesystem
>>> import os
>>> os.listdir("/fat")
['config.json', '1_.wav', ...]
```

---

## Notes & Tips

1. **Audio routing is external** - USB is only for control; audio comes out the 3.5mm jack.

2. **Two preset states:**
   - **Defined** (`list_preset`) - What's stored in the config.json
   - **Loaded** (`list_loaded`) - What's currently active

3. **Parameter changes via `fx.param()` are immediate** - No need to reload the preset.

4. **SAMPLE effect is always present** - It represents the MIC IN and is part of every preset chain.

5. **Single-instance effects** - DELAY, REVERB, HARMONY, and SSB should only be used once per effect chain.

6. **Debounce rapid commands** - Sending commands too quickly may overwhelm the device. A 100ms debounce is recommended for slider controls.

7. **Recovery from freeze** - If the device freezes after loading a bad preset, hold green + white buttons during startup to access the filesystem and fix config.json.

8. **Power modes on battery:**
   - 5 min after releasing handle: power save mode
   - 20 min after releasing handle: turns off
   - Low battery: LED blinks, won't turn on

9. **USB power** - Device stays powered, batteries not used or charged.

---

## Function Reference Summary

### fx Module

| Function | Arguments | Returns | Description |
|----------|-----------|---------|-------------|
| `fx.map()` | 0 | prints | Show all effects and parameters |
| `fx.timing()` | 0 | prints | Show CPU cycle usage |
| `fx.list_preset(slot)` | 1 | prints | Show preset definition |
| `fx.list_loaded(slot)` | 1 | prints | Show loaded effects |
| `fx.load_preset(slot)` | 1 | True | Load a preset |
| `fx.param(slot, row, param, value)` | 4 | True | Set parameter live |
| `fx.flip()` | 0 | None | Toggle bypass |
| `fx.add(slot, effect_id)` | 2 | int | Add effect to chain |
| `fx.insert(slot, row, effect_id)` | 3 | True | Insert effect at position |
| `fx.remove(slot, row)` | 2 | int | Remove effect from chain |
| `fx.clear(slot)` | 1 | None | Clear all effects |
| `fx.preset_param(slot, row, param, value)` | 4 | bool | Modify stored preset |
| `fx.preset_handle(slot, config)` | 2 | bool | Configure handle mod |
| `fx.preset_shake(slot, config)` | 2 | bool | Configure shake mod |
| `fx.preset_lfo(slot, config)` | 2 | bool | Configure LFO mod |
| `fx.preset_trigger_row(slot, row)` | 2 | True | Set trigger row |
| `fx.preset_mods_disable(slot)` | 1 | True | Disable all mods |
| `fx.handle(slot, param)` | 2 | bool | Live handle mod |
| `fx.shake(slot, param)` | 2 | bool | Live shake mod |
| `fx.lfo(slot, param)` | 2 | bool | Live LFO mod |
| `fx.preset(slot, row, param)` | 3 | bool | Access preset data |

### ui Module

| Function | Arguments | Returns | Description |
|----------|-----------|---------|-------------|
| `ui.handle()` | 0 | float | Handle position (0-1) |
| `ui.handle_raw()` | 0 | float | Raw handle ADC |
| `ui.acc()` | 0 | [x,y,z] | Accelerometer values |
| `ui.shaker()` | 0 | float | Shake intensity |
| `ui.adc()` | 0 | [5 ints] | Raw ADC channels |
| `ui.get_temp()` | 0 | float | Device temperature |
| `ui.get_vbat()` | 0 | float | Battery voltage |
| `ui.get_vbus()` | 0 | float | USB bus voltage |
| `ui.sw(index)` | 1 | int | Button state |
| `ui.leds(index, state)` | 2 | None | Control LED |
| `ui.led_control(mode)` | 1 | None | LED mode |
| `ui.led_level(index, brightness)` | 2 | False | LED brightness |
| `ui.callback(func)` | 1 | ? | Register callback |
| `ui.shutdown()` | 0 | ? | Shutdown device |

### teenage Module

| Property/Function | Type | Description |
|-------------------|------|-------------|
| `teenage.fx_pos` | int | Current FX slot (-1 if none) |
| `teenage.fx_primed` | int | FX active state |
| `teenage.sam_pos` | int | Current sample slot |
| `teenage.sam_primed` | int | Sample primed state |
| `teenage.examine_drive(mount)` | func | Reload config.json (False=reload only, True=remount+reload) |
| `teenage.python_callback(func)` | func | Register callback |

### spl Module

| Function | Arguments | Returns | Description |
|----------|-----------|---------|-------------|
| `spl.init(slot)` | 1 | None | Initialize sample slot |
| `spl.load_wav(slot, file_handle, playmode)` | 3 | bool | Load WAV from open file handle |
| `spl.rom(slot)` | 1 | True | Load ROM sample for slot |
| `spl.trigger(-1, slot, start)` | 3 | True | Start/stop sample playback |

---

## Disclaimer

This is unofficial documentation gathered through reverse engineering. It is not affiliated with Teenage Engineering. Use at your own risk.

For official documentation, visit the [EP-2350 Guide](https://teenage.engineering/guides/ep-2350).
