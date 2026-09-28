import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { copyVerifiedDatabase, replyToTicket } from './operations';

const directories: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'japanese-ops-'));
  directories.push(path);
  return path;
}
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('production data operations', () => {
  it('backs up committed WAL data, restores to a new file and keeps the copy private', async () => {
    const root = directory();
    const source = join(root, 'source.sqlite');
    const db = new Database(source);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE learning (id TEXT PRIMARY KEY, text TEXT)');
    db.prepare('INSERT INTO learning VALUES (?, ?)').run('sample', 'わたしはあきです。');
    const backup = join(root, 'backups', 'copy.sqlite');
    const restored = join(root, 'restored.sqlite');
    try {
      await copyVerifiedDatabase(source, backup);
      db.prepare('UPDATE learning SET text = ?').run('new version');
      await copyVerifiedDatabase(backup, restored);
      const copy = new Database(restored);
      try { expect(copy.prepare('SELECT text FROM learning').get()).toEqual({ text: 'わたしはあきです。' }); }
      finally { copy.close(); }
      expect(statSync(backup).mode & 0o777).toBe(0o600);
      await expect(copyVerifiedDatabase(source, backup)).rejects.toThrow('new file');
      await expect(copyVerifiedDatabase(source, source)).rejects.toThrow('new file');
    } finally { db.close(); }
  });

  it('only updates the named support ticket and never inserts a missing one', () => {
    const path = join(directory(), 'support.sqlite');
    const db = new Database(path);
    db.exec('CREATE TABLE support_tickets (id TEXT PRIMARY KEY, reply TEXT, replied_at TEXT, status TEXT)');
    db.exec("INSERT INTO support_tickets (id, status) VALUES ('one', 'open'), ('two', 'open')");
    try {
      replyToTicket(path, 'one', ' Спасибо, уточнение добавлено. ');
      expect(db.prepare('SELECT reply, status FROM support_tickets WHERE id = ?').get('one')).toEqual({ reply: 'Спасибо, уточнение добавлено.', status: 'closed' });
      expect(db.prepare('SELECT reply, status FROM support_tickets WHERE id = ?').get('two')).toEqual({ reply: null, status: 'open' });
      expect(() => replyToTicket(path, 'missing', 'answer')).toThrow('not found');
      expect(() => replyToTicket(path, 'one', ' ')).toThrow('between 1 and 5000');
    } finally { db.close(); }
  });
});
