/**
 * Self-serve billing actions: starting the Pro trial and buying credit.
 *
 * Both are authenticated with the same email + passkey as the token form rather
 * than a bearer token, because they are reached from the pricing page before the
 * user has any credential. The passkey check is the authorisation boundary.
 */

import type { Env } from "./types";
import { json, logCrmAction, now } from "./util";
import { checkPasskey } from "./auth";
import {
  CREDIT_PACKS,
  PAYG_MICRO_PER_REQUEST,
  PLANS,
  TRIAL_DAYS,
  TRIAL_MS,
  TRIAL_PLAN,
  centsToMicro,
  planQuota,
  resolveTrial,
  upgradeOptions,
  type AccountState,
} from "./billing";

/**
 * Start the 15-day Pro trial.
 *
 * Idempotent and non-repeatable: a trial that has already been consumed is not
 * re-granted, so refreshing the page or retrying a request cannot farm Pro quota.
 * The `trial_started_at IS NULL` guard is what makes that atomic under
 * concurrent requests.
 */
export async function handleStartTrial(env: Env, body: Record<string, any>, request: Request): Promise<Response> {
  const { email, passkey } = body;
  if (!email || !passkey) return json({ error: "email and passkey are required" }, { status: 400 });
  const auth = checkPasskey(env, passkey);
  if (!auth.ok) return json({ error: auth.error }, { status: 401 });

  const account = await env.DB.prepare(
    "SELECT id, status, plan, quota_monthly, requests_used, requests_reset_at, payg_credits_micro, payg_spent_micro, trial_ends_at, trial_started_at FROM tokens WHERE email = ?",
  ).bind(email).first<AccountState>();
  if (!account) {
    return json({ error: "no account for that email -- request a token first" }, { status: 404 });
  }
  if (account.status !== "active") {
    return json({ error: "account is not active" }, { status: 403 });
  }
  if (account.trial_started_at) {
    const stillRunning = account.trial_ends_at && account.trial_ends_at > now();
    return json(
      {
        error: "trial already used",
        trial_ends_at: account.trial_ends_at,
        active: !!stillRunning,
        plan: stillRunning ? TRIAL_PLAN : account.plan,
      },
      { status: 409 },
    );
  }

  const now_ = now();
  const trialEnds = now_ + TRIAL_MS;
  const claimed = await env.DB.prepare(
    "UPDATE tokens SET plan = ?, quota_monthly = ?, trial_started_at = ?, trial_ends_at = ?, requests_used = 0, requests_reset_at = ?, updated_at = ? WHERE id = ? AND trial_started_at IS NULL",
  )
    .bind(TRIAL_PLAN, planQuota(TRIAL_PLAN), now_, trialEnds, now_ + 30 * 86400 * 1000, now_, account.id)
    .run();
  if (Number(claimed?.meta?.changes ?? 0) !== 1) {
    return json({ error: "trial already used" }, { status: 409 });
  }

  await logCrmAction(env, email, "trial_started", `${TRIAL_DAYS}-day ${TRIAL_PLAN} trial claimed`, request).run();
  return json({
    status: "active",
    plan: TRIAL_PLAN,
    trial_started_at: now_,
    trial_ends_at: trialEnds,
    trial_days: TRIAL_DAYS,
    quota_monthly: planQuota(TRIAL_PLAN),
    note: `The trial ends automatically and the account reverts to the ${PLANS.free.name} plan.`,
  });
}

/**
 * Record a Stripe purchase against an account.
 *
 * Called by the webhook once payment has settled. Adds credit to the wallet
 * rather than replacing a quota, so top-ups accumulate and survive a plan
 * change or a billing-period reset.
 */
export async function creditAccount(env: Env, email: string, amountCents: number, reference: string, request: Request): Promise<boolean> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return false;
  const account = await env.DB.prepare("SELECT id FROM tokens WHERE email = ?").bind(email).first<{ id: string }>();
  if (!account) return false;
  const micro = centsToMicro(amountCents);
  await Promise.all([
    env.DB.prepare("UPDATE tokens SET payg_credits_micro = payg_credits_micro + ?, updated_at = ? WHERE id = ?")
      .bind(micro, now(), account.id).run(),
    logCrmAction(env, email, "payg_topup", `$${(amountCents / 100).toFixed(2)} via ${reference}`, request).run(),
  ]);
  return true;
}

/** Remove credit on a refund or dispute, never driving the balance negative. */
export async function debitAccount(env: Env, email: string, amountCents: number, reference: string, request: Request): Promise<boolean> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return false;
  const micro = centsToMicro(amountCents);
  const removed = await env.DB.prepare(
    "UPDATE tokens SET payg_credits_micro = MAX(0, payg_credits_micro - ?), updated_at = ? WHERE email = ? AND payg_credits_micro >= ?",
  ).bind(micro, now(), email, micro).run();
  await logCrmAction(env, email, "payg_refund", `$${(amountCents / 100).toFixed(2)} via ${reference}`, request).run();
  return Number(removed?.meta?.changes ?? 0) === 1;
}

export interface BillingSummary {
  plan: string;
  quota_monthly: number;
  requests_used: number;
  requests_remaining: number;
  trial: { active: boolean; ends_at: number | null; plan: string; days: number } | null;
  payg: {
    credits_usd: number;
    requests_remaining: number;
    price_per_request_usd: number;
    spent_usd: number;
  };
  upgrade: ReturnType<typeof upgradeOptions>;
}

/** Everything the pricing and account pages need to render current state. */
export async function billingSummary(env: Env, email: string): Promise<BillingSummary> {
  const account = await env.DB.prepare(
    "SELECT id, status, plan, quota_monthly, requests_used, requests_reset_at, payg_credits_micro, payg_spent_micro, trial_ends_at, trial_started_at FROM tokens WHERE email = ?",
  ).bind(email).first<AccountState>();
  if (!account) throw new Error("no account");
  const now_ = now();
  const trial = resolveTrial(account);
  const quota = account.quota_monthly || planQuota(trial.plan);
  const used = account.requests_used || 0;
  const creditsMicro = account.payg_credits_micro || 0;
  return {
    plan: trial.plan,
    quota_monthly: quota,
    requests_used: used,
    requests_remaining: Math.max(0, quota - used),
    trial: account.trial_ends_at
      ? { active: account.trial_ends_at > now_, ends_at: account.trial_ends_at, plan: TRIAL_PLAN, days: TRIAL_DAYS }
      : null,
    payg: {
      credits_usd: creditsMicro / 1_000_000,
      requests_remaining: Math.floor(creditsMicro / PAYG_MICRO_PER_REQUEST),
      price_per_request_usd: PAYG_MICRO_PER_REQUEST / 1_000_000,
      spent_usd: (account.payg_spent_micro || 0) / 1_000_000,
    },
    upgrade: upgradeOptions(trial.plan),
  };
}

export { CREDIT_PACKS };
