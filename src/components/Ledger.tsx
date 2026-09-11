import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { EntityType, EntryType, QuickOption, Transaction } from '../types';
import { transactionsApi } from '../api/transactions';
import { quickOptionsApi } from '../api/quickOptions';
import ComboBoxInput from './ComboBoxInput';

interface LedgerProps {
  entityType: EntityType;
  entityId: number;
  entityLabel: string;
  unit: string;
}

const PAGE_SIZE = 100;
const COLUMN_COUNT = 14;

export default function Ledger({ entityType, entityId, entityLabel, unit }: LedgerProps) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Transaction | null>(null);
  const [deletingRow, setDeletingRow] = useState<Transaction | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickOptions, setQuickOptions] = useState<QuickOption[]>([]);

  useEffect(() => {
    quickOptionsApi
      .getAll()
      .then(setQuickOptions)
      .catch((err) => console.error('Failed to load quick options', err));
  }, []);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const result = await transactionsApi.getByEntity({
          entityType,
          entityId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        console.error('Failed to load transactions', err);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, startDate, endDate]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  function handleCreated() {
    setModalOpen(false);
    load(1); // new entry is always latest-visible on the first page after refresh
  }

  function handleUpdated() {
    setEditingRow(null);
    load(page); // edited row may have moved pages if its date changed, but staying put is the common case
  }

  async function handleConfirmDelete() {
    if (!deletingRow) return;
    try {
      await transactionsApi.delete(deletingRow.id);
      setDeletingRow(null);
      load(page);
    } catch (err) {
      console.error('Failed to delete transaction', err);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="ledger">
      <div className="ledger-toolbar">
        <h3>{entityLabel}</h3>
        <div className="ledger-filters">
          <label>
            From
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          {(startDate || endDate) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
            >
              Clear
            </button>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Add Entry
        </button>
      </div>

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Buyer</th>
              <th>Order No.</th>
              <th>Lot No</th>
              <th>Rack No</th>
              <th className="num th-wrap">Receive from{'\n'}dye</th>
              <th className="num th-wrap">Knitting{'\n'}distribution</th>
              <th className="num th-wrap">Return{'\n'}Qty</th>
              <th className="num">Balance</th>
              <th className="num">Assorted</th>
              <th className="num">Wastage</th>
              <th>Remark</th>
              <th className="ledger-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="ledger-empty-row">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="ledger-empty-row">No transactions yet.</td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className={row.entry_type !== 'NORMAL' ? `entry-${row.entry_type.toLowerCase()}` : ''}>
                  <td>{row.date}</td>
                  <td>
                    {row.description}
                    {row.entry_type !== 'NORMAL' && (
                      <span className="entry-badge">
                        {row.entry_type === 'DRYING_LOSS' ? 'Drying loss' : 'Audit adj.'}
                      </span>
                    )}
                  </td>
                  <td>{row.buyer}</td>
                  <td>{row.order_no}</td>
                  <td>{row.lot_no}</td>
                  <td>{row.rack_no}</td>
                  <td className="num">{row.receive_from_dye ? row.receive_from_dye.toFixed(2) : ''}</td>
                  <td className="num">{row.knitting_distribution ? row.knitting_distribution.toFixed(2) : ''}</td>
                  <td className="num">{row.return_qty ? row.return_qty.toFixed(2) : ''}</td>
                  <td className="num balance-cell">{row.balance.toFixed(2)} {unit}</td>
                  <td className="num">{row.assorted ? row.assorted.toFixed(2) : ''}</td>
                  <td className="num">{row.wastage ? row.wastage.toFixed(2) : ''}</td>
                  <td>{row.remark}</td>
                  <td className="ledger-actions-col">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={() => setEditingRow(row)}
                        aria-label="Edit entry"
                        title="Edit entry"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="row-action-btn row-action-danger"
                        onClick={() => setDeletingRow(row)}
                        aria-label="Delete entry"
                        title="Delete entry"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="ledger-pagination">
        <button type="button" disabled={page <= 1} onClick={() => load(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages} ({total} entries)
        </span>
        <button type="button" disabled={page >= totalPages} onClick={() => load(page + 1)}>
          Next
        </button>
      </div>

      {modalOpen && (
        <AddEntryModal
          entityType={entityType}
          entityId={entityId}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
          quickOptions={quickOptions}
          onQuickOptionsChange={setQuickOptions}
        />
      )}

      {editingRow && (
        <EditEntryModal
          transaction={editingRow}
          onClose={() => setEditingRow(null)}
          onUpdated={handleUpdated}
          quickOptions={quickOptions}
          onQuickOptionsChange={setQuickOptions}
        />
      )}

      {deletingRow && (
        <DeleteConfirmModal
          transaction={deletingRow}
          onClose={() => setDeletingRow(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared entry form fields — used by both Add and Edit modals so the two
// forms can't drift apart.
// ---------------------------------------------------------------------------

interface EntryFormValues {
  date: string;
  entryType: EntryType;
  description: string;
  buyer: string;
  orderNo: string;
  lotNo: string;
  rackNo: string;
  receiveFromDye: string;
  knittingDistribution: string;
  returnQty: string;
  assorted: string;
  wastage: string;
  remark: string;
}

interface EntryFormFieldsProps {
  values: EntryFormValues;
  onChange: <K extends keyof EntryFormValues>(field: K, value: EntryFormValues[K]) => void;
  idPrefix: string;
  quickOptions: QuickOption[];
  onQuickOptionsChange: (options: QuickOption[]) => void;
}

function EntryFormFields({ values, onChange, idPrefix, quickOptions, onQuickOptionsChange }: EntryFormFieldsProps) {
  return (
    <div className="form-grid">
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-date`}>Date</label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={values.date}
          onChange={(e) => onChange('date', e.target.value)}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-type`}>Entry Type</label>
        <select
          id={`${idPrefix}-type`}
          value={values.entryType}
          onChange={(e) => onChange('entryType', e.target.value as EntryType)}
        >
          <option value="NORMAL">Normal Transaction</option>
          <option value="DRYING_LOSS">Drying / Weight Loss</option>
          <option value="AUDIT_ADJUSTMENT">Audit Adjustment</option>
        </select>
      </div>

      <div className="span-2">
        <label className="field-label" htmlFor={`${idPrefix}-desc`}>Description</label>
        <ComboBoxInput
          id={`${idPrefix}-desc`}
          field="description"
          value={values.description}
          onChange={(v) => onChange('description', v)}
          options={quickOptions}
          onOptionsChange={onQuickOptionsChange}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-buyer`}>Buyer</label>
        <ComboBoxInput
          id={`${idPrefix}-buyer`}
          field="buyer"
          value={values.buyer}
          onChange={(v) => onChange('buyer', v)}
          options={quickOptions}
          onOptionsChange={onQuickOptionsChange}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-order`}>Order No.</label>
        <ComboBoxInput
          id={`${idPrefix}-order`}
          field="order_no"
          value={values.orderNo}
          onChange={(v) => onChange('orderNo', v)}
          options={quickOptions}
          onOptionsChange={onQuickOptionsChange}
          placeholder="e.g. JP-2026-014"
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-lot`}>Lot No</label>
        <ComboBoxInput
          id={`${idPrefix}-lot`}
          field="lot_no"
          value={values.lotNo}
          onChange={(v) => onChange('lotNo', v)}
          options={quickOptions}
          onOptionsChange={onQuickOptionsChange}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-rack`}>Rack No</label>
        <ComboBoxInput
          id={`${idPrefix}-rack`}
          field="rack_no"
          value={values.rackNo}
          onChange={(v) => onChange('rackNo', v)}
          options={quickOptions}
          onOptionsChange={onQuickOptionsChange}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-receive-dye`}>Receive from dye (+)</label>
        <input
          id={`${idPrefix}-receive-dye`}
          type="number"
          step="0.01"
          min="0"
          value={values.receiveFromDye}
          onChange={(e) => onChange('receiveFromDye', e.target.value)}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-knitting`}>Knitting distribution (-)</label>
        <input
          id={`${idPrefix}-knitting`}
          type="number"
          step="0.01"
          min="0"
          value={values.knittingDistribution}
          onChange={(e) => onChange('knittingDistribution', e.target.value)}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-return`}>Return Qty (+)</label>
        <input
          id={`${idPrefix}-return`}
          type="number"
          step="0.01"
          min="0"
          value={values.returnQty}
          onChange={(e) => onChange('returnQty', e.target.value)}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-assorted`}>
          Assorted <span className="field-label-note">(no balance impact)</span>
        </label>
        <input
          id={`${idPrefix}-assorted`}
          type="number"
          step="0.01"
          min="0"
          value={values.assorted}
          onChange={(e) => onChange('assorted', e.target.value)}
        />
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-wastage`}>
          Wastage <span className="field-label-note">(no balance impact)</span>
        </label>
        <input
          id={`${idPrefix}-wastage`}
          type="number"
          step="0.01"
          min="0"
          value={values.wastage}
          onChange={(e) => onChange('wastage', e.target.value)}
        />
      </div>

      <div className="span-2">
        <label className="field-label" htmlFor={`${idPrefix}-remark`}>Remark</label>
        <input
          id={`${idPrefix}-remark`}
          type="text"
          value={values.remark}
          onChange={(e) => onChange('remark', e.target.value)}
        />
      </div>
    </div>
  );
}

function validateAmounts(values: EntryFormValues): string | null {
  const receiveFromDyeVal = Number(values.receiveFromDye) || 0;
  const knittingDistributionVal = Number(values.knittingDistribution) || 0;
  const returnQtyVal = Number(values.returnQty) || 0;
  const assortedVal = Number(values.assorted) || 0;
  const wastageVal = Number(values.wastage) || 0;

  if (
    receiveFromDyeVal === 0 &&
    knittingDistributionVal === 0 &&
    returnQtyVal === 0 &&
    assortedVal === 0 &&
    wastageVal === 0
  ) {
    return 'Enter at least one quantity (receive, distribution, return, assorted, or wastage).';
  }
  if ([receiveFromDyeVal, knittingDistributionVal, returnQtyVal, assortedVal, wastageVal].some((v) => v < 0)) {
    return 'Quantities cannot be negative.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Add Entry
// ---------------------------------------------------------------------------

interface AddEntryModalProps {
  entityType: EntityType;
  entityId: number;
  onClose: () => void;
  onCreated: () => void;
  quickOptions: QuickOption[];
  onQuickOptionsChange: (options: QuickOption[]) => void;
}

function AddEntryModal({
  entityType,
  entityId,
  onClose,
  onCreated,
  quickOptions,
  onQuickOptionsChange,
}: AddEntryModalProps) {
  const [values, setValues] = useState<EntryFormValues>({
    date: new Date().toISOString().slice(0, 10),
    entryType: 'NORMAL',
    description: '',
    buyer: '',
    orderNo: '',
    lotNo: '',
    rackNo: '',
    receiveFromDye: '',
    knittingDistribution: '',
    returnQty: '',
    assorted: '',
    wastage: '',
    remark: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange<K extends keyof EntryFormValues>(field: K, value: EntryFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.date) {
      setError('Date is required.');
      return;
    }

    const amountsError = validateAmounts(values);
    if (amountsError) {
      setError(amountsError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await transactionsApi.create({
        entityType,
        entityId,
        entryType: values.entryType,
        date: values.date,
        description: values.description.trim() || undefined,
        buyer: values.buyer.trim() || undefined,
        orderNo: values.orderNo.trim() || undefined,
        lotNo: values.lotNo.trim() || undefined,
        rackNo: values.rackNo.trim() || undefined,
        receiveFromDye: Number(values.receiveFromDye) || 0,
        knittingDistribution: Number(values.knittingDistribution) || 0,
        returnQty: Number(values.returnQty) || 0,
        assorted: Number(values.assorted) || 0,
        wastage: Number(values.wastage) || 0,
        remark: values.remark.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      console.error(err);
      setError('Could not save the entry.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Add ledger entry</h3>
        <form onSubmit={handleSubmit}>
          <EntryFormFields
            values={values}
            onChange={handleChange}
            idPrefix="add-entry"
            quickOptions={quickOptions}
            onQuickOptionsChange={onQuickOptionsChange}
          />

          {error && <p className="field-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Entry
// ---------------------------------------------------------------------------

interface EditEntryModalProps {
  transaction: Transaction;
  onClose: () => void;
  onUpdated: () => void;
  quickOptions: QuickOption[];
  onQuickOptionsChange: (options: QuickOption[]) => void;
}

function EditEntryModal({
  transaction,
  onClose,
  onUpdated,
  quickOptions,
  onQuickOptionsChange,
}: EditEntryModalProps) {
  const [values, setValues] = useState<EntryFormValues>({
    date: transaction.date,
    entryType: transaction.entry_type,
    description: transaction.description ?? '',
    buyer: transaction.buyer ?? '',
    orderNo: transaction.order_no ?? '',
    lotNo: transaction.lot_no ?? '',
    rackNo: transaction.rack_no ?? '',
    receiveFromDye: transaction.receive_from_dye ? String(transaction.receive_from_dye) : '',
    knittingDistribution: transaction.knitting_distribution ? String(transaction.knitting_distribution) : '',
    returnQty: transaction.return_qty ? String(transaction.return_qty) : '',
    assorted: transaction.assorted ? String(transaction.assorted) : '',
    wastage: transaction.wastage ? String(transaction.wastage) : '',
    remark: transaction.remark ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange<K extends keyof EntryFormValues>(field: K, value: EntryFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.date) {
      setError('Date is required.');
      return;
    }

    const amountsError = validateAmounts(values);
    if (amountsError) {
      setError(amountsError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await transactionsApi.update({
        id: transaction.id,
        entryType: values.entryType,
        date: values.date,
        description: values.description.trim() || undefined,
        buyer: values.buyer.trim() || undefined,
        orderNo: values.orderNo.trim() || undefined,
        lotNo: values.lotNo.trim() || undefined,
        rackNo: values.rackNo.trim() || undefined,
        receiveFromDye: Number(values.receiveFromDye) || 0,
        knittingDistribution: Number(values.knittingDistribution) || 0,
        returnQty: Number(values.returnQty) || 0,
        assorted: Number(values.assorted) || 0,
        wastage: Number(values.wastage) || 0,
        remark: values.remark.trim() || undefined,
      });
      onUpdated();
    } catch (err) {
      console.error(err);
      setError('Could not save the changes.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Edit ledger entry</h3>
        <form onSubmit={handleSubmit}>
          <EntryFormFields
            values={values}
            onChange={handleChange}
            idPrefix="edit-entry"
            quickOptions={quickOptions}
            onQuickOptionsChange={onQuickOptionsChange}
          />

          {error && <p className="field-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  transaction: Transaction;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ transaction, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete entry?</h3>
        <p className="delete-confirm-text">
          This will permanently remove the {transaction.date} entry
          {transaction.description ? ` ("${transaction.description}")` : ''} and recalculate
          the balance for every entry after it. This can't be undone.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Deleting…' : 'Delete entry'}
          </button>
        </div>
      </div>
    </div>
  );
}