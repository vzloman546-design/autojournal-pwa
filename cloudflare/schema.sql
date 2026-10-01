PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_sessions (
  id TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  sender TEXT,
  total_chunks INTEGER,
  iv TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, chunk_index),
  FOREIGN KEY (session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_expires ON sync_sessions(expires_at);
