-- OAuth 2.1 authorization server for the /mcp endpoint.
--
-- The worker is both the authorization server and the resource server: there is
-- no external IdP. Access and refresh tokens are stored only as SHA-256
-- digests, so a database leak does not yield usable credentials.
--
-- Authorization codes are single-use (guarded by `used`) and short-lived.
-- Every issued access token carries the owning `tokens.id` as `user_id`, which
-- is what preserves quota accounting and attribution for OAuth clients.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  grant_types TEXT NOT NULL,
  response_types TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  scope TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  resource TEXT,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  scope TEXT NOT NULL,
  refresh_token_hash TEXT,
  resource TEXT,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_access_client ON oauth_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_email ON oauth_access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_client ON oauth_codes(client_id);
