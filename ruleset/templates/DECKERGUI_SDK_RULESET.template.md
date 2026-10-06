<!-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->

# DECKERGUI_SDK_RULESET.md (TEMPLATE)

**OWNER-ONLY.** This file is the DeckerGUI SDK configuration for DGUI-HyperMem's
agentic execution layer. It is written in the `ctecx_instruct@1` formatter shape
(single-file form; a five-part pack can be cut from it on demand). It MUST
**never** be distributed to MCP users, published to a public repo, embedded in
`DGUI_HMEM_RULESET.md`, or shipped inside `DGUI_HMEM_RULESET_INSTRUCT.zip`.
MCP users who need SDK configuration ask the owner; this file is what the owner
consults to grant it.

> **TEMPLATE COPY — placeholder rules.** Resolve every `<PLACEHOLDER>` to the
> concrete per-grant value before use; only the concrete grant version (held
> locally with the owner, gitignored) may carry real paths, emails, or key
> names. Placeholders: `<OWNER_TOKEN_FILE_PATH>` = the owner's local, gitignored
> secrets file holding key values (never the values themselves);
> `<SDK_JEV_KEY_NAME>` = the name of the owner-minted JEV grant key (the value is
> injected at runtime, never stored here).

```
format_version : ctecx_instruct@1
task_id        : ctecx-deckergui-sdk-001
owner          : wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
created        : 2026-10-07
status         : active
params         : mcp_url=https://dgui-hmem.deckergui.my/mcp
                 jev_key=JEV_API_KEY (named grant key: <SDK_JEV_KEY_NAME>,
                 held in the owner's gitignored secrets file
                 <OWNER_TOKEN_FILE_PATH>, injected at runtime)
                 compliance={{DGUI_HMEM_RULESET.md}}
tags           : [dgui-hypermem, deckergui-sdk, agentic, training-governance]
parts          : (single-file form) objective, details, config, assembly
```

## Objective

Define the DeckerGUI SDK harness configuration — the only configuration the
owner grants to an agentic execution layer that uses DGUI-HyperMem — such that
every agent session is agentic, high-efficiency, token-reduced, attribution-
complete (tagID), and in strict compliance with `{{DGUI_HMEM_RULESET.md}}`.

## Important Details

1. **Scope of this file.** It configures the *execution layer*, not the service.
   The service's own rules (pipeline, air-gap walls W1–W9, consent, tagID) live
   in `DGUI_HMEM_RULESET.md` and bind every session it enables.
2. **JEV isolation (owner side).** The SDK consumes JEV through the **owner-
   minted** API key (`JEV_API_KEY`), issued per grant. It must never be the
   hosted service's embedded key. The key currently granted to the SDK is named
   **`<SDK_JEV_KEY_NAME>`** — held only in the owner's gitignored secrets file
   (`<OWNER_TOKEN_FILE_PATH>`), injected as `JEV_API_KEY` at harness runtime. No
   key value ever lives in a file, pack, log, or repo. Minting: owner issues a
   TypeSafe AI (or chosen JEV provider) key per grant; revoke at grant end.
3. **Agentic core.** Sessions run agentic tools with native `tool_calls`.
   Structured calls over completion text. Every durable decision lands in the
   service via MCP `add` (server stamps `tagID`).
4. **Token-reduction stack.** Page/UI capture uses HTML-to-canvas
   (`html2canvas`) + `compactDOM` snapshots instead of full-HTML dumps; browser
   work goes through Playwright or BrowserOS neo; screenshots only when a DOM
   view cannot certify the state.
5. **Compliance binding.** `{{DGUI_HMEM_RULESET.md}}` is canonical. SDK
   configuration never overrides a ruleset wall.
6. **Grant lifecycle.** A grant is per-user, per-scope, time-boxed. The owner
   records grants in `task_meta`-style ledger rows (owner-side store).

## Work State

- **Completed:** ruleset v1.0.0; tagID live (`u_<hex>` stamped server-side);
  harness stack defined (agentic tools, tool_calls, html2canvas/compactDOM,
  Playwright/BrowserOS neo, MCP Streamable HTTP).
- **Active:** SDK grants are issued by the owner on request; no grant is
  standing by default.
- **Blocked:** nothing.

## SDK configuration (owner-issued per grant)

| Key | Value |
|---|---|
| MCP endpoint | `https://dgui-hmem.deckergui.my/mcp` (Streamable HTTP) |
| Transport | Streamable HTTP / SSE; OAuth 2.1 consent or bearer token |
| Tool surface | full 10-tool catalog (add, search, suggest, list, profile, forget, help, sync_jev_dataset, jev_queue_stats, quota_notices) |
| Agentic mode | native `tool_calls`; tools-first prompting |
| Token reduction | `html2canvas` capture + `compactDOM`; viewport-relative |
| Browser harness | Playwright or BrowserOS neo (persistent profile, signed-in) |
| JEV | owner-minted `JEV_API_KEY` (grant key `<SDK_JEV_KEY_NAME>`); never the hosted key |
| Attribution | server-stamped `tagID` on every training/corpus row |
| Nesting | `{{DGUI_HMEM_RULESET.md}}` bound; no wall overrides |

## Assembly (segment listing)

```
segment 0 : PROLOGUE     MOV grant_id .. MOV scope .. MOV jev_key(from vault)
segment 1 : CONNECT      CALL mcp.initialize(grant mcp_url); CMP catalog 10 tools
segment 2 : CONSENT      CALL ask_user("enable SDK feature?"); JZ plain mode
segment 3 : RUN          CALL agentic_tools; CALL token_reduction(html2canvas,compactDOM)
                         CALL browser_harness(playwright|neo); CMP walls W1..W9
segment 4 : RECORD       CALL mcp.add(tagID stamped server-side); CALL ledger.insert
segment 5 : VERIFY       CALL task.sh.test; CMP exit_code=0; JZ FAIL_CLOSE
segment 6 : REVOKE       MOV jev_key=revoked; CALL ledger.close; RET HLT
```

## Verification

- `task.sh test` equivalent exits 0; manifest hashes check when the pack form
  is cut.
- `JEV_API_KEY` present iff the grant claims JEV mode.
- No wall violation in session logs; no credential material anywhere.
- `tagID` attribution present on any training/corpus contribution.

## Next Move

- Owner grants: on request from an MCP user (ruleset §6). Mint a JEV key per
  grant; hand the *user-facing harness* (`DGUI_HMEM_RULESET_INSTRUCT.zip`), not
  this file.
- Cut the five-part pack form of this file only when a private channel exists.