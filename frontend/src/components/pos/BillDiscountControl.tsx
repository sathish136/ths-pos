import { useEffect, useState } from 'react';
import { type BillDiscount } from '../../lib/order-process';

type Props = {
  discount?: BillDiscount;
  /** Manager can change discounts; others see the applied discount read-only */
  canApply: boolean;
  onApply: (next?: BillDiscount) => void;
};

/** Bill-level discount: percent or fixed amount, with a required reason for audit. */
export function BillDiscountControl({ discount, canApply, onApply }: Props) {
  const [kind, setKind] = useState<BillDiscount['kind']>(discount?.kind ?? 'percent');
  const [value, setValue] = useState(discount ? String(discount.value) : '');
  const [reason, setReason] = useState(discount?.reason ?? '');

  useEffect(() => {
    if (discount) {
      setKind(discount.kind);
      setValue(String(discount.value));
      setReason(discount.reason);
    } else {
      setValue('');
      setReason('');
    }
  }, [discount?.kind, discount?.value, discount?.reason]);

  if (!canApply && !discount) return null;

  function apply() {
    const n = Number(value);
    if (!value.trim() || Number.isNaN(n) || n <= 0) {
      window.alert('Enter a discount value greater than 0');
      return;
    }
    if (kind === 'percent' && n > 100) {
      window.alert('Percent discount cannot exceed 100');
      return;
    }
    if (!reason.trim()) {
      window.alert('Enter a reason for the discount (kept for audit)');
      return;
    }
    onApply({ kind, value: n, reason: reason.trim() });
  }

  return (
    <div className="ury-discount" style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
      <div className="ury-section-label">
        <span>DISCOUNT</span>
        <span>{discount ? 'APPLIED' : canApply ? 'MANAGER' : 'NONE'}</span>
      </div>
      {canApply ? (
        <>
          <div className="ury-form-row">
            <label className="ury-field">
              <span>Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as BillDiscount['kind'])}>
                <option value="percent">Percent %</option>
                <option value="amount">Fixed amount</option>
              </select>
            </label>
            <label className="ury-field">
              <span>{kind === 'percent' ? 'Percent' : 'Amount'}</span>
              <input value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} />
            </label>
          </div>
          <label className="ury-field">
            <span>Reason</span>
            <input value={reason} placeholder="e.g. Staff meal, complaint" onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="ury-action-row">
            <button type="button" className="ury-ghost" onClick={apply}>Apply discount</button>
            {discount && (
              <button type="button" className="ury-ghost" onClick={() => onApply(undefined)}>Remove</button>
            )}
          </div>
        </>
      ) : (
        <p className="ury-muted">
          {discount ? `${discount.reason} · applied by ${discount.by ?? 'Manager'}` : 'No discount'}
        </p>
      )}
    </div>
  );
}
