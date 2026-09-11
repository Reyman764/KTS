import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { Plus, Tag, Search, X, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { MaterialCode, RawMaterial } from '../types';
import { materialCodesApi } from '../api/materialCodes';

interface CodeSubNavProps {
  rawMaterial: RawMaterial | null;
  selectedCodeId: number | null;
  onSelectCode: (code: MaterialCode | null) => void;
}

const codeCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const COLLAPSE_THRESHOLD = 12;

// The pill grid is virtualized as fixed-size rows of a fixed column count,
// rather than a natural flex-wrap, so @tanstack/react-virtual can compute
// row heights without measuring — this is what keeps 1000+ codes fast: only
// the rows actually scrolled into view are ever rendered to the DOM.
const GRID_COLUMNS = 6;
const ROW_HEIGHT = 40; // pill height + row gap, must match subnav-grid-row CSS
const LIST_HEIGHT = 168; // matches the old max-height so the layout doesn't shift
// Below this many codes, virtualization overhead isn't worth it — a plain
// flex-wrap list (the original behavior) renders instantly and reflows
// naturally with the container width.
const VIRTUALIZE_THRESHOLD = 60;

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
  const [editingCode, setEditingCode] = useState<MaterialCode | null>(null);
  const [deletingCode, setDeletingCode] = useState<MaterialCode | null>(null);

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

  function handleUpdated(updated: MaterialCode) {
    setCodes((prev) =>
      prev
        .map((c) => (c.id === updated.id ? updated : c))
        .sort((a, b) => codeCollator.compare(a.code, b.code))
    );
    setEditingCode(null);
  }

  function handleDeleted(id: number) {
    setCodes((prev) => prev.filter((c) => c.id !== id));
    setDeletingCode(null);
    if (selectedCodeId === id) {
      onSelectCode(null);
    }
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
  const collapsible = codes.length > 0;

  return (
    <div className="subnav">
      <div className="subnav-header">
        <button
          type="button"
          className="subnav-header-toggle"
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
          {codes.length > 0 && (
            <span className="subnav-count">{codes.length}</span>
          )}
          {collapsible && (
            <ChevronDown
              size={15}
              className={`subnav-chevron ${expanded ? 'expanded' : ''}`}
            />
          )}
        </button>
        <div className="subnav-header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setModalOpen(true)}
            aria-label="Add code"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

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

          {loading && <span className="subnav-empty-text">Loading…</span>}
          {!loading && codes.length === 0 && (
            <span className="subnav-empty-text">No codes yet.</span>
          )}
          {!loading && codes.length > 0 && filteredCodes.length === 0 && (
            <span className="subnav-empty-text">No codes match "{filter}".</span>
          )}
          {!loading && filteredCodes.length > 0 && (
            filteredCodes.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualizedCodeGrid
                codes={filteredCodes}
                selectedCodeId={selectedCodeId}
                onSelect={handleSelect}
                onEdit={setEditingCode}
                onDelete={setDeletingCode}
              />
            ) : (
              <div className="subnav-list">
                {filteredCodes.map((code) => (
                  <CodePill
                    key={code.id}
                    code={code}
                    selected={selectedCodeId === code.id}
                    onSelect={() => handleSelect(code)}
                    onEdit={() => setEditingCode(code)}
                    onDelete={() => setDeletingCode(code)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {modalOpen && (
        <AddCodeModal
          rawMaterialId={rawMaterial.id}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editingCode && (
        <EditCodeModal
          code={editingCode}
          onClose={() => setEditingCode(null)}
          onUpdated={handleUpdated}
        />
      )}

      {deletingCode && (
        <DeleteCodeModal
          code={deletingCode}
          onClose={() => setDeletingCode(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Virtualized grid — only mounts DOM nodes for rows currently scrolled into
// view. Codes are laid out into fixed rows of GRID_COLUMNS pills each, and
// only those rows are rendered.
// ---------------------------------------------------------------------------

interface VirtualizedCodeGridProps {
  codes: MaterialCode[];
  selectedCodeId: number | null;
  onSelect: (code: MaterialCode) => void;
  onEdit: (code: MaterialCode) => void;
  onDelete: (code: MaterialCode) => void;
}

function VirtualizedCodeGrid({
  codes,
  selectedCodeId,
  onSelect,
  onEdit,
  onDelete,
}: VirtualizedCodeGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(codes.length / GRID_COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="subnav-grid-scroll" style={{ height: LIST_HEIGHT }}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
          const start = virtualRow.index * GRID_COLUMNS;
          const rowCodes = codes.slice(start, start + GRID_COLUMNS);
          return (
            <div
              key={virtualRow.key}
              className="subnav-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowCodes.map((code) => (
                <CodePill
                  key={code.id}
                  code={code}
                  selected={selectedCodeId === code.id}
                  onSelect={() => onSelect(code)}
                  onEdit={() => onEdit(code)}
                  onDelete={() => onDelete(code)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CodePillProps {
  code: MaterialCode;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function CodePill({ code, selected, onSelect, onEdit, onDelete }: CodePillProps) {
  return (
    <div className={`subnav-item-wrap ${selected ? 'active' : ''}`}>
      <button
        type="button"
        className={`subnav-item ${selected ? 'active' : ''}`}
        onClick={onSelect}
      >
        <Tag size={13} />
        <span>{code.code}</span>
      </button>
      <span
        role="button"
        tabIndex={0}
        className="subnav-item-action"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onEdit();
          }
        }}
        aria-label={`Edit ${code.code}`}
        title="Edit"
      >
        <Pencil size={11} />
      </span>
      <span
        role="button"
        tabIndex={0}
        className="subnav-item-action subnav-item-action-danger"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onDelete();
          }
        }}
        aria-label={`Delete ${code.code}`}
        title="Delete"
      >
        <Trash2 size={11} />
      </span>
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

interface EditCodeModalProps {
  code: MaterialCode;
  onClose: () => void;
  onUpdated: (code: MaterialCode) => void;
}

function EditCodeModal({ code, onClose, onUpdated }: EditCodeModalProps) {
  const [value, setValue] = useState(code.code);
  const [description, setDescription] = useState(code.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await materialCodesApi.update(
        code.id,
        trimmed,
        description.trim() || undefined
      );
      onUpdated(updated);
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
        <h3>Edit color code</h3>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="code-edit-value">
            Code
          </label>
          <input
            id="code-edit-value"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />

          <label className="field-label" htmlFor="code-edit-desc">
            Description (optional)
          </label>
          <input
            id="code-edit-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

interface DeleteCodeModalProps {
  code: MaterialCode;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function DeleteCodeModal({ code, onClose, onDeleted }: DeleteCodeModalProps) {
  const [impact, setImpact] = useState<{ transactionCount: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    materialCodesApi
      .getDeleteImpact(code.id)
      .then((result) => setImpact({ transactionCount: result.transactionCount }))
      .catch((err) => {
        console.error('Failed to load delete impact', err);
        setError('Could not check what would be deleted.');
      })
      .finally(() => setLoadingImpact(false));
  }, [code.id]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await materialCodesApi.delete(code.id);
      onDeleted(code.id);
    } catch (err) {
      console.error(err);
      setError('Could not delete this color code.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete "{code.code}"?</h3>
        {loadingImpact && <p className="delete-confirm-text">Checking what this affects…</p>}
        {!loadingImpact && impact && (
          <p className="delete-confirm-text">
            This will permanently delete this color code
            {impact.transactionCount > 0 && (
              <> and <strong>{impact.transactionCount}</strong> ledger transaction{impact.transactionCount === 1 ? '' : 's'}</>
            )}
            . This can't be undone.
          </p>
        )}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={handleConfirm}
            disabled={submitting || loadingImpact}
          >
            {submitting ? 'Deleting…' : 'Delete color code'}
          </button>
        </div>
      </div>
    </div>
  );
}