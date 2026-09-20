-- Token management for the mini CRM
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  github_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_email ON tokens(email);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);