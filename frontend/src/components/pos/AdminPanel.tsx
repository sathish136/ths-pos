import { useState } from 'react';
import { Download, KeyRound, Printer, RefreshCw, Save, Settings2, Upload } from 'lucide-react';
import {
  ALL_REPORT_COLUMNS,
  type Combo,
  type KitchenSection,
  type NotifyRule,
  type NotifyTrigger,
  type NotifyWhere,
  type PosExtras,
  TRIGGER_LABEL,
  WHERE_LABEL,
} from '../../lib/extras';
import type { MenuItem } from '../../lib/order-process';
import type { SeatTable } from '../../lib/seating';
import { AdminStaffAccess } from './AdminStaffAccess';
import { AdminMenuFloor } from './AdminMenuFloor';
import { AdminTemplates } from './AdminTemplates';
import type { BackupTemplateId } from '../../lib/extras';
import type { RoleId } from '../../lib/roles';

type Props = {
  extras: PosExtras;
  onChange: (next: PosExtras) => void;
  menuIds: { id: string; name: string }[];
  roles: { id: RoleId; label: string; pin: string }[];
  viewIds: { id: string; label: string }[];
  onBackup: () => unknown;
  onRestore: (data: unknown) => void;
  flash: (msg: string) => void;
  /** Menu items (base) for availability and sales-type prices */
  menuItems: MenuItem[];
  /** Floor tables for layout, colour, seats and table numbers */
  tables: SeatTable[];
  onTablesChange: (next: SeatTable[]) => void;
  /** Recent sales for Excel sample / backup templates */
  sampleSales?: Array<Record<string, string | number | undefined>>;
};

const uid = () => Math.random().toString(36).slice(2, 9);

const BACKUP_FORMAT = 'ury-pos-backup';
const BACKUP_VERSION = 1;

/** Manager console: sections & printers, combos, notification rules, PINs, labels, export columns,
 *  read-only API token, backup download / restore, attachments (local disk). */
export function AdminPanel({ extras, onChange, menuIds, roles, viewIds, onBackup, onRestore, flash, menuItems, tables, onTablesChange, sampleSales = [] }: Props) {
  const [comboText, setComboText] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<{ name: string; size: number; url: string }[]>([]);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);

  const set = (patch: Partial<PosExtras>) => onChange({ ...extras, ...patch });

  // ---- kitchen sections
  function updateSection(id: string, patch: Partial<KitchenSection>) {
    set({ kitchenSections: extras.kitchenSections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function addSection() {
    set({ kitchenSections: [...extras.kitchenSections, { id: uid(), name: 'New section', printer: '', categories: [] }] });
  }
  function removeSection(id: string) {
    set({ kitchenSections: extras.kitchenSections.filter((s) => s.id !== id) });
  }

  // ---- combos
  function addCombo() {
    set({ combos: [...extras.combos, { id: uid(), name: 'Combo', price: 0, groups: [{ label: 'Main', options: [], min: 1, max: 1 }] }] });
  }
  function updateCombo(id: string, patch: Partial<Combo>) {
    set({ combos: extras.combos.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function applyComboGroups(c: Combo, text: string) {
    // one group per line:  Label | option-id, option-id | min | max
    const groups = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [label = 'Choice', opts = '', min = '1', max = '1'] = l.split('|').map((x) => x.trim());
        const options = opts.split(',').map((x) => x.trim()).filter(Boolean);
        const mn = Math.max(0, Number(min) || 0);
        const mx = Math.max(mn, Number(max) || mn || 1);
        return { label, options, min: mn, max: mx };
      });
    updateCombo(c.id, { groups });
    setComboText((t) => ({ ...t, [c.id]: text }));
    flash('Combo groups saved');
  }
  function removeCombo(id: string) {
    set({ combos: extras.combos.filter((c) => c.id !== id) });
  }

  // ---- notifications
  function addRule(trigger: NotifyTrigger) {
    const rule: NotifyRule = { id: `n-${uid()}`, trigger, message: 'New notification — edit the message', enabled: true, where: 'manager' };
    set({ notifications: [...extras.notifications, rule] });
  }

  function removeRule(id: string) {
    set({ notifications: extras.notifications.filter((r) => r.id !== id) });
  }

  function updateRule(id: string, patch: Partial<NotifyRule>) {
    set({ notifications: extras.notifications.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  // ---- PINs
  function setPin(role: RoleId, pin: string) {
    const clean = pin.replace(/\D/g, '').slice(0, 6);
    set({ pinOverrides: { ...extras.pinOverrides, [role]: clean || undefined } });
  }

  // ---- columns
  function toggleColumn(col: string) {
    const has = extras.reportColumns.includes(col);
    set({ reportColumns: has ? extras.reportColumns.filter((c) => c !== col) : [...extras.reportColumns, col] });
  }

  // ---- API token
  function regenToken() {
    set({ apiToken: `ury-ro-${uid()}${uid()}` });
    flash('New read-only token generated — update your external app');
  }

  // ---- backup
  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackup(template: BackupTemplateId = extras.backupTemplate) {
    const raw = onBackup() as Record<string, unknown>;
    const sales = (Array.isArray(raw.sales) ? raw.sales : sampleSales) as Array<Record<string, unknown>>;
    const day = new Date().toISOString().slice(0, 10);
    if (template === 'ury-json') {
      const payload = { format: BACKUP_FORMAT, formatVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: raw };
      downloadBlob(JSON.stringify(payload, null, 2), `ury-pos-backup-${day}.json`, 'application/json');
      flash('URY JSON backup downloaded');
      return;
    }
    if (template === 'flat-csv') {
      const cols = (extras.excelTemplate.filter((c) => c.enabled).length ? extras.excelTemplate.filter((c) => c.enabled) : extras.reportColumns.map((k) => ({ key: k, header: k, enabled: true })));
      const header = cols.map((c) => c.header || c.key);
      const lines = [header.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(',')];
      for (const sale of sales) {
        lines.push(cols.map((c) => `"${String(sale[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
      }
      downloadBlob(lines.join('\n'), `ury-pos-sales-${day}.csv`, 'text/csv');
      flash('Flat CSV backup downloaded');
      return;
    }
    if (template === 'erpnext-json') {
      const docs = sales.map((s) => ({
        doctype: 'Sales Invoice',
        naming_series: 'SINV-',
        name: `SINV-${s.ticketNumber ?? s.id}`,
        posting_date: s.at,
        customer: s.customerName || 'Walk-in Customer',
        is_pos: 1,
        grand_total: s.total,
        discount_amount: s.discount ?? 0,
        outstanding_amount: s.paymentMethod === 'Credit' ? s.total : 0,
        items: Array.isArray(s.lines) ? (s.lines as Array<{ name: string; qty: number; amount: number }>).map((l) => ({
          item_code: l.name,
          qty: l.qty,
          rate: l.qty ? Number(l.amount) / Number(l.qty) : l.amount,
          amount: l.amount,
        })) : [],
      }));
      downloadBlob(JSON.stringify({ template: 'erpnext-json', exportedAt: new Date().toISOString(), data: docs }, null, 2), `ury-erpnext-invoices-${day}.json`, 'application/json');
      flash('ERPNext-style JSON downloaded');
      return;
    }
    // custom-mapped: field names = Excel headers
    const cols = extras.excelTemplate.filter((c) => c.enabled);
    const mapped = sales.map((s) => {
      const row: Record<string, unknown> = {};
      for (const c of cols) row[c.header || c.key] = s[c.key];
      return row;
    });
    downloadBlob(JSON.stringify({ template: 'custom-mapped', exportedAt: new Date().toISOString(), columns: cols, data: mapped }, null, 2), `ury-custom-mapped-${day}.json`, 'application/json');
    flash('Custom mapped backup downloaded');
  }
  async function restoreBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; formatVersion?: number; data?: unknown };
      if (parsed.format !== BACKUP_FORMAT || parsed.formatVersion !== BACKUP_VERSION || !parsed.data) {
        flash('Not a valid URY POS backup (format v1)');
        return;
      }
      if (!window.confirm('Restore this backup? Current POS data on this device will be replaced.')) return;
      onRestore(parsed.data);
    } catch {
      flash('Could not read backup file');
    }
  }

  // ---- attachments (local disk store served by the POS dev server)
  async function loadAttachments() {
    try {
      const res = await fetch('/api/attachments', { cache: 'no-store' });
      const list = (await res.json()) as { name: string; size: number }[];
      setAttachments(list.map((f) => ({ ...f, url: `/api/attachments/${encodeURIComponent(f.name)}` })));
      setAttachmentsLoaded(true);
    } catch {
      flash('Attachments store unavailable');
    }
  }
  async function uploadAttachment(file: File) {
    const res = await fetch(`/api/attachments?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      flash('Upload failed');
      return;
    }
    flash(`Uploaded ${file.name}`);
    await loadAttachments();
  }

  const apiUrl = `${window.location.origin}/api/readonly/sales`;

  return (
    <section className="ury-panel ury-admin">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><Settings2 size={13} /> MANAGER CONSOLE</div>
          <h1>Admin settings</h1>
          <p>Staff accounts &amp; permissions, kitchen sections &amp; printers, combos, menu availability &amp; prices, floor plan, notifications, PINs, labels, exports, statements, read-only API, backup and attachments.</p>
        </div>
      </div>

      <div className="ury-admin-grid">
        <div className="ury-form-card">
          <h3>Kitchen sections &amp; printers</h3>
          {extras.kitchenSections.map((s) => (
            <div key={s.id} className="ury-form-row" style={{ marginBottom: 8 }}>
              <label className="ury-field"><span>Name</span><input value={s.name} onChange={(e) => updateSection(s.id, { name: e.target.value })} /></label>
              <label className="ury-field"><span>Printer</span><input value={s.printer} onChange={(e) => updateSection(s.id, { printer: e.target.value })} /></label>
              <label className="ury-field"><span>Categories (comma)</span><input value={s.categories.join(', ')} onChange={(e) => updateSection(s.id, { categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
              <button type="button" className="ury-ghost" onClick={() => removeSection(s.id)}>Remove</button>
            </div>
          ))}
          <button type="button" className="ury-ghost" onClick={addSection}>+ Add section</button>
        </div>

        <div className="ury-form-card">
          <h3>Combos</h3>
          <p className="ury-muted">Groups, one per line: <code>Label | option-ids | min | max</code>. Option ids: {menuIds.map((m) => m.id).join(', ')}</p>
          {extras.combos.map((c) => (
            <div key={c.id} style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <div className="ury-form-row">
                <label className="ury-field"><span>Name</span><input value={c.name} onChange={(e) => updateCombo(c.id, { name: e.target.value })} /></label>
                <label className="ury-field"><span>Price</span><input value={String(c.price)} inputMode="decimal" onChange={(e) => updateCombo(c.id, { price: Number(e.target.value) || 0 })} /></label>
              </div>
              <label className="ury-field">
                <span>Groups</span>
                <textarea
                  rows={3}
                  value={comboText[c.id] ?? c.groups.map((g) => `${g.label} | ${g.options.join(', ')} | ${g.min} | ${g.max}`).join('\n')}
                  onChange={(e) => setComboText((t) => ({ ...t, [c.id]: e.target.value }))}
                />
              </label>
              <div className="ury-action-row">
                <button type="button" className="ury-ghost" onClick={() => applyComboGroups(c, comboText[c.id] ?? c.groups.map((g) => `${g.label} | ${g.options.join(', ')} | ${g.min} | ${g.max}`).join('\n'))}><Save size={12} aria-hidden /> Save groups</button>
                <button type="button" className="ury-ghost" onClick={() => removeCombo(c.id)}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="ury-ghost" onClick={addCombo}>+ Add combo</button>
        </div>

        <div className="ury-form-card">
          <h3>Notification rules</h3>
          <p className="ury-muted">
            Each rule posts a message to the shared inbox; it appears on the screens chosen below, on every device.
            Placeholders: <code>{'{ticket} {table} {amount} {by} {customer} {reason} {value}'}</code>.
          </p>
          {extras.notifications.map((r) => (
            <div key={r.id} style={{ display: 'grid', gap: 4, marginBottom: 10, borderBottom: '1px solid #0001', paddingBottom: 8 }}>
              <label className="ury-check">
                <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} />
                <span><b>{TRIGGER_LABEL[r.trigger]}</b></span>
              </label>
              <input value={r.message} onChange={(e) => updateRule(r.id, { message: e.target.value })} />
              <div className="ury-form-row">
                <label className="ury-field"><span>Show on</span>
                  <select value={r.where ?? 'all'} onChange={(e) => updateRule(r.id, { where: e.target.value as NotifyWhere })}>
                    {(Object.keys(WHERE_LABEL) as NotifyWhere[]).map((w) => <option key={w} value={w}>{WHERE_LABEL[w]}</option>)}
                  </select>
                </label>
                {(r.trigger === 'discount_applied' || r.trigger === 'large_sale') && (
                  <label className="ury-field"><span>{r.trigger === 'discount_applied' ? 'Only if discount % ≥' : 'Only if amount ≥'}</span>
                    <input inputMode="decimal" value={String(r.threshold ?? 0)} onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) || 0 })} />
                  </label>
                )}
                <button type="button" className="ury-ghost" onClick={() => removeRule(r.id)}>Remove</button>
              </div>
            </div>
          ))}
          <div className="ury-form-row">
            <label className="ury-field"><span>New rule</span>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { addRule(e.target.value as NotifyTrigger); e.target.value = ''; } }}>
                <option value="">Choose trigger…</option>
                {(Object.keys(TRIGGER_LABEL) as NotifyTrigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="ury-form-card">
          <h3><KeyRound size={13} aria-hidden /> Accounts &amp; PINs</h3>
          <p className="ury-muted">Set a 4–6 digit PIN per role. Leave empty for the default PIN.</p>
          {roles.map((r) => (
            <label key={r.id} className="ury-field" style={{ marginBottom: 8 }}>
              <span>{r.label} (default {r.pin})</span>
              <input value={extras.pinOverrides[r.id] ?? ''} inputMode="numeric" placeholder={r.pin} onChange={(e) => setPin(r.id, e.target.value)} />
            </label>
          ))}
        </div>

        <AdminStaffAccess extras={extras} onChange={onChange} flash={flash} />
        <AdminMenuFloor extras={extras} onChange={onChange} menuItems={menuItems} tables={tables} onTablesChange={onTablesChange} flash={flash} />

        <AdminTemplates
          extras={extras}
          onChange={onChange}
          viewIds={viewIds}
          sampleSalesRows={sampleSales.map((sale) =>
            (extras.excelTemplate.filter((c) => c.enabled).length
              ? extras.excelTemplate.filter((c) => c.enabled)
              : extras.reportColumns.map((key) => ({ key, header: key, enabled: true }))
            ).map((c) => sale[c.key] ?? ''),
          )}
          onBackupDownload={(tpl) => downloadBackup(tpl)}
          flash={flash}
        />

        <div className="ury-form-card">
          <h3>Read-only API</h3>
          <p className="ury-muted">GET only. Send header <code>Authorization: Bearer &lt;token&gt;</code>. No write access.</p>
          <code style={{ display: 'block', wordBreak: 'break-all', marginBottom: 8 }}>GET {apiUrl}</code>
          <code style={{ display: 'block', wordBreak: 'break-all', marginBottom: 8 }}>Token: {extras.apiToken}</code>
          <button type="button" className="ury-ghost" onClick={regenToken}><RefreshCw size={12} aria-hidden /> New token</button>
        </div>

        <div className="ury-form-card">
          <h3>Backup restore</h3>
          <p className="ury-muted">Restore accepts URY JSON v1 (<code>{BACKUP_FORMAT}</code>). Other backup templates are export-only.</p>
          <label className="ury-ghost" style={{ cursor: 'pointer' }}>
            <Upload size={12} aria-hidden /> Restore URY JSON
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreBackup(f); e.currentTarget.value = ''; }} />
          </label>
        </div>

        <div className="ury-form-card">
          <h3>Attachments</h3>
          <p className="ury-muted">Files go to the storage provider set above (local or S3).</p>
          <label className="ury-ghost" style={{ cursor: 'pointer' }}>
            <Upload size={12} aria-hidden /> Upload file
            <input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.currentTarget.value = ''; }} />
          </label>
          <button type="button" className="ury-ghost" style={{ marginLeft: 8 }} onClick={() => void loadAttachments()}><RefreshCw size={12} aria-hidden /> {attachmentsLoaded ? 'Refresh list' : 'Load list'}</button>
          <ul style={{ marginTop: 8 }}>
            {attachments.map((a) => (
              <li key={a.name}><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> · {Math.round(a.size / 1024)} KB</li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
