CREATE TABLE IF NOT EXISTS friendships(a TEXT NOT NULL,b TEXT NOT NULL,requester TEXT NOT NULL,status TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(a,b));
CREATE INDEX IF NOT EXISTS friendships_recipient ON friendships(b,status,expires_at);
CREATE TABLE IF NOT EXISTS room_invites(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS room_invites_recipient ON room_invites(recipient_id,status,expires_at);
CREATE TABLE IF NOT EXISTS lobby_rooms(room_id TEXT PRIMARY KEY,objective TEXT NOT NULL DEFAULT 'farm',revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS lobby_members(room_id TEXT NOT NULL,account_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'damage',ready INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,account_id));
