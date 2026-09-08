import { useEffect, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import type { MaterialCode, RawMaterial } from '../types';
import { materialCodesApi } from '../api/materialCodes';

interface CodeSubNavProps {
  rawMaterial: RawMaterial | null;
  selectedCodeId: number | null;
  onSelectCode: (code: MaterialCode | null) => void;
}

export default function CodeSubNav({
  rawMaterial,
  selectedCodeId,
  onSelectCode,
}: CodeSubNavProps) {
  const [codes, setCodes] = useState<MaterialCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (rawMaterial) {
      loadCodes(rawMaterial.id);
    } else {
      setCodes([]);
    }
  }, [rawMaterial]);

  async function loadCodes(rawMaterialId: number) {
    setLoading(true);
    try {
      const data = await materialCodesApi.getByRawMaterial(rawMaterialId);
      setCodes(data);
    } catch (err) {
      console.error('Failed to load material codes', err);
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(newCode: MaterialCode) {
    setCodes((prev) => [...prev, newCode].sort((a, b) => a.code.localeCompare(b.code)));
    onSelectCode(newCode);
    setModalOpen(false);
  }

  if (!rawMaterial) {
    return (
      <div className="subnav subnav-empty">
        <p>Select a raw material to view its color codes.</p>
      </div>
    );
  }

  return (
    <div className="subnav">
      <div className="subnav-header">
        <span className="subnav-title">Codes under {rawMaterial.name}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setModalOpen(true)}
          aria-label="Add code"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="subnav-list">
        {loading && <span className="subnav-empty-text">Loading…</span>}
        {!loading && codes.length === 0 && (
          <span className="subnav-empty-text">No codes yet.</span>
        )}
        {codes.map((code) => (
          <button
            key={code.id}
            type="button"
            className={`subnav-item ${selectedCodeId === code.id ? 'active' : ''}`}
            onClick={() => onSelectCode(code)}
          >
            <Tag size={13} />
            <span>{code.code}</span>
          </button>
        ))}
      </div>

      {modalOpen && (
        <AddCodeModal
          rawMaterialId={rawMaterial.id}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

interface AddCodeModalProps {
  rawMaterialId: number;
  onClose: () => void;
  onCreated: (code: MaterialCode) => void;
}

function AddCodeModal({ rawMaterialId, onClose, onCreated }: AddCodeModalProps) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await materialCodesApi.create(
        rawMaterialId,
        trimmed,
        description.trim() || undefined
      );
      onCreated(created);
    } catch (err) {
      console.error(err);
      setError('Could not save. That code may already exist for this material.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add color code</h3>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="code-value">
            Code
          </label>
          <input
            id="code-value"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. C-102"
            autoFocus
          />

          <label className="field-label" htmlFor="code-desc">
            Description (optional)
          </label>
          <input
            id="code-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Maroon dyed batch"
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
