# Deploying to Railway

This is a self-contained **Next.js** app — UI **and** API (`/api/*`) in one service.
There is **no separate backend** and **no database**: data is synthetic and generated
in-memory; share-links/annotations are written to JSON files (ephemeral on Railway).

## What you need on Railway

| Resource | Needed? | Why |
| --- | --- | --- |
| **Web service (this repo)** | ✅ Yes | Runs `next build` → `next start`; serves UI + `/api/*` |
| **Backend service** | ❌ No | The Python `backend/` is replaced by Next API routes |
| **Database / Postgres** | ❌ No | No DB; data is synthetic, persistence is ephemeral JSON |
| **Volume** | ⚪ Optional | Only if you later want share-links/notes to survive redeploys — mount it and set `DATA_DIR` to the mount path |

## Steps

1. **Push this repo to GitHub** (see the local-git note your assistant left).
2. On **railway.app** → *New Project* → *Deploy from GitHub repo* → pick this repo/branch.
3. Railway auto-detects Next.js (Nixpacks). No root-directory change is needed —
   this repo *is* the app root.
4. It builds (`npm ci && npm run build`) and starts (`npm run start`). Next binds
   Railway's injected `$PORT` automatically.
5. Open the generated `*.up.railway.app` URL.

### Environment variables
None required. Optional:
- `DATA_DIR` — absolute path to a mounted volume, to persist share-links/annotations.

### Node version
Pinned to Node 20 via `.nvmrc` (Next 16 / React 19 require Node ≥ 20.9).
