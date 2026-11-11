-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
-- DGUI_HMEM_RULESET_INSTRUCT - task.sql (template copy)
-- SQLite schema for the ruleset-pack execution ledger.
-- Every column that can hold session text carries tag_id so per-user
-- contribution to Train + corpus is attributable (see DGUI_HMEM_RULESET.md §5).

PRAGMA journal_mode = WAL;

-- Session-state persistence for the ADE/IDE the harness attaches to.
CREATE TABLE IF NOT EXISTS agent_memory (
  msg_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT    NOT NULL,
  sender    TEXT    NOT NULL DEFAULT 'agent',
  role      TEXT    NOT NULL,                     -- user | assistant | tool | system
  payload   TEXT    NOT NULL,                     -- free text or tool-call JSON
  embedding BLOB,                                 -- optional 768-d bge-base-en-v1.5 blob
  tag_id    TEXT,                                 -- u_<hex> attribution tag (ruleset §5)
  ts        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Task-level audit rows.
CREATE TABLE IF NOT EXISTS task_meta (
  task_id     TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',       -- open | active | blocked | closed
  sdk_consent INTEGER NOT NULL DEFAULT 0,         -- explicit user consent for the SDK feature
  jev_mode    INTEGER NOT NULL DEFAULT 0,         -- 1 only when JEV_API_KEY was present
  started_at  INTEGER,
  closed_at   INTEGER
);

-- Append-only trail of every stage transition.
CREATE TABLE IF NOT EXISTS task_audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT    NOT NULL,
  event     TEXT    NOT NULL,                     -- setup|consent|run|record|verify|close
  detail    TEXT,
  at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_task ON agent_memory(task_id, ts);
CREATE INDEX IF NOT EXISTS idx_agent_memory_tag  ON agent_memory(tag_id);
CREATE INDEX IF NOT EXISTS idx_task_audit_task   ON task_audit(task_id, at);