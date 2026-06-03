import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1320px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-figtree)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-figtree)", "ui-sans-serif", "system-ui"], // aliased to Figtree
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "title-1": ["3rem", { lineHeight: "1.1", fontWeight: "700" }], // 48px
        "title-2": ["2.25rem", { lineHeight: "1.15", fontWeight: "700" }], // 36px
        "title-3": ["1.875rem", { lineHeight: "1.2", fontWeight: "700" }], // 30px
      },
      colors: {
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        "surface-alt": "hsl(var(--surface-alt))",
        border: "hsl(var(--border))",
        text: "hsl(var(--text))",
        "text-muted": "hsl(var(--text-muted))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: "hsl(var(--accent))",
        tertiary: "hsl(var(--tertiary))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        // shadcn compat
        background: "hsl(var(--bg))",
        foreground: "hsl(var(--text))",
        card: { DEFAULT: "hsl(var(--surface))", foreground: "hsl(var(--text))" },
        popover: { DEFAULT: "hsl(var(--surface))", foreground: "hsl(var(--text))" },
        muted: { DEFAULT: "hsl(var(--surface-alt))", foreground: "hsl(var(--text-muted))" },
        secondary: { DEFAULT: "hsl(var(--surface-alt))", foreground: "hsl(var(--text))" },
        destructive: { DEFAULT: "hsl(var(--danger))", foreground: "hsl(var(--primary-foreground))" },
        input: "hsl(var(--border))",
        ring: "hsl(var(--primary))",
      },
      borderRadius: { lg: "14px", md: "10px", sm: "6px" },
      boxShadow: {
        // Tri-tone glows (lapis → rose → jade) via --glow-* vars.
        brass:
          "0 8px 24px -12px rgb(var(--glow-a) / 0.5), 0 10px 28px -12px rgb(var(--glow-b) / 0.42), 0 12px 30px -12px rgb(var(--glow-c) / 0.42)",
        halo:
          "0 0 0 1px hsl(var(--border)), 0 10px 26px -14px rgb(var(--glow-a) / 0.5), 0 14px 30px -16px rgb(var(--glow-b) / 0.42), 0 18px 34px -18px rgb(var(--glow-c) / 0.42)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%": { transform: "scale(.9)", opacity: ".8" },
          "100%": { transform: "scale(1.25)", opacity: "0" },
        },
        drift: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(20px,-10px)" },
        },
      },
      animation: {
        "fade-up": "fade-up .4s ease-out both",
        "pulse-soft": "pulse-soft 2.4s ease-out infinite",
        drift: "drift 40s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
