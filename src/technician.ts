/**
 * Technician JEV agent: corpus-backed account diagnostics for the owner.
 *
 * The technician debugs from the solution corpus: the checklist is the set of
 * active `solution`-type memories in the store (the same rows the daily embed
 * ingest publishes to the HF embed corpus). Each evaluation maps an account's
 * token row against those documented signatures and produces an owner-facing
 * findings list. Nothing here invents a rule the corpus does not already state;
 * a fix is only ever applied when a solution doc in the store prescribes it.
 *
 * Two surfaces expose it:
 *   - MCP tool `technician_check` (owner token only)
 *   - REST `/api/technician_check` (admin host, adminGate)
 */

import {
  effectiveQuota,
  lookupPlan,
  planQuota,
} from "./billing";
import type { Env } from "./types";
import { now } from "./util";
import { recordQuotaNotice } from "./store";

/* ------------------------------------------------------------------ shapes */

/** The slice of a token row the technician reads. */
export interface AccountProbe {
  id: string;
  email: string;
  status: string;
  plan: string;
  quota_monthly: number;
  quota_override: number | null;
  requests_used: number;
  requests_reset_at: number | null;
  payg_credits_micro: number;
  payg_spent_micro: number;
  train_with_all: number;
}

export const PROBE_COLUMNS =
  "id, email, status, plan, quota_monthly, quota_override, requests_used, requests_reset_at, " +
  "payg_credits_micro, payg_spent_micro, train_with_all";

/** A solution doc from the store: one entry in the technician's checklist. */
export interface SolutionDoc {
  id: string;
  content: string;
  memory_type: string | null;
  tags: string[];
  status: string;
  created_at: number;
}

export type FindingSeverity = "info" | "warning" | "critical";

export interface TechnicianFinding {
  email: string;
  /** Stable rule id, e.g. `quota.plan_outside_ladder`. */
  signature: string;
  severity: FindingSeverity;
  detail: string;
  /** The solution doc that prescribes this finding, when one matches. */
  solution_doc_id: string | null;
  /** What the corpus doc instructs the operator to do. */
  suggested_fix: string;
  /** True when this run applied the fix to the account row. */
  fix_applied: boolean;
}

export interface TechnicianReport {
  run_at: number;
  accounts_checked: number;
  findings: TechnicianFinding[];
  applied_fixes: { email: string; signature: string; quota_override: number }[];
  notified: string[];
  by_signature: Record<string, number>;
  solution_docs: { id: string; tags: string[]; created_at: number }[];
}

/* ------------------------------------------------------- checklist loading */

/**
 * Load the technician's checklist: active solution-type memories.
 *
 * This is the same population the daily embed ingest selects, so the checklist
 * the technician debugs against IS the corpus (minus the sink hop). A solution
 * doc matches a rule when its tags include the rule's signature tag.
 */
export async function loadSolutionChecklist(env: Env): Promise<SolutionDoc[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, content, memory_type, tags, status, created_at
       FROM memories
      WHERE memory_type = 'solution' AND status = 'active'
      ORDER BY created_at DESC`,
  ).all<{
    id: string;
    content: string;
    memory_type: string | null;
    tags: string;
    status: string;
    created_at: number;
  }>();
  return (results || []).map((r) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(r.tags || "[]");
    } catch {
      tags = [];
    }
    return { ...r, tags };
  });
}

/** Find the checklist doc whose tags match a rule's tag, if any. */
export function docForTag(checklist: SolutionDoc[], tag: string, excludeTag?: string): SolutionDoc | null {
  const matched = checklist.filter((d) => d.tags.includes(tag));
  if (excludeTag) {
    const preferred = matched.find((d) => !d.tags.includes(excludeTag));
    if (preferred) return preferred;
  }
  return matched[0] ?? null;
}

/* ------------------------------------------------------------- diagnostics */

/**
 * Pure evaluation of one account against a solution doc. `effectiveQuota` is
 * reused from billing so the technician never disagrees with the gate.
 */
export function diagnoseAccount(
  account: AccountProbe,
  checklist: SolutionDoc[],
): TechnicianFinding[] {
  if (account.status !== "active") return [];
  const findings: TechnicianFinding[] = [];
  const planDef = lookupPlan(account.plan);
  const ladderQuota = planQuota(account.plan);
  const quota = account.quota_monthly || 0;

  // 1. Plan outside the ladder with a typed quota but no override: the gate
  //    reads quota_override first, then the ladder; an unknown label (e.g.
  //    PAYG) collapses to the free allowance unless quota_override is set, so
  //    the typed quota is silently ignored. The corpus doc (tag "payg") is
  //    the only rule that prescribes this finding.
  if (!planDef && account.quota_override === null && quota > 0 && quota > ladderQuota) {
    const doc = docForTag(checklist, "payg");
    findings.push({
      email: account.email,
      signature: "quota.plan_outside_ladder",
      severity: "warning",
      detail: `plan "${account.plan}" is outside the ladder and quota_monthly=${quota} has no quota_override; the gate collapses this account to the ${ladderQuota}-request free allowance.`,
      solution_doc_id: doc?.id ?? null,
      suggested_fix: "mirror quota_monthly into quota_override (handleUpdateQuota) or set quota_override = quota_monthly on the row",
      fix_applied: false,
    });
  }

  // 2. Quota raised above the plan, but the ladder is authoritative because no
  //    override exists: pre-fix admin updates wrote only quota_monthly, so the
  //    raised allowance was never enforced.
  if (planDef && account.quota_override === null && quota > ladderQuota) {
    const doc = docForTag(checklist, "quota", "payg");
    findings.push({
      email: account.email,
      signature: "quota.raised_but_not_enforced",
      severity: "warning",
      detail: `plan "${account.plan}" ladder quota is ${ladderQuota} but quota_monthly=${quota} with no quota_override; the raised allowance is not enforced.`,
      solution_doc_id: doc?.id ?? null,
      suggested_fix: "set quota_override = quota_monthly (the typed value wins over the ladder)",
      fix_applied: false,
    });
  }

  // Effective allowance for the remaining proximity checks.
  const eff = effectiveQuota(account, account.plan);
  const paygEmpty = account.payg_credits_micro <= 0;
  const spent = Math.max(0, eff - account.requests_used);

  // 3. Near exhaustion: nothing to say until the account is at risk; then the
  //    corpus instructs notifying the user with the self-host vs. owner split.
  if (account.requests_used >= eff * 0.9 && spent > 0 && paygEmpty) {
    const doc = docForTag(checklist, "quota", "payg");
    findings.push({
      email: account.email,
      signature: "quota.near_exhaustion",
      severity: "warning",
      detail: `${account.requests_used}/${eff} requests used (${Math.round((account.requests_used / eff) * 100)}%), no pay-as-you-go credits, ${spent} requests left this window.`,
      solution_doc_id: doc?.id ?? null,
      suggested_fix: "raise the allowance or top up payg; notify the user (self-host: apply the fix; hosted: contact the owner)",
      fix_applied: false,
    });
  }

  // 4. Hard cap: the gate will 429 this account on the next request.
  if (account.requests_used >= eff && paygEmpty) {
    const doc = docForTag(checklist, "quota", "payg");
    findings.push({
      email: account.email,
      signature: "quota.exhausted",
      severity: "critical",
      detail: `${account.requests_used}/${eff} requests used with no pay-as-you-go credits; next request is rejected.`,
      solution_doc_id: doc?.id ?? null,
      suggested_fix: "raise the allowance or top up payg before the next window",
      fix_applied: false,
    });
  }

  return findings;
}

/* ---------------------------------------------------------------- the sweep */

export interface TechnicianOptions {
  /** Apply the corpus-prescribed fixes (quota_override mirror) and notify. */
  apply_fixes?: boolean;
  /** Restrict to one account, for a targeted fix. */
  email?: string;
}

const FIXABLE = new Set(["quota.plan_outside_ladder", "quota.raised_but_not_enforced"]);

/**
 * One technician pass: load the checklist, probe every active account, and
 * apply the corpus-prescribed fixes when asked. Returns the owner-facing
 * report; the write path is opt-in so a plain run is read-only.
 */
export async function runTechnicianCheck(env: Env, opts: TechnicianOptions = {}): Promise<TechnicianReport> {
  const checklist = await loadSolutionChecklist(env);
  const { results } = await env.DB.prepare(`SELECT ${PROBE_COLUMNS} FROM tokens`)
    .all<AccountProbe>();
  const probes: AccountProbe[] = (results || []).filter(
    (p) => !opts.email || p.email === opts.email,
  );

  const findings: TechnicianFinding[] = [];
  const applied: TechnicianReport["applied_fixes"] = [];
  const notified: string[] = [];

  for (const account of probes) {
    const found = diagnoseAccount(account, checklist);
    for (const f of found) {
      const fixable = opts.apply_fixes && FIXABLE.has(f.signature) && account.quota_override === null;
      if (fixable) {
        await env.DB.prepare(
          "UPDATE tokens SET quota_override = ?, updated_at = ? WHERE id = ?",
        )
          .bind(account.quota_monthly, now(), account.id)
          .run();
        f.fix_applied = true;
        f.detail += " quota_override applied this run.";
        applied.push({ email: account.email, signature: f.signature, quota_override: account.quota_monthly });
        if (!notified.includes(account.email)) {
          notified.push(account.email);
          // Corpus protocol: solving internally is not enough, notify the
          // account with the self-host vs. hosted split. Never fail the sweep
          // over a notice write; the fix itself is already committed.
          await recordQuotaNotice(env, account.email, "service_notice", SELFHOST_NOTICE_MESSAGE, {
            fix: f.signature,
            applied_by: "technician",
          }).catch((err: unknown) => console.error("technician notice write failed:", String(err)));
        }
      }
    }
    findings.push(...found);
  }

  const bySignature: Record<string, number> = {};
  for (const f of findings) {
    bySignature[f.signature] = (bySignature[f.signature] ?? 0) + 1;
  }

  return {
    run_at: now(),
    accounts_checked: probes.length,
    findings,
    applied_fixes: applied,
    notified,
    by_signature: bySignature,
    solution_docs: checklist.map((d) => ({ id: d.id, tags: d.tags, created_at: d.created_at })),
  };
}

/** The self-host vs. hosted MCP split, verbatim from the corpus protocol. */
export const SELFHOST_NOTICE_MESSAGE =
  "A quota-enforcement issue was fixed on your account. If you self-host DGUI-HyperMem, " +
  "this fix is yours to apply in your deployment; if you use the hosted DGUI-HyperMem MCP, " +
  "contact the owner to have it applied.";