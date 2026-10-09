-- Realign the reporting column with the raised 2026 plan ladder.
--
-- Enforcement already follows the ladder in code via effectiveQuota(), so the
-- new allowances apply as soon as the Worker is deployed. `quota_monthly` is
-- still read directly by the admin dashboard and shown in the billing summary,
-- so it must not be left advertising the old ladder. This mirrors 0010.
--
-- Only the four ladder plans are touched, and only where no explicit override
-- exists; a row on an unknown label (e.g. PAYG) keeps its bespoke value, since
-- effectiveQuota() treats that column as the allowance for such a plan.

UPDATE tokens SET quota_monthly = CASE LOWER(plan)
    WHEN 'free'       THEN 32000
    WHEN 'median'     THEN 82000
    WHEN 'pro'        THEN 112000
    WHEN 'enterprise' THEN 142000
  END
  WHERE quota_override IS NULL
    AND LOWER(plan) IN ('free', 'median', 'pro', 'enterprise');

-- An override still wins; mirror it into the reporting column.
UPDATE tokens SET quota_monthly = quota_override WHERE quota_override IS NOT NULL;
