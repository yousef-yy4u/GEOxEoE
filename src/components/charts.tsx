"use client";

import { useEffect, useRef, useState } from "react";
import { ols, pearson } from "@/lib/stats";
import { type Computed } from "@/lib/analysis";
import type { Panel } from "@/lib/synthetic";

interface ScatterView { scale: number; tx: number; ty: number }
const FLAT: ScatterView = { scale: 1, tx: 0, ty: 0 };

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

/* Scatter of township incidence vs the selected factor's exposure, with the
   OLS fit line. The map shows where; this shows the relationship. */
export function Scatter({
  computed,
  factorId,
  color,
  selectedId,
  themeKey,
}: {
  computed: Computed;
  factorId: string;
  color: string;
  selectedId: string | null;
  themeKey: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ScatterView>(FLAT);

  // a fresh factor means a fresh dataset — drop back to the un-zoomed view
  useEffect(() => { setView(FLAT); }, [factorId]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ids = computed.ids;
    const xs = ids.map((id) => computed.perRegion[id].exposure[factorId]);
    const ys = ids.map((id) => computed.perRegion[id].incidence);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    cv.dataset.scale = view.scale.toFixed(3); // expose for tests/debugging

    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const pad = 30;
    const X0 = (v: number) => pad + ((v - xmin) / ((xmax - xmin) || 1)) * (w - pad - 10);
    const Y0 = (v: number) => h - pad - ((v - ymin) / ((ymax - ymin) || 1)) * (h - pad - 12);
    // wheel-zoom / drag-pan transform — axes & labels stay put, data moves
    const X = (v: number) => X0(v) * view.scale + view.tx;
    const Y = (v: number) => Y0(v) * view.scale + view.ty;

    const axis = cssVar("--border", "#ccc");
    const muted = cssVar("--text-muted", "#888");
    ctx.strokeStyle = axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, 8); ctx.lineTo(pad, h - pad); ctx.lineTo(w - 6, h - pad); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = "10px var(--font-mono), monospace";
    ctx.fillText("exposure z →", pad + 4, h - pad + 16);
    if (view.scale !== 1) {
      ctx.textAlign = "right";
      ctx.fillText(view.scale.toFixed(1) + "×", w - 8, 14);
      ctx.textAlign = "left";
    }

    // clip the transformed plot so zoomed points don't spill over the axes/labels
    ctx.save();
    ctx.beginPath(); ctx.rect(pad, 6, w - 6 - pad, h - pad - 6); ctx.clip();

    const fit = ols(xs, ys);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(xmin), Y(fit.intercept + fit.slope * xmin));
    ctx.lineTo(X(xmax), Y(fit.intercept + fit.slope * xmax)); ctx.stroke();

    ids.forEach((id, i) => {
      const sel = id === selectedId;
      ctx.fillStyle = sel ? "#7F69AE" : color + "aa";
      ctx.beginPath(); ctx.arc(X(xs[i]), Y(ys[i]), sel ? 5 : 2.4, 0, 7); ctx.fill();
    });
    ctx.restore();
  }, [computed, factorId, color, selectedId, themeKey, view]);

  // Interaction: bound once (mount). Functional setView avoids stale closures;
  // passive:false lets preventDefault stop the page from scrolling/zooming.
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const drag = { active: false, lastX: 0, lastY: 0 };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((prev) => {
        const ns = Math.max(1, Math.min(20, prev.scale * f));
        if (ns === 1) return FLAT;
        const k = ns / prev.scale;
        return { scale: ns, tx: cx - (cx - prev.tx) * k, ty: cy - (cy - prev.ty) * k };
      });
    };
    const onDown = (e: MouseEvent) => { drag.active = true; drag.lastX = e.clientX; drag.lastY = e.clientY; };
    const onMove = (e: MouseEvent) => {
      if (!drag.active) return;
      const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      setView((prev) => (prev.scale === 1 ? prev : { ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
    };
    const onUp = () => { drag.active = false; };
    const onDbl = (e: MouseEvent) => { e.preventDefault(); setView(FLAT); };

    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cv.addEventListener("dblclick", onDbl);
    return () => {
      cv.removeEventListener("wheel", onWheel);
      cv.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cv.removeEventListener("dblclick", onDbl);
    };
  }, []);

  return <canvas ref={ref} className={`h-full w-full ${view.scale > 1 ? "cursor-grab" : ""}`} />;
}

export function scatterStats(computed: Computed, factorId: string) {
  const ids = computed.ids;
  const xs = ids.map((id) => computed.perRegion[id].exposure[factorId]);
  const ys = ids.map((id) => computed.perRegion[id].incidence);
  const p = pearson(xs, ys);
  const fit = ols(xs, ys);
  return { r: p.r, p: p.p, r2: fit.r2, n: ids.length };
}

/* Pooled state-year lag profile (n≈14k) — recovers the built-in lag. POINT
   ESTIMATES only; pooled obs are autocorrelated so no p-value is shown. */
export function LagProfile({
  panel,
  factorId,
  lag,
  normalize,
  color,
  themeKey,
}: {
  panel: Panel;
  factorId: string;
  lag: number;
  normalize: boolean;
  color: string;
  themeKey: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ids = Object.keys(panel.regions);
    const ny = panel.years.length;
    const rs: number[] = [];
    for (let L = 0; L <= 8; L++) {
      const xs: number[] = [], ys: number[] = [];
      for (const id of ids) {
        const node = panel.regions[id];
        for (let yi = 0; yi < ny; yi++) {
          const li = yi - L;
          if (li < 0) continue;
          let inc = node.series.incidence_observed[yi];
          if (normalize) inc /= node.endoscopy_access;
          xs.push(node.series[factorId][li]);
          ys.push(inc);
        }
      }
      rs.push(pearson(xs, ys).r ?? 0);
    }
    const peak = rs.reduce((bi, r, i, a) => (Math.abs(r) > Math.abs(a[bi]) ? i : bi), 0);

    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const muted = cssVar("--text-muted", "#888");
    const amax = Math.max(0.1, ...rs.map((r) => Math.abs(r)));
    const bw = (w - 8) / rs.length;
    rs.forEach((r, i) => {
      const bh = (Math.abs(r) / amax) * (h - 16);
      const x = 4 + i * bw;
      ctx.fillStyle = i === lag ? color : i === peak ? "#16AB98" : muted + "55";
      ctx.fillRect(x + 1.5, h - 12 - bh, bw - 3, bh);
      ctx.fillStyle = i === lag ? color : muted;
      ctx.font = "9px var(--font-mono), monospace";
      ctx.fillText(String(i), x + bw / 2 - 3, h - 2);
    });
  }, [panel, factorId, lag, normalize, color, themeKey]);

  return <canvas ref={ref} className="h-full w-full" />;
}

export function lagPeak(panel: Panel, factorId: string, normalize: boolean): number {
  const ids = Object.keys(panel.regions);
  const ny = panel.years.length;
  const rs: number[] = [];
  for (let L = 0; L <= 8; L++) {
    const xs: number[] = [], ys: number[] = [];
    for (const id of ids) {
      const node = panel.regions[id];
      for (let yi = 0; yi < ny; yi++) {
        const li = yi - L;
        if (li < 0) continue;
        let inc = node.series.incidence_observed[yi];
        if (normalize) inc /= node.endoscopy_access;
        xs.push(node.series[factorId][li]);
        ys.push(inc);
      }
    }
    rs.push(pearson(xs, ys).r ?? 0);
  }
  return rs.reduce((bi, r, i, a) => (Math.abs(r) > Math.abs(a[bi]) ? i : bi), 0);
}
