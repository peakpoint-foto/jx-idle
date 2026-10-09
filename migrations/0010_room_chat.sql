CREATE TABLE IF NOT EXISTS room_chat(
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'room',
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS room_chat_scope_room_time ON room_chat(scope,room_id,created_at DESC);
