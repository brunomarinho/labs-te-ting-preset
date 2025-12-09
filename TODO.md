# Future Improvements

## Advanced Features Not Yet Implemented

These are optional advanced features from the EP-2350 spec that could be added later.

### BUS Routing

Parallel signal paths can be created by adding `"BUS": 1` or `"BUS": 2` to effect lines. This enables dry/wet separation and more complex routing.

**Example:**
```json
{
  "effect": "REVERB",
  "time": 0.5,
  "wet-level": 1.0,
  "BUS": 1
}
```

**Implementation notes:**
- Add BUS selector (off, 1, 2) to each effect card
- Include BUS property in export when set
- Consider visual indication of routing in the effect chain

### Handle Targeting LFO Speed

The handle can alternatively control LFO speed instead of an effect parameter by setting `"target": "lfo"`.

**Example:**
```json
"handle": {
  "target": "lfo",
  "depth": 5.0
}
```

**Implementation notes:**
- Add target selector to handle modulation panel (parameter vs LFO)
- When LFO is selected, hide row/param fields and show depth only
- Depth controls how much handle affects LFO speed

---

## Reference

- [Official EP-2350 Guide](https://teenage.engineering/guides/ep-2350)
