-- Make the plan ladder authoritative, and stop per-row quotas from shadowing it.
--
-- Two problems this fixes, both found while wiring up pay-as-you-go:
--
-- 1. `quota_monthly` was NOT NULL and every row carried a literal value (100,
--    1000, 10000, 20000, 100000). The quota gate reads
--    `quota_monthly || planQuota(plan)`, so the literal always won and the plan
--    ladder was decorative -- changing a plan's quota would have changed nothing
--    for any existing user. `quota_override` now carries the exceptional case
--    (an admin-granted custom cap) and NULL means "follow the plan".
--
-- 2. `plan` held both 'pro' and 'Pro', and 'enterprise' and 'Enterprise'.
--    planQuota() is a lookup, so the capitalised values fell through to the
--    default and those users were silently billed at the wrong allowance.
--
-- Legacy ladder values are cleared into NULL so they follow the new plan quota.
-- Values outside the legacy set (100000, the flow-test fixture) are genuine
-- custom caps and are preserved as overrides.

ALTER TABLE tokens ADD COLUMN quota_override INTEGER;

-- Case-insensitive plans. Guarded so re-running is a no-op.
UPDATE tokens SET plan = LOWER(plan) WHERE plan IS NOT NULL AND plan != LOWER(plan);

-- Preserve genuine custom caps, then let the legacy ladder values go.
UPDATE tokens SET quota_override = quota_monthly
  WHERE quota_monthly NOT IN (100, 1000, 5600, 7800, 10000, 20000, 999999);

-- Realign the reporting column with the plan so nothing reads a stale number.
UPDATE tokens SET quota_monthly = CASE LOWER(plan)
    WHEN 'median'     THEN 8500
    WHEN 'pro'        THEN 15000
    WHEN 'enterprise' THEN 25000
    ELSE 2000
  END;

-- An override still wins; mirror it into the reporting column.
UPDATE tokens SET quota_monthly = quota_override WHERE quota_override IS NOT NULL;
