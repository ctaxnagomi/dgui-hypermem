// End-to-end test for quota-notice delivery over the real MCP endpoint.
//
// The store and the admin path are covered elsewhere. What is left -- and what
// was entirely unexecuted until now -- is the part the user actually experiences:
// that an MCP client, without asking for anything, learns their quota changed.
//
// Driven through the real worker fetch() with a real JSON-RPC request against a
// real McpServer over a real Streamable HTTP transport, using a token row seeded
// into a migrated database. Nothing is stubbed except the AI/vector bindings,
// which these particular tools never reach.
//
// Auth uses a test token seeded in the fixture database. It does not read or rely
// on the production credential that happens to be checked in src/index.ts.
//
//   node eval-mcp-notice.mjs
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const EMAIL = "mcp-notice-test@example.com";
const TOKEN = "test-mcp-token-fixture";

const out = mkdtempSync(join(tmpdir(), "mcp-"));
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };
await build({ ...BUILD, entryPoints: ["src/index.ts"], outfile: join(out, "index.mjs") });
const { default: worker } = await import(pathToFileURL(join(out, "index.mjs")).href);
const { recordQuotaNotice } = await buildStore();

async function buildStore() {
  const dir = mkdtempSync(join(tmpdir(), "mcp-store-"));
  await build({ ...BUILD, entryPoints: ["src/store.ts"], outfile: join(dir, "store.mjs") });
  return import(pathToFileURL(join(dir, "store.mjs")).href);
}

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
    };
    return api;
  };
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => { for (const s of stmts) await (s.run ? s.run() : s); return []; },
    exec: async (sql) => { db.exec(sql); return { count: 1, duration: 0 }; },
  };
}

const db = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join("migrations", f), "utf8"));
}
const ts = Date.now();
db.prepare(
  "INSERT INTO tokens (id,email,github_username,status,token,plan,quota_monthly,requests_used,requests_reset_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
).run("tok-mcp", EMAIL, "mcp-test", "active", TOKEN, "free", 5600, 0, ts + 86400000, ts, ts).run;

const env = {
  DB: makeD1(db),
  VECTORIZE: { query: async () => ({ matches: [] }), upsert: async () => ({}), deleteByIds: async () => ({}) },
  AI: { run: async () => ({ response: "{}" }) },
  JEV_MODE: "off", JEV_MODEL: "", JEV_ENDPOINT: "",
  EMBED_MODEL: "", FALLBACK_MODEL: "", DEFAULT_SCOPE: "default",
  MCP_TOKEN: "master-token-fixture",
};

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else { console.log("FAIL  " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); failed++; }
};

let id = 0;
async function rpc(method, params, bearer = TOKEN) {
  const req = new Request("https://dgui-hmem.deckergui.my/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer ? { authorization: "Bearer " + bearer } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const res = await worker.fetch(req, env, {});
  const raw = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* kept as raw for the diagnostic */ }
  // Keep the raw text on the result. A tool result that comes back empty is
  // otherwise indistinguishable from a parse bug in the test.
  return { status: res.status, body: parsed, raw, contentType: res.headers.get("content-type") };
}

/** Unwrap the text content block an MCP tool result carries. */
const toolText = (b) => b?.body?.result?.content?.[0]?.text ?? "";
const toolJson = (b) => { try { return JSON.parse(toolText(b)); } catch { return null; } };
/** What to print when a result is empty -- enough to tell parse from server. */
const rawOf = (b) => ({ ct: b?.contentType, status: b?.status, raw: (b?.raw || "").slice(0, 300) });

// --- 0. auth still applies ----------------------------------------------------
const anon = await rpc("tools/list", {}, null);
check("unauthenticated MCP call is rejected", anon.status === 401, anon.status);

// --- 1. the tool is advertised ------------------------------------------------
const list = await rpc("tools/list", {});
const names = (list.body?.result?.tools || []).map((t) => t.name);
check("quota_notices is advertised", names.includes("quota_notices"), names);
check("the pre-existing tools still register", names.length >= 9, names);
// help returns its text directly rather than JSON, so read it raw.
const helpRes = await rpc("tools/call", { name: "help", arguments: {} });
const helpText = toolText(helpRes);
check("help documents quota_notices", /quota_notices/.test(helpText), rawOf(helpRes));
check("help explains the quota_notice key", /quota_notice/.test(helpText), helpText.slice(0, 200));

// --- 2. a pending notice rides along on the next call -------------------------
await recordQuotaNotice(env, EMAIL, "quota_changed", "An administrator changed your monthly quota 5,600 to 10,000.", {
  previous_quota_monthly: 5600, quota_monthly: 10000, previous_plan: "free", plan: "free",
});
const profile = toolJson(await rpc("tools/call", { name: "profile", arguments: {} }));
check("next call carries the notice", Array.isArray(profile.quota_notice) && profile.quota_notice.length === 1, profile);
check("notice carries the message", /5,600 to 10,000/.test(profile.quota_notice?.[0]?.message || ""), profile.quota_notice);
check("notice carries the values", profile.quota_notice?.[0]?.quota_monthly === 10000, profile.quota_notice);
check("notice carries a timestamp", typeof profile.quota_notice?.[0]?.at === "string", profile.quota_notice?.[0]);

// The important one: the tool's own payload must survive untouched, or every
// existing client breaks the moment an admin changes someone's quota.
check("the tool's own payload is untouched", profile.total !== undefined || profile.counts !== undefined || profile.scope !== undefined, Object.keys(profile));
check("notice did not replace the payload", !Array.isArray(profile.results), Object.keys(profile));

// --- 3. delivery is once only -------------------------------------------------
const profile2 = toolJson(await rpc("tools/call", { name: "profile", arguments: {} }));
check("notice is not repeated on the next call", profile2.quota_notice === undefined, Object.keys(profile2));

// --- 4. history is still available, marked delivered --------------------------
const notices = toolJson(await rpc("tools/call", { name: "quota_notices", arguments: {} }));
check("quota_notices reports the account", notices.email === EMAIL, notices);
check("quota_notices lists history", notices.count === 1, notices);
check("history shows it was delivered", notices.notices[0].delivered === true, notices.notices[0]);
check("undelivered count is zero", notices.undelivered === 0, notices);

// --- 5. explicit ack is idempotent -------------------------------------------
const acked = toolJson(await rpc("tools/call", { name: "quota_notices", arguments: { ack: [notices.notices[0].id] } }));
check("ack of an already-read notice is a no-op", acked.count === 1, acked);
const unread = toolJson(await rpc("tools/call", { name: "quota_notices", arguments: { unread_only: true } }));
check("unread_only returns nothing once delivered", unread.count === 0, unread);

// --- 6. account isolation over MCP --------------------------------------------
await recordQuotaNotice(env, "someone-else@example.com", "quota_changed", "private", { quota_monthly: 1 });
db.prepare("INSERT INTO tokens (id,email,github_username,status,token,plan,quota_monthly,requests_used,requests_reset_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
  .run("tok-other", "someone-else@example.com", "other", "active", "other-token-fixture", "free", 5600, 0, ts + 86400000, ts, ts).run;
const otherList = toolJson(await rpc("tools/call", { name: "quota_notices", arguments: {} }, "other-token-fixture"));
check("another account sees only its own notices", otherList.count === 1 && otherList.email === "someone-else@example.com", otherList);

// --- 7. the master token has no account and says so --------------------------
const master = await rpc("tools/call", { name: "quota_notices", arguments: {} }, "master-token-fixture");
check("master token is refused, not silently empty", master.body?.result?.isError === true, master.body);
check("the refusal explains why", /master token, which has no account/.test(toolText(master)), toolText(master));

// --- 8. a broken notice table must not break memory calls ---------------------
// The delivery path is wrapped so a D1 failure degrades to "no notice". Prove it
// by dropping the table and calling a tool.
db.exec("DROP TABLE quota_notices");
const degraded = toolJson(await rpc("tools/call", { name: "profile", arguments: {} }));
check("a missing notice table does not fail the call", degraded !== null && degraded.quota_notice === undefined, degraded);
check("the tool still returned real data", degraded && Object.keys(degraded).length > 0, Object.keys(degraded || {}));

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILURE(S)"}`);
rmSync(out, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);