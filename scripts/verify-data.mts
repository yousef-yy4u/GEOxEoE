/* Pick a seed where the true-null factors (diet, antib) stay non-significant
   at n=577 under raw AND access-adjusted views, and confirm the pooled
   estimator still recovers the built-in 3-yr lag after the TS port.
       npx tsx scripts/verify-data.mts */
import fs from "node:fs";
import path from "node:path";
import { generatePanel, YEARS, YEAR_MIN, TRUE_LAG, type Panel } from "../src/lib/synthetic";
import { pearson } from "../src/lib/stats";

const geo = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/data/ontario-townships.geojson"), "utf8"),
);
const regions = geo.features.map((f: any) => ({ id: String(f.properties.id), name: f.properties.name }));
console.log("regions:", regions.length);

const A = 2008, B = 2024;
const wmean = (s: number[], lag: number) => {
  let sum = 0, k = 0;
  for (let y = A; y <= B; y++) {
    let idx = y - lag - YEAR_MIN;
    idx = Math.max(0, Math.min(s.length - 1, idx));
    sum += s[idx];
    k++;
  }
  return sum / k;
};
function factorCorr(panel: Panel, f: string, lag: number, norm: boolean) {
  const xs: number[] = [], ys: number[] = [];
  for (const id in panel.regions) {
    const node = panel.regions[id];
    xs.push(wmean(node.series[f], lag));
    let inc = wmean(node.series.incidence_observed, 0);
    if (norm) inc /= node.endoscopy_access;
    ys.push(inc);
  }
  return pearson(xs, ys);
}
function pooledR(panel: Panel, f: string, lag: number) {
  const xs: number[] = [], ys: number[] = [];
  for (const id in panel.regions) {
    const node = panel.regions[id];
    for (let yi = 0; yi < YEARS.length; yi++) {
      const li = yi - lag;
      if (li < 0) continue;
      xs.push(node.series[f][li]);
      ys.push(node.series.incidence_observed[yi]);
    }
  }
  return pearson(xs, ys).r ?? 0;
}
const NULLS = ["diet", "antib"];
const nullsOk = (panel: Panel) =>
  NULLS.every((f) => [false, true].every((n) => (factorCorr(panel, f, 0, n).p ?? 1) >= 0.05));

let chosen = -1;
for (let seed = 1000; seed < 3000; seed++) {
  if (nullsOk(generatePanel(regions, seed))) {
    chosen = seed;
    break;
  }
}
if (chosen < 0) {
  console.log("no seed satisfied null-stability");
  process.exit(1);
}
console.log("SELECTED SEED:", chosen, "(TRUE_LAG built in =", TRUE_LAG, ")");
const panel = generatePanel(regions, chosen);
console.log("\npooled state-year r by lag (in-model should peak @3):");
for (const f of ["pm25", "pollen", "humid", "pest", "water", "indust", "diet", "antib"]) {
  const rs = Array.from({ length: 9 }, (_, L) => pooledR(panel, f, L));
  const peak = rs.reduce((bi, r, i, a) => (Math.abs(r) > Math.abs(a[bi]) ? i : bi), 0);
  console.log("  " + f.padEnd(7), rs.map((r) => (r >= 0 ? "+" : "") + r.toFixed(2)).join(" "), "peak@" + peak);
}
console.log("\ntrue-null factors (raw / adjusted), should be n.s.:");
for (const f of NULLS) {
  const r0 = factorCorr(panel, f, 0, false), r1 = factorCorr(panel, f, 0, true);
  console.log(`  ${f.padEnd(7)} raw r=${r0.r!.toFixed(2)} p=${r0.p!.toFixed(2)}   adj r=${r1.r!.toFixed(2)} p=${r1.p!.toFixed(2)}`);
}
