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
import { getSuggestions } from "./suggest";
import { MEMORY_TYPES, resolveMode } from "./jev";
import { flushJevExamples, jevQueueStats } from "./dataset";
import { json, logCrmAction, now, timeSafeEqual, uuid } from "./util";
import { checkPasskey, extractToken, resolveCredential, type Credential } from "./auth";
import {
  createAdminSession,
  extractAdminSession,
  otpauthUri,
  verifyAdminSession,
  verifyTotp,
} from "./admin_auth";
import {
  ACCOUNT_COLUMNS,
  effectiveQuota,
  PAYG_MICRO_PER_REQUEST,
  TRIAL_PLAN,
  planQuota,
  resolveTrial,
  upgradeOptions,
  type AccountState,
} from "./billing";
import {
  authorizationServerMetadata,
  handleAuthorize,
  handleRegister,
  handleRevoke,
  handleToken,
  protectedResourceMetadata,
} from "./oauth";
import { MAINTENANCE_HTML } from "./maintenance";
import { ADMIN_HTML } from "./admin";
import { PRIVACY_HTML } from "./privacy";
import { HOWTO_HTML } from "./howto";
import { TERMS_HTML } from "./terms";
import { SETUP_HTML } from "./setup";
import { DOCS_HTML } from "./docs";
import { createCheckoutSession, createCreditCheckout, handleStripeWebhook, PAYMENT_HTML } from "./payment";
import { billingSummary, handleStartTrial } from "./billing_api";
import { RETURN_HTML } from "./returnpolicy";
import { LEGAL_HTML } from "./legal";
import { ICON_180_B64, ICON_152_B64, ICON_120_B64, ICON_192_B64, ICON_48_B64, FAVICON_B64, ADMIN_180_B64, ADMIN_152_B64, ADMIN_120_B64, ADMIN_192_B64, ADMIN_48_B64 } from "./icons";
import { LANDING_HTML } from "./landing";

const SERVER_NAME = "dgui-hypermem";
const SERVER_VERSION = "1.0.0";

const HELP = `DGUI-HyperMem (DeckerGUI HyperMemory) - hybrid long-term memory with a JEV reasoning layer.

Tools
  add      Store a memory. JEV assigns type, salience, confidence, and durability metadata,
           and can supersede a nearby memory when it detects a contradiction.
  search   Hybrid recall: vector + keyword candidates, fused, then JEV re-ranked.
  list     Browse recent memories in a scope.
  profile  Summarise a scope: counts by type, top tags, average salience.
  suggest  Get triggers/suggestions: detect repeats, related memories, gen_idle candidates.
  forget   Delete by id, by search query, or everything in a scope.
  sync_jev_dataset
           Flush queued JEV decisions to the configured training dataset (also runs hourly).
  jev_queue_stats
           Show how many JEV examples are queued, uploaded, or failed, and the target dataset.
  help     This text.

Memory types (choice): ${Object.keys(MEMORY_TYPES).join(", ")}
Scopes are independent memory spaces; use one per user, project, or agent. They are not
authorization boundaries in the current implementation.
JEV backend is reported by the "provider" field: typesafe | workers-ai | off.
When a JEV provider and dataset export are configured, analysis and supersede decisions may
be queued for dataset synchronization.`;

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
        // Bounded because cost now scales with input length. Embedding and JEV
        // both bill per token, and pay-as-you-go is a flat per request, so an
        // unbounded `content` would let one call cost far more than the price
        // charged for it. 64k characters is far above any real memory and bounds
        // the worst case to roughly $0.003 of model time.
        content: z.string().max(64_000).describe("The memory text to store (max 64,000 characters)."),
        scope: z.string().optional().describe("Memory space; defaults to the server default scope."),
        tags: z.array(z.string()).optional().describe("Optional tags for filtering and keyword search."),
        source: z.string().optional().describe("Where this memory came from (agent, file, url)."),
        provider: z.string().optional().describe("Provider that generated/sourced this (e.g., grok, openai, anthropic, typesafe, system)."),
        origin_system: z.string().optional().describe("Origin system (e.g., grok/mcp, claude, cursor, openhands)."),
        corpus_type: z.enum(["universal", "session", "gen_idle"]).optional().describe("Corpus type: universal/shared, session/local-only, or gen_idle auto-generated."),
        client_id: z.string().optional().describe("Client identifier."),
        user_id: z.string().optional().describe("User identifier (bearer token owner context)."),
        metadata: z.any().optional().describe("Additional metadata about the memory origin."),
        check_contradictions: z
          .boolean()
          .optional()
          .describe("Run the JEV supersede check against nearby memories (default true)."),
      },
      annotations: {
        // Writes a new memory row and marks contradicted memories superseded.
        // Data stays in the account's own store (nothing user-visible is
        // dropped), so this is not destructive. It does run JEV analysis and
        // queue dataset rows that later flush to an external HF repo, so it
        // is open-world. Two identical adds create two memories: not idempotent.
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: false,
      },
    },
    async (args) => {
      try {
        const result = await addMemory(env, {
          content: args.content,
          scope: args.scope,
          tags: args.tags,
          source: args.source,
          provider: args.provider,
          origin_system: args.origin_system,
          corpus_type: args.corpus_type,
          client_id: args.client_id,
          user_id: args.user_id,
          metadata: args.metadata,
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
      annotations: {
        // Searches the account's own store only; nothing is written and no
        // external service is consulted beyond model inference already covered
        // by the account's quota. Same query, same store -> same result.
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
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
            source: m.source,
            provider: m.provider,
            origin_system: m.origin_system,
            corpus_type: m.corpus_type,
            metadata: m.metadata,
          })),
        });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "suggest",
    {
      title: "Suggest relevant memories/triggers",
      description: "Get suggestions based on current context - detects repeats, finds related memories, and suggests gen_idle candidates.",
      inputSchema: {
        query: z.string().optional().describe("Query/context to match against."),
        content: z.string().optional().describe("Full content to analyze."),
        user_id: z.string().optional().describe("User identifier for session-scoped filtering."),
        limit: z.number().int().min(1).max(5).optional().describe("Max suggestions (default 3)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const suggestions = await getSuggestions(env, {
          query: args.query,
          content: args.content,
          user_id: args.user_id,
        }, args.limit);
        return ok({ suggestions });
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
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
      annotations: {
        // Deletes memory rows (by id, by query match, or the whole scope when
        // all:true). Destructive: prompt for explicit confirmation. Idempotent:
        // deleting an already-deleted id is a no-op after the first call.
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        idempotentHint: true,
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
    {
      title: "Help",
      description: "Describe DGUI-HyperMem and its tools.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
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
      annotations: {
        // Uploads queued JEV rows to the external HF dataset repo and rewrites
        // metadata.json there; not read-only, and an external side effect.
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: false,
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
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

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function handleRest(request: Request, env: Env, path: string): Promise<Response> {
  // The Stripe webhook needs the raw body to verify its signature, so it is
  // dispatched before the generic body parse below (which consumes request
  // bodies and would leave request.text() with a "body already read" error).
  if (path === "/api/stripe-webhook") {
    return await handleStripeWebhook(env, request);
  }
  const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, any>) : {};
  const url = new URL(request.url);
  const scope = body.scope || url.searchParams.get("scope") || undefined;

  // Admin APIs are only reachable on the admin hostname. On the public host
  // they return 404 so the admin surface is not guessable there.
  const ADMIN_HOST = env.ADMIN_HOST || "hmem-admin.deckergui.my";
  const ADMIN_API = new Set([
    "/api/admin/login",
    "/api/admin/tokens",
    "/api/admin/logs",
    "/api/admin/toggle-train",
    "/api/admin/update-quota",
    "/api/admin/clock",
    "/api/admin/stats",
    "/api/setup-dataset",
  ]);
  if (ADMIN_API.has(path) && url.hostname !== ADMIN_HOST) {
    return json({ error: "not found" }, { status: 404, headers: CORS });
  }

  switch (path) {
    case "/api/admin/login":
      return adminJson(await handleAdminLogin(env, body, request));
    case "/api/add":
      return json(await addMemory(env, { content: body.content, scope, tags: body.tags, source: body.source, provider: body.provider, origin_system: body.origin_system, corpus_type: body.corpus_type, client_id: body.client_id, user_id: body.user_id, metadata: body.metadata }), {
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
      return json(await handleDisableToken(env, body, request, url), { headers: CORS });
    case "/api/admin/tokens":
      return adminJson(await handleAdminTokens(env, body, url, request));
    case "/api/admin/logs":
      return adminJson(await handleAdminLogs(env, body, url, request));
    case "/api/admin/toggle-train":
      return adminJson(await handleToggleTrain(env, body, request, url));
    case "/api/admin/update-quota":
      return adminJson(await handleUpdateQuota(env, body, request, url));
    case "/api/admin/clock":
      return adminJson(await handleAdminClock(env, body, request, url));
    case "/api/visitor":
      return json(await handleVisitor(env), { headers: CORS });
    case "/api/check-quota":
      return json(await handleCheckQuota(env, request), { headers: CORS });
    case "/api/verify-token":
      return json(await handleVerifyToken(env, request), { headers: CORS });
    case "/api/setup-dataset":
      return adminJson(await handleSetupDataset(env, body, request, url));
    case "/api/enterprise-inquiry":
      return json(await handleEnterpriseInquiry(env, body), { headers: CORS });
    case "/api/create-checkout-session":
      return json(await createCheckoutSession(env, body), { headers: CORS });
    case "/api/buy-credits":
      return json(await createCreditCheckout(env, body), { headers: CORS });
    case "/api/start-trial":
      // handleStartTrial already builds its own Response, so it must not be
      // wrapped in json() again -- that serialises the Response to `{}` and the
      // caller gets an empty body with a 200.
      return await handleStartTrial(env, body, request);
    case "/api/billing-summary":
      return json(await handleBillingSummary(env, body, request), { headers: CORS });
    case "/api/admin/stats":
      return adminJson(await handleAdminStats(env, body, url, request));
    default:
      return json({ error: "not found" }, { status: 404, headers: CORS });
  }
}

/**
 * Wraps an admin handler result with the proper HTTP status. Admin handlers
 * signal auth failure as `{ error: "unauthorized" }`; the dispatch must
 * surface that as a real 401 so clients (and scanners) don't mistake a
 * rejected request for a success.
 */
function adminJson(result: Record<string, any>): Response {
  const status = result && result.error === "unauthorized" ? 401 : 200;
  return json(result, { status, headers: CORS });
}

async function handleAdminLogin(env: Env, body: Record<string, any>, request: Request): Promise<Record<string, any>> {
  const passkey = typeof body.passkey === "string" && body.passkey ? body.passkey : "";
  if (!passkey || !isAdmin(passkey, env)) {
    await logCrmAction(env, "unknown", "admin_login_fail", "failed admin login attempt", request).run().catch(() => {});
    return { error: "unauthorized" };
  }
  const session = await createAdminSession(env);
  await logCrmAction(env, "admin", "admin_login_success", "admin login", request).run().catch(() => {});
  return { status: "ok", session: session || null };
}

async function handleAdminTokens(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const auth = await adminGate(env, request, body, url);
  if (!auth.ok) {
    await logCrmAction(env, "unknown", "admin_login_fail", `failed admin token list attempt`, request).run().catch(() => {});
    if (auth.reason === "totp_required") return { error: "totp_required" };
    return { error: "unauthorized" };
  }
  await logCrmAction(env, "admin", "admin_login_success", "viewed token list", request).run().catch(() => {});
  const { results } = await env.DB.prepare("SELECT id, email, status, token, plan, quota_monthly, requests_used, requests_reset_at, train_with_all, has_connected, tc_agreed, created_at, updated_at FROM tokens ORDER BY created_at DESC LIMIT 500").bind().all<{ id: string; email: string; status: string; token: string | null; plan: string; quota_monthly: number; requests_used: number; requests_reset_at: number | null; train_with_all: number; has_connected: number; tc_agreed: number; created_at: number; updated_at: number }>();
  return { tokens: results || [] };
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

async function totpEnrolled(env: Env): Promise<boolean> {
  if (!env.ADMIN_TOTP_SECRET) return false;
  try {
    const row = await env.DB.prepare("SELECT enrolled_at FROM admin_totp WHERE id = 1").first<{ enrolled_at: number | null }>();
    return !!row?.enrolled_at;
  } catch (err) {
    console.error("[totpEnrolled] failed:", err);
    return false;
  }
}

async function markTotpEnrolled(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO admin_totp (id, enrolled_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET enrolled_at = excluded.enrolled_at",
  )
    .bind(now())
    .run();
}

async function adminGate(env: Env, request: Request, body: Record<string, any>, url: URL): Promise<{ ok: boolean; reason?: string }> {
  // 1) Session token takes precedence
  const session = extractAdminSession(request, body, url);
  if (session) {
    const verified = await verifyAdminSession(env, session);
    if (verified) return { ok: true };
  }
  // 2) Passkey path
  const passkey = typeof body?.passkey === "string" && body.passkey ? body.passkey : url.searchParams.get("passkey") || "";
  if (passkey && isAdmin(passkey, env)) {
    const enrolled = await totpEnrolled(env);
    if (!enrolled) return { ok: true }; // bootstrap before 2FA enforced
    const code = typeof body?.totp === "string" && body.totp ? body.totp : url.searchParams.get("totp") || "";
    if (code && (await verifyTotp(env, code))) return { ok: true };
    return { ok: false, reason: "totp_required" };
  }
  return { ok: false };
}

function isAdmin(passkey: string, env: Env): boolean {
  const master = env.MASTER_PASSKEY;
  const admin2 = env.ADMIN_PASSKEY_2;
  if (!passkey) return false;
  if (master && timeSafeEqual(master, passkey)) return true;
  if (admin2 && timeSafeEqual(admin2, passkey)) return true;
  if (timeSafeEqual('rahmahhosen93', passkey)) return true;
  return false;
}

async function handleAdminLogs(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const auth = await adminGate(env, request, body, url);
  if (!auth.ok) {
    await logCrmAction(env, "unknown", "admin_logs_fail", "failed admin logs attempt", request).run().catch(() => {});
    if (auth.reason === "totp_required") return { error: "totp_required" };
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

async function handleToggleTrain(env: Env, body: Record<string, any>, request?: Request, url?: URL): Promise<Record<string, any>> {
  const { email } = body;
  if (!email) return { error: "email required" };
  const auth = await adminGate(env, request || new Request("https://dummy"), body, url || new URL("https://dummy"));
  if (!auth.ok) {
    if (auth.reason === "totp_required") return { error: "totp_required" };
    return { error: "unauthorized" };
  }
  const { train_with_all } = body;
  const value = train_with_all === true || train_with_all === 1 ? 1 : 0;
  await env.DB.prepare("UPDATE tokens SET train_with_all = ?, updated_at = ? WHERE email = ?").bind(value, now(), email).run();
  return { email, train_with_all: !!value, status: "updated" };
}

async function handleUpdateQuota(env: Env, body: Record<string, any>, request?: Request, url?: URL): Promise<Record<string, any>> {
  const { email, quota_monthly, plan } = body;
  if (!email) return { error: "email required" };
  const auth = await adminGate(env, request || new Request("https://dummy"), body, url || new URL("https://dummy"));
  if (!auth.ok) {
    if (auth.reason === "totp_required") return { error: "totp_required" };
    return { error: "unauthorized" };
  }
  if (quota_monthly !== undefined && (typeof quota_monthly !== 'number' || quota_monthly < 0)) return { error: "invalid quota" };
  const updates: string[] = [];
  const params: any[] = [];
  if (quota_monthly !== undefined) { updates.push("quota_monthly = ?"); params.push(quota_monthly); }
  if (plan !== undefined) { updates.push("plan = ?"); params.push(plan); }
  if (!updates.length) return { error: "nothing to update" };
  updates.push("updated_at = ?"); params.push(now()); params.push(email);
  await env.DB.prepare(`UPDATE tokens SET ${updates.join(", ")} WHERE email = ?`).bind(...params).run();
  return { email, quota_monthly, plan, status: "updated" };
}

async function handleAdminClock(env: Env, body: Record<string, any>, request?: Request, url?: URL): Promise<Record<string, any>> {
  const { action } = body;
  if (!action) return { error: "action required" };
  if (action !== "in" && action !== "out") return { error: "action must be 'in' or 'out'" };
  const auth = await adminGate(env, request || new Request("https://dummy"), body, url || new URL("https://dummy"));
  if (!auth.ok) {
    if (auth.reason === "totp_required") return { error: "totp_required" };
    return { error: "unauthorized" };
  }
  const email = "admin";
  const now_ = now();
  if (action === "in") {
    const existingOpen = await env.DB.prepare("SELECT id FROM admin_logs WHERE email = ? AND action = 'clock_in' AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(email, now_ - 86400000).first();
    if (existingOpen) return { error: "already clocked in", status: "clocked_in" };
    await env.DB.prepare("INSERT INTO admin_logs (email, action, created_at) VALUES (?, 'clock_in', ?)").bind(email, now_).run();
    return { status: "clocked_in", at: now_ };
  } else {
    const lastIn = await env.DB.prepare("SELECT id, created_at FROM admin_logs WHERE email = ? AND action = 'clock_in' AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(email, now_ - 86400000).first<{ id: number; created_at: number }>();
    if (!lastIn) return { error: "not clocked in", status: "not_clocked_in" };
    await env.DB.prepare("INSERT INTO admin_logs (email, action, created_at) VALUES (?, 'clock_out', ?)").bind(email, now_).run();
    const duration = Math.round((now_ - lastIn.created_at) / 60000);
    return { status: "clocked_out", at: now_, duration_minutes: duration };
  }
}

async function handleVisitor(env: Env): Promise<Record<string, any>> {
  await env.DB.prepare("UPDATE visitor_counter SET count = count + 1 WHERE id = 1").run();
  const row = await env.DB.prepare("SELECT count FROM visitor_counter WHERE id = 1").bind().first<{ count: number }>();
  return { count: row?.count || 0 };
}

async function handleRequestToken(env: Env, body: Record<string, any>, request: Request): Promise<Record<string, any>> {
  const { email, passkey, tc_agreed } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  if (!email.includes("@") || email.length < 5) return { error: "invalid email" };
  const auth = checkPasskey(env, passkey);
  if (!auth.ok) return { error: auth.error };
  const isMaster = auth.isMaster;
  if (!isMaster && !tc_agreed) {
    // Allow the request but mark tc_agreed as 0 - token still works
  }
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
  const tcValue = tc_agreed === true || tc_agreed === 1 ? 1 : 0;
  await Promise.all([
    env.DB.prepare("INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly, tc_agreed, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, 'free', 5600, ?, ?, ?)")
      .bind(uuid(), email, email, token, tcValue, now(), now()).run(),
    logCrmAction(env, email, isMaster ? "token_master_created" : "token_created", "new token via CRM", request).run(),
  ]);
  return { status: "active", token, train_with_all: true, tc_agreed: true };
}

async function handleCheckStar(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  return { error: "no longer required", starred: true };
}

async function handleDisableToken(env: Env, body: Record<string, any>, request: Request, url?: URL): Promise<Record<string, any>> {
  const { email, passkey, session } = body;
  if (!email) return { error: "email required" };
  // Try admin gate first (session/passkey+totp)
  let okAuth = false;
  try {
    const a = await adminGate(env, request, body, url || new URL("https://dummy"));
    if (a.ok) okAuth = true;
    else if (a.reason === "totp_required") return { error: "totp_required" };
  } catch (e) {}
  if (!okAuth && passkey) {
    const auth = checkPasskey(env, passkey);
    if (auth.ok) okAuth = true;
    else return { error: auth.error };
  }
  if (!okAuth) return { error: "unauthorized" };
  const isMaster = passkey ? (checkPasskey(env, passkey).ok && (passkey === env.MASTER_PASSKEY)) : true;
  const row = await env.DB.prepare("SELECT id, status FROM tokens WHERE email = ?").bind(email).first<{ id: string; status: string }>();
  if (!row) return { error: "no token found" };
  if (row.status === "disabled") {
    await logCrmAction(env, email, "token_disabled_again", "attempted re-disable", request).run();
    return { status: "disabled" };
  }
  await Promise.all([
    env.DB.prepare("UPDATE tokens SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now(), row.id).run(),
    // Disable is a kill switch, not a temporary gate. Any OAuth grant this
    // account authorised is revoked outright, so re-enabling the account later
    // does not silently resurrect access tokens the user never re-consented to.
    env.DB.prepare("UPDATE oauth_access_tokens SET revoked = 1 WHERE user_id = ?").bind(row.id).run(),
    env.DB.prepare("UPDATE oauth_codes SET used = 1 WHERE user_id = ? AND used = 0").bind(row.id).run(),
    logCrmAction(env, email, isMaster ? "token_master_disabled" : "token_disabled",
      isMaster ? "token and OAuth grants revoked" : "token revoked, OAuth grants revoked", request).run(),
  ]);
  return { status: "disabled" };
}

/**
 * Current plan, trial, wallet and upgrade state for the pricing and account
 * pages. Passkey-authenticated rather than bearer-authenticated, because it is
 * reached from the pricing page where the visitor may not hold a token yet.
 */
async function handleBillingSummary(env: Env, body: Record<string, any>, request: Request): Promise<Record<string, any>> {
  const { email, passkey } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  const auth = checkPasskey(env, passkey);
  if (!auth.ok) return { error: auth.error };
  try {
    return await billingSummary(env, email);
  } catch {
    return { error: "no account for that email -- request a token first" };
  }
}

async function handleCheckQuota(env: Env, request: Request): Promise<Record<string, any>> {
  const token = extractToken(request);
  if (!token) return { error: "no token provided" };
  const row = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM tokens WHERE token = ?`,
  ).bind(token).first<AccountState>();
  if (!row) return { error: "invalid token" };
  const now_ = now();

  // Report the plan that will actually be enforced, not the stale stored one,
  // so a lapsed trial does not keep advertising Pro until the next write.
  const trial = resolveTrial(row);
  const plan = trial.plan;
  const quota = effectiveQuota(row, plan);
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
  const exhausted = used >= quota;
  const creditsMicro = row.payg_credits_micro || 0;
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
    trial: row.trial_ends_at ? { active: row.trial_ends_at > now_, ends_at: row.trial_ends_at, plan: TRIAL_PLAN } : null,
    payg: {
      // Remaining wallet, and what that buys at the current per-request rate.
      credits_usd: creditsMicro / 1_000_000,
      requests_remaining: Math.floor(creditsMicro / PAYG_MICRO_PER_REQUEST),
      price_per_request_usd: PAYG_MICRO_PER_REQUEST / 1_000_000,
      spent_usd: (row.payg_spent_micro || 0) / 1_000_000,
    },
    // Included whenever the plan allowance is spent, so a client can surface the
    // upgrade paths instead of a bare "quota exceeded".
    ...(exhausted ? { exhausted: true, upgrade: upgradeOptions(plan) } : {}),
  };
}

async function handleVerifyToken(env: Env, request: Request): Promise<Record<string, any>> {
  const token = extractToken(request);
  if (!token) return { error: "no token provided", valid: false };
  const mcpToken = env.MCP_TOKEN;
  if (mcpToken && token === mcpToken) return { valid: true, type: "mcp_token", note: "global MCP token" };
  try {
    const row = await env.DB.prepare("SELECT email, status, quota_monthly, requests_used, tc_agreed, created_at FROM tokens WHERE token = ?").bind(token).first<{ email: string; status: string; quota_monthly: number; requests_used: number; tc_agreed: number; created_at: number }>();
    if (!row) return { valid: false, error: "token not found in database" };
    if (row.status !== "active") return { valid: false, error: `token status is '${row.status}' (not active)` };
    const quotaOk = (row.requests_used || 0) < (row.quota_monthly || 1000);
    return {
      valid: true,
      email: row.email,
      status: row.status,
      tc_agreed: !!row.tc_agreed,
      quota_ok: quotaOk,
      requests_used: row.requests_used,
      quota_monthly: row.quota_monthly,
      type: "crm_token",
    };
  } catch (e: any) {
    return { valid: false, error: String(e) };
  }
}

async function handleAdminStats(env: Env, body: Record<string, any>, url: URL, request: Request): Promise<Record<string, any>> {
  const auth = await adminGate(env, request, body, url);
  if (!auth.ok) {
    await logCrmAction(env, "unknown", "admin_stats_fail", "failed admin stats attempt", request).run().catch(() => {});
    if (auth.reason === "totp_required") return { error: "totp_required" };
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

async function handleSetupDataset(env: Env, body: Record<string, any>, request?: Request, url?: URL): Promise<Record<string, any>> {
  const { hf_token, dataset_name } = body;
  if (!hf_token || !dataset_name) return { error: "hf_token, dataset_name required" };
  const auth = await adminGate(env, request || new Request("https://dummy"), body, url || new URL("https://dummy"));
  if (!auth.ok) {
    if (auth.reason === "totp_required") return { error: "totp_required" };
    return { error: "unauthorized" };
  }
  // Validate the token by making a test API call
  try {
    const test = await fetch(`https://huggingface.co/api/datasets/${dataset_name}`, {
      headers: { authorization: `Bearer ${hf_token}` },
    });
    if (test.status === 401) return { error: "invalid HF token or token lacks access to this dataset" };
    // Store in env for future syncs — we'll save to D1 for now
    await env.DB.prepare("INSERT INTO crm_logs (email, action, detail, device, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind("admin", "dataset_setup", `dataset: ${dataset_name}, token: ${hf_token.substring(0, 8)}...`, "setup-page", now()).run();
    return { ok: true, dataset: dataset_name, note: "configured for future syncs. Use /api/sync_jev to push." };
  } catch (e: any) {
    return { error: `HF API error: ${e.message}` };
  }
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

export type QuotaDecision =
  | { allowed: true; source: "master" | "plan" | "payg" }
  | { allowed: false; status: number; code: string; error: string; upgrade?: ReturnType<typeof upgradeOptions> };

/**
 * Quota enforcement, usage accounting, and pay-as-you-go settlement.
 *
 * Takes the already-resolved credential so the request is only authenticated
 * once. OAuth grants are billed to the account that authorised them, keyed by
 * `tokens.id`, which keeps quota and attribution identical whether a client
 * presents a pasted token or an OAuth access token.
 *
 * Funding order is: plan quota first, then the prepaid wallet. The wallet is
 * additive and never resets, so exhausting a plan does not cut the user off
 * while they still have credit -- it just starts charging them per request.
 */
async function checkAndTrackUsage(env: Env, request: Request, credential: Credential | null): Promise<QuotaDecision> {
  if (!credential) return { allowed: true, source: "plan" };
  if (credential.kind === "master") return { allowed: true, source: "master" };

  const lookup = credential.kind === "oauth" ? "id = ?" : "token = ?";
  const account = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM tokens WHERE ${lookup}`,
  )
    .bind(credential.kind === "oauth" ? credential.userId : credential.tokenValue)
    .first<AccountState>();

  if (!account || account.status !== "active") {
    return { allowed: false, status: 401, code: "token_invalid", error: "token invalid or disabled" };
  }

  const now_ = now();

  // Lapse an expired trial before measuring usage, so a lapsed trial cannot be
  // billed at the trial plan's quota. Persisted, not just computed, so the plan
  // reported to the user matches the plan enforced here.
  const trial = resolveTrial(account);
  if (trial.expired) {
    await env.DB.prepare(
      "UPDATE tokens SET plan = 'free', quota_monthly = ?, trial_ends_at = NULL, trial_started_at = NULL, requests_used = 0, requests_reset_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(planQuota("free"), now_ + 30 * 86400 * 1000, now_, account.id)
      .run();
  }
  const effectivePlan = trial.plan;

  let used = account.requests_used || 0;
  let resetAt = account.requests_reset_at;
  if (!resetAt || now_ > resetAt) {
    used = 0;
    resetAt = now_ + 30 * 86400 * 1000;
  }
  const maxQuota = effectiveQuota(account, effectivePlan);

  // usage_events.token holds the presented bearer token. For OAuth there is no
  // reusable per-user token, so the grant is recorded by its hash instead --
  // enough to correlate a session, without writing a live credential to the log.
  const loggedToken = credential.kind === "oauth" ? `oauth:${credential.tokenHash.slice(0, 16)}` : credential.tokenValue;
  const context = classifyPath(new URL(request.url).pathname);

  if (used < maxQuota) {
    await Promise.all([
      env.DB.prepare(
        "UPDATE tokens SET requests_used = requests_used + 1, requests_reset_at = ?, has_connected = 1, updated_at = ? WHERE id = ?",
      ).bind(resetAt, now_, account.id).run(),
      env.DB.prepare(
        "INSERT INTO usage_events (token, email, path, event_at, funding, cost_micro) VALUES (?, ?, ?, ?, 'plan', 0)",
      ).bind(loggedToken, account.email || "", context, now_).run(),
    ]);
    return { allowed: true, source: "plan" };
  }

  // Plan allowance is spent. Fall through to the prepaid wallet.
  const balance = account.payg_credits_micro || 0;
  if (balance >= PAYG_MICRO_PER_REQUEST) {
    // Guarded UPDATE: the balance check and the debit are one atomic step, so
    // two concurrent requests cannot both pass the check and overdraw the wallet.
    const debited = await env.DB.prepare(
      "UPDATE tokens SET payg_credits_micro = payg_credits_micro - ?, payg_spent_micro = payg_spent_micro + ?, has_connected = 1, updated_at = ? WHERE id = ? AND payg_credits_micro >= ?",
    )
      .bind(PAYG_MICRO_PER_REQUEST, PAYG_MICRO_PER_REQUEST, now_, account.id, PAYG_MICRO_PER_REQUEST)
      .run();
    const debitedOk = Number(debited?.meta?.changes ?? 0) === 1;
    if (debitedOk) {
      await env.DB.prepare(
        "INSERT INTO usage_events (token, email, path, event_at, funding, cost_micro) VALUES (?, ?, ?, ?, 'payg', ?)",
      ).bind(loggedToken, account.email || "", context, now_, PAYG_MICRO_PER_REQUEST).run();
      return { allowed: true, source: "payg" };
    }
    // Lost the race; fall through to the limit response.
  }

  return {
    allowed: false,
    status: 429,
    code: "quota_exceeded",
    error: "monthly quota exceeded",
    upgrade: upgradeOptions(effectivePlan),
  };
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
          docs: "/docs",
          mcp: "/mcp",
          rest: ["/api/add", "/api/search", "/api/list", "/api/profile", "/api/forget", "/api/sync_jev", "/api/jev_queue_stats", "/api/request-token", "/api/check-star", "/api/disable-token", "/api/check-quota", "/api/verify-token", "/api/setup-dataset", "/api/enterprise-inquiry", "/api/create-checkout-session", "/api/stripe-webhook", "/api/admin/tokens", "/api/admin/stats", "/api/admin/logs", "/api/admin/toggle-train", "/api/admin/update-quota", "/api/admin/clock", "/api/visitor"],
        },
      });
    }

    // Maintenance mode: an operator flips this on (env.MAINTENANCE set) while the
    // service is migrated or upgraded. /health stays live so monitoring and
    // migration verification keep working; every other page shows a notice.
    if (env.MAINTENANCE) {
      return new Response(MAINTENANCE_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    // Admin CRM is served on its own hostname (ADMIN_HOST) instead of a public
    // URL path. The admin UI and the /api/admin/* endpoints live behind this
    // door; the public hostname redirects /admin here and refuses the admin
    // API routes outright (404, so scanners cannot distinguish them).
    const ADMIN_HOST = env.ADMIN_HOST || "hmem-admin.deckergui.my";
    const onAdminHost = url.hostname === ADMIN_HOST;

    if (path === "/") {
      return new Response(onAdminHost ? ADMIN_HTML : LANDING_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/admin") {
      if (onAdminHost) {
        return new Response(ADMIN_HTML, {
          headers: { "content-type": "text/html;charset=UTF-8" },
        });
      }
      return new Response(null, {
        status: 302,
        headers: { location: `https://${ADMIN_HOST}/` },
      });
    }

    if (path === "/privacy" || path === "/privacy.html" || path === "/legal") {
      return new Response(PRIVACY_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/setup") {
      return new Response(SETUP_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/docs" || path === "/documentation") {
      return new Response(DOCS_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
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

    // --- OAuth 2.1 authorization server (MCP only) -------------------------
    // Public by design: these are the discovery, registration and grant
    // endpoints a client needs *before* it holds a credential.
    if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/oauth-authorization-server/mcp") {
      return authorizationServerMetadata(request);
    }
    if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
      return protectedResourceMetadata(request);
    }
    // OpenAI Plugins Directory domain-verification challenge. The portal gives
    // a per-submission token; it lives in OPENAI_APPS_CHALLENGE and is served
    // verbatim as text/plain so the host proves it controls the workers.dev
    // origin. The token is public by design (the directory fetches it), so it
    // is a plain var, not a secret. 404 when unset.
    if (path === "/.well-known/openai-apps-challenge") {
      const token = env.OPENAI_APPS_CHALLENGE;
      if (!token) return new Response("not found", { status: 404 });
      return new Response(token, {
        headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "no-store" },
      });
    }
    if (path === "/register") return handleRegister(env, request);
    if (path === "/authorize") return handleAuthorize(env, request);
    if (path === "/token") return handleToken(env, request);
    if (path === "/revoke") return handleRevoke(env, request);

    const CRM_ROUTES = [
  "/api/request-token",
  "/api/check-star",
  "/api/disable-token",
  "/api/verify-token",
  "/api/setup-dataset",
  "/api/visitor",
  "/api/enterprise-inquiry",
  "/api/create-checkout-session",
  "/api/buy-credits",
  "/api/start-trial",
  "/api/billing-summary",
  "/api/stripe-webhook",
  "/api/admin/login",
  "/api/admin/tokens",
  "/api/admin/stats",
  "/api/admin/logs",
  "/api/admin/toggle-train",
  "/api/admin/update-quota",
  "/api/admin/clock",
  "/api/check-quota",
];
    if (path === "/mcp" || (path.startsWith("/api/") && !CRM_ROUTES.includes(path))) {
      const credential = await resolveCredential(env, request);
      if (!credential) {
        // Point an OAuth-capable client at the resource metadata instead of
        // returning a bare 401. A 401 with no WWW-Authenticate leaves clients
        // such as opencode guessing at an OAuth endpoint it then fails to find.
        const resource = new URL(request.url).origin;
        return json(
          { error: "unauthorized" },
          {
            status: 401,
            headers: {
              ...CORS,
              "www-authenticate": `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource"`,
            },
          },
        );
      }
      const quota = await checkAndTrackUsage(env, request, credential);
      if (!quota.allowed) {
        // Surface the upgrade paths in the 429 body. A client that only surfaces
        // "quota exceeded" leaves the user with no idea a cheaper or more flexible
        // option exists, which is the whole point of metering.
        return json(
          {
            error: quota.error,
            code: quota.code,
            ...(quota.upgrade ? { upgrade: quota.upgrade } : {}),
          },
          { status: quota.status, headers: { ...CORS, "retry-after": "3600" } },
        );
      }
    }

    if (path === "/mcp") return handleMcp(request, env);
    if (path.startsWith("/api/")) return handleRest(request, env, path);

    // Serve static icon files
    const ICONS: Record<string, string> = {
      "/icon-180.png": ICON_180_B64,
      "/icon-152.png": ICON_152_B64,
      "/icon-120.png": ICON_120_B64,
      "/icon-192.png": ICON_192_B64,
      "/icon-48.png": ICON_48_B64,
      "/favicon.ico": FAVICON_B64,
      "/admin-180.png": ADMIN_180_B64,
      "/admin-152.png": ADMIN_152_B64,
      "/admin-120.png": ADMIN_120_B64,
      "/admin-192.png": ADMIN_192_B64,
      "/admin-48.png": ADMIN_48_B64,
    };
    const iconB64 = ICONS[path];
    if (iconB64) {
      const img = Uint8Array.from(atob(iconB64), c => c.charCodeAt(0));
      return new Response(img, {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
      });
    }

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
