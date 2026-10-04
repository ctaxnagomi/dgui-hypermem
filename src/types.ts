export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  JEV_MODE: string;
  JEV_MODEL: string;
  JEV_ENDPOINT: string;
  EMBED_MODEL: string;
  FALLBACK_MODEL: string;
  DEFAULT_SCOPE: string;
  SALIENCE_GATE?: number | string;
  TYPESAFE_API_KEY?: string;
  MCP_TOKEN?: string;
  HF_TOKEN?: string;
  HF_DATASET?: string;
  PASSKEY?: string;
  MASTER_PASSKEY?: string;
  ADMIN_PASSKEY_2?: string;
  /** Base32 TOTP secret for admin 2FA (Google Authenticator). Write-only. */
  ADMIN_TOTP_SECRET?: string;
  /** HMAC secret that signs admin session tokens. Write-only. */
  ADMIN_SESSION_SECRET?: string;
  GITHUB_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  OPENAI_APPS_CHALLENGE?: string;
  MAINTENANCE?: string;
  STAGING?: string;
  ADMIN_HOST?: string;
}

export type MemoryStatus = "active" | "low_signal" | "superseded" | "deleted";

export interface MemoryRow {
  id: string;
  scope: string;
  content: string;
  memory_type: string | null;
  tags: string;
  salience: number | null;
  durable: number | null;
  confidence: number | null;
  type_probabilities: string | null;
  source: string | null;
  hash: string;
  status: MemoryStatus;
  superseded_by: string | null;
  access_count: number;
  last_accessed_at: number | null;
  created_at: number;
  updated_at: number;
  provider?: string | null;
  origin_system?: string | null;
  corpus_type?: string | null;
  client_id?: string | null;
  user_id?: string | null;
  metadata?: string | null;
}

export interface Memory {
  id: string;
  scope: string;
  content: string;
  memory_type: string | null;
  tags: string[];
  salience: number | null;
  durable: number | null;
  confidence: number | null;
  source: string | null;
  status: MemoryStatus;
  superseded_by: string | null;
  access_count: number;
  created_at: number;
  updated_at: number;
  provider?: string | null;
  origin_system?: string | null;
  corpus_type?: string | null;
  client_id?: string | null;
  user_id?: string | null;
  metadata?: any;
}

export interface ScoredMemory extends Memory {
  score: number;
  fused_score: number;
  jev_score: number | null;
  vector_rank: number | null;
  keyword_rank: number | null;
}

export interface MemoryAnalysis {
  memory_type: string;
  type_probabilities: Record<string, number> | null;
  durable: number;
  salience: number;
  confidence: number | null;
  provider: "typesafe" | "workers-ai" | "off";
}
