<!-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->

# DGUI_HMEM_RULESET_INSTRUCT — INSTRUCT.md

`ctecx_instruct@1` pack · task_id `ctecx-dgui-hmem-ruleset-001`
Executable form of `{{DGUI_HMEM_RULESET.md}}` for an agentic execution layer
(ADE/IDE harness) wired to the DGUI-HyperMem MCP service.

> **TEMPLATE COPY.** Resolve `<SDK_JEV_KEY_NAME>` and `<OWNER_TOKEN_FILE_PATH>`
> to the concrete per-grant values before distribution (only the owner's local,
> gitignored grant version carries them). No key value ever appears in any pack
> part or repo file — the key is injected at runtime as `JEV_API_KEY`.

## Objective

Run one agentic session against DGUI-HyperMem
(`https://dgui-hmem.deckergui.my/mcp`, Streamable HTTP) under the SDK custom
configuration below, in strict compliance with `{{DGUI_HMEM_RULESET.md}}` (§8 of
that file is the binding contract), and close the task only when Verification
passes.

## Important Details

Compliance is non-negotiable. Every constraint the executor must not violate
sits below.

1. **Ruleset binding.** `{{DGUI_HMEM_RULESET.md}}` is canonical. The pipeline
   (§2), training-only scope (§3), and air-gap walls W1–W9 (§4) apply to this
   session unchanged. A conflict between this file and the ruleset is a bug in
   this file.
2. **JEV key isolation.** JEV in this session is driven by the API key the
   owner provided — the grant key **`<SDK_JEV_KEY_NAME>`** (per grant), injected
   at runtime as `JEV_API_KEY`. The value lives ONLY in the owner's gitignored
   secrets file (`<OWNER_TOKEN_FILE_PATH>`) — **never** the hosted service's
   embedded JEV key, never a value from any repo file or pack, never printed to
   logs. If `JEV_API_KEY` is unset, do NOT fall back: stop JEV-mode and ask the
   owner to mint one (`request_human_help` / open a ticket). Without a key the
   session may run in plain memory mode but must say so in the Work State.
3. **Consent gate.** Before enabling the SDK feature for this session, ask the
   MCP user explicitly: *"Do you want to enable the DGUI-HyperMem SDK feature?"*
   Proceed only on an explicit yes. Record the answer (`sdk_consent` in
   `task_meta`). Default is off.
4. **DeckerGUI SDK is OWNER-ONLY.** This pack is the user-facing harness
   contract. It must never reveal, embed, or reconstruct the owner-only
   DeckerGUI SDK configuration (`DECKERGUI_SDK_RULESET.md`). Users who need SDK
   configuration ask the owner; the pack must not attempt to infer it.
5. **Agentic tooling.** Use agentic tools and `tool_calls` natively; prefer
   structured tool calls over raw completion text. Keep outputs high-efficiency:
   emit only what the next step consumes.
6. **Token reduction.** Where a page/UI is part of the task, use HTML-to-canvas
   capture (`html2canvas`) and a compact DOM snapshot instead of dumping full
   HTML. Prefer `compactDOM`; use Playwright or BrowserOS neo for browser
   automation, never raw screenshot dumps when a DOM view suffices.
7. **tagID.** All `add` / `search` work in this session carries the user's
   `tagID` (stamped server-side from the credential). Do not fabricate tags;
   do not store the tagID in the corpus outside `metadata.tag_id`.
8. **Never** store credentials, private keys, or personal data in memory.
9. **Resumability.** A fresh session must be able to continue from this file
   alone: never close without a complete Work State / Next Move.

## Work State

- **Completed:** ruleset v1.0.0 adopted; MCP endpoint verified reachable;
  tagID mechanism live (server-stamped).
- **Active:** running the session under this pack; JEV mode depends on
  `JEV_API_KEY` presence (see Important Details #2).
- **Blocked:** nothing, unless `JEV_API_KEY` is unset (then #2 applies).

## Execution Steps

1. `setup` — verify tooling (`node`, MCP client, browser harness), read the
   ruleset file, verify its header hash against the manifest.
2. `connect` — reach `https://dgui-hmem.deckergui.my/mcp`; run `help`; confirm
   the 10-tool catalog (add, search, suggest, list, profile, forget, help,
   sync_jev_dataset, jev_queue_stats, quota_notices).
3. `consent` — ask the user for SDK-feature consent (#3); record it.
4. `run` — execute the task steps, agentic tools + `tool_calls`, token
   reduction per #6, pages via Playwright/BrowserOS neo + `compactDOM`.
5. `record` — persist durable decisions through MCP `add` (tagID is stamped
   server-side); keep `task.sql` state in sync.
6. `verify` — Verification stages below must pass.
7. `close` — write Work State / Next Move into this file, mark `task_meta`
   status, exit 0.

## Deliverables

- This pack, completed: `task.json` manifest updated with final state.
- Session output in `INSTRUCT.md` Work State + `task.assembly` register state.
- Any durable memory written through the service (tagID-stamped).

## Verification

- `./task.sh test` exits 0.
- Ruleset file present and its sha256 matches the manifest.
- `JEV_API_KEY` set when the run claims JEV mode; otherwise the run is visibly
  plain-memory mode (§ `Important Details` #2).
- No credential/PII material appears in any pack part, memory payload, or
  task.sql output.
- In-session corpus contribution, if any, carries the server-stamped tagID.

## Next Move

- If `JEV_API_KEY` is unset: ask the owner to mint one, then re-run in JEV mode.
- Otherwise: proceed with the task; close only after Verification passes.