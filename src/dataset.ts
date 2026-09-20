// DGUI_HYPERMEM-JEV - the training "brain".
//
// Every JEV decision HyperMem makes is recorded as an instruction row
// (state + typed questions + the answers we got) and queued in D1. A scheduled
// cron (and the sync_jev_dataset tool) flushes pending rows into the HuggingFace
// dataset ctaxnagomi/DGUI_HYPERMEM-JEV via the documented upload API:
//   read current train.jsonl -> append new rows -> re-upload (+ metadata.json).
// Over time the dataset grows into a fine-tuning/few-shot corpus for the JEV layer.

import type { Env, MemoryAnalysis } from "./types";
import { analyzeQuestions, rerankQuestions, resolveMode, supersedeQuestions } from "./jev";
import { now, uuid } from "./util";

export type JevUseCase = "analyze" | "rerank" | "supersede";

export interface JevExampleRow {
  id: string;
  use_case: JevUseCase;
  instruct_type: string;
  instruction: string;
  input: string;
  output: string;
  state: unknown;
  questions: Record<string, unknown>;
  answers: unknown;
  provider: string;
  model: string | null;
  scope: string;
  memory_id: string | null;
  source: string | null;
  created_at: number;
}

export const DEFAULT_HF_DATASET = "ctaxnagomi/DGUI_HYPERMEM-JEV";

export function datasetRepo(env: Env): string {
  return (env.HF_DATASET || DEFAULT_HF_DATASET).replace(/^https?:\/\/.*\//, "");
}

// ---------------------------------------------------------------- row builders

export function buildAnalyzeRow(
  env: Env,
  input: { memory_id: string | null; scope: string; content: string; analysis: MemoryAnalysis; source: string | null; created_at?: number },
): JevExampleRow {
  const questions = analyzeQuestions();
  const answers = {
    memory_type: { choice: input.analysis.memory_type, probabilities: input.analysis.type_probabilities },
    durable: { noul: input.analysis.durable },
    salience: { score: input.analysis.salience },
  };
  const state = { memory: input.content };
  return {
    id: uuid(),
    use_case: "analyze",
    instruct_type: "choice_noul_score",
    instruction:
      "Given the state (a memory to store), define and answer the TypeSafe System One questions that classify it: pick its type (choice), judge whether it is durable (noul), and score its salience (score).",
    input: JSON.stringify({ state, questions }),
    output: JSON.stringify(answers),
    state,
    questions,
    answers,
    provider: input.analysis.provider,
    model: input.analysis.provider === "typesafe" ? env.JEV_MODEL || "jev-latest" : env.FALLBACK_MODEL || null,
    scope: input.scope,
    memory_id: input.memory_id,
    source: input.source,
    created_at: input.created_at ?? now(),
  };
}

export function buildRerankRow(
  env: Env,
  input: {
    query: string;
    candidates: { id: string; content: string }[];
    scores: number[];
    provider: string;
    scope: string;
    created_at?: number;
  },
): JevExampleRow {
  const questions = rerankQuestions(input.query, input.candidates);
  const answers: Record<string, { noul: number }> = {};
  input.candidates.forEach((_, i) => {
    answers[`c${i}`] = { noul: input.scores[i] ?? 0 };
  });
  const state = {
    query: input.query,
    candidates: input.candidates.map((c, i) => ({ index: i, memory: c.content })),
  };
  return {
    id: uuid(),
    use_case: "rerank",
    instruct_type: "noul",
    instruction:
      "Given a query and candidate memories, evaluate for every candidate (as a noul question) whether it directly answers the query or is essential context for it.",
    input: JSON.stringify({ state, questions }),
    output: JSON.stringify(answers),
    state,
    questions,
    answers,
    provider: input.provider,
    model: input.provider === "typesafe" ? env.JEV_MODEL || "jev-latest" : env.FALLBACK_MODEL || null,
    scope: input.scope,
    memory_id: null,
    source: null,
    created_at: input.created_at ?? now(),
  };
}

export function buildSupersedeRow(
  env: Env,
  input: { existing: string; incoming: string; probability: number; scope: string; created_at?: number },
): JevExampleRow {
  const questions = supersedeQuestions();
  const state = { existing_memory: input.existing, incoming_memory: input.incoming };
  const answers = { supersedes: { noul: input.probability } };
  const provider = resolveMode(env);
  return {
    id: uuid(),
    use_case: "supersede",
    instruct_type: "noul",
    instruction:
      "Given an existing memory and an incoming memory, decide (as a noul question) whether the incoming one updates, contradicts, or replaces the existing one.",
    input: JSON.stringify({ state, questions }),
    output: JSON.stringify(answers),
    state,
    questions,
    answers,
    provider,
    model: provider === "typesafe" ? env.JEV_MODEL || "jev-latest" : env.FALLBACK_MODEL || null,
    scope: input.scope,
    memory_id: null,
    source: null,
    created_at: input.created_at ?? now(),
  };
}

// ---------------------------------------------------------------- queue

export async function enqueueJevExample(env: Env, row: JevExampleRow): Promise<void> {
  if (row.provider === "off") return;
  try {
    await env.DB.prepare(
      `INSERT INTO jev_examples (id, use_case, payload, status, attempts, error, created_at)
       VALUES (?, ?, ?, 'pending', 0, NULL, ?)`,
    )
      .bind(row.id, row.use_case, JSON.stringify(row), row.created_at)
      .run();
  } catch (err) {
    console.error("enqueueJevExample failed:", String(err));
  }
}

export interface QueueStats {
  pending: number;
  uploaded: number;
  error: number;
  total: number;
  by_use_case: Record<string, number>;
  last_flush_at: number | null;
  next_dataset: string | null;
}

export async function jevQueueStats(env: Env, scope?: string): Promise<QueueStats> {
  const { results } = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM jev_examples GROUP BY status`,
  ).all<{ status: string; n: number }>();
  const byUseCase = await env.DB.prepare(
    `SELECT use_case, COUNT(*) AS n FROM jev_examples GROUP BY use_case`,
  ).all<{ use_case: string; n: number }>();
  const last = await env.DB.prepare(`SELECT MAX(uploaded_at) AS t FROM jev_examples`).first<{ t: number | null }>();
  const statusMap = new Map((results || []).map((r) => [r.status, r.n]));
  const by_use_case: Record<string, number> = {};
  for (const row of byUseCase.results || []) by_use_case[row.use_case] = row.n;
  return {
    pending: statusMap.get("pending") ?? 0,
    uploaded: statusMap.get("uploaded") ?? 0,
    error: statusMap.get("error") ?? 0,
    total: [...statusMap.values()].reduce((a, b) => a + b, 0),
    by_use_case,
    last_flush_at: last?.t ?? null,
    next_dataset: datasetRepo(env),
  };
}

// ---------------------------------------------------------------- HF sync

const HF_API = "https://huggingface.co";
const README = `---
license: mit
tags:
  - dgui-hypermem
  - jev
  - typesafe-system-one
  - choice
  - noul
  - score
task_categories:
  - text-generation
---

# DGUI_HYPERMEM-JEV

The training "brain" for **DGUI-HyperMem (DeckerGUI HyperMemory)** — the self-hosted
memory MCP server. Every JEV reasoning decision the service makes is appended here as a
typed instruction row, so the corpus grows with real usage and can be used to fine-tune or
few-shot the JEV layer later.

# Usage example

\`\`\`python
from datasets import load_dataset

ds = load_dataset("ctaxnagomi/DGUI_HYPERMEM-JEV", split="train")

# Streaming rows as they accumulate:
sv = ds.stream()  # "train" is a live, append-only JSONL file
for row in sv:
    print(row["use_case"], row["instruct_type"], row["provider"])
\`\`\`

Rows have three use cases:

| use_case | instruct_type    | What was recorded |
|----------|------------------|-------------------|
| analyze  | choice_noul_score| Classifying a new memory (type, durability, salience) |
| rerank   | noul             | Re-ranking query candidates during recall |
| supersede| noul             | Contradiction checks that supersede stale memories |

Each row carries \`state\`, \`questions\` (the exact TypeSafe System One block that was sent),
\`answers\` (what came back), plus \`provider\`, \`model\`, \`scope\`, \`memory_id\`, \`source\`,
\`instruction\`, \`input\`, \`output\`, and \`created_at\`.

Appended automatically by the worker (scheduled + manual \`sync_jev_dataset\`).

## Credits

DGUI-HyperMem is a **DeckerGUI** project.

| Who | Contribution | Link |
|-----|--------------|------|
| **TypeSafe AI** | Jev / System One, the Choice / Noul / Score primitives the JEV layer is built on | <https://typesafe.ai> |
| **DeckerGUI** | Design, implementation and operation | <https://deckergui.my> |
| **KrackedDevs** | Community credit and support | |
| **CTECX** | Knowledge / corpus partner | |

> Jev, System One, and the Choice / Noul / Score primitives are TypeSafe AI's and are used
> under their MIT-licensed public documentation at <https://docs.typesafe.ai>.
`;

const META_DEFAULTS = {
  name: "DGUI_HYPERMEM-JEV",
  updated_from: "dgui-hypermem.ctaxnagomi.workers.dev",
  rows_total: 0,
  by_use_case: { analyze: 0, rerank: 0, supersede: 0 },
  providers: {},
  first_row_at: null,
  last_row_at: null,
  last_flush_at: null,
};

async function hfGet(env: Env, path: string): Promise<Response> {
  return fetch(`${HF_API}/datasets/${datasetRepo(env)}/resolve/main/${path}`, {
    headers: { authorization: `Bearer ${env.HF_TOKEN}` },
  });
}

async function readFile(env: Env, path: string): Promise<string | null> {
  const res = await hfGet(env, path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read ${path}: HTTP ${res.status}`);
  return await res.text();
}

interface UploadFile {
  path: string;
  content: string;
}

function base64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// HF's commit API: NDJSON with a header line followed by one base64 file line each.
// (POST /api/datasets/{repo}/commit/{revision})
async function createCommit(env: Env, files: UploadFile[], summary: string): Promise<Response> {
  const lines = [JSON.stringify({ key: "header", value: { summary, description: "" } })];
  for (const f of files) {
    lines.push(JSON.stringify({ key: "file", value: { path: f.path, encoding: "base64", content: base64Utf8(f.content) } }));
  }
  return fetch(`${HF_API}/api/datasets/${datasetRepo(env)}/commit/main`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.HF_TOKEN}`, "content-type": "application/x-ndjson" },
    body: lines.join("\n") + "\n",
  });
}

async function ensureRepo(env: Env): Promise<void> {
  const exists = await fetch(`${HF_API}/api/datasets/${datasetRepo(env)}`, {
    headers: { authorization: `Bearer ${env.HF_TOKEN}` },
  });
  if (exists.ok) return;
  const res = await fetch(`${HF_API}/api/repos/create`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.HF_TOKEN}` },
    body: JSON.stringify({ name: datasetRepo(env).split("/")[1], type: "dataset", private: false }),
  });
  if (!res.ok) throw new Error(`create repo: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export interface FlushResult {
  dataset: string;
  batch: number;
  uploaded_rows: number;
  queue_remaining: number;
  total_rows: number;
  commit_ok: boolean;
  error?: string;
}

export async function flushJevExamples(env: Env, limit = 200): Promise<FlushResult> {
  if (!env.HF_TOKEN) return { dataset: datasetRepo(env), batch: 0, uploaded_rows: 0, queue_remaining: 0, total_rows: 0, commit_ok: false, error: "HF_TOKEN not set" };

  const { results } = await env.DB.prepare(
    `SELECT id, use_case, payload FROM jev_examples
      WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string; use_case: string; payload: string }>();
  const pending = results || [];
  if (!pending.length) {
    const stats = await jevQueueStats(env);
    return { dataset: datasetRepo(env), batch: 0, uploaded_rows: 0, queue_remaining: 0, total_rows: stats.uploaded, commit_ok: true };
  }

  const rows: JevExampleRow[] = pending.map((p) => JSON.parse(p.payload) as JevExampleRow);
  const batchId = now();

  const [existingFile, existingMeta, existingReadme] = await Promise.all([
    readFile(env, "train.jsonl").catch((e) => { throw e; }),
    readFile(env, "metadata.json").catch(() => null),
    readFile(env, "README.md").catch(() => null),
  ]);

  const seen = new Set<string>();
  const newRows: JevExampleRow[] = [];
  if (existingFile) {
    for (const line of existingFile.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { id?: string };
        if (r.id) seen.add(r.id);
      } catch {
        /* skip malformed line */
      }
    }
  }
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    newRows.push(row);
    seen.add(row.id);
  }

  if (!newRows.length) {
    const ph = pending.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE jev_examples SET status = 'uploaded', uploaded_at = ? WHERE id IN (${ph})`)
      .bind(now(), ...pending.map((p) => p.id))
      .run();
    const stats = await jevQueueStats(env);
    return { dataset: datasetRepo(env), batch: 0, uploaded_rows: 0, queue_remaining: stats.pending, total_rows: stats.uploaded, commit_ok: true };
  }

  const appended = (existingFile ? existingFile.replace(/\n?$/, "\n") : "") + newRows.map((r) => JSON.stringify(r)).join("\n") + "\n";

  // metadata.json: merge running totals with this batch.
  const meta: Record<string, any> = { ...META_DEFAULTS, ...(existingMeta ? JSON.parse(existingMeta) : {}) };
  meta.rows_total = (meta.rows_total ?? 0) + newRows.length;
  meta.last_flush_at = batchId;
  const createdTimes = newRows.map((r) => r.created_at).filter((t) => typeof t === "number");
  const first = createdTimes.length ? Math.min(...createdTimes) : null;
  const last = createdTimes.length ? Math.max(...createdTimes) : null;
  meta.first_row_at = meta.first_row_at ?? first ?? now();
  meta.last_row_at = last ?? now();
  const useCaseCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  for (const r of newRows) {
    useCaseCounts[r.use_case] = (useCaseCounts[r.use_case] ?? 0) + 1;
    providerCounts[r.provider] = (providerCounts[r.provider] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(useCaseCounts)) meta.by_use_case[k] = (meta.by_use_case[k] ?? 0) + v;
  for (const [k, v] of Object.entries(providerCounts)) meta.providers[k] = (meta.providers[k] ?? 0) + v;
  meta.updated_at = now();

  await ensureRepo(env);

  const files: UploadFile[] = [];
  const needsReadme = !existingReadme;
  files.push({ path: "train.jsonl", content: appended });
  files.push({ path: "metadata.json", content: JSON.stringify(meta, null, 2) });
  if (needsReadme) files.push({ path: "README.md", content: README });

  const upload = await createCommit(
    env,
    files,
    `DGUI_HYPERMEM-JEV flush ${batchId}: +${newRows.length} rows (${Object.entries(useCaseCounts).map(([k, v]) => `${k}:${v}`).join(", ")})`,
  );
  if (!upload.ok) {
    const body = (await upload.text()).slice(0, 300);
    throw new Error(`hf upload: HTTP ${upload.status}: ${body}`);
  }

  const ph = pending.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE jev_examples SET status = 'uploaded', uploaded_at = ? WHERE id IN (${ph})`)
    .bind(now(), ...pending.map((p) => p.id))
    .run();

  const stats = await jevQueueStats(env);
  return {
    dataset: datasetRepo(env),
    batch: batchId,
    uploaded_rows: newRows.length,
    queue_remaining: stats.pending,
    total_rows: stats.uploaded,
    commit_ok: true,
  };
}