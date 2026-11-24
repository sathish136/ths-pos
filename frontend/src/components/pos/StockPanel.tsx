import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Boxes, FileInput, Plus } from 'lucide-react';
import {
  type Ingredient,
  type StockByStore,
  type StockMove,
  STOCK_STORES,
  addIngredient,
  adjustStock,
  lowStock,
  receiveFromPurchaseReceipt,
  receiveStock,
  storeById,
  transferStock,
} from '../../lib/inventory';
import { erpReceiveStock, erpStockBalance, erpTransferStock } from '../../lib/erp-api';

type Props = {
  stock: Ingredient[];
  stockByStore: StockByStore;
  activeStoreId: string;
  moves: StockMove[];
  canAdjust: boolean;
  staffName: string;
  onStock: (stock: Ingredient[]) => void;
  onStockByStore: (next: StockByStore) => void;
  onActiveStore: (storeId: string) => void;
  onMove: (move: StockMove) => void;
  flash: (msg: string) => void;
};

const qtyLabel = (n: number, unit: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(n < 1 ? 3 : 2)} ${unit}`;

export function StockPanel({
  stock,
  stockByStore,
  activeStoreId,
  moves,
  canAdjust,
  staffName,
  onStock,
  onStockByStore,
  onActiveStore,
  onMove,
  flash,
}: Props) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(stock[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('Manual receive');
  const [erpBalance, setErpBalance] = useState<Array<{ item_code: string; warehouse: string; actual_qty: number }>>([]);

  useEffect(() => {
    void erpStockBalance()
      .then((rows) => setErpBalance(Array.isArray(rows) ? rows : []))
      .catch(() => setErpBalance([]));
  }, [stock, moves]);
  const [prNo, setPrNo] = useState(() => `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`);
  const [prSupplier, setPrSupplier] = useState('Fresh Farm Co.');
  const [prStoreId, setPrStoreId] = useState(activeStoreId);
  const [prQty, setPrQty] = useState('1');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [newQty, setNewQty] = useState('1');
  const [newReorder, setNewReorder] = useState('0.5');
  const [xferFrom, setXferFrom] = useState('store1');
  const [xferTo, setXferTo] = useState('store2');
  const [xferQty, setXferQty] = useState('1');
  const [xferNote, setXferNote] = useState('');

  const lows = useMemo(() => lowStock(stock), [stock]);
  const visible = stock.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const current = stock.find((s) => s.id === selected) ?? stock[0];
  const activeStore = storeById(activeStoreId);

  function patchActiveStore(nextStock: Ingredient[]) {
    onStock(nextStock);
    onStockByStore({ ...stockByStore, [activeStoreId]: nextStock });
  }

  function doReceive() {
    if (!canAdjust || !current) return;
    const n = Number(qty);
    if (!n || n <= 0) { flash('Enter qty to add'); return; }
    const { stock: next, move } = receiveStock(stock, current.id, n, { by: staffName, note });
    patchActiveStore(next);
    if (move) onMove(move);
    void erpReceiveStock(current.id, n).catch((err) => console.warn('ERP receive_stock', err));
    flash(`+${qtyLabel(n, current.unit)} ${current.name} → ${activeStore.name}`);
    setQty('1');
  }

  function doPurchaseReceipt() {
    if (!canAdjust || !current) return;
    const n = Number(prQty);
    const result = receiveFromPurchaseReceipt(
      stockByStore,
      prStoreId,
      [{ ingredientId: current.id, qty: n }],
      { by: staffName, receiptNo: prNo, supplier: prSupplier.trim() || undefined },
    );
    if (!result.ok) {
      flash(result.reason ?? 'Purchase Receipt failed');
      return;
    }
    onStockByStore(result.stockByStore);
    onStock(result.stockByStore[activeStoreId] ?? stock);
    if (prStoreId !== activeStoreId) {
      onActiveStore(prStoreId);
      onStock(result.stockByStore[prStoreId] ?? stock);
    }
    for (const m of result.moves) onMove(m);
    flash(
      `Purchase Receipt ${prNo.trim()} · +${qtyLabel(n, current.unit)} ${current.name} → ${storeById(prStoreId).name}`,
    );
    setPrQty('1');
    // bump demo PR number for next post
    const m = prNo.match(/^(.*?)(\d+)$/);
    if (m) setPrNo(`${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`);
  }

  function doWriteOff() {
    if (!canAdjust || !current) return;
    const n = Number(qty);
    if (!n || n <= 0) { flash('Enter qty'); return; }
    const { stock: next, move } = adjustStock(stock, current.id, -n, { by: staffName, note: note || 'Write-off' });
    patchActiveStore(next);
    if (move) onMove(move);
    flash(`−${qtyLabel(n, current.unit)} ${current.name} @ ${activeStore.name}`);
  }

  function doAddItem() {
    if (!canAdjust) return;
    if (!newName.trim()) { flash('Ingredient name required'); return; }
    const onHand = Number(newQty) || 0;
    const reorderAt = Number(newReorder) || 0;
    const next = addIngredient(stock, { name: newName.trim(), unit: newUnit, onHand, reorderAt });
    patchActiveStore(next);
    flash(`Added ${newName.trim()} to ${activeStore.name}`);
    setNewName('');
    setNewQty('1');
  }

  function doTransfer() {
    if (!canAdjust) return;
    if (!current) { flash('Pick an ingredient'); return; }
    const n = Number(xferQty);
    const result = transferStock(stockByStore, xferFrom, xferTo, current.id, n, {
      by: staffName,
      note: xferNote || undefined,
    });
    if (!result.ok) {
      flash(result.reason ?? 'Transfer failed');
      return;
    }
    onStockByStore(result.stockByStore);
    // Keep viewing the same store list after transfer
    onStock(result.stockByStore[activeStoreId] ?? stock);
    for (const m of result.moves) onMove(m);
    void erpTransferStock(current.id, n, xferFrom, xferTo).catch((err) =>
      console.warn('ERP transfer_stock', err),
    );
    flash(
      `Transferred ${qtyLabel(n, current.unit)} ${current.name}: ${storeById(xferFrom).name} → ${storeById(xferTo).name}`,
    );
    setXferQty('1');
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><Boxes size={13} /> INVENTORY</div>
          <h1>Stock · stores &amp; transfer</h1>
          <p>Receive, write-off, and transfer stock between Store 1 and Store 2. Kitchen deducts from the active store.</p>
          {erpBalance.length > 0 ? (
            <p className="ury-muted">ERP bins: {erpBalance.length} lines with stock</p>
          ) : null}
        </div>
        {lows.length > 0 && <div className="ury-low-pill">{lows.length} low</div>}
      </div>

      <label className="ury-field" style={{ maxWidth: 280, marginBottom: 14 }}>
        <span>Viewing store</span>
        <select value={activeStoreId} onChange={(e) => onActiveStore(e.target.value)}>
          {STOCK_STORES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
              {' — '}
              {stockByStore[s.id]?.length ?? 0} items
            </option>
          ))}
        </select>
      </label>

      {canAdjust && (
        <div className="ury-stock-forms">
          <div className="ury-form-card">
            <h3><FileInput size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Purchase Receipt → store</h3>
            <p className="ury-muted" style={{ marginTop: 0 }}>Post supplier receipt into Store 1 or Store 2 (same idea as ERP Purchase Receipt).</p>
            <label className="ury-field">
              <span>Purchase Receipt No.</span>
              <input value={prNo} onChange={(e) => setPrNo(e.target.value)} placeholder="PR-20261028-001" />
            </label>
            <label className="ury-field">
              <span>Supplier</span>
              <input value={prSupplier} onChange={(e) => setPrSupplier(e.target.value)} placeholder="Vendor name" />
            </label>
            <label className="ury-field">
              <span>Receive into store</span>
              <select value={prStoreId} onChange={(e) => setPrStoreId(e.target.value)}>
                {STOCK_STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="ury-field">
              <span>Item</span>
              <select value={current?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
                {stock.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="ury-field">
              <span>Qty accepted</span>
              <input value={prQty} onChange={(e) => setPrQty(e.target.value)} inputMode="decimal" />
            </label>
            <button type="button" className="ury-submit" onClick={doPurchaseReceipt}>
              <FileInput size={14} /> Post Purchase Receipt
            </button>
          </div>

          <div className="ury-form-card">
            <h3>Manual receive / write-off · {activeStore.name}</h3>
            <label className="ury-field">
              <span>Ingredient</span>
              <select value={current?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
                {stock.map((s) => <option key={s.id} value={s.id}>{s.name} ({qtyLabel(s.onHand, s.unit)})</option>)}
              </select>
            </label>
            <label className="ury-field">
              <span>Qty</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
            </label>
            <label className="ury-field">
              <span>Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adjustment note" />
            </label>
            <div className="ury-seat-actions">
              <button type="button" className="ury-submit" onClick={doReceive}><Plus size={14} /> Receive in</button>
              <button type="button" className="ury-ghost" onClick={doWriteOff}>Write-off</button>
            </div>
          </div>

          <div className="ury-form-card">
            <h3><ArrowRightLeft size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Transfer store → store</h3>
            <label className="ury-field">
              <span>Ingredient</span>
              <select value={current?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
                {stock.map((s) => {
                  const s1 = stockByStore.store1?.find((x) => x.id === s.id)?.onHand ?? 0;
                  const s2 = stockByStore.store2?.find((x) => x.id === s.id)?.onHand ?? 0;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} · S1 {qtyLabel(s1, s.unit)} · S2 {qtyLabel(s2, s.unit)}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="ury-form-row">
              <label className="ury-field">
                <span>From</span>
                <select value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
                  {STOCK_STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="ury-field">
                <span>To</span>
                <select value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                  {STOCK_STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <label className="ury-field">
              <span>Qty to transfer</span>
              <input value={xferQty} onChange={(e) => setXferQty(e.target.value)} inputMode="decimal" />
            </label>
            <label className="ury-field">
              <span>Note (optional)</span>
              <input value={xferNote} onChange={(e) => setXferNote(e.target.value)} placeholder="Van / request #" />
            </label>
            <button type="button" className="ury-submit" onClick={doTransfer}>
              <ArrowRightLeft size={14} /> Transfer stock
            </button>
          </div>

          <div className="ury-form-card">
            <h3>New ingredient · {activeStore.name}</h3>
            <label className="ury-field"><span>Name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Extra virgin oil" /></label>
            <label className="ury-field">
              <span>Unit</span>
              <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                {['kg', 'L', 'pc', 'g', 'ml'].map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <div className="ury-form-row">
              <label className="ury-field"><span>Opening qty</span><input value={newQty} onChange={(e) => setNewQty(e.target.value)} /></label>
              <label className="ury-field"><span>Reorder at</span><input value={newReorder} onChange={(e) => setNewReorder(e.target.value)} /></label>
            </div>
            <button type="button" className="ury-submit" onClick={doAddItem}>Create ingredient</button>
          </div>
        </div>
      )}

      {!canAdjust && <p className="ury-muted">Manager can receive / transfer / adjust stock. You have view access.</p>}

      <label className="ury-field" style={{ maxWidth: 320, marginTop: 18 }}>
        <span>Search stock · {activeStore.name}</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter ingredients…" />
      </label>

      <div className="ury-stock-grid" style={{ marginTop: 14 }}>
        {visible.map((ing) => {
          const low = ing.onHand <= ing.reorderAt;
          const otherId = activeStoreId === 'store1' ? 'store2' : 'store1';
          const otherQty = stockByStore[otherId]?.find((x) => x.id === ing.id)?.onHand ?? 0;
          return (
            <button
              key={ing.id}
              type="button"
              className={`ury-stock-card ${low ? 'low' : ''} ${selected === ing.id ? 'picked' : ''}`}
              onClick={() => setSelected(ing.id)}
            >
              <strong>{ing.name}</strong>
              <b>{qtyLabel(ing.onHand, ing.unit)}</b>
              <small>
                {activeStore.code} here · {storeById(otherId).code} {qtyLabel(otherQty, ing.unit)}
              </small>
            </button>
          );
        })}
      </div>

      <h2 className="ury-panel-sub">Stock movements</h2>
      {moves.length === 0 ? (
        <p className="ury-muted">No movements yet.</p>
      ) : (
        <div className="ury-move-list">
          {moves.slice(0, 40).map((m) => {
            const inbound = m.qty < 0;
            return (
              <div key={m.id} className="ury-move">
                <span>{m.at}</span>
                <strong>#{m.ticketNumber}</strong>
                <span>{m.dishName}</span>
                <em className={inbound ? 'in' : ''}>{inbound ? '+' : '−'}{qtyLabel(Math.abs(m.qty), m.unit)} {m.ingredientName}</em>
                <small>{m.by}</small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
