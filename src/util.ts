import type { Env } from "./types";

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeContent(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().toLowerCase();
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

export function timeSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((t) => String(t)).filter(Boolean).slice(0, 32);
  if (typeof input === "string" && input.trim()) {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((t) => String(t)).filter(Boolean).slice(0, 32);
      } catch {
        /* not JSON; fall through to delimiter split */
      }
    }
    return trimmed
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 32);
  }
  return [];
}

export function firstJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// The `device` column exists in production (it was added out of band) but no
// migration creates it, so a database built from `migrations/` alone has no such
// column and every insert that names it fails with SQLITE_ERROR. That makes
// every admin handler that logs throw on a fresh DB, and it stays invisible
// until something writes a log.
//
// Self-healing rather than a migration: SQLite has no `ADD COLUMN IF NOT EXISTS`,
// so a migration would fail against the production database where the column
// already exists, and `d1 migrations apply --remote` cannot run here anyway (the
// ledger records only 0001-0003 against 14 live tables). This matches the lazy
// create pattern already used for quota_notices and admin_devices.
let crmDeviceReady: Promise<void> | null = null;

/**
 * Add crm_logs.device if this database lacks it. Memoised per isolate, since one
 * isolate serves one DB binding and the check only needs to succeed once. The
 * memo is cleared on failure so a transient error does not permanently disable
 * the repair.
 */
async function ensureCrmLogsDevice(env: Env): Promise<void> {
  if (!crmDeviceReady) {
    crmDeviceReady = (async () => {
      // SQLite has no IF NOT EXISTS on ADD COLUMN, so the column list is read
      // first. A failure here is caught below and logged, then the INSERT still
      // runs and surfaces the real error to the caller.
      const cols = await env.DB.prepare("PRAGMA table_info(crm_logs)").all<{ name: string }>();
      const names = new Set((cols?.results || []).map((c) => c.name));
      if (!names.has("device")) {
        await env.DB.prepare("ALTER TABLE crm_logs ADD COLUMN device TEXT").run();
      }
    })().catch((err: unknown) => {
      crmDeviceReady = null;
      console.error("[crm_logs] could not ensure device column:", String(err));
    });
  }
  return crmDeviceReady;
}

/**
 * Append-only CRM audit row.
 *
 * Lives in util rather than index because the billing endpoints need it too, and
 * importing index from a sibling module would create a cycle.
 *
 * Async, and it runs the insert itself rather than handing back a prepared
 * statement: it has to await ensureCrmLogsDevice() first, because the insert
 * names a column that may not exist yet. Callers therefore `await` this and no
 * longer call `.run()` on the result. Note that most call sites keep their
 * `.catch(() => {})`, so a failed audit write is deliberately silent and does
 * not fail the user's request -- which is also why a broken crm_logs schema went
 * unnoticed for so long, and why eval-crm-logs.mjs asserts on the row directly
 * instead of on handler responses.
 */
export async function logCrmAction(
  env: Env,
  email: string,
  action: string,
  detail: string | null,
  request: Request,
): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  const device = (request.headers.get("user-agent") || "").substring(0, 200);
  await ensureCrmLogsDevice(env);
  await env.DB.prepare("INSERT INTO crm_logs (email, action, detail, ip, device, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(email, action, detail, ip, device, now())
    .run();
}
