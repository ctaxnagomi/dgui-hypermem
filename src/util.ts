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

/**
 * Append-only CRM audit row.
 *
 * Lives in util rather than index because the billing endpoints need it too, and
 * importing index from a sibling module would create a cycle. Returns the
 * prepared statement rather than running it so callers can batch it with other
 * writes and await them together.
 */
export function logCrmAction(
  env: Env,
  email: string,
  action: string,
  detail: string | null,
  request: Request,
): D1PreparedStatement {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  const device = (request.headers.get("user-agent") || "").substring(0, 200);
  return env.DB.prepare("INSERT INTO crm_logs (email, action, detail, ip, device, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(email, action, detail, ip, device, now());
}
