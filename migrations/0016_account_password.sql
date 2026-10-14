-- Password credentials on existing token accounts (applied at runtime via worker/src/db.js COLUMNS).
ALTER TABLE accounts ADD COLUMN password_hash TEXT;
ALTER TABLE accounts ADD COLUMN password_salt TEXT;
ALTER TABLE accounts ADD COLUMN recovery_hash TEXT;
ALTER TABLE accounts ADD COLUMN email TEXT;
ALTER TABLE accounts ADD COLUMN login_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN login_lock_until INTEGER;
