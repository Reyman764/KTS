import { useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { backupApi } from '../api/backup';

interface BackupRestoreProps {
  mode: 'BACKUP' | 'RESTORE';
  onClose: () => void;
}

type Step = 'IDLE' | 'RUNNING' | 'DONE' | 'ERROR' | 'RELAUNCHING';

// A focused modal for the two things a shop owner needs on a daily basis:
// saving a copy of the database somewhere safe (USB drive, synced folder),
// and bringing an older copy back if something goes wrong. Mirrors
// FiscalYearClose's visual pattern (overlay/panel/header/body) since both
// are "careful, infrequent, consequential" database operations.
export default function BackupRestore({ mode, onClose }: BackupRestoreProps) {
  const [step, setStep] = useState<Step>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);

  async function handleBackupNow() {
    setStep('RUNNING');
    setError(null);
    try {
      const result = await backupApi.createNow();
      if (result.canceled) {
        setStep('IDLE');
        return;
      }
      setSavedPath(result.backupPath ?? null);
      setStep('DONE');
    } catch (err) {
      console.error('Backup failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`The backup could not be saved: ${message}`);
      setStep('ERROR');
    }
  }

  async function handleRestore() {
    setStep('RUNNING');
    setError(null);
    try {
      const result = await backupApi.restore();
      if (result.canceled) {
        setStep('IDLE');
        return;
      }
      setRestoredFrom(result.restoredFrom ?? null);
      setStep('DONE');
    } catch (err) {
      console.error('Restore failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`The restore did not complete — the current data has not been changed: ${message}`);
      setStep('ERROR');
    }
  }

  async function handleRelaunch() {
    setStep('RELAUNCHING');
    await backupApi.relaunch();
  }

  return (
    <div className="fiscal-close-overlay">
      <div className="fiscal-close-panel">
        <div className="fiscal-close-header">
          <h2>{mode === 'BACKUP' ? 'Backup Data' : 'Restore from Backup'}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={step === 'RUNNING' || step === 'RELAUNCHING'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="fiscal-close-body">
          {step === 'IDLE' && mode === 'BACKUP' && (
            <>
              <p className="fiscal-close-intro">
                This saves a full copy of the current database to a location you choose — a USB
                drive, an external disk, or a synced folder. Doing this at the end of each working
                day is the safest habit; at minimum, do it weekly.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleBackupNow}>
                  Choose Location &amp; Backup Now
                </button>
              </div>
            </>
          )}

          {step === 'IDLE' && mode === 'RESTORE' && (
            <>
              <p className="fiscal-close-intro">
                This replaces the current data with an earlier backup file (.db). Use this only if
                today's data is wrong or lost and you need to go back to a saved copy.
              </p>
              <div className="fiscal-close-warning">
                <AlertTriangle size={16} />
                <span>
                  Anything entered after the backup's date will be lost. A safety copy of the
                  current data is made automatically before restoring, just in case the wrong file
                  is chosen. The app will restart once the restore finishes.
                </span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="btn-danger" onClick={handleRestore}>
                  Choose Backup File &amp; Restore
                </button>
              </div>
            </>
          )}

          {step === 'RUNNING' && (
            <p className="fiscal-close-status">
              {mode === 'BACKUP' ? 'Saving backup…' : 'Restoring — please don\u2019t close the app…'}
            </p>
          )}

          {step === 'ERROR' && (
            <div className="fiscal-close-error-block">
              <AlertTriangle size={20} />
              <p>{error}</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep('IDLE')}
              >
                Try again
              </button>
            </div>
          )}

          {step === 'DONE' && mode === 'BACKUP' && (
            <div className="fiscal-close-done">
              <CheckCircle2 size={28} className="fiscal-close-done-icon" />
              <h3>Backup saved</h3>
              {savedPath && <p className="fiscal-close-backup-path">Saved to: {savedPath}</p>}
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {step === 'DONE' && mode === 'RESTORE' && (
            <div className="fiscal-close-done">
              <CheckCircle2 size={28} className="fiscal-close-done-icon" />
              <h3>Restore complete</h3>
              {restoredFrom && (
                <p className="fiscal-close-backup-path">Restored from: {restoredFrom}</p>
              )}
              <p>The app needs to restart to load the restored data.</p>
              <button type="button" className="btn-primary" onClick={handleRelaunch}>
                Restart Now
              </button>
            </div>
          )}

          {step === 'RELAUNCHING' && (
            <p className="fiscal-close-status">Restarting…</p>
          )}
        </div>
      </div>
    </div>
  );
}