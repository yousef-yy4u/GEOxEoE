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
  return _panel;
}
