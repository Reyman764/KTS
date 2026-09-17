import { useEffect, useState } from 'react';
import { Search, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  CrossReportGroup,
  CrossReportResult,
  FiscalYearClosure,
  MaterialCode,
  QuickOption,
  RawMaterial,
} from '../types';
import { crossReportApi } from '../api/crossReport';
import { quickOptionsApi } from '../api/quickOptions';
import { fiscalYearApi } from '../api/fiscalYear';
import { rawMaterialsApi } from '../api/rawMaterials';
import { materialCodesApi } from '../api/materialCodes';
import ComboBoxInput from './ComboBoxInput';

// Cross-entity search report: find every raw material and color code a
// given buyer, order, lot, rack, or description touched, and show each
// one's totals plus a grand total — the "customer summary" view a physical
// ledger book doesn't give you at a glance, since paper ledgers are kept
// per-material, not per-buyer.
export default function BuyerReport() {
  const [description, setDescription] = useState('');
  const [buyer, setBuyer] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [rackNo, setRackNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fiscalYearLabel, setFiscalYearLabel] = useState('');
  const [selectedRawMaterialId, setSelectedRawMaterialId] = useState<number | ''>('');
  const [selectedCodeId, setSelectedCodeId] = useState<number | ''>('');

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [codes, setCodes] = useState<MaterialCode[]>([]);
  const [quickOptions, setQuickOptions] = useState<QuickOption[]>([]);
  const [closures, setClosures] = useState<FiscalYearClosure[]>([]);
  const [result, setResult] = useState<CrossReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    quickOptionsApi
      .getAll()
      .then(setQuickOptions)
      .catch((err) => console.error('Failed to load quick options', err));
    fiscalYearApi
      .list()
      .then(setClosures)
      .catch((err) => console.error('Failed to load fiscal years', err));
    rawMaterialsApi
      .getAll()
      .then(setRawMaterials)
      .catch((err) => console.error('Failed to load raw materials', err));
  }, []);

  useEffect(() => {
    setSelectedCodeId('');
    if (selectedRawMaterialId === '') {
      setCodes([]);
      return;
    }
    materialCodesApi
      .getByRawMaterial(selectedRawMaterialId)
      .then(setCodes)
      .catch((err) => console.error('Failed to load codes', err));
  }, [selectedRawMaterialId]);

  const hasAnyFilter =
    [description, buyer, orderNo, lotNo, rackNo].some((v) => v.trim()) ||
    selectedRawMaterialId !== '' ||
    selectedCodeId !== '';

  async function runSearch() {
    if (!hasAnyFilter) {
      setError('Enter at least one of Raw Material, Color Code, Producer, Buyer, Order No., Lot No., or Rack No.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await crossReportApi.search({
        description: description.trim() || undefined,
        buyer: buyer.trim() || undefined,
        orderNo: orderNo.trim() || undefined,
        lotNo: lotNo.trim() || undefined,
        rackNo: rackNo.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        fiscalYearLabel: fiscalYearLabel || undefined,
        rawMaterialId: selectedRawMaterialId !== '' ? selectedRawMaterialId : undefined,
        colorCodeId: selectedCodeId !== '' ? selectedCodeId : undefined,
      });
      setResult(data);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not run the search: ${message}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setDescription('');
    setBuyer('');
    setOrderNo('');
    setLotNo('');
    setRackNo('');
    setStartDate('');
    setEndDate('');
    setFiscalYearLabel('');
    setSelectedRawMaterialId('');
    setSelectedCodeId('');
    setResult(null);
    setHasSearched(false);
    setError(null);
  }

  // Builds a short human-readable label for the current search, used as the
  // export filename and document title — e.g. "Buyer Japan" or "Buyer
  // Japan, Rack 20" when multiple filters are combined.
  function searchLabel(): string {
    const parts: string[] = [];
    const selectedRawMaterial = rawMaterials.find((rm) => rm.id === selectedRawMaterialId);
    const selectedCode = codes.find((c) => c.id === selectedCodeId);
    if (selectedRawMaterial) parts.push(selectedRawMaterial.name);
    if (selectedCode) parts.push(selectedCode.code);
    if (description.trim()) parts.push(`Producer ${description.trim()}`);
    if (buyer.trim()) parts.push(`Buyer ${buyer.trim()}`);
    if (orderNo.trim()) parts.push(`Order ${orderNo.trim()}`);
    if (lotNo.trim()) parts.push(`Lot ${lotNo.trim()}`);
    if (rackNo.trim()) parts.push(`Rack ${rackNo.trim()}`);
    return parts.length > 0 ? parts.join(', ') : 'Search Results';
  }

  function exportExcel() {
    if (!result) return;
    setExporting('excel');
    setError(null);
    try {
      const label = searchLabel();
      const headerRows: (string | number)[][] = [
        ['KTS Wool Inventory — Buyer & Order Search'],
        [label],
        [
          startDate || endDate
            ? `Period: ${startDate || 'earliest'} to ${endDate || 'latest'}`
            : 'Period: all time',
        ],
        [result.fiscalYearLabel ? `Fiscal year: ${result.fiscalYearLabel} (closed)` : 'Fiscal year: current (live ledger)'],
        [],
        ['Total Received from Dye', result.grandTotal.totalReceivedFromDye],
        ['Total Knitting Distribution', result.grandTotal.totalKnittingDistribution],
        ['Total Return Qty', result.grandTotal.totalReturnQty],
        ['Total Assorted', result.grandTotal.totalAssorted],
        ['Total Wastage', result.grandTotal.totalWastage],
        ['Total Drying Loss', result.grandTotal.totalDryingLoss],
        [],
      ];

      const tableHeader = [
        'Raw Material / Color Code', 'Entries', 'Receive from dye (+)', 'Knitting distribution (-)',
        'Return Qty (+)', 'Assorted', 'Wastage', result.fiscalYearLabel ? 'Ending Balance' : 'Current Balance',
      ];

      const tableRows = result.groups.map((g) => [
        g.label, g.transactionCount, g.totals.totalReceivedFromDye, g.totals.totalKnittingDistribution,
        g.totals.totalReturnQty, g.totals.totalAssorted, g.totals.totalWastage, g.currentBalance,
      ]);

      const grandTotalRow = [
        'Grand Total', result.matchedTransactionCount, result.grandTotal.totalReceivedFromDye,
        result.grandTotal.totalKnittingDistribution, result.grandTotal.totalReturnQty,
        result.grandTotal.totalAssorted, result.grandTotal.totalWastage, '',
      ];

      const sheetData = [...headerRows, tableHeader, ...tableRows, grandTotalRow];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      worksheet['!cols'] = [
        { wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Search Results');

      const filename = `${label.replace(/[^a-z0-9]+/gi, '_')}_search.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not export Excel: ${message}`);
    } finally {
      setExporting(null);
    }
  }

  function exportPdf() {
    if (!result) return;
    setExporting('pdf');
    setError(null);
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError('Could not open the print window. Check if popups are blocked.');
        return;
      }

      const html = buildSearchPrintableHtml(searchLabel(), startDate, endDate, result);
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not export PDF: ${message}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="reports-page">
      <h2>Buyer &amp; Order Search</h2>
      <p className="cross-report-subtitle">
        Search across every raw material and color code by material, code, producer, buyer, order,
        lot, or rack — combine any of the fields below.
      </p>

      <div className="reports-filters cross-report-filters">
        <div>
          <label className="field-label" htmlFor="cr-raw-material">Raw Material</label>
          <select
            id="cr-raw-material"
            value={selectedRawMaterialId}
            onChange={(e) => setSelectedRawMaterialId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All raw materials</option>
            {rawMaterials.map((rm) => (
              <option key={rm.id} value={rm.id}>{rm.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="cr-color-code">Color Code</label>
          <select
            id="cr-color-code"
            value={selectedCodeId}
            onChange={(e) => setSelectedCodeId(e.target.value ? Number(e.target.value) : '')}
            disabled={!selectedRawMaterialId}
          >
            <option value="">
              {selectedRawMaterialId ? 'All color codes under this material' : 'Select a raw material first'}
            </option>
            {codes.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="cr-description">Producer</label>
          <ComboBoxInput
            id="cr-description"
            field="description"
            value={description}
            onChange={setDescription}
            options={quickOptions}
            onOptionsChange={setQuickOptions}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-buyer">Buyer</label>
          <ComboBoxInput
            id="cr-buyer"
            field="buyer"
            value={buyer}
            onChange={setBuyer}
            options={quickOptions}
            onOptionsChange={setQuickOptions}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-order">Order No.</label>
          <ComboBoxInput
            id="cr-order"
            field="order_no"
            value={orderNo}
            onChange={setOrderNo}
            options={quickOptions}
            onOptionsChange={setQuickOptions}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-lot">Lot No.</label>
          <ComboBoxInput
            id="cr-lot"
            field="lot_no"
            value={lotNo}
            onChange={setLotNo}
            options={quickOptions}
            onOptionsChange={setQuickOptions}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-rack">Rack No.</label>
          <ComboBoxInput
            id="cr-rack"
            field="rack_no"
            value={rackNo}
            onChange={setRackNo}
            options={quickOptions}
            onOptionsChange={setQuickOptions}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-fiscal-year">Fiscal Year</label>
          <select
            id="cr-fiscal-year"
            value={fiscalYearLabel}
            onChange={(e) => setFiscalYearLabel(e.target.value)}
          >
            <option value="">Current (live ledger)</option>
            {closures.map((c) => (
              <option key={c.id} value={c.label}>{c.label} (closed)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="cr-start">Start Date</label>
          <input id="cr-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <label className="field-label" htmlFor="cr-end">End Date</label>
          <input id="cr-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <button type="button" className="btn-primary" onClick={runSearch} disabled={loading}>
          <Search size={14} /> {loading ? 'Searching…' : 'Search'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleClear} disabled={loading}>
          Clear
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}

      {hasSearched && result && (
        <>
          {result.groups.length === 0 ? (
            <p className="cross-report-empty">No transactions match these filters.</p>
          ) : (
            <>
              <div className="reports-summary">
                <div className="summary-card receive">
                  <span className="summary-label">Received from Dye</span>
                  <span className="summary-value receive">{result.grandTotal.totalReceivedFromDye.toFixed(2)}</span>
                </div>
                <div className="summary-card issue">
                  <span className="summary-label">Knitting Distribution</span>
                  <span className="summary-value issue">{result.grandTotal.totalKnittingDistribution.toFixed(2)}</span>
                </div>
                <div className="summary-card receive">
                  <span className="summary-label">Return Qty</span>
                  <span className="summary-value receive">{result.grandTotal.totalReturnQty.toFixed(2)}</span>
                </div>
                <div className="summary-card loss">
                  <span className="summary-label">Assorted</span>
                  <span className="summary-value loss">{result.grandTotal.totalAssorted.toFixed(2)}</span>
                </div>
                <div className="summary-card loss">
                  <span className="summary-label">Wastage</span>
                  <span className="summary-value loss">{result.grandTotal.totalWastage.toFixed(2)}</span>
                </div>
                <div className="summary-card loss">
                  <span className="summary-label">Drying Loss</span>
                  <span className="summary-value loss">{result.grandTotal.totalDryingLoss.toFixed(2)}</span>
                </div>

                <div className="reports-export-actions">
                  <button type="button" className="btn-secondary" onClick={exportExcel} disabled={exporting !== null}>
                    <FileSpreadsheet size={14} /> {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={exportPdf} disabled={exporting !== null}>
                    <FileText size={14} /> {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
                  </button>
                </div>
              </div>

              <p className="reports-row-count">
                {result.matchedTransactionCount} matching transaction{result.matchedTransactionCount === 1 ? '' : 's'} across{' '}
                {result.groups.length} item{result.groups.length === 1 ? '' : 's'}
                {result.fiscalYearLabel && (
                  <span className="cross-report-year-badge"> — {result.fiscalYearLabel} (closed year)</span>
                )}
              </p>

              <div className="ledger-table-wrap">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Raw Material / Color Code</th>
                      <th className="num">Entries</th>
                      <th className="num th-wrap">Receive from{'\n'}dye</th>
                      <th className="num th-wrap">Knitting{'\n'}distribution</th>
                      <th className="num th-wrap">Return{'\n'}Qty</th>
                      <th className="num">Assorted</th>
                      <th className="num">Wastage</th>
                      <th className="num">{result.fiscalYearLabel ? 'Ending Balance' : 'Current Balance'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((group) => (
                      <CrossReportRow key={`${group.entityType}:${group.entityId}`} group={group} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="cross-report-grand-total-row">
                      <td>Grand Total</td>
                      <td className="num">{result.matchedTransactionCount}</td>
                      <td className="num">{result.grandTotal.totalReceivedFromDye.toFixed(2)}</td>
                      <td className="num">{result.grandTotal.totalKnittingDistribution.toFixed(2)}</td>
                      <td className="num">{result.grandTotal.totalReturnQty.toFixed(2)}</td>
                      <td className="num">{result.grandTotal.totalAssorted.toFixed(2)}</td>
                      <td className="num">{result.grandTotal.totalWastage.toFixed(2)}</td>
                      <td className="num cross-report-balance-na" title="Balances aren't summed across different items — each item's own balance is shown in its row above.">
                        —
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {!hasSearched && !error && (
        <p className="cross-report-empty">
          Pick at least one filter above and search to see what a buyer, order, lot, or rack touched
          across your inventory.
        </p>
      )}
    </div>
  );
}

function CrossReportRow({ group }: { group: CrossReportGroup }) {
  return (
    <tr>
      <td>{group.label}</td>
      <td className="num">{group.transactionCount}</td>
      <td className="num">{group.totals.totalReceivedFromDye.toFixed(2)}</td>
      <td className="num">{group.totals.totalKnittingDistribution.toFixed(2)}</td>
      <td className="num">{group.totals.totalReturnQty.toFixed(2)}</td>
      <td className="num">{group.totals.totalAssorted.toFixed(2)}</td>
      <td className="num">{group.totals.totalWastage.toFixed(2)}</td>
      <td className="num balance-cell">{group.currentBalance.toFixed(2)} {group.unit}</td>
    </tr>
  );
}

function buildSearchPrintableHtml(
  title: string,
  startDate: string,
  endDate: string,
  result: CrossReportResult
): string {
  const period = startDate || endDate
    ? `Period: ${startDate || 'earliest'} to ${endDate || 'latest'}`
    : 'Period: all time';
  const yearLine = result.fiscalYearLabel
    ? `Fiscal year: ${result.fiscalYearLabel} (closed)`
    : 'Fiscal year: current (live ledger)';
  const balanceHeader = result.fiscalYearLabel ? 'Ending Balance' : 'Current Balance';

  const rowsHtml = result.groups
    .map(
      (g: CrossReportGroup) => `
        <tr>
          <td>${g.label}</td>
          <td style="text-align:right">${g.transactionCount}</td>
          <td style="text-align:right">${g.totals.totalReceivedFromDye.toFixed(2)}</td>
          <td style="text-align:right">${g.totals.totalKnittingDistribution.toFixed(2)}</td>
          <td style="text-align:right">${g.totals.totalReturnQty.toFixed(2)}</td>
          <td style="text-align:right">${g.totals.totalAssorted.toFixed(2)}</td>
          <td style="text-align:right">${g.totals.totalWastage.toFixed(2)}</td>
          <td style="text-align:right;font-weight:600">${g.currentBalance.toFixed(2)} ${g.unit}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} — Buyer &amp; Order Search</title>
<style>
  body { font-family: Arial, sans-serif; color: #1f2328; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .totals { display: flex; gap: 16px; margin: 16px 0; font-size: 12px; flex-wrap: wrap; }
  .totals div { border: 1px solid #ccc; padding: 8px 12px; border-radius: 4px; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <h1>KTS Wool Inventory — ${title}</h1>
  <div class="subtitle">${period}</div>
  <div class="subtitle">${yearLine}</div>
  <div class="totals">
    <div><strong>Received from Dye:</strong> ${result.grandTotal.totalReceivedFromDye.toFixed(2)}</div>
    <div><strong>Knitting Distribution:</strong> ${result.grandTotal.totalKnittingDistribution.toFixed(2)}</div>
    <div><strong>Return Qty:</strong> ${result.grandTotal.totalReturnQty.toFixed(2)}</div>
    <div><strong>Assorted:</strong> ${result.grandTotal.totalAssorted.toFixed(2)}</div>
    <div><strong>Wastage:</strong> ${result.grandTotal.totalWastage.toFixed(2)}</div>
    <div><strong>Drying Loss:</strong> ${result.grandTotal.totalDryingLoss.toFixed(2)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Raw Material / Color Code</th><th>Entries</th><th>Receive from dye</th>
        <th>Knitting distribution</th><th>Return Qty</th><th>Assorted</th><th>Wastage</th>
        <th>${balanceHeader}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}