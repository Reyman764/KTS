import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sqlite3pkg from 'sqlite3';

const sqlite3 = sqlite3pkg.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const dbPath = path.join(app.getPath('userData'), 'kts-wool-inventory.db');
const backupsDir = path.join(app.getPath('userData'), 'backups');
let db;

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
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

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');

        db.run(`
          CREATE TABLE IF NOT EXISTS raw_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            unit TEXT NOT NULL DEFAULT 'kg',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS material_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_material_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
            UNIQUE (raw_material_id, code)
          )
        `);

        // ------------------------------------------------------------------
        // transactions: rebuilt for the dye/knitting distribution workflow.
        //
        // Schema note (2026-09): this replaced the earlier issue/receive/
        // receiver ledger structure. The one-time `DROP TABLE IF EXISTS
        // transactions` used to perform that migration has been removed —
        // it was wiping the whole ledger on every app restart, not just
        // once. Do not reintroduce it here; any future schema change to
        // this table needs a real migration, not a drop-and-recreate.
        //
        // Schema note (2026-09, fiscal year closure): entry_type gained
        // 'BALANCE_BROUGHT_DOWN' for the opening row a year-end closure
        // inserts. CREATE TABLE IF NOT EXISTS only applies this constraint
        // to brand-new databases — existing databases are migrated by
        // migrateEntryTypeConstraint(), run once after this function
        // resolves.
        // ------------------------------------------------------------------
        db.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('RAW_MATERIAL', 'COLOR_CODE')),
            entity_id INTEGER NOT NULL,
            entry_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT', 'BALANCE_BROUGHT_DOWN')),
            date TEXT NOT NULL,
            description TEXT,
            buyer TEXT,
            order_no TEXT,
            lot_no TEXT,
            rack_no TEXT,
            receive_from_dye REAL NOT NULL DEFAULT 0,
            knitting_distribution REAL NOT NULL DEFAULT 0,
            return_qty REAL NOT NULL DEFAULT 0,
            balance REAL NOT NULL DEFAULT 0,
            assorted REAL NOT NULL DEFAULT 0,
            wastage REAL NOT NULL DEFAULT 0,
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);

        db.run('CREATE INDEX IF NOT EXISTS idx_codes_raw_material ON material_codes(raw_material_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_txn_entity ON transactions(entity_type, entity_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date)');

        // ------------------------------------------------------------------
        // quick_options: saved values for the Description / Buyer / Rack No
        // / Lot No / Order No combo-box fields on the ledger entry form, so
        // repeated values can be picked instead of retyped (avoiding typos
        // on names that recur constantly, like buyer or rack). Shared
        // globally across all raw materials and color codes, not scoped
        // per entity. `field` identifies which form field a value belongs
        // to.
        // ------------------------------------------------------------------
        db.run(`
          CREATE TABLE IF NOT EXISTS quick_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field TEXT NOT NULL CHECK (field IN ('description', 'buyer', 'rack_no', 'lot_no', 'order_no')),
            value TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (field, value)
          )
        `);

        db.run('CREATE INDEX IF NOT EXISTS idx_quick_options_field ON quick_options(field)');

        // ------------------------------------------------------------------
        // Fiscal year closure ("Balance Brought Down"): once a year, every
        // raw material and color code's transaction history for that year
        // is moved out of the live `transactions` table into
        // `archived_transactions` (frozen, read-only record), and the live
        // table is left with exactly one new opening row per entity
        // carrying its ending balance forward — mirroring how a physical
        // ledger book closes one year's pages and starts a fresh page next
        // year headed "Balance Brought Down".
        // ------------------------------------------------------------------
        db.run(`
          CREATE TABLE IF NOT EXISTS fiscal_year_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            closed_at TEXT NOT NULL DEFAULT (datetime('now')),
            entity_count INTEGER NOT NULL DEFAULT 0,
            transaction_count INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT
          )
        `);

        // Same shape as `transactions`, plus which closure archived the
        // row and under what fiscal year label — deliberately NOT
        // foreign-keyed to raw_materials/material_codes with ON DELETE
        // CASCADE, since archived history must survive even if the live
        // entity is later deleted.
        db.run(`
          CREATE TABLE IF NOT EXISTS archived_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            closure_id INTEGER NOT NULL,
            fiscal_year_label TEXT NOT NULL,
            original_transaction_id INTEGER,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('RAW_MATERIAL', 'COLOR_CODE')),
            entity_id INTEGER NOT NULL,
            entry_type TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            buyer TEXT,
            order_no TEXT,
            lot_no TEXT,
            rack_no TEXT,
            receive_from_dye REAL NOT NULL DEFAULT 0,
            knitting_distribution REAL NOT NULL DEFAULT 0,
            return_qty REAL NOT NULL DEFAULT 0,
            balance REAL NOT NULL DEFAULT 0,
            assorted REAL NOT NULL DEFAULT 0,
            wastage REAL NOT NULL DEFAULT 0,
            remark TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (closure_id) REFERENCES fiscal_year_closures(id)
          )
        `);

        db.run('CREATE INDEX IF NOT EXISTS idx_archived_entity ON archived_transactions(entity_type, entity_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_archived_closure ON archived_transactions(closure_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_archived_fiscal_year ON archived_transactions(fiscal_year_label)');

        // Completion marker: db.serialize() queues sqlite3 callback-style
        // statements in order on this connection, so by the time THIS
        // statement's callback fires, every CREATE TABLE/INDEX above has
        // already completed. That's the signal that it's safe to run the
        // async migration next.
        db.run('SELECT 1', (selectErr) => {
          if (selectErr) return reject(selectErr);
          resolve();
        });
      });
    });
  });
}

// One-time migration for databases created before 'BALANCE_BROUGHT_DOWN'
// was added to the entry_type CHECK constraint. SQLite can't ALTER a CHECK
// constraint directly, so this rebuilds the table: create a new table with
// the updated constraint, copy every row across, drop the old table, rename
// the new one into place. Safe to run on every startup — it checks whether
// the constraint already allows the new value first, and does nothing if so.
async function migrateEntryTypeConstraint() {
  const tableInfo = await getAsync(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'"
  );
  if (!tableInfo || tableInfo.sql.includes('BALANCE_BROUGHT_DOWN')) {
    return; // brand-new DB (already correct) or migration already applied
  }

  console.log('Migrating transactions table to allow BALANCE_BROUGHT_DOWN entries...');

  await runAsync('BEGIN TRANSACTION');
  try {
    await runAsync(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('RAW_MATERIAL', 'COLOR_CODE')),
        entity_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT', 'BALANCE_BROUGHT_DOWN')),
        date TEXT NOT NULL,
        description TEXT,
        buyer TEXT,
        order_no TEXT,
        lot_no TEXT,
        rack_no TEXT,
        receive_from_dye REAL NOT NULL DEFAULT 0,
        knitting_distribution REAL NOT NULL DEFAULT 0,
        return_qty REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        assorted REAL NOT NULL DEFAULT 0,
        wastage REAL NOT NULL DEFAULT 0,
        remark TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await runAsync(`
      INSERT INTO transactions_new
      SELECT id, entity_type, entity_id, entry_type, date, description, buyer, order_no, lot_no,
             rack_no, receive_from_dye, knitting_distribution, return_qty, balance, assorted,
             wastage, remark, created_at
      FROM transactions
    `);
    await runAsync('DROP TABLE transactions');
    await runAsync('ALTER TABLE transactions_new RENAME TO transactions');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_txn_entity ON transactions(entity_type, entity_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date)');
    await runAsync('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await runAsync('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  // Raw Materials
  ipcMain.handle('raw-materials:getAll', async () => {
    return allAsync('SELECT * FROM raw_materials ORDER BY name ASC');
  });

  ipcMain.handle('raw-materials:create', async (_event, { name, unit }) => {
    const result = await runAsync(
      'INSERT INTO raw_materials (name, unit) VALUES (?, ?)',
      [name, unit || 'kg']
    );
    return getAsync('SELECT * FROM raw_materials WHERE id = ?', [result.id]);
  });

  ipcMain.handle('raw-materials:update', async (_event, { id, name, unit }) => {
    const existing = await getAsync('SELECT * FROM raw_materials WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Raw material ${id} not found`);
    }
    await runAsync(
      'UPDATE raw_materials SET name = ?, unit = ? WHERE id = ?',
      [name, unit || 'kg', id]
    );
    return getAsync('SELECT * FROM raw_materials WHERE id = ?', [id]);
  });

  // Counts what a raw-material delete would take with it, without deleting
  // anything. Used by the confirm dialog so the user sees real numbers before
  // committing to a cascade.
  ipcMain.handle('raw-materials:getDeleteImpact', async (_event, id) => {
    const codes = await allAsync(
      'SELECT id FROM material_codes WHERE raw_material_id = ?',
      [id]
    );
    const codeIds = codes.map((c) => c.id);

    const rawMaterialTxnRow = await getAsync(
      "SELECT COUNT(*) as count FROM transactions WHERE entity_type = 'RAW_MATERIAL' AND entity_id = ?",
      [id]
    );

    let codeTxnCount = 0;
    if (codeIds.length > 0) {
      const placeholders = codeIds.map(() => '?').join(',');
      const row = await getAsync(
        `SELECT COUNT(*) as count FROM transactions WHERE entity_type = 'COLOR_CODE' AND entity_id IN (${placeholders})`,
        codeIds
      );
      codeTxnCount = row.count;
    }

    return {
      colorCodeCount: codes.length,
      transactionCount: rawMaterialTxnRow.count + codeTxnCount,
    };
  });

  ipcMain.handle('raw-materials:delete', async (_event, id) => {
    const existing = await getAsync('SELECT * FROM raw_materials WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Raw material ${id} not found`);
    }

    const codes = await allAsync(
      'SELECT id FROM material_codes WHERE raw_material_id = ?',
      [id]
    );
    const codeIds = codes.map((c) => c.id);

    await runAsync('BEGIN TRANSACTION');
    try {
      await runAsync(
        "DELETE FROM transactions WHERE entity_type = 'RAW_MATERIAL' AND entity_id = ?",
        [id]
      );
      if (codeIds.length > 0) {
        const placeholders = codeIds.map(() => '?').join(',');
        await runAsync(
          `DELETE FROM transactions WHERE entity_type = 'COLOR_CODE' AND entity_id IN (${placeholders})`,
          codeIds
        );
      }
      // material_codes rows cascade via the FK, but deleting explicitly keeps
      // this path correct even if the FK enforcement pragma is ever off.
      await runAsync('DELETE FROM material_codes WHERE raw_material_id = ?', [id]);
      await runAsync('DELETE FROM raw_materials WHERE id = ?', [id]);
      await runAsync('COMMIT');
    } catch (err) {
      await runAsync('ROLLBACK');
      throw err;
    }

    return { id, deleted: true };
  });

  // Material Codes (Color Codes)
  ipcMain.handle('material-codes:getByRawMaterial', async (_event, rawMaterialId) => {
    return allAsync(
      'SELECT * FROM material_codes WHERE raw_material_id = ? ORDER BY code ASC',
      [rawMaterialId]
    );
  });

  ipcMain.handle('material-codes:create', async (_event, { rawMaterialId, code, description }) => {
    const result = await runAsync(
      'INSERT INTO material_codes (raw_material_id, code, description) VALUES (?, ?, ?)',
      [rawMaterialId, code, description || null]
    );
    return getAsync('SELECT * FROM material_codes WHERE id = ?', [result.id]);
  });

  ipcMain.handle('material-codes:update', async (_event, { id, code, description }) => {
    const existing = await getAsync('SELECT * FROM material_codes WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Material code ${id} not found`);
    }
    await runAsync(
      'UPDATE material_codes SET code = ?, description = ? WHERE id = ?',
      [code, description || null, id]
    );
    return getAsync('SELECT * FROM material_codes WHERE id = ?', [id]);
  });

  ipcMain.handle('material-codes:getDeleteImpact', async (_event, id) => {
    const row = await getAsync(
      "SELECT COUNT(*) as count FROM transactions WHERE entity_type = 'COLOR_CODE' AND entity_id = ?",
      [id]
    );
    return { transactionCount: row.count };
  });

  ipcMain.handle('material-codes:delete', async (_event, id) => {
    const existing = await getAsync('SELECT * FROM material_codes WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Material code ${id} not found`);
    }

    await runAsync('BEGIN TRANSACTION');
    try {
      await runAsync(
        "DELETE FROM transactions WHERE entity_type = 'COLOR_CODE' AND entity_id = ?",
        [id]
      );
      await runAsync('DELETE FROM material_codes WHERE id = ?', [id]);
      await runAsync('COMMIT');
    } catch (err) {
      await runAsync('ROLLBACK');
      throw err;
    }

    return { id, deleted: true };
  });

  // ---------------------------------------------------------------------------
  // Quick options (saved dropdown values for Description / Buyer / Rack No /
  // Lot No / Order No)
  // ---------------------------------------------------------------------------
  ipcMain.handle('quick-options:getAll', async () => {
    return allAsync('SELECT * FROM quick_options ORDER BY field ASC, value COLLATE NOCASE ASC');
  });

  ipcMain.handle('quick-options:create', async (_event, { field, value }) => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      throw new Error('Value cannot be empty');
    }
    const existing = await getAsync(
      'SELECT * FROM quick_options WHERE field = ? AND value = ? COLLATE NOCASE',
      [field, trimmed]
    );
    if (existing) return existing;

    const result = await runAsync(
      'INSERT INTO quick_options (field, value) VALUES (?, ?)',
      [field, trimmed]
    );
    return getAsync('SELECT * FROM quick_options WHERE id = ?', [result.id]);
  });

  ipcMain.handle('quick-options:delete', async (_event, { id }) => {
    const existing = await getAsync('SELECT * FROM quick_options WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Quick option ${id} not found`);
    }
    await runAsync('DELETE FROM quick_options WHERE id = ?', [id]);
    return { id, deleted: true };
  });

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  // Recompute running balances for one entity in chronological order.
  // Called whenever an insert lands out of date order, and always after an
  // update or delete (since either can shift every balance downstream).
  //
  // Balance formula: previous balance + receive_from_dye - knitting_distribution + return_qty
  // assorted and wastage are display-only and never enter this calculation.
  //
  // Performance note: this wraps all row updates in a single explicit
  // transaction. Without it, sqlite3 auto-commits each UPDATE individually,
  // which is fine at a few hundred rows but takes tens of seconds once an
  // entity has tens of thousands of transactions (every delete/update
  // recalculates the whole entity, not just the rows after the change).
  // Batching into one transaction turns that into a single commit.
  function recalcBalances(entityType, entityId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, receive_from_dye, knitting_distribution, return_qty FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date ASC, id ASC',
        [entityType, entityId],
        (err, rows) => {
          if (err) return reject(err);

          if (rows.length === 0) return resolve();

          db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare('UPDATE transactions SET balance = ? WHERE id = ?');
            let running = 0;
            for (const row of rows) {
              running +=
                (row.receive_from_dye || 0) - (row.knitting_distribution || 0) + (row.return_qty || 0);
              stmt.run(running, row.id);
            }

            stmt.finalize((finalizeErr) => {
              if (finalizeErr) {
                db.run('ROLLBACK', () => reject(finalizeErr));
                return;
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) reject(commitErr);
                else resolve();
              });
            });
          });
        }
      );
    });
  }

  ipcMain.handle('transactions:getByEntity', async (_event, { entityType, entityId, startDate, endDate, page, pageSize }) => {
    const conditions = ['entity_type = ?', 'entity_id = ?'];
    const params = [entityType, entityId];

    if (startDate) {
      conditions.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      params.push(endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const totalRow = await getAsync(
      `SELECT COUNT(*) as count FROM transactions ${where}`,
      params
    );

    const limit = pageSize || 100;
    const offset = ((page || 1) - 1) * limit;

    const rows = await allAsync(
      `SELECT * FROM transactions ${where} ORDER BY date ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { rows, total: totalRow.count, page: page || 1, pageSize: limit };
  });

  ipcMain.handle('transactions:create', async (_event, payload) => {
    const {
      entityType,
      entityId,
      entryType,
      date,
      description,
      buyer,
      orderNo,
      lotNo,
      rackNo,
      receiveFromDye,
      knittingDistribution,
      returnQty,
      assorted,
      wastage,
      remark,
    } = payload;

    const receiveFromDyeVal = Number(receiveFromDye) || 0;
    const knittingDistributionVal = Number(knittingDistribution) || 0;
    const returnQtyVal = Number(returnQty) || 0;
    const assortedVal = Number(assorted) || 0;
    const wastageVal = Number(wastage) || 0;

    // Balance gets a placeholder on insert — the real, correct cumulative
    // value is always computed by recalcBalances() right after, for every
    // insert, not just backdated ones. An earlier "is this an append"
    // shortcut tried to skip the recalc when the new row's date looked like
    // it was already the latest, but that comparison only checked the date
    // string (date >= latest.date) and could be true even when the insert
    // wasn't truly last — same-day inserts, or several inserts arriving
    // out of chronological order (e.g. the test-data seed script), could
    // silently skip the recalc and leave every balance from that point on
    // permanently wrong. Always recalculating removes that failure mode;
    // recalcBalances is a single batched transaction, so the cost is small
    // even for entities with tens of thousands of transactions.
    const result = await runAsync(
      `INSERT INTO transactions
        (entity_type, entity_id, entry_type, date, description, buyer, order_no, lot_no, rack_no,
         receive_from_dye, knitting_distribution, return_qty, balance, assorted, wastage, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entityType,
        entityId,
        entryType || 'NORMAL',
        date,
        description || null,
        buyer || null,
        orderNo || null,
        lotNo || null,
        rackNo || null,
        receiveFromDyeVal,
        knittingDistributionVal,
        returnQtyVal,
        0,
        assortedVal,
        wastageVal,
        remark || null,
      ]
    );

    await recalcBalances(entityType, entityId);

    return getAsync('SELECT * FROM transactions WHERE id = ?', [result.id]);
  });

  ipcMain.handle('transactions:update', async (_event, payload) => {
    const {
      id,
      entryType,
      date,
      description,
      buyer,
      orderNo,
      lotNo,
      rackNo,
      receiveFromDye,
      knittingDistribution,
      returnQty,
      assorted,
      wastage,
      remark,
    } = payload;

    const existing = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }

    const receiveFromDyeVal = Number(receiveFromDye) || 0;
    const knittingDistributionVal = Number(knittingDistribution) || 0;
    const returnQtyVal = Number(returnQty) || 0;
    const assortedVal = Number(assorted) || 0;
    const wastageVal = Number(wastage) || 0;

    await runAsync(
      `UPDATE transactions SET
        entry_type = ?, date = ?, description = ?, buyer = ?, order_no = ?, lot_no = ?, rack_no = ?,
        receive_from_dye = ?, knitting_distribution = ?, return_qty = ?, assorted = ?, wastage = ?, remark = ?
       WHERE id = ?`,
      [
        entryType || 'NORMAL',
        date,
        description || null,
        buyer || null,
        orderNo || null,
        lotNo || null,
        rackNo || null,
        receiveFromDyeVal,
        knittingDistributionVal,
        returnQtyVal,
        assortedVal,
        wastageVal,
        remark || null,
        id,
      ]
    );

    // The edited row's date or amounts may have changed its position or
    // effect on the running total — recompute the whole entity's balances
    // rather than trying to reason about which rows are affected.
    await recalcBalances(existing.entity_type, existing.entity_id);

    return getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
  });

  ipcMain.handle('transactions:delete', async (_event, { id }) => {
    const existing = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }

    await runAsync('DELETE FROM transactions WHERE id = ?', [id]);

    // Every balance after the deleted row shifts by its contribution —
    // recompute the whole entity rather than adjusting rows individually.
    await recalcBalances(existing.entity_type, existing.entity_id);

    return { id, deleted: true };
  });

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  // Paginated: used by the on-screen report table so browsing stays fast
  // no matter how many transactions match the filter.
  ipcMain.handle('reports:query', async (_event, { entityType, entityId, startDate, endDate, page, pageSize }) => {
    const conditions = ['entity_type = ?', 'entity_id = ?'];
    const params = [entityType, entityId];

    if (startDate) {
      conditions.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      params.push(endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const totalRow = await getAsync(
      `SELECT COUNT(*) as count FROM transactions ${where}`,
      params
    );

    const limit = pageSize || 200;
    const offset = ((page || 1) - 1) * limit;

    const rows = await allAsync(
      `SELECT * FROM transactions ${where} ORDER BY date ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totals = await getAsync(
      `SELECT
        COALESCE(SUM(CASE WHEN entry_type != 'DRYING_LOSS' THEN receive_from_dye ELSE 0 END), 0) as totalReceivedFromDye,
        COALESCE(SUM(CASE WHEN entry_type != 'DRYING_LOSS' THEN knitting_distribution ELSE 0 END), 0) as totalKnittingDistribution,
        COALESCE(SUM(return_qty), 0) as totalReturnQty,
        COALESCE(SUM(assorted), 0) as totalAssorted,
        COALESCE(SUM(wastage), 0) as totalWastage,
        COALESCE(SUM(CASE WHEN entry_type = 'DRYING_LOSS' THEN knitting_distribution ELSE 0 END), 0) as totalDryingLoss
       FROM transactions ${where}`,
      params
    );

    return { rows, totals, total: totalRow.count, page: page || 1, pageSize: limit };
  });

  // Unpaginated: used only by Export Excel / Export PDF, which genuinely
  // need every matching row. Kept as a separate handler so normal browsing
  // never accidentally triggers a full-table pull.
  ipcMain.handle('reports:queryAll', async (_event, { entityType, entityId, startDate, endDate }) => {
    const conditions = ['entity_type = ?', 'entity_id = ?'];
    const params = [entityType, entityId];

    if (startDate) {
      conditions.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      params.push(endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await allAsync(
      `SELECT * FROM transactions ${where} ORDER BY date ASC, id ASC`,
      params
    );

    const totals = await getAsync(
      `SELECT
        COALESCE(SUM(CASE WHEN entry_type != 'DRYING_LOSS' THEN receive_from_dye ELSE 0 END), 0) as totalReceivedFromDye,
        COALESCE(SUM(CASE WHEN entry_type != 'DRYING_LOSS' THEN knitting_distribution ELSE 0 END), 0) as totalKnittingDistribution,
        COALESCE(SUM(return_qty), 0) as totalReturnQty,
        COALESCE(SUM(assorted), 0) as totalAssorted,
        COALESCE(SUM(wastage), 0) as totalWastage,
        COALESCE(SUM(CASE WHEN entry_type = 'DRYING_LOSS' THEN knitting_distribution ELSE 0 END), 0) as totalDryingLoss
       FROM transactions ${where}`,
      params
    );

    return { rows, totals };
  });

  // ---------------------------------------------------------------------------
  // Cross-entity search report — "what did this buyer/order/lot/rack/
  // description touch across every raw material and color code" rather than
  // the single-entity view above. Any combination of the five text filters
  // can be supplied; matching is case-insensitive substring (LIKE), matching
  // how a value typed or picked from the saved quick-options list would be
  // searched for. Results are grouped by entity (raw material or color
  // code), each with its own subtotal, plus one grand total across everything
  // matched — mirrors a physical ledger book's "customer summary" page.
  // ---------------------------------------------------------------------------
  ipcMain.handle('cross-report:search', async (_event, filters) => {
    const { description, buyer, orderNo, lotNo, rackNo, startDate, endDate } = filters || {};

    const conditions = [];
    const params = [];

    if (description && description.trim()) {
      conditions.push('description LIKE ? COLLATE NOCASE');
      params.push(`%${description.trim()}%`);
    }
    if (buyer && buyer.trim()) {
      conditions.push('buyer LIKE ? COLLATE NOCASE');
      params.push(`%${buyer.trim()}%`);
    }
    if (orderNo && orderNo.trim()) {
      conditions.push('order_no LIKE ? COLLATE NOCASE');
      params.push(`%${orderNo.trim()}%`);
    }
    if (lotNo && lotNo.trim()) {
      conditions.push('lot_no LIKE ? COLLATE NOCASE');
      params.push(`%${lotNo.trim()}%`);
    }
    if (rackNo && rackNo.trim()) {
      conditions.push('rack_no LIKE ? COLLATE NOCASE');
      params.push(`%${rackNo.trim()}%`);
    }
    if (startDate) {
      conditions.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      params.push(endDate);
    }

    // No filters supplied at all — refuse rather than dump every transaction
    // in the database into one report.
    if (conditions.length === 0) {
      return { groups: [], grandTotal: emptyReportTotals(), matchedTransactionCount: 0 };
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const matches = await allAsync(
      `SELECT entity_type, entity_id, entry_type, receive_from_dye, knitting_distribution,
              return_qty, assorted, wastage
       FROM transactions ${where}`,
      params
    );

    if (matches.length === 0) {
      return { groups: [], grandTotal: emptyReportTotals(), matchedTransactionCount: 0 };
    }

    // Group in JS rather than SQL GROUP BY, since each group also needs a
    // human-readable label resolved from a different table depending on
    // entity_type (raw_materials vs material_codes joined to its parent).
    const groupMap = new Map();
    for (const row of matches) {
      const key = `${row.entity_type}:${row.entity_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          entityType: row.entity_type,
          entityId: row.entity_id,
          totals: emptyReportTotals(),
          transactionCount: 0,
        });
      }
      const group = groupMap.get(key);
      group.transactionCount += 1;
      if (row.entry_type !== 'DRYING_LOSS') {
        group.totals.totalReceivedFromDye += row.receive_from_dye || 0;
        group.totals.totalKnittingDistribution += row.knitting_distribution || 0;
      } else {
        group.totals.totalDryingLoss += row.knitting_distribution || 0;
      }
      group.totals.totalReturnQty += row.return_qty || 0;
      group.totals.totalAssorted += row.assorted || 0;
      group.totals.totalWastage += row.wastage || 0;
    }

    // Resolve display labels. Raw materials and color codes are looked up
    // in bulk (not one query per group) since a wide search can touch
    // hundreds of entities.
    const rawMaterialIds = [...groupMap.values()]
      .filter((g) => g.entityType === 'RAW_MATERIAL')
      .map((g) => g.entityId);
    const colorCodeIds = [...groupMap.values()]
      .filter((g) => g.entityType === 'COLOR_CODE')
      .map((g) => g.entityId);

    const rawMaterialRows = rawMaterialIds.length
      ? await allAsync(
          `SELECT id, name, unit FROM raw_materials WHERE id IN (${rawMaterialIds.map(() => '?').join(',')})`,
          rawMaterialIds
        )
      : [];
    const colorCodeRows = colorCodeIds.length
      ? await allAsync(
          `SELECT mc.id, mc.code, rm.name as raw_material_name, rm.unit as unit
           FROM material_codes mc
           JOIN raw_materials rm ON rm.id = mc.raw_material_id
           WHERE mc.id IN (${colorCodeIds.map(() => '?').join(',')})`,
          colorCodeIds
        )
      : [];

    const rawMaterialById = new Map(rawMaterialRows.map((r) => [r.id, r]));
    const colorCodeById = new Map(colorCodeRows.map((r) => [r.id, r]));

    // Each entity's real current balance is its latest transaction's stored
    // balance across its FULL history — not derived from the filtered/matched
    // rows above, since those are only a subset (e.g. just this buyer's
    // entries) and summing a subset of movements would not equal the
    // entity's actual stock level. One query per matched entity is
    // acceptable here since group counts are small relative to total
    // transaction volume (a search result is a handful to a few dozen
    // entities, not thousands).
    const balanceByKey = new Map();
    for (const group of groupMap.values()) {
      const key = `${group.entityType}:${group.entityId}`;
      const latest = await getAsync(
        'SELECT balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
        [group.entityType, group.entityId]
      );
      balanceByKey.set(key, latest ? latest.balance : 0);
    }

    const grandTotal = emptyReportTotals();
    const groups = [];

    for (const group of groupMap.values()) {
      let label;
      let unit = 'kg';
      if (group.entityType === 'RAW_MATERIAL') {
        const rm = rawMaterialById.get(group.entityId);
        label = rm ? rm.name : `Raw material #${group.entityId} (deleted)`;
        unit = rm ? rm.unit : 'kg';
      } else {
        const cc = colorCodeById.get(group.entityId);
        label = cc ? `${cc.raw_material_name} — ${cc.code}` : `Color code #${group.entityId} (deleted)`;
        unit = cc ? cc.unit : 'kg';
      }

      groups.push({
        entityType: group.entityType,
        entityId: group.entityId,
        label,
        unit,
        transactionCount: group.transactionCount,
        totals: group.totals,
        currentBalance: balanceByKey.get(`${group.entityType}:${group.entityId}`) ?? 0,
      });

      grandTotal.totalReceivedFromDye += group.totals.totalReceivedFromDye;
      grandTotal.totalKnittingDistribution += group.totals.totalKnittingDistribution;
      grandTotal.totalReturnQty += group.totals.totalReturnQty;
      grandTotal.totalAssorted += group.totals.totalAssorted;
      grandTotal.totalWastage += group.totals.totalWastage;
      grandTotal.totalDryingLoss += group.totals.totalDryingLoss;
    }

    // Sort by label so results read alphabetically/naturally rather than in
    // arbitrary map-iteration order.
    groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    return { groups, grandTotal, matchedTransactionCount: matches.length };
  });

  // ---------------------------------------------------------------------------
  // Fiscal year closure ("Balance Brought Down")
  // ---------------------------------------------------------------------------

  // Dry run — no writes. Returns every raw material's and color code's
  // current balance and transaction count, so a confirmation screen can show
  // exactly what closing the year would do before anything is touched.
  ipcMain.handle('fiscal-year:preview', async () => {
    const rawMaterials = await allAsync('SELECT id, name, unit FROM raw_materials ORDER BY name ASC');
    const colorCodes = await allAsync(`
      SELECT mc.id, mc.code, rm.name as raw_material_name, rm.unit as unit
      FROM material_codes mc
      JOIN raw_materials rm ON rm.id = mc.raw_material_id
      ORDER BY rm.name ASC, mc.code ASC
    `);

    const entities = [];

    for (const rm of rawMaterials) {
      const summary = await getEntityClosureSummary('RAW_MATERIAL', rm.id);
      entities.push({
        entityType: 'RAW_MATERIAL',
        entityId: rm.id,
        label: rm.name,
        unit: rm.unit,
        currentBalance: summary.balance,
        transactionCount: summary.count,
      });
    }

    for (const cc of colorCodes) {
      const summary = await getEntityClosureSummary('COLOR_CODE', cc.id);
      entities.push({
        entityType: 'COLOR_CODE',
        entityId: cc.id,
        label: `${cc.raw_material_name} — ${cc.code}`,
        unit: cc.unit,
        currentBalance: summary.balance,
        transactionCount: summary.count,
      });
    }

    const touchedEntities = entities.filter((e) => e.transactionCount > 0);

    return {
      totalEntities: entities.length,
      entitiesWithTransactions: touchedEntities.length,
      totalTransactionCount: touchedEntities.reduce((sum, e) => sum + e.transactionCount, 0),
      entities,
    };
  });

  async function getEntityClosureSummary(entityType, entityId) {
    const countRow = await getAsync(
      'SELECT COUNT(*) as count FROM transactions WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId]
    );
    const latest = await getAsync(
      'SELECT balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [entityType, entityId]
    );
    return { count: countRow.count, balance: latest ? latest.balance : 0 };
  }

  // The real operation. Backs up the database file first — if that fails,
  // aborts before any data is touched. Then, in one SQL transaction: every
  // entity's rows for the year are copied into archived_transactions,
  // deleted from the live table, and (for entities that had any activity)
  // replaced with a single BALANCE_BROUGHT_DOWN row carrying the ending
  // balance forward as the new year's opening balance. All-or-nothing —
  // if anything throws partway through, the whole closure rolls back and
  // the live table is left exactly as it was.
  ipcMain.handle('fiscal-year:close', async (_event, { label, openingDate }) => {
    const trimmedLabel = (label || '').trim();
    if (!trimmedLabel) {
      throw new Error('A fiscal year label is required');
    }
    if (!openingDate) {
      throw new Error('An opening date for the new year is required');
    }

    const backupPath = await backupDatabaseFile(trimmedLabel);

    const rawMaterials = await allAsync('SELECT id FROM raw_materials');
    const colorCodes = await allAsync('SELECT id FROM material_codes');
    const allEntities = [
      ...rawMaterials.map((r) => ({ entityType: 'RAW_MATERIAL', entityId: r.id })),
      ...colorCodes.map((c) => ({ entityType: 'COLOR_CODE', entityId: c.id })),
    ];

    await runAsync('BEGIN TRANSACTION');

    try {
      const closureResult = await runAsync(
        'INSERT INTO fiscal_year_closures (label, backup_path) VALUES (?, ?)',
        [trimmedLabel, backupPath]
      );
      const closureId = closureResult.id;

      let entityCount = 0;
      let transactionCount = 0;

      for (const { entityType, entityId } of allEntities) {
        const rows = await allAsync(
          'SELECT * FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date ASC, id ASC',
          [entityType, entityId]
        );

        if (rows.length === 0) {
          // Nothing ever recorded against this entity — nothing to archive,
          // nothing to bring down. Leave it untouched.
          continue;
        }

        const endingBalance = rows[rows.length - 1].balance;

        for (const row of rows) {
          await runAsync(
            `INSERT INTO archived_transactions
              (closure_id, fiscal_year_label, original_transaction_id, entity_type, entity_id, entry_type,
               date, description, buyer, order_no, lot_no, rack_no, receive_from_dye,
               knitting_distribution, return_qty, balance, assorted, wastage, remark, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              closureId, trimmedLabel, row.id, row.entity_type, row.entity_id, row.entry_type,
              row.date, row.description, row.buyer, row.order_no, row.lot_no, row.rack_no,
              row.receive_from_dye, row.knitting_distribution, row.return_qty, row.balance,
              row.assorted, row.wastage, row.remark, row.created_at,
            ]
          );
        }

        await runAsync(
          'DELETE FROM transactions WHERE entity_type = ? AND entity_id = ?',
          [entityType, entityId]
        );

        // Opening entry for the new year — the "Balance Brought Down" row.
        // Modeled as a receive_from_dye equal to the prior balance so the
        // running balance formula (prev + receive - knitting + return)
        // continues correctly from zero with no special-casing elsewhere
        // in the app.
        await runAsync(
          `INSERT INTO transactions
            (entity_type, entity_id, entry_type, date, description, receive_from_dye,
             knitting_distribution, return_qty, balance, assorted, wastage)
           VALUES (?, ?, 'BALANCE_BROUGHT_DOWN', ?, 'Balance Brought Down', ?, 0, 0, ?, 0, 0)`,
          [entityType, entityId, openingDate, endingBalance, endingBalance]
        );

        entityCount += 1;
        transactionCount += rows.length;
      }

      await runAsync(
        'UPDATE fiscal_year_closures SET entity_count = ?, transaction_count = ? WHERE id = ?',
        [entityCount, transactionCount, closureId]
      );

      await runAsync('COMMIT');

      return {
        closureId,
        label: trimmedLabel,
        entityCount,
        transactionCount,
        backupPath,
      };
    } catch (err) {
      await runAsync('ROLLBACK');
      throw err;
    }
  });

  ipcMain.handle('fiscal-year:list', async () => {
    return allAsync('SELECT * FROM fiscal_year_closures ORDER BY closed_at DESC');
  });

  // Read-only: one entity's frozen transactions for one past fiscal year.
  ipcMain.handle('fiscal-year:getArchivedTransactions', async (_event, { entityType, entityId, fiscalYearLabel }) => {
    return allAsync(
      `SELECT * FROM archived_transactions
       WHERE entity_type = ? AND entity_id = ? AND fiscal_year_label = ?
       ORDER BY date ASC, id ASC`,
      [entityType, entityId, fiscalYearLabel]
    );
  });

  // Which raw materials / color codes actually have archived data for a
  // given past fiscal year — feeds the archive browser's material/code
  // picker, since a given year may not have touched every entity that
  // exists today (and an entity may since have been deleted, in which case
  // its archived history still exists but the label falls back to a
  // "(deleted)" placeholder rather than joining to a live row).
  ipcMain.handle('fiscal-year:getArchivedEntities', async (_event, { fiscalYearLabel }) => {
    const distinctEntities = await allAsync(
      `SELECT DISTINCT entity_type, entity_id FROM archived_transactions WHERE fiscal_year_label = ?`,
      [fiscalYearLabel]
    );

    if (distinctEntities.length === 0) return [];

    const rawMaterialIds = distinctEntities
      .filter((e) => e.entity_type === 'RAW_MATERIAL')
      .map((e) => e.entity_id);
    const colorCodeIds = distinctEntities
      .filter((e) => e.entity_type === 'COLOR_CODE')
      .map((e) => e.entity_id);

    const rawMaterialRows = rawMaterialIds.length
      ? await allAsync(
          `SELECT id, name, unit FROM raw_materials WHERE id IN (${rawMaterialIds.map(() => '?').join(',')})`,
          rawMaterialIds
        )
      : [];
    const colorCodeRows = colorCodeIds.length
      ? await allAsync(
          `SELECT mc.id, mc.code, rm.name as raw_material_name, rm.unit as unit
           FROM material_codes mc
           JOIN raw_materials rm ON rm.id = mc.raw_material_id
           WHERE mc.id IN (${colorCodeIds.map(() => '?').join(',')})`,
          colorCodeIds
        )
      : [];

    const rawMaterialById = new Map(rawMaterialRows.map((r) => [r.id, r]));
    const colorCodeById = new Map(colorCodeRows.map((r) => [r.id, r]));

    return distinctEntities.map((e) => {
      if (e.entity_type === 'RAW_MATERIAL') {
        const rm = rawMaterialById.get(e.entity_id);
        return {
          entityType: 'RAW_MATERIAL',
          entityId: e.entity_id,
          label: rm ? rm.name : `Raw material #${e.entity_id} (deleted)`,
          unit: rm ? rm.unit : 'kg',
        };
      }
      const cc = colorCodeById.get(e.entity_id);
      return {
        entityType: 'COLOR_CODE',
        entityId: e.entity_id,
        label: cc ? `${cc.raw_material_name} — ${cc.code}` : `Color code #${e.entity_id} (deleted)`,
        unit: cc ? cc.unit : 'kg',
      };
    }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  });

  async function backupDatabaseFile(label) {
    await fs.mkdir(backupsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = label.replace(/[^a-zA-Z0-9-_]+/g, '_');
    const backupPath = path.join(backupsDir, `kts-wool-inventory-${safeLabel}-${timestamp}.db`);
    await fs.copyFile(dbPath, backupPath);
    return backupPath;
  }
}

function emptyReportTotals() {
  return {
    totalReceivedFromDye: 0,
    totalKnittingDistribution: 0,
    totalReturnQty: 0,
    totalAssorted: 0,
    totalWastage: 0,
    totalDryingLoss: 0,
  };
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Allow window.open() calls from the renderer (used by the Reports page's
  // "Export PDF" button to open a printable view) to actually open a window,
  // instead of being silently blocked by Electron's default same-window policy.
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  try {
    await initDb();
    await migrateEntryTypeConstraint();
  } catch (err) {
    console.error('Failed to initialize database:', err);
    app.quit();
    return;
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (db) db.close();
});