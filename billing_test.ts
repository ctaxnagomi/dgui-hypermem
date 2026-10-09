/**
 * Regression tests for billing.quota (effectiveQuota).
 *
 * Bug: the admin Quota button wrote only quota_monthly, but the enforcement
 * gate reads effectiveQuota() -- quota_override first, then the plan ladder.
 * "PAYG" is not a ladder plan, so planQuota() collapsed such accounts to the
 * free allowance (the ladder's free tier) and the typed quota never took effect.
 *
 * Run: npx tsx billing_test.ts
 */
import { effectiveQuota, planQuota } from "./src/billing";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}

// Ladder plans: quota_override NULL -> plan decides.
check("free ladder", effectiveQuota({ plan: "free", quota_override: null, quota_monthly: 2000 }), 32000);
check("pro ladder", effectiveQuota({ plan: "pro", quota_override: null, quota_monthly: 15000 }), 112000);
check("enterprise ladder", effectiveQuota({ plan: "enterprise", quota_override: null, quota_monthly: 25000 }), 142000);
check("case-insensitive plan", effectiveQuota({ plan: "Pro", quota_override: null, quota_monthly: 15000 }), 112000);

// quota_override always wins over the ladder.
check("override wins", effectiveQuota({ plan: "free", quota_override: 100000, quota_monthly: 2000 }), 100000);

// Unknown plan label (e.g. "PAYG"): keep the stored quota_monthly rather than
// collapsing to the free allowance. This is the regression fix.
check("PAYG honors quota_monthly", effectiveQuota({ plan: "PAYG", quota_override: null, quota_monthly: 100000 }), 100000);
check("PAYG without quota_monthly falls back to free", effectiveQuota({ plan: "PAYG", quota_override: null, quota_monthly: null }), 32000);
check("unknown plan with override wins", effectiveQuota({ plan: "PAYG", quota_override: 777, quota_monthly: 100000 }), 777);

// planQuota itself still collapses unknown plans (used only where no account
// row exists); effectiveQuota is the layer that protects account rows.
check("planQuota(PAYG) collapses to free", planQuota("PAYG"), 32000);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);