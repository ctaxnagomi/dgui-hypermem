/**
 * OAuth 2.1 authorization server, hosted in the worker itself.
 *
 * The worker is both the authorization server and the resource server -- there
 * is no external IdP. Clients that support MCP OAuth (Claude Desktop, Claude
 * Code, Cursor, and others) discover the endpoints from the two `well-known`
 * documents, register dynamically, and run an authorization-code flow with
 * PKCE. Identity comes from the same email + passkey check the token form uses,
 * so quota and attribution continue to work unchanged.
 *
 * Only `/mcp` accepts OAuth. The REST routes keep bearer tokens, because they
 * are called from curl and scripts where a browser consent flow is friction.
 */

import type { Env } from "./types";
import { json, now, sha256, timeSafeEqual, uuid } from "./util";
import { checkPasskey } from "./auth";

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SCOPES = ["mcp"];
const DEFAULT_SCOPE = "mcp";

/* ---------------------------------------------------------------- helpers */

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, { status });
}

function isLoopback(url: URL): boolean {
  return url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "localhost";
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}

/* -------------------------------------------------------------- discovery */

export function authorizationServerMetadata(request: Request): Response {
  const origin = originOf(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    revocation_endpoint: `${origin}/revoke`,
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    service_documentation: `${origin}/docs`,
  });
}

export function protectedResourceMetadata(request: Request): Response {
  const origin = originOf(request);
  return json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "DGUI-HyperMem",
    resource_documentation: `${origin}/docs`,
  });
}

/* ------------------------------------------- dynamic client registration */

/**
 * RFC 7591 dynamic client registration. MCP clients use this to obtain a
 * client_id at connect time instead of the operator pre-provisioning one.
 */
export async function handleRegister(env: Env, request: Request): Promise<Response> {
  if (request.method !== "POST") return oauthError("invalid_request", "registration requires POST", 405);

  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const redirectUris: string[] = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((x: unknown): x is string => typeof x === "string")
    : [];
  if (!redirectUris.length) return oauthError("invalid_redirect_uri", "redirect_uris is required");

  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return oauthError("invalid_redirect_uri", `malformed redirect_uri: ${uri}`);
    }
    // Plain http is only tolerable for native loopback clients; anything else
    // would leak the authorization code in cleartext.
    if (parsed.protocol === "http:" && !isLoopback(parsed)) {
      return oauthError("invalid_redirect_uri", "http redirect_uri is only allowed for loopback addresses");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return oauthError("invalid_redirect_uri", `unsupported redirect_uri scheme: ${parsed.protocol}`);
    }
  }

  const grantTypes: string[] = Array.isArray(body.grant_types)
    ? body.grant_types.filter((x: unknown): x is string => typeof x === "string")
    : ["authorization_code", "refresh_token"];
  for (const g of grantTypes) {
    if (g !== "authorization_code" && g !== "refresh_token") {
      return oauthError("invalid_client_metadata", `unsupported grant_type: ${g}`);
    }
  }

  const authMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    return oauthError("invalid_client_metadata", `unsupported token_endpoint_auth_method: ${authMethod}`);
  }

  const clientId = `hmc_${randomToken(18)}`;
  // Public clients (the norm for MCP desktop/CLI clients) get no secret; the
  // PKCE challenge is what binds the code to the client that requested it.
  const clientSecret = authMethod === "none" ? null : randomToken(32);
  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "MCP client";

  await env.DB.prepare(
    `INSERT INTO oauth_clients
       (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope, created_at)
     VALUES (?, ?, ?, ?, ?, '["code"]', ?, ?, ?)`,
  )
    .bind(
      clientId,
      clientSecret ? await sha256(clientSecret) : null,
      clientName,
      JSON.stringify(redirectUris),
      JSON.stringify(grantTypes),
      authMethod,
      typeof body.scope === "string" ? body.scope : DEFAULT_SCOPE,
      now(),
    )
    .run();

  return json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: authMethod,
      scope: typeof body.scope === "string" ? body.scope : DEFAULT_SCOPE,
    },
    { status: 201 },
  );
}

/* ---------------------------------------------------------- authorization */

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string | null;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string | null;
  error: string | null;
  errorDescription: string | null;
}

function readAuthorizeParams(q: URLSearchParams): AuthorizeParams {
  return {
    clientId: q.get("client_id") || "",
    redirectUri: q.get("redirect_uri") || "",
    state: q.get("state"),
    scope: q.get("scope") || DEFAULT_SCOPE,
    codeChallenge: q.get("code_challenge") || "",
    codeChallengeMethod: q.get("code_challenge_method") || "",
    resource: q.get("resource"),
    error: q.get("error"),
    errorDescription: q.get("error_description"),
  };
}

/**
 * Errors that must NOT be redirected (per RFC 6749 section 4.1.2.1) because
 * the client or redirect target is unvalidated. Everything else goes back to
 * the client as a redirect so the user agent lands somewhere sensible.
 */
function rejectAuthorize(p: AuthorizeParams, error: string, description: string): Response {
  if (!p.clientId || !p.redirectUri) return oauthError(error, description);
  return new Response(null, {
    status: 302,
    headers: { location: redirectWithError(p, error, description), "cache-control": "no-store" },
  });
}

function redirectWithError(p: AuthorizeParams, error: string, description: string): string {
  const target = new URL(p.redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (p.state) target.searchParams.set("state", p.state);
  return target.toString();
}

async function loadClient(env: Env, clientId: string) {
  return env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?")
    .bind(clientId)
    .first<{
      client_id: string;
      client_secret_hash: string | null;
      client_name: string;
      redirect_uris: string;
      token_endpoint_auth_method: string;
    }>();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function loginPage(p: AuthorizeParams, clientName: string, message: string, messageKind: "error" | "info"): string {
  const color = messageKind === "error" ? "#b91c1c" : "#047857";
  const hidden = ["client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method", "resource"]
    .map((k) => {
      const v = (p as unknown as Record<string, string | null>)[k];
      return v ? `<input type="hidden" name="${k}" value="${escapeHtml(v)}">` : "";
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en" data-theme="bright">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Authorize — DGUI-HyperMem</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: Inter, -apple-system, "Segoe UI", sans-serif; background:#f9fafb; color:#111827; padding:24px; }
  .card { width:100%; max-width:420px; background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:32px;
          box-shadow:0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size:20px; margin:0 0 6px; }
  .sub { font-size:14px; color:#6b7280; margin:0 0 24px; line-height:1.5; }
  .client { background:#f3f4f6; border:1px solid #e5e7eb; border-radius:8px; padding:12px 14px;
            font-size:13px; margin-bottom:20px; word-break:break-word; }
  .client b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; margin-bottom:4px; }
  label { display:block; font-size:13px; font-weight:500; margin-bottom:6px; }
  input[type=email], input[type=password] { width:100%; padding:11px 13px; margin-bottom:16px; border:1px solid #d1d5db;
          border-radius:8px; font-size:14px; font-family:inherit; }
  input[type=email]:focus, input[type=password]:focus { outline:2px solid #111827; outline-offset:-1px; }
  button { width:100%; padding:12px; border:0; border-radius:8px; background:#111827; color:#fff;
           font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; }
  button:hover { background:#374151; }
  .msg { padding:11px 13px; border-radius:8px; font-size:13px; margin-bottom:20px; border:1px solid; }
  .foot { margin-top:20px; font-size:11px; color:#9ca3af; text-align:center; line-height:1.6; }
  .foot a { color:#6b7280; }
</style>
</head>
<body>
  <main class="card">
    <h1>Authorize access</h1>
    <p class="sub">Sign in to grant <b>${escapeHtml(clientName)}</b> access to your DGUI-HyperMem memory.</p>
    ${message ? `<div class="msg" style="color:${color};border-color:${color}55;background:${color}0d">${escapeHtml(message)}</div>` : ""}
    <div class="client"><b>Requested permission</b>Read and write your long-term memory (scope: ${escapeHtml(p.scope)})</div>
    <form method="POST" action="/authorize" autocomplete="off">
      ${hidden}
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="username">
      <label for="passkey">Passkey</label>
      <input type="password" id="passkey" name="passkey" required autocomplete="current-password">
      <button type="submit">Authorize</button>
    </form>
    <p class="foot">DGUI-HyperMem &middot; <a href="/terms">Terms</a> &middot; <a href="/privacy">Privacy</a><br>
      Revoke any connected app from the <a href="/#crm">token page</a>.</p>
  </main>
</body>
</html>`;
}

export async function handleAuthorize(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return oauthError("invalid_request", "use GET or POST", 405);
  }
  // On POST the OAuth parameters came back through the consent form, so they
  // live in the request body rather than the query string.
  const params = request.method === "POST" ? await readForm(request) : new URL(request.url).searchParams;
  const p = readAuthorizeParams(params);

  // The client already reported an error; bounce it straight back.
  if (p.error) return new Response(null, { status: 302, headers: { location: redirectWithError(p, p.error, p.errorDescription || "") } });

  if (!p.clientId) return oauthError("invalid_request", "client_id is required");
  if (!p.redirectUri) return oauthError("invalid_request", "redirect_uri is required");
  if (p.codeChallengeMethod !== "S256") {
    return rejectAuthorize(p, "invalid_request", "code_challenge_method must be S256");
  }
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(p.codeChallenge)) {
    return rejectAuthorize(p, "invalid_request", "a PKCE code_challenge is required");
  }

  const client = await loadClient(env, p.clientId);
  if (!client) return oauthError("invalid_client", "unknown client_id");
  // Exact string match against a registered URI -- no prefix or wildcard
  // matching, so an attacker cannot register a lookalike.
  if (!parseJsonArray(client.redirect_uris).includes(p.redirectUri)) {
    return oauthError("invalid_request", "redirect_uri does not match the registered value");
  }

  if (request.method === "GET") {
    return new Response(loginPage(p, client.client_name, "", "info"), {
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  }

  const email = (params.get("email") || "").trim();
  const passkey = params.get("passkey") || "";
  if (!email || !passkey) {
    return new Response(loginPage(p, client.client_name, "Email and passkey are both required.", "error"), {
      status: 400,
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  }

  const auth = checkPasskey(env, passkey);
  if (!auth.ok) {
    return new Response(loginPage(p, client.client_name, auth.error, "error"), {
      status: 401,
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  }

  // Authorize against the same identity the token form uses, so an OAuth grant
  // and a pasted bearer token resolve to the same quota and usage history.
  const account = await findOrCreateAccount(env, email, auth.isMaster);
  if (!account) {
    return new Response(loginPage(p, client.client_name, "Could not provision an account for that email.", "error"), {
      status: 400,
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  }

  const code = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO oauth_codes
       (code_hash, client_id, user_id, email, redirect_uri, scope, code_challenge, code_challenge_method, resource, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'S256', ?, ?, 0, ?)`,
  )
    .bind(
      await sha256(code),
      p.clientId,
      account.id,
      account.email,
      p.redirectUri,
      p.scope,
      p.codeChallenge,
      p.resource,
      now() + CODE_TTL_MS,
      now(),
    )
    .run();

  const target = new URL(p.redirectUri);
  target.searchParams.set("code", code);
  if (p.state) target.searchParams.set("state", p.state);
  return new Response(null, {
    status: 302,
    headers: { location: target.toString(), "cache-control": "no-store" },
  });
}

/* ------------------------------------------------------------ token grant */

async function findOrCreateAccount(env: Env, email: string, isMaster: boolean) {
  const existing = await env.DB.prepare("SELECT id, email, status FROM tokens WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; status: string }>();
  if (existing) {
    if (existing.status !== "active") return null;
    return { id: existing.id, email: existing.email };
  }
  if (!isMaster) return null; // new signups stay on the token form, which is the audited path
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly, tc_agreed, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, 'free', 5600, 1, ?, ?)`,
  )
    .bind(id, email, email, uuid(), now(), now())
    .run();
  return { id, email };
}

async function issueTokens(
  env: Env,
  args: { clientId: string; userId: string; email: string; scope: string; resource: string | null },
): Promise<Record<string, unknown>> {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO oauth_access_tokens
       (token_hash, client_id, user_id, email, scope, refresh_token_hash, resource, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(
      await sha256(accessToken),
      args.clientId,
      args.userId,
      args.email,
      args.scope,
      await sha256(refreshToken),
      args.resource,
      now() + ACCESS_TTL_MS,
      now(),
    )
    .run();
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: args.scope,
  };
}

async function authenticateClient(env: Env, request: Request, form: URLSearchParams) {
  let clientId = form.get("client_id") || "";
  let clientSecret = form.get("client_secret") || "";

  const basic = request.headers.get("authorization") || "";
  if (basic.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(basic.slice(6).trim());
      const idx = decoded.indexOf(":");
      if (idx > 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch {
      /* fall through to form values */
    }
  }
  if (!clientId) return null;
  const client = await loadClient(env, clientId);
  if (!client) return null;
  if (client.client_secret_hash) {
    if (!clientSecret) return null;
    if (!timeSafeEqual(await sha256(clientSecret), client.client_secret_hash)) return null;
  }
  return client;
}

export async function handleToken(env: Env, request: Request): Promise<Response> {
  if (request.method !== "POST") return oauthError("invalid_request", "token requires POST", 405);
  const form = await readForm(request);
  const grantType = form.get("grant_type") || "";

  const client = await authenticateClient(env, request, form);
  if (!client) return oauthError("invalid_client", "client authentication failed", 401);

  if (grantType === "authorization_code") {
    const code = form.get("code") || "";
    const redirectUri = form.get("redirect_uri") || "";
    const verifier = form.get("code_verifier") || "";
    if (!code) return oauthError("invalid_request", "code is required");
    if (!verifier) return oauthError("invalid_request", "code_verifier is required");

    const row = await env.DB.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?")
      .bind(await sha256(code))
      .first<{
        code_hash: string; client_id: string; user_id: string; email: string; redirect_uri: string;
        scope: string; code_challenge: string; code_challenge_method: string; resource: string | null;
        expires_at: number; used: number;
      }>();
    if (!row) return oauthError("invalid_grant", "unknown authorization code");
    if (row.used) return oauthError("invalid_grant", "authorization code already used");
    if (row.expires_at <= now()) return oauthError("invalid_grant", "authorization code expired");
    if (row.client_id !== client.client_id) return oauthError("invalid_grant", "code was issued to a different client");
    if (redirectUri !== row.redirect_uri) return oauthError("invalid_grant", "redirect_uri mismatch");
    if (row.code_challenge_method !== "S256") return oauthError("invalid_grant", "unsupported code_challenge_method");
    if (!timeSafeEqual(await pkceS256(verifier), row.code_challenge)) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }

    // Burn the code before minting tokens so a replay cannot race the first use.
    // The conditional UPDATE is the lock: two concurrent exchanges of the same
    // code both read used=0, but only one can flip it, and only that one sees a
    // non-zero change count.
    const burned = await env.DB.prepare("UPDATE oauth_codes SET used = 1 WHERE code_hash = ? AND used = 0")
      .bind(row.code_hash)
      .run();
    const changed = Number(burned?.meta?.changes ?? 0);
    if (changed !== 1) return oauthError("invalid_grant", "authorization code already used");

    const account = await env.DB.prepare("SELECT status FROM tokens WHERE id = ?")
      .bind(row.user_id)
      .first<{ status: string }>();
    if (!account || account.status !== "active") {
      return oauthError("invalid_grant", "the authorizing account is no longer active");
    }

    return json(
      await issueTokens(env, {
        clientId: client.client_id,
        userId: row.user_id,
        email: row.email,
        scope: row.scope,
        resource: row.resource,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token") || "";
    if (!presented) return oauthError("invalid_request", "refresh_token is required");
    const presentedHash = await sha256(presented);

    const row = await env.DB.prepare(
      "SELECT token_hash, client_id, user_id, email, scope, resource, refresh_token_hash, expires_at, revoked FROM oauth_access_tokens WHERE refresh_token_hash = ?",
    )
      .bind(presentedHash)
      .first<{
        token_hash: string; client_id: string; user_id: string; email: string; scope: string;
        resource: string | null; refresh_token_hash: string; expires_at: number; revoked: number;
      }>();
    if (!row || row.revoked) return oauthError("invalid_grant", "unknown refresh token");
    if (row.expires_at <= now()) return oauthError("invalid_grant", "refresh token expired");
    if (row.client_id !== client.client_id) return oauthError("invalid_grant", "refresh token belongs to a different client");

    const account = await env.DB.prepare("SELECT status FROM tokens WHERE id = ?")
      .bind(row.user_id)
      .first<{ status: string }>();
    if (!account || account.status !== "active") {
      return oauthError("invalid_grant", "the authorizing account is no longer active");
    }

    // Rotate: the presented refresh token is revoked as the new pair is issued.
    await env.DB.prepare("UPDATE oauth_access_tokens SET revoked = 1 WHERE token_hash = ?").bind(row.token_hash).run();
    const tokens = await issueTokens(env, {
      clientId: row.client_id,
      userId: row.user_id,
      email: row.email,
      scope: row.scope,
      resource: row.resource,
    });
    // Preserve the original absolute lifetime rather than sliding forever.
    const remaining = Math.max(0, Math.floor((row.expires_at - now()) / 1000));
    return json({ ...tokens, expires_in: remaining }, { headers: { "cache-control": "no-store" } });
  }

  return oauthError("unsupported_grant_type", `unsupported grant_type: ${grantType}`);
}

/* -------------------------------------------------------------- revocation */

export async function handleRevoke(env: Env, request: Request): Promise<Response> {
  if (request.method !== "POST") return oauthError("invalid_request", "revocation requires POST", 405);
  const form = await readForm(request);
  const client = await authenticateClient(env, request, form);
  if (!client) return oauthError("invalid_client", "client authentication failed", 401);

  const presented = form.get("token") || "";
  if (!presented) return oauthError("invalid_request", "token is required");
  const hash = await sha256(presented);

  // RFC 7009: always 200, whether or not the token existed.
  await Promise.all([
    env.DB.prepare("UPDATE oauth_access_tokens SET revoked = 1 WHERE token_hash = ? OR refresh_token_hash = ?")
      .bind(hash, hash)
      .run(),
    env.DB.prepare("UPDATE oauth_access_tokens SET revoked = 1 WHERE client_id = ? AND token_hash = ?")
      .bind(client.client_id, hash)
      .run(),
  ]);
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
