// Suggest relevant memories/triggers based on context
import type { Env, ScoredMemory } from "./types";
import { searchMemories } from "./store";

export interface Suggestion {
  type: "repeat_detected" | "related_memory" | "gen_idle_candidate";
  reason: string;
  memory?: ScoredMemory;
  confidence: number;
}

export async function getSuggestions(
  env: Env,
  context: { query?: string; content?: string; user_id?: string | null },
  limit: number = 3
): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];
  const q = context.query || context.content || "";
  
  if (!q || q.length < 5) return suggestions;
  
  const results = await searchMemories(env, q, { limit: 5, useJev: false });
  
  for (const r of results) {
    if (r.score > 0.85) {
      suggestions.push({
        type: "repeat_detected",
        reason: "Similar content found in corpus - this task/solution may already exist",
        memory: r,
        confidence: r.score,
      });
    } else if (r.score > 0.6) {
      suggestions.push({
        type: "related_memory",
        reason: "Related memory in universal corpus could help with context",
        memory: r,
        confidence: r.score,
      });
    }
  }
  
  // Add gen_idle candidate if no high-confidence match and content is useful
  if (suggestions.length === 0) {
    suggestions.push({
      type: "gen_idle_candidate",
      reason: "No direct match found; consider storing as Gen Idle candidate for future universal corpus enrichment",
      confidence: 0.4,
    });
  }
  
  return suggestions.slice(0, limit);
}
