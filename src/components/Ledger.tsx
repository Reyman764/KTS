import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { EntityType, EntryType, Transaction } from '../types';
import { transactionsApi } from '../api/transactions';

interface LedgerProps {
  entityType: EntityType;
  entityId: number;
  entityLabel: string;
  unit: string;
}

const PAGE_SIZE = 100;

export default function Ledger({ entityType, entityId, entityLabel, unit }: LedgerProps) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
              <th>Lot No</th>
              <th>Rack No</th>
              <th>Receiver</th>
              <th className="num">Issue (-)</th>
              <th className="num">Receive (+)</th>
              <th className="num">Balance</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="ledger-empty-row">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="ledger-empty-row">No transactions yet.</td>
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
                  <td>{row.lot_no}</td>
                  <td>{row.rack_no}</td>
                  <td>{row.receiver}</td>
                  <td className="num">{row.issue ? row.issue.toFixed(2) : ''}</td>
                  <td className="num">{row.receive ? row.receive.toFixed(2) : ''}</td>
                  <td className="num balance-cell">{row.balance.toFixed(2)} {unit}</td>
                  <td>{row.remark}</td>
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
        />
      )}
    </div>
  );
}

interface AddEntryModalProps {
  entityType: EntityType;
  entityId: number;
  onClose: () => void;
  onCreated: () => void;
}

function AddEntryModal({ entityType, entityId, onClose, onCreated }: AddEntryModalProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<EntryType>('NORMAL');
  const [description, setDescription] = useState('');
  const [buyer, setBuyer] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [rackNo, setRackNo] = useState('');
  const [receiver, setReceiver] = useState('');
  const [issue, setIssue] = useState('');
  const [receive, setReceive] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError('Date is required.');
      return;
    }
    const issueVal = Number(issue) || 0;
    const receiveVal = Number(receive) || 0;
    if (issueVal === 0 && receiveVal === 0) {
      setError('Enter an Issue or Receive amount.');
      return;
    }
    if (issueVal > 0 && receiveVal > 0) {
      setError('Enter only one of Issue or Receive, not both.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await transactionsApi.create({
        entityType,
        entityId,
        entryType,
        date,
        description: description.trim() || undefined,
        buyer: buyer.trim() || undefined,
        lotNo: lotNo.trim() || undefined,
        rackNo: rackNo.trim() || undefined,
        receiver: receiver.trim() || undefined,
        issue: issueVal,
        receive: receiveVal,
        remark: remark.trim() || undefined,
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
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="entry-date">Date</label>
              <input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-type">Entry Type</label>
              <select id="entry-type" value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)}>
                <option value="NORMAL">Normal Transaction</option>
                <option value="DRYING_LOSS">Drying / Weight Loss</option>
                <option value="AUDIT_ADJUSTMENT">Audit Adjustment</option>
              </select>
            </div>

            <div className="span-2">
              <label className="field-label" htmlFor="entry-desc">Description</label>
              <input id="entry-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-buyer">Buyer</label>
              <input id="entry-buyer" type="text" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-receiver">Receiver</label>
              <input id="entry-receiver" type="text" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-lot">Lot No</label>
              <input id="entry-lot" type="text" value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-rack">Rack No</label>
              <input id="entry-rack" type="text" value={rackNo} onChange={(e) => setRackNo(e.target.value)} />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-issue">Issue (-)</label>
              <input
                id="entry-issue"
                type="number"
                step="0.01"
                min="0"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                disabled={Number(receive) > 0}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="entry-receive">Receive (+)</label>
              <input
                id="entry-receive"
                type="number"
                step="0.01"
                min="0"
                value={receive}
                onChange={(e) => setReceive(e.target.value)}
                disabled={Number(issue) > 0}
              />
            </div>

            <div className="span-2">
              <label className="field-label" htmlFor="entry-remark">Remark</label>
              <input id="entry-remark" type="text" value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
          </div>

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