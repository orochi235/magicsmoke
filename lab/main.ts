import {
  createOverlay,
  dwell,
  type ParamSpec,
  TUNING_SCHEMA,
  type TuningGroup,
} from '../src/index.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const sign = $<HTMLDivElement>('sign');
const overlay = createOverlay({ sound: true, jolt: sign, haptics: true });

function center() {
  return { x: innerWidth * 0.35, y: innerHeight * 0.3 };
}

function bind(id: string, format: (v: number) => string, apply: (v: number) => void) {
  const input = $<HTMLInputElement>(id);
  const out = $<HTMLOutputElement>(`${id}-out`);
  const sync = () => {
    const value = Number(input.value);
    out.value = format(value);
    apply(value);
  };
  input.addEventListener('input', sync);
  sync();
}

const two = (v: number) => v.toFixed(2);

let energy = 0.6;
bind('energy', two, (v) => {
  energy = v;
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-shot]')) {
  button.addEventListener('click', () => {
    const at = center();
    switch (button.dataset.shot) {
      case 'sputter':
        overlay.sputter(at, energy);
        break;
      case 'burst':
        overlay.burst(at, energy);
        break;
      case 'shower':
        overlay.shower(at, energy);
        break;
      case 'arc':
        overlay.arc(at, { x: at.x + 180, y: at.y + 40 }, energy);
        break;
    }
  });
}

const standing = overlay.fault({ at: { x: innerWidth * 0.2, y: innerHeight * 0.6 } });
bind('intensity', two, (v) => {
  standing.intensity = v;
});
$<HTMLInputElement>('arcing').addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  const { x, y } = standing.at;
  standing.to = on ? { x: x + 200, y: y - 60 } : null;
});

bind('volume', two, (v) => {
  overlay.volume = v;
});
$<HTMLInputElement>('muted').addEventListener('change', (e) => {
  overlay.muted = (e.target as HTMLInputElement).checked;
});

const hover = overlay.fault({ at: center() });
const readout = $<HTMLParagraphElement>('readout');
dwell(sign, { rise: 4000, fall: 600 }).onChange(({ value, x, y }) => {
  hover.intensity = value;
  hover.at = { x, y };
  readout.textContent = `dwell ${value.toFixed(2)}`;
});

const tuningSet = $<HTMLFieldSetElement>('tuning');
const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step)));
for (const group of Object.keys(TUNING_SCHEMA) as TuningGroup[]) {
  const { label, params } = TUNING_SCHEMA[group];
  const heading = document.createElement('h2');
  heading.textContent = label;
  tuningSet.append(heading);
  const values = overlay.tuning[group] as unknown as Record<string, number>;
  for (const [key, spec] of Object.entries(params as Record<string, ParamSpec>)) {
    const row = document.createElement('label');
    const out = document.createElement('output');
    const input = document.createElement('input');
    Object.assign(input, {
      type: 'range',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: values[key],
      title: spec.hint ?? '',
    });
    row.append(`${spec.label} `, out, input);
    tuningSet.append(row);
    const sync = () => {
      values[key] = Number(input.value);
      out.value = Number(input.value).toFixed(decimals(spec.step));
    };
    input.addEventListener('input', sync);
    sync();
  }
}
