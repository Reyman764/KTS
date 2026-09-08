export type LedgerView = 'RAW_MATERIAL' | 'COLOR_CODE';

interface LedgerTabsProps {
  activeView: LedgerView;
  onChange: (view: LedgerView) => void;
  codeSelected: boolean;
}

export default function LedgerTabs({ activeView, onChange, codeSelected }: LedgerTabsProps) {
  return (
    <div className="ledger-tabs">
      <button
        type="button"
        className={`ledger-tab ${activeView === 'RAW_MATERIAL' ? 'active' : ''}`}
        onClick={() => onChange('RAW_MATERIAL')}
      >
        Bulk raw material ledger
      </button>
      <button
        type="button"
        className={`ledger-tab ${activeView === 'COLOR_CODE' ? 'active' : ''}`}
        onClick={() => onChange('COLOR_CODE')}
        disabled={!codeSelected}
        title={codeSelected ? undefined : 'Select a color code first'}
      >
        Color code ledger
      </button>
    </div>
  );
}
