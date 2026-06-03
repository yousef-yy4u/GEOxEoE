"use client";

import { useEffect, useRef } from "react";

export interface GlobeFeature {
  type: "Feature";
  properties: { id: string; name: string; csdtype?: string };
  geometry: unknown;
}

interface Props {
  features: GlobeFeature[];
  colorFor: (id: string) => string;
  labelFor: (id: string) => string;
  selectedId: string | null;
  theme: "light" | "dark";
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  /** Bumped to re-trigger the spin → Canada → Ontario intro. */
  introKey?: number;
}

const ONTARIO_POV = { lat: 47.6, lng: -83.5, altitude: 0.95 };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function GlobeAtlas({
  features,
  colorFor,
  labelFor,
  selectedId,
  theme,
  onHover,
  onSelect,
  introKey = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<any>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  const colorForRef = useRef(colorFor);
  const labelForRef = useRef(labelFor);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // keep latest accessor closures without rebuilding the globe
  colorForRef.current = colorFor;
  labelForRef.current = labelFor;
  selectedRef.current = selectedId;

  // ---- build once ----
  useEffect(() => {
    let disposed = false;
    let resizeObs: ResizeObserver | null = null;

    (async () => {
      const Globe = (await import("globe.gl")).default;
      if (disposed || !containerRef.current) return;

      const el = containerRef.current;
      const g = (Globe as any)()(el)
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor(theme === "dark" ? "#27E0C6" : "#80D1C7")
        .atmosphereAltitude(0.18)
        .globeImageUrl(
          theme === "dark"
            ? "https://unpkg.com/three-globe/example/img/earth-dark.jpg"
            : "https://unpkg.com/three-globe/example/img/earth-day.jpg",
        )
        .polygonsData(features as any)
        .polygonGeoJsonGeometry((f: any) => f.geometry)
        .polygonsTransitionDuration(300)
        .polygonCapColor((f: any) => colorForRef.current(f.properties.id))
        .polygonSideColor(() => "rgba(127,105,174,0.12)")
        .polygonStrokeColor(() =>
          theme === "dark" ? "rgba(232,238,244,0.25)" : "rgba(24,34,30,0.25)",
        )
        .polygonAltitude((f: any) => {
          const id = f.properties.id;
          if (id === selectedRef.current) return 0.07;
          if (id === hoveredRef.current) return 0.05;
          return 0.012;
        })
        .polygonLabel((f: any) => labelForRef.current(f.properties.id))
        .onPolygonHover((poly: any) => {
          const id = poly ? poly.properties.id : null;
          hoveredRef.current = id;
          el.style.cursor = id ? "pointer" : "grab";
          g.polygonAltitude(g.polygonAltitude());
          onHover?.(id);
        })
        .onPolygonClick((poly: any) => {
          if (poly) onSelect?.(poly.properties.id);
        });

      g.width(el.clientWidth).height(el.clientHeight);
      globeRef.current = g;
      (window as any).__globe = g; // debug handle

      // gentle auto-rotation
      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.4;
      controls.enableZoom = true;

      resizeObs = new ResizeObserver(() => {
        if (globeRef.current) globeRef.current.width(el.clientWidth).height(el.clientHeight);
      });
      resizeObs.observe(el);
    })();

    return () => {
      disposed = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      resizeObs?.disconnect();
      if (globeRef.current?._destructor) globeRef.current._destructor();
      if (containerRef.current) containerRef.current.innerHTML = "";
      globeRef.current = null;
    };
    // build once; theme handled in its own effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- intro: spin → Canada → Ontario ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    timers.current.forEach(clearTimeout);
    timers.current = [];

    g.pointOfView({ lat: 18, lng: -40, altitude: 2.6 }, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 6;

    timers.current.push(
      setTimeout(() => g.pointOfView({ lat: 56, lng: -96, altitude: 1.3 }, 2400), 900),
    );
    timers.current.push(
      setTimeout(() => {
        g.pointOfView(ONTARIO_POV, 2600);
        controls.autoRotateSpeed = 0.35;
      }, 3500),
    );
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [introKey]);

  // ---- recolor / reselect without rebuild ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.polygonCapColor((f: any) => colorForRef.current(f.properties.id));
    g.polygonLabel((f: any) => labelForRef.current(f.properties.id));
    g.polygonAltitude(g.polygonAltitude());
  });

  // ---- theme swap (globe texture + atmosphere) ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.globeImageUrl(
      theme === "dark"
        ? "https://unpkg.com/three-globe/example/img/earth-dark.jpg"
        : "https://unpkg.com/three-globe/example/img/earth-day.jpg",
    ).atmosphereColor(theme === "dark" ? "#27E0C6" : "#80D1C7");
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
