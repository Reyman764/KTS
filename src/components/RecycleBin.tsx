import { useEffect, useState } from 'react';
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import type { RecycleBinContents, RecycleBinRawMaterial, RecycleBinColorCode } from '../types';
import { recycleBinApi } from '../api/recycleBin';
import { formatDbTimestamp } from '../utils/formatDate';

type PurgeTarget =
  | { kind: 'RAW_MATERIAL'; item: RecycleBinRawMaterial }
  | { kind: 'COLOR_CODE'; item: RecycleBinColorCode };

// Bulk purge has no single name to type (could be one item or a thousand),
// so confirmation is "type DELETE" instead of "type the exact name" — same
// idea as the single-item purge, just scaled to a batch.
type BulkPurgeTarget = { kind: 'RAW_MATERIAL' | 'COLOR_CODE'; count: number };

const BULK_CONFIRM_WORD = 'DELETE';

// The recycle bin: everything soft-deleted through the normal app still
// sits here, restorable, until someone in Admin purges it for good. This
// is the only place in the app that can bring a deleted item back to life,
// or remove it permanently. Checkboxes + select-all let the whole list (or
// any subset of it) be restored or purged in one action instead of one
// click per row — important once this fills up with hundreds of items.
export default function RecycleBin() {
  const [contents, setContents] = useState<RecycleBinContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedRawMaterialIds, setSelectedRawMaterialIds] = useState<Set<number>>(new Set());
  const [selectedColorCodeIds, setSelectedColorCodeIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const [bulkPurgeTarget, setBulkPurgeTarget] = useState<BulkPurgeTarget | null>(null);
  const [bulkPurgeConfirmText, setBulkPurgeConfirmText] = useState('');
  const [bulkPurgeError, setBulkPurgeError] = useState<string | null>(null);

  function load() {
    setError(null);
    recycleBinApi
      .list()
      .then((data) => {
        setContents(data);
        const liveRmIds = new Set(data.rawMaterials.map((r) => r.id));
        const liveCodeIds = new Set(data.colorCodes.map((c) => c.id));
        setSelectedRawMaterialIds((prev) => new Set([...prev].filter((id) => liveRmIds.has(id))));
        setSelectedColorCodeIds((prev) => new Set([...prev].filter((id) => liveCodeIds.has(id))));
      })
      .catch((err) => {
        console.error('Failed to load recycle bin', err);
        setError('Could not load the recycle bin.');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    recycleBinApi
      .list()
      .then(setContents)
      .catch((err) => {
        console.error('Failed to load recycle bin', err);
        setError('Could not load the recycle bin.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleRestoreRawMaterial(rm: RecycleBinRawMaterial) {
    setBusyId(`rm-${rm.id}`);
    try {
      await recycleBinApi.restoreRawMaterial(rm.id);
      load();
    } catch (err) {
      console.error(err);
      setError(`Could not restore "${rm.name}".`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreColorCode(code: RecycleBinColorCode) {
    setBusyId(`code-${code.id}`);
    try {
      await recycleBinApi.restoreColorCode(code.id);
      load();
    } catch (err) {
      console.error(err);
      setError(`Could not restore "${code.code}".`);
    } finally {
      setBusyId(null);
    }
  }

  function openPurge(target: PurgeTarget) {
    setPurgeTarget(target);
    setPurgeConfirmText('');
    setPurgeError(null);
  }

  function closePurge() {
    setPurgeTarget(null);
    setPurgeConfirmText('');
    setPurgeError(null);
  }

  const purgeExpectedText = purgeTarget
    ? purgeTarget.kind === 'RAW_MATERIAL'
      ? purgeTarget.item.name
      : purgeTarget.item.code
    : '';
  const purgeConfirmed = purgeConfirmText.trim() === purgeExpectedText;

  async function handlePurgeConfirm() {
    if (!purgeTarget || !purgeConfirmed) return;
    setPurging(true);
    setPurgeError(null);
    try {
      if (purgeTarget.kind === 'RAW_MATERIAL') {
        await recycleBinApi.purgeRawMaterial(purgeTarget.item.id);
      } else {
        await recycleBinApi.purgeColorCode(purgeTarget.item.id);
      }
      closePurge();
      load();
    } catch (err) {
      console.error(err);
      setPurgeError('Could not permanently delete this item.');
    } finally {
      setPurging(false);
    }
  }

  function toggleRawMaterial(id: number) {
    setSelectedRawMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColorCode(id: number) {
    setSelectedColorCodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllRawMaterials() {
    const all = contents?.rawMaterials ?? [];
    setSelectedRawMaterialIds((prev) =>
      prev.size === all.length ? new Set() : new Set(all.map((r) => r.id))
    );
  }

  function toggleAllColorCodes() {
    const all = contents?.colorCodes ?? [];
    setSelectedColorCodeIds((prev) =>
      prev.size === all.length ? new Set() : new Set(all.map((c) => c.id))
    );
  }

  async function handleBulkRestoreRawMaterials() {
    if (selectedRawMaterialIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await recycleBinApi.restoreRawMaterials([...selectedRawMaterialIds]);
      setSelectedRawMaterialIds(new Set());
      load();
    } catch (err) {
      console.error(err);
      setError('Could not restore the selected raw materials.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkRestoreColorCodes() {
    if (selectedColorCodeIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await recycleBinApi.restoreColorCodes([...selectedColorCodeIds]);
      setSelectedColorCodeIds(new Set());
      load();
    } catch (err) {
      console.error(err);
      setError('Could not restore the selected color codes.');
    } finally {
      setBulkBusy(false);
    }
  }

  function openBulkPurge(kind: 'RAW_MATERIAL' | 'COLOR_CODE') {
    const count = kind === 'RAW_MATERIAL' ? selectedRawMaterialIds.size : selectedColorCodeIds.size;
    if (count === 0) return;
    setBulkPurgeTarget({ kind, count });
    setBulkPurgeConfirmText('');
    setBulkPurgeError(null);
  }

  function closeBulkPurge() {
    setBulkPurgeTarget(null);
    setBulkPurgeConfirmText('');
    setBulkPurgeError(null);
  }

  const bulkPurgeConfirmed = bulkPurgeConfirmText.trim() === BULK_CONFIRM_WORD;

  async function handleBulkPurgeConfirm() {
    if (!bulkPurgeTarget || !bulkPurgeConfirmed) return;
    setBulkBusy(true);
    setBulkPurgeError(null);
    try {
      if (bulkPurgeTarget.kind === 'RAW_MATERIAL') {
        await recycleBinApi.purgeRawMaterials([...selectedRawMaterialIds]);
        setSelectedRawMaterialIds(new Set());
      } else {
        await recycleBinApi.purgeColorCodes([...selectedColorCodeIds]);
        setSelectedColorCodeIds(new Set());
      }
      closeBulkPurge();
      load();
    } catch (err) {
      console.error(err);
      setBulkPurgeError('Could not permanently delete the selected items.');
    } finally {
      setBulkBusy(false);
    }
  }

  const hasRawMaterials = (contents?.rawMaterials.length ?? 0) > 0;
  const hasColorCodes = (contents?.colorCodes.length ?? 0) > 0;
  const allRawMaterialsSelected =
    hasRawMaterials && selectedRawMaterialIds.size === contents!.rawMaterials.length;
  const allColorCodesSelected =
    hasColorCodes && selectedColorCodeIds.size === contents!.colorCodes.length;

  return (
    <div>
      <p className="cross-report-subtitle">
        Deleted raw materials and color codes stay here until they're restored or permanently
        removed. Nothing here was actually deleted from the database yet — permanently deleting
        cannot be undone.
      </p>

      {loading && <p className="delete-confirm-text">Loading…</p>}
      {error && <p className="field-error">{error}</p>}

      {!loading && !error && !hasRawMaterials && !hasColorCodes && (
        <p className="cross-report-empty">The recycle bin is empty.</p>
      )}

      {!loading && !error && hasRawMaterials && (
        <>
          <div className="recycle-bin-section-header">
            <h3 className="admin-section-heading">Raw Materials</h3>
            {selectedRawMaterialIds.size > 0 && (
              <div className="recycle-bin-bulk-actions">
                <span className="recycle-bin-selected-count">
                  {selectedRawMaterialIds.size} selected
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={bulkBusy}
                  onClick={handleBulkRestoreRawMaterials}
                >
                  <RotateCcw size={14} /> Restore Selected
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={bulkBusy}
                  onClick={() => openBulkPurge('RAW_MATERIAL')}
                >
                  <Trash2 size={14} /> Delete Selected Permanently
                </button>
              </div>
            )}
          </div>
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="recycle-bin-checkbox-col">
                    <input
                      type="checkbox"
                      checked={allRawMaterialsSelected}
                      onChange={toggleAllRawMaterials}
                      aria-label="Select all raw materials"
                    />
                  </th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Deleted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contents!.rawMaterials.map((rm) => (
                  <tr key={rm.id}>
                    <td className="recycle-bin-checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedRawMaterialIds.has(rm.id)}
                        onChange={() => toggleRawMaterial(rm.id)}
                        aria-label={`Select ${rm.name}`}
                      />
                    </td>
                    <td>{rm.name}</td>
                    <td>{rm.unit}</td>
                    <td>{formatDbTimestamp(rm.deletedAt)}</td>
                    <td>
                      <div className="recycle-bin-row-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busyId === `rm-${rm.id}`}
                          onClick={() => handleRestoreRawMaterial(rm)}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => openPurge({ kind: 'RAW_MATERIAL', item: rm })}
                        >
                          <Trash2 size={14} /> Delete Permanently
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !error && hasColorCodes && (
        <>
          <div className="recycle-bin-section-header">
            <h3 className="admin-section-heading">Color Codes</h3>
            {selectedColorCodeIds.size > 0 && (
              <div className="recycle-bin-bulk-actions">
                <span className="recycle-bin-selected-count">
                  {selectedColorCodeIds.size} selected
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={bulkBusy}
                  onClick={handleBulkRestoreColorCodes}
                >
                  <RotateCcw size={14} /> Restore Selected
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={bulkBusy}
                  onClick={() => openBulkPurge('COLOR_CODE')}
                >
                  <Trash2 size={14} /> Delete Selected Permanently
                </button>
              </div>
            )}
          </div>
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="recycle-bin-checkbox-col">
                    <input
                      type="checkbox"
                      checked={allColorCodesSelected}
                      onChange={toggleAllColorCodes}
                      aria-label="Select all color codes"
                    />
                  </th>
                  <th>Code</th>
                  <th>Raw Material</th>
                  <th>Deleted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contents!.colorCodes.map((code) => (
                  <tr key={code.id}>
                    <td className="recycle-bin-checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedColorCodeIds.has(code.id)}
                        onChange={() => toggleColorCode(code.id)}
                        aria-label={`Select ${code.code}`}
                      />
                    </td>
                    <td>{code.code}</td>
                    <td>{code.rawMaterialName ?? '—'}</td>
                    <td>{formatDbTimestamp(code.deletedAt)}</td>
                    <td>
                      <div className="recycle-bin-row-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busyId === `code-${code.id}`}
                          onClick={() => handleRestoreColorCode(code)}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => openPurge({ kind: 'COLOR_CODE', item: code })}
                        >
                          <Trash2 size={14} /> Delete Permanently
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {purgeTarget && (
        <div className="modal-overlay" onClick={closePurge}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Permanently delete "{purgeExpectedText}"?</h3>
            <p className="delete-confirm-text">
              This cannot be undone from anywhere in the app, including this recycle bin. A backup
              is saved automatically before this happens, as a last-resort safety net.
            </p>
            <div className="fiscal-close-warning">
              <AlertTriangle size={16} />
              <span>This is permanent. Restoring later will not be possible from within the app.</span>
            </div>
            <div className="delete-confirm-type">
              <label className="field-label" htmlFor="purge-confirm">
                Type <strong>{purgeExpectedText}</strong> to confirm
              </label>
              <input
                id="purge-confirm"
                type="text"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            {purgeError && <p className="field-error">{purgeError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closePurge}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handlePurgeConfirm}
                disabled={!purgeConfirmed || purging}
              >
                {purging ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkPurgeTarget && (
        <div className="modal-overlay" onClick={closeBulkPurge}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Permanently delete {bulkPurgeTarget.count}{' '}
              {bulkPurgeTarget.kind === 'RAW_MATERIAL' ? 'raw material' : 'color code'}
              {bulkPurgeTarget.count === 1 ? '' : 's'}?
            </h3>
            <p className="delete-confirm-text">
              This cannot be undone from anywhere in the app, including this recycle bin. One
              backup is saved automatically before this happens, as a last-resort safety net.
            </p>
            <div className="fiscal-close-warning">
              <AlertTriangle size={16} />
              <span>
                This is permanent, for all {bulkPurgeTarget.count} selected item
                {bulkPurgeTarget.count === 1 ? '' : 's'} at once. Restoring later will not be
                possible from within the app.
              </span>
            </div>
            <div className="delete-confirm-type">
              <label className="field-label" htmlFor="bulk-purge-confirm">
                Type <strong>{BULK_CONFIRM_WORD}</strong> to confirm
              </label>
              <input
                id="bulk-purge-confirm"
                type="text"
                value={bulkPurgeConfirmText}
                onChange={(e) => setBulkPurgeConfirmText(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            {bulkPurgeError && <p className="field-error">{bulkPurgeError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeBulkPurge}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleBulkPurgeConfirm}
                disabled={!bulkPurgeConfirmed || bulkBusy}
              >
                {bulkBusy ? 'Deleting…' : `Delete ${bulkPurgeTarget.count} Permanently`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}