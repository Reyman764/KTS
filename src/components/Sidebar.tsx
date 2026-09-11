import { useEffect, useRef, useState } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { Plus, Package, ChevronsLeft, ChevronsRight, Pencil, Trash2 } from 'lucide-react';
import type { RawMaterial } from '../types';
import { rawMaterialsApi } from '../api/rawMaterials';

interface SidebarProps {
  selectedRawMaterialId: number | null;
  onSelectRawMaterial: (rawMaterial: RawMaterial) => void;
  onDeletedRawMaterial: (id: number) => void;
  refreshKey: number;
}

const ROW_HEIGHT = 38; // must match .sidebar-item-row height in CSS
// Below this count, a plain rendered list is instant and simpler than
// virtualizing — virtualization overhead isn't worth it for small lists.
const VIRTUALIZE_THRESHOLD = 60;

export default function Sidebar({
  selectedRawMaterialId,
  onSelectRawMaterial,
  onDeletedRawMaterial,
  refreshKey,
}: SidebarProps) {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<RawMaterial | null>(null);

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

  function handleUpdated(updated: RawMaterial) {
    setRawMaterials((prev) =>
      prev
        .map((rm) => (rm.id === updated.id ? updated : rm))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingMaterial(null);
  }

  function handleDeleted(id: number) {
    setRawMaterials((prev) => prev.filter((rm) => rm.id !== id));
    setDeletingMaterial(null);
    if (selectedRawMaterialId === id) {
      onDeletedRawMaterial(id);
    }
  }

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        {!collapsed && (
          <>
            <div className="sidebar-header">
              <h2>Raw materials</h2>
              <div className="sidebar-header-actions">
                {rawMaterials.length > 0 && (
                  <span className="subnav-count">{rawMaterials.length}</span>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setModalOpen(true)}
                  aria-label="Add raw material"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn sidebar-collapse-btn"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronsLeft size={16} />
                </button>
              </div>
            </div>

            {loading && <p className="sidebar-empty">Loading…</p>}
            {!loading && rawMaterials.length === 0 && (
              <p className="sidebar-empty">No raw materials yet.</p>
            )}
            {!loading && rawMaterials.length > 0 && (
              rawMaterials.length > VIRTUALIZE_THRESHOLD ? (
                <VirtualizedRawMaterialList
                  rawMaterials={rawMaterials}
                  selectedRawMaterialId={selectedRawMaterialId}
                  onSelect={onSelectRawMaterial}
                  onEdit={setEditingMaterial}
                  onDelete={setDeletingMaterial}
                />
              ) : (
                <div className="sidebar-list">
                  {rawMaterials.map((rm) => (
                    <RawMaterialRow
                      key={rm.id}
                      rawMaterial={rm}
                      selected={selectedRawMaterialId === rm.id}
                      onSelect={() => onSelectRawMaterial(rm)}
                      onEdit={() => setEditingMaterial(rm)}
                      onDelete={() => setDeletingMaterial(rm)}
                    />
                  ))}
                </div>
              )
            )}

            {modalOpen && (
              <AddRawMaterialModal
                onClose={() => setModalOpen(false)}
                onCreated={handleCreated}
              />
            )}

            {editingMaterial && (
              <EditRawMaterialModal
                rawMaterial={editingMaterial}
                onClose={() => setEditingMaterial(null)}
                onUpdated={handleUpdated}
              />
            )}

            {deletingMaterial && (
              <DeleteRawMaterialModal
                rawMaterial={deletingMaterial}
                onClose={() => setDeletingMaterial(null)}
                onDeleted={handleDeleted}
              />
            )}
          </>
        )}
      </aside>

      {collapsed && (
        <button
          type="button"
          className="sidebar-pull-tab"
          onClick={() => setCollapsed(false)}
          aria-label="Show raw materials"
          title="Show raw materials"
        >
          <ChevronsRight size={15} />
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Virtualized list — only mounts DOM nodes for rows currently scrolled into
// view, which is what keeps this fast with thousands of raw materials.
// ---------------------------------------------------------------------------

interface VirtualizedRawMaterialListProps {
  rawMaterials: RawMaterial[];
  selectedRawMaterialId: number | null;
  onSelect: (rawMaterial: RawMaterial) => void;
  onEdit: (rawMaterial: RawMaterial) => void;
  onDelete: (rawMaterial: RawMaterial) => void;
}

function VirtualizedRawMaterialList({
  rawMaterials,
  selectedRawMaterialId,
  onSelect,
  onEdit,
  onDelete,
}: VirtualizedRawMaterialListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rawMaterials.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="sidebar-list sidebar-list-virtual">
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
          const rm = rawMaterials[virtualRow.index];
          return (
            <div
              key={rm.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <RawMaterialRow
                rawMaterial={rm}
                selected={selectedRawMaterialId === rm.id}
                onSelect={() => onSelect(rm)}
                onEdit={() => onEdit(rm)}
                onDelete={() => onDelete(rm)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RawMaterialRowProps {
  rawMaterial: RawMaterial;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function RawMaterialRow({ rawMaterial, selected, onSelect, onEdit, onDelete }: RawMaterialRowProps) {
  return (
    <div className={`sidebar-item-row ${selected ? 'active' : ''}`}>
      <button
        type="button"
        className={`sidebar-item ${selected ? 'active' : ''}`}
        onClick={onSelect}
      >
        <Package size={16} />
        <span>{rawMaterial.name}</span>
      </button>
      <div className="sidebar-item-actions">
        <button
          type="button"
          className="row-action-btn"
          onClick={onEdit}
          aria-label={`Edit ${rawMaterial.name}`}
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          className="row-action-btn row-action-danger"
          onClick={onDelete}
          aria-label={`Delete ${rawMaterial.name}`}
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
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

interface EditRawMaterialModalProps {
  rawMaterial: RawMaterial;
  onClose: () => void;
  onUpdated: (rawMaterial: RawMaterial) => void;
}

function EditRawMaterialModal({ rawMaterial, onClose, onUpdated }: EditRawMaterialModalProps) {
  const [name, setName] = useState(rawMaterial.name);
  const [unit, setUnit] = useState(rawMaterial.unit);
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
      const updated = await rawMaterialsApi.update(rawMaterial.id, trimmed, unit.trim() || 'kg');
      onUpdated(updated);
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
        <h3>Edit raw material</h3>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="rm-edit-name">
            Name
          </label>
          <input
            id="rm-edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <label className="field-label" htmlFor="rm-edit-unit">
            Unit
          </label>
          <input
            id="rm-edit-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
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

interface DeleteRawMaterialModalProps {
  rawMaterial: RawMaterial;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function DeleteRawMaterialModal({ rawMaterial, onClose, onDeleted }: DeleteRawMaterialModalProps) {
  const [impact, setImpact] = useState<{ colorCodeCount: number; transactionCount: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rawMaterialsApi
      .getDeleteImpact(rawMaterial.id)
      .then((result) =>
        setImpact({
          colorCodeCount: result.colorCodeCount ?? 0,
          transactionCount: result.transactionCount,
        })
      )
      .catch((err) => {
        console.error('Failed to load delete impact', err);
        setError('Could not check what would be deleted.');
      })
      .finally(() => setLoadingImpact(false));
  }, [rawMaterial.id]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await rawMaterialsApi.delete(rawMaterial.id);
      onDeleted(rawMaterial.id);
    } catch (err) {
      console.error(err);
      setError('Could not delete this raw material.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete "{rawMaterial.name}"?</h3>
        {loadingImpact && <p className="delete-confirm-text">Checking what this affects…</p>}
        {!loadingImpact && impact && (
          <p className="delete-confirm-text">
            This will permanently delete this raw material
            {impact.colorCodeCount > 0 && (
              <> along with <strong>{impact.colorCodeCount}</strong> color code{impact.colorCodeCount === 1 ? '' : 's'}</>
            )}
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
            {submitting ? 'Deleting…' : 'Delete raw material'}
          </button>
        </div>
      </div>
    </div>
  );
}