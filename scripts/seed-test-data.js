// scripts/seed-test-data.js
//
// Inserts a large batch of realistic test transactions into the same SQLite
// database file the Electron app uses, so you can check that the ledger
// table (with pagination) and the Reports page stay fast at scale.
//
// Usage:
//   node scripts/seed-test-data.js
//
// Safe to run multiple times — it just adds more transactions each time,
// it does not delete or reset anything.

import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import sqlite3pkg from 'sqlite3';

const sqlite3 = sqlite3pkg.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirrors Electron's app.getPath('userData') on Windows:
// %APPDATA%\<app-name>\<db-file>
const APP_NAME = 'kts-wool-inventory';
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', APP_NAME, `${APP_NAME}.db`);

console.log('Using database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not open database. Is the app closed? Error:', err.message);
    process.exit(1);
  }
});

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

const BUYERS = ['Japan', 'Korea', 'Nepal Textiles', 'Local Market', 'India Export Co'];
const RECEIVERS = ['Ram Bahadur', 'Sita Devi', 'Hari Prasad', 'Gopal Shrestha'];
const DESCRIPTIONS = ['Bulk purchase', 'Regular restock', 'Export order', 'Local sale', 'Weekly issue'];
const ENTRY_TYPES = ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDateWithinLastYear(startOffset, dayIndex) {
  const date = new Date(startOffset);
  date.setDate(date.getDate() + dayIndex);
  return date.toISOString().slice(0, 10);
}

async function ensureTestRawMaterial() {
  const existing = await getAsync(
    "SELECT * FROM raw_materials WHERE name = 'TEST SEED - Bulk Wool'"
  );
  if (existing) return existing;

  const result = await runAsync(
    "INSERT INTO raw_materials (name, unit) VALUES (?, ?)",
    ['TEST SEED - Bulk Wool', 'kg']
  );
  return getAsync('SELECT * FROM raw_materials WHERE id = ?', [result.id]);
}

async function seedTransactions(entityType, entityId, count) {
  console.log(`Inserting ${count} transactions for ${entityType} #${entityId}...`);

  const latest = await getAsync(
    'SELECT date, balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
    [entityType, entityId]
  );

  let runningBalance = latest ? latest.balance : 0;
  const baseDate = new Date('2024-01-01').getTime();

  await runAsync('BEGIN TRANSACTION');

  const stmt = db.prepare(`
    INSERT INTO transactions
      (entity_type, entity_id, entry_type, date, description, buyer, lot_no, rack_no, receiver, issue, receive, balance, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < count; i++) {
    const entryType = randomFrom(ENTRY_TYPES);
    const isReceive = Math.random() > 0.5 && entryType === 'NORMAL';
    const amount = Math.round((Math.random() * 200 + 10) * 100) / 100;

    const issue = isReceive ? 0 : amount;
    const receive = isReceive ? amount : 0;
    runningBalance += receive - issue;

    const date = randomDateWithinLastYear(baseDate, i);

    stmt.run(
      entityType,
      entityId,
      entryType,
      date,
      randomFrom(DESCRIPTIONS),
      randomFrom(BUYERS),
      String(Math.ceil(Math.random() * 500)),
      String(Math.ceil(Math.random() * 100)),
      randomFrom(RECEIVERS),
      issue,
      receive,
      runningBalance,
      i % 50 === 0 ? 'seeded test data' : null
    );

    if (i % 1000 === 0 && i > 0) {
      console.log(`  ...${i} inserted`);
    }
  }

  await new Promise((resolve, reject) => {
    stmt.finalize((err) => (err ? reject(err) : resolve()));
  });

  await runAsync('COMMIT');
}

async function main() {
  const material = await ensureTestRawMaterial();
  console.log(`Using raw material: "${material.name}" (id ${material.id})`);

  const count = Number(process.argv[2]) || 5000;

  await seedTransactions('RAW_MATERIAL', material.id, count);

  const total = await getAsync(
    'SELECT COUNT(*) as count FROM transactions WHERE entity_type = ? AND entity_id = ?',
    ['RAW_MATERIAL', material.id]
  );

  console.log(`\nDone. "${material.name}" now has ${total.count} total transactions.`);
  console.log('Open the app, select "TEST SEED - Bulk Wool" in the sidebar, and check the ledger + Reports page speed.');

  db.close();
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  db.close();
  process.exit(1);
});