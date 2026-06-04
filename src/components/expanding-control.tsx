"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  children?: ReactNode;
  /** Which side the panel opens toward. */
  side?: "right" | "left" | "bottom";
  /** Small status string shown under the label (e.g. "6 active"). */
  badge?: string;
  /** Extra classes for the root (e.g. pointer-events-auto on a no-events rail). */
  className?: string;
  /** Override the expanded panel width (defaults to w-[280px]). */
  panelClassName?: string;
  /** Inline style for the expanded panel — e.g. a fixed position/size box. */
  panelStyle?: CSSProperties;
}

/* Default state: a circle button with an icon. On hover (or click-to-pin) it
   expands into a labeled panel revealing its controls. Lives on the globe so
   the research team never scrolls a sidebar. */
export function ExpandingControl({ icon, label, children, side = "right", badge, className = "", panelClassName = "w-[280px]", panelStyle }: Props) {
  const [pinned, setPinned] = useState(false);

  return (
    <div className={`group relative flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        aria-expanded={pinned}
        aria-label={label}
        className={`ring-brass grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface/90 text-text-muted shadow-brass backdrop-blur-md transition-all hover:text-primary ${
          pinned ? "text-primary" : ""
        }`}
      >
        {icon}
      </button>

      <div
        style={panelStyle}
        className={`pointer-events-none z-20 scale-95 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 ${
          pinned ? "pointer-events-auto scale-100 opacity-100" : ""
        } ${
          panelStyle
            ? "origin-top-left"
            : `absolute ${panelClassName} ${
                side === "right"
                  ? "left-14 top-0 origin-top-left"
                  : side === "left"
                    ? "right-14 top-0 origin-top-right"
                    : "left-0 top-14 origin-top"
              }`
        }`}
      >
        <div className="brass-halo flex h-full flex-col overflow-auto rounded-lg bg-surface/95 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {label}
            </span>
            {badge ? <span className="font-mono text-[11px] text-primary">{badge}</span> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
