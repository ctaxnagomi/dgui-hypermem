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

function authorized(request: Request, env: Env): boolean {
  const expected = env.MCP_TOKEN;
  if (!expected) return true;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const apiKey = request.headers.get("x-api-key") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return timeSafeEqual(bearer, expected) || timeSafeEqual(apiKey, expected) || timeSafeEqual(queryToken, expected);
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
      return json(await handleRequestToken(env, body), { headers: CORS });
    case "/api/check-star":
      return json(await handleCheckStar(env, body), { headers: CORS });
    case "/api/disable-token":
      return json(await handleDisableToken(env, body), { headers: CORS });
    default:
      return json({ error: "not found" }, { status: 404, headers: CORS });
  }
}

async function handleRequestToken(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  const { email, github_username, passkey } = body;
  if (!email || !github_username || !passkey) return { error: "email, github_username and passkey are required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalid email" };
  const userPasskey = env.PASSKEY || "0866";
  const masterPasskey = env.MASTER_PASSKEY;
  const isMaster = masterPasskey && passkey === masterPasskey;
  if (passkey !== userPasskey && !isMaster) return { error: "invalid passkey" };
  const existing = await env.DB.prepare("SELECT id, status, token FROM tokens WHERE email = ?").bind(email).first<{ id: string; status: string; token: string | null }>();
  if (existing) return { id: existing.id, status: existing.status, has_token: !!existing.token };
  const id = uuid();
  const status = isMaster ? "active" : "pending";
  const token = isMaster ? uuid() : null;
  await env.DB.prepare("INSERT INTO tokens (id, email, github_username, status, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, github_username, status, token, now(), now()).run();
  if (isMaster) return { status: "active", token, master: true };
  return { status: "pending", id };
}

async function handleCheckStar(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  const { email } = body;
  if (!email) return { error: "email is required" };
  const row = await env.DB.prepare("SELECT id, github_username, status, token FROM tokens WHERE email = ?").bind(email).first<{ id: string; github_username: string; status: string; token: string | null }>();
  if (!row) return { error: "no pending request found" };
  if (row.status === "active" && row.token) return { starred: true, token: row.token };
  if (row.status !== "pending") return { error: `request is ${row.status}` };
  try {
    const headers: Record<string, string> = { "user-agent": "dgui-hypermem", accept: "application/vnd.github+json" };
    if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/ctaxnagomi/dgui-hypermem/stargazers?per_page=100`, { headers });
    if (!res.ok) return { error: `github api: ${res.status}`, starred: false };
    const stargazers = await res.json() as { login: string }[];
    const starred = stargazers.some((u: any) => u.login === row.github_username);
    if (!starred) return { starred: false, url: "https://github.com/ctaxnagomi/dgui-hypermem" };
    const token = uuid();
    await env.DB.prepare("UPDATE tokens SET status = 'active', token = ?, updated_at = ? WHERE id = ?").bind(token, now(), row.id).run();
    return { starred: true, token };
  } catch (err) {
    return { error: String(err), starred: false };
  }
}

async function handleDisableToken(env: Env, body: Record<string, any>): Promise<Record<string, any>> {
  const { email, passkey } = body;
  if (!email || !passkey) return { error: "email and passkey are required" };
  const userPasskey = env.PASSKEY || "0866";
  const masterPasskey = env.MASTER_PASSKEY;
  const isMaster = masterPasskey && passkey === masterPasskey;
  if (passkey !== userPasskey && !isMaster) return { error: "invalid passkey" };
  const row = await env.DB.prepare("SELECT id, status FROM tokens WHERE email = ?").bind(email).first<{ id: string; status: string }>();
  if (!row) return { error: "no token found" };
  if (row.status === "disabled") return { status: "disabled" };
  await env.DB.prepare("UPDATE tokens SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now(), row.id).run();
  return { status: "disabled" };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

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
          rest: ["/api/add", "/api/search", "/api/list", "/api/profile", "/api/forget", "/api/sync_jev", "/api/jev_queue_stats", "/api/request-token", "/api/check-star", "/api/disable-token"],
        },
      });
    }

    if (path === "/") {
      return new Response(LANDING_HTML, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    const CRM_ROUTES = ["/api/request-token", "/api/check-star", "/api/disable-token"];
    if (path === "/mcp" || (path.startsWith("/api/") && !CRM_ROUTES.includes(path))) {
      if (!authorized(request, env)) {
        return json({ error: "unauthorized" }, { status: 401, headers: CORS });
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
