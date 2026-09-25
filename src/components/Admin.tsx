import { useState, type FormEvent } from 'react';
import { Lock, ShieldAlert, Trash2 } from 'lucide-react';
import { adminApi } from '../api/admin';
import RecycleBin from './RecycleBin';
import DeletionLog from './DeletionLog';

type AdminTab = 'RECYCLE_BIN' | 'DELETION_LOG';

// Password-gated admin area. Unlock state lives only in this component's
// memory for the current app session — closing or restarting the app
// re-locks it. There's no "remember me"; every visit to this page while
// the app is open after a fresh unlock stays unlocked, but a relaunch
// (including the one after a restore) starts locked again.
export default function Admin() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('RECYCLE_BIN');

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const result = await adminApi.unlock(password);
      if (result.unlocked) {
        setUnlocked(true);
        setPassword('');
      } else {
        setError('Incorrect password.');
      }
    } catch (err) {
      console.error(err);
      setError('Could not check the password.');
    } finally {
      setChecking(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="admin-lock-screen">
        <form className="admin-lock-panel" onSubmit={handleUnlock}>
          <Lock size={28} className="admin-lock-icon" />
          <h2>Admin Section</h2>
          <p className="delete-confirm-text">
            Enter the admin password to access the recycle bin and deletion log.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="off"
          />
          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={checking || !password}>
            {checking ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-page-header">
        <h2>Admin</h2>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${tab === 'RECYCLE_BIN' ? 'active' : ''}`}
          onClick={() => setTab('RECYCLE_BIN')}
        >
          <Trash2 size={15} /> Recycle Bin
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'DELETION_LOG' ? 'active' : ''}`}
          onClick={() => setTab('DELETION_LOG')}
        >
          <ShieldAlert size={15} /> Deletion Log
        </button>
      </div>

      {tab === 'RECYCLE_BIN' && <RecycleBin />}
      {tab === 'DELETION_LOG' && <DeletionLog />}
    </div>
  );
}