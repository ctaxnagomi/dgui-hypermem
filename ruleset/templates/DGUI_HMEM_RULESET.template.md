<!-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->

# DGUI_HMEM_RULESET.md (TEMPLATE)

**Owner:** wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
**Service:** DGUI-HyperMem (DeckerGUI HyperMemory) — https://dgui-hmem.deckergui.my/mcp
**Applies to:** every MCP user of the DGUI-HyperMem service.
**Version:** 1.0.0 (2026-10-07)
**License:** MIT

> **TEMPLATE COPY — placeholder rules.**
> This is the commit-safe template form of the ruleset. Before distribution,
> resolve every `<PLACEHOLDER>` to the concrete per-grant value. The concrete
> grant version lives locally with the owner (gitignored) and is the only form
> that may carry real paths, emails, or key names. Placeholders in this file:
>
> | Placeholder | Meaning |
> |---|---|
> | `<OWNER_CONTACT_URL>` | where users reach the owner to request SDK config (e.g. https://deckergui.my) |
> | `<OWNER_TOKEN_FILE_PATH>` | the owner's local, gitignored secrets file holding key values (never the value itself) |
> | `<SDK_JEV_KEY_NAME>` | the name of the owner-minted JEV grant key (value is injected at runtime, never stored here) |

> This ruleset is the binding contract between you and the DGUI-HyperMem service.
> Any agent harness, IDE, or SDK that talks to the service MUST comply with it.
> The `DGUI_HMEM_RULESET_INSTRUCT.zip` pack (ctecx_instruct@1) is the executable
> form of this file. Where a harness carries its own copy, this file is
> canonical; a conflict is a bug in the harness copy.

---

## 1. What the service is

DGUI-HyperMem is a long-term memory MCP server for LLM agents, running entirely
on serverless edge infrastructure (Cloudflare Workers + D1 + Vectorize). It is
addressed over MCP at `https://dgui-hmem.deckergui.my/mcp` (Streamable HTTP) and
mirrors a small REST surface at `/api/*` for curl/scripts.

Everything you store is kept in **your account's own store** (`memories` in D1),
indexed two ways:

| Index | Engine | Purpose |
|---|---|---|
| Vector | Vectorize ANN, 768-dim (`@cf/baai/bge-base-en-v1.5`) | approximate-nearest-neighbour recall |
| Keyword | D1 FTS5 BM25 | exact-keyword recall |

Recall is hybrid: vector + keyword candidates are fused with reciprocal rank
fusion, then re-ranked by the JEV reasoning layer (Choice / Noul / Score).

## 2. The data-flow pipeline (strict)

```
                   WRITE PATH (inbound)
  ┌──────────────┐   add()    ┌──────────────────────────────┐
  │  MCP client  │ ─────────▶ │ /mcp  (serverless Worker)    │
  └──────────────┘            │  1. content gates            │
                              │     - prohibited-pattern     │
                              │       block (secrets, CSAM,  │
                              │       CVE exploits, etc.)    │
                              │     - length cap 64,000 chars│
                              │  2. JEV analyze (hosted)     │
                              │  3. embed → 768-d vector     │
                              │  4. D1 row + Vectorize upsert│
                              │  5. contradiction check →    │
                              │     supersede candidates     │
                              └──────────┬───────────────────┘
                                         │
                    ┌────────────────────┼──────────────────────────┐
                    ▼                    ▼                          ▼
             ┌──────────────┐   ┌───────────────┐          ┌─────────────────┐
             │ YOUR STORE   │   │ enqueue gate  │          │ event log       │
             │ D1 memories  │   │ (REDACTION —  │          │ crm_logs,       │
             │ Vectorize    │   │  fail-closed) │          │ usage_events    │
             └──────────────┘   └──────┬────────┘          └─────────────────┘
                                       ▼  only scrubbed rows
                              ┌─────────────────┐   flush (cron + tool)
                              │ jev_examples D1 │ ──────────────────────▶
                              └─────────────────┘
                   TRAIN ONLY ▶  HF ctaxnagomi/DGUI_HYPERMEM-JEV (train.jsonl, metadata.json)

                   READ PATH (outbound)
  ┌──────────────┐  search()   ┌──────────────────────────────┐
  │  MCP client  │ ──────────▶ │ FTS5 BM25 + Vectorize ANN    │
  └──────────────┘             │ → reciprocal-rank fusion     │
                               │ → JEV rerank → scored result │
                               └──────────────────────────────┘

                   CORPUS PATH (air-gapped, see §6)
  Your tagged memories (tagID, §5) → redaction gate → embed rows in
  embedding-model format → HF ctaxnagomi/dgui-hypermem-embed-corpus
```

Every step in the write path is logged to your account's audit tables
(`crm_logs`, `events`, `usage_events`). Nothing in the read path ever writes to
a training corpus.

## 3. Which data is training-only

Exactly two pipelines may receive your data, and both are **opt-in** (§7) and
**air-gapped** (§6):

1. **TRAIN — `DGUI_HYPERMEM-JEV`.** JEV reasoning decisions (analyze / rerank /
   supersede) are recorded as typed instruction rows. A row enters the queue only
   after the enqueue redaction gate (fail-closed) passes. Flush happens hourly
   (cron) and on demand (`sync_jev_dataset` tool). The published file is
   **re-scrubbed in full on every flush**, so a newly added redaction rule
   repairs history automatically.
2. **CORPUS — `dgui-hypermem-embed-corpus` (new).** Scrub-passed, **tagID-
   stamped** memories, in embedding-model format (row schema in
   `RULESET_TRAIN_CORPUS.md`). Corpus ingestion REQUIRES a tagID (§5) — rows
   without one are ineligible. This is the only consumer of the `tagID` field.

All other data is stored for service only and never leaves your account's store.

## 4. What NEVER leaves the account (the air-gap walls)

The corpus boundary is a **one-way wall**: data may only ever flow *in* to
HuggingFace, never *out*. The walls, each enforced in code:

| # | Wall | Enforcement |
|---|---|---|
| W1 | **Secrets / credentials** | Redaction gate at enqueue (fail-closed — an unvetted row is dropped, never published). Provider-format rules (Stripe, GitHub, HF, CF, Slack, AWS, Google, JWT, Bearer…) + contextual assignment rules + co-redaction pass. |
| W2 | **Email addresses** | Masked by the `email-address` rule before any row is published. `tagID` is a hash, not an email (§5). |
| W3 | **Env-var secret names** | `STRIPE_WEBHOOK_SECRET` (name AND prose phrase) masked — dataset policy bars them even though the privacy policy tolerates them in memory. |
| W4 | **Untagged rows** | Corpus ingestion rejects rows without a `tagID`. Train (JEV) rows may be untagged (master-token traffic) but never carry PII by construction. |
| W5 | **No back-channel** | The service never pulls corpus/train data back from HF. HF writes are the only outbound. |
| W6 | **Sensitive scopes** | Store sensitive material in a scope that is not opted into training. Training and corpus pipelines only look at opted-in scopes/memories. |
| W7 | **Billing & usage** | quota/usage/Payment data (`usage_events`, Stripe rows) never enters any training row. |
| W8 | **Prohibited content** | The write-path block list (secrets, CSAM indicators, CVE exploits, etc.) rejects content before it is even stored. |
| W9 | **Single writer** | One instance (the production Worker) is the sole HF writer, so two brains cannot silently overwrite each other's rows. |

If a wall is ever removed or weakened, this document MUST be version-bumped and
every user notified before the next flush.

## 5. tagID — tracking your contribution to Train + corpus

Every MCP user is issued an attribution tag at the moment their credential is
used:

```
tagID = "u_" + first-16-hex(SHA-256(lowercased token-owner email))
```

- **Deterministic** — the same email always yields the same tag, forever.
- **Anonymous by construction** — it is a truncated hash: no `@`, no domain, no
  hex pattern that any redaction rule treats as a secret. It survives the
  redaction gate byte-identically (it is an identity field in `scrubJevRow`).
- **Where it lands:**
  - JEV rows (`jev_examples` → `train.jsonl`) written by `add`, `search`
    (rerank), and supersede checks triggered by your credential carry your
    `tag_id`.
  - Corpus rows carry your `tag_id` in `metadata.tag_id` (§3).
- **Untagged traffic** (master token, unauthenticated REST) has `tag_id: null`
  and is excluded from the corpus.
- **What it is NOT:** a tracking cookie, a secret, or a way for a third party to
  identify you. It is a contribution counter for Train + corpus governance
  (per-user volume, dedup, opt-out accounting).

## 6. The SDK feature (DeckerGUI SDK) — owner-gated

- The **DeckerGUI SDK** is DGUI-HyperMem's own SDK configuration for agentic
  execution layers. It is **OWNER-ONLY**: it is never distributed to MCP users,
  never published, and never embedded in this ruleset.
- MCP users who want SDK configuration must **ask the owner**
  (`<OWNER_CONTACT_URL>`) explicitly. The owner decides, mints what is needed,
  and hands out the config individually.
- The executable form of this ruleset (`DGUI_HMEM_RULESET_INSTRUCT.zip`) is a
  ctecx_instruct@1 pack that implements the *user-facing* harness contract:
  agentic tools, `tool_calls`, high-efficiency output, token-reduction via
  HTML-to-canvas capture, compact DOM, and browser automation (Playwright /
  BrowserOS neo) where the task needs it — always under strict compliance with
  this file (`{{DGUI_HMEM_RULESET.md}}`).
- **JEV key isolation:** the SDK harness uses the JEV API key the **owner
  provides** for you (a separately minted key, grant name `<SDK_JEV_KEY_NAME>`,
  value held only in the owner's gitignored secrets file
  `<OWNER_TOKEN_FILE_PATH>`). It NEVER uses or shares the hosted service's
  embedded JEV key. No key value is ever stored in a ruleset, pack, or
  repository. If you have no JEV API key, ask the owner to mint one; the pack
  refuses to run in JEV mode until a key is supplied via the environment.

## 7. Consent — nothing leaves by default

- **Training contribution defaults OFF.** Your memories and decisions are stored
  and served, but are not eligible for Train or the corpus until you opt in.
- **The SDK feature defaults OFF.** When a user adopts the INSTRUCT pack, the
  harness MUST ask "do you want to enable the DGUI-HyperMem SDK feature?" and
  proceed only on an explicit yes.
- An opt-in covers the scope(s) you selected, nothing else. You can opt out at
  any time; rows already published cannot be recalled, but the repair pass
  removes any that a rule change later decides should not exist.
- Consent is recorded; opt-out accounting uses `tagID`.

## 8. Compliance contract for harnesses

- Any harness/SDK using the service MUST embed or bind this ruleset and comply
  with the pipeline of §2, the training-only scope of §3, and every air-gap wall
  of §4.
- Never store credentials, private keys, or personal data in memory
  (`add()` content gates reject the worst cases; the redaction gate protects the
  corpus; behaviour is still on you).
- The INSTRUCT pack's `Important Details` section carries every constraint this
  file imposes; a harness that violates a wall fails verification (non-zero
  exit) and must not close its task.

## 9. Verification

- The service verifies the walls in code (redaction tests, `tagid_test.ts`).
- The INSTRUCT pack ships `task.sh` verification stages that check: ruleset
  file presence and hash, JEV key presence for JEV mode, MCP reachability, and
  that no wall-crossing data was written.
- `PATCH_NOTES.md` in the source repository records every change to the
  pipeline; version bumps to this file are tracked there.

---

Questions: ask the owner (`<OWNER_CONTACT_URL>`). SDK config requests:
owner-only, per §6.