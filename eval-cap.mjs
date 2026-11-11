// Offline test for DGUI-HyperMem's consistency model.
//
// The system is CP: D1 is the consistency authority, Vectorize is an eventual
// accelerator. Two invariants must hold. The first was violated by code that
// looked correct, the second is load-bearing and easy to break during a
// "cleanup".
//
//   1. A write D1 accepted is never reported as failed.
//
//      addMemory used to run `await env.VECTORIZE.upsert(...)` bare, after the
//      row had already committed. An index partition therefore threw, the
//      caller got an error, and D1 held the data all the same. A client that
//      retries on error writes a duplicate; a client that does not believes
//      real data was rejected. That claims unavailability for a write that
//      succeeded -- the worst of both CAP halves. Now: one retry, then report
//      via AddResult.indexed instead of throwing.
//
//   2. A stale vector never resurrects content D1 deleted or superseded.
//
//      searchMemories generates candidates from vector + FTS, then re-reads D1
//      and drops anything not status='active'. That read-back is the whole
//      reason forgetMemories may swallow a failed vector delete. Break the
//      filter and forget() starts lying.
//
// Runs in-process against node:sqlite with the SAME schema and FTS5 tokenizer
// as production. No wrangler, no D1, no network.
//
//   node eval-cap.mjs
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const out = mkdtempSync(join(tmpdir(), "cap-"));

await build({
  entryPoints: ["src/store.ts"],
  bundle: true, format: "esm", platform: "neutral",
  outfile: join(out, "store.mjs"), logLevel: "error",
});
const { addMemory, forgetMemories, searchMemories } = await import(
  pathToFileURL(join(out, "store.mjs")).href
);

// --- D1-compatible shim over node:sqlite ------------------------------------
// Only the surface the code under test uses.
function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...(api._args || [])) }),
      first: async () => stmt.get(...(api._args || [])) ?? null,
      // Must actually execute. The read-only suites (eval-signal et al) stub
      // this to a no-op because they never write; a suite exercising addMemory
      // that returned {success:true} without stepping the statement would let
      // every write assertion pass on data that was never persisted.
      run: async () => {
        const info = stmt.run(...(api._args || []));
        return { success: true, meta: info };
      },
    };
    return api;
  };
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => { for (const s of stmts) await s; },
  };
}

// Schema copied from migrations/0001_init.sql plus the six columns production
// carries that no tracked migration creates -- verified against live D1 with
// PRAGMA table_info(memories): provider, origin_system, corpus_type, client_id,
// user_id, metadata. addMemory INSERTs them, so a stock-migrations copy is a
// schema nobody can write to. (Same drift class as crm_logs.device.)
// The FTS triggers' atomicity with the row is what invariant 1 depends on.
function schema() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'default', content TEXT NOT NULL,
      memory_type TEXT, tags TEXT NOT NULL DEFAULT '[]', salience REAL, durable REAL,
      confidence REAL, type_probabilities TEXT, source TEXT, hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', superseded_by TEXT,
      access_count INTEGER NOT NULL DEFAULT 0, last_accessed_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      provider TEXT, origin_system TEXT, corpus_type TEXT,
      client_id TEXT, user_id TEXT, metadata TEXT
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
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL DEFAULT 'default',
      kind TEXT NOT NULL, memory_id TEXT, query TEXT, detail TEXT, created_at INTEGER NOT NULL
    );
  `);
  return db;
}

// A controllable Vectorize double: it can fail upserts, fail deletes, or answer
// a query with a fixed candidate list (to simulate a stale orphan vector).
function fakeVector(opts = {}) {
  let upserts = 0;
  const store = new Map();
  return {
    _get: (id) => store.get(id),
    _upsertCount: () => upserts,
    upsert: async (entries) => {
      upserts++;
      if (opts.failUpsert || (opts.flakyUpsert && upserts === 1)) {
        throw new Error("injected upsert fault");
      }
      for (const e of entries) store.set(e.id, e);
      return {};
    },
    deleteByIds: async (ids) => {
      if (opts.failDelete) throw new Error("injected delete fault");
      for (const id of ids) store.delete(id);
      return {};
    },
    query: async () => ({ matches: opts.matches || [] }),
  };
}

function makeEnv(db, vector, extra = {}) {
  return {
    DB: makeD1(db),
    VECTORIZE: vector,
    AI: { run: async () => ({ data: [[0.1, 0.2, 0.3, 0.4]] }) },
    JEV_MODE: "off",
    JEV_ENDPOINT: "",
    EMBED_MODEL: "test-embed",
    FALLBACK_MODEL: "",
    DEFAULT_SCOPE: "default",
    // With JEV off the analyze fallback pins salience at 2, which is under the
    // default gate of 3.0: every row would be stored low_signal, and keyword
    // recall (Deliberately 'active'-only) could never exercise invariant 1.
    // This eval measures the CP write contract, not the salience tier -- force
    // the gate so written rows are searchable and the assertion is meaningful.
    SALIENCE_GATE: "0",
    ...extra,
  };
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

const ADD = (content) => ({ content, scope: "default", checkContradictions: false });

console.log("CAP invariant 1: a write D1 accepted is never reported as failed\n");

{
  const db = schema();
  const vec = fakeVector({ failUpsert: true });
  const env = makeEnv(db, vec);

  let res = null, err = null;
  try {
    res = await addMemory(env, ADD("the index for this memory is partitioned away"));
  } catch (e) { err = e; }

  check("addMemory resolves when Vectorize is down", !err, err ? String(err) : "");
  check("result flags the degraded index (indexed === false)",
    !!res && res.indexed === false, res ? `indexed=${res.indexed}` : "no result");

  if (res) {
    check("the row IS committed to D1 despite the index failure",
      db.prepare("SELECT COUNT(*) c FROM memories WHERE id = ?").get(res.memory.id).c === 1);

    const hits = await searchMemories(env, "the index for this memory is partitioned away", { limit: 10 });
    check("...and keyword recall still finds it (FTS is atomic with the row)",
      hits.some((h) => h.id === res.memory.id),
      `hits=${JSON.stringify(hits.map((h) => h.id))}`);
  }
}

{
  const db = schema();
  const vec = fakeVector({});
  const env = makeEnv(db, vec);
  const res = await addMemory(env, ADD("a healthy memory indexes on the first try"));
  check("healthy path reports indexed === true",
    !!res && res.indexed === true, res ? `indexed=${res.indexed}` : "no result");
  check("...and the vector actually landed", !!res && vec._get(res.memory.id) !== undefined);
}

{
  const db = schema();
  const vec = fakeVector({ flakyUpsert: true });
  const env = makeEnv(db, vec);
  const res = await addMemory(env, ADD("one transient failure should be retried away"));
  check("a transient failure is retried, not surfaced",
    !!res && res.indexed === true,
    res ? `indexed=${res.indexed} upserts=${vec._upsertCount()}` : "no result");
  check("...in exactly two attempts", vec._upsertCount() === 2, `upserts=${vec._upsertCount()}`);
}

console.log("\nCAP invariant 2: a stale vector never resurrects a deleted row\n");

{
  const db = schema();
  const vec = fakeVector({ failDelete: true });
  const env = makeEnv(db, vec);

  const res = await addMemory(env, ADD("payment reconciliation drift rules"));
  const fres = await forgetMemories(env, { ids: [res.memory.id] });

  check("forget succeeds when the vector delete fails",
    fres.forgotten === 1, JSON.stringify(fres));

  const row = db.prepare("SELECT status FROM memories WHERE id = ?").get(res.memory.id);
  check("D1 marks the row deleted", !!row && row.status === "deleted",
    row ? row.status : "row missing");

  check("the orphan vector lingers (this is the fault under test)",
    vec._get(res.memory.id) !== undefined);

  // forget never rewrites Vectorize metadata, so an orphan still answers the
  // candidate query as if it were active. The D1 read-back must drop it.
  const stale = fakeVector({
    matches: [{ id: res.memory.id, score: 0.99, metadata: { status: "active" } }],
  });
  const env2 = makeEnv(db, stale);
  const hits = await searchMemories(env2, "payment reconciliation drift rules", { limit: 5 });
  const leaked = hits.some((h) => h.id === res.memory.id);
  check("search does NOT return the deleted memory", !leaked,
    `hits=${JSON.stringify(hits.map((h) => h.id))}`);
}

console.log("\nSource shape: the upsert must not be able to fail the request\n");

{
  const src = readFileSync("src/store.ts", "utf8");

  // Strip the guarded helper, then assert nothing else awaits the upsert raw.
  const withoutHelper = src.replace(/async function indexMemory[\s\S]*?\n}/, "");
  check("no bare `await env.VECTORIZE.upsert` outside the guarded helper",
    !/await\s+env\.VECTORIZE\.upsert\(/.test(withoutHelper));
  check("indexMemory helper exists and returns a boolean",
    /async function indexMemory[\s\S]*?\): Promise<boolean>/.test(src));
  check("AddResult exposes indexed",
    /indexed:\s*boolean/.test(src));
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  failed.forEach((r) => console.log(`  FAILED: ${r.name} -- ${r.detail}`));
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
