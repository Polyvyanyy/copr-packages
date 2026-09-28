import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { copyVerifiedDatabase, replyToTicket } from './operations';

if (existsSync('.env')) process.loadEnvFile('.env');
process.umask(0o077);
const [command, ...args] = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function required(name: string) {
  const value = option(name);
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`);
  return value;
}
const databasePath = resolve(process.env.DATABASE_PATH ?? process.env.DATABASE_URL ?? resolve(process.env.APP_DATA_DIR ?? 'server/data', 'university-in-a-box.sqlite'));

async function run() {
  if (command === 'backup' || command === 'restore') {
    const source = command === 'restore' ? required('--from') : databasePath;
    await copyVerifiedDatabase(source, resolve(required('--to')));
    console.info('Verified private database copy created. Recovery never replaces a running database.');
  } else if (command === 'support-list') {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      console.info(JSON.stringify(db.prepare('SELECT id, category, status, created_at FROM support_tickets ORDER BY created_at DESC LIMIT 100').all(), null, 2));
    } finally { db.close(); }
  } else if (command === 'support-read') {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const ticket = db.prepare('SELECT id, category, message, status, created_at, reply, replied_at FROM support_tickets WHERE id = ?').get(required('--id'));
      if (!ticket) throw new Error('Ticket not found.');
      writeFileSync(required('--to'), JSON.stringify(ticket, null, 2), { mode: 0o600, flag: 'wx' });
      console.info('Ticket written to a private file. Do not share it publicly.');
    } finally { db.close(); }
  } else if (command === 'support-reply') {
    replyToTicket(databasePath, required('--id'), readFileSync(required('--file'), 'utf8'));
    console.info('Reply saved and visible to the account owner.');
  } else {
    throw new Error('Use backup --to FILE; restore --from FILE --to NEW_FILE; support-list; support-read --id ID --to NEW_FILE; support-reply --id ID --file FILE.');
  }
}
void run().catch(() => {
  console.error('Operation failed; check the private database and file permissions.');
  process.exitCode = 1;
});
