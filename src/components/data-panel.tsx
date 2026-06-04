"use client";

import { useRef, useState } from "react";

export interface DataFactor {
  id: string;
  name: string;
  source: string;
  status: string;
}

interface Props {
  factors: DataFactor[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpload: (file: File) => void;
  onApi: (url: string, key: string) => void;
  report: string | null;
}

/* Tabbed data manager that lives inside the (pinned) Data provenance control.
   Tab 1 lists every dataset — rename or remove. Tab 2 adds your own data by file
   or API. Note: this is prototype state — datasets live for the session only. */
export function DataPanel({ factors, onRename, onDelete, onUpload, onApi, report }: Props) {
  const [tab, setTab] = useState<"sources" | "add">("sources");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const commit = () => { if (editId && draft.trim()) onRename(editId, draft.trim()); setEditId(null); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-md bg-surface-alt p-1 text-[11px]">
        {(["sources", "add"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`flex-1 rounded px-2 py-1.5 font-medium transition-colors ${tab === t ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"}`}>
            {t === "sources" ? "Datasets" : "Add data"}
          </button>
        ))}
      </div>

      {tab === "sources" ? (
        <div className="no-scrollbar flex max-h-[260px] flex-col gap-1.5 overflow-auto">
          {factors.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-[11.5px] last:border-0">
              <span className="min-w-0 flex-1">
                {editId === f.id ? (
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditId(null); }}
                    onBlur={commit}
                    className="ring-brass w-full rounded bg-surface-alt px-1.5 py-0.5 text-text" />
                ) : (
                  <>
                    <span className="block truncate text-text">{f.name}</span>
                    <span className="block truncate text-text-muted">{f.source}</span>
                  </>
                )}
              </span>
              <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] text-accent">{f.status}</span>
              <button type="button" aria-label="Rename" title="Rename"
                onClick={() => { setEditId(f.id); setDraft(f.name); }}
                className="text-text-muted transition-colors hover:text-primary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button type="button" aria-label="Delete" title="Delete"
                onClick={() => onDelete(f.id)}
                className="text-text-muted transition-colors hover:text-danger">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-[11.5px]">
          <div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="ring-brass hover-gradient w-full rounded-md bg-surface-alt px-3 py-2.5 text-left text-text">
              ⬆ Upload a file (CSV / JSON)
            </button>
            <p className="mt-1.5 leading-snug text-text-muted">
              Needs a <span className="text-text">township_id</span> (CSD code, e.g. <span className="font-mono">3501005</span>)
              or <span className="text-text">name</span> column, plus a value (and optional year).
            </p>
          </div>

          <div className="border-t border-border/60 pt-3">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/exposures.json"
              className="ring-brass mb-1.5 w-full rounded-md bg-surface-alt px-2.5 py-2 text-text placeholder:text-text-muted" />
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key (optional)"
              className="ring-brass mb-1.5 w-full rounded-md bg-surface-alt px-2.5 py-2 text-text placeholder:text-text-muted" />
            <button type="button" disabled={!url.trim()} onClick={() => onApi(url.trim(), key.trim())}
              className="ring-brass w-full rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40">
              Fetch from API
            </button>
            <p className="mt-1.5 leading-snug text-text-muted">
              The endpoint must return data in the schema above. Arbitrary third-party APIs need a per-source adapter.
            </p>
          </div>

          {report && <p className="rounded-md bg-accent/10 px-2.5 py-2 leading-snug text-text">{report}</p>}
        </div>
      )}
    </div>
  );
}
