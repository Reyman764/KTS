import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import type { QuickOption, QuickOptionField } from '../types';
import { quickOptionsApi } from '../api/quickOptions';

interface ComboBoxInputProps {
  id: string;
  field: QuickOptionField;
  value: string;
  onChange: (value: string) => void;
  options: QuickOption[];
  onOptionsChange: (options: QuickOption[]) => void;
  placeholder?: string;
}

// A text input with an attached dropdown of saved values for that field
// (Description / Buyer / Rack No / Lot No / Order No). The person can:
//  - type freely, exactly like a plain input — nothing is forced
//  - open the dropdown and pick a saved value
//  - save whatever they've typed as a new saved value (the "+" row)
//  - delete a saved value from the list (the × next to each option)
// Saving/deleting only affects the shared list — it never changes what's
// already been recorded on past ledger entries.
export default function ComboBoxInput({
  id,
  field,
  value,
  onChange,
  options,
  onOptionsChange,
  placeholder,
}: ComboBoxInputProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fieldOptions = useMemo(
    () => options.filter((o) => o.field === field),
    [options, field]
  );

  const filteredOptions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return fieldOptions;
    return fieldOptions.filter((o) => o.value.toLowerCase().includes(q));
  }, [fieldOptions, value]);

  const exactMatch = fieldOptions.some(
    (o) => o.value.toLowerCase() === value.trim().toLowerCase()
  );
  const canSaveCurrent = value.trim().length > 0 && !exactMatch;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSaveCurrent() {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const created = await quickOptionsApi.create(field, trimmed);
      // create() returns the existing row if it already existed (case-
      // insensitively), so this never creates a visible duplicate.
      const alreadyListed = options.some((o) => o.id === created.id);
      onOptionsChange(alreadyListed ? options : [...options, created]);
    } catch (err) {
      console.error('Failed to save quick option', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOption(option: QuickOption, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(option.id);
    try {
      await quickOptionsApi.delete(option.id);
      onOptionsChange(options.filter((o) => o.id !== option.id));
    } catch (err) {
      console.error('Failed to delete quick option', err);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSelect(option: QuickOption) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className="combobox" ref={containerRef}>
      <div className="combobox-input-row">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          className="combobox-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label="Show saved options"
          tabIndex={-1}
        >
          <ChevronDown size={14} className={open ? 'combobox-chevron-open' : ''} />
        </button>
      </div>

      {open && (
        <div className="combobox-dropdown">
          {canSaveCurrent && (
            <button
              type="button"
              className="combobox-save-row"
              onClick={handleSaveCurrent}
              disabled={saving}
            >
              <Plus size={13} />
              <span>Save "{value.trim()}"</span>
            </button>
          )}

          {filteredOptions.length === 0 && !canSaveCurrent && (
            <div className="combobox-empty">
              {fieldOptions.length === 0 ? 'No saved options yet.' : 'No matches.'}
            </div>
          )}

          {filteredOptions.map((option) => (
            <div
              key={option.id}
              className={`combobox-option ${option.value === value ? 'combobox-option-active' : ''}`}
              onClick={() => handleSelect(option)}
            >
              {option.value === value && <Check size={13} className="combobox-check" />}
              <span className="combobox-option-value">{option.value}</span>
              <button
                type="button"
                className="combobox-option-delete"
                onClick={(e) => handleDeleteOption(option, e)}
                disabled={deletingId === option.id}
                aria-label={`Delete "${option.value}" from saved options`}
                title="Delete from saved options"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}