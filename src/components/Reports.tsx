import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { EntityType, MaterialCode, RawMaterial, ReportResult, Transaction } from '../types';
import { rawMaterialsApi } from '../api/rawMaterials';
import { materialCodesApi } from '../api/materialCodes';
import { reportsApi } from '../api/reports';

const PAGE_SIZE = 200;
const COLUMN_COUNT = 13;

export default function Reports() {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [codes, setCodes] = useState<MaterialCode[]>([]);

  const [selectedRawMaterialId, setSelectedRawMaterialId] = useState<number | ''>('');
  const [selectedCodeId, setSelectedCodeId] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [result, setResult] = useState<ReportResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRawMaterial = rawMaterials.find((rm) => rm.id === selectedRawMaterialId) ?? null;
  const selectedCode = codes.find((c) => c.id === selectedCodeId) ?? null;

  useEffect(() => {
    rawMaterialsApi.getAll().then(setRawMaterials).catch((err) => {
      console.error('Failed to load raw materials', err);
    });
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

  function currentEntity(): { entityType: EntityType; entityId: number } | null {
    if (selectedRawMaterialId === '') return null;
    const entityType: EntityType = selectedCodeId !== '' ? 'COLOR_CODE' : 'RAW_MATERIAL';
    const entityId = selectedCodeId !== '' ? selectedCodeId : selectedRawMaterialId;
    return { entityType, entityId };
  }

  async function runReport(targetPage = 1) {
    const entity = currentEntity();
    if (!entity) {
      setError('Select a raw material first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await reportsApi.query({
        ...entity,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setResult(data);
      setPage(data.page);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not run the report: ${message}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function reportLabel(): string {
    if (selectedCode) return `${selectedRawMaterial?.name ?? ''} — ${selectedCode.code}`;
    if (selectedRawMaterial) return selectedRawMaterial.name;
    return 'Report';
  }

  async function exportExcel() {
    const entity = currentEntity();
    if (!entity || !result) return;

    setExporting('excel');
    setError(null);
    try {
      const full = await reportsApi.queryAll({
        ...entity,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const headerRows = [
        ['KTS Wool Inventory — Ledger Report'],
        [reportLabel()],
        [
          startDate || endDate
            ? `Period: ${startDate || 'earliest'} to ${endDate || 'latest'}`
            : 'Period: all time',
        ],
        [],
        ['Total Received from Dye', full.totals.totalReceivedFromDye],
        ['Total Knitting Distribution', full.totals.totalKnittingDistribution],
        ['Total Return Qty', full.totals.totalReturnQty],
        ['Total Assorted', full.totals.totalAssorted],
        ['Total Wastage', full.totals.totalWastage],
        ['Total Drying Loss', full.totals.totalDryingLoss],
        [],
      ];

      const tableHeader = [
        'Date', 'Entry Type', 'Description', 'Buyer', 'Order No.', 'Lot No', 'Rack No',
        'Receive from dye (+)', 'Knitting distribution (-)', 'Return Qty (+)', 'Balance',
        'Assorted', 'Wastage', 'Remark',
      ];

      const tableRows = full.rows.map((t) => [
        t.date, t.entry_type, t.description ?? '', t.buyer ?? '', t.order_no ?? '', t.lot_no ?? '',
        t.rack_no ?? '', t.receive_from_dye, t.knitting_distribution, t.return_qty, t.balance,
        t.assorted, t.wastage, t.remark ?? '',
      ]);

      const sheetData = [...headerRows, tableHeader, ...tableRows];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
        { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 24 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

      const filename = `${reportLabel().replace(/[^a-z0-9]+/gi, '_')}_report.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not export Excel: ${message}`);
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    const entity = currentEntity();
    if (!entity || !result) return;

    setExporting('pdf');
    setError(null);
    try {
      const full = await reportsApi.queryAll({
        ...entity,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError('Could not open the print window. Check if popups are blocked.');
        return;
      }

      const html = buildPrintableHtml(reportLabel(), startDate, endDate, full);
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

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="reports-page">
      <h2>Reports</h2>

      <div className="reports-filters">
        <div>
          <label className="field-label" htmlFor="report-material">Raw Material</label>
          <select
            id="report-material"
            value={selectedRawMaterialId}
            onChange={(e) => setSelectedRawMaterialId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select…</option>
            {rawMaterials.map((rm) => (
              <option key={rm.id} value={rm.id}>{rm.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="report-code">Color Code (optional)</label>
          <select
            id="report-code"
            value={selectedCodeId}
            onChange={(e) => setSelectedCodeId(e.target.value ? Number(e.target.value) : '')}
            disabled={!selectedRawMaterial}
          >
            <option value="">All (bulk material only)</option>
            {codes.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="report-start">Start Date</label>
          <input id="report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <label className="field-label" htmlFor="report-end">End Date</label>
          <input id="report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <button type="button" className="btn-primary" onClick={() => runReport(1)} disabled={loading}>
          {loading ? 'Running…' : 'Run Report'}
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}

      {result && (
        <>
          <div className="reports-summary">
            <div className="summary-card receive">
              <span className="summary-label">Received from Dye</span>
              <span className="summary-value receive">{result.totals.totalReceivedFromDye.toFixed(2)}</span>
            </div>
            <div className="summary-card issue">
              <span className="summary-label">Knitting Distribution</span>
              <span className="summary-value issue">{result.totals.totalKnittingDistribution.toFixed(2)}</span>
            </div>
            <div className="summary-card receive">
              <span className="summary-label">Return Qty</span>
              <span className="summary-value receive">{result.totals.totalReturnQty.toFixed(2)}</span>
            </div>
            <div className="summary-card loss">
              <span className="summary-label">Assorted</span>
              <span className="summary-value loss">{result.totals.totalAssorted.toFixed(2)}</span>
            </div>
            <div className="summary-card loss">
              <span className="summary-label">Wastage</span>
              <span className="summary-value loss">{result.totals.totalWastage.toFixed(2)}</span>
            </div>
            <div className="summary-card loss">
              <span className="summary-label">Drying Loss</span>
              <span className="summary-value loss">{result.totals.totalDryingLoss.toFixed(2)}</span>
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
            Showing {result.rows.length === 0 ? 0 : (page - 1) * result.pageSize + 1}
            –{(page - 1) * result.pageSize + result.rows.length} of {result.total} matching transactions
          </p>

          <div className="ledger-table-wrap">
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
                {loading && (
                  <tr>
                    <td colSpan={COLUMN_COUNT} className="ledger-empty-row">Loading…</td>
                  </tr>
                )}
                {!loading && result.rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMN_COUNT} className="ledger-empty-row">No transactions in this range.</td>
                  </tr>
                )}
                {!loading && result.rows.map((row: Transaction) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.description}</td>
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

          <div className="ledger-pagination">
            <button type="button" disabled={page <= 1 || loading} onClick={() => runReport(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => runReport(page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function buildPrintableHtml(
  title: string,
  startDate: string,
  endDate: string,
  result: {
    rows: Transaction[];
    totals: {
      totalReceivedFromDye: number;
      totalKnittingDistribution: number;
      totalReturnQty: number;
      totalAssorted: number;
      totalWastage: number;
      totalDryingLoss: number;
    };
  }
): string {
  const period = startDate || endDate
    ? `Period: ${startDate || 'earliest'} to ${endDate || 'latest'}`
    : 'Period: all time';

  const rowsHtml = result.rows
    .map(
      (t: Transaction) => `
        <tr>
          <td>${t.date}</td>
          <td>${t.description ?? ''}</td>
          <td>${t.buyer ?? ''}</td>
          <td>${t.order_no ?? ''}</td>
          <td>${t.lot_no ?? ''}</td>
          <td>${t.rack_no ?? ''}</td>
          <td style="text-align:right">${t.receive_from_dye ? t.receive_from_dye.toFixed(2) : ''}</td>
          <td style="text-align:right">${t.knitting_distribution ? t.knitting_distribution.toFixed(2) : ''}</td>
          <td style="text-align:right">${t.return_qty ? t.return_qty.toFixed(2) : ''}</td>
          <td style="text-align:right;font-weight:600">${t.balance.toFixed(2)}</td>
          <td style="text-align:right">${t.assorted ? t.assorted.toFixed(2) : ''}</td>
          <td style="text-align:right">${t.wastage ? t.wastage.toFixed(2) : ''}</td>
          <td>${t.remark ?? ''}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} — Ledger Report</title>
<style>
  body { font-family: Arial, sans-serif; color: #1f2328; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
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
  <div class="totals">
    <div><strong>Received from Dye:</strong> ${result.totals.totalReceivedFromDye.toFixed(2)}</div>
    <div><strong>Knitting Distribution:</strong> ${result.totals.totalKnittingDistribution.toFixed(2)}</div>
    <div><strong>Return Qty:</strong> ${result.totals.totalReturnQty.toFixed(2)}</div>
    <div><strong>Assorted:</strong> ${result.totals.totalAssorted.toFixed(2)}</div>
    <div><strong>Wastage:</strong> ${result.totals.totalWastage.toFixed(2)}</div>
    <div><strong>Drying Loss:</strong> ${result.totals.totalDryingLoss.toFixed(2)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Description</th><th>Buyer</th><th>Order No.</th><th>Lot No</th><th>Rack No</th>
        <th>Receive from dye</th><th>Knitting distribution</th><th>Return Qty</th><th>Balance</th>
        <th>Assorted</th><th>Wastage</th><th>Remark</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}