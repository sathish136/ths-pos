import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { SaleRecord } from './ReportsPanel';
import type { AccountPayment, StatementTemplate } from '../../lib/extras';
import type { CancelledLine, Ticket } from '../../lib/order-process';

export type ExtraReportId =
  | 'invoices'
  | 'category'
  | 'adjustments'
  | 'credit'
  | 'captains'
  | 'cancels'
  | 'statements';

type Props = {
  tab: ExtraReportId;
  sales: SaleRecord[];
  /** Tickets still open on this device / shared book (for captain and cancellation reports) */
  openTickets: Ticket[];
  accountPayments: AccountPayment[];
  statementTemplate: StatementTemplate;
  canExport: boolean;
  onRecordPayment: (p: AccountPayment) => void;
  onReprint: (sale: SaleRecord) => void;
  exportCsv: (name: string, rows: (string | number)[][]) => void;
  flash: (msg: string) => void;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayStart(s: string): number {
  return new Date(`${s}T00:00:00`).getTime();
}

function dateLabel(s: SaleRecord): string {
  return s.paidAtMs ? new Date(s.paidAtMs).toLocaleDateString() : s.at;
}

type CancelRow = CancelledLine & { ticket: string; table: string; source: 'open' | 'paid' };

function ExportButton({ canExport, onClick }: { canExport: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ury-ghost" disabled={!canExport} onClick={onClick} title={canExport ? 'Download CSV' : 'Manager exports reports'}>
      CSV
    </button>
  );
}

/** Invoice search, category roll-up, discounts/tips per staff, credit by customer,
 *  captain open tables & covers, voids & cancellations, customer statements and reconcile. */
export function ExtraReports({
  tab,
  sales,
  openTickets,
  accountPayments,
  statementTemplate,
  canExport,
  onRecordPayment,
  onReprint,
  exportCsv,
  flash,
}: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invNo, setInvNo] = useState('');
  const [accountA, setAccountA] = useState('');
  const [accountB, setAccountB] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<AccountPayment['method']>('Cash');
  const [payNote, setPayNote] = useState('');

  const invoices = useMemo(() => {
    const fromMs = from ? dayStart(from) : -Infinity;
    const toMs = to ? dayStart(to) + 86_400_000 : Infinity;
    const q = invNo.trim().toLowerCase();
    return sales.filter((s) => {
      const t = s.paidAtMs ?? 0;
      const okDate = t === 0 ? !from && !to : t >= fromMs && t < toMs;
      const okNo = !q || s.ticketNumber.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      return okDate && okNo;
    });
  }, [sales, from, to, invNo]);

  /** Every cancelled item: from paid sales and from tickets still open */
  const cancelRows: CancelRow[] = useMemo(() => {
    const rows: CancelRow[] = [];
    for (const s of sales) {
      for (const c of s.cancelled ?? []) rows.push({ ...c, ticket: s.ticketNumber, table: s.table, source: 'paid' });
    }
    for (const t of openTickets) {
      for (const c of t.cancelled ?? []) rows.push({ ...c, ticket: t.number, table: t.table, source: 'open' });
    }
    return rows.sort((a, b) => b.atMs - a.atMs);
  }, [sales, openTickets]);

  /** Customer accounts: credit invoices minus payments on account */
  const customers = useMemo(() => {
    const names = new Set<string>();
    for (const s of sales) if (s.paymentMethod === 'Credit') names.add(s.customerName || 'Unnamed customer');
    for (const p of accountPayments) names.add(p.customer);
    return Array.from(names).sort();
  }, [sales, accountPayments]);

  function statementFor(name: string) {
    const invs = sales
      .filter((s) => s.paymentMethod === 'Credit' && (s.customerName || 'Unnamed customer') === name)
      .map((s) => ({ kind: 'Invoice' as const, ref: `#${s.ticketNumber}`, date: dateLabel(s), at: s.paidAtMs ?? 0, amount: s.total }));
    const pays = accountPayments
      .filter((p) => p.customer === name)
      .map((p) => ({ kind: 'Payment' as const, ref: p.note || p.method, date: p.at, at: 0, amount: p.amountPaid }));
    const lines = [...invs, ...pays];
    let running = 0;
    const rows = lines.map((l) => {
      running = round2(running + (l.kind === 'Invoice' ? l.amount : -l.amount));
      return { ...l, balance: running };
    });
    const invoiced = round2(invs.reduce((a, x) => a + x.amount, 0));
    const paid = round2(pays.reduce((a, x) => a + x.amount, 0));
    return { rows, invoiced, paid, balance: round2(invoiced - paid), invoiceRefs: new Set(invs.map((x) => x.ref)) };
  }

  const stA = useMemo(() => (accountA ? statementFor(accountA) : null), [accountA, sales, accountPayments]); // eslint-disable-line react-hooks/exhaustive-deps
  const stB = useMemo(() => (accountB ? statementFor(accountB) : null), [accountB, sales, accountPayments]); // eslint-disable-line react-hooks/exhaustive-deps

  function printStatement(name: string) {
    const st = statementFor(name);
    const t = statementTemplate;
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    const body = st.rows
      .map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td><td style="text-align:right">${r.kind === 'Invoice' ? money(r.amount) : ''}</td><td style="text-align:right">${r.kind === 'Payment' ? money(r.amount) : ''}</td><td style="text-align:right">${money(r.balance)}</td></tr>`)
      .join('');
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) {
      flash('Allow pop-ups to print the statement');
      return;
    }
    w.document.write(`<html><head><title>Statement - ${esc(name)}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;font-size:13px}th{text-align:left;background:#f3f4f6}
      h1{margin:0;font-size:22px}.muted{color:#666;font-size:12px}.bal{font-size:18px;font-weight:bold;margin-top:14px}</style></head><body>
      <h1>${esc(t.company)}</h1><div class="muted">${esc(t.address)}</div>
      <h2 style="margin-top:20px">${esc(t.header)}</h2>
      <div><b>Customer:</b> ${esc(name)}</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th style="text-align:right">Invoice</th><th style="text-align:right">Payment</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${body || '<tr><td colspan="6">No activity</td></tr>'}</tbody></table>
      <div class="bal">Amount due: ${money(st.balance)}</div>
      <p class="muted" style="margin-top:28px">${esc(t.footer)}</p>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  }

  if (tab === 'invoices') {
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Invoice search</h2>
        <div className="ury-form-row">
          <label className="ury-field"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="ury-field"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="ury-field"><span>Invoice / ticket no.</span><input value={invNo} placeholder="e.g. 046" onChange={(e) => setInvNo(e.target.value)} /></label>
        </div>
        <p className="ury-muted">{invoices.length} invoice(s) found <ExportButton canExport={canExport} onClick={() => exportCsv('invoices', [['Ticket', 'Date', 'Type', 'Table / customer', 'Payment', 'Total'], ...invoices.map((s) => [s.ticketNumber, dateLabel(s), s.type, s.customerName || s.table, s.paymentMethod, s.total])])} /></p>
        <table className="ury-report-table">
          <thead><tr><th>Ticket</th><th>Type</th><th>Table / customer</th><th>Payment</th><th>Total</th><th /></tr></thead>
          <tbody>
            {invoices.map((s) => (
              <tr key={s.id}>
                <td>#{s.ticketNumber}</td>
                <td>{s.type}</td>
                <td>{s.customerName || s.table}</td>
                <td>{s.paymentMethod}</td>
                <td>{money(s.total)}</td>
                <td><button type="button" className="ury-ghost" onClick={() => onReprint(s)}><Printer size={12} aria-hidden /> Reprint</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  if (tab === 'category') {
    const byCat: Record<string, { qty: number; amount: number }> = {};
    for (const s of sales) {
      for (const l of s.lines) {
        const c = l.category || 'Uncategorised';
        byCat[c] ??= { qty: 0, amount: 0 };
        byCat[c].qty += l.qty;
        byCat[c].amount += l.amount;
      }
    }
    const rows = Object.entries(byCat).sort((a, b) => b[1].amount - a[1].amount);
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Sales by category <ExportButton canExport={canExport} onClick={() => exportCsv('category', [['Category', 'Qty', 'Value'], ...rows.map(([c, v]) => [c, v.qty, round2(v.amount)])])} /></h2>
        <table className="ury-report-table">
          <thead><tr><th>Category</th><th>Qty sold</th><th>Value</th></tr></thead>
          <tbody>
            {rows.map(([c, v]) => (
              <tr key={c}><td>{c}</td><td>{v.qty}</td><td>{money(v.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="ury-muted">No sales yet.</p>}
      </section>
    );
  }

  if (tab === 'adjustments') {
    const byStaff: Record<string, { sales: number; discountCount: number; discount: number; tips: number }> = {};
    for (const s of sales) {
      byStaff[s.by] ??= { sales: 0, discountCount: 0, discount: 0, tips: 0 };
      byStaff[s.by].sales += 1;
      if ((s.discount ?? 0) > 0) {
        byStaff[s.by].discountCount += 1;
        byStaff[s.by].discount += s.discount ?? 0;
      }
      byStaff[s.by].tips += s.tip ?? 0;
    }
    const rows = Object.entries(byStaff);
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Discounts &amp; tips by staff <ExportButton canExport={canExport} onClick={() => exportCsv('discounts-tips', [['Staff', 'Paid tickets', 'Discounted tickets', 'Discount value', 'Tips'], ...rows.map(([n, v]) => [n, v.sales, v.discountCount, round2(v.discount), round2(v.tips)])])} /></h2>
        <p className="ury-muted">Cancelled items are listed under Voids &amp; cancels.</p>
        <table className="ury-report-table">
          <thead><tr><th>Staff</th><th>Paid tickets</th><th>Discounted tickets</th><th>Discount value</th><th>Tips</th></tr></thead>
          <tbody>
            {rows.map(([name, v]) => (
              <tr key={name}><td>{name}</td><td>{v.sales}</td><td>{v.discountCount}</td><td>{money(v.discount)}</td><td>{money(v.tips)}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="ury-muted">No sales yet.</p>}
      </section>
    );
  }

  if (tab === 'captains') {
    type Row = { captain: string; openTables: Set<string>; covers: number; sales: number; salesValue: number; items: number; discounts: number; discountValue: number; cancels: number; cancelValue: number };
    const byCap: Record<string, Row> = {};
    const get = (name: string): Row => {
      byCap[name] ??= { captain: name, openTables: new Set(), covers: 0, sales: 0, salesValue: 0, items: 0, discounts: 0, discountValue: 0, cancels: 0, cancelValue: 0 };
      return byCap[name];
    };
    for (const t of openTickets) {
      if (t.type !== 'Dine in' || t.status === 'Paid' || t.items.length === 0) continue;
      const r = get(t.captain || 'Unassigned');
      r.openTables.add(t.table);
      r.covers += t.partySize || 0;
    }
    for (const s of sales) {
      const r = get(s.captain || s.by || 'Unassigned');
      r.sales += 1;
      r.salesValue += s.total;
      r.items += s.itemCount;
      if ((s.discount ?? 0) > 0) {
        r.discounts += 1;
        r.discountValue += s.discount ?? 0;
      }
      r.covers += s.covers ?? 0;
    }
    for (const c of cancelRows) {
      const r = get(c.captain || c.by || 'Unassigned');
      r.cancels += 1;
      r.cancelValue += c.amount;
    }
    const rows = Object.values(byCap).sort((a, b) => b.salesValue - a.salesValue);
    const header = ['Captain', 'Open tables', 'Covers (open + served)', 'Paid sales', 'Sales value', 'Items sold', 'Discounts', 'Discount value', 'Cancels', 'Cancel value'];
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Captains: open tables &amp; covers <ExportButton canExport={canExport} onClick={() => exportCsv('captains', [header, ...rows.map((r) => [r.captain, r.openTables.size, r.covers, r.sales, round2(r.salesValue), r.items, r.discounts, round2(r.discountValue), r.cancels, round2(r.cancelValue)])])} /></h2>
        <table className="ury-report-table">
          <thead><tr>{header.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.captain}>
                <td>{r.captain}</td><td>{r.openTables.size}</td><td>{r.covers}</td><td>{r.sales}</td><td>{money(r.salesValue)}</td>
                <td>{r.items}</td><td>{r.discounts}</td><td>{money(r.discountValue)}</td><td>{r.cancels}</td><td>{money(r.cancelValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="ury-muted">No captain activity yet.</p>}
      </section>
    );
  }

  if (tab === 'cancels') {
    const total = round2(cancelRows.reduce((a, c) => a + c.amount, 0));
    const header = ['Time', 'Ticket', 'Table', 'Item', 'Qty', 'Amount', 'Reason', 'Cancelled by', 'Captain', 'Already sent to kitchen', 'Ticket state'];
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Voids &amp; cancels <ExportButton canExport={canExport} onClick={() => exportCsv('cancels', [header, ...cancelRows.map((c) => [c.at, c.ticket, c.table, c.name, c.qty, round2(c.amount), c.reason, c.by, c.captain ?? '', c.wasSent ? 'Yes' : 'No', c.source === 'paid' ? 'Paid' : 'Open'])])} /></h2>
        <p className="ury-muted">{cancelRows.length} cancelled item(s), value {money(total)}. Items cancelled before the kitchen saw them are removed without a void; sent items need a Cash Supervisor or Manager.</p>
        <table className="ury-report-table">
          <thead><tr>{header.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {cancelRows.map((c, i) => (
              <tr key={`${c.atMs}-${i}`}>
                <td>{c.at}</td><td>#{c.ticket}</td><td>{c.table}</td><td>{c.name}</td><td>{c.qty}</td><td>{money(c.amount)}</td>
                <td>{c.reason}</td><td>{c.by}</td><td>{c.captain ?? '—'}</td><td>{c.wasSent ? 'Yes' : 'No'}</td><td>{c.source === 'paid' ? 'Paid' : 'Open'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cancelRows.length && <p className="ury-muted">No cancelled items.</p>}
      </section>
    );
  }

  if (tab === 'statements') {
    const sel = (value: string, set: (v: string) => void, label: string) => (
      <label className="ury-field">
        <span>{label}</span>
        <select value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Select customer…</option>
          {customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    );
    const recon = stA && stB ? {
      diff: round2(stA.balance - stB.balance),
      onlyA: Array.from(stA.invoiceRefs).filter((r) => !stB.invoiceRefs.has(r)),
      onlyB: Array.from(stB.invoiceRefs).filter((r) => !stA.invoiceRefs.has(r)),
    } : null;
    const current = accountA ? stA : null;
    return (
      <section className="ury-report-panel">
        <h2 className="ury-panel-sub">Customer statements &amp; account reconcile</h2>
        <div className="ury-form-row">
          {sel(accountA, setAccountA, 'Account A')}
          {sel(accountB, setAccountB, 'Account B (compare)')}
        </div>
        {stA && (
          <>
            <h3 className="ury-panel-sub" style={{ marginTop: 14 }}>Statement · {accountA}</h3>
            <table className="ury-report-table">
              <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Invoice</th><th>Payment</th><th>Balance</th></tr></thead>
              <tbody>
                {stA.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td><td>{r.kind}</td><td>{r.ref}</td>
                    <td>{r.kind === 'Invoice' ? money(r.amount) : ''}</td><td>{r.kind === 'Payment' ? money(r.amount) : ''}</td><td>{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stA.rows.length && <p className="ury-muted">No activity on this account.</p>}
            <p style={{ marginTop: 8 }}>
              <b>Amount due: {money(stA.balance)}</b>{' '}
              <button type="button" className="ury-ghost" onClick={() => printStatement(accountA)}><Printer size={12} aria-hidden /> Print statement</button>{' '}
              <ExportButton canExport={canExport} onClick={() => exportCsv(`statement-${accountA}`, [['Date', 'Type', 'Reference', 'Invoice', 'Payment', 'Balance'], ...stA.rows.map((r) => [r.date, r.kind, r.ref, r.kind === 'Invoice' ? r.amount : '', r.kind === 'Payment' ? r.amount : '', r.balance])])} />
            </p>
            <div className="ury-form-card" style={{ padding: 12, marginTop: 10 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Record payment on account</h3>
              <div className="ury-form-row">
                <label className="ury-field"><span>Amount</span><input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></label>
                <label className="ury-field"><span>Method</span>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as AccountPayment['method'])}>
                    <option>Cash</option><option>Card</option><option>Bank transfer</option>
                  </select>
                </label>
                <label className="ury-field"><span>Note</span><input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Receipt / cheque no." /></label>
              </div>
              <button
                type="button"
                className="ury-submit"
                onClick={() => {
                  const amt = Number(payAmount);
                  if (!(amt > 0)) return flash('Enter a payment amount');
                  onRecordPayment({ id: `p-${Date.now().toString(36)}`, customer: accountA, at: new Date().toLocaleString(), amountPaid: round2(amt), method: payMethod, note: payNote.trim() });
                  setPayAmount('');
                  setPayNote('');
                  flash(`Payment ${money(amt)} recorded for ${accountA}`);
                }}
              >
                Record payment
              </button>
            </div>
            {current && <p className="ury-muted" style={{ marginTop: 6 }}>Invoiced {money(current.invoiced)} · paid {money(current.paid)}</p>}
          </>
        )}
        {recon && (
          <div className="ury-form-card" style={{ padding: 12, marginTop: 14 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Reconcile {accountA} vs {accountB}</h3>
            <table className="ury-report-table">
              <thead><tr><th>Account</th><th>Invoiced</th><th>Paid</th><th>Amount due</th></tr></thead>
              <tbody>
                <tr><td>{accountA}</td><td>{money(stA!.invoiced)}</td><td>{money(stA!.paid)}</td><td>{money(stA!.balance)}</td></tr>
                <tr><td>{accountB}</td><td>{money(stB!.invoiced)}</td><td>{money(stB!.paid)}</td><td>{money(stB!.balance)}</td></tr>
              </tbody>
            </table>
            <p style={{ marginTop: 8 }}>
              Difference in amount due: <b>{money(Math.abs(recon.diff))}</b> {recon.diff === 0 ? '(balanced)' : recon.diff > 0 ? `(${accountA} owes more)` : `(${accountB} owes more)`}
            </p>
            <p className="ury-muted">Invoices only on {accountA}: {recon.onlyA.join(', ') || 'none'}</p>
            <p className="ury-muted">Invoices only on {accountB}: {recon.onlyB.join(', ') || 'none'}</p>
            <ExportButton canExport={canExport} onClick={() => exportCsv('reconcile', [['Account', 'Invoiced', 'Paid', 'Amount due'], [accountA, stA!.invoiced, stA!.paid, stA!.balance], [accountB, stB!.invoiced, stB!.paid, stB!.balance], ['Difference', '', '', recon.diff]])} />
          </div>
        )}
        {!accountA && <p className="ury-muted">Choose an account to see its statement. Credit customers appear here after a credit sale.</p>}
      </section>
    );
  }

  // credit: sales on account grouped by customer
  const byCustomer: Record<string, { count: number; total: number; invoices: string[] }> = {};
  for (const s of sales.filter((x) => x.paymentMethod === 'Credit')) {
    const key = s.customerName || 'Unnamed customer';
    byCustomer[key] ??= { count: 0, total: 0, invoices: [] };
    byCustomer[key].count += 1;
    byCustomer[key].total += s.total;
    byCustomer[key].invoices.push(`#${s.ticketNumber}`);
  }
  const creditRows = Object.entries(byCustomer).sort((a, b) => b[1].total - a[1].total);
  const loyalty = sales.filter((s) => s.paymentMethod === 'Loyalty');
  return (
    <section className="ury-report-panel">
      <h2 className="ury-panel-sub">Credit sales by customer <ExportButton canExport={canExport} onClick={() => exportCsv('credit-by-customer', [['Customer', 'Invoices', 'Invoice value', 'Invoice numbers'], ...creditRows.map(([n, v]) => [n, v.count, round2(v.total), v.invoices.join(' ')])])} /></h2>
      <table className="ury-report-table">
        <thead><tr><th>Customer</th><th>Invoices</th><th>Outstanding value</th><th>Invoice numbers</th></tr></thead>
        <tbody>
          {creditRows.map(([name, v]) => (
            <tr key={name}><td>{name}</td><td>{v.count}</td><td>{money(v.total)}</td><td>{v.invoices.join(', ')}</td></tr>
          ))}
        </tbody>
      </table>
      {!creditRows.length && <p className="ury-muted">No credit sales yet.</p>}
      <p className="ury-muted" style={{ marginTop: 12 }}>
        Loyalty card tenders: {loyalty.length} invoice(s), {money(loyalty.reduce((a, s) => a + s.total, 0))}
      </p>
    </section>
  );
}

