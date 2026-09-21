-- Add quota and rate-limit columns to tokens table
ALTER TABLE tokens ADD COLUMN quota_monthly INTEGER NOT NULL DEFAULT 100;
ALTER TABLE tokens ADD COLUMN requests_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN requests_reset_at INTEGER;