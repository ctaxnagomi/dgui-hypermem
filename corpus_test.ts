/**
 * Embed-corpus ingest tests (RULESET_TRAIN_CORPUS.md §3).
 *
 * Run with:  node --experimental-strip-types corpus_test.ts
 *
 * Covers the pure, D1/HF-free surface of src/corpus.ts: repo resolution, the
 * redaction gate, row shape, doc_id-keyed dedup/upsert, and metadata totals.
 * The D1 selection / Vectorize / AI / HF commit steps need live bindings and
 * are exercised by the scheduled + MCP/REST paths instead.
 */

import { tagIdFor } from "./src/util.ts";
import { computeEmbedMeta, embedCorpusRepo, buildCorpusRow, mergeIntoCorpus, scrubMemoryText, type CorpusCandidate } from "./src/corpus.ts";

let checks = 0;
let failures = 0;

function ok(cond: boolean, label: string, detail?: string): void {
  checks++;
  if (cond) return;
  failures++;
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

const MEM: CorpusCandidate = {
  id: "cafebabe-0000-4000-8000-000000000001",
  scope: "default",
  content: "remember the launch date is 2026-10-07",
  memory_type: "fact",
  source: "mcp",
  created_at: 1_700_000_000_000,
  status: "active",
  tag_id: "u_0123456789abcdef",
};

async function main(): Promise<void> {
  // --- repo resolution -------------------------------------------------------
  ok(embedCorpusRepo({} as any) === "ctaxnagomi/dgui-hypermem-embed-corpus", "default embed corpus repo");
  ok(
    embedCorpusRepo({ HF_EMBED_DATASET: "me/custom-embed" } as any) === "me/custom-embed",
    "HF_EMBED_DATASET overrides the default",
  );

  // --- redaction gate ---------------------------------------------------------
  const clean = scrubMemoryText("remember the launch date is 2026-10-07");
  ok(!clean.changed && clean.text === MEM.content, "clean content passes unchanged");
  ok(Array.isArray(clean.findings) && clean.findings.length === 0, "clean content: no findings");

  const secret = scrubMemoryText("the admin passkey is `leakpass920`, do not share it");
  ok(secret.changed, "secret-bearing content is flagged as changed (forces re-embed)");
  ok(!secret.text.includes("leakpass920"), "secret value is redacted from the published text");
  ok(secret.findings.length > 0, "findings are reported by rule name");
  ok(!secret.findings.some((f) => f.includes("leakpass920")), "findings never contain the value");

  // --- row shape ----------------------------------------------------------------
  const row = buildCorpusRow(MEM, { text: MEM.content });
  ok(row.doc_id === `mem_${MEM.id}`, "doc_id is mem_<uuid>");
  ok(row.text === MEM.content, "row text is the published text");
  ok(row.metadata.tag_id === MEM.tag_id, "metadata carries tag_id");
  ok(row.metadata.scope === MEM.scope && row.metadata.status === MEM.status, "metadata carries scope/status");
  ok(row.metadata.created_at === MEM.created_at, "metadata carries created_at");
  ok(row.embedding === undefined, "no embedding key when none supplied");

  const withVec = buildCorpusRow(MEM, { text: MEM.content, embedding: [0.1, 0.2, 0.3] });
  ok(Array.isArray(withVec.embedding) && withVec.embedding.length === 3, "embedding is attached when supplied");

  // --- dedup/upsert -------------------------------------------------------------
  const a = buildCorpusRow({ ...MEM, id: "aaa" }, { text: "text A" });
  const aAgain = buildCorpusRow({ ...MEM, id: "aaa" }, { text: "text A" });
  const aChanged = buildCorpusRow({ ...MEM, id: "aaa" }, { text: "text A (updated)" });
  const b = buildCorpusRow({ ...MEM, id: "bbb" }, { text: "text B" });
  const existing = JSON.stringify(a) + "\n";

  const fresh = mergeIntoCorpus(null, [a, b]);
  ok(fresh.added === 2 && fresh.final.length === 2, "fresh corpus appends all rows");
  ok(fresh.content.trimEnd().split("\n").length === 2, "serialized output is one line per row");

  const skip = mergeIntoCorpus(existing, [aAgain]);
  ok(skip.added === 0 && skip.skipped === 1, "identical doc_id+text is skipped (no duplicate)");
  ok(skip.final.length === 1, "skipped row leaves the corpus unchanged");

  const upsert = mergeIntoCorpus(existing, [aChanged, b]);
  ok(upsert.added === 2 && upsert.skipped === 0, "changed text replaces in place, new doc appended");
  ok(upsert.final.length === 2, "doc_id still appears exactly once after upsert");
  ok(upsert.final.find((r) => r.doc_id === a.doc_id)?.text === "text A (updated)", "upsert keeps the newest text");

  const malformed = mergeIntoCorpus("not json\n" + existing, [b]);
  ok(malformed.skipped === 0 && malformed.added === 1, "malformed existing line is tolerated and dropped");

  // --- metadata totals ------------------------------------------------------------
  const meta = computeEmbedMeta([a, b], { embeddingModel: "@cf/baai/bge-base-en-v1.5", batchId: 99 });
  ok(meta.rows_total === 2, "rows_total equals the final corpus size");
  ok(meta.embedding_dim === 768, "embedding_dim falls back to 768 when no vectors present");
  ok(meta.embedding_model === "@cf/baai/bge-base-en-v1.5", "embedding_model is recorded");
  ok(meta.first_row_at === 1_700_000_000_000 && meta.last_row_at === 1_700_000_000_000, "first/last row timestamps");
  ok(meta.last_ingest_at === 99, "last_ingest_at is the batch id");
  ok(meta.by_tag_id["u_0123456789abcdef"] === 2, "by_tag_id counts rows per contributor");
  ok(meta.by_memory_type["fact"] === 2, "by_memory_type counts rows per memory type");

  const dimmed = computeEmbedMeta([withVec, withVec], { embeddingModel: "m", batchId: 1 });
  ok(dimmed.embedding_dim === 3, "embedding_dim reflects actual vectors when present");

  // --- tag eligibility helper is exercised through tagIdFor ------------------------
  const tag = await tagIdFor("contributor@example.com");
  ok(tag !== null && /^u_[0-9a-f]{16}$/.test(tag), "tagIdFor resolves a stable u_ tag for eligibility sets");

  console.log(`\n${checks} checks, ${failures} failures`);
  if (failures) process.exit(1);
  console.log("All checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});