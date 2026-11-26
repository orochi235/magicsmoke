# TODO

## A host can't tell which side-effect channels are working

`LayerOptions` in `src/layer.ts` (and the overlay and smoke options built on it) turns on sound,
haptics, page flash, and jolt, but nothing reports back whether each one is live: audio stays
silent until the first user gesture, `navigator.vibrate` is missing on iOS Safari, and reduced
motion turns jolt and page flash off. A graphics cue plays on regardless, so a host can't tell a
silent page from a broken one, or show its own prompt to click for sound. Needs a decision on the
shape: a queryable capability object, per-channel outcomes on each discharge, or both. The same
work should say whether `fade` and `dispose` cut a sound's tail or only stop future discharges.
(filed 2026-11-15 from automated review)

## Describe params as weasel's `ParamShape`

weasel added a plain-JSON param description (weasel batch 2026-11-26, unreleased).
- `ParamShape` lives in `@weasel-js/prefs-schema`, which a runtime library can import without labkit.
- `f.params` in labkit compiles one to a config schema.

Moving over means these renames:

| Was | Now |
|---|---|
| `type` | `kind` |
| `hint` | `description` |
| `choice` | `enum` |
| `startAuto` | `auto: { on: true }` |
| keyed arrays | records |

Drop the converter in `lab/tuning/schema.ts`. magicsmoke's defaults stay apart and are passed as `f.params(shape, { defaults })`. Closes when the hand-written converter is gone.
