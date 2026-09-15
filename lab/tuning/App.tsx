import {
  Button,
  CheckboxRow,
  ControlPanel,
  LabShell,
  PropertyList,
  PropertyPanel,
  SliderRow,
  usePersistedState,
  withValueAtPath,
} from '@weasel-js/labkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createOverlay,
  DEFAULT_TUNING,
  dwell,
  type Overlay,
  type OverlayFault,
  type Point,
  resolveTuning,
  TUNING_SCHEMA,
  type Tuning,
  type TuningGroup,
} from '../../src/index.js';
import { overridesOf } from './overrides.js';
import { controlsFor } from './schema.js';

const controls = controlsFor(TUNING_SCHEMA, DEFAULT_TUNING);

interface StageSettings {
  hold: number;
  arcs: boolean;
  energy: number;
  volume: number;
  muted: boolean;
}

const STAGE: StageSettings = { hold: 0, arcs: false, energy: 0.6, volume: 0.8, muted: false };

const SHOTS = ['sputter', 'burst', 'shower', 'arc'] as const;
const BLOW = { peak: 1000, after: 300 };
type Shot = (typeof SHOTS)[number];

declare global {
  interface Window {
    /** Read by the lab's browser check. */
    tuningLab?: { overlay: Overlay };
  }
}

interface Rig {
  overlay: Overlay;
  standing: OverlayFault;
  sign: HTMLElement;
}

function spots(sign: HTMLElement): { center: Point; left: Point; right: Point } {
  const r = sign.getBoundingClientRect();
  return {
    center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    left: { x: r.left + r.width * 0.2, y: r.top + r.height * 0.6 },
    right: { x: r.right - r.width * 0.1, y: r.top + r.height * 0.3 },
  };
}

function apply(overlay: Overlay, tuning: Tuning): void {
  for (const group of Object.keys(tuning) as TuningGroup[]) {
    Object.assign(overlay.tuning[group], tuning[group]);
  }
}

const two = (v: number) => v.toFixed(2);

export function App() {
  const signRef = useRef<HTMLDivElement>(null);
  const [rig, setRig] = useState<Rig | null>(null);
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState('');
  const [stored, setStored] = usePersistedState<Tuning>('tuning', () => resolveTuning());
  const [savedStage, setSavedStage] = usePersistedState<StageSettings>('stage', STAGE);
  // Stored values predate any group or setting added since, so defaults fill the gaps.
  const tuning = useMemo(() => resolveTuning(stored), [stored]);
  const stage = useMemo(() => ({ ...STAGE, ...savedStage }), [savedStage]);
  const config = useMemo(() => ({ ...tuning }), [tuning]);

  useEffect(() => {
    const sign = signRef.current;
    if (!sign) return;
    const overlay = createOverlay({ sound: true, jolt: sign });
    const { center } = spots(sign);
    const hover = overlay.fault({ at: center });
    const standing = overlay.fault({ at: center });
    const pointer = dwell(sign, { rise: 1500, fall: 600 });
    pointer.onChange(({ value, x, y }) => {
      hover.intensity = value;
      hover.at = { x, y };
      setLevel(value);
    });
    window.tuningLab = { overlay };
    setRig({ overlay, standing, sign });
    return () => {
      pointer.dispose();
      overlay.dispose();
      delete window.tuningLab;
    };
  }, []);

  useEffect(() => {
    if (rig) apply(rig.overlay, tuning);
  }, [rig, tuning]);

  useEffect(() => {
    if (!rig) return;
    const place = () => {
      const { left, right } = spots(rig.sign);
      rig.standing.at = left;
      rig.standing.to = stage.arcs ? right : null;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [rig, stage.arcs]);

  useEffect(() => {
    if (rig) rig.standing.intensity = stage.hold;
  }, [rig, stage.hold]);

  useEffect(() => {
    if (!rig) return;
    rig.overlay.volume = stage.volume;
    rig.overlay.muted = stage.muted;
  }, [rig, stage.volume, stage.muted]);

  const setStage = <K extends keyof StageSettings>(key: K, value: StageSettings[K]) =>
    setSavedStage((prev) => ({ ...STAGE, ...prev, [key]: value }));

  const setConfig = (path: string, value: unknown) => {
    const next = withValueAtPath(tuning, path, value);
    if (rig) apply(rig.overlay, next);
    setStored(next);
  };

  const shoot = (shot: Shot) => {
    if (!rig) return;
    const { center, left, right } = spots(rig.sign);
    const { overlay } = rig;
    if (shot === 'arc') overlay.arc(left, right, stage.energy);
    else overlay[shot](center, stage.energy);
  };

  const blow = () => {
    if (!rig) return;
    const { standing } = rig;
    standing.blow({ peak: BLOW.peak, after: BLOW.after });
    // A blow leaves the fault at zero, and the hold slider only writes when it moves.
    setTimeout(() => {
      standing.intensity = stage.hold;
    }, BLOW.peak + BLOW.after);
  };

  const copy = async () => {
    const overrides = overridesOf(tuning);
    const count = Object.values(overrides).reduce((n, group) => n + Object.keys(group).length, 0);
    try {
      await navigator.clipboard.writeText(JSON.stringify(overrides, null, 2));
      setNotice(count === 0 ? 'Copied: every value is at its default' : `Copied ${count} changed`);
    } catch {
      setNotice('The browser refused the clipboard');
    }
  };

  const reset = () => {
    setStored(resolveTuning());
    setNotice('Tuning reset to defaults');
  };

  return (
    <LabShell
      title="magicsmoke tuning"
      mode="dark"
      header={
        <>
          <span className="tuning-notice" role="status">
            {notice}
          </span>
          <Button onClick={copy}>Copy overrides</Button>
          <Button variant="ghost" onClick={reset}>
            Reset to defaults
          </Button>
        </>
      }
    >
      <div className="tuning-layout">
        <section className="tuning-stage">
          <p className="tuning-prompt">
            Rest the pointer on the sign. Click anywhere first to unlock sound.
          </p>
          <div ref={signRef} className="tuning-sign">
            OPEN
          </div>
          <p className="tuning-readout">
            dwell <output>{two(level)}</output>
          </p>
        </section>
        <aside className="tuning-panel">
          <PropertyPanel title="Held fault">
            <PropertyList>
              <SliderRow
                label="Hold intensity"
                value={stage.hold}
                min={0}
                max={1}
                step={0.01}
                format={two}
                onChange={(v) => setStage('hold', v)}
                description="A standing fault on the sign at this intensity, with no hovering."
              />
              <CheckboxRow
                label="Arcs to a second point"
                value={stage.arcs}
                onChange={(v) => setStage('arcs', v)}
              />
            </PropertyList>
            <div className="tuning-shots">
              <Button size="sm" onClick={blow}>
                blow
              </Button>
            </div>
          </PropertyPanel>
          <PropertyPanel title="One-shots">
            <div className="tuning-shots">
              {SHOTS.map((shot) => (
                <Button key={shot} size="sm" onClick={() => shoot(shot)}>
                  {shot}
                </Button>
              ))}
            </div>
            <PropertyList>
              <SliderRow
                label="Energy"
                value={stage.energy}
                min={0}
                max={1}
                step={0.01}
                format={two}
                onChange={(v) => setStage('energy', v)}
              />
            </PropertyList>
          </PropertyPanel>
          <PropertyPanel title="Sound">
            <PropertyList>
              <SliderRow
                label="Volume"
                value={stage.volume}
                min={0}
                max={1}
                step={0.01}
                format={two}
                onChange={(v) => setStage('volume', v)}
              />
              <CheckboxRow
                label="Muted"
                value={stage.muted}
                onChange={(v) => setStage('muted', v)}
              />
            </PropertyList>
          </PropertyPanel>
          <PropertyPanel title="Tuning">
            <ControlPanel
              schema={controls}
              config={config}
              setConfig={setConfig}
              pack="one-up"
              collapse="open"
            />
          </PropertyPanel>
        </aside>
      </div>
    </LabShell>
  );
}
