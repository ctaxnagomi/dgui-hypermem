import type { Env } from "./types";
import { now, timeSafeEqual } from "./util";
import { b64url, b64urlDecode, hmacSha256 } from "./admin_auth";

/**
 * Admin device credentials: signed challenge/response, no shared secret.
 *
 * Why this exists. Admin auth was a bearer passkey. TOTP would not have fixed
 * that: it is a *shared* seed on both sides, so it is phishable at enrollment
 * and lower entropy per request. What actually removes the shared secret is
 * proof of possession of a private key the server never sees.
 *
 * The flow, in three calls:
 *   register  passkey-gated, one time. Stores the device's PUBLIC key only.
 *   challenge unauthenticated. Returns a short-lived HMAC-signed nonce. Reading
 *             one reveals nothing: it is useless without the private key.
 *   verify    checks the nonce is fresh and untampered, that the signature is
 *             valid for the stored public key, then mints an ordinary admin
 *             session via createAdminSession().
 *
 * Because the result is the same session token the passkey path already
 * produces, adminGate and all eight admin handlers are unchanged. That is the
 * whole point of reusing createAdminSession rather than adding a parallel
 * auth path.
 *
 * The nonce is HMAC'd rather than stored, so issuing a challenge is a CPU
 * operation with no D1 write on an endpoint anyone can call. Replay is bounded
 * by the short expiry instead of a used-nonce table.
 */

const CHALLENGE_TTL_MS = 60_000; // 60s: long enough to type, far too short to replay

/** Standard base64 (not url-safe): this is the encoding WebCrypto's spki/pkcs8
 *  exports produce, and the encoding a stored SPKI blob must round-trip through. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function sign(secret: string, payload: string): Promise<string> {
  return b64url(await hmacSha256(secret, payload));
}

export interface DeviceChallenge {
  did: string;
  org: string;
  exp: number;
}

/**
 * Issue a challenge for a device id. The origin is baked in and the device is
 * expected to refuse to sign for any other one, which is what stops a phishing
 * page from relaying the real CLI's signature against an attacker-controlled
 * host.
 *
 * Deliberately does not touch the database: this is unauthenticated, so it must
 * not be a DB-backed existence oracle. A challenge for an unknown id is issued
 * normally and simply fails at verify.
 */
export async function issueDeviceChallenge(
  env: Env,
  deviceId: string,
  origin: string,
): Promise<{ challenge: string; origin: string; expires_in: number } | null> {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const exp = now() + CHALLENGE_TTL_MS;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ did: deviceId, org: origin, exp })));
  const sig = await sign(secret, payload);
  return { challenge: `${payload}.${sig}`, origin, expires_in: CHALLENGE_TTL_MS };
}

/** Validate a challenge: HMAC intact, well-formed, unexpired. Null on any failure. */
export async function readDeviceChallenge(env: Env, token: string): Promise<DeviceChallenge | null> {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timeSafeEqual(await sign(secret, payload), sig)) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Partial<DeviceChallenge>;
    if (typeof decoded.did !== "string" || typeof decoded.org !== "string" || typeof decoded.exp !== "number") {
      return null;
    }
    if (decoded.exp <= now()) return null;
    return { did: decoded.did, org: decoded.org, exp: decoded.exp };
  } catch {
    return null;
  }
}

/** True when `publicKeySpki` parses as an ECDSA P-256 SPKI blob. Registration
 *  rejects a key it cannot verify rather than storing junk that locks the device
 *  out later with no way to tell registration from signing as the cause. */
export async function isValidDevicePublicKey(publicKeySpki: string): Promise<boolean> {
  try {
    if (!publicKeySpki || publicKeySpki.length > 1024) return false;
    await crypto.subtle.importKey("spki", b64ToBytes(publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a device signature over `signedData` (the challenge string, verbatim).
 *
 * Signature format is WebCrypto's: IEEE P1363, i.e. r||s concatenated and each
 * padded to 32 bytes for P-256, so 64 bytes total. NOT ASN.1/DER. Node and
 * browsers both emit P1363 from subtle.sign, so they interoperate, but anything
 * hand-rolled with a DER encoder will not verify here -- that mismatch is the
 * classic ECDSA interop trap and it fails closed, which is the safe direction.
 */
export async function verifyDeviceSignature(
  publicKeySpki: string,
  signedData: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", b64ToBytes(publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signatureB64),
      new TextEncoder().encode(signedData),
    );
  } catch {
    // Malformed key or signature: not an error to surface, just not verified.
    return false;
  }
}

/** Device ids are opaque, generated by the CLI. Constrained here purely so a
 *  malformed id cannot reach the DB or bloat a lookup. */
export function isValidDeviceId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(id);
}