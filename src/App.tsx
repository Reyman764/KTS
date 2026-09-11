import { useState } from 'react';
import { Boxes, BarChart3, Users } from 'lucide-react';
import Sidebar from './components/Sidebar';
import CodeSubNav from './components/CodeSubNav';
import LedgerTabs, { type LedgerView } from './components/LedgerTabs';
import Ledger from './components/Ledger';
import Reports from './components/Reports';
import BuyerReport from './components/BuyerReport';
import type { MaterialCode, RawMaterial } from './types';
import './App.css';

type Page = 'INVENTORY' | 'REPORTS' | 'BUYER_REPORT';

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

  // Deleting the currently-selected raw material clears the selection
  // entirely rather than auto-selecting another one, so the ledger falls
  // back to the empty-state placeholder instead of silently jumping to a
  // different material's data.
  function handleDeletedRawMaterial(id: number) {
    if (selectedRawMaterial?.id === id) {
      setSelectedRawMaterial(null);
      setSelectedCode(null);
    }
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
        <button
          type="button"
          className={`nav-rail-item ${page === 'BUYER_REPORT' ? 'active' : ''}`}
          onClick={() => setPage('BUYER_REPORT')}
          title="Buyer & Order Search"
        >
          <Users size={20} />
          <span>Buyers</span>
        </button>
      </nav>

      {/* All three pages stay mounted at all times (visibility toggled via
          CSS) rather than conditionally rendered — conditional rendering
          would unmount Reports/BuyerReport on navigation and wipe out their
          filter state and search results every time you switch pages. */}
      <div className={`page-panel ${page === 'INVENTORY' ? 'page-panel-active' : ''}`}>
        <Sidebar
          selectedRawMaterialId={selectedRawMaterial?.id ?? null}
          onSelectRawMaterial={handleSelectRawMaterial}
          onDeletedRawMaterial={handleDeletedRawMaterial}
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
      </div>

      <div className={`page-panel ${page === 'REPORTS' ? 'page-panel-active' : ''}`}>
        <div className="main-panel">
          <div className="ledger-content">
            <Reports />
          </div>
        </div>
      </div>

      <div className={`page-panel ${page === 'BUYER_REPORT' ? 'page-panel-active' : ''}`}>
        <div className="main-panel">
          <div className="ledger-content">
            <BuyerReport />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;