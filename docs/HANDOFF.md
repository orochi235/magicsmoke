# magicsmoke handoff

**For:** the next session picking up magicsmoke and the portfolio masthead. **Answers:** where the
work stands, what is next, and the decisions made in conversation that the code does not record.

Written 2026-09-15. Check it against `git log` before trusting it.

## Where it stands

- **magicsmoke** is public at `orochi235/magicsmoke` and on npm. Releases publish from a `v*` tag
  through `.github/workflows/release.yml` using npm trusted publishing (OIDC, with provenance), so
  a release is: bump `package.json`, commit, push, push the tag. `npm view magicsmoke version` for
  what is out.
- **The portfolio** (`~/src/portfolio`, repo `orochi235.github.io`) deploys to michaelbaker.tech on
  every push to `main`. The masthead runs magicsmoke sparks inside klieg's scene, and the magicsmoke
  entry has a live tile. Both install klieg and magicsmoke from npm.
- **klieg 0.13.1 is out and live on the masthead** with the overload flare (`power({ flare, onState })`,
  `blowout()`, a `'flaring'` state). It rode along with the magicsmoke 0.1.2 deploy, since the
  portfolio's `^0.13.0` resolved to it. Every short now flares by default, so the overload blows the
  sign out bright — but **silently**: `intensity()` in the masthead mutes the fault in every state
  but `'on'`, flaring included. The loud half below is what finishes it.

## Next: move the overload flare into magicsmoke

The ask, in the user's words: when the overload happens, "everything should be very loud and bright
for a moment before it dies", and "pull the flare effect into magicsmoke — it probably makes more
sense here". **No page flash** (photosensitivity). And it should **shudder violently as it climaxes**:
the element shaking hard and fast, building to the peak of the flare, far past the 6px ordinary jolt,
and skipped under reduced motion like the rest of the flare.

Undecided, and worth settling before code:

- **What moves.** klieg's `blowout()` brightens the sign's own glow, which is klieg's material, so a
  plausible split is klieg keeping the sign's brightness and magicsmoke owning the loud moment — a
  one-shot or fault verb that fires shower, burst and arc at full energy, a maximal pop, glow and
  jolt, then lets the fault die. Confirm that split, and whether klieg's default flare should stay on.
- **How the masthead triggers it.** klieg reports the state through `power({ onState })`. The
  layer does not exist when the drive is created (`createMastheadDrive` in
  `portfolio/src/lib/mastheadPower.ts`), so the listener has to reach something `wireMastheadSparks`
  sets.

Known wiring either way: `intensity()` in `portfolio/src/lib/mastheadSparks.ts` mutes the fault
whenever the tube is not `'on'`; it must let `'flaring'` through and mute only `'shorted'` and
`'warming'`. Every klieg short now flares by default; `power({ flare: null })` cuts straight to dark.

## Decisions made in conversation

- Overload: the hover held at full for 3 s shorts the sign, which relights 3 s later with a strike.
- The masthead shakes only past 90% intensity (`jolt: { from: 0.9 }`).
- Moving the pointer drains intensity (`dwell` `drain`, 200 px); it models a localized disruption.
- Pops keep their own clock: louder with intensity, never more frequent.
- Sparks stay sparse: a few big ones or an occasional shower, never constant.
- Touch builds in 600 ms (`touchRise`) against 1.5 s for a mouse, and a missed fingertip looks
  outward in rings for the tube (`pointNear`).
- Tuning is grouped by effect with a `from` threshold each, and `TUNING_SCHEMA` is plain data so a
  klieg lab can build controls from it. The tuning lab (`npm run dev`, `tuning.html`) is labkit.

## Next after the flare: arcs from the cursor

Decided in conversation: on the masthead, arcs jump **from the cursor itself to the nearest active
surface** — a plasma-ball reach rather than physics. Accuracy is welcome but not required.

- One end is the pointer carried onto the sign's depth (the hit's world point offset by the pixel
  distance times `unitsPerPx`, y flipped); the other is the nearest lit stroke, found by probing
  outward the way `pointNear` does but farther than its 16px.
- Only a lit tube draws one: no arcs while klieg reports the tube `'shorted'` or `'warming'`.
- At today's tuning an arc strikes about once every three seconds at full intensity, so this likely
  wants its own `arcs.from` and a higher `fault.arcShare`, set in the tuning lab.
- Arcs have only ever drawn in the flat overlay; they have not been seen under klieg's perspective
  camera.

## Still open

- The magicsmoke portfolio entry's body text went live without the user reviewing it
  (`portfolio/src/projects/magicsmoke.ts`).
- Sparks read pale gold under klieg's bloom rather than orange.
- `WindeaseTile.tsx` throws `undo is not a function` intermittently; not magicsmoke's.
- The merged `magicsmoke-masthead` branch still exists locally and on GitHub.

## Traps

- **Another session works in the same portfolio checkout.** Stage explicit paths; never `git add -A`
  there. Its hot-reloading edits also break timing checks against the dev server.
- **A fresh npm publish is not installable for a minute or two** (`ETARGET`). Retry with
  `--prefer-online`.
- **`| grep` hides a failing command's exit status.** Send output to a log and test the exit code.
- **`pointOn` hits only the tube stroke itself.** Use `pointNear` when probing by hand.
- The npm wrapper prints `_pw_npm_token: command not found` on every call; it is noise.
