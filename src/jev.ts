// JEV layer - the reasoning half of DGUI-HyperMem.
//
// Fast search (vectors + keywords) gets a shortlist; JEV decides what matters.
//   choice -> memory type
//   noul   -> durability (write) and query relevance (recall), contradiction (supersede)
//   score  -> salience
//
// Backends: TypeSafe System One (`typesafe`), or a Workers AI emulation of the same
// three primitives (`workers-ai`), or off (`off`). See resolveMode().

import type { Env, MemoryAnalysis } from "./types";
import { clamp01, firstJson } from "./util";

export type JevMode = "typesafe" | "workers-ai" | "off";

type Question = Record<string, unknown>;
type SystemOneResponse = { answers?: Record<string, any> };

export const MEMORY_TYPES: Record<string, string> = {
  fact: "A durable statement of fact about the user, their environment, tools, or the world.",
  preference: "A stated like, dislike, style, or way of working.",
  decision: "A decision that was made, together with its rationale.",
  project: "Configuration, paths, setup, or conventions specific to a project.",
  solution: "A fix or resolution to a problem, including the symptom and the fix.",
  architecture: "A structural, system-level or design choice.",
  conversation: "Session-only context that will not matter in a future session.",
};

const SALIENCE_LEVELS = ["Trivial", "Minor", "Useful", "Important", "Critical"];

// Shared question blocks. Used live by the backends here, and mirrored verbatim
// into the DGUI_HYPERMEM-JEV training rows so recorded inputs == actual inputs.
export function analyzeQuestions(): Record<string, Question> {
  return {
    memory_type: {
      type: "choice",
      instructions: "Which single category best describes this memory?",
      criteria: MEMORY_TYPES,
    },
    durable: {
      type: "noul",
      instructions: "Is this a durable memory worth recalling in a future session?",
      criteria: {
        true: "States something lasting: a fact, preference, decision, project convention, or solution.",
        false: "Transient session chatter, a passing remark, or something with no future use.",
      },
    },
    salience: {
      type: "score",
      instructions: "How important is this memory likely to be for future work?",
      criteria: SALIENCE_LEVELS,
    },
  };
}

export function rerankQuestions(query: string, candidates: { id: string; content: string }[]): Record<string, Question> {
  const questions: Record<string, Question> = {};
  candidates.forEach((_, i) => {
    questions[`c${i}`] = {
      type: "noul",
      instructions: `Memory candidate ${i} is printed below under candidates[${i}]. Does it directly provide the information the query asks for, or essential context needed to act on it?`,
      criteria: {
        true: "The candidate answers the query, or is necessary context for it, even if worded differently.",
        false: "The candidate is only loosely on the same topic, or is irrelevant to answering the query.",
      },
    };
  });
  return questions;
}

export function supersedeQuestions(): Record<string, Question> {
  return {
    supersedes: {
      type: "noul",
      instructions:
        "Does the incoming memory update, contradict, or replace the existing memory, such that keeping the existing one active would leave the store inconsistent?",
      criteria: {
        true: "They describe the same thing, and the incoming one is newer or corrects the existing one.",
        false: "They are compatible, cover different things, or both can stay true at once.",
      },
    },
  };
}

export function resolveMode(env: Env): JevMode {
  const mode = (env.JEV_MODE || "auto").toLowerCase();
  if (mode === "off" || mode === "none" || mode === "false") return "off";
  if (mode === "typesafe") return env.TYPESAFE_API_KEY ? "typesafe" : "workers-ai";
  if (mode === "workers-ai" || mode === "workers_ai") return "workers-ai";
  return env.TYPESAFE_API_KEY ? "typesafe" : "workers-ai";
}

async function systemOne(env: Env, state: unknown, questions: Record<string, Question>): Promise<SystemOneResponse> {
  const base = (env.JEV_ENDPOINT || "https://api.typesafe.ai").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/systemone`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
    },
    body: JSON.stringify({ state, model: env.JEV_MODEL || "jev-latest", questions }),
  });
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as SystemOneResponse;
}

async function chat(env: Env, system: string, user: string): Promise<string> {
  const model = env.FALLBACK_MODEL || "@cf/meta/llama-3.1-8b-fast-v2";
  const out: any = await (env.AI as any).run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 640,
    temperature: 0,
  });
  return extractText(out);
}

function extractText(out: any): string {
  if (!out) return "";
  if (typeof out.response === "string") return out.response;
  const content = out.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (typeof out.output === "string") return out.output;
  if (Array.isArray(out.output) && typeof out.output[0]?.text === "string") return out.output[0].text;
  return "";
}

// ---------------------------------------------------------------- write side

export async function analyzeMemory(env: Env, content: string): Promise<MemoryAnalysis> {
  const mode = resolveMode(env);
  if (mode === "typesafe") {
    try {
      return await analyzeTypesafe(env, content);
    } catch (err) {
      console.error("JEV typesafe analyze failed, falling back:", String(err));
    }
  }
  if (mode !== "off") {
    try {
      return await analyzeWorkersAi(env, content);
    } catch (err) {
      console.error("JEV workers-ai analyze failed:", String(err));
    }
  }
  return { memory_type: "fact", type_probabilities: null, durable: 1, salience: 2, confidence: null, provider: "off" };
}

async function analyzeTypesafe(env: Env, content: string): Promise<MemoryAnalysis> {
  const resp = await systemOne(env, { memory: content }, analyzeQuestions());
  const t = resp.answers?.memory_type ?? {};
  const d = resp.answers?.durable ?? {};
  const s = resp.answers?.salience ?? {};
  const memory_type = typeof t.choice === "string" && MEMORY_TYPES[t.choice] ? t.choice : "fact";
  return {
    memory_type,
    type_probabilities: t.probabilities ?? null,
    durable: clamp01(typeof d.noul === "number" ? d.noul : 1),
    salience: Number.isFinite(s.score) ? Number(s.score) : 2,
    confidence: typeof t.confidence === "number" ? t.confidence : null,
    provider: "typesafe",
  };
}

async function analyzeWorkersAi(env: Env, content: string): Promise<MemoryAnalysis> {
  const types = Object.keys(MEMORY_TYPES).join(", ");
  const text = await chat(
    env,
    "You are a memory classifier. Reply with only a JSON object, no prose.",
    `Classify this memory and reply as JSON with exactly these keys:
{"memory_type": one of [${types}], "durable": a number 0..1 (1 = worth recalling in a future session), "salience": a number 0..4 (0 trivial, 4 critical)}

Memory:
${content}`,
  );
  const parsed = firstJson<{ memory_type?: string; durable?: number; salience?: number }>(text) || {};
  const memory_type = parsed.memory_type && MEMORY_TYPES[parsed.memory_type] ? parsed.memory_type : "fact";
  return {
    memory_type,
    type_probabilities: null,
    durable: clamp01(typeof parsed.durable === "number" ? parsed.durable : 1),
    salience: Number.isFinite(parsed.salience) ? Math.min(4, Math.max(0, Number(parsed.salience))) : 2,
    confidence: null,
    provider: "workers-ai",
  };
}

// ---------------------------------------------------------------- recall side

export async function rerank(
  env: Env,
  query: string,
  candidates: { id: string; content: string }[],
): Promise<number[] | null> {
  if (!candidates.length) return [];
  const mode = resolveMode(env);
  if (mode === "off") return null;
  if (mode === "typesafe") {
    try {
      return await rerankTypesafe(env, query, candidates);
    } catch (err) {
      console.error("JEV typesafe rerank failed, falling back:", String(err));
    }
  }
  try {
    return await rerankWorkersAi(env, query, candidates);
  } catch (err) {
    console.error("JEV workers-ai rerank failed:", String(err));
    return null;
  }
}

async function rerankTypesafe(env: Env, query: string, candidates: { id: string; content: string }[]): Promise<number[]> {
  const resp = await systemOne(
    env,
    { query, candidates: candidates.map((c, i) => ({ index: i, memory: c.content })) },
    rerankQuestions(query, candidates),
  );
  return candidates.map((_, i) => clamp01(resp.answers?.[`c${i}`]?.noul ?? 0));
}

async function rerankWorkersAi(env: Env, query: string, candidates: { id: string; content: string }[]): Promise<number[]> {
  const list = candidates.map((c, i) => `[${i}] ${c.content}`).join("\n");
  const text = await chat(
    env,
    "You are a retrieval re-ranker. Reply with only a JSON array of numbers, no prose.",
    `Rate how well each numbered memory answers the query, from 0 (irrelevant) to 1 (directly answers it).
Reply with a JSON array of exactly ${candidates.length} numbers, in index order.

Query:
${query}

Candidates:
${list}`,
  );
  const parsed = firstJson<number[]>(text);
  if (!Array.isArray(parsed) || parsed.length !== candidates.length) return candidates.map(() => 0.5);
  return parsed.map((n) => clamp01(Number(n)));
}

// ---------------------------------------------------------------- consistency

/** Probability that `incoming` replaces `existing` (existing should be superseded). */
export async function supersedeScore(env: Env, existing: string, incoming: string): Promise<number> {
  const mode = resolveMode(env);
  if (mode === "off") return 0;
  if (mode === "typesafe") {
    try {
      const resp = await systemOne(
        env,
        { existing_memory: existing, incoming_memory: incoming },
        supersedeQuestions(),
      );
      return clamp01(resp.answers?.supersedes?.noul ?? 0);
    } catch (err) {
      console.error("JEV typesafe supersede check failed:", String(err));
      return 0;
    }
  }
  try {
    const text = await chat(
      env,
      "You judge whether one memory supersedes another. Reply with only a number between 0 and 1, no prose.",
      `Existing memory:\n${existing}\n\nIncoming memory:\n${incoming}\n\nProbability (0..1) that the incoming memory replaces or contradicts the existing one, so the existing should no longer be used.`,
    );
    const parsed = firstJson<number>(text);
    const n = typeof parsed === "number" ? parsed : Number((text.match(/0?\.\d+|\d/g) || ["0"])[0]);
    return clamp01(n);
  } catch (err) {
    console.error("JEV workers-ai supersede check failed:", String(err));
    return 0;
  }
}
