"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OntarioMap } from "./ontario-map";
import type { GlobeFeature } from "./globe-atlas";
import { TiltCard } from "./tilt-card";
import { ExpandingControl } from "./expanding-control";
import { Scatter, LagProfile, scatterStats, lagPeak } from "./charts";
import {
  recompute, compositeFor, dominantFor, incidenceFor, heatColor, percentileRange, sigStars,
  type Settings,
} from "@/lib/analysis";
import type { Panel } from "@/lib/synthetic";

type Theme = "light" | "dark";

const DEFAULTS: Settings & { scatter: string } = {
  active: [], yearStart: 2008, yearEnd: 2024, lag: 0, normalize: false, controlFor: "",
  age: 50, sev: 1, sex: "all", mode: "composite", scatter: "pm25",
};

function fmtP(p: number | null | undefined) {
  if (p == null) return "—";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

// ---- tiny UI primitives ------------------------------------------------
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-surface-alt"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        on ? "gradient-wash border-primary/40 text-text" : "border-border text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
function Range({ label, value, min, max, step = 1, onChange, display }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; display: string;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-text">{label}</span>
        <span className="font-mono text-primary">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-alt accent-primary" />
    </div>
  );
}

// icons
const I = {
  layers: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>,
  palette: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.5A4.5 4.5 0 0 0 22 11c0-5-4.5-9-10-9z" /></svg>,
  clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  sliders: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>,
  data: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></svg>,
  download: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  replay: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  share: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>,
  copy: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
};

interface Anno { id: number; region: string; body: string; author: string | null; created: string }

export function Atlas() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [features, setFeatures] = useState<GlobeFeature[] | null>(null);
  const [s, setS] = useState(DEFAULTS);
  const [theme, setTheme] = useState<Theme>("light");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [annos, setAnnos] = useState<Anno[]>([]);
  const [annoInput, setAnnoInput] = useState("");
  const [introKey, setIntroKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingViewApplied = useRef(false);

  const set = useCallback(<K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v })), []);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // ---- boot: theme, panel, geojson, shared view ----
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme) ?? "light";
    setTheme(stored);
    document.documentElement.setAttribute("data-theme", stored);

    Promise.all([
      fetch("/api/panel").then((r) => r.json()),
      fetch("/data/ontario-townships.geojson").then((r) => r.json()),
    ]).then(([p, geo]: [Panel, { features: GlobeFeature[] }]) => {
      setFeatures(geo.features);
      const q = new URLSearchParams(location.search);
      const vid = q.get("v");
      if (vid) {
        fetch(`/api/views/${vid}`).then((r) => (r.ok ? r.json() : null)).then((view) => {
          if (view) setS((prev) => ({ ...prev, ...view }));
          else applyDefaultsFor(p);
          pendingViewApplied.current = true;
          setPanel(p);
        });
      } else if ([...q.keys()].length) {
        const obj: Record<string, unknown> = {};
        q.forEach((val, key) => (obj[key] = val));
        setS((prev) => ({ ...prev, ...deserialize(obj) }));
        setPanel(p);
      } else {
        applyDefaultsFor(p);
        setPanel(p);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDefaultsFor(p: Panel) {
    setS((prev) => ({ ...prev, active: p.factors.filter((f) => f.in_model).map((f) => f.id) }));
  }

  const themeToggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  // ---- compute ----
  const computed = useMemo(() => (panel ? recompute(panel, s) : null), [panel, s]);

  // percentile stretch so the choropleth shows real contrast (composite/incidence
  // values cluster mid-range otherwise → a near-uniform hue)
  const range = useMemo<[number, number]>(() => {
    if (!computed) return [0, 1];
    const vals = computed.ids.map((id) =>
      s.mode === "incidence" ? incidenceFor(computed, id) : compositeFor(computed, s, id),
    );
    return percentileRange(vals);
  }, [computed, s]);

  const colorFor = useCallback(
    (id: string) => {
      if (!computed || !panel) return "#888";
      if (s.mode === "dominant") {
        const fid = dominantFor(computed, s, id);
        return panel.factors.find((f) => f.id === fid)?.color ?? "#888";
      }
      const v = s.mode === "incidence" ? incidenceFor(computed, id) : compositeFor(computed, s, id);
      return heatColor((v - range[0]) / (range[1] - range[0]));
    },
    [computed, panel, s, range],
  );

  const labelFor = useCallback(
    (id: string) => {
      if (!computed || !panel) return "";
      const name = panel.names[id];
      const comp = compositeFor(computed, s, id).toFixed(2);
      const inc = incidenceFor(computed, id).toFixed(2);
      const rows = s.active
        .map((fid) => {
          const f = panel.factors.find((x) => x.id === fid)!;
          const c = computed.corr[fid];
          return `<div style="display:flex;justify-content:space-between;gap:14px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${f.color};margin-right:6px"></span>${f.name}</span><b>ρ ${c?.r == null ? "—" : c.r.toFixed(2)} ${sigStars(c?.p)}</b></div>`;
        })
        .join("");
      return `<div style="font-family:var(--font-figtree),sans-serif;background:hsl(var(--surface));color:hsl(var(--text));border:1px solid hsl(var(--border));border-radius:12px;padding:12px 14px;min-width:220px;box-shadow:0 12px 30px -12px rgba(0,0,0,.35)">
        <div style="font-weight:700;margin-bottom:6px">${name}</div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono),monospace;font-size:11.5px;color:hsl(var(--text-muted))"><span>Incidence${s.normalize ? " (adj.)" : ""}</span><b style="color:hsl(var(--text))">${inc} /100k</b></div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono),monospace;font-size:11.5px;color:hsl(var(--text-muted));margin-bottom:6px"><span>Composite</span><b style="color:hsl(var(--text))">${comp}</b></div>
        <div style="border-top:1px dashed hsl(var(--border));padding-top:6px;font-family:var(--font-mono),monospace;font-size:11px;color:hsl(var(--text-muted))">${rows || "no factors active"}</div>
      </div>`;
    },
    [computed, panel, s],
  );

  // ---- URL sync ----
  useEffect(() => {
    if (!panel) return;
    const q = new URLSearchParams(serialize(s));
    history.replaceState(null, "", "?" + q.toString());
  }, [s, panel]);

  // ---- annotations ----
  const loadAnnos = useCallback((id: string) => {
    fetch(`/api/annotations?region=${id}`).then((r) => r.json()).then(setAnnos);
  }, []);
  useEffect(() => {
    if (selectedId) loadAnnos(selectedId);
  }, [selectedId, loadAnnos]);

  function postAnno() {
    if (!annoInput.trim() || !selectedId) return;
    fetch("/api/annotations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: selectedId, body: annoInput.trim(), author: "researcher" }),
    }).then(() => { setAnnoInput(""); loadAnnos(selectedId); showToast("Note posted"); });
  }
  function delAnno(id: number) {
    fetch(`/api/annotations/${id}`, { method: "DELETE" }).then(() => selectedId && loadAnnos(selectedId));
  }

  // ---- share / export ----
  function share() {
    fetch("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(serialize(s)) })
      .then((r) => r.json()).then(({ id }) => {
        const url = `${location.origin}/?v=${id}`;
        navigator.clipboard?.writeText(url).then(() => showToast("Share link copied"), () => showToast(url));
      });
  }
  function exportCsv() {
    if (!panel || !computed) return;
    const head = ["region_id", "name", "incidence", "endoscopy_access", ...panel.factors.map((f) => "z_" + f.id), "composite"];
    const lines = [head.join(",")];
    for (const id of computed.ids) {
      const ps = computed.perRegion[id];
      lines.push([id, `"${panel.names[id].replace(/"/g, "'")}"`, ps.incidence.toFixed(3), panel.regions[id].endoscopy_access,
        ...panel.factors.map((f) => ps.exposure[f.id].toFixed(3)), compositeFor(computed, s, id).toFixed(3)].join(","));
    }
    download("ontario_eoe_data.csv", "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n")));
    showToast("CSV exported");
  }
  function exportPng() {
    const cv = document.querySelector<HTMLCanvasElement>("#scatter-canvas canvas");
    if (cv) { download("ontario_eoe_scatter.png", cv.toDataURL("image/png")); showToast("Scatter PNG exported"); }
  }
  function exportMethods() {
    if (!panel || !computed) return;
    const corrLines = s.active.map((id) => {
      const c = computed.corr[id], f = panel.factors.find((x) => x.id === id)!;
      return `  - ${f.name}: r=${c.r == null ? "NA" : c.r.toFixed(3)}, p=${fmtP(c.p)}${c.partial ? " (partial)" : ""}`;
    }).join("\n");
    const txt = `EOE × Environment — Ontario — Methods note
Generated ${new Date().toISOString()}

Data: ${panel.source} (SYNTHETIC — illustrative only, do not cite)
Geography: Ontario census subdivisions (2021), n=${computed.ids.length}
Window: ${s.yearStart}–${s.yearEnd}; exposure lag ${s.lag} yr; incidence ${s.normalize ? "adjusted for diagnostic access" : "unadjusted"}
Partial control: ${s.controlFor ? panel.factors.find((f) => f.id === s.controlFor)!.name : "none"}
Cohort (illustrative): age-weight=${s.age}, severity≥${["any", "mild", "moderate", "severe"][s.sev]}, sex=${s.sex}
Design: ecological (township-level). In-browser stats validated vs scipy to 1e-6.

Per-factor associations:
${corrLines || "  (none active)"}

Caveats: ecological associations; no causal inference; diagnostic ascertainment is
a known EoE confounder (see access adjustment). Synthetic data.`;
    download("ontario_eoe_methods.txt", "data:text/plain;charset=utf-8," + encodeURIComponent(txt));
    showToast("Methods note exported");
  }

  // ---- derived leaderboard ----
  const lead = useMemo(() => {
    if (!computed || !panel) return null;
    const rows = computed.ids.map((id) => ({ id, rho: compositeFor(computed, s, id), inc: incidenceFor(computed, id) }));
    rows.sort((a, b) => b.rho - a.rho);
    const meanInc = rows.reduce((a, r) => a + r.inc, 0) / rows.length;
    let strongest: string | null = null;
    for (const fid of s.active) {
      const c = computed.corr[fid];
      if (c?.r != null && (!strongest || Math.abs(c.r) > Math.abs(computed.corr[strongest].r!))) strongest = fid;
    }
    return { top: rows[0], bottom: rows[rows.length - 1], meanInc, strongest };
  }, [computed, panel, s]);

  if (!panel || !features || !computed || !lead) {
    return (
      <div className="grid h-screen w-screen place-items-center gradient-atelier-mesh">
        <div className="animate-pulse font-mono text-sm uppercase tracking-[0.2em] text-text-muted">
          Loading Ontario atlas…
        </div>
      </div>
    );
  }

  const factorById = (id: string) => panel.factors.find((f) => f.id === id)!;
  const scatterColor = factorById(s.scatter).color;
  const sstat = scatterStats(computed, s.scatter);
  const builtInLag = lagPeak(panel, s.scatter, s.normalize);

  // grounded summary content
  const ranked = s.active
    .map((id) => ({ f: factorById(id), c: computed.corr[id] }))
    .filter((o) => o.c?.r != null)
    .sort((a, b) => Math.abs(b.c.r!) - Math.abs(a.c.r!));
  const driver = ranked[0];
  const weak = ranked.filter((o) => o.c.p != null && o.c.p >= 0.05).map((o) => o.f.name.toLowerCase());

  function copySummary() {
    if (!driver || !panel || !lead) return;
    const ci = driver.c.ci[0] != null ? `, 95% CI ${driver.c.ci[0]!.toFixed(2)} to ${driver.c.ci[1]!.toFixed(2)}` : "";
    const sig = driver.c.p != null && driver.c.p < 0.05 ? `p = ${fmtP(driver.c.p)}` : `not significant (p = ${fmtP(driver.c.p)})`;
    const txt =
      `Across ${s.yearStart}–${s.yearEnd}${s.lag ? ` at a ${s.lag}-yr exposure lag` : ""}` +
      `${s.controlFor ? `, controlling for ${factorById(s.controlFor).name.toLowerCase()}` : ""}, ` +
      `the strongest measured association across Ontario townships is ${driver.f.name.toLowerCase()} ` +
      `(r = ${driver.c.r!.toFixed(2)}${ci}, n = ${driver.c.n} townships, ${sig})${driver.c.partial ? ", a partial correlation" : ""}. ` +
      `Incidence is ${s.normalize ? "adjusted for diagnostic-access" : "unadjusted (diagnostic-access confounding likely)"}; ` +
      `the composite peaks in ${panel.names[lead.top.id]} and is lowest in ${panel.names[lead.bottom.id]}.` +
      `${weak.length ? ` No reliable association was detected for ${weak.join(", ")} (p ≥ 0.05) — treat as null results.` : ""}` +
      `\n\nEcological (township-level) associations — they do not establish causation or individual risk. Synthetic data; do not cite.`;
    navigator.clipboard?.writeText(txt).then(() => showToast("Summary copied"), () => showToast("Copy failed"));
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-bg">
      {/* first screen — header + full-bleed map (everything below scrolls into view) */}
      <div className="flex h-screen flex-col">
      {/* header */}
      <header className="z-40 flex shrink-0 items-center justify-between gap-6 px-6 py-3">
        <div className="brass-halo rounded-lg bg-surface px-6 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">Ontario · synthetic prototype</p>
          <h1 className="title-3 mt-1 text-text">EOE × Environment</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={share} className="ring-brass shadow-brass flex items-center gap-2 rounded-full bg-surface px-6 py-4 text-sm font-semibold text-text transition-colors hover:text-primary">
            {I.share} Share view
          </button>
          <button onClick={themeToggle} aria-label="Toggle theme" className="ring-brass shadow-brass grid h-12 w-12 place-items-center rounded-full bg-surface text-text-muted transition-colors hover:text-primary">
            {theme === "light" ? I.moon : I.sun}
          </button>
        </div>
      </header>

      {/* full-bleed map stage; everything else floats over it */}
      <main className="relative min-h-0 flex-1">
        {/* MAP — fills the whole stage, no card */}
        <div className="absolute inset-0">
          <OntarioMap features={features} colorFor={colorFor} labelHtmlFor={labelFor} selectedId={selectedId} theme={theme} onSelect={setSelectedId} introKey={introKey} />
        </div>

        {/* control rail — vertical, left edge (pointer-events let map gaps stay live) */}
        <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-3">
        <ExpandingControl icon={I.layers} label="Environmental factors" badge={`${s.active.length} active`} side="right" className="pointer-events-auto">
          <div className="flex flex-col gap-2">
            {panel.factors.map((f) => {
              const on = s.active.includes(f.id);
              const c = computed.corr[f.id];
              const toggle = () => set("active", on ? s.active.filter((x) => x !== f.id) : [...s.active, f.id]);
              return (
                <div key={f.id} role="button" tabIndex={0} onClick={toggle}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                  className={`hover-gradient flex cursor-pointer items-center gap-3 rounded-md p-3 text-left transition-colors ${on ? "gradient-wash" : ""}`}>
                  <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: f.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-text">{f.name}</span>
                    <span className="block font-mono text-[11px] text-text-muted">
                      {c?.r == null ? f.hint : `ρ ${c.r.toFixed(2)} ${sigStars(c.p)}${c.partial ? " · partial" : ""}`}
                    </span>
                  </span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-surface-alt"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </div>
              );
            })}
          </div>
        </ExpandingControl>

        <ExpandingControl icon={I.palette} label="Display mode" side="right" className="pointer-events-auto">
          <div className="flex flex-wrap gap-2">
            {(["composite", "dominant", "incidence"] as const).map((m) => (
              <Chip key={m} on={s.mode === m} onClick={() => set("mode", m)}>
                {m === "composite" ? "Composite" : m === "dominant" ? "Dominant factor" : "Raw incidence"}
              </Chip>
            ))}
          </div>
        </ExpandingControl>

        <ExpandingControl icon={I.clock} label="Time window & lag" badge={`${s.yearStart}–${s.yearEnd}`} side="right" className="pointer-events-auto">
          <Range label="Start year" value={s.yearStart} min={2000} max={2024} display={`${s.yearStart}`}
            onChange={(v) => set("yearStart", Math.min(v, s.yearEnd))} />
          <Range label="End year" value={s.yearEnd} min={2000} max={2024} display={`${s.yearEnd}`}
            onChange={(v) => set("yearEnd", Math.max(v, s.yearStart))} />
          <Range label="Exposure lag (yrs before dx)" value={s.lag} min={0} max={8} display={`${s.lag}`}
            onChange={(v) => set("lag", v)} />
          <div className="mt-3 h-12 rounded-md bg-surface-alt p-1" id="lag-mini">
            <LagProfile panel={panel} factorId={s.scatter} lag={s.lag} normalize={s.normalize} color={scatterColor} themeKey={theme} />
          </div>
          <p className="mt-2 font-mono text-[10px] text-text-muted">
            pooled lag profile · {factorById(s.scatter).name} · peak @ {builtInLag} yr
          </p>
        </ExpandingControl>

        <ExpandingControl icon={I.sliders} label="Adjustment & cohort" side="right" className="pointer-events-auto">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-text">Normalize by diagnostic access<span className="mt-0.5 block font-mono text-[10px] text-text-muted">divide incidence by endoscopy/GI proxy</span></span>
            <Switch on={s.normalize} onClick={() => set("normalize", !s.normalize)} />
          </div>
          <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">Control for (partial)</label>
          <select value={s.controlFor} onChange={(e) => set("controlFor", e.target.value)}
            className="ring-brass mt-1.5 w-full rounded-md bg-surface-alt px-3 py-2 text-[13px] text-text">
            <option value="">— none —</option>
            {panel.factors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <p className="mt-3 rounded-md bg-warning/15 p-4 text-[11px] leading-snug text-text">
            ⚠ Cohort weighting below is a UI placeholder — not wired to microdata.
          </p>
          <Range label="Age weight" value={s.age} min={0} max={100} display={s.age < 35 ? "pediatric" : s.age > 65 ? "adult" : "balanced"} onChange={(v) => set("age", v)} />
          <Range label="Severity ≥" value={s.sev} min={0} max={3} display={["any", "mild", "moderate", "severe"][s.sev]} onChange={(v) => set("sev", v)} />
        </ExpandingControl>

        <ExpandingControl icon={I.data} label="Data provenance" side="right" className="pointer-events-auto">
          <div className="flex flex-col gap-1.5">
            {panel.factors.map((f) => {
              const p = panel.provenance[f.id];
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-[11.5px] last:border-0">
                  <span><span className="block text-text">{f.name}</span><span className="block text-text-muted">{p.source}</span></span>
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] text-accent">{p.status}</span>
                </div>
              );
            })}
          </div>
        </ExpandingControl>

        <ExpandingControl icon={I.download} label="Export" side="right" className="pointer-events-auto">
          <div className="flex flex-col gap-2">
            <button onClick={exportCsv} className="ring-brass rounded-md bg-surface-alt px-4 py-3 text-left text-[13px] text-text hover-gradient">Data (CSV)</button>
            <button onClick={exportPng} className="ring-brass rounded-md bg-surface-alt px-4 py-3 text-left text-[13px] text-text hover-gradient">Scatter (PNG)</button>
            <button onClick={exportMethods} className="ring-brass rounded-md bg-surface-alt px-4 py-3 text-left text-[13px] text-text hover-gradient">Methods note (TXT)</button>
          </div>
        </ExpandingControl>

        <button onClick={() => setIntroKey((k) => k + 1)} aria-label="Replay intro"
          className="ring-brass shadow-brass pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-surface/90 text-text-muted backdrop-blur-md transition-colors hover:text-primary">
          {I.replay}
        </button>
      </div>

        {/* legend / dominant-factor key — bottom-right of the map */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-20">
          <div className="brass-halo pointer-events-auto flex items-center gap-3 rounded-lg bg-surface/80 px-4 py-2.5 backdrop-blur-md">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {s.mode === "incidence" ? "Incidence /100k" : s.mode === "dominant" ? "Dominant factor" : "Composite (ρ-weighted)"}
            </span>
            {s.mode === "dominant" ? (
              <div className="flex max-w-[320px] flex-wrap gap-x-3 gap-y-1">
                {s.active.map((id) => { const f = factorById(id); return (
                  <span key={id} className="flex items-center gap-1 font-mono text-[9px] text-text-muted">
                    <span className="h-2.5 w-2.5 rounded" style={{ background: f.color }} />{f.name.split(" ")[0]}
                  </span>); })}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted">low</span>
                <div className="h-2.5 w-40 rounded-full" style={{ background: "linear-gradient(90deg,rgb(45,115,180),rgb(58,166,201),rgb(22,171,152),rgb(223,159,69),rgb(197,86,86))" }} />
                <span className="font-mono text-[9px] text-text-muted">high</span>
              </div>
            )}
          </div>
        </div>

        {/* KEY STATS — no card; blended into the map, semi-transparent */}
        <div className="pointer-events-none absolute right-5 top-5 z-30 w-[300px]">
          <div className="pointer-events-auto flex max-h-[calc(100vh-150px)] flex-col overflow-auto rounded-xl bg-bg/20 px-4 py-3 backdrop-blur-[2px] [text-shadow:0_1px_4px_hsl(var(--bg)/0.85)]">
          {selectedId ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h4 className="text-bold text-text">{panel.names[selectedId]}</h4>
                <button onClick={() => setSelectedId(null)} className="font-mono text-[11px] text-text-muted hover:text-text">← overview</button>
              </div>
              <p className="mt-2 font-mono text-[11px] text-text-muted">
                composite {compositeFor(computed, s, selectedId).toFixed(2)} · incidence {incidenceFor(computed, selectedId).toFixed(1)}/100k
              </p>
              <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                {annos.length === 0 ? (
                  <p className="text-[12.5px] italic text-text-muted">No team notes yet for this township.</p>
                ) : annos.map((a) => (
                  <div key={a.id} className="rounded-md bg-surface-alt p-4 text-[12.5px] text-text">
                    {a.body}
                    <div className="mt-2 flex justify-between font-mono text-[10px] text-text-muted">
                      <span>{a.author ?? "anon"}</span>
                      <button onClick={() => delAnno(a.id)} className="text-danger">delete</button>
                    </div>
                  </div>
                ))}
              </div>
              <textarea value={annoInput} onChange={(e) => setAnnoInput(e.target.value)} placeholder="Add a team note…"
                className="ring-brass mt-4 min-h-[56px] w-full resize-y rounded-md bg-surface-alt p-4 text-[12.5px] text-text" />
              <button onClick={postAnno} className="ring-brass mt-3 self-start rounded-md bg-primary px-5 py-3 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                Post note
              </button>
            </>
          ) : (
            <>
              <h4 className="text-semibold text-text">Top townships &amp; key stats</h4>
              <div className="mt-6 grid flex-1 grid-cols-2 content-start gap-x-8 gap-y-6">
                <Stat k="Top township" v={truncate(panel.names[lead.top.id], 18)} />
                <Stat k="Composite (max)" v={lead.top.rho.toFixed(2)} />
                <Stat k="Mean incidence" v={`${lead.meanInc.toFixed(1)}`} sub="/100k" />
                <Stat k="Strongest factor" v={lead.strongest ? `${computed.corr[lead.strongest].r!.toFixed(2)}` : "—"} sub={lead.strongest ? factorById(lead.strongest).name.split(" ")[0] : ""} />
                <Stat k="Active factors" v={`${s.active.length}`} />
                <Stat k="Townships (n)" v={`${computed.ids.length}`} />
              </div>
              <p className="mt-4 font-mono text-[10.5px] text-text-muted">Click any township on the map to read or add team notes.</p>
            </>
          )}
          </div>
        </div>

      </main>
      </div>{/* end first screen (header + map) */}

      {/* BELOW THE MAP — analysis summary + scatter & fit, not on the canvas */}
      <section className="grid grid-cols-1 items-start gap-7 px-6 py-8 lg:grid-cols-[minmax(360px,560px)_minmax(0,760px)]">
          {/* ANALYSIS SUMMARY — height hugs its text */}
          <TiltCard intensity={3} className="w-full p-7" contentClassName="flex flex-col">
          <button
            onClick={copySummary}
            aria-label="Copy summary"
            className="ring-brass absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-full bg-surface-alt text-text-muted transition-colors hover:text-primary"
          >
            {I.copy}
          </button>
          <div className="mb-4 flex items-center gap-3 pr-12">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]" />
            <h4 className="text-semibold text-text">Analysis summary</h4>
            <span className="rounded bg-surface-alt px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">computed</span>
          </div>
          {driver ? (
            <p className="body-text leading-relaxed text-text">
              Across <b>{s.yearStart}–{s.yearEnd}</b>{s.lag ? ` at a ${s.lag}-yr exposure lag` : ""}
              {s.controlFor ? `, controlling for ${factorById(s.controlFor).name.toLowerCase()}` : ""}, the strongest
              measured association across Ontario townships is{" "}
              <span className="font-semibold text-warning">{driver.f.name.toLowerCase()}</span>{" "}
              (r = {driver.c.r!.toFixed(2)}
              {driver.c.ci[0] != null ? `, 95% CI ${driver.c.ci[0]!.toFixed(2)} to ${driver.c.ci[1]!.toFixed(2)}` : ""},
              n = {driver.c.n} townships,{" "}
              {driver.c.p != null && driver.c.p < 0.05 ? `p = ${fmtP(driver.c.p)}` : `not significant (p = ${fmtP(driver.c.p)})`})
              {driver.c.partial ? ", a partial correlation" : ""}. Incidence is{" "}
              {s.normalize ? "adjusted for diagnostic-access" : "unadjusted (diagnostic-access confounding likely)"};
              the composite peaks in <b>{panel.names[lead.top.id]}</b> and is lowest in <b>{panel.names[lead.bottom.id]}</b>.
              {weak.length ? <> <span className="italic text-text-muted">No reliable association</span> was detected for {weak.join(", ")} (p ≥ 0.05) — treat as null results.</> : null}
            </p>
          ) : (
            <p className="body-text text-text-muted">Toggle one or more environmental factors to compute associations.</p>
          )}
          <p className="mt-5 text-[12px] italic text-text-muted">
            Ecological (township-level) associations — they do not establish causation or individual risk. Synthetic data; do not cite.
          </p>
        </TiltCard>

          {/* SCATTER & FIT — plain card (no tilt) so zoom/pan stay accurate */}
          <div className="brass-halo flex h-[452px] w-full flex-col rounded-lg bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h4 className="text-semibold text-text">Scatter &amp; fit</h4>
              {/* open-on-hover factor menu */}
              <div className="group relative after:absolute after:left-0 after:top-full after:h-3 after:w-full after:content-['']">
                <button type="button" className="gradient-wash flex items-center gap-2 rounded-md border border-primary/30 px-3.5 py-2 text-[12.5px] font-medium text-primary transition-colors hover:border-primary/50">
                  {factorById(s.scatter).name}
                  <svg className="transition-transform duration-200 group-hover:rotate-180" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div className="no-scrollbar pointer-events-none absolute right-0 top-full z-50 mt-2 max-h-[260px] w-60 origin-top-right scale-95 overflow-auto rounded-lg border border-primary/25 bg-surface/95 p-1.5 opacity-0 shadow-[0_14px_36px_-12px_rgba(0,0,0,.5)] backdrop-blur-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
                  {panel.factors.map((f) => (
                    <button key={f.id} type="button" onClick={() => set("scatter", f.id)}
                      className={`hover-gradient flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12.5px] transition-colors ${f.id === s.scatter ? "gradient-wash text-primary" : "text-text-muted hover:text-text"}`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: f.color }} />{f.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div id="scatter-canvas" className="min-h-0 w-full flex-1">
              <Scatter computed={computed} factorId={s.scatter} color={scatterColor} selectedId={selectedId} themeKey={theme} />
            </div>
            <div className="mt-3 flex justify-between font-mono text-[11px] text-text-muted">
              <span>r={sstat.r == null ? "—" : sstat.r.toFixed(2)} · R²={sstat.r2.toFixed(2)} · {sstat.stars}</span>
              <span>n={sstat.n} · scroll · drag · dbl-click ⟲</span>
            </div>
          </div>
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-primary/40 bg-success/15 px-5 py-3 text-sm text-text backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="border-b border-dashed border-border pb-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{k}</div>
      <div className="mt-1.5 font-mono text-lg text-text">{v}{sub ? <span className="ml-1 text-[11px] text-text-muted">{sub}</span> : null}</div>
    </div>
  );
}
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- settings (de)serialization for URL + saved views ----
function serialize(s: typeof DEFAULTS): Record<string, string> {
  return {
    f: s.active.join(","), ys: `${s.yearStart}`, ye: `${s.yearEnd}`, lag: `${s.lag}`,
    norm: s.normalize ? "1" : "0", ctrl: s.controlFor, age: `${s.age}`, sev: `${s.sev}`,
    sex: s.sex, mode: s.mode, sc: s.scatter,
  };
}
function deserialize(o: Record<string, unknown>): Partial<typeof DEFAULTS> {
  const out: Partial<typeof DEFAULTS> = {};
  if (o.f != null) out.active = String(o.f).split(",").filter(Boolean);
  if (o.ys != null) out.yearStart = +(o.ys as string);
  if (o.ye != null) out.yearEnd = +(o.ye as string);
  if (o.lag != null) out.lag = +(o.lag as string);
  if (o.norm != null) out.normalize = +(o.norm as string) === 1;
  if (o.ctrl != null) out.controlFor = String(o.ctrl);
  if (o.age != null) out.age = +(o.age as string);
  if (o.sev != null) out.sev = +(o.sev as string);
  if (o.sex != null) out.sex = String(o.sex);
  if (o.mode != null) out.mode = String(o.mode) as Settings["mode"];
  if (o.sc != null) out.scatter = String(o.sc);
  return out;
}
