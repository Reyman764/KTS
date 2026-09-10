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
    // Schema note (2026-09): this replaces the earlier issue/receive/receiver
    // ledger structure. Test data only was in this table at the time of the
    // change, so the table is dropped and recreated rather than migrated —
    // if you are applying this against a database with real transactions,
    // back it up first, since this DROP is destructive.
    // ------------------------------------------------------------------
    db.run('DROP TABLE IF EXISTS transactions');

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

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  // Recompute running balances for one entity in chronological order.
  // Called whenever an insert lands out of date order.
  //
  // Balance formula: previous balance + receive_from_dye - knitting_distribution + return_qty
  // assorted and wastage are display-only and never enter this calculation.
  function recalcBalances(entityType, entityId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, receive_from_dye, knitting_distribution, return_qty FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date ASC, id ASC',
        [entityType, entityId],
        (err, rows) => {
          if (err) return reject(err);
          let running = 0;
          const stmt = db.prepare('UPDATE transactions SET balance = ? WHERE id = ?');
          for (const row of rows) {
            running +=
              (row.receive_from_dye || 0) - (row.knitting_distribution || 0) + (row.return_qty || 0);
            stmt.run(running, row.id);
          }
          stmt.finalize((finalizeErr) => {
            if (finalizeErr) reject(finalizeErr);
            else resolve();
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

    // Is this entry chronologically after everything currently stored?
    const latest = await getAsync(
      'SELECT date, balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [entityType, entityId]
    );

    const isAppend = !latest || date >= latest.date;
    const provisionalBalance =
      (latest ? latest.balance : 0) + receiveFromDyeVal - knittingDistributionVal + returnQtyVal;

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
        provisionalBalance,
        assortedVal,
        wastageVal,
        remark || null,
      ]
    );

    // Backdated entry inserted into the middle of the ledger: every balance
    // after it (and its own) needs recomputing, since balance is cumulative.
    if (!isAppend) {
      await recalcBalances(entityType, entityId);
    }

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