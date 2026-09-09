import { useState } from 'react';
import Sidebar from './components/Sidebar';
import CodeSubNav from './components/CodeSubNav';
import LedgerTabs, { type LedgerView } from './components/LedgerTabs';
import Ledger from './components/Ledger';
import type { MaterialCode, RawMaterial } from './types';
import './App.css';

function App() {
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
    </div>
  );
}

export default App;