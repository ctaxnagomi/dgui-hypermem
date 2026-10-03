-- Admin TOTP enrollment state.
-- Single-row table (id = 1): once enrolled_at is set, admin login requires
-- a TOTP code in addition to the master passkey. NULL means TOTP is not yet
-- enrolled and the first verified code completes the enrollment.
CREATE TABLE IF NOT EXISTS admin_totp (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enrolled_at INTEGER
);

INSERT INTO admin_totp (id, enrolled_at) VALUES (1, NULL)
  ON CONFLICT(id) DO NOTHING;