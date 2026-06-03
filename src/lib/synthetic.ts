/* Synthetic data engine for the Ontario EoE × Environment atlas.
   Ported from the Python SyntheticAdapter. Deterministic given a seed.

   - Exposure = small baseline + a dominant time-varying logistic TRAJECTORY.
   - Incidence echoes the LAGGED (TRUE_LAG-yr) trajectory of in-model factors,
     so a pooled state-year estimator recovers the built-in lag.
   - diet & antib have zero true weight -> the clean nulls.
   - Observed incidence is inflated by a diagnostic-access confounder, so the
     "normalize by access" toggle has a real, defensible effect.
   ALL DATA IS SYNTHETIC — a declared fixture, not Ontario epidemiology. */

export interface FactorMeta {
  id: string;
  name: string;
  hint: string;
  color: string;
  in_model: boolean;
}

export interface Provenance {
  source: string;
  units: string;
  resolution: string;
  vintage: string;
  status: string;
}

export interface RegionNode {
  endoscopy_access: number;
  series: Record<string, number[]>; // factorId -> per-year; plus incidence_true/observed
}

export interface Panel {
  source: string;
  factors: FactorMeta[];
  years: number[];
  true_lag: number;
  regions: Record<string, RegionNode>;
  names: Record<string, string>;
  provenance: Record<string, Provenance>;
}

export const FACTORS: Omit<FactorMeta, "in_model">[] = [
  { id: "pm25", name: "PM2.5 air pollution", hint: "fine particulate matter, μg/m³", color: "#ff8a5b" },
  { id: "pollen", name: "Tree & grass pollen", hint: "seasonal allergen index", color: "#5ee0a0" },
  { id: "pest", name: "Agricultural pesticides", hint: "kg / km² applied", color: "#c084fc" },
  { id: "humid", name: "Humidity & mold load", hint: "mean RH + indoor mold proxy", color: "#7cc4ff" },
  { id: "water", name: "Drinking water contaminants", hint: "nitrate, PFAS composite", color: "#ffd479" },
  { id: "indust", name: "Industrial VOC emissions", hint: "NPRI release intensity", color: "#ff6b9d" },
  { id: "diet", name: "Processed-food exposure", hint: "household survey proxy", color: "#94a3b8" },
  { id: "antib", name: "Early-life antibiotic use", hint: "Rx per 1k under-5", color: "#fb923c" },
];

const TRUE_WEIGHTS: Record<string, number> = {
  pm25: 1.6, pollen: 0.9, humid: 1.1, pest: 0.7,
  water: 0.5, indust: 0.8, diet: 0.0, antib: 0.0,
};

export const YEAR_MIN = 2000;
export const YEAR_MAX = 2024;
export const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
export const TRUE_LAG = 3;

// ---- deterministic RNG (mulberry32) + gaussian -------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  const rand = mulberry32(seed);
  let spare: number | null = null;
  function gauss(mu = 0, sd = 1): number {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mu + sd * v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return mu + sd * u * f;
  }
  const uniform = (lo: number, hi: number) => lo + rand() * (hi - lo);
  return { rand, gauss, uniform };
}

const PROV_BASE: Record<string, [string, string, string]> = {
  pm25: ["Environment Canada NAPS network", "μg/m³", "monitor → township"],
  pollen: ["Aerobiology Research Laboratories", "index", "station → township"],
  pest: ["Health Canada PMRA / OMAFRA", "kg/km²", "county → township"],
  humid: ["ECCC climate normals", "% RH", "gridded → township"],
  water: ["Ontario Drinking Water Surveillance Program", "composite", "system → township"],
  indust: ["National Pollutant Release Inventory (NPRI)", "intensity", "facility → township"],
  diet: ["Canadian Community Health Survey (CCHS)", "index", "PHU → township"],
  antib: ["Ontario Drug Benefit / IQVIA", "Rx/1k", "PHU → township"],
};

export function generatePanel(
  regions: { id: string; name: string }[],
  seed: number,
): Panel {
  const nyears = YEARS.length;
  const out: Record<string, RegionNode> = {};
  const names: Record<string, string> = {};

  for (const { id, name } of regions) {
    names[id] = name;
    const rng = makeRng((seed ^ hashStr(id)) >>> 0);
    const series: Record<string, number[]> = {};
    const exposure: Record<string, number[]> = {};

    for (const f of FACTORS) {
      const base = rng.gauss(0, 0.25);
      const mag = rng.uniform(-1.5, 1.5);
      const onset = rng.uniform(2003, 2019);
      const tau = rng.uniform(1.5, 4.0);
      const vals: number[] = [];
      for (let yi = 0; yi < nyears; yi++) {
        const y = YEARS[yi];
        const ramp = mag * (1 / (1 + Math.exp(-(y - onset) / tau)) - 0.5) * 2;
        let v = base + ramp + rng.gauss(0, 0.1);
        v = Math.max(-2, Math.min(2, v));
        vals.push(v);
      }
      exposure[f.id] = vals;
      series[f.id] = vals.map((v) => +v.toFixed(3));
    }

    const access = +rng.uniform(0.55, 1.55).toFixed(3);

    const trueInc: number[] = [];
    for (let yi = 0; yi < nyears; yi++) {
      const lagYi = Math.max(0, yi - TRUE_LAG);
      let s = 4.0;
      for (const f of FACTORS) {
        const w = TRUE_WEIGHTS[f.id];
        if (w) s += w * exposure[f.id][lagYi];
      }
      trueInc.push(Math.max(1.2, s + rng.gauss(0, 0.5)));
    }
    series["incidence_true"] = trueInc.map((v) => +v.toFixed(3));
    series["incidence_observed"] = trueInc.map((v) => +(v * (0.6 + 0.4 * access)).toFixed(3));

    out[id] = { endoscopy_access: access, series };
  }

  const provenance: Record<string, Provenance> = {};
  for (const f of FACTORS) {
    const [source, units, resolution] = PROV_BASE[f.id];
    provenance[f.id] = { source, units, resolution, vintage: `${YEAR_MIN}–${YEAR_MAX}`, status: "synthetic" };
  }

  return {
    source: "synthetic",
    factors: FACTORS.map((f) => ({ ...f, in_model: !!TRUE_WEIGHTS[f.id] })),
    years: YEARS,
    true_lag: TRUE_LAG,
    regions: out,
    names,
    provenance,
  };
}
