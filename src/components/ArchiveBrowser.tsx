import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { Archive, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { ArchivedEntity, ArchivedTransaction, FiscalYearClosure } from '../types';
import { fiscalYearApi } from '../api/fiscalYear';

interface ArchiveBrowserProps {
  onClose: () => void;
}

const ROW_HEIGHT = 34; // first-guess row height; the virtualizer measures real heights at runtime
// Below this many VISIBLE rows (group headers + currently-expanded codes
// combined), a plain render is instant and simpler than virtualizing.
const VIRTUALIZE_THRESHOLD = 60;
// Archived transactions are paginated server-side — a bulk raw material can
// have tens of thousands of rows for one closed year, and rendering them all
// at once froze the viewer for seconds.
const ROWS_PAGE_SIZE = 100;

interface EntityGroup {
  rawMaterialId: number;
  rawMaterialName: string;
  rawMaterialEntity: ArchivedEntity | null;
  codes: ArchivedEntity[];
}

type VisibleRow =
  | { kind: 'group'; group: EntityGroup }
  | { kind: 'code'; code: ArchivedEntity; rawMaterialName: string };

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
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsPage, setRowsPage] = useState(1);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Group entities by raw material so color codes nest under their parent
  // instead of a 1000+ item flat list — mirrors CodeSubNav's structure in
  // the live ledger. A raw material's own group key is its own id; a color
  // code groups under its parent's rawMaterialId. Groups with only one
  // color code and no direct raw-material activity still get a synthetic
  // header built from rawMaterialName, since the parent itself may not
  // appear as its own entity if it had no direct transactions that year.
  const groupedEntities = useMemo(() => {
    const groups = new Map<number, EntityGroup>();

    for (const e of entities) {
      const groupKey = e.rawMaterialId ?? -1;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          rawMaterialId: groupKey,
          rawMaterialName: e.rawMaterialName,
          rawMaterialEntity: null,
          codes: [],
        });
      }
      const group = groups.get(groupKey)!;
      if (e.entityType === 'RAW_MATERIAL') {
        group.rawMaterialEntity = e;
      } else {
        group.codes.push(e);
      }
    }

    return [...groups.values()]
      .map((g) => ({
        ...g,
        codes: g.codes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      }))
      .sort((a, b) => a.rawMaterialName.localeCompare(b.rawMaterialName, undefined, { numeric: true }));
  }, [entities]);

  function toggleGroup(rawMaterialId: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(rawMaterialId)) {
        next.delete(rawMaterialId);
      } else {
        next.add(rawMaterialId);
      }
      return next;
    });
  }

  // Flattens the grouped tree into one list of visible rows (a group header,
  // optionally followed by its codes if expanded) — this is what actually
  // gets virtualized, since the tree's visible shape changes as groups
  // expand/collapse and the virtualizer needs a flat, indexable list.
  const visibleRows = useMemo<VisibleRow[]>(() => {
    const out: VisibleRow[] = [];
    for (const group of groupedEntities) {
      out.push({ kind: 'group', group });
      if (expandedGroups.has(group.rawMaterialId)) {
        for (const code of group.codes) {
          out.push({ kind: 'code', code, rawMaterialName: group.rawMaterialName });
        }
      }
    }
    return out;
  }, [groupedEntities, expandedGroups]);

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
    setRowsTotal(0);
    setExpandedGroups(new Set());
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

  // Reset to page 1 whenever the selected entity or year changes, so a new
  // selection never lands mid-way through a previous item's pages.
  useEffect(() => {
    setRowsPage(1);
  }, [selectedLabel, selectedEntity]);

  useEffect(() => {
    if (!selectedLabel || !selectedEntity) return;
    setLoadingRows(true);
    fiscalYearApi
      .getArchivedTransactions(
        selectedEntity.entityType,
        selectedEntity.entityId,
        selectedLabel,
        rowsPage,
        ROWS_PAGE_SIZE
      )
      .then((result) => {
        setRows(result.rows);
        setRowsTotal(result.total);
      })
      .catch((err) => {
        console.error('Failed to load archived transactions', err);
        setError('Could not load transactions for this item.');
      })
      .finally(() => setLoadingRows(false));
  }, [selectedLabel, selectedEntity, rowsPage]);

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
                {loadingEntities ? 'Loading…' : `Raw materials (${groupedEntities.length})`}
              </span>
              {!loadingEntities && entities.length === 0 && (
                <p className="archive-browser-empty-small">Nothing archived for this year.</p>
              )}
              {!loadingEntities && visibleRows.length > 0 && (
                visibleRows.length > VIRTUALIZE_THRESHOLD ? (
                  <VirtualizedEntityTree
                    visibleRows={visibleRows}
                    expandedGroups={expandedGroups}
                    selectedEntity={selectedEntity}
                    onToggleGroup={toggleGroup}
                    onSelectEntity={setSelectedEntity}
                  />
                ) : (
                  <div className="archive-browser-tree-plain">
                    {visibleRows.map((row) => (
                      <EntityTreeRow
                        key={row.kind === 'group' ? `g:${row.group.rawMaterialId}` : `c:${row.code.entityType}:${row.code.entityId}`}
                        row={row}
                        expanded={row.kind === 'group' && expandedGroups.has(row.group.rawMaterialId)}
                        selectedEntity={selectedEntity}
                        onToggleGroup={toggleGroup}
                        onSelectEntity={setSelectedEntity}
                      />
                    ))}
                  </div>
                )
              )}
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

                  {!loadingRows && rowsTotal > ROWS_PAGE_SIZE && (
                    <div className="ledger-pagination archive-browser-pagination">
                      <button
                        type="button"
                        disabled={rowsPage <= 1}
                        onClick={() => setRowsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <span>
                        Page {rowsPage} of {Math.max(1, Math.ceil(rowsTotal / ROWS_PAGE_SIZE))} ({rowsTotal} entries)
                      </span>
                      <button
                        type="button"
                        disabled={rowsPage >= Math.ceil(rowsTotal / ROWS_PAGE_SIZE)}
                        onClick={() => setRowsPage((p) => p + 1)}
                      >
                        Next
                      </button>
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

// ---------------------------------------------------------------------------
// EntityTreeRow — renders one visible row (a group header or a nested code),
// shared between the plain and virtualized rendering paths so the two never
// drift out of sync with each other.
// ---------------------------------------------------------------------------

interface EntityTreeRowProps {
  row: VisibleRow;
  expanded: boolean;
  selectedEntity: ArchivedEntity | null;
  onToggleGroup: (rawMaterialId: number) => void;
  onSelectEntity: (entity: ArchivedEntity) => void;
}

function EntityTreeRow({ row, expanded, selectedEntity, onToggleGroup, onSelectEntity }: EntityTreeRowProps) {
  if (row.kind === 'code') {
    const { code, rawMaterialName } = row;
    const isActive = selectedEntity?.entityId === code.entityId && selectedEntity?.entityType === code.entityType;
    return (
      <div className="archive-browser-group-codes archive-browser-code-row">
        <button
          type="button"
          className={`archive-browser-entity-item archive-browser-code-item ${isActive ? 'active' : ''}`}
          onClick={() => onSelectEntity(code)}
          title={code.label}
        >
          {code.label.replace(`${rawMaterialName} — `, '')}
        </button>
      </div>
    );
  }

  const { group } = row;
  const hasCodes = group.codes.length > 0;
  const isActive =
    group.rawMaterialEntity &&
    selectedEntity?.entityId === group.rawMaterialEntity.entityId &&
    selectedEntity?.entityType === 'RAW_MATERIAL';

  return (
    <div className="archive-browser-group-header">
      {hasCodes ? (
        <button
          type="button"
          className="archive-browser-group-toggle"
          onClick={() => onToggleGroup(group.rawMaterialId)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span className="archive-browser-group-toggle-spacer" />
      )}
      <button
        type="button"
        className={`archive-browser-entity-item archive-browser-group-name ${isActive ? 'active' : ''} ${
          !group.rawMaterialEntity ? 'archive-browser-group-name-disabled' : ''
        }`}
        onClick={() => group.rawMaterialEntity && onSelectEntity(group.rawMaterialEntity)}
        disabled={!group.rawMaterialEntity}
        title={
          group.rawMaterialEntity
            ? group.rawMaterialName
            : `${group.rawMaterialName} (no direct entries this year — expand to see its color codes)`
        }
      >
        {group.rawMaterialName}
        {hasCodes && <span className="archive-browser-group-count">{group.codes.length}</span>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VirtualizedEntityTree — only mounts DOM nodes for rows currently scrolled
// into view. Used once the flattened visible-row count crosses
// VIRTUALIZE_THRESHOLD, which is what keeps a raw material with 1000+ color
// codes (once expanded) fast to render.
// ---------------------------------------------------------------------------

interface VirtualizedEntityTreeProps {
  visibleRows: VisibleRow[];
  expandedGroups: Set<number>;
  selectedEntity: ArchivedEntity | null;
  onToggleGroup: (rawMaterialId: number) => void;
  onSelectEntity: (entity: ArchivedEntity) => void;
}

function VirtualizedEntityTree({
  visibleRows,
  expandedGroups,
  selectedEntity,
  onToggleGroup,
  onSelectEntity,
}: VirtualizedEntityTreeProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // estimateSize is only a first guess; measureElement below lets the
  // virtualizer measure each row's real rendered height. Without that, a
  // mismatch between a hardcoded row height and the actual CSS height makes
  // the virtualizer re-position rows on every scroll frame, which feels
  // exactly like sluggish/janky scrolling.
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="archive-browser-tree-virtual">
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
          const row = visibleRows[virtualRow.index];
          const expanded = row.kind === 'group' && expandedGroups.has(row.group.rawMaterialId);
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <EntityTreeRow
                row={row}
                expanded={expanded}
                selectedEntity={selectedEntity}
                onToggleGroup={onToggleGroup}
                onSelectEntity={onSelectEntity}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}