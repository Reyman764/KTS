import { useState } from 'react';
import { Boxes, BarChart3 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import CodeSubNav from './components/CodeSubNav';
import LedgerTabs, { type LedgerView } from './components/LedgerTabs';
import Ledger from './components/Ledger';
import Reports from './components/Reports';
import type { MaterialCode, RawMaterial } from './types';
import './App.css';

type Page = 'INVENTORY' | 'REPORTS';

function App() {
  const [page, setPage] = useState<Page>('INVENTORY');
  const [selectedRawMaterial, setSelectedRawMaterial] = useState<RawMaterial | null>(null);
  const [selectedCode, setSelectedCode] = useState<MaterialCode | null>(null);
  const [activeView, setActiveView] = useState<LedgerView>('RAW_MATERIAL');
  const [sidebarRefreshKey] = useState(0);

  function handleSelectRawMaterial(rawMaterial: RawMaterial) {
    setSelectedRawMaterial(rawMaterial);
    setSelectedCode(null);
    setActiveView('RAW_MATERIAL');
  }

  function handleSelectCode(code: MaterialCode | null) {
    setSelectedCode(code);
    if (code) setActiveView('COLOR_CODE');
  }

  return (
    <div className="app-shell">
      <nav className="app-nav-rail">
        <button
          type="button"
          className={`nav-rail-item ${page === 'INVENTORY' ? 'active' : ''}`}
          onClick={() => setPage('INVENTORY')}
          title="Inventory"
        >
          <Boxes size={20} />
          <span>Inventory</span>
        </button>
        <button
          type="button"
          className={`nav-rail-item ${page === 'REPORTS' ? 'active' : ''}`}
          onClick={() => setPage('REPORTS')}
          title="Reports"
        >
          <BarChart3 size={20} />
          <span>Reports</span>
        </button>
      </nav>

      {page === 'INVENTORY' && (
        <>
          <Sidebar
            selectedRawMaterialId={selectedRawMaterial?.id ?? null}
            onSelectRawMaterial={handleSelectRawMaterial}
            refreshKey={sidebarRefreshKey}
          />

          <div className="main-panel">
            <CodeSubNav
              rawMaterial={selectedRawMaterial}
              selectedCodeId={selectedCode?.id ?? null}
              onSelectCode={handleSelectCode}
            />

            <LedgerTabs
              activeView={activeView}
              onChange={setActiveView}
              codeSelected={selectedCode !== null}
            />

            <div className="ledger-content">
              {activeView === 'RAW_MATERIAL' && selectedRawMaterial && (
                <Ledger
                  entityType="RAW_MATERIAL"
                  entityId={selectedRawMaterial.id}
                  entityLabel={selectedRawMaterial.name}
                  unit={selectedRawMaterial.unit}
                />
              )}
              {activeView === 'COLOR_CODE' && selectedCode && (
                <Ledger
                  entityType="COLOR_CODE"
                  entityId={selectedCode.id}
                  entityLabel={selectedCode.code}
                  unit={selectedRawMaterial?.unit ?? 'kg'}
                />
              )}
              {!selectedRawMaterial && (
                <p className="ledger-placeholder">
                  Select or add a raw material to get started.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {page === 'REPORTS' && (
        <div className="main-panel">
          <div className="ledger-content">
            <Reports />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
