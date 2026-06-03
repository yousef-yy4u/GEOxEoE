import fs from "node:fs";
import path from "node:path";
import { generatePanel, type Panel } from "./synthetic";

// Seed chosen by scripts/verify-data.mts so diet/antib stay non-significant at
// n=577 under raw AND adjusted views, with the 3-yr lag cleanly recovered.
export const SEED = 1001;

let _panel: Panel | null = null;

/** Deterministic synthetic panel for Ontario townships, generated + cached once. */
export function getPanel(): Panel {
  if (_panel) return _panel;
  const file = path.join(process.cwd(), "public", "data", "ontario-townships.geojson");
  const geo = JSON.parse(fs.readFileSync(file, "utf8"));
  const regions = geo.features.map((f: { properties: { id: string; name: string } }) => ({
    id: String(f.properties.id),
    name: f.properties.name,
  }));
  _panel = generatePanel(regions, SEED);
  injectLiveFactors(_panel);
  return _panel;
}

/* ---- Real open data layer (Open-Meteo ERA5) ----------------------------
   If scripts/fetch-open-meteo.mjs has been run, public/data/real-exposures.json
   holds REAL annual climate means per township. We append them as extra "live"
   factors (z-standardised to the synthetic ~[-2,2] scale so the map/scatter stay
   comparable). They are in_model:false — off by default — so the curated
   synthetic fixture is untouched; toggling one shows its true (and, against
   synthetic incidence, expectedly weak) association, labelled live. */
interface RealData {
  source: string;
  years: number[];
  factors: Record<string, Record<string, (number | null)[]>>;
}
const LIVE_DEFS = [
  { key: "rh", id: "rh_live", name: "Relative humidity · live", hint: "ERA5 annual mean RH", color: "#38bdf8", units: "% RH" },
  { key: "temp", id: "temp_live", name: "Mean temperature · live", hint: "ERA5 annual mean", color: "#fb7185", units: "°C" },
  { key: "precip", id: "precip_live", name: "Precipitation · live", hint: "ERA5 annual total", color: "#34d399", units: "mm/yr" },
];

function injectLiveFactors(panel: Panel) {
  const file = path.join(process.cwd(), "public", "data", "real-exposures.json");
  if (!fs.existsSync(file)) return;
  let real: RealData;
  try { real = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return; }
  const ids = Object.keys(panel.regions);
  const ny = panel.years.length;

  const realYears: number[] = real.years || [];
  const ryIndex = new Map(realYears.map((y, i) => [y, i]));
  for (const d of LIVE_DEFS) {
    const raw = real.factors?.[d.key];
    if (!raw) continue;
    // cross-township mean per real-year, to fill a township missing that year
    const colMean = realYears.map((_, k) => {
      let s = 0, n = 0;
      for (const id of ids) { const v = raw[id]?.[k]; if (v != null) { s += v; n++; } }
      return n ? s / n : 0;
    });
    const globalAvail = colMean.length ? colMean.reduce((a, b) => a + b, 0) / colMean.length : 0;
    // build a panel-year-aligned series per township; years outside the real
    // window (pre-2015) are backfilled with that township's real mean.
    const filled: Record<string, number[]> = {};
    let gs = 0, gss = 0, gn = 0;
    for (const id of ids) {
      const realVals = realYears.map((_, k) => { const v = raw[id]?.[k]; return v == null ? colMean[k] : v; });
      const tMean = realVals.length ? realVals.reduce((a, b) => a + b, 0) / realVals.length : globalAvail;
      const arr = panel.years.map((y) => { const k = ryIndex.get(y); return k == null ? tMean : realVals[k]; });
      filled[id] = arr;
      for (const v of arr) { gs += v; gss += v * v; gn++; }
    }
    const mean = gs / gn, sd = Math.sqrt(Math.max(1e-9, gss / gn - mean * mean));
    for (const id of ids) {
      panel.regions[id].series[d.id] = filled[id].map((v) => +Math.max(-2.5, Math.min(2.5, (v - mean) / sd)).toFixed(3));
    }
    panel.factors.push({ id: d.id, name: d.name, hint: d.hint, color: d.color, in_model: false });
    panel.provenance[d.id] = {
      source: real.source || "Open-Meteo ERA5",
      units: d.units,
      resolution: "0.25° grid → township centroid",
      vintage: `${panel.years[0]}–${panel.years[ny - 1]}`,
      status: "live",
    };
  }
  if (panel.factors.some((f) => f.id.endsWith("_live"))) panel.source = "synthetic + live (Open-Meteo ERA5)";
}
