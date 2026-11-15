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
