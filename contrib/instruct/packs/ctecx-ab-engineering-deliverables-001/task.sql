-- task.sql - ctecx_instruct persistence part
-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
-- format: ctecx_instruct@1 - wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
-- task_id: ctecx-ab-engineering-deliverables-001
-- Flavour: SQLite (portable). PostgreSQL variant: swap JSONB for JSON, add COLLATE none.

PRAGMA journal_mode = WAL;

-- Agent memory: the conversation/decision store an ADE or IDE attaches to.
CREATE TABLE IF NOT EXISTS agent_memory (
  msg_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT    NOT NULL,
  sender     TEXT    NOT NULL,            -- 'human' | 'agent' | 'tool'
  role       TEXT    NOT NULL,            -- 'think' | 'act' | 'observe' | 'verify'
  payload    TEXT    NOT NULL,            -- JSON-encoded message
  embedding  TEXT,                        -- JSON-encoded float vector (model-agnostic)
  ts         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_task ON agent_memory (task_id, ts);

-- Task metadata + audit trail.
CREATE TABLE IF NOT EXISTS task_meta (
  task_id    TEXT PRIMARY KEY,
  owner      TEXT NOT NULL DEFAULT 'wan mohd azizi bin wan hosen, ctaxnagomi, est 2024',
  status     TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | blocked | closed
  params     TEXT NOT NULL DEFAULT '{}',     -- JSON
  started_at TEXT,
  closed_at  TEXT
);

CREATE TABLE IF NOT EXISTS task_audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action  TEXT NOT NULL,                     -- e.g. 'opened' | 'step_done' | 'closed'
  detail  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_task_audit ON task_audit (task_id, at);

-- Convenience: open a task. params records the skill and the format owner.
INSERT OR IGNORE INTO task_meta (task_id, owner, status, params, started_at)
VALUES ('ctecx-ab-engineering-deliverables-001',
        'wan mohd azizi bin wan hosen, ctaxnagomi, est 2024',
        'open', '{"skill": "ab-engineering-deliverables", "format_owner": "wan mohd azizi bin wan hosen, ctaxnagomi, est 2024"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
