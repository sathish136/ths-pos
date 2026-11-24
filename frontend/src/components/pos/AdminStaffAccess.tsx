import { useState } from 'react';
import { RotateCcw, UserPlus, Users } from 'lucide-react';
import { type PosExtras, type StaffAccount } from '../../lib/extras';
import { ALL_PERMISSIONS, PERMISSION_LABEL, ROLES, type Permission, type RoleId, defaultPermissions } from '../../lib/roles';

type Props = {
  extras: PosExtras;
  onChange: (next: PosExtras) => void;
  flash: (msg: string) => void;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const PIN_RE = /^\d{4,6}$/;

/** Named staff accounts and the permission matrix per role (cards for Admin console). */
export function AdminStaffAccess({ extras, onChange, flash }: Props) {
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState<RoleId>('cashier');
  const [pin, setPin] = useState('');

  const staffRoles = ROLES.filter((r) => r.id !== 'manager');
  const effective = (role: RoleId): Permission[] => extras.permOverrides[role] ?? defaultPermissions(role);

  function setStaff(list: StaffAccount[]) {
    onChange({ ...extras, staff: list });
  }

  function addStaff() {
    const n = name.trim();
    if (!n) return flash('Enter the staff name');
    if (!PIN_RE.test(pin)) return flash('PIN must be 4–6 digits');
    if (extras.staff.some((s) => s.active && s.roleId === roleId && s.pin === pin)) return flash('Another active account for this role already uses that PIN');
    setStaff([...extras.staff, { id: uid(), name: n, roleId, pin, active: true }]);
    setName('');
    setPin('');
    flash(`Added ${n} as ${ROLES.find((r) => r.id === roleId)?.label}`);
  }

  function togglePerm(role: RoleId, perm: Permission) {
    const cur = effective(role);
    const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
    onChange({ ...extras, permOverrides: { ...extras.permOverrides, [role]: next } });
  }

  function resetRole(role: RoleId) {
    const { [role]: _removed, ...rest } = extras.permOverrides;
    void _removed;
    onChange({ ...extras, permOverrides: rest });
    flash(`${ROLES.find((r) => r.id === role)?.label} permissions reset to default`);
  }

  return (
    <>
      <div className="ury-form-card">
        <h3><Users size={13} aria-hidden /> Staff accounts</h3>
        <p className="ury-muted">
          Each person signs in with their role and their own PIN. Tickets and reports show their name.
          Without a staff account, the role PIN still works (name shown as the role).
        </p>
        {extras.staff.length === 0 && <p className="ury-muted">No named staff yet.</p>}
        {extras.staff.map((s) => (
          <div key={s.id} className="ury-form-row" style={{ marginBottom: 8, alignItems: 'end' }}>
            <label className="ury-field"><span>Name</span>
              <input value={s.name} onChange={(e) => setStaff(extras.staff.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label className="ury-field"><span>Role</span>
              <select value={s.roleId} onChange={(e) => setStaff(extras.staff.map((x) => (x.id === s.id ? { ...x, roleId: e.target.value as RoleId } : x)))}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label className="ury-field"><span>PIN</span>
              <input value={s.pin} inputMode="numeric" onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setStaff(extras.staff.map((x) => (x.id === s.id ? { ...x, pin: v } : x)));
              }} />
            </label>
            <label className="ury-check"><input type="checkbox" checked={s.active} onChange={(e) => setStaff(extras.staff.map((x) => (x.id === s.id ? { ...x, active: e.target.checked } : x)))} /> <span>Active</span></label>
            <button type="button" className="ury-ghost" onClick={() => setStaff(extras.staff.filter((x) => x.id !== s.id))}>Remove</button>
          </div>
        ))}
        <div className="ury-form-row" style={{ alignItems: 'end', marginTop: 8 }}>
          <label className="ury-field"><span>New staff name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi" /></label>
          <label className="ury-field"><span>Role</span>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value as RoleId)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label className="ury-field"><span>PIN (4–6 digits)</span><input value={pin} inputMode="numeric" onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <button type="button" className="ury-submit" onClick={addStaff}><UserPlus size={13} aria-hidden /> Add account</button>
        </div>
      </div>

      <div className="ury-form-card" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
        <h3>Permissions by role</h3>
        <p className="ury-muted">
          Tick what each role can do. Manager always has every permission. Changes apply on the next screen refresh on every device.
        </p>
        <table className="ury-report-table">
          <thead>
            <tr>
              <th>Permission</th>
              {staffRoles.map((r) => (
                <th key={r.id}>
                  {r.label}
                  <button type="button" className="ury-ghost" style={{ marginLeft: 6 }} onClick={() => resetRole(r.id)} title="Reset to default"><RotateCcw size={11} aria-hidden /></button>
                </th>
              ))}
              <th>Manager</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm}>
                <td>{PERMISSION_LABEL[perm]}</td>
                {staffRoles.map((r) => (
                  <td key={r.id} style={{ textAlign: 'center' }}>
                    <input type="checkbox" aria-label={`${r.label}: ${PERMISSION_LABEL[perm]}`} checked={effective(r.id).includes(perm)} onChange={() => togglePerm(r.id, perm)} />
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>✓</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
