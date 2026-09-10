// scripts/seed-test-data.js
//
// Inserts a large batch of realistic test transactions into the same SQLite
// database file the Electron app uses, so you can check that the ledger
// table (with pagination) and the Reports page stay fast at scale.
//
// Schema note (2026-09): the transactions table was rebuilt for the dye /
// knitting distribution workflow (order_no, receive_from_dye,
// knitting_distribution, return_qty, assorted, wastage — issue/receive/
// receiver are gone). This script generates data for the new columns.
//
// Usage:
//   node scripts/seed-test-data.js
//   node scripts/seed-test-data.js --codes        (seeds MS-1..MS-1000 color codes instead)
//   node scripts/seed-test-data.js 5000 --codes    (custom bulk count AND seed color codes)
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
const DESCRIPTIONS = ['Bulk purchase', 'Regular restock', 'Export order', 'Local sale', 'Weekly issue'];
const ENTRY_TYPES = ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT'];
const ORDER_PREFIXES = ['JP', 'KR', 'CN', 'IN', 'LOCAL'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomOrderNo(dayIndex) {
  return `${randomFrom(ORDER_PREFIXES)}-2026-${String((dayIndex % 900) + 100)}`;
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

// Generates one transaction's worth of the three balance-affecting fields
// (receive_from_dye, knitting_distribution, return_qty) plus the two
// display-only fields (assorted, wastage), following the same "roughly one
// dominant movement per entry" shape the old issue/receive data had.
function randomEntryAmounts(entryType) {
  const isReceive = Math.random() > 0.55 && entryType === 'NORMAL';
  const amount = Math.round((Math.random() * 200 + 10) * 100) / 100;

  const receiveFromDye = isReceive ? amount : 0;
  const knittingDistribution = !isReceive ? amount : 0;

  // Returns, assorted, and wastage are occasional secondary amounts, not
  // present on every row — mirrors how a real ledger entry usually has one
  // primary movement and only sometimes a return/assorted/wastage note.
  const returnQty = Math.random() < 0.15 ? Math.round(Math.random() * 40 * 100) / 100 : 0;
  const assorted = Math.random() < 0.1 ? Math.round(Math.random() * 15 * 100) / 100 : 0;
  const wastage = entryType === 'DRYING_LOSS' || Math.random() < 0.08
    ? Math.round(Math.random() * 10 * 100) / 100
    : 0;

  return { receiveFromDye, knittingDistribution, returnQty, assorted, wastage };
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
      (entity_type, entity_id, entry_type, date, description, buyer, order_no, lot_no, rack_no,
       receive_from_dye, knitting_distribution, return_qty, balance, assorted, wastage, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < count; i++) {
    const entryType = randomFrom(ENTRY_TYPES);
    const { receiveFromDye, knittingDistribution, returnQty, assorted, wastage } =
      randomEntryAmounts(entryType);

    runningBalance += receiveFromDye - knittingDistribution + returnQty;

    const date = randomDateWithinLastYear(baseDate, i);

    stmt.run(
      entityType,
      entityId,
      entryType,
      date,
      randomFrom(DESCRIPTIONS),
      randomFrom(BUYERS),
      randomOrderNo(i),
      String(Math.ceil(Math.random() * 500)),
      String(Math.ceil(Math.random() * 100)),
      receiveFromDye,
      knittingDistribution,
      returnQty,
      runningBalance,
      assorted,
      wastage,
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

// ---------------------------------------------------------------------
// Color code seeding (MS-1 .. MS-1000), for testing CodeSubNav + the
// color-code ledger view at scale.
// ---------------------------------------------------------------------

async function ensureColorTestRawMaterial() {
  const existing = await getAsync(
    "SELECT * FROM raw_materials WHERE name = 'TEST SEED - Color Codes'"
  );
  if (existing) return existing;

  const result = await runAsync(
    "INSERT INTO raw_materials (name, unit) VALUES (?, ?)",
    ['TEST SEED - Color Codes', 'kg']
  );
  return getAsync('SELECT * FROM raw_materials WHERE id = ?', [result.id]);
}

async function ensureColorCode(rawMaterialId, code) {
  const existing = await getAsync(
    'SELECT * FROM material_codes WHERE raw_material_id = ? AND code = ?',
    [rawMaterialId, code]
  );
  if (existing) return existing;

  const result = await runAsync(
    'INSERT INTO material_codes (raw_material_id, code) VALUES (?, ?)',
    [rawMaterialId, code]
  );
  return getAsync('SELECT * FROM material_codes WHERE id = ?', [result.id]);
}

async function seedColorCodeTransactions(colorCodeId, count) {
  const latest = await getAsync(
    'SELECT date, balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
    ['COLOR_CODE', colorCodeId]
  );

  let runningBalance = latest ? latest.balance : 0;
  const baseDate = new Date('2024-01-01').getTime();

  const stmt = db.prepare(`
    INSERT INTO transactions
      (entity_type, entity_id, entry_type, date, description, buyer, order_no, lot_no, rack_no,
       receive_from_dye, knitting_distribution, return_qty, balance, assorted, wastage, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < count; i++) {
    const entryType = randomFrom(ENTRY_TYPES);
    const { receiveFromDye, knittingDistribution, returnQty, assorted, wastage } =
      randomEntryAmounts(entryType);

    runningBalance += receiveFromDye - knittingDistribution + returnQty;

    const date = randomDateWithinLastYear(baseDate, randomInt(0, 600));

    stmt.run(
      'COLOR_CODE',
      colorCodeId,
      entryType,
      date,
      randomFrom(DESCRIPTIONS),
      randomFrom(BUYERS),
      randomOrderNo(i),
      String(Math.ceil(Math.random() * 500)),
      String(Math.ceil(Math.random() * 100)),
      receiveFromDye,
      knittingDistribution,
      returnQty,
      runningBalance,
      assorted,
      wastage,
      i === 0 ? 'seeded test data' : null
    );
  }

  await new Promise((resolve, reject) => {
    stmt.finalize((err) => (err ? reject(err) : resolve()));
  });
}

async function seedColorCodes() {
  const material = await ensureColorTestRawMaterial();
  console.log(`Using raw material: "${material.name}" (id ${material.id})`);
  console.log('Seeding color codes MS-1 through MS-1000, each with 1-5 random transactions...');

  await runAsync('BEGIN TRANSACTION');

  let totalTransactions = 0;

  for (let n = 1; n <= 1000; n++) {
    const code = `MS-${n}`;
    const colorCode = await ensureColorCode(material.id, code);

    const txnCount = randomInt(1, 5);
    await seedColorCodeTransactions(colorCode.id, txnCount);
    totalTransactions += txnCount;

    if (n % 100 === 0) {
      console.log(`  ...${n} color codes done (${totalTransactions} transactions so far)`);
    }
  }

  await runAsync('COMMIT');

  console.log(`\nDone. Seeded 1000 color codes (MS-1..MS-1000) under "${material.name}"`);
  console.log(`Total transactions inserted: ${totalTransactions}`);
  console.log('Open the app, select "TEST SEED - Color Codes" in the sidebar, and check the color code pill list + ledger.');
}

async function main() {
  const args = process.argv.slice(2);
  const seedCodes = args.includes('--codes');
  const numericArg = args.find((a) => /^\d+$/.test(a));
  const count = numericArg ? Number(numericArg) : 5000;

  if (seedCodes) {
    await seedColorCodes();
  } else {
    const material = await ensureTestRawMaterial();
    console.log(`Using raw material: "${material.name}" (id ${material.id})`);

    await seedTransactions('RAW_MATERIAL', material.id, count);

    const total = await getAsync(
      'SELECT COUNT(*) as count FROM transactions WHERE entity_type = ? AND entity_id = ?',
      ['RAW_MATERIAL', material.id]
    );

    console.log(`\nDone. "${material.name}" now has ${total.count} total transactions.`);
    console.log('Open the app, select "TEST SEED - Bulk Wool" in the sidebar, and check the ledger + Reports page speed.');
  }

  db.close();
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  db.close();
  process.exit(1);
});