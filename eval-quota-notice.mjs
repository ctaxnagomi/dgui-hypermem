// End-to-end test for the quota-notification path on the real worker.
//
// eval-notices.mjs covers the store. This covers the wiring, which is where the
// decisions actually live and where none of them had been executed:
//
//   - a quota change writes a notice naming the previous value
//   - a no-op update writes NOTHING, so an admin clicking save twice does not
//     spam the user with two notices saying the same thing
//   - an unauthenticated caller changes nothing and writes nothing
//   - an unknown email is reported rather than silently doing nothing
//   - a plan-only change is still noticed
//   - the notice survives as valid JSON with its data intact
//
// The real module is bundled and its default export's fetch() is driven directly.
// Auth uses a passkey supplied as a test fixture via MASTER_PASSKEY -- this does
// not read, embed, or rely on the production credential that happens to be
// checked in src/index.ts.
//
//   node eval-quota-notice.mjs
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const PASSKEY = "TEST-FIXTURE-PASSKEY-NOT-A-REAL-CREDENTIAL";
const EMAIL = "quota-notice-test@example.com";

const out = mkdtempSync(join(tmpdir(), "quota-"));
// platform:node, not neutral: the module graph reaches stripe and the MCP SDK's
// ajv provider, which resolve node builtins and main-only packages. Nothing here
// touches the network -- every binding is stubbed below.
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };
await build({ ...BUILD, entryPoints: ["src/index.ts"], outfile: join(out, "index.mjs") });
await build({ ...BUILD, entryPoints: ["src/store.ts"], outfile: join(out, "store.mjs") });
const mod = await import(pathToFileURL(join(out, "index.mjs")).href);
const worker = mod.default;

// --- D1 shim ------------------------------------------------------------------
function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      _args: [],
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...api._args) }),
      first: async () => stmt.get(...api._args) ?? null,
      run: async () => {
        const r = stmt.run(...api._args);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
      raw: async () => ({ results: stmt.all(...api._args) }),
    };
    return api;
  };
  const d1 = {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => {
      const out = [];
      for (const s of stmts) out.push(await (s.run ? s.run() : s));
      return out;
    },
    exec: async (sql) => { db.exec(sql); return { count: 1, duration: 0 }; },
  };
  return d1;
}

const db = new DatabaseSync(":memory:");
// Apply the real migrations rather than hand-copying schemas, so this also fails
// loudly if a migration stops applying.
for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join("migrations", f), "utf8"));
}

const env = {
  DB: makeD1(db),
  VECTORIZE: { query: async () => ({ matches: [] }), upsert: async () => ({}), deleteByIds: async () => ({}) },
  AI: { run: async () => ({ response: "{}" }) },
  JEV_MODE: "off",
  JEV_MODEL: "",
  JEV_ENDPOINT: "",
  EMBED_MODEL: "",
  FALLBACK_MODEL: "",
  DEFAULT_SCOPE: "default",
  MASTER_PASSKEY: PASSKEY,
};

const nowTs = () => Date.now();
db.prepare(
  "INSERT INTO tokens (id,email,github_username,status,token,plan,quota_monthly,requests_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
).run("tok-1", EMAIL, "quota-test", "active", "secret-token-1", "free", 5600, 3, nowTs(), nowTs()).run;

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else { console.log("FAIL  " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); failed++; }
};

// The table is created lazily on first notice, so it genuinely does not exist
// before that. Querying it straight away is an error, not an empty list.
const notices = () => {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quota_notices'").get();
  if (!t) return [];
  return db.prepare("SELECT * FROM quota_notices WHERE email = ? ORDER BY created_at DESC, rowid DESC").all(EMAIL);
};
const quotaNow = () =>
  db.prepare("SELECT quota_monthly, plan FROM tokens WHERE email = ?").get(EMAIL);

async function call(body, { passkey } = {}) {
  // Must be the admin hostname: handleRest 404s the admin API on any other host
  // so the admin surface is not guessable from the public one. That guard is a
  // real control and the first version of this test tripped it.
  const req = new Request("https://hmem-admin.deckergui.my/api/admin/update-quota", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(passkey ? { ...body, passkey } : body),
  });
  const res = await worker.fetch(req, env, {});
  return { status: res.status, body: await res.json() };
}

// --- the table only exists because a notice asked for it ----------------------
check("notice table is absent before anything is written", notices().length === 0);

// --- 1. a real change notifies, and says what it changed from -----------------
const r1 = await call({ email: EMAIL, quota_monthly: 10000 }, { passkey: PASSKEY });
check("update succeeds", r1.status === 200 && r1.body.status === "updated", r1.body);
check("response reports it notified", r1.body.notified === true, r1.body);
check("quota actually changed in the database", quotaNow().quota_monthly === 10000, quotaNow());

const n1 = notices();
check("exactly one notice was written", n1.length === 1, n1.length);
check("notice names the previous value", JSON.parse(n1[0].data).previous_quota_monthly === 5600, n1[0].data);
check("notice names the new value", JSON.parse(n1[0].data).quota_monthly === 10000, n1[0].data);
check("message is human readable and mentions both numbers",
  n1[0].message.includes("5,600") && n1[0].message.includes("10,000"), n1[0].message);
check("notice is kinded", n1[0].kind === "quota_changed", n1[0].kind);
check("notice starts undelivered", n1[0].read_at === null, n1[0].read_at);

// --- 2. a no-op must not spam ------------------------------------------------
const r2 = await call({ email: EMAIL, quota_monthly: 10000 }, { passkey: PASSKEY });
check("no-op update still reports ok", r2.body.status === "updated", r2.body);
check("no-op update reports it did NOT notify", r2.body.notified === false, r2.body);
check("no-op wrote no second notice", notices().length === 1, notices().length);

// --- 3. a plan-only change is still a change ---------------------------------
const r3 = await call({ email: EMAIL, plan: "pro" }, { passkey: PASSKEY });
check("plan change notifies", r3.body.notified === true, r3.body);
check("plan change writes a notice", notices().length === 2, notices().length);
const planNotice = JSON.parse(notices()[0].data);
check("plan notice records both plans", planNotice.previous_plan === "free" && planNotice.plan === "pro", planNotice);

// --- 4. an unauthenticated caller changes nothing -----------------------------
const beforeAuth = notices().length;
const r4 = await call({ email: EMAIL, quota_monthly: 999999 });
check("unauthenticated update is rejected", r4.status === 401 && r4.body.error === "unauthorized", r4.body);
check("unauthenticated update changed no quota", quotaNow().quota_monthly === 10000, quotaNow());
check("unauthenticated update wrote no notice", notices().length === beforeAuth, notices().length);

// --- 5. an unknown email is reported, not silently ignored --------------------
const r5 = await call({ email: "nobody@example.com", quota_monthly: 5000 }, { passkey: PASSKEY });
check("unknown email is reported", r5.body.error === "account not found", r5.body);

// --- 6. a malformed quota is rejected before anything is written --------------
const beforeBad = notices().length;
const r6 = await call({ email: EMAIL, quota_monthly: -5 }, { passkey: PASSKEY });
check("negative quota is rejected", r6.body.error === "invalid quota", r6.body);
check("rejected quota wrote no notice", notices().length === beforeBad, notices().length);

// --- 7. the admin API is not reachable from the public host -----------------
// Every admin route must 404 on a non-admin hostname, so the admin surface is
// not enumerable from the public one. Regression guard: visits and activity were
// once missing from that set and answered with 401 instead.
const ADMIN_ROUTES = [
  "/api/admin/login", "/api/admin/tokens", "/api/admin/logs",
  "/api/admin/toggle-train", "/api/admin/update-quota", "/api/admin/clock",
  "/api/admin/stats", "/api/admin/visits", "/api/admin/activity",
  "/api/setup-dataset",
];
const publicHostResults = {};
for (const route of ADMIN_ROUTES) {
  const res = await worker.fetch(
    new Request("https://dgui-hmem.deckergui.my" + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passkey: PASSKEY, email: EMAIL, quota_monthly: 1 }),
    }),
    env, {},
  );
  publicHostResults[route] = res.status;
}
const leaked = Object.entries(publicHostResults).filter(([, s]) => s !== 404);
check("every admin route 404s on the public host", leaked.length === 0, leaked);
check("the guard covers visits and activity",
  publicHostResults["/api/admin/visits"] === 404 && publicHostResults["/api/admin/activity"] === 404,
  publicHostResults);
check("quota untouched by the rejected public-host calls", quotaNow().quota_monthly === 10000, quotaNow());

// --- 8. every notice a real session would receive is deliverable -------------
// takeUnreadQuotaNotices is what the MCP request path calls. Drive it through the
// store so the delivery contract is proved against the rows just written.
const { takeUnreadQuotaNotices } = await import(pathToFileURL(join(out, "store.mjs")).href).catch(() => ({}));
if (takeUnreadQuotaNotices) {
  const delivered = await takeUnreadQuotaNotices(env, EMAIL);
  check("both pending notices are delivered", delivered.length === 2, delivered.length);
  check("newest delivered first", delivered[0].data.plan === "pro", delivered[0].data);
  const again = await takeUnreadQuotaNotices(env, EMAIL);
  check("delivery does not repeat", again.length === 0, again.length);
} else {
  check("store module resolvable for delivery test", false, "store.mjs not built");
}

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILURE(S)"}`);
rmSync(out, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);