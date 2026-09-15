# magicsmoke

Hardware failing on a web page: sparks, electrical arcs, pops and crackle, a mains hum, flashes of
light, the element jerking, the phone buzzing. Built on three.js and three.quarks, with every sound
synthesized live and no image or audio assets.

## Install

```sh
npm i magicsmoke three
```

## A page with no three.js scene

`createOverlay` puts a transparent canvas over the viewport and takes client coordinates.

```ts
import { createOverlay, dwell } from 'magicsmoke';

const fx = createOverlay({ sound: true, jolt: sign });
const fault = fx.fault({ at: { x: 0, y: 0 } });

// The longer the pointer rests in one spot on the sign, the harder it fails; moving drains it.
dwell(sign, { rise: 1500, touchRise: 600, fall: 600 }).onChange(({ value, x, y }) => {
  fault.intensity = value;
  fault.at = { x, y };
});
```

One-shots fire a single discharge: `fx.sputter(at)`, `fx.burst(at)`, `fx.shower(at)` and
`fx.arc(from, to)`, each with an optional energy from 0 to 1.

## Inside a three.js scene

`createLayer` returns an object to add to your scene and an `update` to call each frame. It takes
world coordinates, y up.

```ts
import { createLayer } from 'magicsmoke';

const layer = createLayer({ sound: true, scale: 0.01 }); // world units per CSS pixel
scene.add(layer.object);

const fault = layer.fault({ at: new Vector3(0, 1, 0), to: new Vector3(0.5, 1, 0) });
fault.intensity = 0.7;

renderer.setAnimationLoop((time) => {
  layer.update(clock.getDelta());
  renderer.render(scene, camera);
});
```

A fault given a `to` point arcs to it. `fault.blow({ peak, after })` overloads a fault: it
discharges ever faster and harder while the element shakes, throws a volley of showers at the climax
`peak` milliseconds later, and dies out over `after`. Time `peak` to a sign's own flare. `layer.whine`, from 0 to 1, is a high ballast whine for a
tube striking back on: it comes in at once and fades out when set back to 0.
`layer.live` is false once nothing is moving, lit or
sounding, so a host can stop rendering.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `sound` | `false` | `true`, or `{ volume, muted, mains: 50 \| 60 }` |
| `jolt` | none | An element that jerks with each discharge |
| `haptics` | `false` | Vibrates with each discharge where the browser supports it |
| `pageFlash` | `false` | A white full-page pulse on the largest discharges |
| `floor` | viewport bottom (overlay), none (layer) | Where showers and sputter bounce |
| `seed` | random | Makes the sequence of discharges repeatable |
| `reducedMotion` | `'respect'` | `'ignore'` keeps jolt, lights and page flash under reduced motion |
| `tuning` | `DEFAULT_TUNING` | Every effect's settings and its `from` threshold, editable live; `TUNING_SCHEMA` describes each one for a lab |
| `onDischarge` | none | Called for every discharge, to drive an effect of your own |

## What browsers allow

- **Sound waits for a click, tap or keypress.** Hovering does not unlock audio, so a visitor who
  goes straight to a hover effect sees sparks in silence until they first click somewhere.
  Discharges before then make no sound; they are not saved up.
- **Vibration** works only in browsers that implement `navigator.vibrate`, which excludes iOS
  Safari, and only after the page has had a user gesture.
- **Reduced motion** turns off jolt and a blow's shudder, point lights and page flash, and halves the sparks. Sound
  stays.
- Where WebGL is unavailable the overlay reports `supported: false` and every call does nothing.

## Development

```sh
npm run dev           # the lab: one-shots, a standing fault, a hover target, live tuning
npm test              # Node tests
npm run test:browser  # Playwright: rendered pixels and offline-rendered voices
npm run check         # lint, typecheck, Node tests
```

The design is in `docs/superpowers/specs/2026-09-14-magicsmoke-design.md`.
