/**
 * Tests for the technician JEV agent (src/technician.ts): pure evaluation of
 * accounts against the solution corpus checklist.
 *
 * Run: npx tsx technician_test.ts
 */
import {
  diagnoseAccount,
  docForTag,
  SELFHOST_NOTICE_MESSAGE,
  type AccountProbe,
  type SolutionDoc,
} from "./src/technician";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}: expected ${e}, got ${a}`);
  }
}

function active(over: Partial<AccountProbe>): AccountProbe {
  return {
    id: "t1",
    email: "probe@test.com",
    status: "active",
    plan: "free",
    quota_monthly: 32000,
    quota_override: null,
    requests_used: 0,
    requests_reset_at: null,
    payg_credits_micro: 0,
    payg_spent_micro: 0,
    train_with_all: 1,
    ...over,
  };
}

const CHECKLIST: SolutionDoc[] = [
  {
    id: "sol-payg",
    content: "PAYG quota override fix",
    memory_type: "solution",
    tags: ["solution", "quota", "payg", "selfhost", "fix"],
    status: "active",
    created_at: 1,
  },
  {
    id: "sol-quota",
    content: "quota ladder guidance",
    memory_type: "solution",
    tags: ["solution", "quota"],
    status: "active",
    created_at: 2,
  },
];

// --- checklist lookup -------------------------------------------------------

const paygDoc = docForTag(CHECKLIST, "payg");
check("payg doc found by tag", paygDoc?.id ?? null, "sol-payg");
check("quota doc found by tag (excluding payg-specific doc)", docForTag(CHECKLIST, "quota", "payg")?.id ?? null, "sol-quota");
check("unknown tag yields null", docForTag(CHECKLIST, "nope") ?? null, null);

// --- healthy accounts produce no findings ------------------------------------

check("healthy free account clean", diagnoseAccount(active({}), CHECKLIST), []);
check(
  "ladder account with override clean",
  diagnoseAccount(active({ plan: "enterprise", quota_monthly: 142000, quota_override: 100000 }), CHECKLIST),
  [],
);

// --- the PAYG regression signature ------------------------------------------

const payg = diagnoseAccount(
  active({ plan: "PAYG", quota_monthly: 100000 }),
  CHECKLIST,
);
check("PAYG flags quota.plan_outside_ladder", payg.map((f) => f.signature), ["quota.plan_outside_ladder"]);
check("PAYG finding cites the payg doc", payg[0]?.solution_doc_id ?? null, "sol-payg");
check("PAYG finding is warning", payg[0]?.severity ?? null, "warning");
check("PAYG finding not applied by default", payg[0]?.fix_applied ?? null, false);

// An override resolves the signature even with a non-ladder plan label.
check(
  "PAYG with override clean",
  diagnoseAccount(active({ plan: "PAYG", quota_monthly: 100000, quota_override: 100000 }), CHECKLIST),
  [],
);

// --- quota raised but not enforced ------------------------------------------

const raised = diagnoseAccount(
  active({ plan: "enterprise", quota_monthly: 150000 }),
  CHECKLIST,
);
check("raised quota flags quota.raised_but_not_enforced", raised.map((f) => f.signature), ["quota.raised_but_not_enforced"]);
check("raised finding cites quota doc", raised[0]?.solution_doc_id ?? null, "sol-quota");

// quota at or below the ladder with no override: nothing to flag.
check(
  "enterprise at ladder quota clean",
  diagnoseAccount(active({ plan: "enterprise", quota_monthly: 142000 }), CHECKLIST),
  [],
);

// --- proximity / exhaustion --------------------------------------------------

const near = diagnoseAccount(
  active({ plan: "free", quota_monthly: 32000, requests_used: 30000 }),
  CHECKLIST,
);
check("near exhaustion flagged", near.some((f) => f.signature === "quota.near_exhaustion"), true);
check("near exhaustion not critical", near.find((f) => f.signature === "quota.near_exhaustion")?.severity, "warning");

const spent = diagnoseAccount(
  active({ plan: "free", quota_monthly: 32000, requests_used: 32000 }),
  CHECKLIST,
);
check("exhaustion flagged critical", spent.some((f) => f.signature === "quota.exhausted"), true);
check("exhaustion severity critical", spent.find((f) => f.signature === "quota.exhausted")?.severity, "critical");

// PAYG credits act as a backstop: exhaustion only when the wallet is empty.
check(
  "exhaustion suppressed when payg funded",
  diagnoseAccount(active({ plan: "free", quota_monthly: 32000, requests_used: 32000, payg_credits_micro: 10_000 }), CHECKLIST),
  [],
);

// --- inactive accounts are skipped -------------------------------------------

check(
  "disabled account produces no findings",
  diagnoseAccount(active({ status: "disabled" }), CHECKLIST),
  [],
);

// --- the notify copy carries the self-host / owner split ----------------------

check("notice message mentions self-host", SELFHOST_NOTICE_MESSAGE.includes("self-host DGUI-HyperMem"), true);
check("notice message mentions owner contact", SELFHOST_NOTICE_MESSAGE.includes("contact the owner"), true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);