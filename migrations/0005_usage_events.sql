-- Usage stats tracking per token
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  email TEXT NOT NULL,
  path TEXT NOT NULL,
  event_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_token ON usage_events(token);
CREATE INDEX IF NOT EXISTS idx_usage_events_email ON usage_events(email);
CREATE INDEX IF NOT EXISTS idx_usage_events_at ON usage_events(event_at);