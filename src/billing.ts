/**
 * Billing: plan quotas, the 15-day Pro trial, and the pay-as-you-go wallet.
 *
 * All money lives here rather than being spread across the quota gate, the REST
 * API, and the pricing page, because those three used to disagree -- the page
 * advertised Free as 1,000 requests while planQuota() returned 5,600. Prices are
 * now defined once and read from PLANS everywhere.
 *
 * Amounts are integer micro-dollars (1 USD = 1,000,000) or integer cents. Never
 * floats: at $0.002 per request, floating point drift becomes real misbilling.
 */

import { now } from "./util";

/** Cost of one pay-as-you-go request, in micro-dollars ($0.002). */
export const PAYG_MICRO_PER_REQUEST = 2000;

/** What one US cent is worth in micro-dollars. */
const MICRO_PER_CENT = 10_000;

export interface PlanDef {
  name: string;
  /** Requests included per billing month. */
  quota: number;
  /** Subscription price in cents. 0 for free. */
  priceCents: number;
  /** Stripe price id, when the plan is self-serve purchasable. */
  priceId?: string;
}

/**
 * The plan ladder.
 *
 * Free is deliberately a small fraction of the cheapest paid tier. At Free
 * 8,500 against Pro 15,000 a free user received 57% of the paid quota for
 * nothing, which gutted upgrade pressure; 2,000 against Median 8,500 puts it at
 * 24%, so the step up is worth paying for.
 */
export const PLANS: Record<string, PlanDef> = {
  free: { name: "Free", quota: 2000, priceCents: 0 },
  median: { name: "Median", quota: 8500, priceCents: 299, priceId: "price_1UICicLjoFSWfKc7s3edXQzs" },
  pro: { name: "Pro", quota: 15000, priceCents: 1199, priceId: "price_1UICitLjoFSWfKc7PYVoJ5hj" },
  enterprise: { name: "Enterprise", quota: 25000, priceCents: 2999 },
};

export const PLAN_ORDER = ["free", "median", "pro", "enterprise"] as const;

/** Length of the Pro trial, and the plan it grants. */
export const TRIAL_DAYS = 15;
export const TRIAL_PLAN = "pro";

export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Look up a plan, case-insensitively.
 *
 * The tokens table accumulated both 'pro' and 'Pro' (and both 'enterprise'
 * spellings) from manual admin edits. A plain object lookup silently missed the
 * capitalised rows and billed them at the free allowance, so normalisation
 * matters at read time too, not just in migration.
 */
export function lookupPlan(plan: string | null | undefined): PlanDef | undefined {
  return PLANS[(plan || "free").toLowerCase()];
}

export function planQuota(plan: string | null | undefined): number {
  return lookupPlan(plan)?.quota ?? PLANS.free.quota;
}

/** The next plan up from `plan`, for upgrade messaging. */
export function nextPlan(plan: string | null | undefined): string | null {
  const index = PLAN_ORDER.indexOf((plan || "free") as (typeof PLAN_ORDER)[number]);
  if (index < 0 || index >= PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[index + 1];
}

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatUsdFromMicro(micro: number): string {
  return (micro / 1_000_000).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

export function centsToMicro(cents: number): number {
  return cents * MICRO_PER_CENT;
}

/** What one pay-as-you-go request is worth in requests, for display. */
export function requestsPerDollar(): number {
  return Math.floor(1_000_000 / PAYG_MICRO_PER_REQUEST);
}

export interface AccountState {
  id: string;
  email: string;
  status: string;
  plan: string;
  quota_monthly: number;
  /** Admin-granted custom cap. NULL means "follow the plan". */
  quota_override: number | null;
  requests_used: number;
  requests_reset_at: number | null;
  payg_credits_micro: number;
  payg_spent_micro: number;
  trial_ends_at: number | null;
  trial_started_at: number | null;
}

export const ACCOUNT_COLUMNS =
  "id, email, status, plan, quota_monthly, quota_override, requests_used, requests_reset_at, " +
  "payg_credits_micro, payg_spent_micro, trial_ends_at, trial_started_at";

/**
 * The allowance actually enforced for an account.
 *
 * An explicit override wins, so an admin can still grant a bespoke cap, but the
 * common case is NULL and the plan decides. Reading `quota_monthly` here instead
 * is what previously made the plan ladder decorative.
 */
export function effectiveQuota(account: Pick<AccountState, "quota_override"> & { plan: string }, plan?: string): number {
  if (account.quota_override != null) return account.quota_override;
  return planQuota(plan ?? account.plan);
}

export type AccountRow = Record<string, unknown>;

/**
 * Lapse an expired trial.
 *
 * Enforced lazily on the request path rather than by a scheduled job: the
 * downgrade is persisted when it is detected, so the plan shown to the user and
 * the plan enforced on the gate can never disagree, and no cron dependency is
 * introduced. The returned flag says whether a write is needed.
 */
export function resolveTrial(account: AccountState): { plan: string; trialExpired: boolean; expired: boolean } {
  if (!account.trial_ends_at) return { plan: account.plan, trialExpired: false, expired: false };
  if (account.trial_ends_at > now()) {
    // Trial still running: the trial plan wins even if the row says otherwise.
    return { plan: TRIAL_PLAN, trialExpired: false, expired: false };
  }
  return { plan: "free", trialExpired: true, expired: true };
}

export type Funding =
  | { allowed: true; source: "plan" }
  | { allowed: true; source: "payg" }
  | { allowed: true; source: "master" }
  | { allowed: false; reason: string; code: string; status: number; upgrade: UpgradeOptions };

export interface UpgradeOptions {
  plan: string | null;
  planName: string | null;
  planPriceUsd: string | null;
  planQuota: number | null;
  enterpriseName: string | null;
  enterprisePriceUsd: string | null;
  enterpriseQuota: number | null;
  paygPriceUsd: string;
  paygRequestsPerDollar: number;
  checkoutUrl: string;
  message: string;
}

/**
 * What to tell someone who has hit their allowance.
 *
 * Built from PLANS rather than written as prose, so the copy cannot drift out of
 * sync with the prices actually charged.
 */
export function upgradeOptions(plan: string | null | undefined): UpgradeOptions {
  const current = plan || "free";
  const up = nextPlan(current);
  const upDef = up ? PLANS[up] : null;
  const enterprise = PLANS.enterprise;
  const paygPriceUsd = formatUsdFromMicro(PAYG_MICRO_PER_REQUEST);

  const parts: string[] = [];
  if (upDef) {
    parts.push(
      `upgrade to ${upDef.name} for $${formatUsdFromCents(upDef.priceCents)}/month ` +
        `(${upDef.quota.toLocaleString("en-US")} requests)`,
    );
  }
  parts.push(
    `go straight to ${enterprise.name} at $${formatUsdFromCents(enterprise.priceCents)}/month ` +
      `(${enterprise.quota.toLocaleString("en-US")} requests)`,
  );
  parts.push(
    `or top up pay-as-you-go at $${paygPriceUsd} per request ` +
      `(about ${requestsPerDollar().toLocaleString("en-US")} requests per $1) and pay only for what you use`,
  );

  return {
    plan: up,
    planName: upDef?.name ?? null,
    planPriceUsd: upDef ? formatUsdFromCents(upDef.priceCents) : null,
    planQuota: upDef?.quota ?? null,
    enterpriseName: enterprise.name,
    enterprisePriceUsd: formatUsdFromCents(enterprise.priceCents),
    enterpriseQuota: enterprise.quota,
    paygPriceUsd,
    paygRequestsPerDollar: requestsPerDollar(),
    checkoutUrl: "/payment",
    message: `Monthly ${PLANS[current]?.name ?? current} allowance reached. ` +
      `You can ${parts.join(", ")}.`,
  };
}

/** Credit packs sold as one-time Stripe payments. */
export const CREDIT_PACKS: Record<string, { label: string; priceCents: number }> = {
  small: { label: "$10", priceCents: 1000 },
  medium: { label: "$25", priceCents: 2500 },
  large: { label: "$50", priceCents: 5000 },
};
