/**
 * Canonical SQLite DDL for a future native driver (Tauri `rusqlite` / `sqlx`, Node `better-sqlite3`).
 * Not executed in the browser bundle; keeps migrations reviewable and portable.
 */
export const SQLITE_OFFLINE_MIGRATION_V1 = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS outbox_operations (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  idempotency_key TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  base_server_version INTEGER,
  payload_json TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_operations (tenant_id, status, next_attempt_at_ms);

CREATE TABLE IF NOT EXISTS sync_cursors (
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_pulled_at_ms INTEGER NOT NULL,
  server_cursor TEXT NOT NULL,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS local_entities (
  tenant_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  local_id TEXT NOT NULL,
  server_id TEXT,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, entity_kind, local_id)
);
`;
