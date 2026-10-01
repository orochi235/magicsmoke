# magicsmoke on blits: what is left

**Status (2026-09-30): the blits engine is built, on branch `blits-engine`; retiring the old engine
is not.** The API is in `README.md` ("On the blits engine") and the doc comments in `src/smoke.ts`.
This page holds only the unbuilt half and what the build measured. Delete it once the old engine is
gone.

**For:** whoever retires the old engine. **Answers:** what stands between the branch and `main`,
how the old API becomes an alias, and where the two engines are known to differ.

## Where it stands

- `createSmoke` / `createSmokeOverlay` (`src/smoke.ts`, `src/smoke-overlay.ts`) run each fault as a
  voice on its own blits mix, stepped every 5 ms, its drafts sent as events and drained each sync.
  Both engines share everything else through `Stage` (`src/stage.ts`) and `FaultProcess.tick`.
- `test/parity.test.ts` drives both engines with one seed and one frame script and requires the same
  discharges on the same frames in the same order: steady faults at 30–144 fps, jittered frames,
  several faults, blow, stop, one-shots, a `level` signal for a weight, and gaps of 140 ms.
- `npm run dev` with `?engine=smoke` runs either lab page on the new engine, through a lab-only
  adapter (`lab/engines.ts`) that presents it as the old `Overlay`.
- `npm run bench`, measured 2026-09-30 on this machine, ms per frame on the CPU, no WebGL:

  | Faults | Old | blits |
  |---:|---:|---:|
  |   1 | 0.011 | 0.007 |
  |  10 | 0.023 | 0.016 |
  | 100 | 0.098 | 0.116 |

## What the build found

- **Parity holds to 12 decimal places, not to the bit.** The old engine is handed `dt`, the new one a
  timestamp, so anything derived from elapsed time (a blow's surge and lift) differs in its last
  bits. Kinds, frames and order are exact.
- **Long gaps do not diverge.** The design expected the old engine's 50 ms cap and blits' `maxDt` to
  part after a long gap; with 140 ms gaps every discharge still matches.
- **A blow holds its target through the frame it ends**, because the old engine dropped an
  intensity written that frame; without it the new engine resumes one frame early.
- **One mix per fault**, not one shared. A shared mix tested every voice's `target` on every probe,
  which made 100 faults cost 0.404 ms; blits `1b1d841` fixed that, so a shared mix is now an option,
  not a cost. Against `1b1d841` the table above is unchanged within noise.

## Left to do

1. **Compare by eye and ear** in both labs, `?engine=smoke` against none. The parity suite says they
   match; nobody has watched or listened yet.
2. **Make the old API an alias and delete the old engine.** `createLayer` keeps a clock that
   `update(dt)` advances and passes to `sync`; `fault(spec)` cues with `weight: spec.intensity ?? 0`
   (the new default weight is 1); `intensity` reads and writes the weight; `stop()` is `fade()`;
   `createOverlay` becomes `createSmokeOverlay` behind the same adapter `lab/engines.ts` already is,
   which then moves into `src/`. `MagicLayer`, `FaultProcess.step` and the parity suite go; keep the
   parity scripts as plain regression tests against recorded sequences first.
   **The alias cannot hide one difference:** after a blow, the old engine stays dead until the host
   writes intensity again, while a weight is followed again at once. A host that writes every frame,
   as the portfolio masthead does, sees no difference.
3. **Merge needs blits published.** `package.json` takes blits as `file:../blits`, which no other
   machine and no npm install can resolve. Merge once blits is on npm (possibly as `@msb235/blits`).
4. **Enlist for the fleet** (`onto-enlist`), after the merge or with the blits checkout beside it.
