/* Prefetch REAL open data for every Ontario township and cache it to
   public/data/real-exposures.json. Source: Open-Meteo ERA5 archive (free, no
   API key). Produces real annual means (2000–2024) of relative humidity, mean
   temperature, and precipitation at each township centroid. These become
   clearly-labelled "live" factor layers alongside the synthetic fixture.

   Run:  node scripts/fetch-open-meteo.mjs
*/
import fs from "node:fs";
import path from "node:path";

const GEO = path.join(process.cwd(), "public", "data", "ontario-townships.geojson");
const OUT = path.join(process.cwd(), "public", "data", "real-exposures.json");
// Open-Meteo free tier bills ~ locations × years (600/min, 5k/hr, 10k/day).
// 577 twp × 8 yr ≈ 4.6k units → fits the hourly + daily caps; paced for /min.
const Y0 = 2017, Y1 = 2024;
const VARS = ["relative_humidity_2m_mean", "temperature_2m_mean", "precipitation_sum"];
const KEYS = { relative_humidity_2m_mean: "rh", temperature_2m_mean: "temp", precipitation_sum: "precip" };
const BATCH = 6, CONCURRENCY = 1, RETRIES = 6, PACE_MS = 1500;

function centroid(geometry) {
  let sx = 0, sy = 0, n = 0;
  const addRing = (ring) => { for (const [lon, lat] of ring) { sx += lon; sy += lat; n++; } };
  if (geometry.type === "Polygon") geometry.coordinates.forEach(addRing);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((poly) => poly.forEach(addRing));
  return n ? [sx / n, sy / n] : null;
}

const geo = JSON.parse(fs.readFileSync(GEO, "utf8"));
const townships = geo.features
  .map((f) => ({ id: String(f.properties.id), c: centroid(f.geometry) }))
  .filter((t) => t.c);
console.log(`townships: ${townships.length}`);

const years = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const result = { source: "Open-Meteo ERA5 (archive-api.open-meteo.com)", license: "CC-BY 4.0", years, factors: { rh: {}, temp: {}, precip: {} }, centroids: {} };

function annualMeans(times, vals) {
  const sum = {}, cnt = {};
  for (let i = 0; i < times.length; i++) {
    const v = vals[i];
    if (v == null) continue;
    const yr = +times[i].slice(0, 4);
    sum[yr] = (sum[yr] || 0) + v; cnt[yr] = (cnt[yr] || 0) + 1;
  }
  return years.map((y) => (cnt[y] ? +(sum[y] / cnt[y]).toFixed(3) : null));
}

async function fetchBatch(batch, attempt = 1) {
  const lat = batch.map((t) => t.c[1].toFixed(4)).join(",");
  const lon = batch.map((t) => t.c[0].toFixed(4)).join(",");
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${Y0}-01-01&end_date=${Y1}-12-31&daily=${VARS.join(",")}&timezone=GMT`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (r.status === 429) throw Object.assign(new Error("HTTP 429"), { rate: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [data];
    arr.forEach((loc, i) => {
      const t = batch[i];
      result.centroids[t.id] = [+t.c[0].toFixed(4), +t.c[1].toFixed(4)];
      for (const v of VARS) result.factors[KEYS[v]][t.id] = annualMeans(loc.daily.time, loc.daily[v]);
    });
    return batch.length;
  } catch (e) {
    if (attempt <= RETRIES) {
      const wait = e.rate ? 30000 : 2000 * attempt; // back off hard on rate-limit
      await new Promise((res) => setTimeout(res, wait));
      return fetchBatch(batch, attempt + 1);
    }
    console.warn(`batch failed (${batch[0].id}…): ${e.message}`);
    return 0;
  }
}

const batches = [];
for (let i = 0; i < townships.length; i += BATCH) batches.push(townships.slice(i, i + BATCH));

let done = 0, ok = 0;
async function worker(queue) {
  while (queue.length) {
    const b = queue.shift();
    ok += await fetchBatch(b);
    done++;
    if (done % 5 === 0 || done === batches.length) console.log(`  ${done}/${batches.length} batches · ${ok} townships`);
    if (queue.length) await new Promise((res) => setTimeout(res, PACE_MS)); // stay under 600/min
  }
}
const queue = [...batches];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

result.note = `Real annual means for ${ok}/${townships.length} townships, ${Y0}-${Y1}.`;
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`wrote ${OUT} — ${ok} townships, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
