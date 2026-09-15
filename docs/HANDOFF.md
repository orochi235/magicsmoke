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
- **The overload is loud as well as bright** as of magicsmoke 0.2.0. `fault.blow({ peak, after })`
  surges the fault toward a climax while the element shudders, throws a volley of showers there, and
  fades it to zero; the `blow` tuning group sets it, and the tuning lab has a blow button. The
  masthead passes klieg its own flare (`overloadFlare` in `portfolio/src/lib/mastheadPower.ts`) and
  calls `blow` on `'flaring'` with the same `OVERLOAD` timing.
- **magicsmoke 0.3.0 adds `layer.whine`**, a high ballast whine fading over 0.8 s, which the
  masthead and the magicsmoke tile play while the sign strikes back on after a short. They tune it
  to 12 kHz (`REARM_WHINE`), barely perceptible as the user asked; 15 kHz was likely inaudible to
  them; magicsmoke's default is 2.4 kHz,
  and its lab slider stops at 8 kHz. The re-arm
  itself is `strike(REARM)`: 700 ms and 7 blinks against klieg's 1.2 s and 4.
- **The masthead dims the tubes around a resting cursor** (`MASTHEAD_HUSH` in `mastheadLook.ts`):
  gain falls with klieg's `near()` (1.2 em) times the hover squared, to 0.15 under a held cursor, and
  lifts while the tube flares. Its jolt is 3 px and its overload shudder 10 px (`MASTHEAD_SHAKE`).
- **None of the overload, hush, re-arm or whine has been seen or heard in a browser.** Tests and
  builds pass, but the Playwright MCP was down this session. Every number above is a first guess to
  tune by eye and ear; the magicsmoke tuning lab has blow and whine controls.

## Decisions made in conversation

- Overload: the hover held at full for 3 s shorts the sign, which relights 3 s later with a strike.
- The overload splits across the libraries: klieg owns the sign's brightness, magicsmoke owns the
  sparks, sound and shudder. The flare builds for 1 s to 3× glow and collapses over 300 ms, and the
  shudder and shower volley peak with it. No page flash, for photosensitivity. Under reduced motion
  klieg skips the flare, so the masthead never blows.
- The masthead shakes only past 90% intensity (`jolt: { from: 0.9 }`), and the user asked for less
  shaking than magicsmoke's defaults.
- The cursor suppresses the glow near it, more strongly as intensity rises.
- After a short the sign re-arms faster and more flickery than klieg's default strike, with a
  high-pitched hum that fades out once the sign is back on.
- Moving the pointer drains intensity (`dwell` `drain`, 200 px); it models a localized disruption.
- Pops keep their own clock: louder with intensity, never more frequent.
- Sparks stay sparse: a few big ones or an occasional shower, never constant.
- Touch builds in 600 ms (`touchRise`) against 1.5 s for a mouse, and a missed fingertip looks
  outward in rings for the tube (`pointNear`).
- Tuning is grouped by effect with a `from` threshold each, and `TUNING_SCHEMA` is plain data so a
  klieg lab can build controls from it. The tuning lab (`npm run dev`, `tuning.html`) is labkit.

## Next: arcs from the cursor

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
- Once the masthead fault has a `to`, a blow's climax arcs too.

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
