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


CREATE TABLE IF NOT EXISTS sync_pairing (
  session_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_vaults (
  id TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_records (
  vault_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  iv TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT,
  PRIMARY KEY (vault_id, collection, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_records_version
ON sync_records(vault_id, version);

CREATE TABLE IF NOT EXISTS sync_record_chunks (
  vault_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (vault_id, collection, record_id, chunk_index)
);
