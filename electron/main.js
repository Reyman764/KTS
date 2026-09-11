import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3pkg from 'sqlite3';

const sqlite3 = sqlite3pkg.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const dbPath = path.join(app.getPath('userData'), 'kts-wool-inventory.db');
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
  db = new sqlite3.Database(dbPath);

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
    // Schema note (2026-09): this replaced the earlier issue/receive/receiver
    // ledger structure. The one-time `DROP TABLE IF EXISTS transactions` used
    // to perform that migration has been removed — it was wiping the whole
    // ledger on every app restart, not just once. Do not reintroduce it here;
    // any future schema change to this table needs a real migration, not a
    // drop-and-recreate.
    // ------------------------------------------------------------------

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('RAW_MATERIAL', 'COLOR_CODE')),
        entity_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT')),
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
    // quick_options: saved values for the Description / Buyer / Rack No /
    // Lot No / Order No combo-box fields on the ledger entry form, so
    // repeated values can be picked instead of retyped (avoiding typos on
    // names that recur constantly, like buyer or rack). Shared globally
    // across all raw materials and color codes, not scoped per entity.
    // `field` identifies which form field a value belongs to.
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
  });
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

app.whenReady().then(() => {
  initDb();
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