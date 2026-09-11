import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { CrossReportGroup, CrossReportResult, QuickOption } from '../types';
import { crossReportApi } from '../api/crossReport';
import { quickOptionsApi } from '../api/quickOptions';
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

  const [quickOptions, setQuickOptions] = useState<QuickOption[]>([]);
  const [result, setResult] = useState<CrossReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    quickOptionsApi
      .getAll()
      .then(setQuickOptions)
      .catch((err) => console.error('Failed to load quick options', err));
  }, []);

  const hasAnyFilter = [description, buyer, orderNo, lotNo, rackNo].some((v) => v.trim());

  async function runSearch() {
    if (!hasAnyFilter) {
      setError('Enter at least one of Producer, Buyer, Order No., Lot No., or Rack No.');
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
    setResult(null);
    setHasSearched(false);
    setError(null);
  }

  return (
    <div className="reports-page">
      <h2>Buyer &amp; Order Search</h2>
      <p className="cross-report-subtitle">
        Search across every raw material and color code by producer, buyer, order, lot, or rack —
        combine any of the fields below.
      </p>

      <div className="reports-filters cross-report-filters">
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
              <p className="reports-row-count">
                {result.matchedTransactionCount} matching transaction{result.matchedTransactionCount === 1 ? '' : 's'} across{' '}
                {result.groups.length} item{result.groups.length === 1 ? '' : 's'}
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
                      <th className="num">Current Balance</th>
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