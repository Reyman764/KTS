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

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('RAW_MATERIAL', 'COLOR_CODE')),
        entity_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL', 'DRYING_LOSS', 'AUDIT_ADJUSTMENT')),
        date TEXT NOT NULL,
        description TEXT,
        buyer TEXT,
        lot_no TEXT,
        rack_no TEXT,
        receiver TEXT,
        issue REAL NOT NULL DEFAULT 0,
        receive REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
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
  function recalcBalances(entityType, entityId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, issue, receive FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date ASC, id ASC',
        [entityType, entityId],
        (err, rows) => {
          if (err) return reject(err);
          let running = 0;
          const stmt = db.prepare('UPDATE transactions SET balance = ? WHERE id = ?');
          for (const row of rows) {
            running += (row.receive || 0) - (row.issue || 0);
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
      lotNo,
      rackNo,
      receiver,
      issue,
      receive,
      remark,
    } = payload;

    const issueVal = Number(issue) || 0;
    const receiveVal = Number(receive) || 0;

    // Is this entry chronologically after everything currently stored?
    const latest = await getAsync(
      'SELECT date, balance FROM transactions WHERE entity_type = ? AND entity_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [entityType, entityId]
    );

    const isAppend = !latest || date >= latest.date;
    const provisionalBalance = (latest ? latest.balance : 0) + receiveVal - issueVal;

    const result = await runAsync(
      `INSERT INTO transactions
        (entity_type, entity_id, entry_type, date, description, buyer, lot_no, rack_no, receiver, issue, receive, balance, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entityType,
        entityId,
        entryType || 'NORMAL',
        date,
        description || null,
        buyer || null,
        lotNo || null,
        rackNo || null,
        receiver || null,
        issueVal,
        receiveVal,
        provisionalBalance,
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
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    win.loadURL('http://localhost:5174');
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