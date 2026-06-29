"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobeFeature } from "./globe-atlas";

const VBW = 1000;
const VBH = 860;
const ASPECT = VBH / VBW;
const MIN_W = VBW / 14; // max zoom-in
const OVERSCROLL = 0.18; // how far past the edges a pan may drift

interface ViewBox { x: number; y: number; w: number; h: number }
const FULL: ViewBox = { x: 0, y: 0, w: VBW, h: VBH };
// Default framing the map opens to (captured via the "Copy view" helper).
const DEFAULT_VIEW: ViewBox = { x: 539.3, y: 574.6, w: 324.2, h: 278.8 };

// Keep the aspect locked (so the "meet" projection never distorts) and stop
// pans/zooms from flinging the map off into empty space.
function clampVb(v: ViewBox): ViewBox {
  const w = Math.max(MIN_W, Math.min(VBW, v.w));
  const h = w * ASPECT;
  const ox = VBW * OVERSCROLL, oy = VBH * OVERSCROLL;
  const x = Math.max(-ox, Math.min(VBW - w + ox, v.x));
  const y = Math.max(-oy, Math.min(VBH - h + oy, v.y));
  return { x, y, w, h };
}

interface Props {
  features: GlobeFeature[];
  colorFor: (id: string) => string;
  labelHtmlFor: (id: string) => string;
  selectedId: string | null;
  theme: "light" | "dark";
  onSelect?: (id: string) => void;
  introKey?: number;
  /** Compare mode: darken the whole base map so only `highlightIds` stand out. */
  dim?: boolean;
  /** Regions kept in full colour (drawn as overlays on top of the dimmed base). */
  highlightIds?: string[];
  /** When set, every highlighted region except this one fades back toward dark. */
  spotlightId?: string | null;
}

interface Shape {
  id: string;
  d: string;
}

/* Base layer: all townships. Memoized so hovering (parent state) doesn't
   re-render 577 paths — only the float overlay updates. */
const BaseLayer = memo(function BaseLayer({
  shapes,
  colorMap,
  stroke,
  onHover,
  onSelect,
}: {
  shapes: Shape[];
  colorMap: Record<string, string>;
  stroke: string;
  onHover: (id: string | null) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <g>
      {shapes.map((sh) => (
        <path
          key={sh.id}
          d={sh.d}
          className="twp"
          fill={colorMap[sh.id] ?? "#888"}
          stroke={stroke}
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
          // base stays visible + interactive; the glowing overlay (scaled in
          // place, pointer-events:none) sits on top and never steals the hover
          onMouseEnter={() => onHover(sh.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect?.(sh.id)}
        />
      ))}
    </g>
  );
});

export function OntarioMap({
  features,
  colorFor,
  labelHtmlFor,
  selectedId,
  theme,
  onSelect,
  introKey = 0,
  dim = false,
  highlightIds,
  spotlightId = null,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [vb, setVb] = useState<ViewBox>(DEFAULT_VIEW);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // pan bookkeeping lives in a ref so the window listeners never go stale
  const pan = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });
  const suppressClick = useRef(false);

  // Planar projection (equirectangular + latitude aspect correction), computed
  // directly to avoid d3-geo's spherical polygon-winding sensitivity (mapshaper
  // output is wound opposite to d3's convention, which blows up the projection).
  const shapes = useMemo<Shape[]>(() => {
    const pad = 12;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const eachPt = (f: GlobeFeature, cb: (lng: number, lat: number) => void) => {
      const g = f.geometry as { type: string; coordinates: unknown };
      const rings: number[][][] =
        g.type === "Polygon"
          ? (g.coordinates as number[][][])
          : (g.coordinates as number[][][][]).flat();
      for (const ring of rings) for (const [lng, lat] of ring) cb(lng, lat);
    };
    for (const f of features) eachPt(f, (lng, lat) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * kx, h = maxLat - minLat;
    const scale = Math.min((VBW - 2 * pad) / w, (VBH - 2 * pad) / h);
    const offX = (VBW - w * scale) / 2, offY = (VBH - h * scale) / 2;
    const px = (lng: number) => offX + (lng * kx - minLng * kx) * scale;
    const py = (lat: number) => offY + (maxLat - lat) * scale; // north up

    const ringToPath = (ring: number[][]) => {
      let d = "";
      for (let i = 0; i < ring.length; i++) {
        d += (i ? "L" : "M") + px(ring[i][0]).toFixed(1) + "," + py(ring[i][1]).toFixed(1);
      }
      return d + "Z";
    };
    const out: Shape[] = [];
    for (const f of features) {
      const g = f.geometry as { type: string; coordinates: unknown };
      const polys: number[][][][] =
        g.type === "Polygon"
          ? [g.coordinates as number[][][]]
          : (g.coordinates as number[][][][]);
      let d = "";
      for (const poly of polys) for (const ring of poly) d += ringToPath(ring);
      if (d) out.push({ id: f.properties.id, d });
    }
    return out;
  }, [features]);

  const shapeById = useMemo(() => {
    const m: Record<string, Shape> = {};
    for (const sh of shapes) m[sh.id] = sh;
    return m;
  }, [shapes]);

  // color map recomputed when settings change (colorFor identity), stable on hover
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const sh of shapes) m[sh.id] = colorFor(sh.id);
    return m;
  }, [shapes, colorFor]);

  const onHover = useCallback((id: string | null) => setHoveredId(id), []);
  const stroke = theme === "dark" ? "rgba(232,238,244,0.18)" : "rgba(24,34,30,0.22)";

  // a pan-drag must not also select the township it ended on
  const handleSelect = useCallback(
    (id: string) => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      onSelect?.(id);
    },
    [onSelect],
  );

  function onMove(e: React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  // reset the view whenever the intro replays
  useEffect(() => { setVb(DEFAULT_VIEW); }, [introKey]);

  // Wheel-zoom (toward cursor) + drag-pan. Listeners are bound to the *wrap*
  // (which never remounts) — the <svg> remounts on introKey, so binding there
  // would leave a dead listener after a replay. CTM is read live from svgRef.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (e: WheelEvent) => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return;
      // Only own the wheel when the cursor is over the rendered map box
      // (the "meet"-letterboxed Ontario area). Over the empty side margins we
      // let the gesture fall through so the page can scroll.
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / VBW, rect.height / VBH);
      const cw = VBW * fit, ch = VBH * fit;
      const bx = rect.left + (rect.width - cw) / 2, by = rect.top + (rect.height - ch) / 2;
      if (e.clientX < bx || e.clientX > bx + cw || e.clientY < by || e.clientY > by + ch) return;
      e.preventDefault(); // over the map → we own this zoom gesture
      const p = svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      const u = p.matrixTransform(ctm.inverse()); // cursor in user space
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setVb((prev) => {
        const nw = Math.max(MIN_W, Math.min(VBW, prev.w / factor));
        const k = nw / prev.w;
        return clampVb({ x: u.x - (u.x - prev.x) * k, y: u.y - (u.y - prev.y) * k, w: nw, h: nw * ASPECT });
      });
    };

    const onDown = (e: MouseEvent) => {
      pan.current = { active: true, moved: false, lastX: e.clientX, lastY: e.clientY };
    };
    const onWinMove = (e: MouseEvent) => {
      const p = pan.current;
      if (!p.active) return;
      const dx = e.clientX - p.lastX, dy = e.clientY - p.lastY;
      if (!p.moved && Math.abs(dx) + Math.abs(dy) > 3) { p.moved = true; setDragging(true); }
      p.lastX = e.clientX; p.lastY = e.clientY;
      const ctm = svgRef.current?.getScreenCTM();
      if (!ctm) return;
      // CTM.a / CTM.d convert screen px → user units (uniform under "meet")
      setVb((prev) => clampVb({ ...prev, x: prev.x - dx / ctm.a, y: prev.y - dy / ctm.d }));
    };
    const onWinUp = () => {
      const p = pan.current;
      if (p.active && p.moved) suppressClick.current = true; // veto the trailing click
      p.active = false;
      setDragging(false);
    };

    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
    return () => {
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
    };
  }, []);

  const zoomCentered = (factor: number) =>
    setVb((prev) => {
      const nw = Math.max(MIN_W, Math.min(VBW, prev.w / factor));
      const nh = nw * ASPECT;
      const cx = prev.x + prev.w / 2, cy = prev.y + prev.h / 2;
      return clampVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
    });

  const hovered = hoveredId ? shapeById[hoveredId] : null;
  const selected = selectedId && selectedId !== hoveredId ? shapeById[selectedId] : null;

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      onMouseMove={onMove}
      onMouseLeave={() => { setHoveredId(null); setTip(null); }}
    >
      <svg
        key={introKey}
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full animate-fade-up"
        style={{ overflow: "visible" }}
      >
        {/* base map — darkened as a group in compare mode so the highlight overlays
            below (siblings, drawn after) stay at full brightness */}
        <g style={{ filter: dim ? "brightness(0.4) saturate(0.55)" : "none", transition: "filter .35s ease" }}>
          <BaseLayer shapes={shapes} colorMap={colorMap} stroke={stroke} onHover={onHover} onSelect={handleSelect} />
        </g>
        {/* float overlay — lifted, glowing copies on top (the accent "selected" glow is
            suppressed while comparing so it doesn't compete with the compare highlights) */}
        {!dim && selected && (
          <path d={selected.d} className="twp-selected" fill={colorMap[selected.id]}
            stroke="hsl(var(--accent))" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )}
        {hovered && (
          <path d={hovered.d} className="twp-float" fill={colorMap[hovered.id]}
            stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {/* compare highlights — full-colour copies of the selected regions on top of the
            dimmed base. They fade in on selection and fade out when a dashboard box is
            spotlighted. pointer-events:none lets a click fall through to the base path
            underneath, so re-clicking a lit region de-selects it. */}
        {dim && highlightIds?.map((id) =>
          shapeById[id] ? (
            <path
              key={id}
              d={shapeById[id].d}
              className={`compare-overlay${spotlightId && spotlightId !== id ? " is-muted" : ""}`}
              fill={colorMap[id]}
              stroke="hsl(var(--accent))"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null,
        )}
      </svg>

      {/* zoom controls (bottom-left of the map) — centered under the control rail above (48px buttons at left-4 → center 40px; these 36px buttons need left 22px) */}
      <div className="absolute bottom-3 left-[22px] z-10 flex flex-col gap-1.5">
        {[
          { label: "Zoom in", glyph: "+", on: () => zoomCentered(1.4) },
          { label: "Zoom out", glyph: "−", on: () => zoomCentered(1 / 1.4) },
          { label: "Reset view", glyph: "⟲", on: () => setVb(FULL) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            onClick={b.on}
            className="ring-brass grid h-9 w-9 place-items-center rounded-full bg-surface/85 text-lg leading-none text-text-muted shadow-brass backdrop-blur-md transition-colors hover:text-primary"
          >
            {b.glyph}
          </button>
        ))}
      </div>

      {hovered && tip && !dragging && (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px]"
          style={{ left: Math.min(tip.x + 16, (wrapRef.current?.clientWidth ?? 9999) - 250), top: tip.y + 16 }}
          dangerouslySetInnerHTML={{ __html: labelHtmlFor(hovered.id) }}
        />
      )}
    </div>
  );
}
