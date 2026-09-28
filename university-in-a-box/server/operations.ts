import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

function isHealthy(db: Database.Database): boolean {
  const violations = db.pragma('foreign_key_check');
  return db.pragma('integrity_check', { simple: true }) === 'ok' && Array.isArray(violations) && violations.length === 0;
}

export async function copyVerifiedDatabase(source: string, destination: string): Promise<void> {
  if (resolve(source) === resolve(destination) || existsSync(destination)) {
    throw new Error('Destination must be a new file. Existing databases are never overwritten.');
  }
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (!isHealthy(db)) {
      throw new Error('Database integrity check failed. No backup was created.');
    }
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    closeSync(openSync(destination, 'wx', 0o600));
    await db.backup(destination);
    chmodSync(destination, 0o600);
    const copy = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      if (!isHealthy(copy)) {
        throw new Error('Copied database failed verification. Do not use it for recovery.');
      }
    } finally { copy.close(); }
  } finally { db.close(); }
}

export function replyToTicket(databasePath: string, id: string, reply: string) {
  const body = reply.trim();
  if (!body || body.length > 5_000) throw new Error('Reply must contain between 1 and 5000 characters.');
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const result = db.prepare("UPDATE support_tickets SET reply = ?, replied_at = ?, status = 'closed' WHERE id = ?").run(body, new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('Ticket not found.');
  } finally { db.close(); }
}
