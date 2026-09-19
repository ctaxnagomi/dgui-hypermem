-- DGUI-HyperMem (DeckerGUI HyperMemory) - initial schema
-- Hybrid store: D1 rows + FTS5 keyword index + Vectorize vectors (768d, bge-base-en-v1.5).

CREATE TABLE IF NOT EXISTS memories (
  id               TEXT PRIMARY KEY,
  scope            TEXT NOT NULL DEFAULT 'default',
  content          TEXT NOT NULL,
  memory_type      TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  salience         REAL,
  durable          REAL,
  confidence       REAL,
  type_probabilities TEXT,
  source           TEXT,
  hash             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  superseded_by    TEXT,
  access_count     INTEGER NOT NULL DEFAULT 0,
  last_accessed_at INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_scope_hash ON memories (scope, hash);
CREATE INDEX IF NOT EXISTS idx_memories_scope_created ON memories (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_scope_status ON memories (scope, status);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (memory_type);

-- Keyword (BM25) side of hybrid retrieval. External-content FTS5 kept in sync by triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  tags,
  memory_type,
  content='memories',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts (rowid, content, tags, memory_type)
  VALUES (new.rowid, new.content, new.tags, new.memory_type);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content, tags, memory_type)
  VALUES ('delete', old.rowid, old.content, old.tags, old.memory_type);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content, tags, memory_type)
  VALUES ('delete', old.rowid, old.content, old.tags, old.memory_type);
  INSERT INTO memories_fts (rowid, content, tags, memory_type)
  VALUES (new.rowid, new.content, new.tags, new.memory_type);
END;

-- Audit trail of every write/search so recall quality can be inspected later.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  memory_id  TEXT,
  query      TEXT,
  detail     TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_scope_created ON events (scope, created_at DESC);
