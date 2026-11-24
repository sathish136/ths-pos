import { useMemo, useState } from 'react';
import { Calculator, Download } from 'lucide-react';
import type { SaleRecord } from './ReportsPanel';
import type { ShiftRecord } from '../../lib/shifts';
import type { StockMove } from '../../lib/inventory';
import { downloadExcelFile } from '../../lib/excel-export';

type Props = {
  sales: SaleRecord[];
  moves: StockMove[];
  taxRatePct: number;
  shift: ShiftRecord | null;
  restaurantName: string;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

type Account = {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity';
};

const CHART: Account[] = [
  { code: '1000', name: 'Cash on hand', type: 'Asset' },
  { code: '1100', name: 'Card / bank clearing', type: 'Asset' },
  { code: '1200', name: 'Accounts receivable (credit sales)', type: 'Asset' },
  { code: '1300', name: 'Inventory / stock', type: 'Asset' },
  { code: '2000', name: 'Sales tax payable', type: 'Liability' },
  { code: '2100', name: 'Tips payable', type: 'Liability' },
  { code: '4000', name: 'Food sales', type: 'Income' },
  { code: '4100', name: 'Sales discounts', type: 'Income' },
  { code: '5000', name: 'Cost of goods sold (recipes)', type: 'Expense' },
  { code: '3000', name: 'Owner equity / retained', type: 'Equity' },
];

type LedgerLine = {
  id: string;
  at: string;
  account: string;
  accountName: string;
  memo: string;
  debit: number;
  credit: number;
};

/** Manager accounting: chart of accounts, trial balances, and a simple ledger from POS activity. */
export function AccountingPanel({ sales, moves, taxRatePct, shift, restaurantName }: Props) {
  const [tab, setTab] = useState<'coa' | 'balances' | 'ledger'>('coa');

  const rate = taxRatePct / 100;
  const gross = sales.reduce((a, s) => a + s.total, 0);
  const discounts = sales.reduce((a, s) => a + (s.discount ?? 0), 0);
  const tips = sales.reduce((a, s) => a + (s.tip ?? 0), 0);
  const card = sales.filter((s) => s.paymentMethod === 'Card' || s.paymentMethod === 'Loyalty').reduce((a, s) => a + s.total, 0);
  const cash = sales.filter((s) => s.paymentMethod === 'Cash').reduce((a, s) => a + s.total, 0);
  const credit = sales.filter((s) => s.paymentMethod === 'Credit').reduce((a, s) => a + s.total, 0);
  const split = sales.filter((s) => s.paymentMethod === 'Split');
  const splitCash = split.reduce((a, s) => a + (s.cashAmount ?? 0), 0);
  const splitCard = split.reduce((a, s) => a + (s.cardAmount ?? 0), 0);
  const netApprox = rate > 0 ? gross / (1 + rate) : gross;
  const taxApprox = gross - netApprox;
  // Demo COGS: treat each stock pull qty as $12 / unit for display only
  const cogs = moves.reduce((a, m) => a + m.qty * 12, 0);

  const balances = useMemo(() => {
    const map: Record<string, number> = Object.fromEntries(CHART.map((a) => [a.code, 0]));
    map['1000'] = cash + splitCash;
    map['1100'] = card + splitCard;
    map['1200'] = credit;
    map['1300'] = -cogs; // inventory out
    map['2000'] = taxApprox;
    map['2100'] = tips;
    map['4000'] = netApprox + discounts; // list before discount
    map['4100'] = -discounts;
    map['5000'] = cogs;
    map['3000'] = (cash + splitCash + card + splitCard + credit) - taxApprox - tips - cogs;
    return map;
  }, [cash, splitCash, card, splitCard, credit, cogs, taxApprox, tips, netApprox, discounts]);

  const ledger: LedgerLine[] = useMemo(() => {
    const lines: LedgerLine[] = [];
    for (const s of sales) {
      const net = rate > 0 ? s.total / (1 + rate) : s.total;
      const tax = s.total - net;
      const tender =
        s.paymentMethod === 'Cash' ? '1000'
          : s.paymentMethod === 'Credit' ? '1200'
            : s.paymentMethod === 'Split' ? '1000'
              : '1100';
      lines.push({
        id: `${s.id}-dr`,
        at: s.at,
        account: tender,
        accountName: CHART.find((a) => a.code === tender)?.name ?? tender,
        memo: `Sale #${s.ticketNumber} · ${s.paymentMethod}`,
        debit: round2(s.total),
        credit: 0,
      });
      if ((s.discount ?? 0) > 0) {
        lines.push({
          id: `${s.id}-disc`,
          at: s.at,
          account: '4100',
          accountName: 'Sales discounts',
          memo: `Discount on #${s.ticketNumber}`,
          debit: round2(s.discount ?? 0),
          credit: 0,
        });
      }
      lines.push({
        id: `${s.id}-sales`,
        at: s.at,
        account: '4000',
        accountName: 'Food sales',
        memo: `Sale #${s.ticketNumber}`,
        debit: 0,
        credit: round2(net + (s.discount ?? 0)),
      });
      if (tax > 0.005) {
        lines.push({
          id: `${s.id}-tax`,
          at: s.at,
          account: '2000',
          accountName: 'Sales tax payable',
          memo: `Tax on #${s.ticketNumber}`,
          debit: 0,
          credit: round2(tax),
        });
      }
      if ((s.tip ?? 0) > 0) {
        lines.push({
          id: `${s.id}-tip`,
          at: s.at,
          account: '2100',
          accountName: 'Tips payable',
          memo: `Tip on #${s.ticketNumber}`,
          debit: 0,
          credit: round2(s.tip ?? 0),
        });
      }
    }
    for (const m of moves.slice(0, 80)) {
      const amt = round2(m.qty * 12);
      lines.push({
        id: `${m.id}-cogs`,
        at: m.at,
        account: '5000',
        accountName: 'Cost of goods sold (recipes)',
        memo: `${m.dishName} · ${m.ingredientName} ×${m.qty}${m.unit} (#${m.ticketNumber})`,
        debit: amt,
        credit: 0,
      });
      lines.push({
        id: `${m.id}-inv`,
        at: m.at,
        account: '1300',
        accountName: 'Inventory / stock',
        memo: `Recipe pull · ${m.ingredientName}`,
        debit: 0,
        credit: amt,
      });
    }
    return lines;
  }, [sales, moves, rate]);

  function exportCoa() {
    downloadExcelFile(
      `ury-chart-of-accounts-${Date.now()}.xls`,
      'ChartOfAccounts',
      ['Code', 'Account', 'Type', 'Balance'],
      CHART.map((a) => [a.code, a.name, a.type, round2(balances[a.code] ?? 0)]),
    );
  }

  function exportLedger() {
    downloadExcelFile(
      `ury-ledger-${Date.now()}.xls`,
      'Ledger',
      ['Time', 'Account', 'Name', 'Memo', 'Debit', 'Credit'],
      ledger.map((l) => [l.at, l.account, l.accountName, l.memo, l.debit || '', l.credit || '']),
    );
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><Calculator size={13} /> ACCOUNTING</div>
          <h1>Ledgers &amp; chart of accounts</h1>
          <p>
            {restaurantName} — chart of accounts, account balances and a POS ledger built from sales and recipe stock pulls.
            Shift: <b>{shift?.status === 'open' ? 'Open' : 'Closed'}</b>
          </p>
        </div>
        <div className="ury-action-row">
          <button type="button" className={tab === 'coa' ? 'ury-submit' : 'ury-ghost'} onClick={() => setTab('coa')}>Chart of accounts</button>
          <button type="button" className={tab === 'balances' ? 'ury-submit' : 'ury-ghost'} onClick={() => setTab('balances')}>Balances</button>
          <button type="button" className={tab === 'ledger' ? 'ury-submit' : 'ury-ghost'} onClick={() => setTab('ledger')}>Ledger</button>
        </div>
      </div>

      <div className="ury-kpi-row">
        <div className="ury-kpi"><small>Gross sales</small><strong>{money(gross)}</strong></div>
        <div className="ury-kpi"><small>Est. net</small><strong>{money(netApprox)}</strong></div>
        <div className="ury-kpi"><small>Est. tax ({taxRatePct}%)</small><strong>{money(taxApprox)}</strong></div>
        <div className="ury-kpi"><small>Recipe COGS (demo)</small><strong>{money(cogs)}</strong></div>
      </div>

      {tab === 'coa' && (
        <div>
          <div className="ury-action-row" style={{ marginBottom: 8 }}>
            <h2 className="ury-panel-sub" style={{ margin: 0, flex: 1 }}>Chart of accounts</h2>
            <button type="button" className="ury-ghost" onClick={exportCoa}><Download size={12} aria-hidden /> Excel</button>
          </div>
          <table className="ury-report-table">
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
            <tbody>
              {CHART.map((a) => (
                <tr key={a.code}>
                  <td><code>{a.code}</code></td>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td>{money(balances[a.code] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ury-muted" style={{ marginTop: 8 }}>
            Balances come from this session&apos;s POS sales and recipe stock ledger. Full ERPNext GL sync uses your API access.
          </p>
        </div>
      )}

      {tab === 'balances' && (
        <div className="ury-report-cols">
          <div>
            <h2 className="ury-panel-sub">Assets</h2>
            {CHART.filter((a) => a.type === 'Asset').map((a) => (
              <div key={a.code} className="ury-report-line"><span>{a.code} · {a.name}</span><strong>{money(balances[a.code] ?? 0)}</strong></div>
            ))}
            <h2 className="ury-panel-sub" style={{ marginTop: 16 }}>Liabilities</h2>
            {CHART.filter((a) => a.type === 'Liability').map((a) => (
              <div key={a.code} className="ury-report-line"><span>{a.code} · {a.name}</span><strong>{money(balances[a.code] ?? 0)}</strong></div>
            ))}
          </div>
          <div>
            <h2 className="ury-panel-sub">Income &amp; expense</h2>
            {CHART.filter((a) => a.type === 'Income' || a.type === 'Expense').map((a) => (
              <div key={a.code} className="ury-report-line"><span>{a.code} · {a.name}</span><strong>{money(balances[a.code] ?? 0)}</strong></div>
            ))}
            <h2 className="ury-panel-sub" style={{ marginTop: 16 }}>Equity</h2>
            {CHART.filter((a) => a.type === 'Equity').map((a) => (
              <div key={a.code} className="ury-report-line"><span>{a.code} · {a.name}</span><strong>{money(balances[a.code] ?? 0)}</strong></div>
            ))}
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div>
          <div className="ury-action-row" style={{ marginBottom: 8 }}>
            <h2 className="ury-panel-sub" style={{ margin: 0, flex: 1 }}>General ledger (POS session)</h2>
            <button type="button" className="ury-ghost" onClick={exportLedger}><Download size={12} aria-hidden /> Excel</button>
          </div>
          <table className="ury-report-table">
            <thead><tr><th>Time</th><th>Account</th><th>Memo</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              {ledger.slice(0, 120).map((l) => (
                <tr key={l.id}>
                  <td>{l.at}</td>
                  <td><code>{l.account}</code> {l.accountName}</td>
                  <td>{l.memo}</td>
                  <td>{l.debit ? money(l.debit) : ''}</td>
                  <td>{l.credit ? money(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ledger.length && <p className="ury-muted">No ledger lines yet — take a payment or send an order to kitchen.</p>}
        </div>
      )}
    </section>
  );
}
