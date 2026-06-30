/* Client-side interactive analysis over the panel — recomputed on every
   control change so the globe + cards stay live. Mirrors the validated
   stats; no server round-trip per toggle. */
import { pearson, partial, multipleRegression, type Pearson } from "./stats";
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
  mode: "dominant" | "incidence";
  heat: HeatPalette;
}

export interface RegModel {
  type: "none" | "simple" | "multiple";
  name: string;                              // e.g. "Simple Linear Regression"
  predictors: string[];                      // active factors (+ confounder covariate if set)
  coef: Record<string, number>;              // standardized beta per predictor
  r2: number;
  n: number;
  predStd: Record<string, number>;           // per-region predicted (standardized) incidence
  stdParams: Record<string, { mean: number; std: number }>; // per-predictor z-score params
}

export interface Computed {
  corr: Record<string, Pearson>;
  perRegion: Record<string, { exposure: Record<string, number>; incidence: number }>;
  ids: string[];
  model: RegModel;
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

  const model = fitModel(s, ids, exposureArr, incArr);
  return { corr, perRegion, ids, model };
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const stdev = (a: number[], m: number) =>
  Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length || 1));

/** Fit a linear regression of incidence on the selected factors across regions.
 *  Inputs are z-scored so coefficients are standardized betas (single-predictor →
 *  Pearson r). A "control for" confounder, when set, is added as an extra covariate
 *  so the other coefficients are adjusted for it. The displayed model name keys off
 *  the count of *selected* factors: 1 → simple, ≥2 → multiple. */
function fitModel(
  s: Settings,
  ids: string[],
  exposureArr: Record<string, number[]>,
  incArr: number[],
): RegModel {
  const empty: RegModel = {
    type: "none",
    name: "No model — select factors",
    predictors: [],
    coef: {},
    r2: 0,
    n: ids.length,
    predStd: {},
    stdParams: {},
  };
  if (s.active.length === 0) return empty;

  // Predictors: the selected factors, plus the confounder as a covariate if set.
  const predictors = [...s.active];
  const adjusted = s.controlFor && !predictors.includes(s.controlFor);
  if (adjusted) predictors.push(s.controlFor);

  // z-score each predictor column and the incidence response.
  const stdParams: Record<string, { mean: number; std: number }> = {};
  const zCols: Record<string, number[]> = {};
  for (const fid of predictors) {
    const col = exposureArr[fid] ?? [];
    const m = mean(col);
    const sd = stdev(col, m) || 1; // guard against a constant column
    stdParams[fid] = { mean: m, std: sd };
    zCols[fid] = col.map((v) => (v - m) / sd);
  }
  const incMean = mean(incArr);
  const incStd = stdev(incArr, incMean) || 1;
  const yStd = incArr.map((v) => (v - incMean) / incStd);

  // multipleRegression wants row-major X (one predictor row per region).
  const X = ids.map((_, i) => predictors.map((fid) => zCols[fid][i]));
  const fit = multipleRegression(X, yStd);

  const coef: Record<string, number> = {};
  predictors.forEach((fid, j) => (coef[fid] = fit.coef[j] ?? 0));

  // Standardized prediction per region (centered, so ~[-2,2]); intercept ≈ 0.
  const predStd: Record<string, number> = {};
  ids.forEach((id, i) => {
    let yhat = 0;
    for (const fid of predictors) yhat += coef[fid] * zCols[fid][i];
    predStd[id] = yhat;
  });

  const type = s.active.length === 1 ? "simple" : "multiple";
  const base = type === "simple" ? "Simple Linear Regression" : "Multiple Linear Regression";
  const name = adjusted ? `${base} · adjusted for ${s.controlFor}` : base;
  return { type, name, predictors, coef, r2: fit.r2, n: fit.n, predStd, stdParams };
}

export function dominantFor(c: Computed, s: Settings, id: string): string | null {
  const m = c.model;
  if (!m || m.type === "none") return null;
  const ps = c.perRegion[id];
  if (!ps) return null;
  // Largest standardized contribution to the prediction: coefⱼ · z(exposureⱼ).
  let best: string | null = null, bv = -Infinity;
  for (const fid of s.active) {
    const sp = m.stdParams[fid];
    if (!sp) continue;
    const z = (ps.exposure[fid] - sp.mean) / sp.std;
    const v = (m.coef[fid] ?? 0) * z;
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
