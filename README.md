# dgui-hypermem

**DGUI-HyperMem** (DeckerGUI HyperMemory) — a self-hosted, hybrid long-term **memory MCP
server** for AI agents, running entirely on **Cloudflare Workers**. Retrieval fuses vector
search with full-text search, then a **JEV** reasoning layer (*Choice* / *Noul* / *Score*)
re-ranks and curates what gets remembered.

A **DeckerGUI** project.

[![Deploy](https://img.shields.io/badge/Cloudflare-Workers-F38020)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-5A4FCF)](https://modelcontextprotocol.io/)
[![Dataset](https://img.shields.io/badge/🤗%20dataset-ctaxnagomi%2FDGUI__HYPERMEM--JEV-yellow)](https://huggingface.co/datasets/ctaxnagomi/DGUI_HYPERMEM-JEV)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What it does

- **Stores durable memories** — an LLM/JEV layer assigns each memory a *type*, a *salience*
  score and a *durability* judgement; non-durable chatter is dropped.
- **Recalls hybrid** — Vectorize ANN + D1 FTS5 BM25 candidates, fused by reciprocal rank,
  then re-ranked by JEV so the best memory wins even when wording differs.
- **Self-maintains** — near-duplicate/contradicting memories are **superseded** automatically.
- **Gets better with use** — every JEV decision is logged and flushed to a HuggingFace
  dataset, building a training corpus for the reasoning layer.

```
                 ┌───────────────────────────── Cloudflare Worker ─────────────────────────────┐
   MCP client    │                                                                             │
 (opencode, etc.)│   /mcp  ─ Streamable HTTP MCP      add · search · list · profile · forget    │
      ───────────┼─► /api/* ─ REST mirror              · help · sync_jev_dataset · jev_queue_stats│
                 │                                            │                                │
                 │                          ┌─────────────────┴─────────────────┐              │
                 │                          │            JEV layer              │              │
                 │                          │  Choice · Noul · Score (systemone)│              │
                 │                          └─────────────────┬─────────────────┘              │
                 │            ┌───────────────┬───────────────┴───────────┐                    │
                 │       D1 (SQLite)   Vectorize (768d)            Workers AI               │
                 │   memories + FTS5   embeddings                fallback model            │
                 │            └───────────────┴───────────────┬───────────┘                    │
                 │                                    jev_examples queue                        │
                 │                                            │ hourly cron                    │
                 └────────────────────────────────────────────┼───────────────────────────────┘
                                                              ▼
                                        🤗 ctaxnagomi/DGUI_HYPERMEM-JEV  (training brain)
```

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare Workers (ES modules, `nodejs_compat`) |
| Protocol | MCP Streamable HTTP (stateless, JSON responses) via `@modelcontextprotocol/sdk` |
| Database | Cloudflare D1 — `memories`, external-content FTS5 `memories_fts`, `events`, `jev_examples` |
| Vectors | Cloudflare Vectorize — `@cf/baai/bge-base-en-v1.5`, 768d cosine |
| Reasoning | TypeSafe AI **Jev / System One** (`choice` / `noul` / `score`), Workers AI fallback |

## Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/mcp` | POST | MCP (Streamable HTTP). Requires auth. |
| `/api/add` `/api/search` `/api/list` `/api/profile` `/api/forget` | POST | REST mirror of the tools |
| `/api/sync_jev` | POST | Flush queued JEV examples to the dataset now |
| `/api/jev_queue_stats` | GET | Queue status (pending / uploaded / error) |
| `/health` | GET | Unauthenticated status |

**MCP tools:** `add`, `search`, `list`, `profile`, `forget`, `help`, `sync_jev_dataset`,
`jev_queue_stats`.

Auth accepts `Authorization: Bearer <MCP_TOKEN>`, `x-api-key: <MCP_TOKEN>`, or `?token=`.

## Deploy

```bash
npm install

# 1. Create resources (once)
npx wrangler d1 create dgui-hypermem
npx wrangler vectorize create dgui-hypermem --dimensions=768 --metric=cosine

# 2. Point wrangler.jsonc at your D1 id, then apply migrations
npx wrangler d1 migrations apply dgui-hypermem --remote

# 3. Secrets
npx wrangler secret put MCP_TOKEN      # bearer token clients must present
npx wrangler secret put TYPESAFE_API_KEY   # optional: enables the TypeSafe JEV backend
npx wrangler secret put HF_TOKEN       # optional: enables dataset sync

# 4. Ship
npx wrangler deploy
```

### Configuration (`wrangler.jsonc` vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `JEV_MODE` | `auto` | `auto` \| `typesafe` \| `workers-ai` \| `off` |
| `JEV_MODEL` | `jev-latest` | TypeSafe model alias |
| `FALLBACK_MODEL` | `@cf/meta/llama-3.1-8b-fast-v2` | Workers AI fallback |
| `EMBED_MODEL` | `@cf/baai/bge-base-en-v1.5` | Embedding model |
| `DEFAULT_SCOPE` | `default` | Default memory namespace |
| `HF_DATASET` | `ctaxnagomi/DGUI_HYPERMEM-JEV` | Training-brain dataset |

### Wire it into an MCP client

```jsonc
{
  "mcp": {
    "dgui-hypermem": {
      "type": "remote",
      "url": "https://dgui-hypermem.<your-subdomain>.workers.dev/mcp",
      "enabled": true,
      "headers": { "Authorization": "Bearer {env:DGUI_HYPERMEM_TOKEN}" }
    }
  }
}
```

## The training brain

Every JEV decision is recorded as an instruction row — the exact `state` and typed
`questions` that were sent, and the `answers` that came back — in the `jev_examples` table.
An hourly cron (`17 * * * *`) and the `sync_jev_dataset` tool append pending rows to
[`ctaxnagomi/DGUI_HYPERMEM-JEV`](https://huggingface.co/datasets/ctaxnagomi/DGUI_HYPERMEM-JEV),
updating `train.jsonl` and running totals in `metadata.json`.

| `use_case` | `instruct_type` | Recorded when |
|------------|-----------------|---------------|
| `analyze` | `choice_noul_score` | A memory is stored/typed |
| `rerank` | `noul` | Recall re-ranks candidates |
| `supersede` | `noul` | A contradiction check runs |

## Layout

```
src/
  index.ts      MCP server, REST routes, scheduled handler
  store.ts      add / search / list / profile / forget (hybrid retrieval)
  jev.ts        JEV layer: analyze, rerank, supersede (TypeSafe + Workers AI)
  dataset.ts    jev_examples queue + HuggingFace flush
  types.ts      shared types
  util.ts       ids, hashing, base64, timing-safe compare
migrations/     0001_init.sql, 0002_jev_examples.sql
wrangler.jsonc  bindings, vars, cron
```

## Credits

DGUI-HyperMem is a **DeckerGUI** project.

| Who | Contribution | Link |
|-----|--------------|------|
| **TypeSafe AI** | Jev — the first System One model — and the Choice / Noul / Score primitives the reasoning layer is built on. | <https://typesafe.ai> · <https://docs.typesafe.ai> |
| **DeckerGUI** | Design, implementation and operation. | <https://deckergui.my> |
| **KrackedDevs** | Community credit and support. | <https://krackeddevs.com> |
| **CTECX** | Knowledge / corpus partner. | <https://ctecx.deckergui.my> |

> *Jev*, *System One*, and the *Choice / Noul / Score* primitives are **TypeSafe AI**'s and
> are used under their MIT-licensed public documentation (<https://docs.typesafe.ai>).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md); contributors are listed
in [CONTRIBUTORS.md](CONTRIBUTORS.md).

## License

[MIT](LICENSE) © 2026 DeckerGUI.
