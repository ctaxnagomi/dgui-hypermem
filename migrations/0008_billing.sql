-- Billing: plan ladder, 15-day Pro trial, and a prepaid pay-as-you-go balance.
--
-- `trial_ends_at` marks when a Pro trial lapses. Trials are granted in our own
-- database rather than by configuring Stripe, so the trial clock is ours to
-- enforce and cannot drift from the plan actually stored on the account.
--
-- `payg_credits_micro` is a prepaid wallet in micro-dollars (1 USD = 1,000,000).
-- Integer arithmetic only: floating point money accrues drift, and at $0.002 per
-- request a rounding error compounds into real misbilling. The balance is
-- additive and never resets, so pay-as-you-go behaves like a prepaid wallet
-- rather than a second monthly quota.
--
-- `funding` on usage_events records whether a request was covered by the plan
-- quota or drawn from the wallet, which is what makes revenue reconcilable
-- against Stripe.

ALTER TABLE tokens ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE tokens ADD COLUMN trial_started_at INTEGER;
ALTER TABLE tokens ADD COLUMN payg_credits_micro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN payg_spent_micro INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usage_events ADD COLUMN funding TEXT;
ALTER TABLE usage_events ADD COLUMN cost_micro INTEGER;

-- Expiring trials in bulk is a single-table scan on a sparse column.
CREATE INDEX IF NOT EXISTS idx_tokens_trial_ends ON tokens(trial_ends_at);
-- Wallet balance lookups happen on the hot path of every quota check.
CREATE INDEX IF NOT EXISTS idx_tokens_credits ON tokens(payg_credits_micro);
