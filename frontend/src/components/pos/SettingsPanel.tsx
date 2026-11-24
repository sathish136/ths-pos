import { Settings } from 'lucide-react';

export type PosSettings = {
  restaurantName: string;
  serviceName: string;
  taxRatePct: number;
  currency: string;
  tipPrompt: boolean;
  kitchenAutoProgress: boolean;
  kitchenSlaMinutes: number;
  stockDeductOn: 'send_kitchen' | 'payment';
  receiptFooter: string;
};

type Props = {
  settings: PosSettings;
  canEdit: boolean;
  onChange: (s: PosSettings) => void;
  flash: (msg: string) => void;
  onResetDay?: () => void;
};

export const DEFAULT_SETTINGS: PosSettings = {
  restaurantName: 'URY Neighborhood Bistro',
  serviceName: 'Dinner service',
  taxRatePct: 8.25,
  currency: 'USD',
  tipPrompt: true,
  kitchenAutoProgress: false,
  kitchenSlaMinutes: 15,
  stockDeductOn: 'send_kitchen',
  receiptFooter: 'Good food, good company. Demo receipt only.',
};

export function SettingsPanel({ settings, canEdit, onChange, flash, onResetDay }: Props) {
  function set<K extends keyof PosSettings>(key: K, value: PosSettings[K]) {
    if (!canEdit) { flash('Manager only — settings'); return; }
    onChange({ ...settings, [key]: value });
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><Settings size={13} /> SETTINGS</div>
          <h1>Restaurant options</h1>
          <p>House name, tax, stock deduct timing, receipt footer. Manager editable.</p>
        </div>
      </div>

      <div className="ury-settings-grid">
        <label className="ury-field">
          <span>Restaurant name</span>
          <input disabled={!canEdit} value={settings.restaurantName} onChange={(e) => set('restaurantName', e.target.value)} />
        </label>
        <label className="ury-field">
          <span>Service label</span>
          <input disabled={!canEdit} value={settings.serviceName} onChange={(e) => set('serviceName', e.target.value)} />
        </label>
        <label className="ury-field">
          <span>Tax % </span>
          <input disabled={!canEdit} type="number" step="0.01" value={settings.taxRatePct} onChange={(e) => set('taxRatePct', Number(e.target.value) || 0)} />
        </label>
        <label className="ury-field">
          <span>Currency</span>
          <select disabled={!canEdit} value={settings.currency} onChange={(e) => set('currency', e.target.value)}>
            {['USD', 'INR', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="ury-field">
          <span>Stock deduct when</span>
          <select disabled={!canEdit} value={settings.stockDeductOn} onChange={(e) => set('stockDeductOn', e.target.value as PosSettings['stockDeductOn'])}>
            <option value="send_kitchen">Send to kitchen</option>
            <option value="payment">Payment (demo alt)</option>
          </select>
        </label>
        <label className="ury-check">
          <input disabled={!canEdit} type="checkbox" checked={settings.tipPrompt} onChange={(e) => set('tipPrompt', e.target.checked)} />
          <span>Show tip prompt on receipt</span>
        </label>
        <label className="ury-check">
          <input disabled={!canEdit} type="checkbox" checked={settings.kitchenAutoProgress} onChange={(e) => set('kitchenAutoProgress', e.target.checked)} />
          <span>Auto kitchen progress (demo)</span>
        </label>
        <label className="ury-field">
          <span>Kitchen SLA (minutes)</span>
          <input
            disabled={!canEdit}
            type="number"
            min={5}
            max={60}
            value={settings.kitchenSlaMinutes}
            onChange={(e) => set('kitchenSlaMinutes', Math.max(5, Math.min(60, Number(e.target.value) || 15)))}
          />
        </label>
        <label className="ury-field" style={{ gridColumn: '1 / -1' }}>
          <span>Receipt footer</span>
          <textarea disabled={!canEdit} rows={3} value={settings.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {canEdit ? (
          <button type="button" className="ury-submit" style={{ width: 'auto', padding: '0 18px' }} onClick={() => flash('Settings saved for this demo session')}>
            Save settings
          </button>
        ) : (
          <p className="ury-muted">View only — switch to Manager to edit.</p>
        )}
        {canEdit && onResetDay && (
          <button
            type="button"
            className="ury-ghost"
            style={{ width: 'auto', padding: '0 18px' }}
            onClick={() => {
              if (window.confirm('Reset demo day? Clears orders, kitchen queue, sales, and closes the shift.')) {
                onResetDay();
              }
            }}
          >
            Reset demo day
          </button>
        )}
      </div>

      <p className="ury-muted" style={{ marginTop: 12 }}>
        <a href={`${import.meta.env.BASE_URL}docs/URY-POS-User-Guide.pdf`} target="_blank" rel="noreferrer" style={{ color: '#8c6845', fontWeight: 700 }}>
          Download user guide (PDF v2.1)
        </a>
      </p>

      <div className="ury-settings-help">
        <h2 className="ury-panel-sub">Demo feature map</h2>
        <ul>
          <li><strong>Captain 1111</strong> — take order, seat, send kitchen, serve</li>
          <li><strong>Cashier 2222</strong> — collect payment, print receipt</li>
          <li><strong>Kitchen 4444</strong> — KDS board, prep/ready, print chit (how kitchen sees orders)</li>
          <li><strong>Manager 3333</strong> — open/close shift, reconcile, accounts, reports, recipes, features list</li>
          <li><strong>Layout</strong> — same URY shell; Features tab = client customize checklist</li>
        </ul>
      </div>
    </section>
  );
}
