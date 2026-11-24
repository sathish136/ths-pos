import { useEffect, useState } from 'react';
import { ClipboardCheck, Lock, Unlock } from 'lucide-react';
import { erpCloseShift, erpOpenShift } from '../../lib/erp-api';
import { type ShiftRecord, closeShift, openShift } from '../../lib/shifts';
import type { SaleRecord } from './ReportsPanel';

type Props = {
  shift: ShiftRecord | null;
  history: ShiftRecord[];
  sales: SaleRecord[];
  staffName: string;
  canManage: boolean;
  onShift: (s: ShiftRecord | null) => void;
  onHistory: (h: ShiftRecord[]) => void;
  /** Prefer this for close — persists history + clears open shift together */
  onCloseShift?: (closed: ShiftRecord) => void;
  /** Live tickets with items that are not paid yet */
  openTicketCount?: number;
  /** Other cashier / supervisor devices with a live session */
  otherCashierStations?: number;
  flash: (msg: string) => void;
  posProfile?: string;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export function ShiftsPanel({
  shift,
  history,
  sales,
  staffName,
  canManage,
  onShift,
  onHistory,
  onCloseShift,
  openTicketCount = 0,
  otherCashierStations = 0,
  flash,
  posProfile,
}: Props) {
  const [floatAmt, setFloatAmt] = useState('200');
  const [declared, setDeclared] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const cashSales = sales.reduce((a, s) => {
    if (s.paymentMethod === 'Cash') return a + s.total;
    if (s.paymentMethod === 'Split') return a + (s.cashAmount ?? 0);
    return a;
  }, 0);
  const cardSales = sales.reduce((a, s) => {
    if (s.paymentMethod === 'Card') return a + s.total;
    if (s.paymentMethod === 'Split') return a + (s.cardAmount ?? 0);
    return a;
  }, 0);
  const opening = shift?.openingFloat ?? 0;
  const expectedCash = Math.round((opening + cashSales) * 100) / 100;

  // Prefill declared cash with expected so Close always works in the demo.
  useEffect(() => {
    if (shift?.status === 'open' && declared === '') {
      setDeclared(String(expectedCash));
    }
  }, [shift?.id, shift?.status, expectedCash, declared]);

  async function doOpen() {
    if (!canManage || busy) return;
    if (shift?.status === 'open') {
      flash('Shift already open');
      return;
    }
    const n = Number(floatAmt) || 0;
    setBusy(true);
    try {
      const erp = await erpOpenShift(posProfile, n);
      const next = openShift(staffName, n);
      if (erp && typeof erp === 'object' && 'id' in (erp as object)) {
        next.id = String((erp as { id: string }).id);
      }
      onShift(next);
      setDeclared(String(n));
      flash(`Shift opened · float ${money(n)}`);
    } catch (err) {
      console.warn('ERP open_shift failed', err);
      const next = openShift(staffName, n);
      onShift(next);
      setDeclared(String(n));
      flash(`Shift opened locally · float ${money(n)}`);
    } finally {
      setBusy(false);
    }
  }

  async function doClose(useExpected = false) {
    if (!canManage) {
      flash('Manager only can close shift');
      return;
    }
    if (!shift || shift.status !== 'open') {
      flash('Open a shift first');
      return;
    }
    const raw = useExpected ? expectedCash : Number(declared);
    if (Number.isNaN(raw)) {
      flash('Enter declared cash in drawer (or tap Close with expected)');
      return;
    }
    if (otherCashierStations > 0) {
      const ok = window.confirm(`${otherCashierStations} other cashier / supervisor station(s) are still signed in.\n\nClose the shift for this device anyway?`);
      if (!ok) {
        flash('Close cancelled — other stations still open');
        return;
      }
    }
    if (openTicketCount > 0) {
      const ok = window.confirm(
        `${openTicketCount} open ticket(s) are not paid yet.\n\nClose the shift anyway? Those tickets stay open in Orders and are not settled by this close.`,
      );
      if (!ok) {
        flash('Close cancelled — settle open tickets first');
        return;
      }
    }
    const declaredCash = raw;
    setBusy(true);
    try {
      await erpCloseShift(posProfile, declaredCash);
    } catch (err) {
      console.warn('ERP close_shift failed', err);
    } finally {
      setBusy(false);
    }
    const closed = closeShift(shift, staffName, {
      declaredCash,
      expectedCash,
      cardTotal: cardSales,
      note: note || undefined,
    });
    if (onCloseShift) {
      onCloseShift(closed);
    } else {
      onHistory([closed, ...history].slice(0, 20));
      onShift(null);
    }
    setDeclared('');
    setNote('');
    flash(`Shift closed · variance ${money(closed.variance ?? 0)}`);
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><ClipboardCheck size={13} /> SHIFTS · RECONCILE</div>
          <h1>Open / close &amp; payments</h1>
          <p>Manager opens the day, then closes with cash count vs expected (float + cash sales).</p>
        </div>
        <div className={`ury-shift-pill ${shift?.status === 'open' ? 'open' : 'closed'}`}>
          {shift?.status === 'open' ? <Unlock size={13} /> : <Lock size={13} />}
          {shift?.status === 'open' ? 'Shift OPEN' : 'Shift CLOSED'}
        </div>
      </div>

      <div className="ury-kpi-row">
        <div className="ury-kpi"><small>Opening float</small><strong>{money(opening)}</strong></div>
        <div className="ury-kpi"><small>Cash sales</small><strong>{money(cashSales)}</strong></div>
        <div className="ury-kpi"><small>Expected cash</small><strong>{money(expectedCash)}</strong></div>
        <div className="ury-kpi"><small>Card sales</small><strong>{money(cardSales)}</strong></div>
      </div>

      <div className="ury-stock-forms">
        <div className="ury-form-card">
          <h3>Open shift</h3>
          <label className="ury-field">
            <span>Opening float (cash)</span>
            <input disabled={!canManage || shift?.status === 'open'} value={floatAmt} onChange={(e) => setFloatAmt(e.target.value)} />
          </label>
          <button type="button" className="ury-submit" disabled={!canManage || shift?.status === 'open'} onClick={doOpen}>
            <Unlock size={14} /> Open shift
          </button>
          {shift?.status === 'open' && (
            <p className="ury-muted" style={{ marginTop: 10 }}>
              Opened {shift.openedAt} by {shift.openedBy}
            </p>
          )}
        </div>

        <div className="ury-form-card">
          <h3>Close &amp; reconcile</h3>
          <label className="ury-field">
            <span>Declared cash in drawer</span>
            <input
              disabled={!canManage || shift?.status !== 'open'}
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              placeholder={String(expectedCash)}
            />
          </label>
          <label className="ury-field">
            <span>Close note</span>
            <input disabled={!canManage || shift?.status !== 'open'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
          <p className="ury-muted">Expected cash = float {money(opening)} + cash sales {money(cashSales)}</p>
          <div className="ury-seat-actions">
            <button
              type="button"
              className="ury-submit"
              disabled={!canManage || shift?.status !== 'open'}
              onClick={() => doClose(false)}
            >
              <Lock size={14} /> Close shift
            </button>
            <button
              type="button"
              className="ury-ghost"
              disabled={!canManage || shift?.status !== 'open'}
              onClick={() => doClose(true)}
            >
              Close with expected {money(expectedCash)}
            </button>
          </div>
        </div>
      </div>

      <h2 className="ury-panel-sub">Shift history</h2>
      {history.length === 0 ? (
        <p className="ury-muted">No closed shifts yet this demo session.</p>
      ) : (
        <div className="ury-move-list">
          {history.map((h) => (
            <div key={h.id} className="ury-move" style={{ gridTemplateColumns: '1.2fr 70px 1fr 1fr 80px' }}>
              <span>{h.closedAt}</span>
              <strong>{h.status}</strong>
              <span>Cash {money(h.declaredCash ?? 0)} / exp {money(h.expectedCash ?? 0)}</span>
              <em className={(h.variance ?? 0) === 0 ? 'in' : ''}>Var {money(h.variance ?? 0)}</em>
              <small>{h.closedBy}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
