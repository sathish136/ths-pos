import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Plus, Save } from 'lucide-react';
import {
  BACKUP_TEMPLATE_OPTIONS,
  DEFAULT_DISPLAY_TEMPLATES,
  defaultExcelTemplate,
  type BackupTemplateId,
  type DisplayTemplate,
  type DisplayTemplateKind,
  type ExcelColumn,
  type NavButtonConfig,
  type PosExtras,
  type StorageProviderChoice,
} from '../../lib/extras';
import { downloadExcelFile } from '../../lib/excel-export';

type Props = {
  extras: PosExtras;
  onChange: (next: PosExtras) => void;
  viewIds: { id: string; label: string }[];
  /** Sample sales rows for Excel preview download */
  sampleSalesRows?: (string | number)[][];
  onBackupDownload: (template: BackupTemplateId) => void;
  flash: (msg: string) => void;
};

const KIND_LABEL: Record<DisplayTemplateKind, string> = {
  receipt: 'Guest receipt',
  tax_invoice: 'Tax invoice',
  kitchen_chit: 'Kitchen chit',
  statement: 'Statement',
  custom: 'Custom',
};

type StorageStatus = {
  provider: StorageProviderChoice;
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  configured?: boolean;
};

/** Excel template, nav buttons, display templates, backup formats, storage provider. */
export function AdminTemplates({ extras, onChange, viewIds, sampleSalesRows, onBackupDownload, flash }: Props) {
  const set = (patch: Partial<PosExtras>) => onChange({ ...extras, ...patch });
  const [storage, setStorage] = useState<StorageStatus>({ provider: extras.storageProvider });
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [savingStorage, setSavingStorage] = useState(false);

  const excel = extras.excelTemplate.length ? extras.excelTemplate : defaultExcelTemplate();
  const nav = extras.navButtons.length
    ? extras.navButtons
    : viewIds.map((v) => ({ id: v.id, label: extras.labels[v.id] ?? '', visible: true }));

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/attachments/storage', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StorageStatus;
        setStorage(data);
        if (data.provider) set({ storageProvider: data.provider });
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setExcel(next: ExcelColumn[]) {
    set({ excelTemplate: next, reportColumns: next.filter((c) => c.enabled).map((c) => c.key) });
  }

  function moveNav(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= nav.length) return;
    const copy = [...nav];
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
    set({ navButtons: copy });
  }

  function updateNav(id: string, patch: Partial<NavButtonConfig>) {
    set({
      navButtons: nav.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      labels: patch.label !== undefined ? { ...extras.labels, [id]: patch.label } : extras.labels,
    });
  }

  function updateTpl(id: string, patch: Partial<DisplayTemplate>) {
    set({ displayTemplates: extras.displayTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  function addTpl() {
    const t: DisplayTemplate = {
      id: `tpl-${Date.now().toString(36)}`,
      name: 'New template',
      kind: 'custom',
      body: '{restaurant}\n{ticket}\n{items}\n{total}',
    };
    set({ displayTemplates: [...extras.displayTemplates, t] });
  }

  function resetDisplayTemplates() {
    set({ displayTemplates: DEFAULT_DISPLAY_TEMPLATES.map((t) => ({ ...t })) });
    flash('Display templates reset');
  }

  function previewExcel() {
    const cols = excel.filter((c) => c.enabled);
    if (!cols.length) {
      flash('Enable at least one Excel column');
      return;
    }
    const headers = cols.map((c) => c.header || c.key);
    const rows = sampleSalesRows?.length
      ? sampleSalesRows
      : [cols.map((c) => c.key), cols.map(() => 'sample')];
    downloadExcelFile(`ury-sales-template-${Date.now()}.xls`, 'Sales', headers, rows.slice(0, 50));
    flash('Excel file downloaded — open in Excel or LibreOffice');
  }

  async function saveStorage() {
    setSavingStorage(true);
    try {
      const body: Record<string, string> = {
        provider: storage.provider,
        endpoint: storage.endpoint ?? '',
        region: storage.region ?? 'us-east-1',
        bucket: storage.bucket ?? '',
        prefix: storage.prefix ?? 'ury-pos/attachments/',
      };
      if (accessKey) body.accessKeyId = accessKey;
      if (secretKey) body.secretAccessKey = secretKey;
      const res = await fetch('/api/attachments/storage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as StorageStatus & { error?: string };
      if (!res.ok) {
        flash(data.error || 'Could not save storage settings');
        return;
      }
      setStorage(data);
      set({ storageProvider: data.provider });
      setAccessKey('');
      setSecretKey('');
      flash(data.provider === 's3' ? 'S3 storage saved on the POS server' : 'Local disk storage selected');
    } catch {
      flash('Could not reach storage API');
    } finally {
      setSavingStorage(false);
    }
  }

  return (
    <>
      <div className="ury-form-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Excel export template</h3>
        <p className="ury-muted">
          Choose columns, rename headers, and download an Excel (.xls) file. Reports › CSV / Excel uses this template.
        </p>
        <table className="ury-report-table">
          <thead>
            <tr><th>Include</th><th>Field</th><th>Excel header</th><th /></tr>
          </thead>
          <tbody>
            {excel.map((col, i) => (
              <tr key={col.key}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={(e) => setExcel(excel.map((c, j) => (j === i ? { ...c, enabled: e.target.checked } : c)))}
                  />
                </td>
                <td><code>{col.key}</code></td>
                <td>
                  <input
                    value={col.header}
                    onChange={(e) => setExcel(excel.map((c, j) => (j === i ? { ...c, header: e.target.value } : c)))}
                  />
                </td>
                <td>
                  <button type="button" className="ury-ghost" disabled={i === 0} onClick={() => {
                    const copy = [...excel];
                    [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                    setExcel(copy);
                  }}><ArrowUp size={12} aria-hidden /></button>
                  <button type="button" className="ury-ghost" disabled={i === excel.length - 1} onClick={() => {
                    const copy = [...excel];
                    [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
                    setExcel(copy);
                  }}><ArrowDown size={12} aria-hidden /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ury-action-row" style={{ marginTop: 8 }}>
          <button type="button" className="ury-ghost" onClick={() => setExcel(defaultExcelTemplate())}>Reset columns</button>
          <button type="button" className="ury-submit" onClick={previewExcel}><Download size={12} aria-hidden /> Download Excel sample</button>
        </div>
      </div>

      <div className="ury-form-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Buttons &amp; tabs (name, order, show/hide)</h3>
        <p className="ury-muted">Rename navigation tabs, change their order, or hide a tab from the main screen.</p>
        <table className="ury-report-table">
          <thead>
            <tr><th>Show</th><th>Default</th><th>Custom name</th><th>Order</th></tr>
          </thead>
          <tbody>
            {nav.map((b, i) => {
              const fallback = viewIds.find((v) => v.id === b.id)?.label ?? b.id;
              return (
                <tr key={b.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={b.visible} onChange={(e) => updateNav(b.id, { visible: e.target.checked })} />
                  </td>
                  <td>{fallback}</td>
                  <td>
                    <input value={b.label} placeholder={fallback} onChange={(e) => updateNav(b.id, { label: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="ury-ghost" disabled={i === 0} onClick={() => moveNav(i, -1)}><ArrowUp size={12} aria-hidden /></button>
                    <button type="button" className="ury-ghost" disabled={i === nav.length - 1} onClick={() => moveNav(i, 1)}><ArrowDown size={12} aria-hidden /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ury-form-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Display templates</h3>
        <p className="ury-muted">
          Your own layouts for receipts, tax invoices, kitchen chits and statements.
          Placeholders: <code>{'{restaurant} {ticket} {table} {total} {items} {customer} {date} {by}'}</code>
        </p>
        {extras.displayTemplates.map((t) => (
          <div key={t.id} style={{ display: 'grid', gap: 6, marginBottom: 12, borderBottom: '1px solid #0001', paddingBottom: 10 }}>
            <div className="ury-form-row">
              <label className="ury-field"><span>Name</span>
                <input value={t.name} onChange={(e) => updateTpl(t.id, { name: e.target.value })} />
              </label>
              <label className="ury-field"><span>Kind</span>
                <select value={t.kind} onChange={(e) => updateTpl(t.id, { kind: e.target.value as DisplayTemplateKind })}>
                  {(Object.keys(KIND_LABEL) as DisplayTemplateKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="ury-ghost" onClick={() => set({ displayTemplates: extras.displayTemplates.filter((x) => x.id !== t.id) })}>Remove</button>
            </div>
            <label className="ury-field">
              <span>Template body</span>
              <textarea rows={5} value={t.body} onChange={(e) => updateTpl(t.id, { body: e.target.value })} />
            </label>
          </div>
        ))}
        <div className="ury-action-row">
          <button type="button" className="ury-ghost" onClick={addTpl}><Plus size={12} aria-hidden /> Add template</button>
          <button type="button" className="ury-ghost" onClick={resetDisplayTemplates}>Reset defaults</button>
        </div>
      </div>

      <div className="ury-form-card">
        <h3>Backup templates</h3>
        <p className="ury-muted">Pick a format so another system can read the export. Restore still accepts URY JSON v1.</p>
        {BACKUP_TEMPLATE_OPTIONS.map((opt) => (
          <label key={opt.id} className="ury-check" style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="radio"
              name="backupTemplate"
              checked={extras.backupTemplate === opt.id}
              onChange={() => set({ backupTemplate: opt.id })}
            />
            <span><b>{opt.label}</b> — {opt.blurb}</span>
          </label>
        ))}
        <button type="button" className="ury-submit" style={{ marginTop: 8 }} onClick={() => onBackupDownload(extras.backupTemplate)}>
          <Download size={12} aria-hidden /> Download in selected format
        </button>
      </div>

      <div className="ury-form-card">
        <h3>Attachment storage provider</h3>
        <p className="ury-muted">
          Choose local disk or any S3-compatible service (AWS S3, MinIO, Cloudflare R2, Wasabi, Backblaze B2).
          Access keys are saved only on the POS server, not in the shared session.
        </p>
        <label className="ury-field"><span>Provider</span>
          <select
            value={storage.provider}
            onChange={(e) => setStorage((s) => ({ ...s, provider: e.target.value as StorageProviderChoice }))}
          >
            <option value="local">Local disk on POS server</option>
            <option value="s3">S3-compatible cloud</option>
          </select>
        </label>
        {storage.provider === 's3' && (
          <>
            <label className="ury-field"><span>Endpoint URL</span>
              <input value={storage.endpoint ?? ''} placeholder="https://s3.ap-south-1.amazonaws.com" onChange={(e) => setStorage((s) => ({ ...s, endpoint: e.target.value }))} />
            </label>
            <label className="ury-field"><span>Region</span>
              <input value={storage.region ?? ''} placeholder="ap-south-1" onChange={(e) => setStorage((s) => ({ ...s, region: e.target.value }))} />
            </label>
            <label className="ury-field"><span>Bucket</span>
              <input value={storage.bucket ?? ''} onChange={(e) => setStorage((s) => ({ ...s, bucket: e.target.value }))} />
            </label>
            <label className="ury-field"><span>Prefix (folder)</span>
              <input value={storage.prefix ?? ''} placeholder="ury-pos/attachments/" onChange={(e) => setStorage((s) => ({ ...s, prefix: e.target.value }))} />
            </label>
            <label className="ury-field"><span>Access key ID</span>
              <input value={accessKey} placeholder={storage.configured ? '(saved — enter to replace)' : ''} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
            </label>
            <label className="ury-field"><span>Secret access key</span>
              <input type="password" value={secretKey} placeholder={storage.configured ? '(saved — enter to replace)' : ''} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" />
            </label>
          </>
        )}
        <button type="button" className="ury-submit" disabled={savingStorage} onClick={() => void saveStorage()}>
          <Save size={12} aria-hidden /> {savingStorage ? 'Saving…' : 'Save storage settings'}
        </button>
        <p className="ury-muted" style={{ marginTop: 6 }}>
          Active: <b>{storage.provider}</b>
          {storage.provider === 's3' && storage.bucket ? ` · ${storage.bucket}` : ''}
          {storage.provider === 's3' ? (storage.configured ? ' · keys saved' : ' · keys not set yet') : ''}
        </p>
      </div>
    </>
  );
}
