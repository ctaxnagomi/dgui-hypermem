-- Columns that src/ has required since 0007 but that no migration ever created.
--
-- The live database has all four (they were added out-of-band), but a fresh
-- `wrangler d1 migrations apply` produced a `tokens` table without them. That
-- broke the chain two ways: 0010_quota_authority.sql failed with
-- "no such column: plan", and handleAuthorize's INSERT into tokens(..., plan,
-- quota_monthly, tc_agreed, ...) failed for the same reason. Self-hosted and
-- fresh deploys could not be brought up at all.
--
-- Definitions mirror the live schema exactly. This file sorts before 0010
-- (which reads `plan`), so the chain now replays cleanly on a fresh database.

ALTER TABLE tokens ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE tokens ADD COLUMN tc_agreed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN train_with_all INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tokens ADD COLUMN has_connected INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tokens_plan ON tokens(plan);