"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Extra classes for the inner (translated) content wrapper, e.g. flex. */
  contentClassName?: string;
  /** Max tilt in degrees. */
  intensity?: number;
  style?: CSSProperties;
}

/* Animated 3D card: tilts toward the cursor on a perspective plane and lifts a
   cursor-tracking sheen, settling back on leave. Inspired by the 21st.dev
   animated-3d-card. Pair with bg-surface + brass-halo for the atelier feel. */
export function TiltCard({ children, className = "", contentClassName = "", intensity = 7, style }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(1100px) rotateX(${-py * intensity}deg) rotateY(${px * intensity}deg)`;
      el.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
      el.style.setProperty("--my", `${(py + 0.5) * 100}%`);
    });
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.transform = "perspective(1100px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transition: "transform .35s cubic-bezier(.2,.8,.2,1)", transformStyle: "preserve-3d", ...style }}
      className={`brass-halo relative overflow-hidden rounded-lg bg-surface ${className}`}
    >
      {/* cursor-tracking sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [background:radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,50%),hsl(var(--primary)/0.10),transparent_60%)] hover:opacity-100"
      />
      <div style={{ transform: "translateZ(40px)" }} className={`relative h-full ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}
