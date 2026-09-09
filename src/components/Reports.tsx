import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { EntityType, MaterialCode, RawMaterial, ReportResult, Transaction } from '../types';
import { rawMaterialsApi } from '../api/rawMaterials';
import { materialCodesApi } from '../api/materialCodes';
import { reportsApi } from '../api/reports';

export default function Reports() {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [codes, setCodes] = useState<MaterialCode[]>([]);

  const [selectedRawMaterialId, setSelectedRawMaterialId] = useState<number | ''>('');
  const [selectedCodeId, setSelectedCodeId] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function runReport() {
    if (selectedRawMaterialId === '') {
      setError('Select a raw material first.');
      return;
    }

    const entityType: EntityType = selectedCodeId !== '' ? 'COLOR_CODE' : 'RAW_MATERIAL';
    const entityId = selectedCodeId !== '' ? selectedCodeId : selectedRawMaterialId;

    setLoading(true);
    setError(null);
    try {
      const data = await reportsApi.query({
        entityType,
        entityId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setResult(data);
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

  function exportExcel() {
    if (!result) return;

    const headerRows = [
      ['KTS Wool Inventory — Ledger Report'],
      [reportLabel()],
      [
        startDate || endDate
          ? `Period: ${startDate || 'earliest'} to ${endDate || 'latest'}`
          : 'Period: all time',
      ],
      [],
      ['Total Received', result.totals.totalReceived],
      ['Total Issued', result.totals.totalIssued],
      ['Total Drying Loss', result.totals.totalDryingLoss],
      [],
    ];

    const tableHeader = [
      'Date',
      'Entry Type',
      'Description',
      'Buyer',
      'Lot No',
      'Rack No',
      'Receiver',
      'Issue (-)',
      'Receive (+)',
      'Balance',
      'Remark',
    ];

    const tableRows = result.rows.map((t) => [
      t.date,
      t.entry_type,
      t.description ?? '',
      t.buyer ?? '',
      t.lot_no ?? '',
      t.rack_no ?? '',
      t.receiver ?? '',
      t.issue,
      t.receive,
      t.balance,
      t.remark ?? '',
    ]);

    const sheetData = [...headerRows, tableHeader, ...tableRows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 16 },
      { wch: 24 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    const filename = `${reportLabel().replace(/[^a-z0-9]+/gi, '_')}_report.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  function exportPdf() {
    if (!result) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = buildPrintableHtml(reportLabel(), startDate, endDate, result);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Give the new window a moment to lay out before invoking print.
    setTimeout(() => printWindow.print(), 250);
  }

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

        <button type="button" className="btn-primary" onClick={runReport} disabled={loading}>
          {loading ? 'Running…' : 'Run Report'}
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}

      {result && (
        <>
          <div className="reports-summary">
            <div className="summary-card">
              <span className="summary-label">Total Received</span>
              <span className="summary-value receive">{result.totals.totalReceived.toFixed(2)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Issued</span>
              <span className="summary-value issue">{result.totals.totalIssued.toFixed(2)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Drying Loss</span>
              <span className="summary-value loss">{result.totals.totalDryingLoss.toFixed(2)}</span>
            </div>

            <div className="reports-export-actions">
              <button type="button" className="btn-secondary" onClick={exportExcel}>
                <FileSpreadsheet size={14} /> Export Excel
              </button>
              <button type="button" className="btn-secondary" onClick={exportPdf}>
                <FileText size={14} /> Export PDF
              </button>
            </div>
          </div>

          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Buyer</th>
                  <th>Lot No</th>
                  <th>Rack No</th>
                  <th>Receiver</th>
                  <th className="num">Issue (-)</th>
                  <th className="num">Receive (+)</th>
                  <th className="num">Balance</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="ledger-empty-row">No transactions in this range.</td>
                  </tr>
                )}
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.description}</td>
                    <td>{row.buyer}</td>
                    <td>{row.lot_no}</td>
                    <td>{row.rack_no}</td>
                    <td>{row.receiver}</td>
                    <td className="num">{row.issue ? row.issue.toFixed(2) : ''}</td>
                    <td className="num">{row.receive ? row.receive.toFixed(2) : ''}</td>
                    <td className="num balance-cell">{row.balance.toFixed(2)}</td>
                    <td>{row.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  result: ReportResult
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
          <td>${t.lot_no ?? ''}</td>
          <td>${t.rack_no ?? ''}</td>
          <td>${t.receiver ?? ''}</td>
          <td style="text-align:right">${t.issue ? t.issue.toFixed(2) : ''}</td>
          <td style="text-align:right">${t.receive ? t.receive.toFixed(2) : ''}</td>
          <td style="text-align:right;font-weight:600">${t.balance.toFixed(2)}</td>
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
  .totals { display: flex; gap: 24px; margin: 16px 0; font-size: 12px; }
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
    <div><strong>Total Received:</strong> ${result.totals.totalReceived.toFixed(2)}</div>
    <div><strong>Total Issued:</strong> ${result.totals.totalIssued.toFixed(2)}</div>
    <div><strong>Total Drying Loss:</strong> ${result.totals.totalDryingLoss.toFixed(2)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Description</th><th>Buyer</th><th>Lot No</th><th>Rack No</th>
        <th>Receiver</th><th>Issue (-)</th><th>Receive (+)</th><th>Balance</th><th>Remark</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}
