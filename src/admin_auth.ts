import type { Env } from "./types";
import { now, timeSafeEqual } from "./util";

/**
 * Admin 2FA (TOTP / Google Authenticator) + signed admin sessions.
 *
 * Pure crypto lives here; the "is TOTP enrolled" flag lives in D1 (the admin
 * login handler in index.ts owns that row). Everything fails closed:
 * - TOTP verification returns false on any malformed input.
 * - Session verification returns null unless the signature and expiry check.
 * - Secrets (`ADMIN_TOTP_SECRET`, `ADMIN_SESSION_SECRET`) are write-only env
 *   vars; this module never logs or returns them except for the enrollment
 *   payload the operator needs once to scan into an authenticator app.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function randomTotpSecret(byteLength = 20): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** RFC 6238 otpauth URI for enrollment display. */
export function otpauthUri(secret: string, account = "admin@dgui-hypermem", issuer = "DGUI-HyperMem"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${encodeURIComponent(
    secret,
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hash = await hmacSha1(key, msg);
  const offset = hash[hash.length - 1] & 0x0f;
  const bin =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Verify a 6-digit code against the configured TOTP secret, ±1 time step. */
export async function verifyTotp(env: Env, code: string): Promise<boolean> {
  const secret = env.ADMIN_TOTP_SECRET;
  if (!secret || !/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -1; delta <= 1; delta++) {
    const candidate = await totpAt(secret, step + delta);
    if (timeSafeEqual(candidate, code)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Signed admin sessions (HMAC-SHA256, stateless, no server storage)
 * ------------------------------------------------------------------ */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}

/**
 * Issue a signed admin session. Returns null when the signing secret is not
 * configured, which lets deployments run passkey-only without a session layer.
 */
export async function createAdminSession(env: Env): Promise<string | null> {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const iat = now();
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: "admin", iat, exp: iat + SESSION_TTL_MS })));
  const sig = b64url(await hmacSha256(secret, payload));
  return `${payload}.${sig}`;
}

export interface AdminSession {
  sub: string;
  iat: number;
  exp: number;
}

/** Validate a session token; returns null when invalid or expired. */
export async function verifyAdminSession(env: Env, token: string): Promise<AdminSession | null> {
  if (!token) return null;
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = b64url(await hmacSha256(secret, payload));
  if (!timeSafeEqual(expect, sig)) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as AdminSession;
    if (decoded.exp <= now() || decoded.sub !== "admin") return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Pull a session token from any supported location: header, query, body. */
export function extractAdminSession(request: Request, body: Record<string, any>, url: URL): string {
  const header = request.headers.get("x-admin-session");
  if (header) return header;
  const query = url.searchParams.get("session");
  if (query) return query;
  if (typeof body?.session === "string") return body.session;
  return "";
}