/**
 * Redaction regression tests.
 *
 * Run with:  node --experimental-strip-types redact_test.ts
 *
 * The first case is the real memory that leaked the admin passkey into a public
 * HuggingFace dataset, with the real values swapped for synthetic stand-ins of
 * identical shape (same length, digits at the same position, same surrounding
 * phrasing), because this repo lives in published git history. The rules fire
 * on shape, not on any particular value, so the regression coverage is
 * unchanged; the real values were rotated out of operation.
 */

import { redactSecrets, scrubJevRow, summariseFindings } from "./src/redact.ts";

let checks = 0;
let failures = 0;

function ok(cond: boolean, label: string, detail?: string): void {
  checks++;
  if (cond) return;
  failures++;
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

function redacts(haystack: string, needle: string, label: string): void {
  const out = redactSecrets(haystack);
  ok(!out.text.includes(needle), `${label} :: secret removed`, `still present: ${out.text}`);
}

function preserves(haystack: string, needle: string, label: string): void {
  const out = redactSecrets(haystack);
  ok(out.text.includes(needle), `${label} :: prose intact`, out.text);
}

// ---------------------------------------------------------------- the leak

// Verbatim from memories row 0a051744, which reached train.jsonl row 84f2abad.
const LEAKED = "SECURITY LESSON: Never include passkeys, API keys, or secrets in git " +
  "commit messages or code. All secrets must be set as Worker secrets via `npx wrangler " +
  "secret put SECRET_NAME`. The admin passkey `leakpass910` was exposed in a commit " +
  "message on GitHub public repo. Fixed by: (1) rotating the passkey to new value " +
  "`leakpass920`, (2) setting via `wrangler secret put`, (3) noting that secrets in env " +
  "vars (ADMIN_PASSKEY_2, MASTER_PASSKEY, etc.) are safe since they reference the " +
  "variable name, not the value. Commit messages should never contain credential values.";

{
  const out = redactSecrets(LEAKED);
  ok(!out.text.includes("leakpass910"), "leak :: old admin passkey removed", out.text);
  ok(!out.text.includes("leakpass920"), "leak :: rotated admin passkey removed", out.text);
  ok(out.findings.includes("credential-assignment"), "leak :: context rule fired",
    summariseFindings(out.findings));
  // The whole point of the context rule is that it finds the value in a
  // phrasing with three copulas in between, not just after a backtick.
  ok(out.text.includes("[REDACTED:credential-assignment]"), "leak :: placeholder present", out.text);
  // Nothing that carries meaning may be collateral damage.
  preserves(LEAKED, "SECURITY LESSON", "leak");
  preserves(LEAKED, "wrangler secret put", "leak");
  preserves(LEAKED, "ADMIN_PASSKEY_2", "leak");   // env var names are not secrets
  preserves(LEAKED, "MASTER_PASSKEY", "leak");
  preserves(LEAKED, "passkey", "leak");
  preserves(LEAKED, "Commit messages should never contain credential values.", "leak");
  ok(out.text.length > LEAKED.length - 120 && out.text.length < LEAKED.length + 200,
    "leak :: only the secrets changed, not the paragraph", `len ${LEAKED.length} -> ${out.text.length}`);
}

// ------------------------------------------------------- provider formats

const FORMATS: ReadonlyArray<readonly [string, string]> = [
  ["openai", "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"],
  ["stripe-live", "sk_live_xxxxxxxxxxxxxxxxxxxx"],
  ["stripe-webhook", "whsec_xxxxxxxxxxxxxxxxxxxxxxxx"],
  ["github-classic", "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["github-pat", "github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["huggingface", "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["cloudflare", "v1.0-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["cloudflare-alt", "cfat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["slack", "xoxb-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
  ["aws", "AKIAIOSFODNN7EXAMPLE"],
  ["google", "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY"],
];
for (const [name, secret] of FORMATS) {
  redacts(`deploy script uses ${secret} for the ${name} credential`, secret, `format:${name}`);
}

{
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const out = redactSecrets(`Authorization: Bearer ${token}`);
  ok(!out.text.includes(token), "bearer :: token removed", out.text);
  ok(out.text.includes("Bearer "), "bearer :: scheme preserved", out.text);
}

// ------------------------------------------------- false-positive guards
//
// A redaction gate that shreds the corpus is as broken as one that leaks. With
// only 217 rows published, over-redaction is not a cheap mistake.

const KEEP: ReadonlyArray<readonly [string, string]> = [
  ["the payload is wrapped in base64 before upload", "base64"],
  ["hash it with sha256 first", "sha256"],
  ["we store it as utf8 text", "utf8"],
  ["the token authentication path is separate", "authentication"],
  ["set it with the wrangler secret put command", "secret put"],
  ["never put credential values in commit messages", "credential"],
  ["MASTER_PASSKEY is a variable name, not a value", "MASTER_PASSKEY"],
  ["the passkey rotation is documented in the runbook", "rotation"],
  ["oauth2 tokens expire hourly", "oauth2"],
  ["rotate the passkey every 90 days", "every"],
  ["api keys are provisioned by the platform team", "provisioned"],
  ["two-factor is required for admin access", "required"],
];
for (const [text, needle] of KEEP) {
  preserves(text, needle, `guard:${needle}`);
}

{
  // UUIDs are the dedup key and litter the corpus. Redacting them would
  // republish every row on every flush, forever.
  const id = "0a051744-d4c2-47f1-8941-2f0983b7fb94";
  const out = redactSecrets(`memory_id ${id} was superseded by a newer row`);
  ok(out.text.includes(id), "guard :: UUID survives", out.text);
}

// ------------------------------------------------------- scrubJevRow

{
  const row = {
    id: "0a051744-d4c2-47f1-8941-2f0983b7fb94",
    use_case: "analyze",
    instruct_type: "noul",
    instruction: "Classify the memory.",
    input: JSON.stringify({ content: "the admin passkey `leakpass910` is live" }),
    output: JSON.stringify({ type: "solution" }),
    state: { memory_text: "rotating the passkey to new value `leakpass920`" },
    questions: { probe: "what is the passkey leakpass910 ?" },
    answers: { verdict: "ok" },
    provider: "typesafe",
    model: "jev-latest",
    scope: "default",
    memory_id: "9f2b7c11-0000-4000-8000-abcdefabcdef",
    source: null,
    created_at: 1790320533371,
  };
  const { row: out, findings } = scrubJevRow(row);
  const blob = JSON.stringify(out);

  ok(!blob.includes("leakpass910"), "scrubRow :: top-level input redacted", blob);
  ok(!blob.includes("leakpass920"), "scrubRow :: nested state redacted", blob);
  ok(findings.length > 0, "scrubRow :: findings reported", summariseFindings(findings));
  ok(out.id === row.id, "scrubRow :: id preserved");
  ok(out.memory_id === row.memory_id, "scrubRow :: memory_id preserved");
  ok(out.scope === row.scope, "scrubRow :: scope preserved");
  ok(out.created_at === row.created_at, "scrubRow :: created_at preserved");
  ok(out.use_case === row.use_case, "scrubRow :: use_case preserved");
  ok(out.provider === row.provider, "scrubRow :: provider preserved");
  ok(out.model === row.model, "scrubRow :: model preserved");
  ok(out.instruction === row.instruction, "scrubRow :: clean instruction untouched");
  ok((out.answers as unknown as { verdict: string }).verdict === "ok", "scrubRow :: clean answers untouched");
  ok(blob.includes("[REDACTED:"), "scrubRow :: placeholder written", blob);
}

// -------------------------------------------------- pinned known limitation

{
  // Rotation phrasing: the second value has no keyword near it, only a transfer
  // verb. Found by the live end-to-end run, not by the unit tests -- the first
  // draft of this file passed while the deployed worker still published it.
  const text = "the staging admin passkey is `oldpass99` and it was rotated to `newpass99` last week";
  const out = redactSecrets(text);
  ok(!out.text.includes("oldpass99"), "rotation :: old value removed", out.text);
  ok(!out.text.includes("newpass99"), "rotation :: new value removed (no keyword nearby)", out.text);
  ok(out.text.includes("last week"), "rotation :: surrounding prose intact", out.text);
}

{
  // Co-redaction must not eat the technical identifiers that share a string
  // with a real secret. These are the ones that would make a blanket
  // "redact every quoted token" rule unusable.
  const text = "the passkey is `leaked99value`; set MAX_RETRIES and ADMIN_PASSKEY_2, " +
    "push to ctaxnagomi/DGUI_HYPERMEM-JEV, then run `npx wrangler secret put SECRET_NAME`";
  const out = redactSecrets(text);
  ok(!out.text.includes("leaked99value"), "co-redact :: the secret still goes", out.text);
  preserves(text, "MAX_RETRIES", "co-redact");
  preserves(text, "ADMIN_PASSKEY_2", "co-redact");
  preserves(text, "ctaxnagomi/DGUI_HYPERMEM-JEV", "co-redact");
  preserves(text, "npx wrangler secret put SECRET_NAME", "co-redact");
}

{
  // ...and it must not fire at all when no secret is present.
  const clean = "run `npx wrangler secret put API_KEY_2` against repo owner/project-2024";
  const out = redactSecrets(clean);
  ok(out.findings.length === 0, "co-redact :: inert without a confirmed secret", summariseFindings(out.findings));
  ok(out.text === clean, "co-redact :: clean text returned byte-identical", out.text);
}

{
  // The real boundary, pinned so the limitation stays honest. looksSecretish
  // accepts a no-digit value at 12+ characters, so a long lowercase secret IS
  // caught regardless of shape.
  redacts("the passkey is correcthorsebattery", "correcthorsebattery", "length-branch");
  redacts("the passkey is mysecretpass", "mysecretpass", "length-boundary-12");
}

{
  // Below that boundary, with no digit and no provider prefix and no keyword
  // anywhere near it, there is nothing to match on. This is the documented gap
  // in redact.ts, asserted so it stays visible rather than being forgotten.
  const out = redactSecrets("the passkey is abcdefg");
  ok(out.text.includes("abcdefg"), "known-miss :: short no-digit value passes through",
    `unexpectedly redacted: ${out.text}`);

  // Same value, but next to a keyword and carrying a digit: caught.
  redacts("the passkey is abcdef7", "abcdef7", "digit-rescues-short-value");
}

console.log(`\n  ${checks - failures}/${checks} checks passed, ${failures} failure(s)`);
if (failures) process.exit(1);
