/* Client-side dataset ingestion + validation. This is the schema contract that
   makes an uploaded/API dataset "match" the app's representation: every factor
   is per-township (StatsCan CSD id, e.g. "3501005", or township name) × per-year
   numeric, z-standardised to the synthetic ~[-2,2] scale. We resolve rows to the
   known townships, report how many matched, and standardise — so an upload either
   lines up with our geography or is clearly flagged where it doesn't.

   Accepted formats:
   - CSV with a header: columns township_id | id | csd  (or name | township),
     optional year, and value | val | v.
   - JSON object:  { "3501005": 12.4 }  or  { "3501005": [25 yearly values] }
   - JSON array:   [{ "township_id": "3501005", "year": 2019, "value": 12.4 }, …]
*/

export interface IngestReport {
  matched: number;   // townships with ≥1 resolved value
  total: number;     // townships in the geography (577)
  unknown: number;   // rows whose id/name did not resolve
  perYear: boolean;  // true if a real year dimension was supplied
}
export type IngestResult = { series: Record<string, number[]>; report: IngestReport } | { error: string };

export function parseDataset(
  text: string,
  regionIds: string[],
  names: Record<string, string>, // id -> name
  years: number[],
): IngestResult {
  const idSet = new Set(regionIds);
  const nameToId: Record<string, string> = {};
  for (const id of regionIds) if (names[id]) nameToId[names[id].trim().toLowerCase()] = id;

  const ny = years.length;
  const yearIndex = new Map(years.map((y, i) => [y, i]));
  const raw: Record<string, { sum: number[]; cnt: number[] }> = {};
  let unknown = 0, perYear = false;

  const ensure = (id: string) => (raw[id] ??= { sum: new Array(ny).fill(0), cnt: new Array(ny).fill(0) });
  const resolve = (key: unknown): string | null => {
    const k = String(key ?? "").trim();
    if (idSet.has(k)) return k;
    return nameToId[k.toLowerCase()] ?? null;
  };
  const addVal = (id: string, year: number | null, value: number) => {
    if (value == null || Number.isNaN(value)) return;
    const r = ensure(id);
    if (year != null && yearIndex.has(year)) {
      perYear = true;
      const yi = yearIndex.get(year)!;
      r.sum[yi] += value; r.cnt[yi]++;
    } else {
      for (let yi = 0; yi < ny; yi++) { r.sum[yi] += value; r.cnt[yi]++; }
    }
  };

  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON → CSV */ }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed)) {
      for (const row of parsed as Record<string, unknown>[]) {
        const id = resolve(row.township_id ?? row.id ?? row.csd ?? row.name ?? row.township);
        if (!id) { unknown++; continue; }
        addVal(id, row.year != null ? Number(row.year) : null, Number(row.value ?? row.val ?? row.v));
      }
    } else {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const id = resolve(k);
        if (!id) { unknown++; continue; }
        if (Array.isArray(v)) { v.forEach((val, i) => { if (i < ny) addVal(id, years[i], +val); }); }
        else addVal(id, null, +(v as number));
      }
    }
  } else {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { error: "Empty file." };
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const ci = col("township_id", "id", "csd", "csduid", "geo_id");
    const cn = col("name", "township", "csdname", "geo");
    const cy = col("year", "yr");
    let cv = col("value", "val", "v", "exposure", "reading");
    if (ci < 0 && cn < 0) return { error: "CSV needs a township_id or name column." };
    if (cv < 0) cv = header.length - 1; // fall back to the last column
    for (let li = 1; li < lines.length; li++) {
      const cells = lines[li].split(",");
      const id = resolve(ci >= 0 ? cells[ci] : cells[cn]);
      if (!id) { unknown++; continue; }
      addVal(id, cy >= 0 ? +cells[cy] : null, parseFloat(cells[cv]));
    }
  }

  const matchedIds = Object.keys(raw);
  if (!matchedIds.length)
    return { error: `No townships matched (${unknown} unrecognised rows). Expect a township_id like "3501005" or a township name.` };

  // fill gaps: missing year within a township → its own mean; absent township → cross-township mean
  const colMean = years.map((_, yi) => {
    let s = 0, n = 0;
    for (const id of matchedIds) if (raw[id].cnt[yi]) { s += raw[id].sum[yi] / raw[id].cnt[yi]; n++; }
    return n ? s / n : 0;
  });
  const filled: Record<string, number[]> = {};
  let gs = 0, gss = 0, gn = 0;
  for (const id of regionIds) {
    const r = raw[id];
    const tvals = r ? years.map((_, k) => (r.cnt[k] ? r.sum[k] / r.cnt[k] : null)).filter((x): x is number => x != null) : [];
    const tMean = tvals.length ? tvals.reduce((a, b) => a + b, 0) / tvals.length : null;
    const arr = years.map((_, yi) => {
      if (r && r.cnt[yi]) return r.sum[yi] / r.cnt[yi];
      if (tMean != null) return tMean;
      return colMean[yi];
    });
    filled[id] = arr;
    for (const v of arr) { gs += v; gss += v * v; gn++; }
  }
  const mean = gs / gn, sd = Math.sqrt(Math.max(1e-9, gss / gn - mean * mean));
  const series: Record<string, number[]> = {};
  for (const id of regionIds) series[id] = filled[id].map((v) => +Math.max(-2.5, Math.min(2.5, (v - mean) / sd)).toFixed(3));

  return { series, report: { matched: matchedIds.length, total: regionIds.length, unknown, perYear } };
}
