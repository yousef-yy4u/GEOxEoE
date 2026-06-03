# EOE × Environment — Ontario Atlas

A research tool exploring **township-level** associations between eosinophilic
esophagitis (EoE) incidence and environmental exposures across **Ontario**,
rendered on an interactive **3D globe**. Built with Next.js (App Router) +
TypeScript + Tailwind v3, themed with the **Malachite & Ink** design system
(light "Atrium" default, dark "Obsidian").

**All data is synthetic** — a faithful, declared fixture for building and
demonstrating the analysis machinery, not real Ontario epidemiology. Do not cite.

## Run

```powershell
cd frontend
npm install
npm run dev      # http://localhost:3000  (or: npm run build && npm start)
```

One process serves the UI and the API — no separate backend to start.

## Architecture

- **Frontend** — `src/app/page.tsx` → `src/components/atlas.tsx` orchestrates a
  full-screen `globe-atlas.tsx` (globe.gl / three.js) with on-globe expanding
  circle controls, a centered 80% summary, and 3D tilt cards (`tilt-card.tsx`).
- **API routes** (`src/app/api/*`) — self-contained, no external server:
  - `panel` — deterministic synthetic data for 577 Ontario census subdivisions.
  - `stats` — scipy-validated Pearson / OLS / partial correlation.
  - `views` + `views/[id]` — shareable saved views (short-id, file persistence).
  - `annotations` — team notes pinned to a township.
- **Data engine** — `src/lib/synthetic.ts` (seeded, 3-yr exposure→dx lag fixture,
  diagnostic-access confounder, zero-weight nulls), `src/lib/stats.ts`
  (ported from the scipy-validated JS), `src/lib/analysis.ts` (live compute).
- **Geography** — `public/data/ontario-townships.geojson`: Ontario CSDs from the
  Statistics Canada 2021 cartographic boundary file (`PRUID=35`), reprojected to
  WGS84 and simplified via mapshaper (see `../data-pipeline/`).

## Features (all 12, ported + globe)

Real Pearson r/p/95% CI · scatter + OLS · normalize by diagnostic access ·
partial correlation · exposure lag + pooled lag-profile (recovers the built-in
3-yr lag) · weak/null flagging · shareable views · annotations · CSV/PNG/methods
export · grounded summary (cites stats, no causation) · provenance · time window.

## Tests

```powershell
npx tsx scripts/verify-data.mts   # seed/null-stability + lag-fixture check
node scripts/smoke-next.mjs        # headless: globe renders, no console errors, theme toggle
```

## Honesty notes

- Synthetic fixture; the methods-note export states the built-in 3-yr lag.
- The lag *profile* uses a pooled state-year estimator (point estimates, no
  p-value — pooled obs are autocorrelated); the map correlations are the
  conservative cross-sectional estimate.
- Cohort sliders are flagged UI placeholders — not wired to microdata.
- EoE diagnosis is access-confounded; the normalize toggle demonstrates it.
