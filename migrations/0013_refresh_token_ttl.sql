-- Give refresh tokens their own absolute lifetime.
--
-- oauth_access_tokens.expires_at holds the ACCESS token expiry (now + 1h), but
-- the refresh branch in src/oauth.ts validated the presented refresh token
-- against that same column. The 30-day REFRESH_TTL_MS was declared and never
-- persisted, so every refresh token died 1 hour after authorization and the
-- client was forced back through the browser sign-in flow roughly hourly.
--
-- refresh_expires_at carries the absolute grant lifetime. It is set once at
-- authorization and carried forward unchanged across rotation, so a grant
-- still cannot slide forever.

ALTER TABLE oauth_access_tokens ADD COLUMN refresh_expires_at INTEGER;

-- Backfill live grants so applying this migration does not invalidate sessions
-- that are still running. Older rows get the full 30 days from now, which is
-- the intent that was originally coded but never applied.
UPDATE oauth_access_tokens
   SET refresh_expires_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 + (30 * 24 * 60 * 60 * 1000)
 WHERE refresh_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_access_refresh
  ON oauth_access_tokens(refresh_token_hash);