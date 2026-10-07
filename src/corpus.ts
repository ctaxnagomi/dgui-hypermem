// DGUI-HyperMem embed-corpus ingest (RULESET_TRAIN_CORPUS.md §3).
//
// Every day the production Worker ingests eligible memories from D1 into the
// HuggingFace embed corpus ctaxnagomi/dgui-hypermem-embed-corpus:
//   1. select: status='active' AND trained-scope opted-in AND tag_id NOT NULL
//   2. gate:   blocked-content patterns (fail-closed) + W1-W3 secret redaction
//   3. embed:  reuse the live 768-d Vectorize vector when present, else re-embed
//              via @cf/baai/bge-base-en-v1.5 at ingest time
//   4. dedup:  doc_id upsert (never duplicate a document)
//   5. write:  single writer only (the production Worker, same rule as Train)
//
// Single-writer enforcement mirrors Train (src/dataset.ts): if HF_TOKEN is not
// set the ingest refuses to run, and only the Worker's cron/tool paths call it.
// The corpus is a sink -- nothing is ever read back from HF into the service.

import type { Env } from "./types";
import { redactSecrets, summariseFindings } from "./redact";
import { findBlockedPattern } from "./store";
import { now, tagIdFor } from "./util";

const HF_API = "https://huggingface.co";
const DEFAULT_REPO = "ctaxnagomi/dgui-hypermem-embed-corpus";
const DEFAULT_EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBEDDING_DIM = 768;
const LIVE_LOOKUP_CHUNK = 100;

export function embedCorpusRepo(env: Env): string {
  return env.HF_EMBED_DATASET || DEFAULT_REPO;
}

// ---------------------------------------------------------------- row shape

export interface EmbedCorpusRow {
  doc_id: string;
  text: string;
  metadata: {
    tag_id: string;
    scope: string;
    memory_type: string | null;
    source: string | null;
    created_at: number;
    status: string;
  };
  embedding?: number[];
}

/** A memory as the ingest selects it from D1 (id, content, metadata + derived tag). */
export type CorpusCandidate = {
  id: string;
  scope: string;
  content: string;
  memory_type: string | null;
  source: string | null;
  created_at: number;
  status: string;
  tag_id: string;
};

/**
 * Redact the memory content for publication (W1-W3). Returns the scrubbed text
 * and whether redaction actually changed anything. A changed text means the
 * live Vectorize vector (embedded from the raw content at add time) no longer
 * describes the published text, so it must be discarded and re-embedded.
 */
export function scrubMemoryText(content: string): { text: string; changed: boolean; findings: string[] } {
  const r = redactSecrets(content);
  return { text: r.text, changed: r.findings.length > 0, findings: r.findings };
}

export function buildCorpusRow(
  mem: CorpusCandidate,
  opts: { text: string; embedding?: number[] },
): EmbedCorpusRow {
  return {
    doc_id: `mem_${mem.id}`,
    text: opts.text,
    metadata: {
      tag_id: mem.tag_id,
      scope: mem.scope,
      memory_type: mem.memory_type,
      source: mem.source,
      created_at: mem.created_at,
      status: mem.status,
    },
    ...(opts.embedding ? { embedding: opts.embedding } : {}),
  };
}

// ---------------------------------------------------------------- dedup

/**
 * Upsert rows into the existing corpus (doc_id-keyed). A document already
 * present with identical text is skipped; one whose text changed (memory
 * updated) is replaced; a new doc_id is appended. A doc_id can therefore never
 * appear twice in the output.
 */
export function mergeIntoCorpus(
  existing: string | null,
  rows: EmbedCorpusRow[],
): { content: string; added: number; skipped: number; final: EmbedCorpusRow[] } {
  const byDoc = new Map<string, EmbedCorpusRow>();
  let skipped = 0;
  if (existing) {
    for (const line of existing.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as EmbedCorpusRow;
        if (r.doc_id) byDoc.set(r.doc_id, r);
      } catch {
        /* skip malformed line */
      }
    }
  }
  let added = 0;
  for (const row of rows) {
    const prev = byDoc.get(row.doc_id);
    if (prev && prev.text === row.text) {
      skipped++;
      continue;
    }
    byDoc.set(row.doc_id, row);
    added++;
  }
  const final = [...byDoc.values()];
  return { content: final.map((r) => JSON.stringify(r)).join("\n") + (final.length ? "\n" : ""), added, skipped, final };
}

// ---------------------------------------------------------------- metadata

export function computeEmbedMeta(
  rows: EmbedCorpusRow[],
  opts: { embeddingModel: string; batchId: number },
): Record<string, unknown> {
  const byTag: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let first = Infinity;
  let last = -Infinity;
  let dim = 0;
  for (const r of rows) {
    byTag[r.metadata.tag_id] = (byTag[r.metadata.tag_id] ?? 0) + 1;
    const t = r.metadata.memory_type ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
    if (r.metadata.created_at < first) first = r.metadata.created_at;
    if (r.metadata.created_at > last) last = r.metadata.created_at;
    if (r.embedding?.length) dim = Math.max(dim, r.embedding.length);
  }
  return {
    name: "dgui-hypermem-embed-corpus",
    updated_from: "dgui-hmem.deckergui.my",
    rows_total: rows.length,
    by_tag_id: byTag,
    by_memory_type: byType,
    embedding_dim: dim || EMBEDDING_DIM,
    embedding_model: opts.embeddingModel,
    first_row_at: Number.isFinite(first) ? first : null,
    last_row_at: Number.isFinite(last) ? last : null,
    last_ingest_at: opts.batchId,
  };
}

// ---------------------------------------------------------------- HF plumbing
// Self-contained mirror of dataset.ts's upload client, bound to the embed repo
// instead of the Train repo. Same single-writer rule as Train.

function base64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

interface UploadFile {
  path: string;
  content: string;
}

async function readFile(env: Env, path: string): Promise<string | null> {
  const res = await fetch(`${HF_API}/datasets/${embedCorpusRepo(env)}/resolve/main/${path}`, {
    headers: { authorization: `Bearer ${env.HF_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read ${path}: HTTP ${res.status}`);
  return await res.text();
}

async function ensureRepo(env: Env): Promise<void> {
  const repo = embedCorpusRepo(env);
  const exists = await fetch(`${HF_API}/datasets/${repo}`, {
    headers: { authorization: `Bearer ${env.HF_TOKEN}` },
  });
  if (exists.ok) return;
  const res = await fetch(`${HF_API}/api/repos/create`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` },
    body: JSON.stringify({ name: repo.split("/")[1], type: "dataset", private: false }),
  });
  if (!res.ok) throw new Error(`create repo: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function createCommit(env: Env, files: UploadFile[], summary: string): Promise<Response> {
  const lines = [JSON.stringify({ key: "header", value: { summary, description: "" } })];
  for (const f of files) {
    lines.push(JSON.stringify({ key: "file", value: { path: f.path, encoding: "base64", content: base64Utf8(f.content) } }));
  }
  return fetch(`${HF_API}/api/datasets/${embedCorpusRepo(env)}/commit/main`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.HF_TOKEN}`, "content-type": "application/x-ndjson" },
    body: lines.join("\n") + "\n",
  });
}

const README = `---
license: mit
tags:
  - dgui-hypermem
  - retriever
  - embedding
task_categories:
  - sentence-similarity
---

# DGUI-HyperMem embed corpus

Memory documents from **DGUI-HyperMem (DeckerGUI HyperMemory)** — the self-hosted
memory MCP server. One row per memory, in embedding-model format
(BEIR-style corpus), with optional 768-d vectors produced by
\`@cf/baai/bge-base-en-v1.5\`.

# Usage example

\`\`\`python
from datasets import load_dataset

ds = load_dataset("ctaxnagomi/dgui-hypermem-embed-corpus", split="train")
for row in ds:
    print(row["doc_id"], row["text"][:80])
\`\`\`

Each row carries \`doc_id\`, \`text\` (redacted memory content), \`metadata\`
(tag_id, scope, memory_type, source, created_at, status) and an optional
\`embedding\` vector. Data is a sink: rows are appended daily by the service and
never read back.

## Credits

DGUI-HyperMem is a **DeckerGUI** project.

| Who | Contribution | Link |
|-----|--------------|------|
| **TypeSafe AI** | Jev / System One, the primitives the JEV layer is built on | <https://typesafe.ai> |
| **DeckerGUI** | Design, implementation and operation | <https://deckergui.my> |
| **CTECX** | Knowledge / corpus partner | |
`;

// ---------------------------------------------------------------- embeddings

/** Live vectors by memory id (best effort). Missing ids are absent from the map. */
async function liveVectorsFor(env: Env, ids: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += LIVE_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + LIVE_LOOKUP_CHUNK);
    try {
      const got = (await env.VECTORIZE.getByIds(chunk)) as { matches?: { id: string; values?: number[] }[] };
      for (const m of got?.matches ?? []) {
        if (m.values && m.values.length === EMBEDDING_DIM) out.set(m.id, m.values);
      }
    } catch (err) {
      console.error(`embed ingest: live vector lookup failed for ${chunk.length} ids:`, String(err));
    }
  }
  return out;
}

/** Re-embed texts at ingest time via the configured embedding model. */
async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const out: unknown = await (env.AI as any).run(model, { text: texts });
  const data = (out as { data?: unknown })?.data;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error(`embedding model ${model} returned an unexpected shape`);
  }
  return data as number[][];
}

// ---------------------------------------------------------------- ingest

export interface EmbedFlushResult {
  dataset: string;
  batch: number;
  uploaded_docs: number;
  existing_docs: number;
  dropped: number;
  total_docs: number;
  commit_ok: boolean;
  error?: string;
}

/**
 * One daily ingest pass. Selects eligible active memories (trained-scope opted
 * in, tag_id NOT NULL), scrubs them at the gate, resolves embeddings (live
 * vector reuse when the published text is unchanged, else re-embed), upserts
 * into corpus.jsonl and rewrites metadata.json + README.md.
 */
export async function ingestEmbedCorpus(env: Env, limit = 200): Promise<EmbedFlushResult> {
  const repo = embedCorpusRepo(env);
  if (!env.HF_TOKEN) {
    return { dataset: repo, batch: 0, uploaded_docs: 0, existing_docs: 0, dropped: 0, total_docs: 0, commit_ok: false, error: "HF_TOKEN not set" };
  }
  const batchId = now();

  // --- 1. select: active memories with a derived tag_id --------------------
  // tag_id lives on the analyze row in jev_examples.payload (json_extract),
  // keyed by memory_id. The latest analyze row per memory wins.
  const { results: candidates } = await env.DB.prepare(
    `SELECT m.id, m.scope, m.content, m.memory_type, m.source, m.created_at, m.status,
            t.tag_id
     FROM memories m
     JOIN (
       SELECT memory_id, tag_id FROM (
         SELECT json_extract(payload, '$.memory_id') AS memory_id,
                json_extract(payload, '$.tag_id') AS tag_id,
                ROW_NUMBER() OVER (
                  PARTITION BY json_extract(payload, '$.memory_id')
                  ORDER BY created_at DESC
                ) AS rn
         FROM jev_examples
         WHERE use_case = 'analyze' AND json_extract(payload, '$.tag_id') IS NOT NULL
       ) WHERE rn = 1
     ) t ON t.memory_id = m.id
     WHERE m.status = 'active'
     ORDER BY m.created_at ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all<CorpusCandidate>();
  const selected = candidates || [];

  // --- 1b. trained-scope opt-in: only accounts with train_with_all=1 --------
  const { results: tokens } = await env.DB.prepare(
    `SELECT email FROM tokens WHERE train_with_all = 1 AND status = 'active'`,
  ).all<{ email: string | null }>();
  const eligible = new Set<string>();
  for (const tok of tokens || []) {
    const tag = await tagIdFor(tok.email);
    if (tag) eligible.add(tag);
  }
  const optedIn = selected.filter((c) => eligible.has(c.tag_id));

  if (!optedIn.length) return { dataset: repo, batch: batchId, uploaded_docs: 0, existing_docs: 0, dropped: 0, total_docs: 0, commit_ok: true };

  // --- 2. gate + build rows -------------------------------------------------
  // Fail-closed: a blocked-content hit drops the row entirely (never reaches
  // HF). W1-W3 secrets are redacted in the published text. A redaction change
  // invalidates the live vector, so those rows re-embed below.
  const work: { mem: CorpusCandidate; row: EmbedCorpusRow; liveId: string | null }[] = [];
  let dropped = 0;
  for (const c of optedIn) {
    if (findBlockedPattern(c.content)) {
      dropped++;
      console.warn(`embed ingest: dropped ${c.id} at the blocked-content gate (fail-closed)`);
      continue;
    }
    const { text, changed, findings } = scrubMemoryText(c.content);
    if (changed) {
      console.warn(`embed ingest: redacted [${summariseFindings(findings)}] from ${c.id}`);
    }
    work.push({ mem: c, row: buildCorpusRow(c, { text }), liveId: changed ? null : c.id });
  }

  // --- 3. embeddings ---------------------------------------------------------
  const live = await liveVectorsFor(
    env,
    work.filter((w) => w.liveId).map((w) => w.liveId as string),
  );
  const needEmbed = work.filter((w) => !(w.liveId && live.has(w.liveId)));
  let vecs: number[][] = [];
  if (needEmbed.length) {
    try {
      vecs = await embedTexts(env, needEmbed.map((w) => w.row.text));
    } catch (err) {
      console.error("embed ingest: re-embedding failed, dropping unembedded rows (fail-closed):", String(err));
      vecs = [];
    }
  }

  const finalized: EmbedCorpusRow[] = [];
  let vecIdx = 0;
  let embedDropped = 0;
  for (const w of work) {
    let embedding: number[] | undefined;
    if (w.liveId && live.has(w.liveId)) {
      embedding = live.get(w.liveId) as number[];
    } else if (vecIdx < vecs.length) {
      const v = vecs[vecIdx++];
      if (v && v.length === EMBEDDING_DIM) embedding = v;
    }
    if (!embedding) {
      // Fail-closed: a row with no vector is not well-formed for the corpus, so
      // it is not published this pass and is re-evaluated on the next daily run.
      embedDropped++;
      continue;
    }
    finalized.push(buildCorpusRow(w.mem, { text: w.row.text, embedding }));
  }
  dropped += embedDropped;

  // --- 4/5. dedup (upsert), metadata, single-writer commit ------------------
  const [existingFile, existingMeta, existingReadme] = await Promise.all([
    readFile(env, "corpus.jsonl").catch(() => null),
    readFile(env, "metadata.json").catch(() => null),
    readFile(env, "README.md").catch(() => null),
  ]);
  const merged = mergeIntoCorpus(existingFile, finalized);
  const meta = computeEmbedMeta(merged.final, {
    embeddingModel: env.EMBED_MODEL || DEFAULT_EMBED_MODEL,
    batchId,
  });

  await ensureRepo(env);
  const files: UploadFile[] = [];
  const prevMeta = existingMeta ? (JSON.parse(existingMeta) as Record<string, unknown>) : {};
  files.push({ path: "corpus.jsonl", content: merged.content });
  files.push({ path: "metadata.json", content: JSON.stringify({ ...prevMeta, ...meta }, null, 2) });
  if (!existingReadme) files.push({ path: "README.md", content: README });

  const upload = await createCommit(
    env,
    files,
    `dgui-hypermem embed corpus ingest ${batchId}: +${merged.added} docs (${merged.skipped} unchanged, ${dropped} dropped)`,
  );
  if (!upload.ok) {
    const body = (await upload.text()).slice(0, 300);
    throw new Error(`hf upload: HTTP ${upload.status}: ${body}`);
  }

  return {
    dataset: repo,
    batch: batchId,
    uploaded_docs: merged.added,
    existing_docs: merged.skipped,
    dropped,
    total_docs: merged.final.length,
    commit_ok: true,
  };
}