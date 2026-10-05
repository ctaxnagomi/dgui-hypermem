// Regression suite for the crm_logs `device` column drift.
//
// The bug: logCrmAction() names a `device` column on every INSERT, but no
// migration in migrations/ creates it. Production's crm_logs has the column
// (added out of band), so the bug was invisible there. On any database built
// from the migrations -- a fresh deploy, a staging copy, a developer's local
// instance -- every insert failed with SQLITE_ERROR: no such column: device.
//
// Why the existing suite did not catch it, and why this one is shaped
// differently: 11 of the logCrmAction call sites end in .catch(() => {}), so a
// failed audit write is silent by design. The request still returns 200. A test
// that only asserts on handler responses therefore cannot see this at all --
// which is exactly how it survived. This suite calls logCrmAction directly and
// asserts on the row that lands.
//
// util.ts self-heals with a lazy ALTER (ensureCrmLogsDevice) rather than a
// migration, because SQLite has no `ADD COLUMN IF NOT EXISTS` -- a migration
// would fail against the production database where the column already exists.
//
//   node eval-crm-logs.mjs
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 eval-crm-logs";
let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else {
    failed++;
    console.log("FAIL  " + name + (detail ? "  <- " + detail : ""));
  }
};

const out = mkdtempSync(join(tmpdir(), "crmlogs-"));
// platform:node + mainFields because the util graph can reach main-only packages.
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };

// Each database gets its OWN bundle. logCrmAction memoises the ensure in a
// module-level promise, so importing one instance twice would let the second
// database inherit the first one's answer -- which is exactly the bug this
// suite must not paper over.
let buildSeq = 0;
async function loadUtil() {
  const file = join(out, `util${buildSeq++}.mjs`);
  await build({ ...BUILD, entryPoints: ["src/util.ts"], outfile: file });
  return (await import(pathToFileURL(file).href)).logCrmAction;
}

function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      _args: [],
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...api._args) }),
      first: async () => stmt.get(...api._args) ?? null,
      run: async () => { const r = stmt.run(...api._args); return { success: true, meta: { changes: Number(r.changes) } }; },
      raw: async () => ({ results: stmt.all(...api._args) }),
    };
    return api;
  };
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => { const r = []; for (const s of stmts) r.push(await (s.run ? s.run() : s)); return r; },
    exec: async (sql) => { db.exec(sql); return { count: 1, duration: 0 }; },
  };
}

const stockMigrations = () => {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join("migrations", f), "utf8"));
  }
  return db;
};

const cols = (db, table) =>
  new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));

const req = (ua = UA) => new Request("https://hmem-admin.deckergui.my/api/admin/tokens", {
  headers: { "user-agent": ua, "cf-connecting-ip": "203.0.113.9" },
});

console.log("# stock migration schema is genuinely missing the column");
{
  const db = stockMigrations();
  check("migrations create crm_logs", cols(db, "crm_logs").has("email"));
  check("migrations do NOT create crm_logs.device (the drift)", !cols(db, "crm_logs").has("device"));
}

console.log("\n# on a stock database, logCrmAction self-heals instead of throwing");
{
  const db = stockMigrations();
  const env = { DB: makeD1(db) };
  const logCrmAction = await loadUtil();

  let threw = null;
  try {
    await logCrmAction(env, "a@example.com", "token_created", "new token", req());
  } catch (e) { threw = e; }
  check("does not throw", threw === null, threw && String(threw));
  check("ensure added the device column", cols(db, "crm_logs").has("device"));

  const row = db.prepare("SELECT * FROM crm_logs WHERE email = ?").get("a@example.com");
  check("the row was actually written", !!row);
  check("device captured the user-agent", row?.device === UA, `device=${row?.device}`);
  check("ip captured from cf-connecting-ip", row?.ip === "203.0.113.9", `ip=${row?.ip}`);
  check("detail preserved", row?.detail === "new token");
  check("action preserved", row?.action === "token_created");
}

console.log("\n# the ensure is idempotent across many writes");
{
  const db = stockMigrations();
  const env = { DB: makeD1(db) };
  const logCrmAction = await loadUtil();
  let threw = null;
  try {
    for (let i = 0; i < 25; i++) {
      await logCrmAction(env, `b${i}@example.com`, "token_reissued", `n${i}`, req(`UA-${i}`));
    }
  } catch (e) { threw = e; }
  check("25 sequential writes do not throw", threw === null, threw && String(threw));
  check("25 rows landed", db.prepare("SELECT COUNT(*) c FROM crm_logs").get().c === 25);
  check("device recorded per-row", db.prepare("SELECT device FROM crm_logs WHERE email='b7@example.com'").get().device === "UA-7");
}

console.log("\n# production shape: column already present, no duplicate-column failure");
{
  const db = stockMigrations();
  db.exec("ALTER TABLE crm_logs ADD COLUMN device TEXT"); // what production actually has
  const env = { DB: makeD1(db) };
  const logCrmAction = await loadUtil();

  let threw = null;
  try {
    await logCrmAction(env, "c@example.com", "token_disabled", "revoked", req("UA-prod"));
  } catch (e) { threw = e; }
  check("does not throw on an already-widened table", threw === null, threw && String(threw));
  check("row written", db.prepare("SELECT COUNT(*) c FROM crm_logs").get().c === 1);
  check("device still populated", db.prepare("SELECT device FROM crm_logs").get().device === "UA-prod");
}

console.log("\n# a genuinely broken database still surfaces its error");
{
  const db = stockMigrations();
  db.exec("DROP TABLE crm_logs"); // nothing left to ensure or write
  const env = { DB: makeD1(db) };
  const logCrmAction = await loadUtil();

  let threw = null;
  try {
    await logCrmAction(env, "d@example.com", "token_created", "x", req());
  } catch (e) { threw = e; }
  check("rejects rather than silently reporting success", threw !== null);
}

console.log("\n# the ensure does not mask a missing table by creating it");
{
  const db = stockMigrations();
  const env = { DB: makeD1(db) };
  const logCrmAction = await loadUtil();
  await logCrmAction(env, "e@example.com", "token_created", "x", req());
  check("crm_logs was not recreated as an empty table",
    db.prepare("SELECT COUNT(*) c FROM crm_logs").get().c === 1);
  check("email/action columns still present", cols(db, "crm_logs").has("email") && cols(db, "crm_logs").has("action"));
}

rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
