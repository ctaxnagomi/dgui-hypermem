#!/usr/bin/env node
// Admin device key: proof-of-possession auth for the DGUI-HyperMem admin API.
//
// Why: admin auth was a bearer passkey, which is a shared secret -- whoever holds
// the string is admin. This generates an ECDSA P-256 keypair, keeps the private
// half in this file's directory, and registers only the public half. From then
// on, `login` proves possession without ever transmitting anything reusable.
//
// Usage:
//   node admin-device.mjs register --name <label> [--admin <url>]   (needs the passkey once)
//   node admin-device.mjs login     [--admin <url>]                  (gets a session)
//   node admin-device.mjs devices                                   (list/revoke)
//   node admin-device.mjs call <path> [json-body]
//
// The passkey is read from DGUI_ADMIN_PASSKEY rather than argv, so it does not
// land in shell history or the process list. It is only needed for `register`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), ".admin-device-key.json");
const DEFAULT_ADMIN = process.env.DGUI_ADMIN_URL || "https://hmem-admin.deckergui.my";

function fail(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function post(admin, path, body) {
  const res = await fetch(admin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || res.status);
    err.payload = json;
    throw err;
  }
  return json;
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

function loadKey() {
  if (!existsSync(KEY_FILE)) fail(`no device key at ${KEY_FILE} -- run: node admin-device.mjs register --name <label>`);
  const key = JSON.parse(readFileSync(KEY_FILE, "utf8"));
  if (!key.private_key_b64 || !key.id) fail(`device key file ${KEY_FILE} is malformed`);
  return key;
}

// --- register -----------------------------------------------------------------
// The private key is written only AFTER the server accepts the public half, so a
// failed registration cannot leave an orphaned key that looks registered.
async function register() {
  const name = arg("name");
  if (!name) fail("register requires --name <label>");
  const admin = arg("admin", DEFAULT_ADMIN);
  const passkey = process.env.DGUI_ADMIN_PASSKEY;
  if (!passkey) fail("set DGUI_ADMIN_PASSKEY in the environment (not argv) for this one step");

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const id = b64(crypto.getRandomValues(new Uint8Array(16))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await post(admin, "/api/admin/device/register", { passkey, id, name, public_key: b64(spki) });

  writeFileSync(
    KEY_FILE,
    JSON.stringify({ id, name, admin, private_key_b64: b64(pkcs8), created_at: new Date().toISOString() }, null, 2),
  );
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  // Best effort; a no-op on platforms without POSIX modes (Windows).
  try {
    const { chmodSync } = await import("node:fs");
    chmodSync(KEY_FILE, 0o600);
  } catch {}

  console.log(`registered "${name}" against ${admin}`);
  console.log(`device id: ${id}`);
  console.log(`private key: ${KEY_FILE}  (keep this file out of git -- it is a credential)`);
}

// --- login --------------------------------------------------------------------
// Three steps, mirroring src/admin_device.ts. The signed bytes are the challenge
// string verbatim.
async function login() {
  const key = loadKey();
  const admin = arg("admin", key.admin || DEFAULT_ADMIN);

  const { challenge } = await post(admin, "/api/admin/device/challenge", { device_id: key.id });

  const pkcs8 = Uint8Array.from(Buffer.from(key.private_key_b64, "base64"));
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(challenge)));

  const out = await post(admin, "/api/admin/device/verify", { device_id: key.id, challenge, signature: b64(sig) });
  if (!out.session) fail("server returned no session (ADMIN_SESSION_SECRET unset?)");
  console.log(out.session);
  return out.session;
}

// --- devices ------------------------------------------------------------------
async function devices() {
  const session = process.env.DGUI_ADMIN_SESSION || (await loginQuietly());
  const admin = arg("admin", DEFAULT_ADMIN);
  const list = await post(admin, "/api/admin/devices", { session });
  for (const d of list.devices) {
    const state = d.revoked_at ? "REVOKED" : d.last_used_at ? "active" : "registered, never used";
    console.log(`${d.id}  ${d.name.padEnd(20)} ${state}`);
  }
  if (process.argv.includes("--revoke")) {
    const id = arg("revoke");
    if (!id) fail("--revoke needs the device id to revoke");
    console.log(JSON.stringify(await post(admin, "/api/admin/devices", { session, action: "revoke", id })));
  }
}

async function loginQuietly() {
  const key = loadKey();
  const admin = key.admin || DEFAULT_ADMIN;
  const { challenge } = await post(admin, "/api/admin/device/challenge", { device_id: key.id });
  const pkcs8 = Uint8Array.from(Buffer.from(key.private_key_b64, "base64"));
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(challenge)));
  const out = await post(admin, "/api/admin/device/verify", { device_id: key.id, challenge, signature: b64(sig) });
  return out.session;
}

// --- call ---------------------------------------------------------------------
// Convenience: run any admin POST with the device session already attached.
async function call() {
  const path = process.argv[3];
  if (!path) fail("usage: node admin-device.mjs call <path> [json-body]");
  const session = process.env.DGUI_ADMIN_SESSION || (await loginQuietly());
  const admin = arg("admin", DEFAULT_ADMIN);
  let body = {};
  try {
    body = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  } catch (e) {
    fail("body is not valid JSON: " + e.message);
  }
  console.log(JSON.stringify(await post(admin, path, { ...body, session }), null, 2));
}

const cmd = process.argv[2];
try {
  if (cmd === "register") await register();
  else if (cmd === "login") await login();
  else if (cmd === "devices") await devices();
  else if (cmd === "call") await call();
  else if (cmd === "path") console.log(KEY_FILE);
  else fail("unknown command '" + (cmd || "") + "' -- expected register | login | devices | call | path");
} catch (err) {
  if (err && err.payload) {
    console.error("error: " + (err.payload.error || "request failed"));
    if (err.payload.error === "unauthorized") {
      console.error("if this device is unknown, register it first with the passkey:");
      console.error("  DGUI_ADMIN_PASSKEY=... node admin-device.mjs register --name <label>");
    }
  } else {
    console.error("error: " + (err && err.message ? err.message : String(err)));
  }
  process.exit(1);
}