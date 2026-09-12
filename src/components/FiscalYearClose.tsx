import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { FiscalYearCloseResult, FiscalYearPreview } from '../types';
import { fiscalYearApi } from '../api/fiscalYear';

interface FiscalYearCloseProps {
  onClose: () => void;
}

type Step = 'LOADING_PREVIEW' | 'PREVIEW' | 'RUNNING' | 'DONE' | 'ERROR';

// The "Balance Brought Down" year-end closure flow — mirrors a physical
// ledger book's Asar-month ritual: every raw material and color code's
// current balance is carried forward as the opening line of a fresh page,
// and everything before it is filed away as that year's closed record.
// This is presented as a focused full-screen flow rather than a small
// modal, since it's a multi-step, consequential, whole-database operation —
// not a quick edit.
export default function FiscalYearClose({ onClose }: FiscalYearCloseProps) {
  const [step, setStep] = useState<Step>('LOADING_PREVIEW');
  const [preview, setPreview] = useState<FiscalYearPreview | null>(null);
  const [label, setLabel] = useState('');
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalYearCloseResult | null>(null);

  useEffect(() => {
    loadPreview();
  }, []);

  async function loadPreview() {
    setStep('LOADING_PREVIEW');
    setError(null);
    try {
      const data = await fiscalYearApi.preview();
      setPreview(data);
      setStep('PREVIEW');
    } catch (err) {
      console.error('Failed to load fiscal year preview', err);
      setError('Could not load the preview. Nothing has been changed.');
      setStep('ERROR');
    }
  }

  async function handleConfirmClose() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Enter a label for the year being closed (e.g. "2082-83" or "Asar 2026").');
      return;
    }
    if (!openingDate) {
      setError('Pick an opening date for the new year.');
      return;
    }

    setStep('RUNNING');
    setError(null);
    try {
      const data = await fiscalYearApi.close(trimmedLabel, openingDate);
      setResult(data);
      setStep('DONE');
    } catch (err) {
      console.error('Fiscal year close failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(
        `The closure failed and was rolled back — nothing was changed: ${message}`
      );
      setStep('ERROR');
    }
  }

  const touchedEntities = preview?.entities.filter((e) => e.transactionCount > 0) ?? [];

  return (
    <div className="fiscal-close-overlay">
      <div className="fiscal-close-panel">
        <div className="fiscal-close-header">
          <h2>Close Fiscal Year — Balance Brought Down</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={step === 'RUNNING'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="fiscal-close-body">
          {step === 'LOADING_PREVIEW' && (
            <p className="fiscal-close-status">Loading current balances…</p>
          )}

          {step === 'ERROR' && (
            <div className="fiscal-close-error-block">
              <AlertTriangle size={20} />
              <p>{error}</p>
              <button type="button" className="btn-secondary" onClick={loadPreview}>
                Try again
              </button>
            </div>
          )}

          {step === 'PREVIEW' && preview && (
            <>
              <p className="fiscal-close-intro">
                This will archive every transaction recorded so far for each raw material and color
                code below, and start a fresh ledger for each with a single{' '}
                <strong>"Balance Brought Down"</strong> entry carrying its current balance forward.
                A backup of the entire database is made automatically before anything is changed.
                Items with no transactions yet are left untouched.
              </p>

              <div className="fiscal-close-summary-cards">
                <div className="fiscal-close-summary-card">
                  <span className="summary-label">Items to close</span>
                  <span className="summary-value">{touchedEntities.length}</span>
                </div>
                <div className="fiscal-close-summary-card">
                  <span className="summary-label">Transactions archived</span>
                  <span className="summary-value">{preview.totalTransactionCount}</span>
                </div>
                <div className="fiscal-close-summary-card">
                  <span className="summary-label">Untouched (no activity)</span>
                  <span className="summary-value">
                    {preview.totalEntities - preview.entitiesWithTransactions}
                  </span>
                </div>
              </div>

              {touchedEntities.length > 0 && (
                <div className="fiscal-close-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Raw Material / Color Code</th>
                        <th className="num">Entries</th>
                        <th className="num">Current Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {touchedEntities.map((e) => (
                        <tr key={`${e.entityType}:${e.entityId}`}>
                          <td>{e.label}</td>
                          <td className="num">{e.transactionCount}</td>
                          <td className="num balance-cell">
                            {e.currentBalance.toFixed(2)} {e.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {touchedEntities.length === 0 && (
                <p className="fiscal-close-empty">
                  Nothing has any transactions recorded yet — there's nothing to close.
                </p>
              )}

              {touchedEntities.length > 0 && (
                <div className="fiscal-close-confirm-form">
                  <div>
                    <label className="field-label" htmlFor="fy-label">
                      Fiscal year label (for the year being closed)
                    </label>
                    <input
                      id="fy-label"
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder='e.g. "2082-83" or "Asar 2026"'
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="fy-opening-date">
                      Opening date for the new year
                    </label>
                    <input
                      id="fy-opening-date"
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                    />
                  </div>

                  {error && <p className="field-error">{error}</p>}

                  <div className="fiscal-close-warning">
                    <AlertTriangle size={16} />
                    <span>
                      This cannot be undone from within the app. A backup file will be created
                      first, but double-check the label and date before continuing.
                    </span>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                      Cancel
                    </button>
                    <button type="button" className="btn-danger" onClick={handleConfirmClose}>
                      Close {touchedEntities.length} item{touchedEntities.length === 1 ? '' : 's'} for this year
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'RUNNING' && (
            <div className="fiscal-close-running">
              <p className="fiscal-close-status">
                Backing up the database and closing the year — this can take a little while with a
                large number of color codes. Please don't close the app.
              </p>
            </div>
          )}

          {step === 'DONE' && result && (
            <div className="fiscal-close-done">
              <CheckCircle2 size={28} className="fiscal-close-done-icon" />
              <h3>Year closed: {result.label}</h3>
              <p>
                {result.entityCount} item{result.entityCount === 1 ? '' : 's'} closed,{' '}
                {result.transactionCount} transaction{result.transactionCount === 1 ? '' : 's'}{' '}
                archived.
              </p>
              <p className="fiscal-close-backup-path">Backup saved to: {result.backupPath}</p>
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}