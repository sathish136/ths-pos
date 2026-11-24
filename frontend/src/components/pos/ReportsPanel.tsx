import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileText, Printer } from 'lucide-react';
import type { StockMove } from '../../lib/inventory';
import { ExtraReports, type ExtraReportId } from './ExtraReports';
import { downloadExcelFile } from '../../lib/excel-export';
import type { ExcelColumn } from '../../lib/extras';
import type { AccountPayment, StatementTemplate } from '../../lib/extras';
import type { CancelledLine, Ticket } from '../../lib/order-process';
import { BRANCHES } from '../../lib/branches';
import { erpSalesReport } from '../../lib/erp-api';

export type SaleRecord = {
  id: string;
  at: string;
  ticketNumber: string;
  type: string;
  table: string;
  paymentMethod: 'Card' | 'Cash' | 'Split' | 'Credit' | 'Loyalty';
  cashAmount?: number;
  cardAmount?: number;
  changeDue?: number;
  total: number;
  /** Bill-level discount taken off before tax */
  discount?: number;
  /** Tip collected (not part of total) */
  tip?: number;
  /** Customer account for credit sales / loyalty card id */
  customerName?: string;
  loyaltyId?: string;
  /** dine-in / takeaway / delivery / online */
  channel?: string;
  /** Captain / staff member who opened the ticket */
  captain?: string;
  /** Guests served on the ticket */
  covers?: number;
  /** Rider who collected payment (delivery) */
  driverName?: string;
  /** Items cancelled on the way to this sale */
  cancelled?: CancelledLine[];
  itemCount: number;
  by: string;
  /** epoch ms when paid — used for invoice date search */
  paidAtMs?: number;
  lines: { name: string; qty: number; amount: number; category?: string }[];
  branchId?: string;
};

type Props = {
  sales: SaleRecord[];
  /** Column keys for CSV export (Admin → Export columns) */
  reportColumns?: string[];
  /** Excel export template from Admin */
  excelTemplate?: ExcelColumn[];
  moves: StockMove[];
  restaurantName: string;
  taxRatePct: number;
  branchId: string;
  branchName: string;
  canExport: boolean;
  flash: (msg: string) => void;
  onReprint?: (sale: SaleRecord) => void;
  /** Open tickets (captain covers, cancellations still open) */
  openTickets?: Ticket[];
  accountPayments?: AccountPayment[];
  statementTemplate?: StatementTemplate;
  onRecordPayment?: (p: AccountPayment) => void;
};

type ReportId =
  | 'summary'
  | 'z'
  | 'sales'
  | 'items'
  | 'payments'
  | 'service'
  | 'staff'
  | 'branch'
  | 'stock'
  | 'cancels'
  | 'captains'
  | 'statements'
  | 'invoices'
  | 'category'
  | 'adjustments'
  | 'credit';

const REPORTS: { id: ReportId; label: string; blurb: string }[] = [
  { id: 'invoices', label: 'Invoice search', blurb: 'Find an invoice by date range or number and reprint it' },
  { id: 'category', label: 'By category', blurb: 'Quantity and value per menu category' },
  { id: 'adjustments', label: 'Discounts & tips', blurb: 'Discounts and tips per staff member' },
  { id: 'credit', label: 'Credit by customer', blurb: 'Credit invoices grouped by customer' },
  { id: 'summary', label: 'Service summary', blurb: 'KPIs for the current service' },
  { id: 'z', label: 'Z / day close', blurb: 'End-of-day cash-up style totals' },
  { id: 'sales', label: 'Sales by ticket', blurb: 'Every paid ticket' },
  { id: 'items', label: 'Item sales', blurb: 'Dish mix & revenue' },
  { id: 'payments', label: 'Payments', blurb: 'Card vs cash tender' },
  { id: 'service', label: 'Order type', blurb: 'Dine in / Takeaway / Delivery' },
  { id: 'staff', label: 'Staff sales', blurb: 'Who settled what' },
  { id: 'branch', label: 'By branch', blurb: 'Outlet comparison' },
  { id: 'stock', label: 'Recipe usage', blurb: 'Kitchen BOM pulls' },
  { id: 'captains', label: 'Captains', blurb: 'Open tables, covers and sales per captain' },
  { id: 'cancels', label: 'Voids & cancels', blurb: 'Cancelled items with reason and who cancelled' },
  { id: 'statements', label: 'Statements', blurb: 'Customer statements, payments on account, reconcile two accounts' },
];

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function summarize(sales: SaleRecord[], moves: StockMove[]) {
  const revenue = sales.reduce((s, r) => s + r.total, 0);
  const covers = sales.reduce((s, r) => s + r.itemCount, 0);
  const byPay: Record<'Card' | 'Cash' | 'Split' | 'Credit' | 'Loyalty', number> = { Card: 0, Cash: 0, Split: 0, Credit: 0, Loyalty: 0 };
  const byType: Record<string, { count: number; total: number }> = {};
  const byStaff: Record<string, { count: number; total: number }> = {};
  const byBranch: Record<string, { count: number; total: number }> = {};
  const byDish: Record<string, { qty: number; amount: number }> = {};
  for (const sale of sales) {
    byPay[sale.paymentMethod] += sale.total;
    byType[sale.type] ??= { count: 0, total: 0 };
    byType[sale.type].count += 1;
    byType[sale.type].total += sale.total;
    byStaff[sale.by] ??= { count: 0, total: 0 };
    byStaff[sale.by].count += 1;
    byStaff[sale.by].total += sale.total;
    const bid = sale.branchId ?? 'main';
    byBranch[bid] ??= { count: 0, total: 0 };
    byBranch[bid].count += 1;
    byBranch[bid].total += sale.total;
    for (const line of sale.lines) {
      byDish[line.name] ??= { qty: 0, amount: 0 };
      byDish[line.name].qty += line.qty;
      byDish[line.name].amount += line.amount;
    }
  }
  const topDishes = Object.entries(byDish)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);
  const stockUsed = Object.entries(
    moves
      .filter((m) => m.qty > 0)
      .reduce<Record<string, { name: string; qty: number; unit: string }>>((acc, m) => {
        acc[m.ingredientId] ??= { name: m.ingredientName, qty: 0, unit: m.unit };
        acc[m.ingredientId].qty += m.qty;
        return acc;
      }, {}),
  )
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.qty - a.qty);
  const taxEstimate = revenue - revenue / (1 + 0.0825);
  return {
    revenue,
    covers,
    tickets: sales.length,
    byPay,
    byType,
    byStaff,
    byBranch,
    topDishes,
    stockUsed,
    avgTicket: sales.length ? revenue / sales.length : 0,
    taxEstimate: Math.max(0, taxEstimate),
  };
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DEFAULT_CSV_COLUMNS = ['ticketNumber', 'at', 'type', 'table', 'paymentMethod', 'subtotal', 'discount', 'tax', 'tip', 'total', 'by'];

function csvCell(s: SaleRecord, key: string, taxRatePct: number): string | number {
  const rate = taxRatePct / 100;
  const discount = s.discount ?? 0;
  const net = rate > 0 ? s.total / (1 + rate) : s.total;
  const round = (n: number) => Math.round(n * 100) / 100;
  switch (key) {
    case 'ticketNumber': return s.ticketNumber;
    case 'at': return s.at;
    case 'type': return s.type;
    case 'table': return s.table;
    case 'customerName': return s.customerName ?? '';
    case 'paymentMethod': return s.paymentMethod;
    case 'itemCount': return s.itemCount;
    case 'subtotal': return round(net + discount);
    case 'discount': return round(discount);
    case 'tax': return round(s.total - net);
    case 'tip': return round(s.tip ?? 0);
    case 'total': return round(s.total);
    case 'by': return s.by;
    default: return '';
  }
}

export function ReportsPanel(props: Props) {
  const { sales, moves, canExport, flash, restaurantName, taxRatePct, branchName } = props;
  const [tab, setTab] = useState<ReportId>('summary');
  const [scope, setScope] = useState<'branch' | 'all'>('all');
  const [erpSalesTotal, setErpSalesTotal] = useState<{ count: number; total: number } | null>(null);
  useEffect(() => {
    void erpSalesReport()
      .then((r: { count?: number; total?: number }) =>
        setErpSalesTotal({ count: Number(r?.count || 0), total: Number(r?.total || 0) }),
      )
      .catch(() => setErpSalesTotal(null));
  }, [sales]);
  const filtered = useMemo(
    () => (scope === 'all' ? sales : sales.filter((s) => (s.branchId ?? 'main') === props.branchId)),
    [sales, scope, props.branchId],
  );
  const report = useMemo(() => summarize(filtered, moves), [filtered, moves]);
  const activeMeta = REPORTS.find((r) => r.id === tab)!;

  function buildText(): string {
    const lines = [
      `${restaurantName} — ${activeMeta.label}`,
      `Branch scope: ${scope === 'all' ? 'All outlets' : branchName}`,
      `Generated ${new Date().toLocaleString()}`,
      `Tax rate ${taxRatePct}%`,
      '',
      `Revenue: ${money(report.revenue)}`,
      `Tickets: ${report.tickets}`,
      `Items: ${report.covers}`,
      `Avg ticket: ${money(report.avgTicket)}`,
      `Card: ${money(report.byPay.Card)} | Cash: ${money(report.byPay.Cash)}`,
      '',
      'Item sales',
      ...report.topDishes.map((d) => `  ${d.qty}× ${d.name} — ${money(d.amount)}`),
      '',
      'Tickets',
      ...filtered.map((s) => `  #${s.ticketNumber} ${s.at} ${s.type} ${s.table} ${s.paymentMethod} ${money(s.total)} (${s.by})`),
      '',
      'Stock usage',
      ...report.stockUsed.map((r) => `  ${r.name}: −${Number(r.qty.toFixed(3))} ${r.unit}`),
    ];
    return lines.join('\n');
  }

  /** CSV for the extra report tabs (same manager gate as the sales export). */
  function exportRows(name: string, rows: (string | number)[][]) {
    if (!canExport) {
      flash('Manager exports reports in this demo');
      return;
    }
    downloadBlob(
      rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'),
      `ury-${name}-${Date.now()}.csv`,
      'text/csv',
    );
    flash(`Downloaded ${name}.csv`);
  }

  function download(kind: 'txt' | 'csv' | 'excel') {
    if (!canExport) {
      flash('Manager exports reports in this demo');
      return;
    }
    if (kind === 'txt') {
      downloadBlob(buildText(), `ury-${tab}-${Date.now()}.txt`, 'text/plain');
    } else {
      const excelCols = (props.excelTemplate?.filter((c) => c.enabled)?.length
        ? props.excelTemplate.filter((c) => c.enabled)
        : (props.reportColumns?.length ? props.reportColumns : DEFAULT_CSV_COLUMNS).map((k) => ({ key: k, header: k, enabled: true })));
      const headers = excelCols.map((c) => c.header || c.key);
      const dataRows = filtered.map((sale) => excelCols.map((c) => csvCell(sale, c.key, taxRatePct)));
      if (kind === 'excel') {
        downloadExcelFile(`ury-sales-${Date.now()}.xls`, 'Sales', headers, dataRows);
      } else {
        const rows: (string | number)[][] = [headers, ...dataRows];
        downloadBlob(
          rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'),
          `ury-sales-${Date.now()}.csv`,
          'text/csv',
        );
      }
    }
    flash(`Downloaded ${kind.toUpperCase()} · ${activeMeta.label}`);
  }

  return (
    <section className="ury-panel" id="ury-report-print">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><BarChart3 size={13} /> REPORTS</div>
          <h1>All reports</h1>
          <p>Demo pack — summary, Z close, items, payments, staff, branch, recipe usage. Print or export.</p>
        </div>
        <div className="ury-report-actions">
          <select
            className="ury-report-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'branch' | 'all')}
            aria-label="Report scope"
          >
            <option value="all">All branches</option>
            <option value="branch">This branch only</option>
          </select>
          <button type="button" className="ury-ghost" disabled={!canExport} onClick={() => download('txt')}>
            <FileText size={14} /> TXT
          </button>
          <button type="button" className="ury-ghost" disabled={!canExport} onClick={() => download('csv')}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="ury-ghost" disabled={!canExport} onClick={() => download('excel')}>
            <Download size={14} /> Excel
          </button>
          <button
            type="button"
            className="ury-submit"
            style={{ width: 'auto', padding: '0 14px' }}
            onClick={() => { window.print(); flash('Print dialog — report'); }}
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <div className="ury-report-tabs">
        {REPORTS.map((r) => (
          <button key={r.id} type="button" className={tab === r.id ? 'on' : ''} onClick={() => setTab(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <p className="ury-muted" style={{ marginBottom: 16 }}>{activeMeta.blurb}</p>

      <div className="ury-kpi-row">
        <div className="ury-kpi"><small>Revenue</small><strong>{money(report.revenue)}</strong></div>
        <div className="ury-kpi"><small>Tickets</small><strong>{report.tickets}</strong></div>
        <div className="ury-kpi"><small>Avg ticket</small><strong>{money(report.avgTicket)}</strong></div>
        <div className="ury-kpi"><small>Items sold</small><strong>{report.covers}</strong></div>
        {erpSalesTotal ? (
          <div className="ury-kpi">
            <small>ERP POS today</small>
            <strong>
              {money(erpSalesTotal.total)} · {erpSalesTotal.count}
            </strong>
          </div>
        ) : null}
      </div>

      {(['invoices', 'category', 'adjustments', 'credit', 'captains', 'cancels', 'statements'] as string[]).includes(tab) && (
        <ExtraReports
          tab={tab as ExtraReportId}
          sales={sales}
          openTickets={props.openTickets ?? []}
          accountPayments={props.accountPayments ?? []}
          statementTemplate={props.statementTemplate ?? { company: restaurantName, address: '', header: 'Account statement', footer: '' }}
          canExport={canExport}
          onRecordPayment={(p) => props.onRecordPayment?.(p)}
          onReprint={props.onReprint ?? (() => flash('Reprint not available'))}
          exportCsv={exportRows}
          flash={flash}
        />
      )}

      {tab === 'summary' && (
        <div className="ury-report-cols">
          <div>
            <h2 className="ury-panel-sub">Top dishes</h2>
            {report.topDishes.length === 0 ? <p className="ury-muted">No sales yet.</p> : report.topDishes.slice(0, 8).map((d) => (
              <div key={d.name} className="ury-report-line"><span>{d.qty}× {d.name}</span><strong>{money(d.amount)}</strong></div>
            ))}
          </div>
          <div>
            <h2 className="ury-panel-sub">Tender split</h2>
            <div className="ury-report-line"><span>Card</span><strong>{money(report.byPay.Card)}</strong></div>
            <div className="ury-report-line"><span>Cash</span><strong>{money(report.byPay.Cash)}</strong></div>
            <div className="ury-report-line"><span>Est. tax in total</span><strong>{money(report.taxEstimate)}</strong></div>
          </div>
        </div>
      )}

      {tab === 'z' && (
        <div className="ury-z-block">
          <h2 className="ury-panel-sub">Z-report (demo close)</h2>
          <div className="ury-report-line"><span>Gross sales</span><strong>{money(report.revenue)}</strong></div>
          <div className="ury-report-line"><span>Ticket count</span><strong>{report.tickets}</strong></div>
          <div className="ury-report-line"><span>Card tender</span><strong>{money(report.byPay.Card)}</strong></div>
          <div className="ury-report-line"><span>Cash tender</span><strong>{money(report.byPay.Cash)}</strong></div>
          <div className="ury-report-line"><span>Expected drawer (cash)</span><strong>{money(report.byPay.Cash)}</strong></div>
          <div className="ury-report-line"><span>Voids</span><strong>0 (demo)</strong></div>
          <p className="ury-muted" style={{ marginTop: 12 }}>Print this tab for a close-out sheet. Not a fiscal Z — demo only.</p>
        </div>
      )}

      {tab === 'sales' && (
        <>
          <h2 className="ury-panel-sub">Paid tickets</h2>
          {filtered.length === 0 ? <p className="ury-muted">No tickets in scope.</p> : (
            <div className="ury-move-list">
              {filtered.map((s) => (
                <div key={s.id} className="ury-move">
                  <span>{s.at}</span>
                  <strong>#{s.ticketNumber}</strong>
                  <span>{s.type} · {s.table}</span>
                  <em>{s.paymentMethod} · {money(s.total)}</em>
                  <small>{s.by}</small>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'items' && (
        <>
          <h2 className="ury-panel-sub">Item sales mix</h2>
          {report.topDishes.length === 0 ? <p className="ury-muted">No item sales.</p> : report.topDishes.map((d) => (
            <div key={d.name} className="ury-report-line">
              <span>{d.qty}× {d.name}</span>
              <strong>{money(d.amount)}</strong>
            </div>
          ))}
        </>
      )}

      {tab === 'payments' && (
        <div className="ury-report-cols">
          <div>
            <h2 className="ury-panel-sub">By tender</h2>
            <div className="ury-report-line"><span>Card</span><strong>{money(report.byPay.Card)}</strong></div>
            <div className="ury-report-line"><span>Cash</span><strong>{money(report.byPay.Cash)}</strong></div>
            <div className="ury-report-line"><span>Total</span><strong>{money(report.revenue)}</strong></div>
          </div>
          <div>
            <h2 className="ury-panel-sub">Share</h2>
            <div className="ury-report-line">
              <span>Card %</span>
              <strong>{report.revenue ? Math.round((report.byPay.Card / report.revenue) * 100) : 0}%</strong>
            </div>
            <div className="ury-report-line">
              <span>Cash %</span>
              <strong>{report.revenue ? Math.round((report.byPay.Cash / report.revenue) * 100) : 0}%</strong>
            </div>
          </div>
        </div>
      )}

      {tab === 'service' && (
        <>
          <h2 className="ury-panel-sub">By order type</h2>
          {Object.keys(report.byType).length === 0 ? <p className="ury-muted">No data.</p> : Object.entries(report.byType).map(([k, v]) => (
            <div key={k} className="ury-report-line">
              <span>{k} · {v.count} tickets</span>
              <strong>{money(v.total)}</strong>
            </div>
          ))}
        </>
      )}

      {tab === 'staff' && (
        <>
          <h2 className="ury-panel-sub">Staff sales</h2>
          {Object.entries(report.byStaff).map(([k, v]) => (
            <div key={k} className="ury-report-line">
              <span>{k} · {v.count} tickets</span>
              <strong>{money(v.total)}</strong>
            </div>
          ))}
        </>
      )}

      {tab === 'branch' && (
        <>
          <h2 className="ury-panel-sub">Outlet comparison</h2>
          {BRANCHES.map((b) => {
            const v = report.byBranch[b.id] ?? { count: 0, total: 0 };
            return (
              <div key={b.id} className="ury-report-line">
                <span>{b.name} ({b.code}) · {v.count} tickets</span>
                <strong>{money(v.total)}</strong>
              </div>
            );
          })}
        </>
      )}

      {tab === 'stock' && (
        <>
          <h2 className="ury-panel-sub">Recipe stock used</h2>
          {report.stockUsed.length === 0 ? <p className="ury-muted">No kitchen deductions yet.</p> : report.stockUsed.map((r) => (
            <div key={r.id} className="ury-report-line">
              <span>{r.name}</span>
              <strong>−{Number(r.qty.toFixed(3))} {r.unit}</strong>
            </div>
          ))}
        </>
      )}

    </section>
  );
}
