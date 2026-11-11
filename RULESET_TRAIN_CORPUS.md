<!-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->

# RULESET_TRAIN_CORPUS.md

**Owner:** wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
**Applies to:** the DGUI-HyperMem main architecture (`src/dataset.ts` and the new
embedding-corpus pipeline).
**Version:** 1.0.0 (2026-10-07)

This file governs how generative knowledge and output produced by the service is
pipelined into HuggingFace datasets — the **Train** corpus (existing) and the
new **embedding** corpus. It is the executable counterpart of
`ruleset/templates/DGUI_HMEM_RULESET.template.md` §3–§5.

---

## 1. Two corpora, one air-gapped pipeline

| Corpus | HF repo | Content | Consumer |
|---|---|---|---|
| **Train** | `ctaxnagomi/DGUI_HYPERMEM-JEV` (existing) | JEV reasoning decisions, typed instruction rows | fine-tune / few-shot the JEV layer |
| **Embed** (new) | `ctaxnagomi/dgui-hypermem-embed-corpus` | memories in **embedding-model format** (text + metadata + optional 768-d vector) | train / evaluate embedding + retrieval models |

Both sit behind the same boundary: **in only, never out** (air-gap wall W5 of
the ruleset). The service never pulls corpus data back from HF.

## 2. Train pipeline (`DGUI_HYPERMEM-JEV`) — as deployed

```
MCP add/search/supersede
        │  JEV decision made (typesafe | workers-ai | off)
        ▼
buildAnalyzeRow / buildRerankRow / buildSupersedeRow   (now carry tag_id)
        │  tag_id = u_<16-hex sha256(email)>  (util.tagIdFor; null for master/REST-less)
        ▼
enqueueJevExample ── REDACTION GATE (fail-closed) ──▶ jev_examples (D1)
        │  scrubJevRow walks every leaf; identity fields incl. tag_id untouched
        ▼
flushJevExamples (cron 17 * * * * + sync_jev_dataset tool)
        │  - re-scrubs the WHOLE published train.jsonl on every flush (repair pass)
        │  - dedups by row id, appends new rows, merges metadata.json totals
        ▼
HF ctaxnagomi/DGUI_HYPERMEM-JEV  (train.jsonl, metadata.json, README.md)
```

Row shape (`JevExampleRow`, `src/dataset.ts`):

```json
{
  "id": "uuid", "use_case": "analyze|rerank|supersede",
  "instruct_type": "choice_noul_score|noul",
  "instruction": "...", "input": "...", "output": "...",
  "state": {}, "questions": {}, "answers": {},
  "provider": "typesafe", "model": "jev-latest",
  "scope": "default", "memory_id": null, "source": null,
  "tag_id": "u_ab12cd34ef56ab78",
  "created_at": 1234567890000
}
```

**tagID is now part of every queued and published row.** It attributes the
decision to the MCP user whose credential triggered it (ruleset §5). It is an
identity field in `scrubJevRow` (`JEV_IDENTITY_FIELDS`), so it round-trips
byte-identically and is never redacted.

## 3. Embed pipeline (new corpus `dgui-hypermem-embed-corpus`)

### 3.1 Corpus format — embedding-model conventions

The corpus follows the embedding-model dataset conventions consumers expect
(BEIR-style corpus + queries + pairs; `datasets`-loadable JSONL):

**`corpus.jsonl`** — one row per memory document:

```json
{
  "doc_id": "mem_<uuid>",
  "text": "<scrubbed memory content>",
  "metadata": {
    "tag_id": "u_ab12cd34ef56ab78",
    "scope": "default",
    "memory_type": "fact",
    "source": null,
    "created_at": 1234567890000,
    "status": "active"
  },
  "embedding": [0.018, ... 768 floats]   // optional; @cf/baai/bge-base-en-v1.5
}
```

**`queries.jsonl`** — one row per observed search query that returned results:

```json
{
  "query_id": "q_<uuid>",
  "text": "<scrubbed query text>",
  "metadata": { "tag_id": "u_ab12cd34ef56ab78", "created_at": 1234567890000 }
}
```

**`train.jsonl`** (contrastive pairs) — which documents actually answered a
query (label 1 = positive, 0 = captured-but-not-selected):

```json
{ "query_id": "q_...", "doc_id": "mem_...", "label": 1 }
```

**`metadata.json`** — corpus stats: `rows_total`, `by_tag_id`, `by_memory_type`,
`embedding_dim`, `embedding_model`, `first_row_at`, `last_row_at`, `last_ingest_at`.

### 3.2 Intended schedule (single writer)

```
memories table (D1) ── daily ingest ─▶ embed corpus (HF)
  1. select: status='active' AND trained-scope opted-in AND tag_id NOT NULL
  2. gate:   scrubJevRow-equivalent redaction (W1–W3) — fail-closed
  3. embed:  reuse the live 768-d Vectorize vector when present, else
             re-embed via @cf/baai/bge-base-en-v1.5 at ingest time
  4. dedup:  doc_id upsert (never duplicate a document)
  5. write:  single writer only (the production Worker, same rule as Train)
```

The daily-ingest code ships in `src/corpus.ts` (this repo, via the worker's
scheduled handler and the `sync_embed_corpus` MCP tool / REST route). Until a
deploy runs it once, the corpus stays schema-complete and empty (skeleton
committed at creation). repo creation and skeleton: see PATCH_NOTES.

### 3.3 Gates (identical policy to Train + one extra)

| Gate | Applies |
|---|---|
| Redaction (W1–W3), fail-closed | Train + Embed |
| tagID required (`tag_id` NOT NULL) | **Embed only** — untagged rows are ineligible |
| Scope opt-in (default off, ruleset §7) | Train + Embed |
| `status='active'` only | Embed |
| Single writer (W9) | Train + Embed |

## 4. Air-gap guarantees (what this file certifies)

- **Write-only.** Both HF repos are sinks. There is no read-back, no seed pull,
  no ETL from HF into the service.
- **Fail-closed gates.** An unvetted row is dropped at the gate; it can neither
  sit in the queue nor reach HF (the enqueue gate; unchanged for Train).
- **tagID, not PII.** Attribution is a truncated hash (`u_<hex>`); the corpus
  never contains emails (§W2) and publishes no way to recover them.
- **Repair pass.** Adding a redaction rule repairs published history on the next
  flush (Train: whole-file re-scrub; Embed: re-scrub at ingest + next daily pass).
- **No billing/usage data** (W7) and **no prohibited content** (W8) in any row.

## 5. Ownership & verification

- Code owners: `src/dataset.ts` (Train), `src/corpus.ts` (Embed),
  `src/technician.ts` (embedded-consumer: the technician agent reads the
  solution corpus back from D1 — the same population the ingest publishes —
  as its diagnostic checklist; see PATCH_NOTES "technician JEV agent").
- Tests: `redact_test.ts` (64 checks), `tagid_test.ts` (19 checks),
  `corpus_test.ts` (32 checks), `technician_test.ts` (21 checks) — run with
  `npx tsx <file>.ts` (and
  `node --experimental-strip-types` for files whose import graph has no
  extensionless relative imports).
- Every pipeline change MUST be recorded in `PATCH_NOTES.md` with a version bump
  to `ruleset/templates/DGUI_HMEM_RULESET.template.md` when user-facing policy changes.