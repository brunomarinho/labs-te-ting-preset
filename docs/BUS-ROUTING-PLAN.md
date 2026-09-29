# BUS Routing — Investigation & Implementation Plan

Status: **editor support shipped; preview simulation deferred** (hardware semantics
unconfirmed — see "Answers from hardware"). What shipped: per-card MAIN/BUS 1/BUS 2
control (Emulation only), bus tag + accent stripe + "not simulated" note, BUS
sanitized to {1,2} on file/device/localStorage import, REPL parser reads ` -> N`,
`setParam` refuses BUS, 16-row cap. `buildChain()` intentionally unchanged.
(User request: parallel effect paths via `"BUS": 1` / `"BUS": 2` on effect lines, per EP-2350 manual §7.10.)

## What BUS routing is

By default the Ting processes effects serially. Adding `"BUS": 1` or `"BUS": 2` to an
effect line routes it to a parallel path — e.g. keeping the dry signal clean while
distorting a copy. Confirmed as a firmware-accepted config key in `docs/REPL-API.md`
("Effect Routing" section):

```json
{ "effect": "HARMONY", "pitch": 2.0, "BUS": 2 }
```

## Key findings (verified against the codebase)

1. **All four transport paths already round-trip BUS with zero changes.**
   Effect objects are passed through verbatim everywhere — unknown keys survive:
   - File import: `handleImport` (`js/events.js:391`) keeps `preset.list` as-is.
   - File export: `handleExport` (`js/events.js:454`) serializes `preset.list` as-is.
   - Live import: `importPresetsFromDevice` (`js/events.js:661`) uses
     `tingUSB.readConfigJson()` (`js/webusb.js:758`) — reads `/fat/config.json`
     directly, NOT the `fx.list_preset()` text parser. JSON keys survive.
   - Save to device: `presetToDeviceFormat` (`js/webusb.js:893`) copies every key
     except `effect` and `_`-prefixed internals.
   - localStorage (`js/storage.js`) is plain JSON of the same objects.

2. **Today's behavior is silently wrong.** A config containing BUS imports fine,
   the flag is invisible in the UI, and the emulation preview plays everything
   serially — a misleading preview. Implementing BUS fixes a latent correctness bug.

3. **BUS is structural, not a parameter.** `fx.map()` (REPL-API.md) lists every
   effect's params and ranges — BUS appears in none. Therefore:
   - Do NOT add BUS to `EFFECTS[...].params` in `js/effects.js`. That registry
     drives slider rendering (`renderEffectCard`, `js/ui.js:9`) AND the modulation
     row/param dropdowns (`updateParamOptions`, `js/ui.js:239`). Adding it there
     would render a bogus slider and let users "modulate" BUS.
   - In live/hardware mode, treat BUS changes like add/remove/reorder (already
     disabled): change flows through "save to device", which writes config.json
     and runs `teenage.examine_drive(False)` + reload (`js/webusb.js:875`).

4. **Firmware has a `SUM` DSP stage** (`fx.timing()` output in REPL-API.md shows
   compressor / noisegate / SAMPLE / SUM) — consistent with the working model:
   parallel paths summed at the output.

5. **Device parses max 16 effects per preset** (REPL-API.md line ~1122). The app
   does not enforce this anywhere — add a cap in `addEffect` (`js/events.js:158`)
   while in this area. Oversized/invalid configs can freeze the device (recovery:
   hold green + white buttons during startup).

6. **This feature is already item #1 in `TODO.md`** with matching implementation
   notes (BUS selector off/1/2 per card, include in export, visual routing hint).

## Working model of routing semantics (NEEDS HARDWARE CONFIRMATION)

- Effects with no BUS key form the **main** serial chain.
- Effects with `BUS: 1` form a serial sub-chain; same for `BUS: 2`.
- All paths tap the input (mic) in parallel and are **summed at the output**.
- If every effect is on a bus (main path empty), the dry signal still passes
  through the main path — this matches the manual's "keep dry clean while
  distorting a copy" example.
- Serial order within a bus = list order among that bus's effects.

## Implementation plan (small; ~2 files of real logic)

### 1. Data model — no changes
`BUS: 1 | 2` lives directly on the effect config object; absent = main path.
Validate on import: coerce to {1, 2}, strip anything else (device-safety).

### 2. Audio engine — `buildChain()` (`js/audio-engine.js:196`)
- Partition non-SAMPLE effects into three ordered groups: main, bus1, bus2.
- Build each group as a serial sub-chain (reuse existing `_output` handling for
  compound effects like DIST).
- Connect player → head of each non-empty group; each tail → `masterGain`.
- If buses exist and main group is empty: also connect player → `masterGain`
  directly (dry path).
- **CRITICAL:** keep `this.effectNodes` stored in original list order and only
  change the *connections*. `updateParameter` (`js/audio-engine.js:253`) maps
  preset index → node index by counting non-SAMPLE effects in order; preserving
  storage order means sliders, handle, shake, and LFO modulation all work with
  zero changes.
- No-BUS presets produce the identical serial chain as today (backward compat).

### 3. UI — `renderEffectCard` (`js/ui.js:9`) + `styles.css`
- Compact segmented control `MAIN | 1 | 2` in the card header, hidden for the
  SAMPLE (MIC IN) row.
- Reuse the existing segmented idiom `.mode-toggle` / `.sample-btn`
  (`styles.css:167-201`): pill, uppercase --text-xs semibold, active = ink bg.
- Placement caution: `.effect-card__header` is a tight flex row and the
  "remove effect" button is ABSOLUTELY CENTERED in it (`styles.css:608`).
  Place the BUS control right-aligned before the drag handle; verify against the
  centered delete label at desktop and the mobile breakpoint (`styles.css:978`).
- Visual routing hint: tint the row badge (`.effect-card__row`) or a thin left
  card border per bus using existing tokens.
- Hardware mode: hide/disable via the existing pattern
  (`.hardware-mode .effect-card__drag` precedent at `styles.css:957`).

### 4. Events — `js/events.js`
- Delegated handler for the BUS control: set/delete `BUS` key on
  `preset.list[index]`, then `markDirty()` → `audioEngine.buildChain(preset)` →
  `saveState()` (same sequence as every other edit).
- 16-effect cap in `addEffect` with a toast.
- Disable BUS control in hardware mode (structural edit).

### Housekeeping (separate from feature)
- `events.js` is 1,187 lines and `styles.css` 1,035 — both over the project's
  1,000-line guideline. Propose extracting import/export handlers from events.js
  as a separate refactor; don't bundle into this feature.
- Run `npx eslint` after changes (project rule: always lint).

## Hardware verification checklist (do FIRST, before implementing)

Connect via live mode or `mpremote connect <port> repl`, then `import fx, teenage, ui`.

1. **Confirm the device accepts BUS from config.json.**
   Hand-edit config.json (USB storage or REPL file write) so preset 0 is:
   ```json
   "list": [
     { "effect": "DIST", "amount": 20, "mix": 1.0, "BUS": 1 },
     { "effect": "SAMPLE", "speed": 1, "pitch": 0, "level": 1, "balance": 0.5 }
   ]
   ```
   Reload (`teenage.examine_drive(False)` then `fx.load_preset(0)`) and listen:
   - Dry voice + distorted copy in parallel → confirms the working model.
   - Only distorted (no clean dry) → main path does NOT pass dry when empty;
     adjust `buildChain` accordingly (no implicit dry connection).

2. **Check how `fx.list_preset(0)` prints BUS.**
   If it prints a `BUS 1`-style param line, the existing regex in
   `parsePresetOutput` (`js/webusb.js:619`) would already capture it; if it
   prints differently (or not at all), note the format. (Low stakes — the real
   import path reads config.json — but tells us if the REPL parser needs care.)

3. **Serial order within a bus + two buses at once.**
   Try `[HIGHPASS(BUS:1), DIST(BUS:1), REVERB(BUS:2), SAMPLE]` — confirm bus 1
   is highpass→dist serially, bus 2 reverb, plus dry, all summed.

4. **Mixed main + bus.**
   Try `[LOWPASS (no BUS), DIST(BUS:1), SAMPLE]` — is the audible result
   lowpassed dry + distorted parallel copy? Does the bus tap pre- or post-main-chain?
   (Working model assumes buses tap the raw input, not the main chain output.)

5. **Does `fx.param(slot, row, "BUS", 2)` work live?**
   Probably not (BUS absent from `fx.map()`), but if it does, live BUS switching
   becomes possible instead of requiring save-to-device.

6. **Where does SAMPLE sit relative to buses?**
   SAMPLE (MIC IN) has its own BUS-less line; confirm presets behave when SAMPLE
   is last (the app always appends it).

7. **Safety check:** invalid BUS values (`"BUS": 3`, `"BUS": 0`) — does the
   device ignore, error, or freeze? Determines how defensive import coercion
   must be.

Record answers in this file, then implement per the plan above.

## Answers from hardware (fill in)

Tested 2026-09-28 on firmware `MICROPYTHON 1.25; EP-2350 1.0.8`.

- [x] Device accepts `"BUS": 1` in config.json: **yes** — loads and plays after
      `teenage.examine_drive(False)` + `fx.load_preset(0)`, survives reboot.
- [x] Dry passes when main path empty: **NO.** `[DIST(BUS:1, mix 1.0), SAMPLE]`
      sounds distortion-only. `buildChain` must NOT add an implicit dry connection.
- [x] `fx.list_preset` / `fx.list_loaded` BUS print format: suffix on the effect
      header line, e.g. `0 [ 4 DIST ] -> 1`. No-BUS effects print no suffix.
      `parsePresetOutput` (`js/webusb.js`) header regex must tolerate ` -> N`.
- [x] Buses are parallel: **yes.** `[LOWPASS 0.1 (BUS:1), HIGHPASS 0.9 (BUS:2), SAMPLE]`
      is audible (quiet, clean); the same two filters with no BUS (serial) are
      near-silent.
- [x] Bus tap point: **raw input.** `[LOWPASS 0.15 (main), DIST (BUS:1), SAMPLE]`
      = muffled clean voice + full-band distortion, summed.
      ⇒ Confirmed model: main / BUS 1 / BUS 2 each take the mic input, run their
      effects serially in list order, and are summed. An **empty path contributes
      nothing** (no implicit dry).
- [!] **CONTRADICTION — the parallel model above is NOT confirmed.** Level test:
      `[HIGHPASS 0.0 (BUS:1), SAMPLE]` (transparent filter on a bus) is **silent
      even at max interface gain**; the identical preset without BUS
      (`[HIGHPASS 0.0, SAMPLE]`) plays at normal level. So a bus path does not
      receive the mic signal (at least not in this configuration). The "audible"
      bus results (t1, t4, t3 scream) all involved DIST 40 and may be DIST
      producing noise from a silent input rather than distorting the voice; t2's
      "clean tone" may be filter ringing, not voice. What feeds a bus is unknown.
      (Official guide §7.10 only says "use BUS to create parallel paths"; §7.5 notes
      SAMPLE = sample playback and its list position decides whether samples get fx.)
- [~] Two buses at once + serial order within a bus: **inconclusive.**
      `[HIGHPASS 0.7 (BUS:1), DIST 40 (BUS:1), REVERB wet 1 dry 0 (BUS:2), SAMPLE]`
      produced a loud high-pitched feedback scream — interface gain was at max,
      so likely acoustic feedback, not a routing fault. Re-test at normal gain /
      on headphones if needed. **Design note:** parallel paths sum, so bus presets
      can be much louder than serial ones — consider a level warning in the UI.
- [x] Live `fx.param` BUS support: **NO — `fx.param(0, 0, "BUS", 2)` FREEZES the
      device** (REPL unresponsive; power-cycle needed). The app must never send
      BUS (or any key not in `fx.map()`) through `fx.param`. BUS changes only via
      save-to-device.
- [ ] Invalid BUS value behavior: ?

End-to-end round trip of the shipped editor support (2026-09-29, fw 1.0.8) — PASS:
1. App file import → set DIST to BUS 1 via the card control → app export: output =
   original config + `"BUS": 1` only.
2. That config written to the device: `fx.list_preset(0)` shows `2 [ 4 DIST ] -> 1`.
3. App Live-mode connect (device import via config.json): BUS 1 shown (tag + stripe),
   routing control locked; clicking it leaves BUS unchanged.
4. Live slider on the bus effect sends only `fx.param(0, 2, "amount", …)` — no BUS.
5. App "save to device": writes `"BUS": 1`; config.json read back = expected.
Notes: switching to Live re-imports from the device, so BUS edits (like add/remove)
reach the device via export + USB copy; save-to-device preserves existing BUS.
Pre-existing, unrelated: post-save `tingUSB.updateLED` was never defined (caught
warning; LED not updated). Fixed by calling the existing `tingUSB.selectSlot()`.

Other corrections from hardware:
- `SUM` in `fx.timing()` is the **total cycle count**, not a mixing stage
  (compressor 1200 + noisegate 2232 + DIST 3647 + SAMPLE 76 ≈ SUM 7154).
  Finding #4 above is wrong.
- `fx.list_loaded(n)`'s argument is a load-buffer index (0/1, alternates on each
  `load_preset`), not a preset slot.
