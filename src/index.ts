// DGUI-HyperMem (DeckerGUI HyperMemory)
//
// A self-hosted memory MCP server on Cloudflare Workers.
//   /mcp        -> stateless Streamable HTTP MCP (add, search, profile, list, forget, help)
//   /api/*      -> small REST mirror for curl/automation
//   /health     -> unauthenticated status
//
// Retrieval is hybrid: Vectorize ANN + D1 FTS5 BM25, fused with reciprocal rank,
// then re-ranked by the JEV layer (see src/jev.ts).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import type { Env } from "./types";
import { addMemory, forgetMemories, listMemories, profile, searchMemories } from "./store";
import { MEMORY_TYPES, resolveMode } from "./jev";
import { flushJevExamples, jevQueueStats } from "./dataset";
import { json, now, timeSafeEqual, uuid } from "./util";
import { ADMIN_HTML } from "./admin";
import { PRIVACY_HTML } from "./privacy";
import { HOWTO_HTML } from "./howto";
import { TERMS_HTML } from "./terms";
import { createCheckoutSession, handleStripeWebhook, PAYMENT_HTML } from "./payment";
import { RETURN_HTML } from "./returnpolicy";
import { LEGAL_HTML } from "./legal";
import { LANDING_HTML } from "./landing";

const SERVER_NAME = "dgui-hypermem";
const SERVER_VERSION = "1.0.0";

const HELP = `DGUI-HyperMem (DeckerGUI HyperMemory) - hybrid long-term memory with a JEV reasoning layer.

Tools
  add      Store a memory. JEV types it (choice), scores its salience (score), and drops
           anything it considers non-durable. Optionally supersedes memories it contradicts.
  search   Hybrid recall: vector + keyword candidates, fused, then JEV re-ranked.
  list     Browse recent memories in a scope.
  profile  Summarise a scope: counts by type, top tags, average salience.
  forget   Delete by id, by search query, or everything in a scope.
  sync_jev_dataset
           Flush queued JEV decisions to the DGUI_HYPERMEM-JEV training dataset (also runs hourly).
  jev_queue_stats
           Show how many JEV examples are queued, uploaded, or failed, and the target dataset.
  help     This text.

Memory types (choice): ${Object.keys(MEMORY_TYPES).join(", ")}
Scopes are independent memory spaces; use one per user, project, or agent.
JEV backend is reported by the "provider" field: typesafe | workers-ai | off.
Every JEV decision is logged to ctaxnagomi/DGUI_HYPERMEM-JEV and flushed hourly.`;

type ToolText = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(value: unknown): ToolText {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): ToolText {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function buildServer(env: Env): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: HELP },
  );

  server.registerTool(
    "add",
    {
      title: "Add memory",
      description: "Store a durable memory. JEV assigns a type and salience, and supersedes contradicted memories.",
      inputSchema: {
        content: z.string().describe("The memory text to store."),
        scope: z.string().optional().describe("Memory space; defaults to the server default scope."),
        tags: z.array(z.string()).optional().describe("Optional tags for filtering and keyword search."),
        source: z.string().optional().describe("Where this memory came from (agent, file, url)."),
        check_contradictions: z
          .boolean()
          .optional()
          .describe("Run the JEV supersede check against nearby memories (default true)."),
      },
    },
    async (args) => {
      try {
        const result = await addMemory(env, {
          content: args.content,
          scope: args.scope,
          tags: args.tags,
          source: args.source,
          checkContradictions: args.check_contradictions,
        });
        return ok({
          id: result.memory.id,
          created: result.created,
          memory_type: result.memory.memory_type,
          salience: result.memory.salience,
          durable: result.memory.durable,
          jev_provider: result.analysis.provider,
          superseded: result.superseded.map((s) => ({ id: s.id, probability: s.probability })),
        });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search memory",
      description: "Hybrid recall (vectors + keywords, fused) then JEV re-ranking. Returns the best memories for a query.",
      inputSchema: {
        query: z.string().describe("What to recall."),
        scope: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)."),
        type: z.enum(Object.keys(MEMORY_TYPES) as [string, ...string[]]).optional().describe("Restrict to one memory type."),
        durable_only: z.boolean().optional().describe("Drop memories JEV considered non-durable."),
      },
    },
    async (args) => {
      try {
        const results = await searchMemories(env, args.query, {
          scope: args.scope,
          limit: args.limit,
          type: args.type ?? null,
          durableOnly: args.durable_only,
        });
        return ok({
          query: args.query,
          count: results.length,
          results: results.map((m) => ({
            id: m.id,
            content: m.content,
            memory_type: m.memory_type,
            tags: m.tags,
            salience: m.salience,
            score: Number(m.score.toFixed(4)),
            jev_score: m.jev_score === null ? null : Number(m.jev_score.toFixed(4)),
            created_at: m.created_at,
          })),
        });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "list",
    {
      title: "List memories",
      description: "Browse memories in a scope, newest first.",
      inputSchema: {
        scope: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default 25)."),
        type: z.enum(Object.keys(MEMORY_TYPES) as [string, ...string[]]).optional(),
        status: z.enum(["active", "superseded", "deleted"]).optional(),
      },
    },
    async (args) => {
      try {
        const memories = await listMemories(env, {
          scope: args.scope,
          limit: args.limit,
          type: args.type ?? null,
          status: args.status ?? null,
        });
        return ok({
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            memory_type: m.memory_type,
            tags: m.tags,
            salience: m.salience,
            status: m.status,
            created_at: m.created_at,
          })),
        });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "profile",
    {
      title: "Memory profile",
      description: "Summarise a scope: totals, counts by type, top tags, average salience, and the newest memories.",
      inputSchema: { scope: z.string().optional() },
    },
    async (args) => {
      try {
        return ok(await profile(env, args.scope));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "forget",
    {
      title: "Forget memories",
      description: "Delete memories by id, by a search query, or clear an entire scope.",
      inputSchema: {
        ids: z.array(z.string()).optional().describe("Exact memory ids to delete."),
        query: z.string().optional().describe("Delete the closest matches to this query."),
        scope: z.string().optional(),
        all: z.boolean().optional().describe("Delete everything in the scope. Use with care."),
      },
    },
    async (args) => {
      try {
        if (!args.ids?.length && !args.query && !args.all) {
          return fail("provide ids, query, or all:true");
        }
        return ok(await forgetMemories(env, { ids: args.ids, query: args.query, scope: args.scope, all: args.all }));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "help",
    { title: "Help", description: "Describe DGUI-HyperMem and its tools.", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: HELP }] }),
  );

  server.registerTool(
    "sync_jev_dataset",
    {
      title: "Sync JEV dataset",
      description: "Flush pending JEV decision examples to the DGUI_HYPERMEM-JEV HuggingFace dataset (also runs on an hourly schedule).",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional().describe("Max rows to flush this call (default 200)."),
      },
    },
    async (args) => {
      try {
        return ok(await flushJevExamples(env, args.limit));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "jev_queue_stats",
    {
      title: "JEV queue stats",
      description: "Queue status for the DGUI_HYPERMEM-JEV training dataset: pending/uploaded/error counts, breakdown by use case, target repo.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await jevQueueStats(env));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  return server;
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  const server = buildServer(env);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => undefined);
  }
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const mcpToken = env.MCP_TOKEN;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const apiKey = request.headers.get("x-api-key") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  const token = bearer || apiKey || queryToken;
  if (!token) return !mcpToken;
  if (mcpToken && (timeSafeEqual(bearer, mcpToken) || timeSafeEqual(apiKey, mcpToken) || timeSafeEqual(queryToken, mcpToken))) return true;
  try {
    const row = await env.DB.prepare("SELECT status FROM tokens WHERE token = ? AND status = 'active'").bind(token).first<{ status: string }>();
    return !!row;
  } catch { return false; }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function handleRest(request: Request, env: Env, path: string): Promise<Response> {
  const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, any>) : {};
  const url = new URL(request.url);
  const scope = body.scope || url.searchParams.get("scope") || undefined;

  switch (path) {
    case "/api/add":
      return json(await addMemory(env, { content: body.content, scope, tags: body.tags, source: body.source }), {
        headers: CORS,
      });
    case "/api/search":
      return json(
        await searchMemories(env, body.query || url.searchParams.get("query") || "", {
          scope,
          limit: body.limit ? Number(body.limit) : undefined,
          type: body.type ?? null,
          durableOnly: body.durable_only,
        }),
        { headers: CORS },
      );
    case "/api/list":
      return json(await listMemories(env, { scope, limit: body.limit, type: body.type ?? null, status: body.status ?? null }), {
        headers: CORS,
      });
    case "/api/profile":
      return json(await profile(env, scope), { headers: CORS });
    case "/api/forget":
      return json(await forgetMemories(env, { ids: body.ids, query: body.query, scope, all: body.all }), {
        headers: CORS,
      });
    case "/api/sync_jev":
      return json(await flushJevExamples(env, body.limit ? Number(body.limit) : undefined), { headers: CORS });
    case "/api/jev_queue_stats":
      return json(await jevQueueStats(env, scope), { headers: CORS });
    case "/api/request-token":
      return json(await handleRequestToken(env, body, request), { headers: CORS });
    case "/api/check-star":
      return json(await handleCheckStar(env, body), { headers: CORS });
    case "/api/disable-token":
      return json(await handleDisableToken(env, body, request), { headers: CORS });
    case "/api/admin/tokens":
      return json(await handleAdminTokens(env, body, url, request), { headers: CORS });
    case "/api/admin/logs":
      return json(await handleAdminLogs(env, body, url, request), { headers: CORS });
    case "/api/admin/toggle-train":
      return json(await handleToggleTrain(env, body), { headers: CORS });
    case "/api/check-quota":
      return json(await handleCheckQuota(env, request), { headers: CORS });
    case "/api/enterprise-inquiry":
      return json(await handleEnterpriseInquiry(env, body), { headers: CORS });
    case "/api/create-checkout-session":
      return json(await createCheckoutSession(env, body), { headers: CORS });
    case "/api/stripe-webhook":
      return await handleStripeWebhook(env, request);
    case "/api/admin/stats":
      return json(await handleAdminStats(env, body, url, request), { headers: CORS });
    default:
      return json({ error: "not found" }, { status: 404, headers: CORS });
  }
}

async function handleAdminTokens(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const masterPasskey = env.MASTER_PASSKEY;
  const passkey = body.passkey || url.searchParams.get("passkey") || "";
  if (!masterPasskey || passkey !== masterPasskey) {
    await logCrmAction(env, "unknown", "admin_login_fail", `failed admin token list attempt`, request).run().catch(() => {});
    return { error: "unauthorized" };
  }
  await logCrmAction(env, "admin", "admin_login_success", "viewed token list", request).run().catch(() => {});
  const { results } = await env.DB.prepare("SELECT id, email, status, token, plan, quota_monthly, requests_used, requests_reset_at, train_with_all, has_connected, tc_agreed, created_at, updated_at FROM tokens ORDER BY created_at DESC LIMIT 500").bind().all<{ id: string; email: string; status: string; token: string | null; plan: string; quota_monthly: number; requests_used: number; requests_reset_at: number | null; train_with_all: number; has_connected: number; tc_agreed: number; created_at: number; updated_at: number }>();
  return { tokens: results || [] };
}

function logCrmAction(env: Env, email: string, action: string, detail: string | null, request: Request): D1PreparedStatement {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  const device = (request.headers.get("user-agent") || "").substring(0, 200);
  return env.DB.prepare("INSERT INTO crm_logs (email, action, detail, ip, device, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(email, action, detail, ip, device, now());
}

function classifyPath(path: string): string {
  if (path.startsWith("/mcp")) return "mcp";
  if (path.includes("/api/add")) return "memory_add";
  if (path.includes("/api/search")) return "memory_search";
  if (path.includes("/api/list")) return "memory_list";
  if (path.includes("/api/profile")) return "memory_profile";
  if (path.includes("/api/forget")) return "memory_forget";
  if (path.includes("/request-token")) return "crm_token";
  if (path.includes("/disable-token")) return "crm_revoke";
  if (path.includes("/check-quota")) return "crm_quota";
  if (path.includes("/admin")) return "admin";
  if (path.includes("/health")) return "health";
  return "other";
}

async function handleAdminLogs(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const masterPasskey = env.MASTER_PASSKEY;
  const passkey = body.passkey || url.searchParams.get("passkey") || "";
  if (!masterPasskey || passkey !== masterPasskey) {
    await logCrmAction(env, "unknown", "admin_logs_fail", "failed admin logs attempt", request).run().catch(() => {});
    return { error: "unauthorized" };
  }
  await logCrmAction(env, "admin", "admin_logs_success", "viewed admin logs", request).run().catch(() => {});
  const limit = Math.min(Math.max(Number(body.limit || url.searchParams.get("limit") || 100), 1), 500);
  const filterEmail = url.searchParams.get("email") || "";
  const filterAction = url.searchParams.get("action") || "";
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const offset = (page - 1) * limit;
  let sql = "SELECT id, email, action, detail, ip, device, created_at FROM crm_logs";
  let countSql = "SELECT COUNT(*) as total FROM crm_logs";
  const params: any[] = [];
  const wheres: string[] = [];
  if (filterEmail) { wheres.push("email = ?"); params.push(filterEmail); }
  if (filterAction) { wheres.push("action = ?"); params.push(filterAction); }
  const whereClause = wheres.length ? " WHERE " + wheres.join(" AND ") : "";
  sql += whereClause + " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  countSql += whereClause;
  const totalRow = await env.DB.prepare(countSql).bind(...params).first<{ total: number }>();
  const total = totalRow?.total || 0;
  const { results } = await env.DB.prepare(sql).bind(...params, limit, offset).all<{ id: number; email: string; action: string; detail: string | null; ip: string | null; device: string | null; created_at: number }>();
  return { logs: results || [], total, page, limit, pages: Math.ceil(total / limit) };
}

async function handleToggleTrain(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  const { email, passkey, train_with_all } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  const masterPasskey = env.MASTER_PASSKEY;
  if (!masterPasskey || passkey !== masterPasskey) return { error: "unauthorized" };
  const value = train_with_all === true || train_with_all === 1 ? 1 : 0;
  await env.DB.prepare("UPDATE tokens SET train_with_all = ?, updated_at = ? WHERE email = ?").bind(value, now(), email).run();
  return { email, train_with_all: !!value, status: "updated" };
}

async function handleRequestToken(env: Env, body: Record<string, any>, request: Request): Promise<Record<string, any>> {
  const { email, passkey, tc_agreed } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalid email" };
  const userPasskey = env.PASSKEY || "0866";
  const masterPasskey = env.MASTER_PASSKEY;
  const isMaster = masterPasskey && passkey === masterPasskey;
  if (passkey !== userPasskey && !isMaster) return { error: "invalid passkey" };
  if (!isMaster && !tc_agreed) return { error: "you must agree to the Terms and Privacy Policy" };
  const existing = await env.DB.prepare("SELECT id, status, token, train_with_all, tc_agreed FROM tokens WHERE email = ?").bind(email).first<{ id: string; status: string; token: string | null; train_with_all: number; tc_agreed: number }>();
  if (existing) {
    if (existing.status === "active" && existing.token) {
      await logCrmAction(env, email, "token_retrieved", "re-issued existing token", request).run();
      return { status: "active", token: existing.token, train_with_all: !!existing.train_with_all, tc_agreed: !!existing.tc_agreed };
    }
    const token = uuid();
    await Promise.all([
      env.DB.prepare("UPDATE tokens SET status = 'active', token = ?, updated_at = ? WHERE id = ?").bind(token, now(), existing.id).run(),
      logCrmAction(env, email, isMaster ? "token_master_issue" : "token_reissued", "re-activated disabled token", request).run(),
    ]);
    return { status: "active", token, train_with_all: true };
  }
  // Enforce 100-user limit
  const countRow = await env.DB.prepare("SELECT COUNT(*) as c FROM tokens WHERE status = 'active'").bind().first<{ c: number }>();
  if (!isMaster && (countRow?.c || 0) >= 100) {
    return { error: "user limit reached (100 max). Contact admin." };
  }
  const token = uuid();
  await Promise.all([
    env.DB.prepare("INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly, tc_agreed, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, 'free', 1000, 1, ?, ?)")
      .bind(uuid(), email, email, token, now(), now()).run(),
    logCrmAction(env, email, isMaster ? "token_master_created" : "token_created", "new token via CRM", request).run(),
  ]);
  return { status: "active", token, train_with_all: true, tc_agreed: true };
}

async function handleCheckStar(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  return { error: "no longer required", starred: true };
}

async function handleDisableToken(env: Env, body: Record<string, any>, request: Request): Promise<Record<string, any>> {
  const { email, passkey } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  const userPasskey = env.PASSKEY || "0866";
  const masterPasskey = env.MASTER_PASSKEY;
  const isMaster = masterPasskey && passkey === masterPasskey;
  if (passkey !== userPasskey && !isMaster) return { error: "invalid passkey" };
  const row = await env.DB.prepare("SELECT id, status FROM tokens WHERE email = ?").bind(email).first<{ id: string; status: string }>();
  if (!row) return { error: "no token found" };
  if (row.status === "disabled") {
    await logCrmAction(env, email, "token_disabled_again", "attempted re-disable", request).run();
    return { status: "disabled" };
  }
  await Promise.all([
    env.DB.prepare("UPDATE tokens SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now(), row.id).run(),
    logCrmAction(env, email, isMaster ? "token_master_disabled" : "token_disabled", "token revoked", request).run(),
  ]);
  return { status: "disabled" };
}

function planQuota(plan: string | null): number {
  switch (plan) {
    case "median": return 3500;
    case "pro": return 6500;
    case "enterprise": return 999999;
    default: return 1000;
  }
}

async function handleCheckQuota(env: Env, request: Request): Promise<Record<string, any>> {
  const token = extractToken(request);
  if (!token) return { error: "no token provided" };
  const row = await env.DB.prepare("SELECT email, status, plan, quota_monthly, requests_used, requests_reset_at FROM tokens WHERE token = ?").bind(token).first<{ email: string; status: string; plan: string; quota_monthly: number; requests_used: number; requests_reset_at: number | null }>();
  if (!row) return { error: "invalid token" };
  const plan = row.plan || "free";
  const now_ = now();
  let quota = row.quota_monthly || planQuota(plan);
  let used = row.requests_used || 0;
  let resetAt = row.requests_reset_at;
  if (!resetAt || now_ > resetAt) {
    used = 0;
    resetAt = now_ + 30 * 86400 * 1000;
    await env.DB.prepare("UPDATE tokens SET requests_used = 0, requests_reset_at = ? WHERE token = ?").bind(resetAt, token).run();
  }
  const day = 86400 * 1000;
  const month = 30 * day;
  const year = 365 * day;
  const user30d = await env.DB.prepare("SELECT COUNT(*) as c FROM usage_events WHERE email = ? AND event_at > ?").bind(row.email, now_ - month).first<{ c: number }>();
  const userYear = await env.DB.prepare("SELECT COUNT(*) as c FROM usage_events WHERE email = ? AND event_at > ?").bind(row.email, now_ - year).first<{ c: number }>();
  return {
    email: row.email,
    plan,
    status: row.status,
    quota_monthly: quota,
    requests_used: used,
    requests_remaining: Math.max(0, quota - used),
    resets_at: resetAt,
    usage_30d: user30d?.c || 0,
    usage_year: userYear?.c || 0,
  };
}

async function handleAdminStats(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const masterPasskey = env.MASTER_PASSKEY;
  const passkey = body.passkey || url.searchParams.get("passkey") || "";
  if (!masterPasskey || passkey !== masterPasskey) {
    await logCrmAction(env, "unknown", "admin_stats_fail", "failed admin stats attempt", request).run().catch(() => {});
    return { error: "unauthorized" };
  }
  await logCrmAction(env, "admin", "admin_stats_success", "viewed admin stats", request).run().catch(() => {});
  const now_ = now();
  const day = 86400 * 1000;
  const month = 30 * day;
  const year = 365 * day;
  const allTime = await env.DB.prepare("SELECT COUNT(*) as c FROM usage_events").bind().first<{ c: number }>();
  const last30d = await env.DB.prepare("SELECT COUNT(*) as c FROM usage_events WHERE event_at > ?").bind(now_ - month).first<{ c: number }>();
  const lastYear = await env.DB.prepare("SELECT COUNT(*) as c FROM usage_events WHERE event_at > ?").bind(now_ - year).first<{ c: number }>();
  const topTokens = await env.DB.prepare("SELECT email, COUNT(*) as c FROM usage_events GROUP BY email ORDER BY c DESC LIMIT 10").bind().all<{ email: string; c: number }>();
  const recentlyActive = await env.DB.prepare("SELECT DISTINCT email FROM usage_events WHERE event_at > ? ORDER BY event_at DESC LIMIT 10").bind(now_ - 7 * day).all<{ email: string }>();
  const loginFails = await env.DB.prepare("SELECT COUNT(*) as c FROM crm_logs WHERE action LIKE '%fail%' AND created_at > ?").bind(now_ - month).first<{ c: number }>();
  const freeCount = await env.DB.prepare("SELECT COUNT(*) as c FROM tokens WHERE plan = 'free' AND status = 'active'").bind().first<{ c: number }>();
  const medianCount = await env.DB.prepare("SELECT COUNT(*) as c FROM tokens WHERE plan = 'median' AND status = 'active'").bind().first<{ c: number }>();
  const proCount = await env.DB.prepare("SELECT COUNT(*) as c FROM tokens WHERE plan = 'pro' AND status = 'active'").bind().first<{ c: number }>();
  const entCount = await env.DB.prepare("SELECT COUNT(*) as c FROM tokens WHERE plan = 'enterprise' AND status = 'active'").bind().first<{ c: number }>();
  return {
    all_time: allTime?.c || 0,
    last_30_days: last30d?.c || 0,
    last_year: lastYear?.c || 0,
    top_tokens: topTokens?.results || [],
    recently_active: recentlyActive?.results ? [...new Set(recentlyActive.results.map(r => r.email))] : [],
    failed_logins_30d: loginFails?.c || 0,
    users_by_plan: { free: freeCount?.c || 0, median: medianCount?.c || 0, pro: proCount?.c || 0, enterprise: entCount?.c || 0 },
  };
}

async function handleEnterpriseInquiry(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  const { name, email, company, message } = body;
  if (!name || !email || !message) return { error: "name, email and message are required" };
  try {
    await env.DB.prepare("INSERT INTO crm_logs (email, action, detail, device, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(email, "enterprise_inquiry", `Name: ${name}, Company: ${company || "N/A"}, Message: ${message?.substring(0, 500)}`, `web-form`, now()).run();
    return { ok: true };
  } catch (e) {
    return { error: "failed to save inquiry" };
  }
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey;
  const q = new URL(request.url).searchParams.get("token");
  if (q) return q;
  return null;
}

async function checkAndTrackUsage(env: Env, request: Request): Promise<{ allowed: boolean; reason?: string }> {
  const token = extractToken(request);
  if (!token) return { allowed: true };
  const row = await env.DB.prepare("SELECT id, status, plan, quota_monthly, requests_used, requests_reset_at, email FROM tokens WHERE token = ?").bind(token).first<{ id: string; status: string; plan: string; quota_monthly: number; requests_used: number; requests_reset_at: number | null; email: string }>();
  if (!row || row.status !== "active") return { allowed: false, reason: "token invalid or disabled" };
  const now_ = now();
  let used = row.requests_used || 0;
  let resetAt = row.requests_reset_at;
  if (!resetAt || now_ > resetAt) {
    used = 0;
    resetAt = now_ + 30 * 86400 * 1000;
  }
  const maxQuota = row.quota_monthly || planQuota(row.plan);
  if (used >= maxQuota) return { allowed: false, reason: "monthly quota exceeded" };
  const path = new URL(request.url).pathname;
  const context = classifyPath(path);
  await Promise.all([
    env.DB.prepare("UPDATE tokens SET requests_used = requests_used + 1, requests_reset_at = ?, has_connected = 1, updated_at = ? WHERE id = ?").bind(resetAt, now_, row.id).run(),
    env.DB.prepare("INSERT INTO usage_events (token, email, path, event_at) VALUES (?, ?, ?, ?)").bind(token, row.email || "", context, now_).run(),
  ]);
  return { allowed: true };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Blocked countries (no diplomatic ties with Malaysia / security risk)
    const country = (request as any).cf?.country || request.headers.get("CF-IPCountry") || "";
    const BLOCKED_COUNTRIES = ["IL", "KP", "KR"];
    if (country && BLOCKED_COUNTRIES.includes(country)) {
      return json({ error: "access denied from your region" }, { status: 403, headers: CORS });
    }

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/health") {
      return json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        jev_mode: resolveMode(env),
        default_scope: env.DEFAULT_SCOPE || "default",
        dataset: env.HF_TOKEN ? (env.HF_DATASET || "ctaxnagomi/DGUI_HYPERMEM-JEV") : null,
        endpoints: {
          mcp: "/mcp",
          rest: ["/api/add", "/api/search", "/api/list", "/api/profile", "/api/forget", "/api/sync_jev", "/api/jev_queue_stats", "/api/request-token", "/api/check-star", "/api/disable-token", "/api/check-quota", "/api/enterprise-inquiry", "/api/create-checkout-session", "/api/stripe-webhook", "/api/admin/tokens", "/api/admin/stats", "/api/admin/logs", "/api/admin/toggle-train"],
        },
      });
    }

    if (path === "/") {
      return new Response(LANDING_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/admin") {
      return new Response(ADMIN_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/privacy" || path === "/privacy.html" || path === "/legal") {
      return new Response(PRIVACY_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/how-to" || path === "/howto") {
      return new Response(HOWTO_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/terms" || path === "/terms-of-service") {
      return new Response(TERMS_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/return-policy" || path === "/refund") {
      return new Response(RETURN_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/legal" || path === "/legal-policies") {
      return new Response(LEGAL_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path.startsWith("/pay") || path === "/payment" || path === "/upgrade") {
      return new Response(PAYMENT_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    const CRM_ROUTES = ["/api/request-token", "/api/check-star", "/api/disable-token", "/api/enterprise-inquiry", "/api/create-checkout-session", "/api/stripe-webhook", "/api/admin/tokens", "/api/admin/stats", "/api/admin/logs", "/api/admin/toggle-train", "/api/check-quota"];
    if (path === "/mcp" || (path.startsWith("/api/") && !CRM_ROUTES.includes(path))) {
      if (!(await authorized(request, env))) {
        return json({ error: "unauthorized" }, { status: 401, headers: CORS });
      }
      const quota = await checkAndTrackUsage(env, request);
      if (!quota.allowed) {
        return json({ error: quota.reason }, { status: 429, headers: CORS });
      }
    }

    if (path === "/mcp") return handleMcp(request, env);
    if (path.startsWith("/api/")) return handleRest(request, env, path);

    return json({ error: "not found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      flushJevExamples(env, 200)
        .then((r) => console.log("jev sync:", JSON.stringify(r)))
        .catch((err) => console.error("jev sync failed:", String(err))),
    );
  },
};
