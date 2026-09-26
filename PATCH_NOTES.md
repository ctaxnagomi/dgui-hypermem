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

## Known issue: token portal missing from the landing page

**Severity:** high — it breaks all self-serve onboarding.

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

## Outstanding security work

- **Setup-token logging.** Tokens are written to logs on the setup path.
- **Incomplete migrations.** `migrations/0001_init.sql` … `0006_logs.sql` do not
  fully reproduce the live schema, so clean self-host installs remain broken.
  `schema.sql` in the migration bundle is the authoritative version. New OAuth
  tables need migrations here too, or self-hosters break again.
- **Credential in the working tree.** `token-wan.md` holds a Cloudflare API
  token in plaintext. It is untracked and gitignored (`.gitignore:23`) and has
  never been committed, but it should not sit at the repo root.
