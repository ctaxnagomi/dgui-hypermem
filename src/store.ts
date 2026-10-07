// Storage + hybrid retrieval for DGUI-HyperMem.
//
// Write path: content -> JEV analyze -> embed -> D1 row + Vectorize vector -> JEV contradiction check.
// Read path:  query -> [Vectorize ANN + D1 FTS5 BM25] -> reciprocal-rank fusion -> JEV rerank -> score.

import type { Env, Memory, MemoryRow, MemoryAnalysis, MemoryStatus, ScoredMemory } from "./types";
import { analyzeMemory, rerank, resolveMode, supersedeScore } from "./jev";
import { buildAnalyzeRow, buildRerankRow, buildSupersedeRow, enqueueJevExample } from "./dataset";
import { clamp01, normalizeContent, now, parseTags, sha256, uuid } from "./util";

const RRF_K = 60;
const SUPERSEDE_THRESHOLD = 0.8;

function salienceGate(env: Env): number {
  const v = (env as any).SALIENCE_GATE;
  const n = typeof v === "string" ? parseFloat(v) : (typeof v === "number" ? v : NaN);
  if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
  return 3.0; // calibrated to model distribution (p50); 4.0 filtered everything in this dataset
}

function toMemory(row: MemoryRow): Memory {
  let metadata: any = undefined;
  try {
    if (row.metadata) metadata = JSON.parse(row.metadata);
  } catch {}
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
    provider: row.provider,
    origin_system: row.origin_system,
    corpus_type: row.corpus_type,
    client_id: row.client_id,
    user_id: row.user_id,
    metadata,
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
  provider?: string | null;
  origin_system?: string | null;
  corpus_type?: string | null;
  client_id?: string | null;
  user_id?: string | null;
  metadata?: any;
  /** Attribution tag of the calling credential owner (`u_<hex>`, see `tagIdFor`). */
  tag_id?: string | null;
}

export interface AddResult {
  memory: Memory;
  analysis: MemoryAnalysis;
  created: boolean;
  superseded: { id: string; content: string; probability: number }[];
  /**
   * Whether the Vectorize index accepted the embedding.
   *
   * Always true on a healthy system. It goes false only when D1 has already
   * committed the row and the index write failed after retries — a genuinely
   * partitioned backend. The row is NOT lost in that case: `memories_fts` is
   * maintained by a D1 trigger in the same transaction as the row, so keyword
   * recall still finds it. Only semantic recall is degraded until an index
   * reconciliation runs.
   *
   * Reported rather than thrown, because the inverse is worse: throwing here
   * tells the client the write failed when D1 accepted it, so a caller that
   * retries creates a duplicate and a caller that does not believes data it
   * actually has was dropped.
   */
  indexed: boolean;
}

/**
 * Upsert a single memory into Vectorize, retrying once, never throwing.
 *
 * Returns false only when both attempts failed. Callers must treat false as
 * "the index is behind", not "the write failed" — see AddResult.indexed.
 */
async function indexMemory(env: Env, entry: { id: string; values: number[]; metadata: Record<string, unknown> }): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await env.VECTORIZE.upsert([entry as never]);
      return true;
    } catch (err) {
      console.error(`vector index upsert failed (attempt ${attempt + 1}) for ${entry.id}:`, String(err));
    }
  }
  return false;
}

export async function addMemory(env: Env, input: AddInput): Promise<AddResult> {
  const scope = input.scope || env.DEFAULT_SCOPE || "default";
  const content = input.content.trim();
  if (!content) throw new Error("content must not be empty");

  // Block harmful content patterns (secrets, CVE exploits, gRPC threats, pornography, CSAM)
  const lower = content.toLowerCase();
  const blockedPatterns = [
    /\b(?:sk_live_|rk_live_|pk_live_|sk_test_|rk_test_|pk_test_)\w+/i,  // Stripe keys
    /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)\w+/i,                               // GitHub tokens
    /\b(?:AKIA[0-9A-Z]{16})\b/,                                           // AWS keys
    /\b(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/i,                     // Private keys
    /\b(?:cve-\d{4}-\d{4,7})\b/i,                                          // CVE exploit references
    /(?:underage|minor\s+(?:girl|boy|child)|preteen|cp\s+(?:content|collection))/i, // CSAM indicators
    /(?:child\s+(?:porn|abuse|exploit)|loli|shota)/i,                      // Prohibited content
  ];
  for (const pattern of blockedPatterns) {
    if (pattern.test(content)) {
      throw new Error("memory content rejected: prohibited pattern detected");
    }
  }

  const tags = parseTags(input.tags);
  const hash = await sha256(`${scope}\n${normalizeContent(content)}`);
  const existing = await env.DB.prepare(`SELECT * FROM memories WHERE scope = ? AND hash = ?`)
    .bind(scope, hash)
    .first<MemoryRow>();

  const analysis = await analyzeMemory(env, content);
  const [vector] = await embed(env, [content]);
  const timestamp = now();
  const id = existing?.id ?? uuid();
  const status: MemoryStatus = analysis.salience >= salienceGate(env) ? "active" : "low_signal";

  if (existing) {
    await env.DB.prepare(
      `UPDATE memories
         SET content = ?, tags = ?, memory_type = ?, salience = ?, durable = ?, confidence = ?,
             type_probabilities = ?, source = ?, status = ?, superseded_by = NULL, updated_at = ?,
             provider = COALESCE(?, provider), origin_system = COALESCE(?, origin_system), 
             corpus_type = COALESCE(?, corpus_type), client_id = COALESCE(?, client_id),
             user_id = COALESCE(?, user_id), metadata = COALESCE(?, metadata)
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
        status,
        timestamp,
        input.provider ?? null,
        input.origin_system ?? null,
        input.corpus_type ?? null,
        input.client_id ?? null,
        input.user_id ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        id,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO memories
         (id, scope, content, memory_type, tags, salience, durable, confidence, type_probabilities,
          source, hash, status, access_count, created_at, updated_at, provider, origin_system, corpus_type, client_id, user_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        status,
        timestamp,
        timestamp,
        input.provider ?? null,
        input.origin_system ?? null,
        input.corpus_type ?? (input.user_id ? 'session' : 'universal'),
        input.client_id ?? null,
        input.user_id ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      )
      .run();
  }

  // D1 has committed. From here on nothing may fail the request, because the
  // row is durable and reachable through memories_fts regardless: a CP system
  // answers from its source of truth, and D1 is that source. The index is an
  // accelerator, so a partition degrades semantic recall but does not make the
  // write "not happened".
  //
  // One retry, then report rather than throw. Throwing would tell the caller
  // the write failed while D1 holds it — a client that then retries creates a
  // duplicate, and a client that does not believes real data was rejected.
  const indexed = await indexMemory(env, {
    id,
    values: vector,
    metadata: {
      scope,
      memory_type: analysis.memory_type,
      status,
      salience: analysis.salience ?? 2,
    },
  });

  if (analysis.provider !== "off") {
    await enqueueJevExample(
      env,
      buildAnalyzeRow(env, { memory_id: id, scope, content, analysis, source: input.source ?? null, created_at: timestamp, tag_id: input.tag_id ?? null }),
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
        await enqueueJevExample(env, buildSupersedeRow(env, { existing: row.content, incoming: content, probability, scope, created_at: timestamp, tag_id: input.tag_id ?? null }));
        if (probability >= SUPERSEDE_THRESHOLD) {
          await env.DB.prepare(`UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ?`)
            .bind(id, now(), row.id)
            .run();
          // D1 has marked the row superseded, so searchMemories' authoritative
          // read-back already excludes it. Failing to drop the vector leaves
          // harmless index cruft, not a resurrected memory — so swallow it
          // rather than abandoning the remaining contradiction matches.
          await env.VECTORIZE.deleteByIds([row.id]).catch((err: unknown) =>
            console.error("vector delete failed after supersede:", String(err)),
          );
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
  return { memory, analysis, created: !existing, superseded, indexed };
}

// ---------------------------------------------------------------- read path

export interface SearchOptions {
  scope?: string;
  limit?: number;
  type?: string | null;
  durableOnly?: boolean;
  useJev?: boolean;
  /** Attribution tag of the calling credential owner (`u_<hex>`, see `tagIdFor`). */
  tag_id?: string | null;
}

function tokenize(query: string): string[] {
  return (query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1).slice(0, 16);
}

// Words that carry no retrieval signal. Without this, an OR-match on
// "how do i bake sourdough bread at home" hits any memory containing "at" or
// "home", and a lamp that lights on unrelated input teaches people to ignore it.
// The offline benchmark (paper/eval) sidesteps this by ranking with BM25 and
// taking a top-k; a bare match count cannot, because every OR hit counts equally.
const SIGNAL_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as", "at", "by",
  "for", "from", "in", "into", "of", "on", "onto", "to", "with", "without", "is", "are",
  "was", "were", "be", "been", "am", "do", "does", "did", "doing", "have", "has", "had",
  "i", "me", "my", "we", "our", "you", "your", "it", "its", "this", "that", "these",
  "those", "there", "here", "what", "which", "who", "whom", "how", "when", "where", "why",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must", "not",
  "no", "yes", "any", "all", "some", "each", "more", "most", "other", "such", "only",
  "own", "same", "too", "very", "just", "about", "over", "under", "again", "up", "down",
  "out", "off", "keep", "keeps", "get", "got", "make", "made", "use", "used", "using",
]);

function signalTerms(query: string): string[] {
  return tokenize(query).filter((t) => !SIGNAL_STOPWORDS.has(t));
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

/**
 * Cheap existence probe behind the landing-page "solution lamp".
 *
 * Deliberately NOT a searchMemories() call. That path embeds the query (Workers
 * AI), JEV-reranks the shortlist, bumps access_count, writes an events row and
 * enqueues a rerank example into the training dataset. All four are wrong for an
 * unauthenticated endpoint: anonymous traffic would burn AI quota, inject junk
 * into the JEV dataset, and inflate a memory's popularity just because a stranger
 * typed a related word.
 *
 * So this does an FTS5 keyword lookup only, gated by the same salience threshold
 * the rest of the system uses, and returns a COUNT. No content, no tags, no ids,
 * no snippets ever cross this boundary.
 *
 * `confident:false` distinguishes "we looked and found nothing" from "the probe
 * itself failed", so the UI can stay dark instead of claiming a negative it did
 * not actually establish.
 */
export async function solutionSignal(
  env: Env,
  query: string,
  options: {
    scope?: string;
    threshold?: number;
    minTerms?: number;
    minCoverage?: number;
    minMass?: number;
  } = {},
): Promise<{ has: boolean; count: number; confident: boolean }> {
  const scope = options.scope || env.DEFAULT_SCOPE || "default";
  const floor = options.threshold ?? salienceGate(env);
  const terms = signalTerms(query);
  // One content word is not a question, and a match on a single rare term is
  // weak evidence that the store can actually answer it.
  if (terms.length < 2) return { has: false, count: 0, confident: false };
  // Relevance needs two independent signals, because each alone is wrong in a
  // different direction.
  //
  // Count coverage alone under-fires on long queries: a specific six-word
  // question matches its memory on three words, which is only 50%, and adding
  // any threshold above that rejects a genuine hit.
  //
  // IDF mass alone over-fires: rare incidental words carry nearly all the weight,
  // so two lucky rare terms look like a confident match even when they are off
  // topic.
  //
  // So a memory must clear both -- match at least `minTerms` words, cover
  // `minCoverage` of them, and carry `minMass` of the query's IDF weight. Any one
  // of the three alone has a demonstrated failure mode; together they did not
  // produce a false positive or a false negative across the corpus.
  const minTerms = options.minTerms ?? 2;
  const minCoverage = options.minCoverage ?? 0.5;
  const minMass = options.minMass ?? 0.34;

  try {
    // Ask the index which rows each term hits -- one query per term -- and keep
    // the row ids plus each term's document frequency for the IDF weights.
    //
    // Deliberately NOT re-tokenised in JS. The FTS5 table uses
    // 'porter unicode61', so "payments" and "payment" share a stem; comparing
    // raw query tokens against raw content text misses every morphological
    // variant and reads as a false negative. Letting the index do the matching
    // keeps this consistent with what search actually retrieves.
    const corpus = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM memories WHERE scope = ?1 AND status = 'active' AND COALESCE(salience, 0) >= ?2`,
    )
      .bind(scope, floor)
      .first<{ n: number }>();
    const N = Math.max(corpus?.n || 0, 1);

    const perTerm = await Promise.all(
      terms.map((t) =>
        env.DB.prepare(
          `SELECT m.rowid AS rid
             FROM memories_fts
             JOIN memories m ON m.rowid = memories_fts.rowid
            WHERE memories_fts MATCH ?1 AND m.scope = ?2 AND m.status = 'active'
              AND COALESCE(m.salience, 0) >= ?3`,
        )
          .bind(`"${t}"`, scope, floor)
          .all<{ rid: number }>(),
      ),
    );

    // Okapi-style IDF, the same weighting the offline benchmark uses.
    const idf = (df: number) => Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const weights = perTerm.map((res) => idf(res?.results?.length || 0));
    const totalMass = weights.reduce((a, b) => a + b, 0);
    if (totalMass <= 0) return { has: false, count: 0, confident: true };

    const minMatched = Math.max(minTerms, Math.ceil(terms.length * minCoverage));
    const byRow = new Map<number, { mass: number; terms: number }>();
    perTerm.forEach((res, i) => {
      for (const row of res?.results || []) {
        const cur = byRow.get(row.rid) || { mass: 0, terms: 0 };
        cur.mass += weights[i];
        cur.terms += 1;
        byRow.set(row.rid, cur);
      }
    });

    let count = 0;
    for (const v of byRow.values()) {
      if (v.terms >= minMatched && v.mass / totalMass >= minMass) count++;
    }
    return { has: count > 0, count, confident: true };
  } catch (err) {
    console.error("solutionSignal failed:", String(err));
    return { has: false, count: 0, confident: false };
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
        tag_id: options.tag_id ?? null,
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
  // Deliberately swallowed, and it must stay that way. D1 is the consistency
  // authority: searchMemories generates candidates (including any stale vector
  // this failure leaves behind) and then re-reads D1, dropping everything not
  // status='active'. A dead row therefore cannot be served even while its vector
  // lingers. Throwing would report a deletion as failed when it has in fact
  // taken effect for every read path that matters.
  await env.VECTORIZE.deleteByIds(ids).catch((err: unknown) => console.error("vector delete failed:", String(err)));
  await logEvent(env, scope, "forget", { detail: { ids } });
  return { forgotten: ids.length, ids };
}

/* --- quota change notices ----------------------------------------------------
 *
 * The MCP transport here is stateless: a fresh McpServer and transport per
 * request, `sessionIdGenerator: undefined`, closed in a `finally`. There is
 * therefore no long-lived connection and no session id to address, so an
 * administrative change cannot be pushed down to a connected client the way a
 * stateful SSE transport could.
 *
 * A push would also be the wrong contract even if it were available: a notice
 * that arrives only while the client happens to be connected is not durable, and
 * quota changes are exactly the kind of thing a user should discover rather than
 * have to ask for. So the notice is persisted and delivered by the caller's NEXT
 * call -- it appears in the response of whatever the agent does next -- and the
 * `quota_notices` tool exposes the history.
 *
 * Delivery marks the notice read, so an unacknowledged change is never repeated
 * forever and never silently dropped either.
 */

let noticesReady: Promise<void> | null = null;

// The wrangler token in use has no D1 write scope, so migrations cannot be
// applied. The table is created lazily on first use, matching the analytics
// tables. `noticesReady` is reset to null on failure so a transient error does
// not permanently poison the isolate.
function ensureNoticeTable(env: Env): Promise<void> {
  if (!noticesReady) {
    noticesReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS quota_notices (
         id TEXT PRIMARY KEY,
         email TEXT NOT NULL,
         kind TEXT NOT NULL,
         message TEXT NOT NULL,
         data TEXT,
         created_at INTEGER NOT NULL,
         read_at INTEGER
       )`,
    )
      .run()
      .then(() => undefined)
      .catch((err: unknown) => {
        noticesReady = null;
        throw err;
      });
  }
  return noticesReady;
}

export interface QuotaNotice {
  id: string;
  email: string;
  kind: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: number;
  read_at: number | null;
}

export async function recordQuotaNotice(
  env: Env,
  email: string,
  kind: string,
  message: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await ensureNoticeTable(env);
  await env.DB.prepare(
    "INSERT INTO quota_notices (id, email, kind, message, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
  )
    .bind(crypto.randomUUID(), email, kind, message, JSON.stringify(data), now())
    .run();
}

export async function listQuotaNotices(
  env: Env,
  email: string,
  limit = 20,
  unreadOnly = false,
): Promise<QuotaNotice[]> {
  await ensureNoticeTable(env);
  // `data` comes back as the raw JSON text, so the row type is deliberately not
  // QuotaNotice -- its `data` is the parsed object.
  //
  // rowid is the tiebreaker on ordering. Two notices written in the same
  // millisecond have an identical created_at, and SQLite is free to order
  // equal keys any way it likes, so without it the history list reshuffled
  // between identical queries. rowid is monotonic with insertion.
  const res = await env.DB.prepare(
    `SELECT id, email, kind, message, data, created_at, read_at
       FROM quota_notices
      WHERE email = ?1 ${unreadOnly ? "AND read_at IS NULL" : ""}
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?2`,
  )
    .bind(email, Math.max(1, Math.min(limit, 100)))
    .all<Omit<QuotaNotice, "data"> & { data: string | null }>();
  return (res?.results || []).map((r) => {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = r.data ? JSON.parse(r.data) : null;
    } catch {
      // A malformed blob must not hide the notice itself; the message is the
      // part a human reads.
      parsed = null;
    }
    return { ...r, data: parsed };
  });
}

export async function ackQuotaNotices(env: Env, email: string, ids?: string[]): Promise<number> {
  await ensureNoticeTable(env);
  if (!ids || !ids.length) {
    const all = await env.DB.prepare(
      "UPDATE quota_notices SET read_at = ?1 WHERE email = ?2 AND read_at IS NULL",
    )
      .bind(now(), email)
      .run();
    return all?.meta?.changes || 0;
  }
  // Only the placeholder list is interpolated; every value is bound, and the
  // clause is additionally scoped to this email so an id from another account
  // can never be acked.
  //
  // The ids start at ?3, not ?2: ?1 is read_at and ?2 is email, and starting at
  // ?2 made a single-id ack compare id against the email while overflowing the
  // bind, so acking exactly one notice never worked.
  const ph = ids.map((_, i) => `?${i + 3}`).join(",");
  const some = await env.DB.prepare(
    `UPDATE quota_notices SET read_at = ?1 WHERE email = ?2 AND id IN (${ph})`,
  )
    .bind(now(), email, ...ids)
    .run();
  return some?.meta?.changes || 0;
}

/**
 * Fetch the caller's unread notices and mark them delivered in the same step.
 * Used on the request path, so that a quota change surfaces exactly once.
 */
export async function takeUnreadQuotaNotices(env: Env, email: string): Promise<QuotaNotice[]> {
  const pending = await listQuotaNotices(env, email, 5, true);
  if (pending.length) await ackQuotaNotices(env, email, pending.map((n) => n.id));
  return pending;
}

/* --- admin devices ------------------------------------------------------------
 *
 * Registered admin devices: the public half of a keypair, so a device can
 * authenticate by proving possession of a private key the server never sees.
 * Only `public_key` is stored -- there is no secret to leak from D1, which is
 * the entire point relative to the bearer passkey this replaces.
 *
 * Created lazily for the same reason as quota_notices: the wrangler token has no
 * D1 write scope for migrations, so `d1_migrations` does not track the tables the
 * code actually uses.
 */

let devicesReady: Promise<void> | null = null;

function ensureDeviceTable(env: Env): Promise<void> {
  if (!devicesReady) {
    devicesReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_devices (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         public_key TEXT NOT NULL,
         origin TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         last_used_at INTEGER,
         revoked_at INTEGER
       )`,
    )
      .run()
      .then(() => undefined)
      .catch((err: unknown) => {
        devicesReady = null;
        throw err;
      });
  }
  return devicesReady;
}

export interface AdminDevice {
  id: string;
  name: string;
  public_key: string;
  origin: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

/**
 * Register or replace a device. Uses INSERT OR REPLACE rather than failing on a
 * duplicate id so a device can rotate its keypair by re-registering: the id is
 * generated by the CLI, so a collision is not an attack, and forcing the operator
 * to hand-delete rows to rotate a key is the wrong trade.
 *
 * `revoked_at` is reset because re-registering is how a revoked device is
 * deliberately brought back.
 */
export async function registerDevice(
  env: Env,
  id: string,
  name: string,
  publicKey: string,
  origin: string,
): Promise<void> {
  await ensureDeviceTable(env);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO admin_devices (id, name, public_key, origin, created_at, last_used_at, revoked_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)",
  )
    .bind(id, name, publicKey, origin, now())
    .run();
}

/** Fetch a device, or null if unknown or revoked. Revoked devices are treated as
 *  absent so every caller gets the same "no such device" behaviour and a revoked
 *  id cannot be distinguished from an invented one. */
export async function getActiveDevice(env: Env, id: string): Promise<AdminDevice | null> {
  await ensureDeviceTable(env);
  const row = await env.DB.prepare(
    "SELECT id, name, public_key, origin, created_at, last_used_at, revoked_at FROM admin_devices WHERE id = ?1 AND revoked_at IS NULL",
  )
    .bind(id)
    .first<AdminDevice>();
  return row ?? null;
}

/** Best-effort last-seen stamp. Never fails a login: audit convenience only. */
export async function touchDevice(env: Env, id: string): Promise<void> {
  await ensureDeviceTable(env);
  await env.DB.prepare("UPDATE admin_devices SET last_used_at = ?1 WHERE id = ?2")
    .bind(now(), id)
    .run();
}

export async function listDevices(env: Env): Promise<AdminDevice[]> {
  await ensureDeviceTable(env);
  const res = await env.DB.prepare(
    "SELECT id, name, public_key, origin, created_at, last_used_at, revoked_at FROM admin_devices ORDER BY created_at DESC",
  ).all<AdminDevice>();
  return res?.results || [];
}

/** Revoke a device. Returns false if there was no such active device. */
export async function revokeDevice(env: Env, id: string): Promise<boolean> {
  await ensureDeviceTable(env);
  const res = await env.DB.prepare(
    "UPDATE admin_devices SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
  )
    .bind(now(), id)
    .run();
  return (res?.meta?.changes || 0) > 0;
}
