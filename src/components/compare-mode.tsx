"use client";

import { useState } from "react";
import { compositeFor, incidenceFor, type Computed, type Settings } from "@/lib/analysis";
import type { Panel } from "@/lib/synthetic";

interface Props {
  mode: "off" | "select" | "dashboard";
  panel: Panel;
  computed: Computed;
  s: Settings;
  ids: string[];
  /** Region's current choropleth colour — used for the dot so cards match the lit map. */
  colorFor: (id: string) => string;
  onExit: () => void;
  onProceed: () => void;
  onRemove: (id: string) => void;
  onHoverBox: (id: string | null) => void;
}

const X = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
);
const CompareGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></svg>
);

/* Compare mode overlay — a sibling of the map (high z-index) that drives both
   phases: a township-picking phase (instructions + running list) and the sliding
   "Comparison" dashboard. Every piece is kept mounted and animates via toggled
   classes, so it fades/slides in AND out. */
export function CompareMode({ mode, panel, computed, s, ids, colorFor, onExit, onProceed, onRemove, onHoverBox }: Props) {
  // Local exit choreography for list rows removed via their × button (so the row
  // plays a quick fade-out before it actually leaves `ids`). Map-click removal is
  // immediate — the row simply unmounts.
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const removeWithAnim = (id: string) => {
    setRemoving((r) => new Set(r).add(id));
    setTimeout(() => {
      onRemove(id);
      setRemoving((r) => {
        const n = new Set(r);
        n.delete(id);
        return n;
      });
    }, 220);
  };

  const selecting = mode === "select";
  const dash = mode === "dashboard";

  const metricsFor = (id: string): { label: string; value: string; unit?: string; color?: string }[] => {
    const ps = computed.perRegion[id];
    return [
      { label: "Incidence", value: incidenceFor(computed, id).toFixed(1), unit: "/100k" },
      { label: "Composite", value: compositeFor(computed, s, id).toFixed(2) },
      { label: "Endoscopy access", value: panel.regions[id]?.endoscopy_access.toFixed(2) ?? "—" },
      ...panel.factors.map((f) => ({ label: f.name, value: ps?.exposure[f.id]?.toFixed(2) ?? "—", color: f.color })),
    ];
  };

  return (
    <div className={`absolute inset-0 z-50 ${mode === "off" ? "pointer-events-none" : ""}`} aria-hidden={mode === "off"}>
      {/* instructions banner — drops in from the top during the picking phase */}
      <div
        className={`pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 transition-all duration-300 ease-out ${
          selecting ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <div className="brass-halo rounded-full bg-surface/90 px-5 py-2.5 text-center backdrop-blur-md">
          <p className="text-[13px] font-medium text-text">
            {ids.length === 0
              ? "Click at least 2 townships on the map to compare"
              : ids.length === 1
                ? "Select 1 more township to compare"
                : "Keep selecting townships, or press Compare →"}
          </p>
        </div>
      </div>

      {/* exit X (picking phase) — the dashboard has its own close button */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit compare mode"
        className={`ring-brass absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full bg-surface/90 text-text-muted shadow-brass backdrop-blur-md transition-all duration-300 hover:text-primary ${
          selecting ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {X}
      </button>

      {/* running selection list — slides in from the right edge */}
      <div
        className={`absolute right-6 top-24 w-[320px] transition-all duration-300 ease-out ${
          selecting ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-[120%] opacity-0"
        }`}
      >
        <div className="brass-halo flex max-h-[calc(100vh-13rem)] flex-col rounded-lg bg-surface/95 p-5 backdrop-blur-xl">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            <span className="text-base font-semibold text-text">{ids.length}</span> region{ids.length === 1 ? "" : "s"} selected
          </h3>
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {ids.length === 0 ? (
              <p className="text-[12.5px] italic text-text-muted">No townships selected yet — click them on the map.</p>
            ) : (
              ids.map((id) => (
                <div
                  key={id}
                  className={`flex items-center gap-2.5 rounded-md bg-surface-alt px-3 py-2.5 ${
                    removing.has(id) ? "compare-row-out" : "animate-fade-up"
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: colorFor(id) }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{panel.names[id]}</span>
                  <button
                    type="button"
                    onClick={() => removeWithAnim(id)}
                    aria-label={`Remove ${panel.names[id]}`}
                    className="shrink-0 text-text-muted transition-colors hover:text-danger"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={onProceed}
            disabled={ids.length < 2}
            className="ring-brass mt-4 flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {CompareGlyph} Compare
          </button>
        </div>
      </div>

      {/* comparison dashboard — slides + fades in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-[58%] transition-all duration-500 ease-out ${
          dash ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
        }`}
      >
        <div className="brass-halo flex h-full flex-col rounded-l-2xl bg-surface/95 p-6 backdrop-blur-xl">
          <div className="flex shrink-0 items-start justify-between gap-4 pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">Compare regions</p>
              <h2 className="title-3 text-text">Comparison</h2>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Close comparison and exit compare mode"
              className="ring-brass grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-alt text-text-muted transition-colors hover:text-primary"
            >
              {X}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {dash && (
              <div className="flex gap-4 pb-2">
                {ids.map((id, i) => (
                  <div
                    key={id}
                    onMouseEnter={() => onHoverBox(id)}
                    onMouseLeave={() => onHoverBox(null)}
                    className="animate-fade-up flex w-[230px] shrink-0 cursor-default flex-col rounded-xl border border-border bg-surface-alt/40 p-4 transition-transform duration-150 hover:-translate-y-1 hover:shadow-brass"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center gap-2 pb-3">
                      <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: colorFor(id) }} />
                      <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text" title={panel.names[id]}>
                        {panel.names[id]}
                      </h3>
                    </div>
                    <dl className="space-y-0">
                      {metricsFor(id).map((m) => (
                        <div key={m.label} className="flex items-center justify-between gap-3 border-b border-dashed border-border/60 py-1.5">
                          <dt className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-text-muted">
                            {m.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: m.color }} />}
                            <span className="truncate">{m.label}</span>
                          </dt>
                          <dd className="shrink-0 font-mono text-[12px] text-text">
                            {m.value}
                            {m.unit && <span className="ml-0.5 text-[10px] text-text-muted">{m.unit}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="shrink-0 pt-3 font-mono text-[10.5px] text-text-muted">
            Hover a region card to spotlight it on the map · factor values are window-mean z-scores
          </p>
        </div>
      </div>
    </div>
  );
}
