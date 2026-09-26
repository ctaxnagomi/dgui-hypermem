# Developer Patch Notes

Postponed work and known issues, carried forward between releases.

---

## Postponed: migrate `dgui-hypermem` to the `deckergui.my` account

**Status:** prepared, not executed. Blocked on credentials, not on design.

**Goal.** Deploy `dgui-hypermem` into the `wan.mohd.azizi.seggaf` account
(`155c4982c49d57ce2ff8c5a27e599cbd`) and serve it at
`https://dgui-hmem.deckergui.my`. A Workers custom domain must live in the same
account as the zone, and `deckergui.my` belongs to that account, so the Worker
has to be **redeployed there** — it cannot stay in ctaxnagomi
(`683ac31435f3bd2c649bdfbbb6d1b5c1`) and simply gain a domain.

**Staged and verified** in `D:/dgui-cli/hmem-migration`:

| File | Contents |
| --- | --- |
| `schema.sql` | 27 DDL objects captured from the **live** database |
| `dgui-hypermem-data.sql` | 18,446 statements, 8 data tables |
| `vectors.json` | 56 vectors x 768 dims with metadata |
| `wrangler.target.jsonc` | target config incl. the `custom_domain` route |
| `migrate.sh` | one-shot driver, chunked data load |
| `README.md` | full runbook |

Validated by replaying the bundle into a throwaway SQLite database: all eight
table counts matched, and `active memories = 56` matched the 56 exported
vectors exactly, proving the Vectorize export is complete.

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

- **Setup-token logging.** Tokens are written to logs on the setup path.
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
- **Credential in the working tree.** `token-wan.md` holds a Cloudflare API
  token in plaintext. It is untracked and gitignored (`.gitignore:23`) and has
  never been committed, but it should not sit at the repo root.
