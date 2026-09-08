import { useEffect, useState } from 'react';
import { Plus, Package } from 'lucide-react';
import type { RawMaterial } from '../types';
import { rawMaterialsApi } from '../api/rawMaterials';

interface SidebarProps {
  selectedRawMaterialId: number | null;
  onSelectRawMaterial: (rawMaterial: RawMaterial) => void;
  refreshKey: number;
}

export default function Sidebar({
  selectedRawMaterialId,
  onSelectRawMaterial,
  refreshKey,
}: SidebarProps) {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    loadRawMaterials();
  }, [refreshKey]);

  async function loadRawMaterials() {
    setLoading(true);
    try {
      const data = await rawMaterialsApi.getAll();
      setRawMaterials(data);
    } catch (err) {
      console.error('Failed to load raw materials', err);
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(newMaterial: RawMaterial) {
    setRawMaterials((prev) =>
      [...prev, newMaterial].sort((a, b) => a.name.localeCompare(b.name))
    );
    onSelectRawMaterial(newMaterial);
    setModalOpen(false);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Raw materials</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setModalOpen(true)}
          aria-label="Add raw material"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="sidebar-list">
        {loading && <p className="sidebar-empty">Loading…</p>}
        {!loading && rawMaterials.length === 0 && (
          <p className="sidebar-empty">No raw materials yet.</p>
        )}
        {rawMaterials.map((rm) => (
          <button
            key={rm.id}
            type="button"
            className={`sidebar-item ${selectedRawMaterialId === rm.id ? 'active' : ''}`}
            onClick={() => onSelectRawMaterial(rm)}
          >
            <Package size={16} />
            <span>{rm.name}</span>
          </button>
        ))}
      </div>

      {modalOpen && (
        <AddRawMaterialModal
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </aside>
  );
}

interface AddRawMaterialModalProps {
  onClose: () => void;
  onCreated: (rawMaterial: RawMaterial) => void;
}

function AddRawMaterialModal({ onClose, onCreated }: AddRawMaterialModalProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a raw material name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await rawMaterialsApi.create(trimmed, unit.trim() || 'kg');
      onCreated(created);
    } catch (err) {
      console.error(err);
      setError('Could not save. That name may already exist.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add raw material</h3>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="rm-name">
            Name
          </label>
          <input
            id="rm-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Raw Wool"
            autoFocus
          />

          <label className="field-label" htmlFor="rm-unit">
            Unit
          </label>
          <input
            id="rm-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="kg"
          />

          {error && <p className="field-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
