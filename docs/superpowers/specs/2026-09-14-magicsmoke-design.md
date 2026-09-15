# magicsmoke — design

**For:** whoever builds magicsmoke or wires it into a page. **Answers:** what the library does, how
its parts fit, and what klieg has to add before sparks can live inside its scene.

**Status: built** on 2026-09-14, against three 0.185, three.quarks 0.17.1 and klieg 0.11.0. The
three klieg additions under "What klieg needs to add" are not built. The lab uses native controls
rather than labkit.

## What it is

A browser library that makes a page look like hardware failing in front of you: sparks, arcs, pops,
a mains hum, flashes of light, the element jerking, the phone buzzing. Framework-agnostic three.js,
published on npm as `magicsmoke`, built as a companion to klieg. The first use is the neon masthead
on the portfolio site, which should sputter and crackle harder the longer the pointer rests on it.

**Not in v1:** screen faults (brownout, tearing, channel split, scanline roll) are a different
toolkit — CSS filters and clip-paths, since three.js cannot draw the DOM — and get their own spec.
Smoke is not rendered yet, despite the name. Sound is synthesized only; no recorded samples.

## Shape

One core, two ways to host it.

```ts
function createLayer(options?: LayerOptions): Layer;

interface Layer {
  readonly object: Object3D;    // the host adds this to its scene
  readonly live: boolean;       // anything still moving, lit, sounding or faulting
  update(dt: number): void;     // seconds; the host calls it once a frame
  sputter(at: Vec3, energy?: number): void;
  burst(at: Vec3, energy?: number): void;
  shower(at: Vec3, energy?: number): void;
  arc(from: Vec3, to: Vec3, energy?: number): void;
  fault(spec: { at: Vec3; to?: Vec3; intensity?: number }): Fault;
  dispose(): void;
}

interface Fault {
  intensity: number;            // 0..1, eased toward on write
  at: Vec3;
  to: Vec3 | null;              // present, the fault can arc
  stop(): void;
}
```

`energy` is 0..1 and defaults to 0.5. World space is three's: y up.

`LayerOptions`: `seed`, `scale` (world units per CSS pixel, default 1 — every speed and size is
tuned in pixels), `floor` (a world y that showers and sputter bounce off), `sound`
(`boolean | { volume, muted, mains: 50 | 60 }`), `pan` (`(at) => -1..1`), `jolt` (an element),
`haptics`, `pageFlash` (default off), `reducedMotion` (`'respect'` default, or `'ignore'`).

```ts
function createOverlay(options?: OverlayOptions): Overlay;
```

A layer also has `setFloor(y)`, `volume`, `muted`, a live-editable `tuning`, and takes an
`onDischarge` option for a caller adding a channel of its own.

The overlay host is a transparent canvas over the whole viewport, so sparks can fall past the
element that threw them, with a renderer and an orthographic camera in which one world unit is one
CSS pixel. Its `floor` is a client y, defaulting to the bottom of the viewport. It exposes the same one-shots and
`fault()` in **client coordinates** (`{ x, y }`, y down) and converts at the boundary. It runs its
own frame loop and stops it whenever the layer is not `live`. `loop: false` hands the loop to the
caller as `overlay.render(dt)`, for capture and for tests. It reports `supported: false` where
WebGL is unavailable, and every call is then a no-op.

```ts
function dwell(element: Element, spec: { rise: number; fall: number; drain?: number }): Dwell;
interface Dwell {
  readonly value: number;       // 0..1
  readonly x: number;           // last client position over the element
  readonly y: number;
  onChange(listener: (d: Dwell) => void): () => void;
  dispose(): void;
}
```

`value` climbs linearly to 1 over `rise` ms while the pointer stays over the element and falls
over `fall` ms after it leaves. Moving costs value: `drain` CSS pixels of travel (default 200)
cost all of it, so the value measures how long the pointer has stayed in one place — a localized
disruption — and builds back up once it rests. A `pointercancel` — a touch the browser has taken over for
scrolling — counts as leaving. The masthead needs nothing more:

```ts
const fx = createOverlay({ sound: true });
const fault = fx.fault({ at: { x: 0, y: 0 } });
dwell(masthead, { rise: 4000, fall: 600 }).onChange(({ value, x, y }) => {
  fault.intensity = value;
  fault.at = { x, y };
});
```

## Modules

| Path | Owns | Depends on |
| --- | --- | --- |
| `src/rng.ts` | seeded PRNG (mulberry32) | — |
| `src/fault/` | discharge timing, energy, kind choice, intensity easing | rng |
| `src/sparks/` | quarks systems per kind, arc ribbons, glow sprites, the light pool | three, three.quarks |
| `src/audio/` | context, unlock, limiter, voice cap, the five voices | Web Audio |
| `src/page/` | jolt, haptics, page flash, reduced motion, `dwell` | DOM |
| `src/layer.ts` | wires a fault's discharges to every channel | all of the above |
| `src/overlay.ts` | renderer, camera, loop, coordinate conversion | layer |

`src/fault/` has no three.js and no DOM, so the behavior that decides whether it reads as
electrical is testable in Node.

## A discharge

Every effect keys off one event: `{ kind, at, to?, energy, time }`. A one-shot is a discharge the
caller placed; a fault is a source of them. Channels subscribe to discharges, which is what keeps a
spark, its pop, its flash and its jolt on the same frame.

## How a fault behaves

These constants are `tuning.fault`; see Tuning.

**Timing** is a self-exciting random process. The base rate is `r(k) = 0.3 + 2.2·k²` per second.
Each discharge adds 3.3/s to the rate, decaying with τ = 150 ms: a branching ratio of 0.5, so the
long-run rate is about twice the base (0.6/s at k = 0.1, 5/s at k = 1) and discharges bunch into
stutters rather than keeping time. The process advances in fixed 5 ms substeps from an accumulator,
so the sequence for a seed does not depend on how the host chunks its frames. `update` clamps `dt`
to 50 ms, so a backgrounded tab does not release a backlog.

**Energy** is `min(1, u⁸·(0.35 + 0.65k) + 0.1k)` for uniform `u`: almost all small, rarely large,
and the whole distribution rises with intensity. Energy picks the kind — below 0.25 a sputter flare, below 0.75 a burst, above that a shower — and a
fault with `to` turns half of its discharges above 0.45 into arcs. A shower due within 2.5 s of the
last becomes a burst, so showers stay occasional and land harder for it. Energy then scales particle count, flash strength, jolt amplitude and vibration length; pop
loudness follows the fault's intensity instead.

**Between discharges** a fault above zero fizzes continuously at `at` (about 4·k small sparks a
second) and hums at a level proportional to k.

**Intensity** eases toward each write with τ = 100 ms. At zero a fault is dark and silent.

## Sparks

Each kind is one looping three.quarks `ParticleSystem`, created with the layer and never destroyed,
so no shader compiles mid-hover. Systems are world-space, so sparks already flying stay put when a
fault moves. Particles render as `RenderMode.StretchedBillBoard` with additive blending on a
generated soft-dot texture; there are no image assets.

Shared behaviors: `ColorOverLife` cools white → yellow → orange → red while alpha fades,
`SizeOverLife` shrinks, `ApplyForce` pulls down at 900 px/s², `SpeedOverLife` is the drag, and
`ApplyCollision` against a plane resolver at `floor` bounces at 0.35.

| Kind | Count | Speed px/s | Life s | Drag | Floor |
| --- | --- | --- | --- | --- | --- |
| sputter flare | 1–4 | 40–380 | 0.15–0.60 | light | yes |
| burst | 4–12, larger | 250–700 | 0.25–0.60 | medium | no |
| shower | 60–120 | 150–600 | 0.50–1.40 | light | yes |

Counts scale with energy and halve under reduced motion.

**Arcs** are not particles. Each is a ribbon mesh rebuilt in `onBeforeRender`, which is the one
place the camera is known, by midpoint displacement between `from` and `to`, with a random branch
about half the frames. Three additive passes — wide faint blue, mid, white core — stand in for
bloom, which destroys canvas transparency.

**Flash** is a glow sprite at the discharge point, always, whose opacity follows energy squared, plus
a pool of four `PointLight`s. A flash landing near a glow still lit relights that glow instead of
adding another: additive glows stacked on one spot sum past white into a flat disc. The pool's lights
stay in the scene at intensity 0 when idle: changing the number of lights in a scene recompiles every
lit material in it. Whether klieg's tube materials respond to point lights is unverified. `pageFlash` adds a full-page white pulse on discharges above 0.8 energy, off by default
for photosensitivity.

## Page effects

**Jolt** plays a Web Animations keyframe track on the element's `translate` property with
`composite: 'add'`: eight damped random offsets over 180 ms, amplitude 6px times the strength. A fault's strength is its intensity past `tuning.jolt.from`
(default 0), ramping from zero there to full at 1; a one-shot's is its energy. Additive
composition stacks overlapping jolts and leaves the element's own `transform` and `translate`
alone, and nothing writes inline style. `dispose` cancels the animations.

**Haptics** call `navigator.vibrate(10 + 40·energy)` at most once per 50 ms, only after the page
has had a user activation, and not at all where the API is missing.

**Reduced motion** (`prefers-reduced-motion: reduce`, unless `reducedMotion: 'ignore'`) disables
jolt, point lights and page flash, and halves spark counts. Sound is not motion and stays.

## Sound

**Unlock.** Browsers keep audio locked until a click, tap or keypress; hover does not count. The
engine creates its `AudioContext` on the first `pointerdown`, `keydown` or `touchend`, or at once
if `navigator.userActivation.hasBeenActive`. Discharges before that are dropped, never queued — a
pop three seconds late sounds broken. A fault live at unlock starts its hum then.

**Chain.** Voices → master gain (`volume`, `muted`) → `DynamicsCompressor` as a limiter
(threshold −6 dB, ratio 20, attack 2 ms, release 100 ms) → destination. Each voice pans through a
`StereoPannerNode` by `pan(at)`; the overlay supplies `(x / innerWidth · 2 − 1) · 0.8`.

**Voices.** Every voice is built against a `BaseAudioContext`, so tests can render it offline.

- **Hum:** sawtooth at twice mains plus a quieter square an octave up, band-passed around 180 Hz,
  with a slow random flutter on its gain. Level follows k. A discharge above 0.6 energy detunes it
  −30 cents, recovering over 200 ms — the load sag.
- **Crackle:** 1–8 ms slices of a seeded two-second noise buffer, high-passed at 3 kHz, at the
  fault's fizz rate.
- **Pop:** noise through a band-pass sweeping down from 1.6–4.2 kHz to 250–800 Hz at Q 2–7, over a
  45–110 Hz thump on about two pops in three, with a weaker second crack on about one in five. Every
  range is drawn per pop, so no two sound alike. Loudness follows the fault's intensity.
- **Shower tail:** 20–60 crackle clicks at exponentially widening gaps over 0.6 s, each panned within
  ±0.4 of the source.
- **Arc buzz:** sawtooth at twice mains through a `tanh` waveshaper and a 1.2 kHz band-pass, plus
  hiss above 5 kHz, gated to the strike with 3 ms ramps.

**Pop timing.** Pops keep their own irregular clock — exponential gaps averaging 0.7 s, never
under 0.12 s — and take whichever discharge arrives when it opens. A fault turned up gets louder pops,
not more of them. A shower always pops.

**Cap.** At most 24 voices. A new voice quieter than every active one is dropped; otherwise the
quietest active voice is stopped for it.

**Hidden tab.** The context suspends on `visibilitychange` to hidden and resumes on visible.

## Tuning

`tuning` is one object grouped by effect — `fault`, `sparks`, `fizz`, `arcs`, `glow`, `lights`,
`crackle`, `pops`, `hum`, `jolt`, `haptics`, `pageFlash` — read as each effect is used, so writes take
effect at once. `createLayer({ tuning })` lays overrides over `DEFAULT_TUNING` group by group, as
`resolveTuning` does.

Every group but `fault` has a `from`: the fault intensity where that effect starts. Below it the
effect is off; above it, whatever scales with intensity — jolt strength, pop loudness, fizz rate, hum
level — ramps from zero at `from` to full at 1. One-shots carry no intensity, so thresholds never
hold them back.

`TUNING_SCHEMA` describes every value as plain data — label, range, step, hint — so any lab can build
its controls from it without depending on magicsmoke's own. A test holds the schema and the defaults
to the same keys and keeps every default inside its range.

## What klieg needs to add

None of these block magicsmoke itself. The portfolio masthead waits for them rather than launching
on the overlay host (decided 2026-09-14). Each is a klieg spec, built in klieg, as public API.

1. **`klieg.attach(layer)`**, returning a detach function: the layer's `object` joins klieg's scene,
   so sparks get bloom and depth, and klieg does not go idle while `layer.live`.
2. **A pointer-to-type mapping** that returns the world point on the type under a client position,
   so a fault can sit on the tube itself.
3. **A dwell signal beside `near`**, so the tube's own flicker builds with how long the pointer has
   stayed.

## Testing

**Node (vitest):** the fault process under a seed and a stepped clock — rate at several k within
tolerance, inter-arrival variance above a Poisson process's, energy-to-kind mapping, easing, the
`dt` clamp, silence at k = 0, invariance to frame chunking, and a snapshot of one seed's discharge
sequence. `dwell` under jsdom.

**Browser (Playwright, against the lab's dev server):** each voice rendered through an
`OfflineAudioContext` is non-silent, peaks under the limiter ceiling and lasts as long as it
should; nothing sounds before unlock. The overlay with `loop: false` and a seed draws non-transparent
pixels where sparks are, leaves the rest transparent, and logs no WebGL errors. Pixel goldens are
deliberately absent: GPU output differs between machines.

**By eye and ear:** the lab (`npm run dev`) — a button per one-shot, an intensity slider on a live
fault, a hover pad driving `dwell`, and a control panel over the tuning constants.

## Build order

1. **Spike** (`spikes/quarks/`, done). A burst fires through the public `emit()` with a fresh
   emission state; `ApplyCollision` holds sparks above the floor once the resolver clamps position;
   stock `AdditiveBlending` composites validly over a transparent canvas, while custom alpha factors
   are dropped by quarks' batch material. Additive light cannot darken, so sparks over a white page
   read faintly — as real ones do in daylight.
2. `rng` and the fault process.
3. The layer skeleton and overlay host, with sputter and the hum.
4. Burst and pop.
5. Shower and its tail.
6. Arc and its buzz.
7. Flash, jolt, haptics, page flash.
8. `dwell` and a masthead page in the lab.
