import { Plus, Trash2 } from 'lucide-react';
import type { MenuItem } from '../../lib/order-process';
import { type SalesTypeKey, SALES_TYPE_KEYS, type PosExtras, type MenuOverride } from '../../lib/extras';
import type { SeatTable, SeatZone, TableShape } from '../../lib/seating';
import { erpSaveMenuItem, erpSetItemAvailable } from '../../lib/erp-api';

type Props = {
  extras: PosExtras;
  onChange: (next: PosExtras) => void;
  menuItems: MenuItem[];
  tables: SeatTable[];
  onTablesChange: (next: SeatTable[]) => void;
  flash: (msg: string) => void;
};

const ZONES: SeatZone[] = ['Main', 'Window', 'Patio', 'Bar'];
const SHAPES: TableShape[] = ['round', 'square', 'rect', 'bar'];
const uid = () => Math.random().toString(36).slice(2, 7);

/** Menu availability + prices per sales type, floor plan (tables, colours, background), statement template. */
export function AdminMenuFloor({ extras, onChange, menuItems, tables, onTablesChange, flash }: Props) {
  function persistItem(item: MenuItem, override: MenuOverride) {
    const prices = {
      'Dine in': override.prices?.['Dine in'] ?? item.prices?.['Dine in'] ?? item.price,
      Takeaway: override.prices?.Takeaway ?? item.prices?.Takeaway ?? item.price,
      Delivery: override.prices?.Delivery ?? item.prices?.Delivery ?? item.price,
    };
    void erpSaveMenuItem({
      code: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      prices,
    }).catch((err) => console.warn('ERP save_menu_item', err));
    if (override.available !== undefined) {
      void erpSetItemAvailable(item.id, override.available ? 1 : 0).catch((err) =>
        console.warn('ERP set_item_available', err),
      );
    }
  }

  function setOverride(id: string, patch: MenuOverride, item?: MenuItem) {
    const cur = extras.menuOverrides[id] ?? {};
    const next = { ...cur, ...patch };
    onChange({ ...extras, menuOverrides: { ...extras.menuOverrides, [id]: next } });
    if (item) persistItem(item, next);
  }

  function setPrice(item: MenuItem, type: SalesTypeKey, raw: string) {
    const cur = extras.menuOverrides[item.id] ?? {};
    const prices = { ...(cur.prices ?? {}) };
    const n = Number(raw);
    if (raw.trim() === '') delete prices[type];
    else if (Number.isFinite(n) && n >= 0) prices[type] = n;
    setOverride(item.id, { prices }, item);
  }

  function updateTable(id: string, patch: Partial<SeatTable>) {
    onTablesChange(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTable() {
    const n = tables.length + 1;
    onTablesChange([...tables, { id: `t-${uid()}`, name: `Table ${String(n).padStart(2, '0')}`, zone: 'Main', seats: 4, shape: 'square', status: 'free', x: 50, y: 50 }]);
    flash('Table added — set its position and seats');
  }

  function removeTable(t: SeatTable) {
    if (t.status !== 'free') return flash('Only free tables can be removed');
    onTablesChange(tables.filter((x) => x.id !== t.id));
  }

  return (
    <>
      <div className="ury-form-card" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
        <h3>Menu: availability &amp; prices by sales type</h3>
        <p className="ury-muted">
          Untick <b>Available</b> to hide a dish on every cashier and captain screen. Empty price = the menu default.
          Prices here are what each sales type charges.
        </p>
        <table className="ury-report-table">
          <thead>
            <tr>
              <th>Dish</th><th>Category</th><th>Available</th>
              {SALES_TYPE_KEYS.map((k) => <th key={k}>{k} price</th>)}
            </tr>
          </thead>
          <tbody>
            {menuItems.map((item) => {
              const o = extras.menuOverrides[item.id];
              const available = o?.available ?? item.available;
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={available} onChange={(e) => setOverride(item.id, { available: e.target.checked }, item)} aria-label={`${item.name} available`} />
                  </td>
                  {SALES_TYPE_KEYS.map((k) => (
                    <td key={k}>
                      <input
                        style={{ width: 90 }}
                        inputMode="decimal"
                        placeholder={String(item.prices?.[k] ?? item.price)}
                        value={o?.prices?.[k] ?? ''}
                        onChange={(e) => setPrice(item, k, e.target.value)}
                        aria-label={`${item.name} ${k} price`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ury-form-card" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
        <h3>Floor plan: tables, positions &amp; colours</h3>
        <p className="ury-muted">
          Position is a percentage of the floor (0 = left/top, 100 = right/bottom). Name can change only while the table is free,
          so open tickets stay linked. Background colour applies to the floor on every device.
        </p>
        <label className="ury-field" style={{ maxWidth: 260 }}>
          <span>Floor background</span>
          <input type="color" value={extras.floorBackground} onChange={(e) => onChange({ ...extras, floorBackground: e.target.value })} />
        </label>
        <table className="ury-report-table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Name</th><th>Zone</th><th>Seats</th><th>Shape</th><th>X %</th><th>Y %</th><th>Colour</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td>
                  <input value={t.name} disabled={t.status !== 'free'} onChange={(e) => updateTable(t.id, { name: e.target.value })} aria-label={`Name ${t.name}`} />
                </td>
                <td>
                  <select value={t.zone} onChange={(e) => updateTable(t.id, { zone: e.target.value as SeatZone })}>
                    {ZONES.map((z) => <option key={z}>{z}</option>)}
                  </select>
                </td>
                <td><input style={{ width: 60 }} inputMode="numeric" value={t.seats} onChange={(e) => updateTable(t.id, { seats: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></td>
                <td>
                  <select value={t.shape} onChange={(e) => updateTable(t.id, { shape: e.target.value as TableShape })}>
                    {SHAPES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td><input style={{ width: 60 }} inputMode="numeric" value={t.x} onChange={(e) => updateTable(t.id, { x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></td>
                <td><input style={{ width: 60 }} inputMode="numeric" value={t.y} onChange={(e) => updateTable(t.id, { y: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></td>
                <td>
                  <input type="color" value={extras.tableColors[t.id] ?? '#d9c9a8'} onChange={(e) => onChange({ ...extras, tableColors: { ...extras.tableColors, [t.id]: e.target.value } })} aria-label={`${t.name} colour`} />
                </td>
                <td>{t.status}</td>
                <td>
                  <button type="button" className="ury-ghost" onClick={() => removeTable(t)} aria-label={`Remove ${t.name}`}><Trash2 size={12} aria-hidden /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ury-ghost" style={{ marginTop: 8 }} onClick={addTable}><Plus size={12} aria-hidden /> Add table</button>
      </div>

      <div className="ury-form-card">
        <h3>Statement template</h3>
        <p className="ury-muted">Printed on customer account statements (Reports › Statements).</p>
        <label className="ury-field"><span>Company name</span><input value={extras.statementTemplate.company} onChange={(e) => onChange({ ...extras, statementTemplate: { ...extras.statementTemplate, company: e.target.value } })} /></label>
        <label className="ury-field"><span>Address</span><input value={extras.statementTemplate.address} onChange={(e) => onChange({ ...extras, statementTemplate: { ...extras.statementTemplate, address: e.target.value } })} /></label>
        <label className="ury-field"><span>Heading</span><input value={extras.statementTemplate.header} onChange={(e) => onChange({ ...extras, statementTemplate: { ...extras.statementTemplate, header: e.target.value } })} /></label>
        <label className="ury-field"><span>Footer note</span><input value={extras.statementTemplate.footer} onChange={(e) => onChange({ ...extras, statementTemplate: { ...extras.statementTemplate, footer: e.target.value } })} /></label>
      </div>
    </>
  );
}
