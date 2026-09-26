-- Idempotency ledger for Stripe webhook events.
--
-- Stripe delivers at-least-once and retries on any non-2xx, so the same
-- `checkout.session.completed` can arrive many times. Without this table a
-- retried credit-pack purchase would mint the credit again, and a retried
-- subscription would re-apply the plan. The primary key on the event id makes
-- "have I already handled this?" a single atomic INSERT.
--
-- An event is recorded *before* its effects are applied, not after. Recording
-- first means a crash mid-apply leads to a lost update rather than a duplicate
-- one, which is the correct failure direction for money: under-crediting a
-- customer is recoverable by support, silently double-crediting them is not.

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

-- Support lookups: "which events touched this account?"
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed_at);
