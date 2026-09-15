# magicsmoke v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: built.** Every task landed on 2026-09-14. Two departures: `Draft` carries an absolute `time`
rather than an `offset`, and the lab uses native controls rather than labkit.

**Goal:** Build the `magicsmoke` package described in `docs/superpowers/specs/2026-09-14-magicsmoke-design.md`: a three.js layer and overlay host that render sparks, arcs, flashes and synthesized sound driven by a fault's intensity.

**Architecture:** A pure fault process (no three, no DOM) turns intensity into discharges. `createLayer` routes each discharge to spark emitters (three.quarks), arcs and flashes (three meshes), an audio engine (Web Audio) and page effects (WAAPI jolt, vibrate, page flash). `createOverlay` wraps a layer in its own renderer and orthographic camera in client coordinates.

**Tech Stack:** TypeScript 7, three 0.185, three.quarks 0.17.1, Web Audio, Web Animations, vitest 4 (Node + jsdom), Playwright 1.63, Vite 8, biome 2.

---

## Facts the spike established

- A burst at an arbitrary point: `system.emit(0, state, matrix)` with a fresh `EmissionState` whose `waitEmiting` is the count, on a system built with `onlyUsedByOther: true` so it never emits on its own. quarks types the matrix as its own `Matrix4`; pass three's (its own update does) through a cast.
- `ParticleSystem.update` **disposes the system** if its emitter has no `Scene` ancestor. The layer must skip `batch.update` until its object is in a scene.
- `ApplyCollision` reflects velocity but does not move the particle; the resolver clamps the position itself.
- Streak width is `size`; length is `(speed · speedFactor + lengthFactor) · size`. `size 4–7`, `speedFactor 0.012`, `lengthFactor 1` reads well at 1 unit = 1 px.
- Stock `THREE.AdditiveBlending` composites validly over a premultiplied transparent canvas. Custom alpha blend factors are silently dropped by quarks' batch material.

## File map

| File | Responsibility |
| --- | --- |
| `src/types.ts` | `Vec3`, `Point`, `DischargeKind`, `Discharge` |
| `src/rng.ts` | `mulberry32(seed)`, `fork(rng)` |
| `src/fault/tuning.ts` | `Tuning` type and `DEFAULT_TUNING` |
| `src/fault/energy.ts` | `drawEnergy(u, k, t)`, `kindFor(energy, canArc, u, t)` |
| `src/fault/process.ts` | `FaultProcess`: easing, self-exciting timing, fizz/hum levels |
| `src/sparks/textures.ts` | generated dot and glow textures |
| `src/sparks/kinds.ts` | per-kind particle parameters |
| `src/sparks/emitters.ts` | `SparkEmitters`: quarks batch, one system per kind, `fire`, scene guard |
| `src/sparks/arcs.ts` | `Arcs`: midpoint-displaced ribbons rebuilt in `onBeforeRender` |
| `src/sparks/flashes.ts` | `Flashes`: glow sprite pool, fixed pool of four point lights |
| `src/audio/cap.ts` | `VoiceCap`: admit/evict by gain |
| `src/audio/voices.ts` | `noiseBuffer`, `createHum`, `playCrackle`, `playPop`, `playShowerTail`, `playArcBuzz` |
| `src/audio/engine.ts` | `AudioEngine`: unlock, chain, visibility, routing discharges to voices |
| `src/page/motion.ts` | `prefersReducedMotion()` |
| `src/page/jolt.ts` | `Jolter`: WAAPI `translate` tracks with `composite: 'add'` |
| `src/page/haptics.ts` | `Haptics`: throttled `navigator.vibrate` |
| `src/page/page-flash.ts` | `PageFlash`: full-page pulse element |
| `src/page/dwell.ts` | `dwell(element, spec)` |
| `src/layer.ts` | `createLayer`, `Layer`, `Fault`, `LayerOptions` |
| `src/overlay.ts` | `createOverlay`, `Overlay`, `OverlayOptions` |
| `src/index.ts` | public exports |
| `test/**/*.test.ts` | vitest (Node; jsdom where marked) |
| `lab/index.html`, `lab/main.ts` | manual lab |
| `lab/harness.html`, `lab/harness.ts` | page the Playwright specs drive |
| `lab/test/*.spec.ts` | Playwright specs |
| `playwright.config.ts` | web server on a path-derived port |

## Tasks

### Task 1: types and rng

**Files:** create `src/types.ts`, `src/rng.ts`; test `test/rng.test.ts`.

- [ ] Test: `mulberry32(1)` yields the same first five values on two instances; values lie in `[0, 1)`; different seeds differ; `fork(rng)` returns an independent stream whose values differ from the parent's next values.
- [ ] Run `npx vitest run test/rng.test.ts` — fails (module missing).
- [ ] Implement mulberry32; `fork` seeds a new mulberry32 from `Math.floor(rng() * 2 ** 32)`.
- [ ] Run — passes. Commit `add seeded rng and shared types`.

### Task 2: energy and kind

**Files:** create `src/fault/tuning.ts`, `src/fault/energy.ts`; test `test/fault/energy.test.ts`.

- [ ] Tests: `drawEnergy(0, k)` is `0.1k`; `drawEnergy(1, 1)` is 1; energy never exceeds 1; mean energy over 10 000 uniform draws rises monotonically across k = 0.1, 0.5, 1. `kindFor(0.2, false, ·)` is `sputter`, `0.5` is `burst`, `0.7` is `shower`; with `canArc` and energy ≥ 0.45, `u < 0.5` gives `arc` and `u ≥ 0.5` gives the energy's own kind; without `canArc` never `arc`.
- [ ] Run — fails. Implement per spec: `min(1, u³·(0.35 + 0.65k) + 0.1k)`; thresholds from tuning.
- [ ] Run — passes. Commit `add discharge energy and kind selection`.

### Task 3: fault process

**Files:** create `src/fault/process.ts`; test `test/fault/process.test.ts`.

`FaultProcess(rng, tuning)` has `target` (0..1), `level` (eased), `canArc`, and `step(dt): Draft[]` where `Draft = { kind, energy, offset }` (`offset` seconds into this step). `fizzRate` is `tuning.fizzPerSecond · level`; `humLevel` is `level`.

- [ ] Tests, all with `mulberry32(42)`:
  - `target = 0` → no drafts over 60 s.
  - Long-run rate at k = 0.1, 0.5, 1 over 600 s is within 15 % of `2 · (0.5 + 11.5k²)`.
  - Clustering: coefficient of variation of inter-arrival gaps at k = 0.5 exceeds 1.1 (a Poisson process sits at 1).
  - Chunking: stepping 10 s as 1000 × 0.01 and as 625 × 0.016 yields identical draft sequences (kind, energy, and absolute time to 1e-9).
  - `step(5)` advances at most 0.05 s of process time.
  - Easing: after setting `target = 1` from 0, `level` is within 1 % of `1 − e^{−t/0.1}` at t = 0.1 and 0.3.
  - Snapshot: first 20 drafts at k = 0.7, seed 7.
- [ ] Run — fails. Implement: accumulator of 5 ms substeps; per substep ease `level`, compute `λ = base(level) + excitation`, fire when `rng() < 1 − e^{−λ·h}`, add `tuning.exciteBoost` to excitation on fire, decay excitation by `e^{−h/τ}`; energy and kind from Task 2.
- [ ] Run — passes. Commit `add the self-exciting fault process`.

### Task 4: voice cap

**Files:** create `src/audio/cap.ts`; test `test/audio/cap.test.ts`.

`VoiceCap(max)` has `admit(gain, stop): Ticket | null` and `release(ticket)`. Below `max`, admits. At `max`, a gain below every active gain returns `null`; otherwise the quietest active voice's `stop` is called and removed, and the new one admitted.

- [ ] Tests for each branch, plus `release` freeing a slot.
- [ ] Implement, pass, commit `add the voice cap`.

### Task 5: page effects

**Files:** create `src/page/motion.ts`, `src/page/haptics.ts`, `src/page/jolt.ts`, `src/page/page-flash.ts`, `src/page/dwell.ts`; tests `test/page/haptics.test.ts`, `test/page/dwell.test.ts` (both `// @vitest-environment jsdom`).

- [ ] Haptics tests: no call before user activation; `vibrate(10 + 40·energy)` rounded after; a second pulse within 50 ms is dropped; no throw where `navigator.vibrate` is missing.
- [ ] Dwell tests (fake timers, driving `performance.now` via an injected `now`): `pointerenter` then 2000 ms of `rise: 4000` gives 0.5; `pointerleave` then 300 ms of `fall: 600` gives 0.25; listeners fire on change with the last `pointermove` client position; `dispose` removes listeners.
- [ ] Implement. `dwell` advances its value on `requestAnimationFrame` while changing and stops the loop when settled. `Jolter.kick(energy, rng)` builds eight keyframes of damped random `translate` offsets over 180 ms with `composite: 'add'`; `dispose` cancels outstanding animations. `PageFlash` appends one fixed, pointer-events-none element with a class and a `<style>` it owns, and pulses opacity with `animate`.
- [ ] Pass, commit `add jolt, haptics, page flash and dwell`.

### Task 6: sparks

**Files:** create `src/sparks/textures.ts`, `src/sparks/kinds.ts`, `src/sparks/emitters.ts`, `src/sparks/arcs.ts`, `src/sparks/flashes.ts`; test `test/sparks/emitters.test.ts`.

- [ ] Node test (three and quarks construct without a GL context): `SparkEmitters` is not `live` initially; `fire('burst', at, 1, 1)` makes it `live` once in a `Scene` and updated; after 2 s of updates it is not `live`; updating outside a scene neither throws nor disposes (a later `fire` inside a scene still spawns).
- [ ] Implement from the spike: one `ParticleSystem` per spark kind with the shared behaviors plus per-kind `SpeedOverLife` drag, `ApplyCollision` only where `floor` is set and the kind bounces; `fire` scales count by `energy` and `countScale`. `Arcs.strike(from, to, energy, duration)` keeps up to four live arcs; each render frame rebuilds three ribbons (widths 7, 2.5, 1 px × scale) perpendicular to `cross(segment, cameraDirection)`. `Flashes.fire(at, energy, tint)` shows a pooled additive sprite and, when lights are enabled, drives the next of four `PointLight`s that stay parented at intensity 0.
- [ ] Pass, commit `add spark emitters, arcs and flashes`.

### Task 7: audio

**Files:** create `src/audio/voices.ts`, `src/audio/engine.ts`.

- [ ] Implement voices against `BaseAudioContext` per spec. Each `play*` returns `{ peak, end, stop }`.
- [ ] `AudioEngine(options, rng)`: listens on `window` for `pointerdown`, `keydown`, `touchend` (capture, once) unless `navigator.userActivation?.hasBeenActive`; builds master gain → compressor → destination; suspends/resumes on `visibilitychange`; `discharge(d, pan)` routes by kind through `VoiceCap(24)`; `setHum(level)` creates the hum on first non-zero level after unlock; `crackle(count, pan)` for fizz; `dispose` closes the context and removes listeners.
- [ ] Browser verification lands in Task 10. Commit `add synthesized voices and the audio engine`.

### Task 8: layer

**Files:** create `src/layer.ts`; test `test/layer.test.ts`.

- [ ] Node tests with `sound: false`: a fault at intensity 1 inside a `Scene` produces discharges within 1 s of updates (spy via `options.onDischarge`, a public hook for callers that want to add their own channel); `live` is true while faulting and false after `stop()` and 2 s; `dispose` detaches `object`'s children; one-shots with `energy` outside 0..1 are clamped.
- [ ] Implement: `update(dt)` clamps to 0.05, steps every fault, turns drafts into `Discharge`s, dispatches to emitters/arcs/flashes/audio/jolt/haptics/page flash, emits fizz particles and crackle at `fizzRate`, sets hum to the loudest fault's level. Reduced motion disables jolt, lights and page flash and halves counts.
- [ ] Pass, commit `add the layer`.

### Task 9: overlay and exports

**Files:** create `src/overlay.ts`, `src/index.ts`.

- [ ] Implement: canvas with a class and an injected `<style>` (fixed, inset 0, pointer-events none) over the viewport, or absolutely positioned over `target`; `WebGLRenderer({ alpha: true, antialias: true })`, clear alpha 0; `OrthographicCamera(0, w, 0, −h)`; client `(x, y)` ↔ world `(x, −y, 0)`; `floor` defaults to the bottom of the viewport; `pan` from `x / innerWidth`; loop runs while `live` and restarts on the next call; `loop: false` exposes `render(dt)`; `supported` from a context probe.
- [ ] `npm run typecheck`, `npm run build` succeed. Commit `add the overlay host and public exports`.

### Task 10: lab, harness and browser specs

**Files:** create `lab/index.html`, `lab/main.ts`, `lab/harness.html`, `lab/harness.ts`, `lab/vite.config.ts`, `lab/test/audio.spec.ts`, `lab/test/render.spec.ts`, `playwright.config.ts`.

- [ ] Harness exposes `window.harness` with `renderVoice(name, energy)` (OfflineAudioContext → `{ peak, rms, lastAudibleSecond }`) and `renderOverlay(seed)` (overlay with `loop: false`, a burst at the center, 8 frames, readPixels → `{ lit, cornerAlpha, overAlpha }`).
- [ ] Specs: every voice is non-silent, peaks ≤ 1, and falls silent by its expected length; overlay render lights pixels, leaves corners transparent, has no pixel with color above alpha, and logs no console errors.
- [ ] Lab page: buttons per one-shot, intensity slider on a fault, a hover pad driving `dwell`, sliders for the tuning constants and volume. Vite `server.host: '::'`.
- [ ] Run `npx playwright test`; commit `add the lab and browser specs`.

### Task 11: finish

- [ ] README with the masthead example; `npm run check`; mark the spec and this plan built; update `~/src/PROJECTS.md`. Commit `document magicsmoke`.
