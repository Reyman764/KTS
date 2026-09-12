import { useEffect, useState } from 'react';
import { Archive, X } from 'lucide-react';
import type { ArchivedEntity, ArchivedTransaction, FiscalYearClosure } from '../types';
import { fiscalYearApi } from '../api/fiscalYear';

interface ArchiveBrowserProps {
  onClose: () => void;
}

// Read-only viewer for past closed fiscal years — the "old ledger book on
// the shelf" equivalent. Pick a year, pick a raw material or color code
// that had activity that year, see its frozen transactions exactly as they
// stood at closing. Nothing here can be edited or deleted; archived history
// is permanent record.
export default function ArchiveBrowser({ onClose }: ArchiveBrowserProps) {
  const [closures, setClosures] = useState<FiscalYearClosure[]>([]);
  const [loadingClosures, setLoadingClosures] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const [entities, setEntities] = useState<ArchivedEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ArchivedEntity | null>(null);

  const [rows, setRows] = useState<ArchivedTransaction[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fiscalYearApi
      .list()
      .then((data) => {
        setClosures(data);
        if (data.length > 0) setSelectedLabel(data[0].label);
      })
      .catch((err) => {
        console.error('Failed to load fiscal year closures', err);
        setError('Could not load the list of closed years.');
      })
      .finally(() => setLoadingClosures(false));
  }, []);

  useEffect(() => {
    if (!selectedLabel) return;
    setSelectedEntity(null);
    setRows([]);
    setLoadingEntities(true);
    fiscalYearApi
      .getArchivedEntities(selectedLabel)
      .then(setEntities)
      .catch((err) => {
        console.error('Failed to load archived entities', err);
        setError('Could not load items for this year.');
      })
      .finally(() => setLoadingEntities(false));
  }, [selectedLabel]);

  useEffect(() => {
    if (!selectedLabel || !selectedEntity) return;
    setLoadingRows(true);
    fiscalYearApi
      .getArchivedTransactions(selectedEntity.entityType, selectedEntity.entityId, selectedLabel)
      .then(setRows)
      .catch((err) => {
        console.error('Failed to load archived transactions', err);
        setError('Could not load transactions for this item.');
      })
      .finally(() => setLoadingRows(false));
  }, [selectedLabel, selectedEntity]);

  return (
    <div className="archive-browser-overlay">
      <div className="archive-browser-panel">
        <div className="archive-browser-header">
          <h2>
            <Archive size={17} /> Archived Fiscal Years
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {error && <p className="field-error archive-browser-error">{error}</p>}

        {!loadingClosures && closures.length === 0 && (
          <p className="archive-browser-empty">
            No fiscal years have been closed yet. Once you close a year from Reports, it will show
            up here.
          </p>
        )}

        {closures.length > 0 && (
          <div className="archive-browser-body">
            <div className="archive-browser-column archive-browser-years">
              <span className="archive-browser-column-title">Closed years</span>
              {closures.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`archive-browser-year-item ${selectedLabel === c.label ? 'active' : ''}`}
                  onClick={() => setSelectedLabel(c.label)}
                >
                  <span className="archive-browser-year-label">{c.label}</span>
                  <span className="archive-browser-year-meta">
                    {c.entity_count} items · {c.transaction_count} entries
                  </span>
                </button>
              ))}
            </div>

            <div className="archive-browser-column archive-browser-entities">
              <span className="archive-browser-column-title">
                {loadingEntities ? 'Loading…' : `Items (${entities.length})`}
              </span>
              {!loadingEntities && entities.length === 0 && (
                <p className="archive-browser-empty-small">Nothing archived for this year.</p>
              )}
              {entities.map((e) => (
                <button
                  key={`${e.entityType}:${e.entityId}`}
                  type="button"
                  className={`archive-browser-entity-item ${
                    selectedEntity?.entityId === e.entityId && selectedEntity?.entityType === e.entityType
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => setSelectedEntity(e)}
                >
                  {e.label}
                </button>
              ))}
            </div>

            <div className="archive-browser-column archive-browser-ledger">
              {!selectedEntity && (
                <p className="archive-browser-empty-small">
                  Select an item on the left to view its {selectedLabel} ledger.
                </p>
              )}

              {selectedEntity && (
                <>
                  <div className="archive-browser-ledger-title">
                    <span>{selectedEntity.label}</span>
                    <span className="archive-browser-readonly-badge">Read-only · {selectedLabel}</span>
                  </div>

                  {loadingRows && <p className="archive-browser-empty-small">Loading…</p>}

                  {!loadingRows && rows.length === 0 && (
                    <p className="archive-browser-empty-small">No archived transactions found.</p>
                  )}

                  {!loadingRows && rows.length > 0 && (
                    <div className="ledger-table-wrap archive-browser-table-wrap">
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
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.id}
                              className={row.entry_type !== 'NORMAL' ? `entry-${row.entry_type.toLowerCase()}` : ''}
                            >
                              <td>{row.date}</td>
                              <td>
                                {row.description}
                                {row.entry_type === 'BALANCE_BROUGHT_DOWN' && (
                                  <span className="entry-badge archive-browser-bbd-badge">Opening balance</span>
                                )}
                                {row.entry_type === 'DRYING_LOSS' && (
                                  <span className="entry-badge">Drying loss</span>
                                )}
                                {row.entry_type === 'AUDIT_ADJUSTMENT' && (
                                  <span className="entry-badge">Audit adj.</span>
                                )}
                              </td>
                              <td>{row.buyer}</td>
                              <td>{row.order_no}</td>
                              <td>{row.lot_no}</td>
                              <td>{row.rack_no}</td>
                              <td className="num">{row.receive_from_dye ? row.receive_from_dye.toFixed(2) : ''}</td>
                              <td className="num">{row.knitting_distribution ? row.knitting_distribution.toFixed(2) : ''}</td>
                              <td className="num">{row.return_qty ? row.return_qty.toFixed(2) : ''}</td>
                              <td className="num balance-cell">{row.balance.toFixed(2)}</td>
                              <td className="num">{row.assorted ? row.assorted.toFixed(2) : ''}</td>
                              <td className="num">{row.wastage ? row.wastage.toFixed(2) : ''}</td>
                              <td>{row.remark}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}