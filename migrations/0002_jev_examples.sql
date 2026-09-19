CREATE TABLE IF NOT EXISTS jev_examples (
  id          TEXT PRIMARY KEY,
  use_case    TEXT NOT NULL,
  payload     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | uploaded | error
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  INTEGER NOT NULL,
  uploaded_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jev_examples_status ON jev_examples (status, created_at);