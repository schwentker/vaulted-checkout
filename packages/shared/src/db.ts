import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';
export function openDatabase(path: string) {
  const db = new Database(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
