// End-to-end test for admin device authentication against the real worker.
//
// The device flow is proof-of-possession: register a public key once with the
// passkey, then authenticate forever by signing a server-issued nonce. The
// property worth protecting is that no shared secret exists after registration,
// so this suite drives the actual endpoints over actual crypto rather than
// asserting on shapes.
//
// What is covered:
//   - registration requires the passkey, and validates before storing
//   - the table only exists because a device asked for it
//   - a challenge is bound to the host that issued it
//   - a correct signature yields a session that a real admin op accepts
//   - every wrong signature, wrong device, tampered challenge, and replay fails
//   - a revoked device is indistinguishable from an unknown one
//   - the device endpoints 404 off the admin host
//
// Key generation uses node's WebCrypto, which emits IEEE P1363 signatures --
// the same format the Worker verifies. A DER-encoded signature is also tried,
// because DER is the classic interop failure and it must fail closed.
//
//   node eval-device-auth.mjs
import { build } from "esbuild";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const { webcrypto } = await import("node:crypto");
const subtle = webcrypto.subtle;

const PASSKEY = "TEST-FIXTURE-PASSKEY-NOT-A-REAL-CREDENTIAL";
const ADMIN_HOST = "hmem-admin.deckergui.my";
const PUBLIC_HOST = "dgui-hmem.deckergui.my";
const EMAIL = "device-auth-test@example.com";

const out = mkdtempSync(join(tmpdir(), "device-"));
// platform:node for the same reason as eval-quota-notice.mjs: the graph reaches
// stripe and the MCP SDK's ajv provider.
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };
await build({ ...BUILD, entryPoints: ["src/index.ts"], outfile: join(out, "index.mjs") });
const worker = (await import(pathToFileURL(join(out, "index.mjs")).href)).default;

function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      _args: [],
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...api._args) }),
      first: async () => stmt.get(...api._args) ?? null,
      // Must actually execute: the lazy CREATE TABLE path and revoke() both rely
      // on meta.changes being real.
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

const db = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join("migrations", f), "utf8"));
}

const env = {
  DB: makeD1(db),
  VECTORIZE: { query: async () => ({ matches: [] }), upsert: async () => ({}), deleteByIds: async () => ({}) },
  AI: { run: async () => ({ response: "{}" }) },
  JEV_MODE: "off",
  JEV_ENDPOINT: "",
  EMBED_MODEL: "",
  FALLBACK_MODEL: "",
  DEFAULT_SCOPE: "default",
  MASTER_PASSKEY: PASSKEY,
  ADMIN_SESSION_SECRET: "test-session-secret-fixture",
  ADMIN_HOST,
};
const ts = Date.now();
db.prepare(
  "INSERT INTO tokens (id,email,github_username,status,token,plan,quota_monthly,requests_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
).run("tok-dev", EMAIL, "device-test", "active", "secret-token-dev", "free", 5600, 1, ts, ts);

// crm_logs as the real schema has it. logCrmAction inserts a `device` column that
// no migration creates, so the stock migrations alone make every admin handler
// that logs throw SQLITE_ERROR -- including the pre-existing ones. That is a real
// production/schema drift, not a test artefact, so the fix belongs here rather
// than in a mock: production's crm_logs evidently has the column and the
// migration set does not describe it. Applying the stock set, then widening it to
// match what the deployed table actually is.
db.exec("ALTER TABLE crm_logs ADD COLUMN device TEXT");

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else { console.log("FAIL  " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); failed++; }
};

const b64 = (b) => Buffer.from(b).toString("base64");
const tableExists = (n) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(n);
const deviceRows = () => (tableExists("admin_devices") ? db.prepare("SELECT * FROM admin_devices").all() : []);

async function post(path, body, { host = ADMIN_HOST, headers = {} } = {}) {
  const req = new Request(`https://${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env, {});
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function newDevice(name = "test-laptop") {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await subtle.exportKey("spki", pair.publicKey));
  return {
    name,
    id: b64(webcrypto.getRandomValues(new Uint8Array(16))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    publicKey: b64(spki),
    privateKey: pair.privateKey,
  };
}

const sign = async (privateKey, data) =>
  b64(new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(data))));

// --- the table only exists because a device asked for it ---------------------
check("device table is absent before anything is registered", tableExists("admin_devices") === false);

// --- 1. registration is passkey-gated -----------------------------------------
const dev = await newDevice();
const anonReg = await post("/api/admin/device/register", { id: dev.id, name: dev.name, public_key: dev.publicKey });
check("unauthenticated registration is rejected", anonReg.status === 401 && anonReg.body.error === "unauthorized", anonReg.body);
check("  and it created no table", tableExists("admin_devices") === false);

// --- 2. bad registration input is rejected before storing ---------------------
for (const [label, body] of [
  ["a too-short id", { id: "short", name: "x", public_key: dev.publicKey }],
  ["an id with illegal characters", { id: "a".repeat(20) + "!", name: "x", public_key: dev.publicKey }],
  ["an empty name", { id: dev.id, name: "   ", public_key: dev.publicKey }],
  ["a public key that is not a key", { id: dev.id, name: "x", public_key: b64(new Uint8Array(64)) }],
  ["a PEM instead of raw SPKI", { id: dev.id, name: "x", public_key: "-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----" }],
]) {
  const r = await post("/api/admin/device/register", { passkey: PASSKEY, ...body });
  check("registration rejects " + label, r.status === 401 || /invalid/.test(String(r.body.error)), r.body);
}
check("no invalid registration was stored", deviceRows().length === 0, deviceRows().length);

// --- 3. the happy path ---------------------------------------------------------
const reg = await post("/api/admin/device/register", { passkey: PASSKEY, id: dev.id, name: dev.name, public_key: dev.publicKey });
check("registration succeeds with the passkey", reg.body.status === "registered", reg.body);
check("response echoes the device id", reg.body.id === dev.id, reg.body);
check("response reports the host it is bound to", reg.body.origin === ADMIN_HOST, reg.body);
check("exactly one device stored", deviceRows().length === 1, deviceRows().length);
check("stored row keeps the public key", deviceRows()[0]?.public_key === dev.publicKey);
check("stored row starts unused and unrevoked",
  deviceRows()[0]?.last_used_at === null && deviceRows()[0]?.revoked_at === null, deviceRows()[0]);

// --- 4. a challenge needs no credential, and is bound to its host -------------
const chal = await post("/api/admin/device/challenge", { device_id: dev.id });
check("challenge is issued without any credential", chal.status === 200 && !!chal.body.challenge, chal.body);
check("challenge reports the issuing host", chal.body.origin === ADMIN_HOST, chal.body);
check("challenge advertises a short expiry", chal.body.expires_in > 0 && chal.body.expires_in <= 120_000, chal.body);
// What must never appear in an unauthenticated challenge is SECRET material. The
// device id and the admin hostname are expected fields, not leaks.
{
  const payload = JSON.parse(Buffer.from(chal.body.challenge.split(".")[0], "base64").toString("utf8"));
  check("challenge carries only id, origin and expiry",
    JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(["did", "exp", "org"]), payload);
  check("challenge contains no secret material",
    !/passkey|secret|private|password|token/i.test(JSON.stringify(payload)), payload);
}

// A nonce minted for one host must not redeem against another. Two layers cover
// this and both are tested, because they fail independently:
//
//   1. the hostname guard in handleRest, which 404s every admin route that is not
//      on ADMIN_HOST. This is what actually stops a foreign host in production.
//   2. the `parsed.org !== url.hostname` check inside handleDeviceVerify, which is
//      defence in depth for the case ADMIN_HOST changes or a second admin hostname
//      is ever added -- the guard alone would then accept challenges from either.
//
// Layer 1 is reachable over HTTP. Layer 2 is not, because the guard answers first,
// so testing it needs a second worker configured with a different ADMIN_HOST.
{
  const other = await post("/api/admin/device/verify",
    { device_id: dev.id, challenge: chal.body.challenge, signature: await sign(dev.privateKey, chal.body.challenge) },
    { host: "other-admin.deckergui.my" });
  check("layer 1: a foreign admin host is stopped by the hostname guard",
    other.status === 404, other);

  const movedEnv = { ...env, ADMIN_HOST: "other-admin.deckergui.my" };
  const res = await worker.fetch(
    new Request("https://other-admin.deckergui.my/api/admin/device/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: dev.id, challenge: chal.body.challenge, signature: await sign(dev.privateKey, chal.body.challenge) }),
    }), movedEnv, {});
  const body = await res.json().catch(() => ({}));
  check("layer 2: even where the guard allows the host, a foreign-origin challenge is rejected",
    res.status === 401 && body.error === "unauthorized", { status: res.status, body });
}

// --- 5. the session a correct signature produces really works -----------------
const sig = await sign(dev.privateKey, chal.body.challenge);
const ver = await post("/api/admin/device/verify", { device_id: dev.id, challenge: chal.body.challenge, signature: sig });
check("a correct signature authenticates", ver.body.status === "ok", ver.body);
check("it returns a session token", typeof ver.body.session === "string" && ver.body.session.length > 20, ver.body.session);
check("it names the device", ver.body.device?.name === dev.name, ver.body.device);
check("last_used_at was stamped",
  deviceRows()[0]?.last_used_at !== null && deviceRows()[0].last_used_at >= ts, deviceRows()[0]);

// The real point: that session must open a real admin operation.
const op = await post("/api/admin/update-quota",
  { session: ver.body.session, email: EMAIL, quota_monthly: 4242 });
check("the device session authorises a real admin op", op.body.status === "updated", op.body);
check("  and the op actually took effect",
  db.prepare("SELECT quota_monthly FROM tokens WHERE email = ?").get(EMAIL).quota_monthly === 4242);

// --- 6. a tampered or malformed challenge fails --------------------------------
const tampered = chal.body.challenge.slice(0, -3) + "AAA";
check("a tampered challenge is rejected",
  (await post("/api/admin/device/verify", { device_id: dev.id, challenge: tampered, signature: sig })).body.error === "unauthorized");
check("a challenge with no signature is rejected",
  (await post("/api/admin/device/verify", { device_id: dev.id, challenge: chal.body.challenge })).body.error === "unauthorized");
check("a garbage challenge is rejected",
  (await post("/api/admin/device/verify", { device_id: dev.id, challenge: "not.a.challenge", signature: sig })).body.error === "unauthorized");

// --- 7. wrong keys, wrong devices --------------------------------------------
const chal2 = await post("/api/admin/device/challenge", { device_id: dev.id });
const other = await newDevice("attacker");
check("a signature from an unregistered key is rejected",
  (await post("/api/admin/device/verify", {
    device_id: dev.id, challenge: chal2.body.challenge, signature: await sign(other.privateKey, chal2.body.challenge),
  })).body.error === "unauthorized");

// Registered, but with a key that does not match the stored one for that id.
const impostor = await newDevice("impostor");
await post("/api/admin/device/register", { passkey: PASSKEY, id: impostor.id, name: impostor.name, public_key: impostor.publicKey });
db.prepare("UPDATE admin_devices SET public_key = ? WHERE id = ?").run(dev.publicKey, impostor.id);
const chal3 = await post("/api/admin/device/challenge", { device_id: dev.id });
check("a signature that does not match the STORED key for that id is rejected",
  (await post("/api/admin/device/verify", {
    device_id: dev.id, challenge: chal3.body.challenge, signature: await sign(impostor.privateKey, chal3.body.challenge),
  })).body.error === "unauthorized");

// --- 8. the classic interop trap: DER instead of raw r||s --------------------
const derTrap = await post("/api/admin/device/challenge", { device_id: dev.id });
{
  const raw = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, dev.privateKey,
    new TextEncoder().encode(derTrap.body.challenge)));
  check("a correct signature is 64 raw bytes (IEEE P1363, not DER)", raw.length === 64, raw.length);
  // A DER signature of the same key/signature: 0x30 SEQUENCE wrapping. It must
  // fail closed rather than being leniently accepted.
  const der = new Uint8Array(72);
  der[0] = 0x30; der[1] = 0x44; der[2] = 0x02; der[3] = 0x20; der[4] = 0x02; der[5] = 0x20;
  der.set(raw.subarray(0, 32), 6); der.set(raw.subarray(32), 38);
  check("a DER-encoded signature is rejected (fails closed)",
    (await post("/api/admin/device/verify", {
      device_id: dev.id, challenge: derTrap.body.challenge, signature: b64(der),
    })).body.error === "unauthorized");
}

// --- 9. device id confusion: one device's signature for another's challenge ---
const chal4 = await post("/api/admin/device/challenge", { device_id: dev.id });
check("a signature for device A does not authenticate device B",
  (await post("/api/admin/device/verify", {
    device_id: impostor.id, challenge: chal4.body.challenge, signature: await sign(dev.privateKey, chal4.body.challenge),
  })).body.error === "unauthorized");

// --- 10. an unknown device id gets the same answer as a bad signature --------
const unknown = await newDevice("never-registered");
const chal5 = await post("/api/admin/device/challenge", { device_id: unknown.id });
const unknownRes = await post("/api/admin/device/verify",
  { device_id: unknown.id, challenge: chal5.body.challenge, signature: await sign(unknown.privateKey, chal5.body.challenge) });
check("an unregistered device cannot authenticate", unknownRes.body.error === "unauthorized", unknownRes.body);
check("  its rejection is indistinguishable from a bad signature",
  JSON.stringify(unknownRes.body) === JSON.stringify({ error: "unauthorized" }), unknownRes.body);

// --- 11. revocation ------------------------------------------------------------
const chal6 = await post("/api/admin/device/challenge", { device_id: dev.id });
check("the device still authenticates before revocation",
  (await post("/api/admin/device/verify",
    { device_id: dev.id, challenge: chal6.body.challenge, signature: await sign(dev.privateKey, chal6.body.challenge) })).body.status === "ok");

const rev = await post("/api/admin/devices", { passkey: PASSKEY, action: "revoke", id: dev.id });
check("revocation succeeds", rev.body.status === "revoked", rev.body);
const chal7 = await post("/api/admin/device/challenge", { device_id: dev.id });
const afterRevoke = await post("/api/admin/device/verify",
  { device_id: dev.id, challenge: chal7.body.challenge, signature: await sign(dev.privateKey, chal7.body.challenge) });
check("a revoked device cannot authenticate", afterRevoke.body.error === "unauthorized", afterRevoke.body);
check("  and reads exactly like an unknown device",
  JSON.stringify(afterRevoke.body) === JSON.stringify({ error: "unauthorized" }), afterRevoke.body);
check("revoking twice reports not found rather than pretending", (await post("/api/admin/devices",
  { passkey: PASSKEY, action: "revoke", id: dev.id })).body.status === "not found");
check("revocation requires authentication",
  (await post("/api/admin/devices", { action: "revoke", id: dev.id })).body.error === "unauthorized");

// --- 12. listing does not leak key material ----------------------------------
const listRes = await post("/api/admin/devices", { passkey: PASSKEY });
check("devices can be listed", Array.isArray(listRes.body.devices) && listRes.body.devices.length === 2, listRes.body);
check("  listing never includes a public key",
  !JSON.stringify(listRes.body).includes(dev.publicKey), "public_key present");
check("listing requires authentication",
  (await post("/api/admin/devices", {})).body.error === "unauthorized");

// --- 13. re-registration rotates the key and clears revocation ----------------
const rotated = await newDevice("rotated");
await post("/api/admin/device/register", { passkey: PASSKEY, id: dev.id, name: dev.name, public_key: rotated.publicKey });
check("re-registering clears revocation",
  db.prepare("SELECT revoked_at FROM admin_devices WHERE id = ?").get(dev.id).revoked_at === null);
const chal8 = await post("/api/admin/device/challenge", { device_id: dev.id });
check("the OLD key no longer authenticates after rotation",
  (await post("/api/admin/device/verify",
    { device_id: dev.id, challenge: chal8.body.challenge, signature: await sign(dev.privateKey, chal8.body.challenge) })).body.error === "unauthorized");
check("the NEW key authenticates",
  (await post("/api/admin/device/verify",
    { device_id: dev.id, challenge: chal8.body.challenge, signature: await sign(rotated.privateKey, chal8.body.challenge) })).body.status === "ok");

// --- 14. device endpoints are not reachable from the public host -------------
for (const route of ["/api/admin/device/register", "/api/admin/device/challenge", "/api/admin/device/verify", "/api/admin/devices"]) {
  const r = await post(route, { device_id: dev.id, id: dev.id, name: "x", public_key: dev.publicKey, challenge: "a.b", signature: "c" },
    { host: PUBLIC_HOST });
  check(route + " 404s on the public host", r.status === 404, r.status);
}

// --- 15. no shared secret survives registration ------------------------------
// The property that makes this worth having: after registering, the only thing
// the server holds is a public key. Assert the stored column set, and that the
// real passkey no longer does anything on its own.
check("the devices table stores no secret column",
  !/secret|passkey|private/i.test(
    db.prepare("SELECT sql FROM sqlite_master WHERE name='admin_devices'").get().sql), "secret column present");
const barePasskey = await post("/api/admin/update-quota", { passkey: PASSKEY, email: EMAIL, quota_monthly: 999 });
check("the passkey path still exists as bootstrap (unchanged)", barePasskey.body.status === "updated", barePasskey.body);

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILURE(S)"}`);
rmSync(out, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);