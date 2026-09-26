import type { Env } from "./types";
import { now, sha256, timeSafeEqual } from "./util";

export type PasskeyResult = { ok: true; isMaster: boolean } | { ok: false; error: string };

/**
 * Single authority for passkey checks.
 *
 * Both call sites used to carry their own copy of this logic with a hardcoded
 * `env.PASSKEY || "0866"` fallback, so a deployment that forgot to set PASSKEY
 * silently accepted a publicly documented credential. Fails closed: with no
 * PASSKEY and no MASTER_PASSKEY nothing can authenticate.
 */
export function checkPasskey(env: Env, passkey: string): PasskeyResult {
  const master = env.MASTER_PASSKEY;
  if (master && timeSafeEqual(passkey, master)) return { ok: true, isMaster: true };
  const user = env.PASSKEY;
  if (!user) return { ok: false, error: "server passkey not configured (set the PASSKEY secret)" };
  if (timeSafeEqual(passkey, user)) return { ok: true, isMaster: false };
  return { ok: false, error: "invalid passkey" };
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey;
  const q = new URL(request.url).searchParams.get("token");
  if (q) return q;
  return null;
}

export type Credential =
  | { kind: "master" }
  | { kind: "token"; email: string; tokenValue: string }
  | { kind: "oauth"; email: string; userId: string; scope: string; tokenHash: string };

/**
 * Resolve whatever credential the request presented.
 *
 * Three accepted forms, checked in order: the master `MCP_TOKEN` secret, a
 * per-user token row, or an OAuth access token. Returns null when nothing valid
 * was presented -- callers must treat that as a denial, never as a pass.
 *
 * An OAuth access token is only honoured while the account that authorised it
 * is still active, so disabling a token immediately revokes every OAuth session
 * derived from it rather than leaving a dangling grant.
 */
export async function resolveCredential(env: Env, request: Request): Promise<Credential | null> {
  const token = extractToken(request);
  if (!token) return null;

  const mcpToken = env.MCP_TOKEN;
  if (mcpToken && timeSafeEqual(token, mcpToken)) return { kind: "master" };

  const row = await env.DB.prepare("SELECT id, email, status FROM tokens WHERE token = ?")
    .bind(token)
    .first<{ id: string; email: string; status: string }>();
  if (row) {
    return row.status === "active" ? { kind: "token", email: row.email, tokenValue: token } : null;
  }

  const tokenHash = await sha256(token);
  const grant = await env.DB.prepare(
    "SELECT token_hash, user_id, email, scope, expires_at, revoked FROM oauth_access_tokens WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ token_hash: string; user_id: string; email: string; scope: string; expires_at: number; revoked: number }>();
  if (!grant || grant.revoked) return null;
  if (grant.expires_at <= now()) return null;

  const owner = await env.DB.prepare("SELECT status FROM tokens WHERE id = ?")
    .bind(grant.user_id)
    .first<{ status: string }>();
  if (!owner || owner.status !== "active") return null;

  return { kind: "oauth", email: grant.email, userId: grant.user_id, scope: grant.scope, tokenHash: grant.token_hash };
}
