// Reproduce /api/request-token (MCP token issuance) with the REPO's own code
// against the current migration chain, exactly like eval-quota-notice does.
//   node eval-request-token.mjs
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const PASSKEY = "FIXTURE-USER-PASSKEY";
const MASTER = "FIXTURE-MASTER-PASSKEY";
const out = mkdtempSync(join(tmpdir(), "rtok-"));
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };
await build({ ...BUILD, entryPoints: ["src/index.ts"], outfile: join(out, "index.mjs") });
const mod = await import(pathToFileURL(join(out, "index.mjs")).href);
const worker = mod.default;

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
    batch: async (stmts) => { const o = []; for (const s of stmts) o.push(await (s.run ? s.run() : s)); return o; },
    exec: async (sql) => { db.exec(sql); return { count: 1, duration: 0 }; },
  };
}

const db = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join("migrations", f), "utf8"));
}

const env = {
  DB: makeD1(db),
  VECTORIZE: { query: async () => ({ matches: [] }), upsert: async () => ({}), deleteByIds: async () => ({}) },
  AI: { run: async () => ({ response: "{}" }) },
  JEV_MODE: "off", JEV_MODEL: "", JEV_ENDPOINT: "", EMBED_MODEL: "", FALLBACK_MODEL: "",
  DEFAULT_SCOPE: "default",
  MASTER_PASSKEY: MASTER,
  PASSKEY,
  ADMIN_HOST: "hmem-admin.deckergui.my",
};

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else { console.log("FAIL  " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); failed++; }
};

async function issue(email, passkey = PASSKEY) {
  const req = new Request("https://dgui-hmem.deckergui.my/api/request-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, passkey, tc_agreed: true }),
  });
  const res = await worker.fetch(req, env, {});
  return { status: res.status, body: await res.json() };
}

const row = (email) => db.prepare("SELECT * FROM tokens WHERE email = ?").get(email);
const schema = () => {
  const rows = db.prepare("SELECT name FROM pragma_table_info('tokens')").all();
  return rows.map((r) => r.name).sort().join(",");
};

check("tokens table has plan/quota_override/tc_agreed columns", /plan/.test(schema()) && /quota_override/.test(schema()) && /tc_agreed/.test(schema()), schema());

// 1. brand-new user
const r1 = await issue("newuser@example.com");
check("new user gets 200", r1.status === 200, r1.body);
check("new user receives a token", typeof r1.body.token === "string" && r1.body.token.length > 10, r1.body);
const n1 = row("newuser@example.com");
check("row created with the returned token", n1 && n1.token === r1.body.token, { row: !!n1, tok: n1 && n1.token, ret: r1.body.token });
check("row is active", n1 && n1.status === "active", n1 && n1.status);
check("row has a plan", n1 && (n1.plan || "").length > 0, n1 && n1.plan);
check("new row carries the free ladder quota, not the legacy 5600", n1 && n1.quota_monthly === 32000, n1 && n1.quota_monthly);

// 2. re-request for the same user returns the same token
const r2 = await issue("newuser@example.com");
check("existing user gets their token back", r2.body.token === r1.body.token, { a: r1.body.token, b: r2.body.token });

// 3. wrong passkey is rejected and writes nothing
const preCount = db.prepare("SELECT COUNT(*) c FROM tokens").get().c;
const r3 = await issue("evil@example.com", "wrong-passkey");
check("wrong passkey is rejected", r3.body.error === "invalid passkey", r3.body);
check("nothing written on rejection", db.prepare("SELECT COUNT(*) c FROM tokens").get().c === preCount, db.prepare("SELECT COUNT(*) c FROM tokens").get().c);

// 4. no secrets configured -> fails closed (auth gate)
const noSecretEnv = { ...env, PASSKEY: undefined, MASTER_PASSKEY: undefined };
const req = new Request("https://dgui-hmem.deckergui.my/api/request-token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "nope@example.com", passkey: PASSKEY, tc_agreed: true }),
});
const res = await worker.fetch(req, noSecretEnv, {});
const noSecretBody = await res.json();
check("with no secrets, issuance fails closed", res.status === 401 || noSecretBody.error, noSecretBody);

// 5. the issued token actually authenticates at /mcp
const tok = r1.body.token;
const mcpReq = new Request("https://dgui-hmem.deckergui.my/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + tok, "mcp-protocol-version": "2025-06-18" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" } } }),
});
const mcpRes = await worker.fetch(mcpReq, env, {});
const mcpBody = await mcpRes.json();
check("issued token authenticates at /mcp", mcpRes.status === 200 && mcpBody.result && mcpBody.result.serverInfo, mcpBody);

console.log(failed === 0 ? "\nall request-token checks passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);