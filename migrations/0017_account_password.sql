-- 0017: Password credentials on existing token accounts (runtime also via worker/src/db.js COLUMNS).
ALTER TABLE accounts ADD COLUMN password_hash TEXT;
ALTER TABLE accounts ADD COLUMN password_salt TEXT;
ALTER TABLE accounts ADD COLUMN recovery_hash TEXT;
ALTER TABLE accounts ADD COLUMN email TEXT;
ALTER TABLE accounts ADD COLUMN login_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN login_lock_until INTEGER;
ALTER TABLE accounts ADD COLUMN password_iter INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE accounts ADD COLUMN revoked_token_hash TEXT;
