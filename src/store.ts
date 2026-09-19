// Storage + hybrid retrieval for DGUI-HyperMem.
//
// Write path: content -> JEV analyze -> embed -> D1 row + Vectorize vector -> JEV contradiction check.
// Read path:  query -> [Vectorize ANN + D1 FTS5 BM25] -> reciprocal-rank fusion -> JEV rerank -> score.

import type { Env, Memory, MemoryRow, MemoryAnalysis, ScoredMemory } from "./types";
import { analyzeMemory, rerank, resolveMode, supersedeScore } from "./jev";
import { buildAnalyzeRow, buildRerankRow, buildSupersedeRow, enqueueJevExample } from "./dataset";
import { clamp01, normalizeContent, now, parseTags, sha256, uuid } from "./util";

const RRF_K = 60;
const SUPERSEDE_THRESHOLD = 0.8;

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    scope: row.scope,
    content: row.content,
    memory_type: row.memory_type,
    tags: parseTags(row.tags),
    salience: row.salience,
    durable: row.durable,
    confidence: row.confidence,
    source: row.source,
    status: row.status,
    superseded_by: row.superseded_by,
    access_count: row.access_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const model = env.EMBED_MODEL || "@cf/baai/bge-base-en-v1.5";
  const out: any = await (env.AI as any).run(model, { text: texts });
  const data = out?.data;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error(`embedding model ${model} returned an unexpected shape`);
  }
  return data as number[][];
}

export async function logEvent(
  env: Env,
  scope: string,
  kind: string,
  fields: { memoryId?: string | null; query?: string | null; detail?: unknown } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO events (scope, kind, memory_id, query, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(scope, kind, fields.memoryId ?? null, fields.query ?? null, fields.detail ? JSON.stringify(fields.detail) : null, now())
      .run();
  } catch (err) {
    console.error("logEvent failed:", String(err));
  }
}

export async function getMemory(env: Env, id: string): Promise<Memory | null> {
  const row = await env.DB.prepare(`SELECT * FROM memories WHERE id = ?`).bind(id).first<MemoryRow>();
  return row ? toMemory(row) : null;
}

// ---------------------------------------------------------------- write path

export interface AddInput {
  content: string;
  scope?: string;
  tags?: unknown;
  source?: string | null;
  checkContradictions?: boolean;
}

export interface AddResult {
  memory: Memory;
  analysis: MemoryAnalysis;
  created: boolean;
  superseded: { id: string; content: string; probability: number }[];
}

export async function addMemory(env: Env, input: AddInput): Promise<AddResult> {
  const scope = input.scope || env.DEFAULT_SCOPE || "default";
  const content = input.content.trim();
  if (!content) throw new Error("content must not be empty");

  const tags = parseTags(input.tags);
  const hash = await sha256(`${scope}\n${normalizeContent(content)}`);
  const existing = await env.DB.prepare(`SELECT * FROM memories WHERE scope = ? AND hash = ?`)
    .bind(scope, hash)
    .first<MemoryRow>();

  const analysis = await analyzeMemory(env, content);
  const [vector] = await embed(env, [content]);
  const timestamp = now();
  const id = existing?.id ?? uuid();

  if (existing) {
    await env.DB.prepare(
      `UPDATE memories
         SET content = ?, tags = ?, memory_type = ?, salience = ?, durable = ?, confidence = ?,
             type_probabilities = ?, source = ?, status = 'active', superseded_by = NULL, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        content,
        JSON.stringify(tags),
        analysis.memory_type,
        analysis.salience,
        analysis.durable,
        analysis.confidence,
        analysis.type_probabilities ? JSON.stringify(analysis.type_probabilities) : null,
        input.source ?? existing.source,
        timestamp,
        id,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO memories
         (id, scope, content, memory_type, tags, salience, durable, confidence, type_probabilities,
          source, hash, status, access_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    )
      .bind(
        id,
        scope,
        content,
        analysis.memory_type,
        JSON.stringify(tags),
        analysis.salience,
        analysis.durable,
        analysis.confidence,
        analysis.type_probabilities ? JSON.stringify(analysis.type_probabilities) : null,
        input.source ?? null,
        hash,
        timestamp,
        timestamp,
      )
      .run();
  }

  await env.VECTORIZE.upsert([
    {
      id,
      values: vector,
      metadata: {
        scope,
        memory_type: analysis.memory_type,
        status: "active",
        salience: analysis.salience ?? 2,
      },
    },
  ]);

  if (analysis.provider !== "off") {
    await enqueueJevExample(
      env,
      buildAnalyzeRow(env, { memory_id: id, scope, content, analysis, source: input.source ?? null, created_at: timestamp }),
    );
  }

  const superseded: AddResult["superseded"] = [];
  const shouldCheck = input.checkContradictions !== false && !existing;
  if (shouldCheck) {
    try {
      const near = await env.VECTORIZE.query(vector, {
        topK: 4,
        returnMetadata: "all",
        filter: { scope: { $eq: scope }, status: { $eq: "active" } },
      });
      for (const match of near.matches || []) {
        if (match.id === id) continue;
        const row = await env.DB.prepare(`SELECT * FROM memories WHERE id = ? AND status = 'active'`)
          .bind(match.id)
          .first<MemoryRow>();
        if (!row) continue;
        const probability = await supersedeScore(env, row.content, content);
        await enqueueJevExample(env, buildSupersedeRow(env, { existing: row.content, incoming: content, probability, scope, created_at: timestamp }));
        if (probability >= SUPERSEDE_THRESHOLD) {
          await env.DB.prepare(`UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ?`)
            .bind(id, now(), row.id)
            .run();
          await env.VECTORIZE.deleteByIds([row.id]);
          superseded.push({ id: row.id, content: row.content, probability });
          await logEvent(env, scope, "supersede", { memoryId: row.id, detail: { superseded_by: id, probability } });
        }
      }
    } catch (err) {
      console.error("contradiction check failed:", String(err));
    }
  }

  const memory = await getMemory(env, id);
  if (!memory) throw new Error("failed to persist memory");
  await logEvent(env, scope, existing ? "update" : "add", { memoryId: id, detail: { memory_type: analysis.memory_type } });
  return { memory, analysis, created: !existing, superseded };
}

// ---------------------------------------------------------------- read path

export interface SearchOptions {
  scope?: string;
  limit?: number;
  type?: string | null;
  durableOnly?: boolean;
  useJev?: boolean;
}

function tokenize(query: string): string[] {
  return (query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1).slice(0, 16);
}

async function keywordSearch(env: Env, scope: string, query: string, limit: number): Promise<{ id: string; rank: number }[]> {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t}"`).join(" OR ");
  try {
    const { results } = await env.DB.prepare(
      `SELECT m.id AS id, bm25(memories_fts) AS rank_score
         FROM memories_fts
         JOIN memories m ON m.rowid = memories_fts.rowid
        WHERE memories_fts MATCH ?1 AND m.scope = ?2 AND m.status = 'active'
        ORDER BY rank_score
        LIMIT ?3`,
    )
      .bind(match, scope, limit)
      .all<{ id: string; rank_score: number }>();
    return (results || []).map((r, i) => ({ id: r.id, rank: i }));
  } catch (err) {
    console.error("keyword search failed:", String(err));
    return [];
  }
}

async function vectorSearch(
  env: Env,
  scope: string,
  vector: number[],
  limit: number,
): Promise<{ id: string; rank: number }[]> {
  try {
    const res = await env.VECTORIZE.query(vector, {
      topK: limit,
      returnMetadata: "all",
      filter: { scope: { $eq: scope }, status: { $eq: "active" } },
    });
    return (res.matches || []).map((m, i) => ({ id: m.id, rank: i }));
  } catch (err) {
    console.error("vector search failed:", String(err));
    return [];
  }
}

export async function searchMemories(env: Env, query: string, options: SearchOptions = {}): Promise<ScoredMemory[]> {
  const scope = options.scope || env.DEFAULT_SCOPE || "default";
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const shortlistSize = Math.max(limit * 2, 12);

  let vector: number[] | null = null;
  try {
    [vector] = await embed(env, [query]);
  } catch (err) {
    console.error("query embedding failed, keyword-only:", String(err));
  }

  const [vectorHits, keywordHits] = await Promise.all([
    vector ? vectorSearch(env, scope, vector, shortlistSize) : Promise.resolve([]),
    keywordSearch(env, scope, query, shortlistSize),
  ]);

  const fused = new Map<string, { fused: number; vector_rank: number | null; keyword_rank: number | null }>();
  const bump = (id: string, rank: number, key: "vector_rank" | "keyword_rank") => {
    const entry = fused.get(id) ?? { fused: 0, vector_rank: null, keyword_rank: null };
    entry.fused += 1 / (RRF_K + rank);
    entry[key] = rank;
    fused.set(id, entry);
  };
  vectorHits.forEach((h) => bump(h.id, h.rank, "vector_rank"));
  keywordHits.forEach((h) => bump(h.id, h.rank, "keyword_rank"));

  if (!fused.size) {
    await logEvent(env, scope, "search", { query, detail: { results: 0 } });
    return [];
  }

  const ids = [...fused.keys()].slice(0, shortlistSize);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM memories WHERE id IN (${placeholders}) AND status = 'active'`,
  )
    .bind(...ids)
    .all<MemoryRow>();

  let rows = results || [];
  if (options.type) rows = rows.filter((r) => r.memory_type === options.type);
  if (options.durableOnly) rows = rows.filter((r) => (r.durable ?? 1) >= 0.4);

  const maxFused = Math.max(...[...fused.values()].map((v) => v.fused), 1e-9);
  const jevScores =
    options.useJev === false
      ? null
      : await rerank(
          env,
          query,
          rows.map((r) => ({ id: r.id, content: r.content })),
        );
  const jevById = new Map<string, number>();
  if (jevScores) rows.forEach((r, i) => jevById.set(r.id, jevScores[i] ?? 0));

  if (jevScores && rows.length >= 3) {
    await enqueueJevExample(
      env,
      buildRerankRow(env, {
        query,
        candidates: rows.map((r) => ({ id: r.id, content: r.content })),
        scores: jevScores,
        provider: resolveMode(env),
        scope,
      }),
    );
  }

  const scored: ScoredMemory[] = rows.map((row) => {
    const entry = fused.get(row.id)!;
    const fusedNorm = clamp01(entry.fused / maxFused);
    const jev = jevScores ? jevById.get(row.id) ?? 0 : null;
    const salienceNorm = clamp01((row.salience ?? 2) / 4);
    const score = jev === null ? 0.85 * fusedNorm + 0.15 * salienceNorm : 0.5 * fusedNorm + 0.4 * jev + 0.1 * salienceNorm;
    return {
      ...toMemory(row),
      score,
      fused_score: fusedNorm,
      jev_score: jev,
      vector_rank: entry.vector_rank,
      keyword_rank: entry.keyword_rank,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  if (top.length) {
    const stamp = now();
    const ph = top.map(() => "?").join(",");
    await env.DB.prepare(
      `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (${ph})`,
    )
      .bind(stamp, ...top.map((m) => m.id))
      .run()
      .catch((err: unknown) => console.error("touch failed:", String(err)));
  }

  await logEvent(env, scope, "search", { query, detail: { results: top.length, candidates: fused.size } });
  return top;
}

// ---------------------------------------------------------------- browse / admin

export interface ListOptions {
  scope?: string;
  limit?: number;
  type?: string | null;
  status?: string | null;
}

export async function listMemories(env: Env, options: ListOptions = {}): Promise<Memory[]> {
  const scope = options.scope || env.DEFAULT_SCOPE || "default";
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const status = options.status || "active";
  const clauses = ["scope = ?", "status = ?"];
  const binds: unknown[] = [scope, status];
  if (options.type) {
    clauses.push("memory_type = ?");
    binds.push(options.type);
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM memories WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<MemoryRow>();
  return (results || []).map(toMemory);
}

export interface Profile {
  scope: string;
  total: number;
  active: number;
  superseded: number;
  by_type: Record<string, number>;
  top_tags: { tag: string; count: number }[];
  average_salience: number | null;
  newest: { id: string; content: string; memory_type: string | null; created_at: number }[];
}

export async function profile(env: Env, scopeInput?: string): Promise<Profile> {
  const scope = scopeInput || env.DEFAULT_SCOPE || "default";
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM memories WHERE scope = ? GROUP BY status`,
  )
    .bind(scope)
    .all<{ status: string; n: number }>();
  const byType = await env.DB.prepare(
    `SELECT COALESCE(memory_type, 'untyped') AS memory_type, COUNT(*) AS n
       FROM memories WHERE scope = ? AND status = 'active' GROUP BY memory_type ORDER BY n DESC`,
  )
    .bind(scope)
    .all<{ memory_type: string; n: number }>();
  const avg = await env.DB.prepare(
    `SELECT AVG(salience) AS avg_salience FROM memories WHERE scope = ? AND status = 'active'`,
  )
    .bind(scope)
    .first<{ avg_salience: number | null }>();
  const newest = await env.DB.prepare(
    `SELECT id, content, memory_type, created_at FROM memories
      WHERE scope = ? AND status = 'active' ORDER BY created_at DESC LIMIT 10`,
  )
    .bind(scope)
    .all<{ id: string; content: string; memory_type: string | null; created_at: number }>();
  const { results: tagRows } = await env.DB.prepare(
    `SELECT tags FROM memories WHERE scope = ? AND status = 'active'`,
  )
    .bind(scope)
    .all<{ tags: string }>();

  const tagCounts = new Map<string, number>();
  for (const row of tagRows || []) {
    for (const tag of parseTags(row.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const statusMap = new Map((counts.results || []).map((r) => [r.status, r.n]));
  const by_type: Record<string, number> = {};
  for (const row of byType.results || []) by_type[row.memory_type] = row.n;

  return {
    scope,
    total: [...statusMap.values()].reduce((a, b) => a + b, 0),
    active: statusMap.get("active") ?? 0,
    superseded: statusMap.get("superseded") ?? 0,
    by_type,
    top_tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count })),
    average_salience: avg?.avg_salience ?? null,
    newest: newest.results || [],
  };
}

export interface ForgetResult {
  forgotten: number;
  ids: string[];
}

export async function forgetMemories(
  env: Env,
  options: { ids?: string[]; scope?: string; query?: string; all?: boolean },
): Promise<ForgetResult> {
  const scope = options.scope || env.DEFAULT_SCOPE || "default";
  let ids = (options.ids || []).filter(Boolean);

  if (options.all) {
    const { results } = await env.DB.prepare(`SELECT id FROM memories WHERE scope = ?`)
      .bind(scope)
      .all<{ id: string }>();
    ids = (results || []).map((r) => r.id);
  } else if (options.query) {
    const hits = await searchMemories(env, options.query, { scope, limit: 10, useJev: false });
    ids = hits.map((h) => h.id);
  }

  if (!ids.length) return { forgotten: 0, ids: [] };

  const ph = ids.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE memories SET status = 'deleted', updated_at = ? WHERE id IN (${ph})`)
    .bind(now(), ...ids)
    .run();
  await env.VECTORIZE.deleteByIds(ids).catch((err: unknown) => console.error("vector delete failed:", String(err)));
  await logEvent(env, scope, "forget", { detail: { ids } });
  return { forgotten: ids.length, ids };
}
