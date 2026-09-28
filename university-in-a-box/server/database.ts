import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { ResolvedApplicationConfig, SqliteDatabase } from './config';

export interface DatabaseHandle {
  db: SqliteDatabase;
  close: () => void;
}

export function openDatabase(config: ResolvedApplicationConfig): DatabaseHandle {
  const ownsConnection = !config.database;
  const db = config.database ?? new Database(config.databasePath);

  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!db.memory) db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  return {
    db,
    close: () => {
      if (ownsConnection && db.open) db.close();
    },
  };
}

const APPLICATION_MIGRATIONS = [
  {
    id: '001_application',
    sql: readFileSync(new URL('./migrations/001_application.sql', import.meta.url), 'utf8'),
  },
  {
    id: '002_support_ticket_replies',
    sql: readFileSync(new URL('./migrations/002_support_ticket_replies.sql', import.meta.url), 'utf8'),
  },
] as const;

export function runApplicationMigrations(db: SqliteDatabase, appliedAt: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS application_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const hasMigration = db.prepare('SELECT 1 FROM application_migrations WHERE id = ?');
  const recordMigration = db.prepare(
    'INSERT INTO application_migrations (id, applied_at) VALUES (?, ?)',
  );

  for (const migration of APPLICATION_MIGRATIONS) {
    if (hasMigration.get(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      recordMigration.run(migration.id, appliedAt);
    })();
  }
}
