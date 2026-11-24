import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Package } from 'lucide-react';
import { type Ingredient, type StockMove, lowStock } from '../../lib/inventory';
import { erpStockLedger } from '../../lib/erp-api';

type Props = {
  stock: Ingredient[];
  moves: StockMove[];
  highlightIds?: string[];
};

const qtyLabel = (n: number, unit: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(n < 1 ? 3 : 2)} ${unit}`;

function isInbound(m: StockMove) {
  return m.qty < 0;
}

export function LedgerPanel({ stock, moves, highlightIds = [] }: Props) {
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [erpLines, setErpLines] = useState<
    Array<{ item_code: string; warehouse: string; actual_qty: number; posting_date: string; voucher_no: string }>
  >([]);
  const lows = useMemo(() => lowStock(stock), [stock]);
  const deductCount = moves.filter((m) => !isInbound(m) && m.ticketNumber !== 'ADJ' && m.ticketNumber !== 'RECV').length;

  useEffect(() => {
    void erpStockLedger()
      .then((rows) => setErpLines((rows as typeof erpLines) || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!highlightIds.length) return;
    setPulse(new Set(highlightIds));
    const t = window.setTimeout(() => setPulse(new Set()), 4500);
    return () => window.clearTimeout(t);
  }, [highlightIds.join('|')]);

  return (
    <section className="ury-panel ury-ledger">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><BookOpen size={13} /> STOCK LEDGER</div>
          <h1>Live inventory log</h1>
          <p>
            ERP Stock Ledger Entry + local recipe pulls. Balances update when stock moves or kitchen deducts.
          </p>
        </div>
        <div className="ury-seat-kpis">
          <span><b>{moves.length}</b> local</span>
          <span><b>{erpLines.length}</b> ERP</span>
          <span><b>{lows.length}</b> low</span>
        </div>
      </div>
      {erpLines.length > 0 && (
        <div className="ury-ledger-feed" style={{ marginBottom: 16 }}>
          <h2 className="ury-panel-sub" style={{ marginTop: 0 }}>ERP stock ledger</h2>
          <div className="ury-ledger-table" role="table">
            <div className="ury-ledger-row head" role="row">
              <span>Date</span><span>Item</span><span>Warehouse</span><span>Qty</span><span>Voucher</span>
            </div>
            {erpLines.slice(0, 40).map((r, i) => (
              <div key={`${r.voucher_no}-${i}`} className="ury-ledger-row" role="row">
                <span>{r.posting_date}</span>
                <span>{r.item_code}</span>
                <span>{r.warehouse}</span>
                <span>{r.actual_qty}</span>
                <span>{r.voucher_no}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ury-ledger-layout">
        <div className="ury-ledger-feed">
          <h2 className="ury-panel-sub" style={{ marginTop: 0 }}>Movement feed</h2>
          {!moves.length ? (
            <div className="ury-kitchen-empty">
              <Package size={28} />
              <p>Ledger is empty</p>
              <small>Floor → add dishes → Send to kitchen. Recipe BOM lines appear here instantly.</small>
            </div>
          ) : (
            <div className="ury-ledger-table" role="table">
              <div className="ury-ledger-row head" role="row">
                <span>Time</span>
                <span>Ref</span>
                <span>Source</span>
                <span>Ingredient</span>
                <span>Qty</span>
                <span>By</span>
              </div>
              {moves.map((m) => {
                const inbound = isInbound(m);
                const hot = pulse.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`ury-ledger-row ${inbound ? 'in' : 'out'} ${hot ? 'hot' : ''}`}
                    role="row"
                  >
                    <span>{m.at}</span>
                    <strong>#{m.ticketNumber}</strong>
                    <span>{m.dishQty > 1 ? `${m.dishQty}× ` : ''}{m.dishName}</span>
                    <span>{m.ingredientName}</span>
                    <em className={inbound ? 'in' : 'out'}>
                      {inbound ? '+' : '−'}{qtyLabel(Math.abs(m.qty), m.unit)}
                    </em>
                    <small>{m.by}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="ury-ledger-balances">
          <h2 className="ury-panel-sub" style={{ marginTop: 0 }}>On-hand balances</h2>
          <div className="ury-ledger-bal-list">
            {stock.map((s) => {
              const low = s.onHand <= s.reorderAt;
              return (
                <div key={s.id} className={`ury-ledger-bal ${low ? 'low' : ''}`}>
                  <strong>{s.name}</strong>
                  <b>{qtyLabel(s.onHand, s.unit)}</b>
                  {low ? <small>Below reorder</small> : <small>Reorder ≤ {qtyLabel(s.reorderAt, s.unit)}</small>}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
