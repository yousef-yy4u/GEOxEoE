/* Shared persistence via JSON files (no native deps).
   - views      : short id -> full analysis state (shareable links)
   - annotations: notes pinned to a township, shared across users */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// DATA_DIR lets a deploy (e.g. a Railway volume) point persistence at a durable
// mount; falls back to a local .data dir for dev.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const VIEWS = path.join(DIR, "views.json");
const ANNOS = path.join(DIR, "annotations.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}
function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, value: unknown) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(value));
}

// ---- saved views --------------------------------------------------------
export function saveView(state: unknown): string {
  const payload = JSON.stringify(state);
  const id = crypto.createHash("sha1").update(payload).digest("hex").slice(0, 8);
  const views = readJson<Record<string, unknown>>(VIEWS, {});
  views[id] = state;
  writeJson(VIEWS, views);
  return id;
}
export function getView(id: string): unknown | null {
  return readJson<Record<string, unknown>>(VIEWS, {})[id] ?? null;
}

// ---- annotations --------------------------------------------------------
export interface Annotation {
  id: number;
  region: string;
  body: string;
  author: string | null;
  created: string;
}
export function addAnnotation(region: string, body: string, author: string | null): Annotation {
  const list = readJson<Annotation[]>(ANNOS, []);
  const id = list.reduce((m, a) => Math.max(m, a.id), 0) + 1;
  const row: Annotation = { id, region, body, author, created: new Date().toISOString() };
  list.push(row);
  writeJson(ANNOS, list);
  return row;
}
export function listAnnotations(region?: string): Annotation[] {
  const list = readJson<Annotation[]>(ANNOS, []);
  const filtered = region ? list.filter((a) => a.region === region) : list;
  return filtered.sort((a, b) => b.created.localeCompare(a.created));
}
export function deleteAnnotation(id: number): boolean {
  const list = readJson<Annotation[]>(ANNOS, []);
  const next = list.filter((a) => a.id !== id);
  writeJson(ANNOS, next);
  return next.length < list.length;
}
