-- CRM activity log
CREATE TABLE IF NOT EXISTS crm_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_logs_email ON crm_logs(email);
CREATE INDEX IF NOT EXISTS idx_crm_logs_action ON crm_logs(action);
CREATE INDEX IF NOT EXISTS idx_crm_logs_created ON crm_logs(created_at);
