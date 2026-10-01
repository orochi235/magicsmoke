# magicsmoke on blits

**Status: designed 2026-09-30, unbuilt.** Branch `blits-engine`. Delete this file once the old engine
is retired, moving anything still true into `README.md` and the doc comments first.

**For:** whoever builds it. **Answers:** what magicsmoke's blits-based API is, how a fault runs as a
blits voice, how the old engine stays available to compare against, and what "the same" means.

blits (`~/src/blits`, linked by `file:` until it publishes, possibly as
`@msb235/blits`) mixes concurrent effects: a **patch** played with its own clock and **weight** is a
**voice**; a **mix** folds the voices reaching one **subject** into one pose per frame, and the host
reports the clock with `sync(timestamp)`. Its design is `docs/schema.html` there, which already
carries this shape in its faults row.

## The API

```ts
import { createSmoke, dwell, fault } from 'magicsmoke';

const smoke = createSmoke({ seed, scale, floor, sound, pan, jolt, haptics,
                            pageFlash, reducedMotion, tuning, onDischarge }); // LayerOptions, unchanged
scene.add(smoke.object);

const hover = dwell(el, { rise: 1500, fall: 400 });          // also a blits Signal
const f = smoke.cue(fault({ at, to }), { weight: hover });   // FaultHandle
f.weight = 0.8;
f.blow({ peak: 1000, after: 300 });
f.fade({ over: 300 });

smoke.whine = 1;
smoke.burst(at, 0.7);

function frame(ts: number) { smoke.sync(ts); renderer.render(scene, camera); }
document.addEventListener('visibilitychange', () => document.hidden || smoke.rebase());
```

- **`createSmoke(options): Smoke`** takes `LayerOptions` as they are. `Smoke` keeps `object`, `live`,
  `tuning`, `volume`, `muted`, `whine`, `setFloor`, the four one-shots and `dispose` with their
  `Layer` meanings, and replaces `update(dt)` with `sync(timestamp)` (ms, the rAF clock) and
  `rebase()`. `sync` derives the frame gap the particles, arcs and flashes advance by, capped at
  50 ms as `update` caps it today.
- **`fault({ at, to }): FaultPatch`** builds the patch; **`smoke.cue(patch, spec)`** takes blits'
  `VoiceSpec` less `patch`, `target`, `locus` and `from`, and returns a **`FaultHandle`**: blits'
  `Handle<FaultRecord>` plus mutable `at`, `to` and `blow(spec)`. The weight is the intensity, a
  number or any blits `Signal`. `fade(opts)` replaces `stop()`.
- **`dwell(element, spec)`** returns the same object as today — `value`, `x`, `y`, `onChange`,
  `dispose` — and is also a blits `Signal` marked `input`. It drops its own rAF loop: the value is
  computed at each read from the last pointer event (linear rise and fall, drain applied at the
  move), against `performance.now()`, and a rAF loop runs only while `onChange` has listeners. It
  cannot become `slew(level())`: drain subtracts from the value itself, and blits keeps slew state
  where the host cannot write it.
- **`createSmokeOverlay(options)`** is `createOverlay` over a `Smoke`: client-coordinate faults
  through `cue`, its own frame loop calling `sync`.

## A fault is one voice

The fault mix is `mix(kit({}), { stepMs: 5 })`, one per `Smoke`. Its subject is magicsmoke's
**fault record** — `at`, `to`, and the process state — one per cue; the voice targets only its own
record. The patch writes no channels. Everything it does happens in `step` and leaves through
`setting.send`.

| Today (`FaultProcess`, `layer.ts`) | On blits |
|---|---|
| A 5 ms substep loop counted from the process's start, each stamped `ticks * SUBSTEP` | `step` once per interval, `dt === 5`, stamped with the interval's end. Same grid, same stamp. |
| `target`, written by the host | `setting.weight`, after fades and the signal |
| Exponential ease toward `target` per substep (`easeTau`) | The same line inside `step`. blits' `lag` is not used: it lands within a floor, and parity wants the exact curve. |
| `drafts.push(...)`, returned from `step(dt)` | `setting.send(draft)`; `sync` calls `mix.drain()` and hands each event to `discharge()`, which moves out of `layer.ts` unchanged, reading `at`/`to` from the record |
| `fork(rng)` in `layer.fault()` | `fork(rng)` in `smoke.cue()`, never lazily on first sight, so forks happen in cue order |
| `advanceBlow` in `layer.ts` | Record state, advanced in `step`: pins the target to 1, ramps `surge` and `lift`, snuffs and fires the volley at the climax (as events), ignores the weight until `after` |
| `stop()`; the layer forgets the fault once its level is under `SILENT` | `fade()` takes the weight to 0, but the `FaultHandle` holds the voice until the eased level is under `SILENT` and only then lets blits remove it, so the wind-down still discharges |
| Fizz and crackle per frame from the eased level | Unchanged, reading the eased level off each record after `sync` |
| Hum: the loudest fault's level past `hum.from`, set per frame | Unchanged |

Two blits settings are load-bearing for parity:

- **`start`.** blits counts the grid from a voice's `start`, by default the next sync. The old
  process counts the gap before its first `update` as process time, so `smoke.cue` passes the last
  synced timestamp as `start`. Both count from the frame before the first advance. A fault cued
  before any sync falls back to blits' default; the parity suite and the `update(dt)` alias avoid
  that by syncing at 0 when they create the engine.
- **No `reduce` on the fault mix.** Under reduced motion blits steps by the frame gap instead of the
  grid. magicsmoke's own reduced motion (half the particles, no lights, no jolt) stays where it is.

## Old and new side by side

`createLayer`, `Layer.fault`, `update(dt)` and `createOverlay` keep the old engine, untouched, until
the A/B passes. Then the old engine is deleted and they become aliases over the new API:
`update(dt)` accumulates a clock and calls `sync`, `fault(spec)` cues `fault(spec)` with
`weight: spec.intensity`, `intensity` reads and writes the weight, `stop()` is `fade()`.

## What "the same" means

Same seed and same frame script give identical discharges — kind, energy, time, position — and
identical per-frame hum, whine and jolt calls.

- **Parity suite (vitest).** Each script drives both engines: weight writes, a `dwell`-shaped
  signal, `blow`, `stop`/`fade`, one-shots, at 30, 60, 120 and 144 fps. Every gap is at most 50 ms.
- **The one known divergence.** After a gap over 50 ms the old process drops the excess from its own
  clock, while blits' `maxDt` skips ahead on the grid and stays on real time. One test pins that
  difference; it is the new behavior, not a defect.
- **Lab.** `?engine=old|smoke` in the tuning lab and the harness, and the Playwright pixel and audio
  specs run once per engine.

## Benchmark

`bench/frame.mjs`, after blits' own: engine cost alone, no WebGL, at 1, 10 and 100 faults, for
both engines — ms per frame and GC count, one printed line per case as it finishes. Rendering is
shared between the engines, so it is left out.

## Decided against

- **A second, one-subject mix for whine, hum and jolt.** Jolt is already a sum mix the browser
  composites (WAAPI, `composite: 'add'`); whine and hum fade on the audio clock with
  `setTargetAtTime`, which a per-frame mix would quantize and which the offline audio baselines
  pin. Hum is one maximum with nothing to fold.
- **Keeping the process host-side, reading a probed pose.** Right while blits had no fixed-interval
  stepping or events; both landed 2026-09-30 for this.

## Before the suite runs anywhere

magicsmoke has no `.onto/`, so it goes through `onto-enlist` first; a `file:` dependency on
`../blits` means the fleet node needs the blits checkout beside it.
