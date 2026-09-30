-- 0011_row_read_indexes.sql
-- Row-read hot paths, applied 2026-09-30.
--
-- Each statement targets a query that EXPLAIN QUERY PLAN showed doing a
-- SCAN or a temp B-tree on the remote D1 database:
--
--   1. tokens.token          : per-request credential lookup (resolveCredential
--                              + checkAndTrackUsage) -- previously SCAN tokens.
--                              UNIQUE because tokens are credentials: a
--                              duplicate token would make the lookup ambiguous.
--                              Live data has 0 duplicates; the 1 NULL row is
--                              legal under SQLite UNIQUE (NULLs are distinct).
--   2. oauth_access_tokens.refresh_token_hash : token exchange refresh lookup
--                              (oauth.ts) -- previously SCAN oauth_access_tokens.
--   3. usage_events(email, event_at) : admin stats queries filtered by both
--                              columns -- previously used idx_usage_events_email
--                              and filtered event_at in-table.
--   4. crm_logs(email, action, created_at) : admin logs page WHERE email = ?
--                              [AND action = ?] ORDER BY created_at DESC --
--                              previously SEARCH idx_crm_logs_email + temp
--                              B-tree for the ORDER BY.
--
-- code_hash (oauth_codes) and token_hash (oauth_access_tokens) already carry
-- sqlite_autoindex UNIQUE constraints -- no new index needed there.
--
-- Applied 2026-09-30 and verified via EXPLAIN QUERY PLAN on the remote DB:
--   1. SEARCH USING INDEX idx_tokens_token (was SCAN tokens)
--   2. SEARCH USING INDEX idx_oauth_refresh_hash (was SCAN oauth_access_tokens)
--   3. COVERING INDEX idx_usage_events_email_at (email=? AND event_at>?)
--   4. COUNT(*) filtered on both email+action only; the email-only admin
--      shape (no action filter) still uses idx_crm_logs_email + temp B-tree.
--      Deliberate: an extra (email, created_at) index would cost D1 writes on
--      crm_logs for a rare admin page query over small per-email sets.

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_hash ON oauth_access_tokens(refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_usage_events_email_at ON usage_events(email, event_at);

CREATE INDEX IF NOT EXISTS idx_crm_logs_email_action_created ON crm_logs(email, action, created_at);