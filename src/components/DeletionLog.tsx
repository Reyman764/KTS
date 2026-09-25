import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { DeletionLogEntry } from '../types';
import { deletionLogApi } from '../api/deletionLog';
import { formatDbTimestamp } from '../utils/formatDate';

// A permanent, read-only record of every raw material / color code
// deletion — name, when, and how much went with it. The backend never
// exposes an update or delete for this table, only insert (at delete
// time, inside the same transaction as the delete itself) and this
// read. That's what makes it trustworthy as a record of what actually
// happened, independent of the current state of the inventory.
export default function DeletionLog() {
  const [entries, setEntries] = useState<DeletionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    deletionLogApi
      .getAll()
      .then(setEntries)
      .catch((err) => {
        console.error('Failed to load deletion log', err);
        setError('Could not load the deletion log.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="cross-report-subtitle">
        A permanent record of every raw material and color code that has been deleted, with the
        date and time it happened. Entries here cannot be edited or removed.
      </p>

      {loading && <p className="delete-confirm-text">Loading…</p>}
      {error && <p className="field-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="cross-report-empty">
          <ShieldAlert size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Nothing has been deleted yet.
        </p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Deleted</th>
                <th>Type</th>
                <th>Name / Code</th>
                <th>Raw Material</th>
                <th className="num">Color Codes</th>
                <th className="num">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDbTimestamp(entry.deleted_at)}</td>
                  <td>{entry.entity_type === 'RAW_MATERIAL' ? 'Raw Material' : 'Color Code'}</td>
                  <td>{entry.entity_name}</td>
                  <td>{entry.raw_material_name ?? '—'}</td>
                  <td className="num">
                    {entry.entity_type === 'RAW_MATERIAL' ? entry.color_code_count : '—'}
                  </td>
                  <td className="num">{entry.transaction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}