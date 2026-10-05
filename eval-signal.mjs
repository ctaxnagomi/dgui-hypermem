// Offline test for solutionSignal()'s relevance rule.
//
// The lamp is a trust signal, so a false positive costs more than a false
// negative: a lamp that lights on unrelated input teaches people to stop
// trusting it. These cases are the ones that actually regressed during
// development, plus the positive controls that must keep working.
//
// Runs in-process against node:sqlite with the SAME schema and the SAME FTS5
// tokenizer as production ('porter unicode61'), so a match here means a match
// there. No wrangler, no D1, no network.
//
//   node eval-signal.mjs
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const out = mkdtempSync(join(tmpdir(), "sig-"));

await build({
  entryPoints: ["src/store.ts"],
  bundle: true, format: "esm", platform: "neutral",
  outfile: join(out, "store.mjs"), logLevel: "error",
});
const { solutionSignal } = await import(pathToFileURL(join(out, "store.mjs")).href);

// --- D1-compatible shim over node:sqlite ------------------------------------
// Only the surface solutionSignal() uses: prepare/bind/all/first, positional
// ?N params, and .run() for batch.
function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...(api._args || [])) }),
      first: async () => stmt.get(...(api._args || [])) ?? null,
      run: async () => ({ success: true }),
    };
    return api;
  };
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => { for (const s of stmts) await (s._args !== undefined ? s : s); },
  };
}

const db = new DatabaseSync(":memory:");
// Schema copied verbatim from migrations/0001_init.sql (memories + FTS5 + triggers).
db.exec(`
CREATE TABLE memories (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'default', content TEXT NOT NULL,
  memory_type TEXT, tags TEXT NOT NULL DEFAULT '[]', salience REAL, durable REAL,
  confidence REAL, type_probabilities TEXT, source TEXT, hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', superseded_by TEXT,
  access_count INTEGER NOT NULL DEFAULT 0, last_accessed_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_memories_scope_hash ON memories (scope, hash);
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, tags, memory_type, content='memories', content_rowid='rowid',
  tokenize='porter unicode61'
);
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts (rowid, content, tags, memory_type)
  VALUES (new.rowid, new.content, new.tags, new.memory_type);
END;
CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content, tags, memory_type)
  VALUES ('delete', old.rowid, old.content, old.tags, old.memory_type);
  INSERT INTO memories_fts (rowid, content, tags, memory_type)
  VALUES (new.rowid, new.content, new.tags, new.memory_type);
END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content, tags, memory_type)
  VALUES ('delete', old.rowid, old.content, old.tags, old.memory_type);
END;
`);

const MEMORIES = [
  ["wrangler-secret", "Never put a passkey or API key in a commit message; use wrangler secret put so the credential is never in the log.", "solution", 3.6],
  ["wrangler-oauth", "The wrangler OAuth token carries workers_scripts:write but no D1 write, so migrations cannot be applied from the deploy path.", "project", 3.1],
  // Salience must clear the production gate (3.0) or the probe is right to ignore it.
  ["stripe-webhook", "Stripe fulfillment webhook still pending: the checkout session completes but no credit is granted.", "project", 3.5],
  ["geo-policy", "Geo-blocking policy covers Israel, North Korea and South Korea, plus content rejection for keys, PEM, CVE and CSAM.", "project", 3.0],
  ["hypermem-arch", "Service architecture is Vectorize plus FTS5 plus reciprocal-rank fusion plus a JEV reasoning layer.", "project", 2.8],
  ["esbuild-verify", "Verify changes inside large TypeScript template literals by rendering them with esbuild and importing the module.", "solution", 3.3],
  ["heredoc-trap", "Never write tex or py files through bash heredocs or sed because backslashes get mangled and the damage is silent.", "solution", 3.3],
  ["image-vision", "Read images through Workers AI Mistral Small when the active agent model rejects image input.", "solution", 3.4],
  // Below the salience gate: must never light the lamp, however well it matches.
  // Its topic is deliberately unique -- nothing else mentions reconciliation or
  // drift -- so the gate is the only reason this stays dark. An earlier version
  // used a wrangler-flavoured line that other fixtures also matched, which made
  // the test pass for the wrong reason.
  ["low-salience", "Payment reconciliation runs nightly and flags rounding drift above one cent.", "solution", 1.2],
  // Wrong scope: must never count toward the default scope.
  ["other-scope", "Wrangler secret put commit message credentials", "solution", 3.6, "other"],
  // Incidental overlap only. Matches "home" and "kitchen" and nothing topical,
  // so it is the fixture the coverage guard has to reject.
  ["kitchen-sink", "Debugging rule of thumb: check the home directory and the kitchen sink before blaming the build.", "project", 3.2],
];

const ins = db.prepare(
  `INSERT INTO memories (id,scope,content,memory_type,tags,salience,durable,confidence,status,hash,created_at,updated_at)
   VALUES (?,?,?,?,'[]',?,0.9,0.9,'active',?,1700000000000,1700000000000)`,
);
for (const [id, content, type, sal, scope = "default"] of MEMORIES) ins.run(id, scope, content, type, sal, id);

const env = { DEFAULT_SCOPE: "default", SALIENCE_GATE: 3, DB: makeD1(db) };

const CASES = [
  // must light
  ["wrangler secret put commit message", true],
  ["stripe payment fulfillment webhook", true],
  ["geo blocking content rejection policy", true],
  ["heredoc backslash mangling sed", true],
  ["verify template literals with esbuild", true],
  ["read images when model rejects vision", true],
  ["wrangler token expiring deploy", true],
  // morphological variants: the index is porter-stemmed, so these must match
  ["verify change inside large typescript template literals", true],
  // A specific, longer query must still light up. This is the case a plain
  // word-count threshold gets wrong: 3 of 6 words is 50%, and the extra words
  // are exactly the ones the asker cares about.
  ["wrangler token expiring deploy secret put commit message", true],
  ["wrangler secret put commit message credential never in log", true],
  // wrangler-oauth genuinely covers this (wrangler + token + deploy), even though
  // the sub-gate memory is the more on-topic answer. Matching it is correct: the
  // lamp reports "we have relevant memory", not "this is the best memory".
  ["wrangler token keep expiring on deployment", true],
  // Only the sub-gate memory covers this topic, so the salience gate is the only
  // thing keeping it dark.
  ["payment reconciliation rounding drift nightly", false],
  // must stay dark: the regressions
  ["how do i bake sourdough bread at home", false],
  ["what is the best kubernetes ingress controller", false],
  ["should i buy a house in 2030", false],
  ["write a poem about the ocean", false],
  // gated out by salience
  ["wrangler secret put expiring deploy low salience only", false],
  // too little signal to judge
  ["wrangler", false],
  ["the", false],
  ["", false],
  ["   ", false],
  ["a b", false],
  ["???? ???? ????", false],
];

let failed = 0;
for (const [q, want] of CASES) {
  const got = await solutionSignal(env, q);
  const ok = got.has === want;
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${got.has ? "LIT " : "dark"}  want=${want ? "LIT " : "dark"}  n=${String(got.count).padStart(2)}  "${q}"`,
  );
}

// Proves the relevance guard is load-bearing. Loosening BOTH count coverage and
// IDF mass to 0 is the loosest the function will go, so this is the best case for
// a false positive. kitchen-sink matches this query only on "home" and
// "kitchen", which are rare enough to carry real IDF weight, so unguarded it
// lights the lamp.
//
// Loosening only minMass is NOT enough to demonstrate anything: minMatched is
// computed from minCoverage and would still reject it, so the test would pass
// vacuously.
const loose = "sourdough bread proofing home kitchen";
const guarded = await solutionSignal(env, loose);
const unguarded = await solutionSignal(env, loose, { minCoverage: 0, minMass: 0 });
console.log(`\nguard check: "${loose}"`);
console.log(`  guarded   -> has=${guarded.has} n=${guarded.count}   (want has=false)`);
console.log(`  unguarded -> has=${unguarded.has} n=${unguarded.count}   (want has=true, else the guard proves nothing)`);
if (guarded.has) { console.log("FAIL  relevance guard let a false positive through"); failed++; }
if (!unguarded.has) {
  console.log("FAIL  unguarded run found nothing, so the fixture cannot demonstrate the guard");
  failed++;
}

// Each guard half must be load-bearing on its own, not just the pair. If only
// minMass mattered, minCoverage could be dropped without changing behaviour.
const massOnly = await solutionSignal(env, loose, { minCoverage: 0 });
const coverageOnly = await solutionSignal(env, loose, { minMass: 0 });
console.log(`  coverage off (mass only) -> has=${massOnly.has}   (want false: mass alone still rejects it)`);
console.log(`  mass off (coverage only) -> has=${coverageOnly.has}   (want false: coverage alone still rejects it)`);
if (massOnly.has) { console.log("FAIL  IDF mass alone is load-bearing, but it was expected to be insufficient"); failed++; }
if (coverageOnly.has) { console.log("FAIL  count coverage alone is load-bearing, but it was expected to be insufficient"); failed++; }

// The salience gate is a SQL predicate, so it is exercised by moving the
// threshold rather than the relevance knobs.
const sq = "payment reconciliation rounding drift nightly";
const gated = await solutionSignal(env, sq);
const ungated = await solutionSignal(env, sq, { threshold: 0 });
console.log(`gate check: "${sq}"`);
console.log(`  salience>=3 -> n=${gated.count}   threshold=0 -> n=${ungated.count}   (first must be lower)`);
if (!(gated.count < ungated.count)) { console.log("FAIL  salience gate is not excluding the sub-gate memory"); failed++; }

rmSync(out, { recursive: true, force: true });
db.close();
console.log(`\n${CASES.length} cases, ${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
