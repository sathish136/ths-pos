import { ExternalLink, ListChecks } from 'lucide-react';
import type { FeatureItem } from '../../lib/features';
import { ERP_POS_HOME, erpPosLinkFor } from '../../lib/erp-pos-links';

type Props = {
  features: FeatureItem[];
  canEdit: boolean;
  onChange: (features: FeatureItem[]) => void;
  flash: (msg: string) => void;
};

export function FeaturesPanel({ features, canEdit, onChange, flash }: Props) {
  const groups = Array.from(new Set(features.map((f) => f.group)));
  const included = features.filter((f) => f.included).length;

  function toggle(id: string) {
    if (!canEdit) {
      flash('Manager customizes the feature checklist');
      return;
    }
    onChange(features.map((f) => (f.id === id ? { ...f, included: !f.included } : f)));
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><ListChecks size={13} /> DISCOVERY BASELINE</div>
          <h1>URY POS scope — linked to ERP POS</h1>
          <p>
            Each in-scope module opens the matching ERP POS / desk screen.
            {' '}<a href={ERP_POS_HOME}>Open ERP POS home →</a>
          </p>
        </div>
        <div className="ury-seat-kpis">
          <span><b>{included}</b> in scope</span>
          <span><b>{features.length - included}</b> later / out</span>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 22 }}>
          <h2 className="ury-panel-sub">{g}</h2>
          <div className="ury-feature-list">
            {features.filter((f) => f.group === g).map((f) => {
              const scope = f.scope ?? (f.included ? 'in' : 'out');
              const badge = scope === 'in' ? 'In scope' : scope === 'partial' ? 'Partial' : 'Later';
              // Map discovery module ids → ERP POS routes
              const viewHint = f.id.startsWith('mod-')
                ? ({
                    'mod-pos': 'floor',
                    'mod-dinein': 'seating',
                    'mod-takeaway': 'floor',
                    'mod-delivery': 'orders',
                    'mod-kot': 'kitchen',
                    'mod-menu': 'admin',
                    'mod-inventory': 'stock',
                    'mod-accounts': 'accounting',
                    'mod-reports': 'reports',
                    'mod-multibranch': 'settings',
                  } as Record<string, string>)[f.id]
                : f.group === 'Floor'
                  ? 'floor'
                  : f.group === 'Kitchen'
                    ? 'kitchen'
                    : f.group === 'Cashier'
                      ? 'floor'
                      : f.group === 'Stock'
                        ? 'stock'
                        : f.group === 'Reports'
                          ? 'reports'
                          : f.group === 'Manager'
                            ? 'shifts'
                            : undefined;
              const erp = viewHint ? erpPosLinkFor(viewHint) : { href: ERP_POS_HOME, label: 'ERP POS' };
              return (
              <div key={f.id} className={`ury-feature-row ${f.included ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={f.included}
                  disabled={!canEdit && (g === 'Later phase' || g === 'Optional')}
                  onChange={() => toggle(f.id)}
                />
                <span>
                  <strong>{f.label}</strong>
                  <small>{f.detail}</small>
                </span>
                <a href={erp.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <ExternalLink size={12} /> {erp.label}
                </a>
                <em>{badge}</em>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
