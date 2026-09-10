import { useEffect, useMemo, useState } from 'react';
import { Plus, Tag, Search, X, ChevronDown } from 'lucide-react';
import type { MaterialCode, RawMaterial } from '../types';
import { materialCodesApi } from '../api/materialCodes';

interface CodeSubNavProps {
  rawMaterial: RawMaterial | null;
  selectedCodeId: number | null;
  onSelectCode: (code: MaterialCode | null) => void;
}

const codeCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const COLLAPSE_THRESHOLD = 12;

export default function CodeSubNav({
  rawMaterial,
  selectedCodeId,
  onSelectCode,
}: CodeSubNavProps) {
  const [codes, setCodes] = useState<MaterialCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setFilter('');
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
      const sorted = [...data].sort((a, b) => codeCollator.compare(a.code, b.code));
      setCodes(sorted);
      // Start collapsed for long lists once a code is already selected —
      // otherwise leave it open so the user can see what's available.
      setExpanded(!(sorted.length > COLLAPSE_THRESHOLD && selectedCodeId));
    } catch (err) {
      console.error('Failed to load material codes', err);
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(newCode: MaterialCode) {
    setCodes((prev) =>
      [...prev, newCode].sort((a, b) => codeCollator.compare(a.code, b.code))
    );
    onSelectCode(newCode);
    setModalOpen(false);
  }

  function handleSelect(code: MaterialCode) {
    onSelectCode(code);
    if (codes.length > COLLAPSE_THRESHOLD) {
      setExpanded(false);
    }
  }

  const filteredCodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter((c) => c.code.toLowerCase().includes(q));
  }, [codes, filter]);

  const selectedCode = useMemo(
    () => codes.find((c) => c.id === selectedCodeId) ?? null,
    [codes, selectedCodeId]
  );

  if (!rawMaterial) {
    return (
      <div className="subnav subnav-empty">
        <p>Select a raw material to view its color codes.</p>
      </div>
    );
  }

  const showSearch = codes.length > COLLAPSE_THRESHOLD;
  const collapsible = codes.length > COLLAPSE_THRESHOLD;

  return (
    <div className="subnav">
      <button
        type="button"
        className="subnav-header subnav-header-toggle"
        onClick={() => collapsible && setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!collapsible}
      >
        <span className="subnav-title">
          Codes under {rawMaterial.name}
          {!expanded && selectedCode && (
            <span className="subnav-title-selected"> — {selectedCode.code}</span>
          )}
        </span>
        <div className="subnav-header-actions">
          {codes.length > 0 && (
            <span className="subnav-count">{codes.length}</span>
          )}
          {collapsible && (
            <ChevronDown
              size={15}
              className={`subnav-chevron ${expanded ? 'expanded' : ''}`}
            />
          )}
          <span
            role="button"
            tabIndex={0}
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                setModalOpen(true);
              }
            }}
            aria-label="Add code"
          >
            <Plus size={14} />
          </span>
        </div>
      </button>

      {expanded && (
        <>
          {showSearch && (
            <div className="subnav-search">
              <Search size={13} className="subnav-search-icon" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${codes.length} codes…`}
                aria-label="Filter color codes"
              />
              {filter && (
                <button
                  type="button"
                  className="subnav-search-clear"
                  onClick={() => setFilter('')}
                  aria-label="Clear filter"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          <div className="subnav-list">
            {loading && <span className="subnav-empty-text">Loading…</span>}
            {!loading && codes.length === 0 && (
              <span className="subnav-empty-text">No codes yet.</span>
            )}
            {!loading && codes.length > 0 && filteredCodes.length === 0 && (
              <span className="subnav-empty-text">No codes match "{filter}".</span>
            )}
            {filteredCodes.map((code) => (
              <button
                key={code.id}
                type="button"
                className={`subnav-item ${selectedCodeId === code.id ? 'active' : ''}`}
                onClick={() => handleSelect(code)}
              >
                <Tag size={13} />
                <span>{code.code}</span>
              </button>
            ))}
          </div>
        </>
      )}

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