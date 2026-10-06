# Developer Patch Notes

Postponed work and known issues, carried forward between releases.

---

## Fixed: stale OpenAI submission URL, setup-token logging; token-wan.md moved (7 Oct 2026)

- **Stale OpenAI URL.** The OpenAI Plugins submission checklist told the portal
  to use `https://dgui-hypermem.ctaxnagomi.workers.dev/mcp`, which 404s since
  the account migration. It now points at the production endpoint
  `https://dgui-hmem.deckergui.my/mcp`.
- **Setup-token logging.** `/api/setup-dataset` no longer records an HF-token
  prefix in the CRM audit log — the `dataset_setup` entry stores only the
  dataset name. The rest of the setup path (`handleRequestToken` actions etc.)
  already logged generic action strings only, so no token material ever reaches
  a log now. Docs and the deployment-audit note updated accordingly
  (setup-token logging removed from known gaps).
- **token-wan.md moved** out of the repo root into the migration bundle
  directory (`hmem-migration/`, not a git repository). It remains untracked,
  gitignored, and never committed; the `.gitignore` entry stays as a defensive
  net.
- No pipeline or training-governance surface changed; `DGUI_HMEM_RULESET`
  policy is unaffected.

---

## Training governance: tagID attribution, ruleset templates, embedding corpus skeleton (7 Oct 2026)

Training/corpus governance patch. Every queued and published JEV row is now
attributable to the MCP user who triggered it, without publishing anything
identifiable.

- **tagID** — `tag_id` field added to `JevExampleRow` and stamped server-side on
  `add` / `search` (rerank) / supersede rows from the credential owner's email:
  `u_` + first-16-hex of SHA-256 (lowercased). Threaded through the MCP
  handlers and the REST `/api/add` + `/api/search` paths; master-token and
  unauthenticated traffic stays untagged (`null`). `tag_id` is an identity
  field in `scrubJevRow`, so it round-trips byte-identically and is never
  redacted. New rows carry it going forward; already-published rows are left
  untouched (no backfill churn).
- **Ruleset artefacts** — commit-safe *template* forms only, under
  `ruleset/templates/`:
  - `DGUI_HMEM_RULESET.template.md` — per-user contract: strict data-flow
    pipeline, training-only scope, air-gap walls W1–W9, tagID, opt-in consent,
    owner-gated DeckerGUI SDK.
  - `DGUI_HMEM_RULESET_INSTRUCT` pack (ctecx_instruct@1, five parts) + zip —
    executable harness contract (agentic tools, `tool_calls`, html2canvas +
    compactDOM token reduction, Playwright/BrowserOS neo), JEV driven by an
    owner-minted key injected at runtime only.
  - `DECKERGUI_SDK_RULESET.template.md` — owner-only SDK config (same
    ctecx_instruct@1 shape), never distributed to MCP users.
  - Concrete grant versions (paths, key name) are **gitignored, owner-local**
    by policy: nothing with a real path/email/key is ever committed.
- **Pipeline spec** — `RULESET_TRAIN_CORPUS.md` at repo root documents both
  corpora: Train (`DGUI_HYPERMEM-JEV`, tagID now in every row) and the new
  Embed corpus in embedding-model format, with gates, single-writer rule,
  air-gap guarantees, and the intended daily-ingest schedule.
- **HuggingFace corpus** — `ctaxnagomi/dgui-hypermem-embed-corpus` created
  (public). Schema-complete and empty: corpus.jsonl / queries.jsonl /
  train.jsonl + metadata.json + dataset card. Ingestion code ships later per
  `RULESET_TRAIN_CORPUS.md` §3.2; until then the format is the contract.
- **Tests** — `tagid_test.ts` (19 checks; run with `npx tsx tagid_test.ts`),
  alongside `redact_test.ts`. `typecheck` clean.

---

## Moved: production account migration to wan.mohd.azizi.seggaf — DEPLOYED (30 Sep 2026)

dgui-hypermem now runs from the **wan.mohd.azizi.seggaf** Cloudflare account
(`155c4982c49d57ce2ff8c5a27e599cbd`) at **https://dgui-hmem.deckergui.my**,
no longer the ctaxnagomi account. A Workers custom domain must live in the same
account as the zone, so the Worker and its account-scoped resources were
recreated there; the source Worker in ctaxnagomi was left untouched (still in
MAINTENANCE) as the rollback path until cutover is commanded.

- **New D1** `dgui-hypermem-20260930-2300`
  (`735892ec-f246-4106-b770-4a9541ef982c`) — schema.sql (40 objects) + full
  data dump (12 tables) applied in 43 chunked batches. Verified live:
  **13 tokens, 137 memories, 229 crm_logs, 83,623 usage_events**.
  The pre-existing leftover `dgui-hypermem` D1 (`fb61c1d7-...`) in the target
  account was **not** touched, per the brand-new-resources policy.
- **New Vectorize index** `dgui-hypermem-20260930-2300` (768 dims, cosine) —
  61 vectors inserted.
- **Deployed** with `wrangler.target.jsonc`: custom domain `dgui-hmem.deckergui.my`,
  cron `17 * * * *`, `JEV_MODE=auto`, `HF_DATASET=ctaxnagomi/DGUI_HYPERMEM-JEV`.
- **9 secrets** set as write-only (ADMIN_PASSKEY_2, GITHUB_TOKEN, HF_TOKEN,
  MASTER_PASSKEY, MCP_TOKEN, PASSKEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  TYPESAFE_API_KEY). PASSKEY was regenerated fresh for the target (never shared
  from source).
- **`MAINTENANCE=1` set on the target** — the target serves the migration notice
  ("We are migrating this page under DeckerGUI project.") until the cutover is
  commanded; `/health` stays live.

### Auth & tooling

- `wrangler login` OAuth session now bound to the target account (no
  `CLOUDFLARE_API_TOKEN` needed; `migrate.sh` falls back to the OAuth session).
- `cf` CLI installed and OAuth-logged into the same account, per the Cloudflare
  agent setup.

### Migration-bundle fixes made while running

- `insert_vectors.py` printed wrangler's output after the insert; on Windows the
  console's cp1252 encoding crashed `print()` on the unicode response *before*
  `rc` was checked — the insert had actually succeeded. Fixed with
  `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`; vector insert
  re-run idempotently confirmed (61 enqueued).
- `wrangler.target.jsonc` `main` must be an **absolute path** to the repo
  (`D:/dgui-cli/dgui-hypermem/src/index.ts`) because wrangler resolves
  config-relative paths against the config file's directory, and the config
  lives in the bundle, not the repo.
- Secrets are read by `extract_secrets.py` (KEY=VALUE parse, no shell eval) and
  piped straight into `wrangler secret put` via stdin — values never printed.

### Cutover — COMPLETED (30 Sep → 1 Oct 2026)

1. `wrangler secret delete MAINTENANCE` on the target — **done**; target live
   (`/health` OK, landing page served, `/admin` → 302 to the admin host).
2. Stripe webhook re-pointed to
   `https://dgui-hmem.deckergui.my/api/stripe-webhook` — **done** (same webhook
   `we_1ULICCLjoFSWfKc74zqPs4h3`, so `STRIPE_WEBHOOK_SECRET` unchanged).
3. Single-writer: `HF_TOKEN` deleted from the **source** Worker (ctaxnagomi) and
   its dataset cron removed (`schedules: []`). `flushJevExamples` fails safe
   without the token, so the source can no longer write the HF dataset.
4. **Workers Paid upgrade** — user upgraded the target account
   (`155c4982…`) to Workers Paid ($5/mo, subscription `57971311…`,
   rate_plan `workers_paid`, scope `account`). Reason: the free-tier D1 daily
   write cap (100K rows/day) was exhausted on 30 Sep by the migration writes
   (83,623 usage_events alone) plus test fixtures, and every DB-write path on
   the live worker was 500ing with `D1_ERROR: ... free tier daily row write
   limit`. Paid removes the daily cap (50M rows written/month included).
5. Flow tests re-run against the target — **both green**:
   `billing_flow_test.py` all checks passed; `oauth_flow_test.py` all checks
   passed (incl. "no raw token stored in D1").
6. Test-harness fixes made during the run (uncommitted → this commit):
   - `d1()` helper in both tests now reads the `database_name` from
     `WRANGLER_TEST_CONFIG` and runs via `--command` in a no-shell subprocess
     so it returns actual **rows** (the `--file` variant only returns summary
     metadata); banner lines are stripped before JSON parsing.
   - Stripe-webhook check in `billing_flow_test.py` now snapshots
     `COUNT(*)` before the forged request and asserts no new row, instead of
     assuming the table starts empty. (The two `evt_test_*` rows were stale
     artifacts carried over by the migration dump and were deleted from the
     target D1.)
7. Deferred (still open): OpenAI Plugins Directory listing, and rotating
   `milkawee@gmail.com`'s token.

### Follow-up patch: admin CRM on its own hostname — DEPLOYED (30 Sep 2026)

The admin CRM now runs on **`hmem-admin.deckergui.my`** (a fresh subdomain; the
user's first choice `emitter.deckergui.my` is already taken by "DGUI Emitter
Studio" on the Cloudflare Tunnel). Implemented and deployed on the target:

- `Env.ADMIN_HOST` added (`src/types.ts`).
- `src/index.ts` fetch handler branches on `url.hostname === ADMIN_HOST`:
  admin host serves `ADMIN_HTML` at `/`; the public host 302s `/admin` →
  `https://hmem-admin.deckergui.my/` so legacy `/admin` links keep working.
- `handleRest` gates `/api/admin/*` + `/api/setup-dataset` to the admin host
  only — the public hostname returns 404 for them (admin surface not
  guessable on the public domain).
- `wrangler.target.jsonc`: second `custom_domain` route
  `hmem-admin.deckergui.my` + `ADMIN_HOST` var.
- MAINTENANCE gate stays first in the fetch handler, so both hostnames show
  the migration notice until cutover is commanded (verified live).
- Verified: `tsc --noEmit` clean, dry-run deploy clean, deployed
  (version `602d2c90-74c4-43a6-9bfd-fd041d988570`), DNS custom domains
  registered (`dgui-hmem.deckergui.my` + `hmem-admin.deckergui.my`).
- Admin HTML needed zero changes — it already calls `/api/admin/*` relatively,
  so it works same-origin on the admin host.

---

## Added: OpenAI Plugins Directory submission readiness (pending deploy)

dgui-hypermem is now shaped for a *remote MCP-only* submission to OpenAI's
universal Plugins Directory (shared by ChatGPT + Codex). Nothing here touches
money or the write path — annotations are metadata, the challenge route is a
plain GET.

- **Tool annotations on all 8 MCP tools** (`readOnlyHint`, `destructiveHint`,
  `openWorldHint`, `idempotentHint`) in `buildServer`. OpenAI's Scan Tools
  imports these and the portal requires all three hints + a justification on
  every tool. Summary: read-only = search/list/profile/help/jev_queue_stats;
  destructive = forget (`all:true` wipes a scope); open-world = add (JEV
  analysis + HF dataset queue) and sync_jev_dataset (uploads to the external
  HF repo).
- **`/.well-known/openai-apps-challenge` route** serves the domain-verification
  token verbatim as `text/plain` (404 when unset). At submission time the
  portal gives a per-submission token; set it once as the `OPENAI_APPS_CHALLENGE`
  var/secret — no code change needed. The token is public by design (OpenAI
  fetches it to prove domain control), so treating it as a non-secret var is
  fine, but keeping it out of the repo still avoids churn.
- **Listing URLs already exist**: `/privacy`, `/terms`, `/docs`, `/legal`,
  `/return-policy`. For the portal's required website/support/privacy/terms
  URLs, use the worker origin + `/docs` (or `deckergui.my` if preferred).

### OpenAI submission checklist (user-actionable, at submission time)

1. In the portal choose **With MCP → Universal**; enter the production URL
   `https://dgui-hmem.deckergui.my/mcp`.
2. Complete the domain-verification challenge — place the token OpenAI
   generates at `/.well-known/openai-apps-challenge` (set `OPENAI_APPS_CHALLENGE`).
3. Provide reviewer demo credentials (an MCP token via the normal
   `/api/request-token` flow) — no MFA. Ensure a scoped demo account has sample
   data.
4. Fill in privacy policy, terms, support, and website URLs; write 5 positive +
   3 negative test cases and a short demo recording.
5. Note OpenAI pays **no revenue share** — this is distribution only. Own
   Stripe billing remains the money mechanism.

---

## Fixed: Stripe webhook could not settle any payment (deployed `af4905c0`)

Two runtime bugs, both only visible once `STRIPE_WEBHOOK_SECRET` was set — which
is exactly what "test the product purchase" was for. Before this, no purchase
could ever have completed, and both failures presented as a raw Cloudflare
`500 error code: 1101` with no log line:

1. **Request body consumed before the webhook handler ran.** `handleRest`
   pre-parses every POST body with `request.json()`. The handler then called
   `request.text()` to verify the Stripe signature and threw
   `TypeError: Body is unusable: Body has already been read` — *outside* its
   try/catch. Fix: `/api/stripe-webhook` is dispatched before the generic body
   parse in `handleRest`.
2. **`constructEvent()` is unusable on workerd.** stripe-node v22 verifies
   signatures with WebCrypto, which is async-only on Workers:
   `SubtleCryptoProvider cannot be used in a synchronous context`. Fix: the
   handler now awaits `constructEventAsync(...)` (v22 API, works on Node and
   workerd).

Verified live after deploy:

- Forged/bad signature → **HTTP 400 JSON** ("signature verification failed"),
  as the billing test asserts; Stripe stops retrying a permanently-bad event.
- A validly-signed `checkout.session.completed` event (HMAC over the raw body
  with the endpoint secret) passes verification, the handler unwraps the paid
  session and reaches the credit/D1 stage — currently it stops at the D1
  free-tier daily write limit (below), not at any code error.

### D1 free tier: daily row-write limit is a live production constraint

Since **2026-09-01** Cloudflare *enforces* D1 daily limits: any query that
exceeds **100,000 rows written / day** (5M rows read / day) fails with
`D1_ERROR` (surfaced as HTTP 500). This is a per-account ceiling, shared across
all D1 databases, and it resets at **midnight UTC**.

Today the account exhausted the daily write budget (real usage + the test
suites + index backfills all count), so every write path on the worker —
`/api/request-token`, the OAuth `/token` grant, checkout settlement, trial
claim — 500s with the D1_ERROR until the reset. Reads and Stripe calls are
unaffected. The full `billing_flow_test.py` / `oauth_flow_test.py` runs cannot
pass until the budget resets (or the account moves to Workers Paid, which
includes the first 50M rows written / month). Re-run them after midnight UTC.

---

## Changed: salience admission gate (deployed `284143cd`)

Memories are now classified at write time: `status = 'active'` when salience
meets the gate, `status = 'low_signal'` when not. `low_signal` memories stay
stored (never deleted) but are excluded from every recall path — vector search,
keyword search, list, profile, and supersede candidates — because all of them
filter on `status = 'active'` and re-validate shortlists against D1.

- **Gate value:** `SALIENCE_GATE` Worker var, default **3.0**. The originally
  proposed 4.0 was empirically untenable: the JEV salience distribution tops out
  at 3.89, so 4.0 would have archived 100% of actives. 3.0 is the distribution's
  p50 and lands at the target: 64 actives became 34 active / 30 low_signal.
- **Backfill done:** existing actives below 3.0 were reclassified to
  `low_signal` (30 rows) with a plain D1 update — no Vectorize re-embed needed,
  because every recall path re-validates ids against D1 `status='active'`.
- **Verified live:** salience 1.58 → `low_signal`, salience 3.69 → `active`;
  search results contained zero `low_signal` rows.
- **Follow-ups:** `task-record`-shaped residue in `default` is now low-signal but
  could be physically deleted if wanted; the two REDACTION GATE TEST fixtures and
  their queued JEV rows were deleted after verification.

Note on `0a051744` (the leaked-passkey memory): it came back as low_signal
(salience 3.61 ≥ 3.0 → actually stayed active). It is scrubbed, its hash was
recomputed, and its queued row was scrubbed in place.

---

## Changed: Stripe account wired (prices + webhook live; worker code pending deploy)

The Stripe side of the self-serve payment path now exists: prices are created,
the webhook endpoint receives events, and the signing secret is set. Payments
still cannot settle until the worker code (`CREDIT_PRICE_IDS` in `payment.ts`)
deploys — until then `/api/buy-credits` keeps replying "not yet on sale".

- **Credit pack prices created** (one-time, live account: DeckerGUI Unified
  Agentic Integrated Ecosystem): small $10 `price_1ULIC3LjoFSWfKc7oCXagupp`,
  medium $25 `price_1ULIC7LjoFSWfKc7lUNe6KjM`, large $50
  `price_1ULIC8LjoFSWfKc7GrFe7Cc9`; wired into the `CREDIT_PRICE_IDS` map in
  `payment.ts` so `/api/buy-credits` now mints a real Checkout Session instead
  of replying "credit packs are not yet on sale".
- **Plan prices verified live** and unchanged: Median $2.99/mo
  `price_1UICicLjoFSWfKc7s3edXQzs`, Pro $11.99/mo
  `price_1UICitLjoFSWfKc7PYVoJ5hj` — both `active`, monthly recurring, matching
  the ladder exactly. No stray or duplicate prices exist in the account.
- **Webhook endpoint created**: `we_1ULICCLjoFSWfKc74zqPs4h3` →
  `/api/stripe-webhook` (events: `checkout.session.completed`,
  `charge.refunded`); the signing secret was set as the write-only
  `STRIPE_WEBHOOK_SECRET` Worker secret (never logged). `STRIPE_SECRET_KEY` was
  already present.
- **`billing_flow_test.py` updated** to assert the wired state: packs are on
  sale with the correct $10 session and 5000-request quote, pro checkout
  carries the 15000 quota, forged webhook signatures get 4xx (permanently bad
  → Stripe stops retrying) and record no event.

## Changes: D1 row-read indexes + admin auth status codes (pending deploy)

- **`migrations/0011_row_read_indexes.sql`** applied and verified via
  `EXPLAIN QUERY PLAN`:
  - `tokens(token)` **UNIQUE** — per-request credential lookup was a full
    `SCAN tokens`; now `SEARCH … USING INDEX`. UNIQUE because tokens are
    credentials (duplicate would be ambiguous); 0 duplicates in live data,
    the 1 NULL row is legal under SQLite UNIQUE.
  - `oauth_access_tokens(refresh_token_hash)` — refresh lookup went from
    `SCAN` to `SEARCH`.
  - `usage_events(email, event_at)` — admin stats now a **COVERING** index.
  - `crm_logs(email, action, created_at)` — admin logs page filter+sort;
    the email-only shape still uses `idx_crm_logs_email` + temp B-tree
    (deliberate: an extra composite costs D1 writes for a rare query).
  - `code_hash` / `token_hash` already had UNIQUE autoindexes — no action.
- **Admin routes now return 401** (not 200) when auth fails: `adminJson()`
  promotes `{error:"unauthorized"}` to HTTP 401 at the dispatch for all seven
  `isAdmin`-gated handlers (`admin/{tokens,logs,toggle-train,update-quota,
  clock,stats}` + `setup-dataset`). Verified: 15/15 status cases, `tsc` clean.
- **`billing_flow_test.py`** no longer asserts the pre-wiring refusal messages
  (see above) — those broke by design once packs were priced.
- `.gitignore` covers `__pycache__/` from the Python test runs.

---

## Postponed: migrate `dgui-hypermem` to the `deckergui.my` account

**Status:** staged + re-validated (30 Sep), maintenance page live on the
source, awaiting the target-account API token and 6 write-only secrets.
Blocked on credentials, not on design.

**Maintenance.** Worker gains an operator-toggled `MAINTENANCE` env var:
every page serves "We are migrating this page under DeckerGUI project."
(`src/maintenance.ts`), `/health` stays live for monitoring and migration
verification. Deployed live (`5672f293`), `MAINTENANCE=1` set as a secret,
verified: `/` and `/mcp` and `/api/*` gated, `/health` still `status: ok`.

**Goal.** Deploy `dgui-hypermem` into the `wan.mohd.azizi.seggaf` account
(`155c4982c49d57ce2ff8c5a27e599cbd`) and serve it at
`https://dgui-hmem.deckergui.my`. A Workers custom domain must live in the same
account as the zone, and `deckergui.my` belongs to that account, so the Worker
has to be **redeployed there** — it cannot stay in ctaxnagomi
(`683ac31435f3bd2c649bdfbbb6d1b5c1`) and simply gain a domain.

**Staged and verified** in `D:/dgui-cli/hmem-migration` (refreshed 30 Sep —
source was quiesced behind the maintenance page before export):

| File | Contents |
| --- | --- |
| `schema.sql` | 40 DDL objects captured from the **live** database |
| `dgui-hypermem-data.sql` | 84,742 statements, 12 data tables |
| `vectors.json` | 61 vectors x 768 dims with metadata |
| `wrangler.target.jsonc` | target config incl. the `custom_domain` route |
| `migrate.sh` | one-shot driver, chunked data load |
| `export_schema.py` | regenerates `schema.sql` (new) |
| `export_d1.py` | regenerates the data dump |
| `export_vectors.py` | regenerates the vector dump |
| `insert_vectors.py` | pushes `vectors.json` into the target index |
| `README.md` | full runbook (updated: cutover checklist) |

Validated by replaying the bundle into a throwaway SQLite database: all twelve
table counts matched the live DB exactly. Vector export is complete — all 61
ids exist in `memories`, no duplicates/orphans. Note the old `active = 56 =
vectors` invariant no longer holds (test activity left ~25 stale `active`-
tagged vectors for memories now marked deleted/low-signal); the export copies
the live index 1:1, and the residue is a post-migration hygiene item.

`wrangler d1 export` cannot be used here — it refuses databases with virtual
tables (`fts5`). FTS5 shadow tables are excluded from the bundle because the
`memories_ai` / `_au` / `_ad` triggers rebuild them on insert. Schema was taken
from the live database rather than `migrations/*.sql`, which are known
incomplete for the current `tokens` and `admin_logs` schema.

### Blockers

1. **API token for the target account.** Local wrangler OAuth only reaches
   `ctaxnagomi@gmail.com`. Needs `Account → Workers Scripts / Workers KV
   Storage / D1 / Vectorize → Edit` and `Zone → Workers Routes → Edit` on
   `deckergui.my`.
2. **Five write-only secrets.** Cloudflare cannot return secret values, so these
   must be supplied by hand: `GITHUB_TOKEN`, `HF_TOKEN`, `MASTER_PASSKEY`,
   `ADMIN_PASSKEY_2`, `STRIPE_SECRET_KEY`. Only `MCP_TOKEN` and
   `TYPESAFE_API_KEY` exist locally in `.dev.vars`.

### Open design decisions (raised, not yet answered)

- **Single HF writer.** `src/dataset.ts:293-301` implements the dataset sync as
  read-modify-write against `train.jsonl` with no lock, ETag, or conditional
  commit. Two instances syncing to one repo will silently drop each other's
  rows. Exactly one instance must be the writer.
- **"Clean slate" vs "shares the HF corpus".** The code only ever *pushes*; it
  never pulls. A clean instance that pushes starts with an empty `jev_examples`
  table and is not consuming the corpus at all. A read-only/seed path is a new
  feature, not a config change.
- **Existing D1 in the target account.** `fb61c1d7-ded8-485f-9d3b-2b6fddf9b979`
  is already named `dgui-hypermem`. Decide reuse vs. fresh database.
- **Which product is monetized.** `STRIPE_WEBHOOK_SECRET` is unset, so paid
  checkout cannot settle on either instance. One shared Stripe key also cannot
  distinguish which product a checkout belongs to.
- **Domain vs maturity.** As currently framed, the established instance (127
  memories, 210 JEV examples) keeps a `workers.dev` URL while the unproven clean
  instance takes the vanity domain. Consider reversing.
- **Two instances, two independently trained JEV brains** will diverge. Decide
  whether divergence is intended or one cron must be the sole trainer.

### Not a blocker, but do it during the migration

- Rename the KrackedDevs instance off `dgui-hypermem`. Two Workers with the same
  name and identical MCP tool names will collide in client config.
- `PASSKEY` is left as `REPLACE_WITH_NEW_PASSKEY` in the target config
  deliberately, so the hardcoded `"0866"` default is not carried over silently.

---

## Fixed: token portal missing from the landing page

**Severity:** high — it broke all self-serve onboarding. Fixed in `fcc8498`.

Commit `fbd0760` (*Consumer-friendly landing: suitability, compatibility,
visitor counter, GitHub star prompt*) rewrote `src/landing.ts` with 303
insertions and 315 deletions, and in the process removed the entire
`<section id="crm">` token portal and 11 of its CSS rules. The accompanying
`<script>` and every link pointing at that section were left behind:

- `src/landing.ts:112`, `:122`, `:170` — `<a href="#crm">` Get Token buttons
- `src/payment.ts:116` — `<a href="/#crm">` Start Free
- `src/howto.ts:34` — the documented onboarding steps

Consequences:

- Both "Get Token" buttons anchor to an id that no longer exists, so the click
  does nothing visible.
- `requestToken()` and `showTerms()` are never invoked by any element, and the
  script still dereferences nine `crm-*` ids that no longer exist — calling
  `requestToken()` would throw `TypeError: Cannot read properties of null` at
  the `crm-email` lookup, which sits *before* its `try` block, so it would fail
  silently as an unhandled rejection.
- `POST /api/request-token` itself is healthy and returns proper errors.

The backend needs no fix. Restoring the deleted `<section id="crm">` block and
its CSS re-activates all four dead links and the already-working
`requestToken()`. The original markup is fully recoverable from `fbd0760~1`.

---

## MCP endpoint path is easy to get wrong

The JSON-RPC endpoint is `POST /mcp`. Posting to the bare origin returns the
landing page HTML rather than a JSON-RPC response, which reads as a connection
failure. `docs.ts:250` documents `/mcp` correctly.

---

## Fixed: fail-open MCP auth and the shared hardcoded passkey

**Fail-open.** `authorized()` ended with `if (!token) return !mcpToken;`, so a
deployment with no `MCP_TOKEN` configured authorised every anonymous request on
`/mcp` and the non-CRM `/api/*` routes. Now fails closed. Verified: an
unauthenticated `POST /mcp` returns 401.

**Shared passkey.** `PASSKEY` was a `plain_text` var in `wrangler.jsonc` holding
`"0866"`, *and* both call sites carried a redundant `env.PASSKEY || "0866"`
fallback — so a deployment that forgot to set the var silently accepted a
credential that was, until this change, printed in the public docs. Now:

- A single `checkPasskey()` helper is the only authority for passkey checks
  (the logic was previously duplicated verbatim in `handleRequestToken` and
  `handleDisableToken`).
- No hardcoded fallback. With neither `PASSKEY` nor `MASTER_PASSKEY` set,
  nothing can authenticate.
- Comparison is constant-time via `timeSafeEqual`, replacing `===`.
- `PASSKEY` moved out of `wrangler.jsonc` into a `secret_text` binding.
- The passkey input's `maxlength` went from 20 to 128 to accommodate a
  high-entropy value.

**Breaking change.** The shared passkey was rotated, so `0866` no longer issues
tokens. Anyone relying on it must be given the new value. It is recorded in the
gitignored `.dev.vars` as `PASSKEY`.

**Still a design limitation.** One shared passkey gates all self-serve signups,
so anyone who obtains it can claim a token for any email. Rotating and hiding it
raises the bar but does not fix the model. A per-user invitation or email
magic-link flow would be the real answer.

## OAuth 2.1 authorization server (`/mcp` only)

The worker is its own authorization server and resource server — no external
IdP, no per-user vendor cost. Clients that speak MCP OAuth connect with a
browser consent flow instead of pasting a token.

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 resource metadata |
| `GET /.well-known/oauth-authorization-server` | AS metadata |
| `POST /register` | RFC 7591 dynamic client registration |
| `GET /authorize` | Consent page + sign-in |
| `POST /token` | Code exchange and refresh |
| `POST /revoke` | RFC 7009 revocation |

`src/oauth.ts` holds the server, `src/auth.ts` holds the shared credential
resolver. The REST routes deliberately keep bearer tokens: they are called from
curl and scripts where a browser consent flow is pure friction.

**Properties enforced, each with a test:** PKCE S256 only; codes single-use and
burned by conditional `UPDATE` before minting; `redirect_uri` matched by exact
string against the registered value; `http` redirect only for loopback;
`client_credentials` refused; codes 10 min, access 1 h, refresh 30 d with
rotation; refresh preserves the original absolute lifetime rather than sliding;
all three token classes stored only as SHA-256 digests.

**Disable is a kill switch, not a gate.** Disabling an account revokes its
OAuth grants and burns its pending codes. The first draft only checked account
status per request, which meant re-enabling an account silently resurrected
access tokens the user had never re-consented to — bad if the disable was a
response to a compromise. `oauth_flow_test.py` caught this.

**401 now carries `WWW-Authenticate`.** A bare 401 left opencode guessing at an
OAuth endpoint it could not find, surfacing as a confusing 404 three steps
downstream (this is the original opencode 404, now fixed at the source rather
than worked around by reactivating a token).

**Scope is advisory.** The single `mcp` scope is metadata; it is not enforced
per tool. Fine while every client gets the full catalog, but it is not
least-privilege. Per-tool scopes would need a check in each handler.

**Not done:** no `/.well-known/oauth-protected-resource/mcp` path-suffixed
variant is tested by real clients; no consent *scoping* screen (the user sees a
fixed description); no client-initiated logout endpoint; no rate limiting on
`/token` or `/register`, so registration is unbounded and can be used to grow
`oauth_clients` without limit.

## Billing: plan ladder, Pro trial, and pay-as-you-go

Shipped. `src/billing.ts` is the single source of truth for every number a
customer can see, and the marketing pages, the docs, the quota gate, the
`/pay` pricing page, and the 429 upgrade message all read from it. Before this
the page advertised Free as 1,000 requests while the gate enforced 5,600, and
`docs.ts` quoted a third set (3,500 / 6,500 / 999,999) matching nothing at all.

| Plan | Price | Requests / month |
| --- | --- | --- |
| Free | $0 | 2,000 |
| Median | $2.99 | 8,500 |
| Pro | $11.99 | 15,000 |
| Enterprise | $29.99 | 25,000 |
| Pay as you go | $0.002 / request | after the plan allowance |

- **Money is integers only** — micro-dollars (1e-6 USD) in the database, cents
  in Stripe. No float ever touches a balance.
- **Plan-first, then wallet.** The allowance is spent first; only once it is
  exhausted does a request draw on prepaid credit. A request that neither can
  fund is refused with `429`, a `code` of `quota_exceeded`, and an `upgrade`
  block naming the next plan, enterprise, and pay-as-you-go with prices.
- **Wallet debits are guarded** (`WHERE payg_credits_micro >= ?` plus a
  `meta.changes === 1` check), so concurrent requests cannot overdraw. Verified:
  a balance one micro-unit short is refused, and a zero balance is not treated
  as truthy.
- **The 15-day Pro trial is enforced lazily on the request path and
  persisted**, so the plan that is enforced and the plan that is displayed can
  never disagree. Claiming is guarded by `trial_started_at IS NULL`, so a
  concurrent double-claim gets one trial. A lapsed trial reverts the stored
  plan as well as the reported one.
- **`quota_override` is nullable and authoritative when set**, so the ladder
  drives billing while an operator can still grant a custom cap. Legacy
  per-row `quota_monthly` literals were normalised to `NULL` in
  `migrations/0010_quota_authority.sql`.
- **Stripe webhooks are idempotent.** Each event id is claimed in `stripe_events`
  *before* effects are applied, so at-least-once delivery cannot double-credit.
  The plan is re-derived from the price Stripe actually charged, never from
  session metadata, so forged metadata cannot grant an unpaid plan.

### Blockers — no money can move until these are done

1. **`STRIPE_WEBHOOK_SECRET` is not set.** `constructEvent` cannot verify a
   signature without it. The endpoint now returns `500` with an explicit message
   rather than `400`, because a `4xx` tells Stripe the event is permanently bad
   and stops it retrying — an operator mistake would silently discard real
   payments. Confirmed against live bindings: no Stripe purchase has ever
   completed (`crm_logs` has zero `stripe_subscription` / `payg_topup` rows).
2. **`CREDIT_PRICE_IDS` is empty.** The $10 / $25 / $50 one-time prices must be
   created in the Stripe dashboard. `POST /api/buy-credits` deliberately refuses
   rather than taking a payment it cannot deliver credit for.
3. `PLAN_PRICE_IDS` must name real recurring prices for Median and Pro;
   Enterprise is intentionally contact-sales and has no self-serve price.

Both are plain Worker secrets, set with `wrangler secret put`. Neither can be
read back out of Cloudflare once written.

### Cost control added alongside metering

`add`'s `content` had no length bound. With cost now metered, that was an
abuse vector: embedding and JEV both bill per token while pay-as-you-go is a
flat per request, so one call could cost far more than the price charged for it.
Now capped at 64,000 characters.

---

## Outstanding security work

- **Incomplete migrations.** `migrations/0001_init.sql` … `0006_logs.sql` do not
  fully reproduce the live schema, so clean self-host installs remain broken.
  `schema.sql` in the migration bundle is the authoritative version.
  `0007_oauth.sql` was added for the new tables, but it only helps if the
  earlier gaps are closed — otherwise a self-hoster who runs migrations in
  order still ends up with a broken schema.
- **Shared passkey gates all signups.** One passkey serves every self-serve
  signup, so anyone who obtains it can claim a token for any email. Rotating
  and hiding it raises the bar but does not fix the model. This now also gates
  the OAuth consent flow, so it is worth more attention than before. A per-user
  invitation or email magic-link flow would be the real answer.
- **Credential in the working tree — resolved (7 Oct).** `token-wan.md` held a
  Cloudflare API token in plaintext at the repo root. It was untracked and
  gitignored and has never been committed; it is now moved out of the repo root
  into the migration bundle directory (`hmem-migration/`, outside any git
  repository). The `.gitignore` entry stays as a defensive net.
