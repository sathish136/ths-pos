/** Admin-configurable extras: kitchen sections & printers, combos, notification rules,
 *  staff accounts, permissions, menu prices & availability, floor layout, statements,
 *  PIN overrides, button labels, report columns, presence (for cross-device checks).
 *  Stored in the shared session blob under `extras`.
 */
import type { MenuItem, OrderLine, OrderType } from './order-process';
import type { Permission, RoleId } from './roles';

export type KitchenSection = {
  id: string;
  name: string;
  /** Printer label / network address shown on chits for this section */
  printer: string;
  /** Menu categories routed to this section */
  categories: string[];
};

export type ComboGroup = {
  label: string;
  /** Menu item ids the guest may choose from */
  options: string[];
  /** Min and max choices from this group (option limits) */
  min: number;
  max: number;
};

export type Combo = {
  id: string;
  name: string;
  price: number;
  groups: ComboGroup[];
};

export type NotifyTrigger =
  | 'discount_applied'
  | 'void'
  | 'credit_sale'
  | 'kitchen_reject'
  | 'shift_closed'
  | 'item_cancelled'
  | 'large_sale';

export type NotifyWhere = 'all' | 'cashier' | 'captain' | 'kitchen' | 'manager';

export type NotifyRule = {
  id: string;
  trigger: NotifyTrigger;
  /** Message text. Placeholders: {ticket} {table} {amount} {by} {customer} {reason} {value} */
  message: string;
  enabled: boolean;
  /** Optional condition: discount % for discount_applied, amount for large_sale, ignored otherwise */
  threshold?: number;
  /** Which staff screen shows the message */
  where?: NotifyWhere;
};

export type Presence = Record<string, { role: RoleId; at: number }>;

export type StaffAccount = {
  id: string;
  name: string;
  roleId: RoleId;
  pin: string;
  active: boolean;
};

export type SalesTypeKey = OrderType;
export const SALES_TYPE_KEYS: SalesTypeKey[] = ['Dine in', 'Takeaway', 'Delivery'];

export type MenuOverride = {
  available?: boolean;
  /** Price per sales type; a missing value falls back to the base price */
  prices?: Partial<Record<SalesTypeKey, number>>;
};

export type AccountPayment = {
  id: string;
  customer: string;
  at: string;
  amountPaid: number;
  method: 'Cash' | 'Card' | 'Bank transfer';
  note: string;
};

export type StatementTemplate = {
  company: string;
  address: string;
  header: string;
  footer: string;
};

/** Shared notification inbox: each screen shows the messages whose `where` matches its role */
export type NoticeItem = { id: string; atMs: number; where: NotifyWhere; text: string };


export type ExcelColumn = { key: string; header: string; enabled: boolean };

export type NavButtonConfig = {
  id: string;
  /** Custom label; empty = default */
  label: string;
  visible: boolean;
};

export type DisplayTemplateKind = 'receipt' | 'tax_invoice' | 'kitchen_chit' | 'statement' | 'custom';

export type DisplayTemplate = {
  id: string;
  name: string;
  kind: DisplayTemplateKind;
  /** Text / HTML with placeholders: {restaurant} {ticket} {table} {total} {items} {customer} {date} {by} */
  body: string;
};

export type BackupTemplateId = 'ury-json' | 'flat-csv' | 'erpnext-json' | 'custom-mapped';

export type StorageProviderChoice = 'local' | 's3';

export const DEFAULT_NAV_BUTTONS: NavButtonConfig[] = [
  { id: 'seating', label: '', visible: true },
  { id: 'floor', label: '', visible: true },
  { id: 'kitchen', label: '', visible: true },
  { id: 'orders', label: '', visible: true },
  { id: 'ledger', label: '', visible: true },
  { id: 'recipes', label: '', visible: true },
  { id: 'stock', label: '', visible: true },
  { id: 'shifts', label: '', visible: true },
  { id: 'accounting', label: '', visible: true },
  { id: 'reports', label: '', visible: true },
  { id: 'features', label: '', visible: true },
  { id: 'admin', label: '', visible: true },
  { id: 'settings', label: '', visible: true },
];

export const DEFAULT_DISPLAY_TEMPLATES: DisplayTemplate[] = [
  {
    id: 'tpl-receipt',
    name: 'Guest receipt',
    kind: 'receipt',
    body: '{restaurant}\nTicket #{ticket} · {table}\n{date}\n---\n{items}\n---\nTotal: {total}\nServed by {by}\nThank you!',
  },
  {
    id: 'tpl-tax',
    name: 'Tax invoice',
    kind: 'tax_invoice',
    body: 'TAX INVOICE\n{restaurant}\nCustomer: {customer}\nInvoice #{ticket} · {date}\n---\n{items}\n---\nTotal: {total}',
  },
  {
    id: 'tpl-kitchen',
    name: 'Kitchen chit',
    kind: 'kitchen_chit',
    body: 'KITCHEN · #{ticket}\nTable: {table}\n{items}\nNotes as on ticket',
  },
  {
    id: 'tpl-statement',
    name: 'Account statement',
    kind: 'statement',
    body: '{restaurant}\nAccount statement for {customer}\nAs of {date}\n{items}\nAmount due: {total}',
  },
];

export const BACKUP_TEMPLATE_OPTIONS: { id: BackupTemplateId; label: string; blurb: string }[] = [
  { id: 'ury-json', label: 'URY JSON (v1)', blurb: 'Full session blob — restore into this POS' },
  { id: 'flat-csv', label: 'Flat CSV (sales)', blurb: 'One row per sale — for Excel / BI tools' },
  { id: 'erpnext-json', label: 'ERPNext-style JSON', blurb: 'Sales Invoice shaped records for import mapping' },
  { id: 'custom-mapped', label: 'Custom mapped JSON', blurb: 'Uses your Excel column headers as field names' },
];

export type PosExtras = {
  kitchenSections: KitchenSection[];
  combos: Combo[];
  notifications: NotifyRule[];
  /** Manager-set PINs per role (overrides the default PIN) */
  pinOverrides: Partial<Record<RoleId, string>>;
  /** Named staff accounts (log in with role + their PIN; name is used on tickets & reports) */
  staff: StaffAccount[];
  /** Manager-edited permissions per role */
  permOverrides: Partial<Record<RoleId, Permission[]>>;
  /** Menu availability and per-sales-type prices keyed by menu item id */
  menuOverrides: Record<string, MenuOverride>;
  /** Floor plan: background colour and per-table colour keyed by table id */
  floorBackground: string;
  tableColors: Record<string, string>;
  /** Customer payments on account (reduce a credit balance) */
  accountPayments: AccountPayment[];
  statementTemplate: StatementTemplate;
  /** Recent notifications (newest first), delivered to every device */
  inbox: NoticeItem[];
  /** Custom button / tab labels keyed by view id */
  labels: Record<string, string>;
  /** Ordered nav buttons: rename, hide, reorder */
  navButtons: NavButtonConfig[];
  /** Columns included in CSV export of the sales report */
  reportColumns: string[];
  /** Excel export template: column key, custom header, enabled */
  excelTemplate: ExcelColumn[];
  /** Custom display templates for receipts / invoices / chits / statements */
  displayTemplates: DisplayTemplate[];
  /** Which backup shape to download */
  backupTemplate: BackupTemplateId;
  /** Preferred attachment storage provider (actual S3 secrets live on the server) */
  storageProvider: StorageProviderChoice;
  /** Read-only API token (GET only) */
  apiToken: string;
  presence: Presence;
};

export const ALL_REPORT_COLUMNS = [
  'ticketNumber',
  'at',
  'type',
  'table',
  'customerName',
  'paymentMethod',
  'itemCount',
  'subtotal',
  'discount',
  'tax',
  'tip',
  'total',
  'by',
] as const;

export function defaultExcelTemplate(): ExcelColumn[] {
  return ALL_REPORT_COLUMNS.map((key) => ({
    key,
    header: key,
    enabled: ['ticketNumber', 'at', 'type', 'table', 'paymentMethod', 'subtotal', 'discount', 'tax', 'tip', 'total', 'by'].includes(key),
  }));
}

export const TRIGGER_LABEL: Record<NotifyTrigger, string> = {
  discount_applied: 'Discount applied (threshold = %)',
  void: 'Ticket voided',
  credit_sale: 'Credit sale',
  kitchen_reject: 'Kitchen rejected a ticket',
  shift_closed: 'Shift closed',
  item_cancelled: 'Item cancelled (threshold unused)',
  large_sale: 'Sale paid (threshold = amount)',
};

export const WHERE_LABEL: Record<NotifyWhere, string> = {
  all: 'Every screen',
  cashier: 'Cashier screens',
  captain: 'Captain screens',
  kitchen: 'Kitchen screen',
  manager: 'Manager screens',
};

export const DEFAULT_EXTRAS: PosExtras = {
  kitchenSections: [
    { id: 'hot', name: 'Hot kitchen', printer: 'Kitchen printer 1 · 192.168.1.50', categories: ['Mains', 'Small plates'] },
    { id: 'pastry', name: 'Pastry', printer: 'Pastry printer · 192.168.1.51', categories: ['Dessert'] },
  ],
  combos: [],
  notifications: [
    { id: 'n-discount', trigger: 'discount_applied', message: 'A discount of {value}% was applied on #{ticket} by {by}.', enabled: true, threshold: 0, where: 'manager' },
    { id: 'n-void', trigger: 'void', message: 'A ticket was voided by a Manager.', enabled: true, where: 'all' },
    { id: 'n-credit', trigger: 'credit_sale', message: 'Credit sale recorded for {customer} — follow up with the account.', enabled: true, where: 'cashier' },
    { id: 'n-reject', trigger: 'kitchen_reject', message: 'Kitchen rejected an order on {table} — captain must suggest an alternative.', enabled: true, where: 'captain' },
    { id: 'n-shift', trigger: 'shift_closed', message: 'Shift closed.', enabled: false, where: 'manager' },
    { id: 'n-cancel', trigger: 'item_cancelled', message: 'Item cancelled on {table}: {reason} ({by}).', enabled: true, where: 'manager' },
    { id: 'n-large', trigger: 'large_sale', message: 'Large sale #{ticket} paid: {amount} by {by}.', enabled: false, threshold: 200, where: 'manager' },
  ],
  pinOverrides: {},
  staff: [],
  permOverrides: {},
  menuOverrides: {},
  floorBackground: '#f6f1e7',
  tableColors: {},
  accountPayments: [],
  inbox: [],
  statementTemplate: {
    company: 'URY Restaurant',
    address: '',
    header: 'Customer account statement',
    footer: 'Please settle outstanding balances within 14 days. Thank you.',
  },
  labels: {},
  navButtons: DEFAULT_NAV_BUTTONS,
  reportColumns: ['ticketNumber', 'at', 'type', 'table', 'paymentMethod', 'subtotal', 'discount', 'tax', 'tip', 'total', 'by'],
  excelTemplate: [],
  displayTemplates: DEFAULT_DISPLAY_TEMPLATES,
  backupTemplate: 'ury-json',
  storageProvider: 'local',
  apiToken: 'ury-readonly-demo-token',
  presence: {},
};

export function mergeExtras(saved: unknown): PosExtras {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<PosExtras>;
  const merged: PosExtras = { ...DEFAULT_EXTRAS, ...s, presence: { ...(s.presence ?? {}) } };
  merged.notifications = (merged.notifications ?? []).map((r) => ({ where: 'all', ...r }));
  merged.staff = merged.staff ?? [];
  merged.permOverrides = merged.permOverrides ?? {};
  merged.menuOverrides = merged.menuOverrides ?? {};
  merged.tableColors = merged.tableColors ?? {};
  merged.accountPayments = merged.accountPayments ?? [];
  merged.inbox = merged.inbox ?? [];
  merged.statementTemplate = { ...DEFAULT_EXTRAS.statementTemplate, ...(s.statementTemplate ?? {}) };
  merged.navButtons = (s.navButtons && s.navButtons.length)
    ? s.navButtons
    : DEFAULT_NAV_BUTTONS.map((b) => ({ ...b, label: s.labels?.[b.id] ?? b.label }));
  merged.excelTemplate = (s.excelTemplate && s.excelTemplate.length) ? s.excelTemplate : defaultExcelTemplate();
  merged.displayTemplates = (s.displayTemplates && s.displayTemplates.length) ? s.displayTemplates : DEFAULT_DISPLAY_TEMPLATES;
  merged.backupTemplate = s.backupTemplate ?? 'ury-json';
  merged.storageProvider = s.storageProvider ?? 'local';
  return merged;
}

/** Render a display template with placeholder values. */
export function renderDisplayTemplate(body: string, data: Record<string, string | number | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v === undefined || v === '' ? '' : String(v);
  });
}


/** Menu with manager overrides applied (availability and sales-type prices). */
export function applyMenuOverrides(base: MenuItem[], overrides: Record<string, MenuOverride>, salesType: SalesTypeKey = 'Dine in'): MenuItem[] {
  return base.map((item) => {
    const o = overrides[item.id];
    if (!o) return item;
    const priceForType = o.prices?.[salesType];
    return {
      ...item,
      available: o.available ?? item.available,
      price: priceForType ?? item.price,
      prices: { ...(item.prices ?? {}), ...(o.prices ?? {}) } as MenuItem['prices'],
    };
  });
}

/** Staff PIN check: an active account for this role with the exact PIN. */
export function staffForPin(staff: StaffAccount[], roleId: RoleId, pin: string): StaffAccount | undefined {
  return staff.find((s) => s.active && s.roleId === roleId && s.pin === pin);
}

/** Send a notification message to a screen. */
export function whereMatches(where: NotifyWhere | undefined, roleId: RoleId | null): boolean {
  const w = where ?? 'all';
  if (w === 'all') return true;
  if (!roleId) return false;
  if (w === 'manager') return roleId === 'manager' || roleId === 'supervisor';
  if (w === 'cashier') return roleId === 'cashier' || roleId === 'cashier2' || roleId === 'supervisor';
  if (w === 'captain') return roleId === 'captain' || roleId === 'manager';
  if (w === 'kitchen') return roleId === 'kitchen' || roleId === 'manager';
  return false;
}

/** Fill {placeholders} in a notification template. */
export function renderNotice(template: string, data: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v === undefined || v === '' ? '' : String(v);
  });
}

/** Section a menu item is routed to (by category). Unrouted items go to the first section. */
export function sectionForItem(item: MenuItem, sections: KitchenSection[]): KitchenSection | undefined {
  return sections.find((sec) => sec.categories.includes(item.category)) ?? sections[0];
}

/** Effective PIN for a role (Manager override or the default). */
export function effectivePin(role: { id: RoleId; pin: string }, overrides: PosExtras['pinOverrides']): string {
  return overrides[role.id] || role.pin;
}

/** Validate that a combo selection respects each group's min / max. */
export function validateComboPick(combo: Combo, picks: string[][]): string | null {
  for (let i = 0; i < combo.groups.length; i++) {
    const g = combo.groups[i];
    const n = picks[i]?.length ?? 0;
    if (n < g.min) return `${g.label}: choose at least ${g.min}`;
    if (n > g.max) return `${g.label}: choose at most ${g.max}`;
  }
  return null;
}

/** Build the order line for a combo with the chosen items. Line name lists the choices. */
export function comboLine(combo: Combo, picks: string[][], menu: MenuItem[]): OrderLine {
  const names = picks.flat().map((id) => menu.find((m) => m.id === id)?.name ?? id);
  const menuItem: MenuItem = {
    id: `combo:${combo.id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `${combo.name} (${names.join(', ')})`,
    category: 'Combos',
    description: names.join(' · '),
    price: combo.price,
    image: '',
    dietaryTags: [],
    available: true,
  };
  return { menuItem, quantity: 1, notes: '' };
}

/** Read-only projection of sales for the external API (no writes). */
export function readonlySales(sales: Array<Record<string, unknown>>) {
  return sales.map((s) => ({
    ticketNumber: s.ticketNumber,
    at: s.at,
    type: s.type,
    table: s.table,
    paymentMethod: s.paymentMethod,
    customerName: s.customerName ?? null,
    total: s.total,
    discount: s.discount ?? 0,
    tip: s.tip ?? 0,
    by: s.by,
    captain: s.captain ?? null,
    lines: s.lines,
  }));
}
