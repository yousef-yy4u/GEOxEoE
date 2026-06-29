/* Client-side interactive analysis over the panel — recomputed on every
   control change so the globe + cards stay live. Mirrors the validated
   stats; no server round-trip per toggle. */
import { pearson, partial, type Pearson } from "./stats";
import type { Panel } from "./synthetic";

export const YEAR0 = 2000;

export interface Settings {
  active: string[];
  yearStart: number;
  yearEnd: number;
  lag: number;
  normalize: boolean;
  controlFor: string;
  age: number;
  sev: number;
  sex: string;
  mode: "composite" | "dominant" | "incidence";
  heat: HeatPalette;
}

export interface Computed {
  corr: Record<string, Pearson>;
  perRegion: Record<string, { exposure: Record<string, number>; incidence: number }>;
  ids: string[];
}

/** Mean of a per-year series across the window, shifted back by `lag`. */
export function windowMean(series: number[], yStart: number, yEnd: number, lag: number): number {
  let sum = 0, k = 0;
  for (let y = yStart; y <= yEnd; y++) {
    let idx = y - lag - YEAR0;
    idx = Math.max(0, Math.min(series.length - 1, idx));
    sum += series[idx];
    k++;
  }
  return sum / k;
}

export function recompute(panel: Panel, s: Settings): Computed {
  const ids = Object.keys(panel.regions);
  const exposureArr: Record<string, number[]> = {};
  panel.factors.forEach((f) => (exposureArr[f.id] = []));
  const incArr: number[] = [];
  const perRegion: Computed["perRegion"] = {};

  for (const id of ids) {
    const node = panel.regions[id];
    const exposure: Record<string, number> = {};
    for (const f of panel.factors) {
      const v = windowMean(node.series[f.id], s.yearStart, s.yearEnd, s.lag);
      exposure[f.id] = v;
      exposureArr[f.id].push(v);
    }
    let inc = windowMean(node.series.incidence_observed, s.yearStart, s.yearEnd, 0);
    if (s.normalize) inc /= node.endoscopy_access;
    incArr.push(inc);
    perRegion[id] = { exposure, incidence: inc };
  }

  const corr: Record<string, Pearson> = {};
  for (const f of panel.factors) {
    if (s.controlFor && s.controlFor !== f.id) {
      corr[f.id] = partial(exposureArr[f.id], incArr, exposureArr[s.controlFor]);
    } else {
      corr[f.id] = pearson(exposureArr[f.id], incArr);
    }
  }
  return { corr, perRegion, ids };
}

/** Composite = correlation-weighted mean of active exposures (~[-1,1]), then
 *  squeezed to the legend range with the illustrative cohort modifiers. */
export function compositeFor(c: Computed, s: Settings, id: string): number {
  const ps = c.perRegion[id];
  if (!ps) return 0;
  let num = 0, den = 0;
  for (const fid of s.active) {
    const r = c.corr[fid]?.r ?? 0;
    num += ps.exposure[fid] * r;
    den += Math.abs(r);
  }
  if (!den) return 0;
  let v = num / den;
  const ageMod = 1 + (s.age - 50) / 180;
  const sevMod = 0.85 + s.sev * 0.08;
  v = v * ageMod * sevMod;
  return Math.max(-0.6, Math.min(0.9, v * 0.75 + 0.05));
}

export function dominantFor(c: Computed, s: Settings, id: string): string | null {
  let best: string | null = null, bv = -Infinity;
  for (const fid of s.active) {
    const v = c.perRegion[id].exposure[fid] * (c.corr[fid]?.r ?? 0);
    if (v > bv) { bv = v; best = fid; }
  }
  return best;
}

export function incidenceFor(c: Computed, id: string): number {
  return c.perRegion[id]?.incidence ?? 0;
}

const STOPS: [number, [number, number, number]][] = [
  [-0.6, [19, 49, 74]], [-0.2, [31, 94, 138]], [0.05, [58, 166, 201]],
  [0.35, [126, 209, 199]], [0.6, [22, 171, 152]], [0.9, [127, 105, 174]],
];
/** Diverging palette tuned to the Malachite & Ink Aurora arc (lapis→jade→iris). */
export function scoreToColor(v: number): string {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      const c = ca.map((x, k) => Math.round(x + (cb[k] - x) * t));
      return `rgb(${c.join(",")})`;
    }
  }
  return "rgb(127,105,174)";
}
export function incColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 2) / 12));
  const r = Math.round(31 + (127 - 31) * t),
    g = Math.round(94 + (105 - 94) * t),
    b = Math.round(138 + (174 - 138) * t);
  return `rgb(${r},${g},${b})`;
}

/** Selectable base hue families for the choropleth saturation ramp. Each ramp
 *  sweeps `hue → hue+64` (one color family, never a rainbow); only the starting
 *  hue changes per palette. `label` is shown in the Display-mode picker. */
export const HEAT_PALETTES = {
  jade: { label: "Jade", hue: 150 }, // green → blue (default)
  ember: { label: "Ember", hue: 18 }, // red → amber
  iris: { label: "Iris", hue: 256 }, // violet → magenta
  ocean: { label: "Ocean", hue: 190 }, // cyan → indigo
} as const;
export type HeatPalette = keyof typeof HEAT_PALETTES;

/** Smooth low→high ramp across a single hue family for a normalized t in [0,1].
 *  Used with a percentile stretch so the choropleth shows real contrast without
 *  a rainbow. The base hue is chosen by `palette`; sat/light ramps are shared. */
export function heatColor(t: number, palette: HeatPalette = "jade"): string {
  t = Math.max(0, Math.min(1, t));
  const hue = HEAT_PALETTES[palette].hue + t * 64; // 64° sweep within the family
  const sat = 58 + t * 14; // 58% → 72% saturation
  const light = 56 - t * 12; // 56% → 44% lightness
  return `hsl(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%)`;
}

/** CSS gradient string matching `heatColor`, for legends/swatches. */
export function heatGradient(palette: HeatPalette = "jade"): string {
  return `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
    .map((t) => heatColor(t, palette))
    .join(", ")})`;
}

/** Robust [lo,hi] percentile range for stretching colors across the data. */
export function percentileRange(vals: number[], lo = 5, hi = 95): [number, number] {
  const sorted = [...vals].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))))];
  const a = at(lo), b = at(hi);
  return a === b ? [a - 1e-6, b + 1e-6] : [a, b];
}
