/**
 * tagID regression tests.
 *
 * Run with:  node --experimental-strip-types tagid_test.ts
 *
 * tagID is the attribution mechanism that lets the training corpus say which
 * MCP user contributed a row without publishing anything identifiable. It must
 * be deterministic, redaction-safe (round-trip byte-identical through
 * scrubJevRow), and null for account-less traffic.
 */

import { tagIdFor } from "./src/util.ts";
import { JEV_IDENTITY_FIELDS, scrubJevRow } from "./src/redact.ts";
import { buildAnalyzeRow, buildRerankRow, buildSupersedeRow } from "./src/dataset.ts";

let checks = 0;
let failures = 0;

function ok(cond: boolean, label: string, detail?: string): void {
  checks++;
  if (cond) return;
  failures++;
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

const EMAIL = "contributor@example.com";
const ENV: any = {};

async function main(): Promise<void> {
  // --- determinism and shape -----------------------------------------------
  const a = await tagIdFor(EMAIL);
  const b = await tagIdFor(EMAIL);
  const cased = await tagIdFor("  CONTRIBUTOR@EXAMPLE.COM ");
  ok(a === b, "same email -> same tag (deterministic)");
  ok(a === cased, "whitespace/case normalised before hashing");
  ok(a.startsWith("u_"), `tag has u_ prefix (got ${a})`);
  ok(a.length === 18, `tag is u_ + 16 hex (${a.length} chars)`, a);
  ok(/^u_[0-9a-f]{16}$/.test(a), "tag is hex only", a);
  ok(!a.includes("@") && !a.includes(EMAIL), "tag never contains the email", a);

  // --- account-less traffic is untagged -------------------------------------
  ok((await tagIdFor(null)) === null, "null email -> null tag");
  ok((await tagIdFor(undefined)) === null, "undefined email -> null tag");
  ok((await tagIdFor("")) === null, "empty email -> null tag");
  ok((await tagIdFor("   ")) === null, "blank email -> null tag");

  // --- redaction round-trip: identity field, byte-identical -----------------
  ok(JEV_IDENTITY_FIELDS.includes("tag_id"), "tag_id is an identity field");
  const row = {
    id: "abc", use_case: "analyze", instruct_type: "choice_noul_score",
    instruction: "classify", input: "{}", output: "{}", state: {}, questions: {},
    answers: {}, provider: "typesafe", model: "jev-latest", scope: "default",
    memory_id: null, source: null, tag_id: a, created_at: 123,
  };
  const { row: scrubbed, findings } = scrubJevRow(row);
  ok(findings.length === 0, "no redaction findings on a clean tagged row");
  ok(JSON.stringify(scrubbed) === JSON.stringify(row), "tagged row round-trips byte-identical");

  // --- builders stamp the tag (and default to null) --------------------------
  const analysis: any = {
    memory_type: "fact", durable: true, salience: 3.5, confidence: 0.9,
    type_probabilities: null, provider: "typesafe",
  };
  const analyze = buildAnalyzeRow(ENV, { memory_id: "m1", scope: "default", content: "hello", analysis, source: null, tag_id: a });
  ok(analyze.tag_id === a, "buildAnalyzeRow stamps tag_id");
  ok(buildAnalyzeRow(ENV, { memory_id: "m1", scope: "default", content: "hello", analysis, source: null }).tag_id === null, "buildAnalyzeRow defaults tag_id to null");

  const rerank = buildRerankRow(ENV, { query: "q", candidates: [{ id: "m1", content: "c" }], scores: [0.5], provider: "typesafe", scope: "default", tag_id: a });
  ok(rerank.tag_id === a, "buildRerankRow stamps tag_id");
  ok(buildRerankRow(ENV, { query: "q", candidates: [{ id: "m1", content: "c" }], scores: [0.5], provider: "typesafe", scope: "default" }).tag_id === null, "buildRerankRow defaults tag_id to null");

  const supersede = buildSupersedeRow(ENV, { existing: "e", incoming: "i", probability: 0.9, scope: "default", tag_id: a });
  ok(supersede.tag_id === a, "buildSupersedeRow stamps tag_id");
  ok(buildSupersedeRow(ENV, { existing: "e", incoming: "i", probability: 0.9, scope: "default" }).tag_id === null, "buildSupersedeRow defaults tag_id to null");

  console.log(`\n${checks} checks, ${failures} failures`);
  if (failures) process.exit(1);
  console.log("All checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});