/** Discovery questionnaire module baseline — aligned with URY POS Implementation Discovery doc. */

export type FeatureItem = {
  id: string;
  group: string;
  label: string;
  detail: string;
  /** Discovery scope: in = live on THS POS, partial = UX present / ERP partial, out = later phase */
  included: boolean;
  scope?: 'in' | 'partial' | 'out';
};

export function seedFeatures(): FeatureItem[] {
  return [
    // §2 Modules (discovery questionnaire)
    {
      id: 'mod-pos',
      group: 'Discovery · Modules',
      label: 'Restaurant POS & cashiering',
      detail: 'Sales, payments, discounts, refunds, shifts, cash closing — ERP POS Invoice live',
      included: true,
      scope: 'in',
    },
    {
      id: 'mod-dinein',
      group: 'Discovery · Modules',
      label: 'Dine-in & table management',
      detail: 'Floor map, zones, covers, table status — tables seeded + Captain floor',
      included: true,
      scope: 'in',
    },
    {
      id: 'mod-reservations',
      group: 'Discovery · Modules',
      label: 'Table reservations',
      detail: 'Bookings, deposits, waitlist — later phase',
      included: false,
      scope: 'out',
    },
    {
      id: 'mod-takeaway',
      group: 'Discovery · Modules',
      label: 'Takeaway / pickup',
      detail: 'Counter / call-center tickets → kitchen → pay',
      included: true,
      scope: 'in',
    },
    {
      id: 'mod-online',
      group: 'Discovery · Modules',
      label: 'Online ordering',
      detail: 'Website/app/third-party intake — later phase',
      included: false,
      scope: 'out',
    },
    {
      id: 'mod-delivery',
      group: 'Discovery · Modules',
      label: 'Delivery management',
      detail: 'Delivery tickets + rider pay mode; zones/dispatch partial',
      included: true,
      scope: 'partial',
    },
    {
      id: 'mod-kot',
      group: 'Discovery · Modules',
      label: 'Kitchen Order Ticket (KOT)',
      detail: 'KDS + URY KOT create/status on send / ready / served',
      included: true,
      scope: 'in',
    },
    {
      id: 'mod-menu',
      group: 'Discovery · Modules',
      label: 'Menu, recipes & modifiers',
      detail: 'Items + Dine-in/Takeaway/Delivery prices; BOM recipes; combos/modifiers partial',
      included: true,
      scope: 'partial',
    },
    {
      id: 'mod-inventory',
      group: 'Discovery · Modules',
      label: 'Inventory & purchasing',
      detail: 'Stock balance, receive, transfer, ledger via Stock Entry',
      included: true,
      scope: 'partial',
    },
    {
      id: 'mod-accounts',
      group: 'Discovery · Modules',
      label: 'Accounts & finance',
      detail: 'POS payments + accounting snapshot; full GL via ERPNext desk',
      included: true,
      scope: 'partial',
    },
    {
      id: 'mod-hr',
      group: 'Discovery · Modules',
      label: 'HR & payroll',
      detail: 'HRMS installed on site; POS uses URY roles only for now',
      included: false,
      scope: 'out',
    },
    {
      id: 'mod-loyalty',
      group: 'Discovery · Modules',
      label: 'Customer / loyalty / CRM',
      detail: 'Guest name on ticket; points/tiers later',
      included: false,
      scope: 'out',
    },
    {
      id: 'mod-reports',
      group: 'Discovery · Modules',
      label: 'Reporting & dashboards',
      detail: 'Sales / Z / items / payments from POS Invoice + local report UI',
      included: true,
      scope: 'in',
    },
    {
      id: 'mod-multibranch',
      group: 'Discovery · Modules',
      label: 'Multi-branch management',
      detail: 'Branch switch in UI; shared company profile on ERP',
      included: true,
      scope: 'partial',
    },

    // Day-one ops (still shown under product groups)
    { id: 'seating', group: 'Floor', label: 'Table seating / floor map', detail: 'Seat guests, table status, go to ticket', included: true, scope: 'in' },
    { id: 'merge-tables', group: 'Floor', label: 'Merge tables', detail: 'Combine two live tables onto one ticket', included: true, scope: 'in' },
    { id: 'move-dishes', group: 'Floor', label: 'Move dishes between tables', detail: 'Split items across tables', included: true, scope: 'in' },
    { id: 'order-dine', group: 'Floor', label: 'Dine-in ordering', detail: 'Captain takes order on table', included: true, scope: 'in' },
    { id: 'order-takeaway', group: 'Floor', label: 'Takeaway', detail: 'Counter pickup tickets', included: true, scope: 'in' },
    { id: 'order-delivery', group: 'Floor', label: 'Delivery', detail: 'Customer name/phone/address + pay mode', included: true, scope: 'in' },
    { id: 'send-kitchen', group: 'Kitchen', label: 'Send to kitchen', detail: 'Creates draft POS Invoice + URY KOT', included: true, scope: 'in' },
    { id: 'kds', group: 'Kitchen', label: 'Kitchen display (KDS)', detail: 'Kitchen role queue + SLA timer', included: true, scope: 'in' },
    { id: 'kds-accept', group: 'Kitchen', label: 'Accept / reject order', detail: 'Kitchen accepts or sends back', included: true, scope: 'in' },
    { id: 'kds-print', group: 'Kitchen', label: 'Print kitchen chit', detail: 'Printer icon on kitchen cards', included: true, scope: 'in' },
    { id: 'sla-timer', group: 'Kitchen', label: 'On-time / late timer', detail: 'Configurable SLA minutes', included: true, scope: 'in' },
    { id: 'serve', group: 'Floor', label: 'Serve when ready', detail: 'Captain marks served → KOT Served', included: true, scope: 'in' },
    { id: 'pay', group: 'Cashier', label: 'Collect payments', detail: 'Cash / card / split → submit POS Invoice', included: true, scope: 'in' },
    { id: 'delivery-pay', group: 'Delivery', label: 'Rider collects payment', detail: 'Delivery PIN · COD at door', included: true, scope: 'partial' },
    { id: 'day-orders', group: 'Floor', label: 'Day orders history', detail: 'Live + completed tickets for the day', included: true, scope: 'in' },
    { id: 'print-order', group: 'Floor', label: 'Print order / kitchen chit', detail: 'Guest print + print on send', included: true, scope: 'in' },
    { id: 'roles', group: 'Access', label: 'Role + PIN / ERP login', detail: 'Captain / Cashier / Kitchen / Manager → Frappe Users', included: true, scope: 'in' },
    { id: 'branch', group: 'Access', label: 'Multi-branch switch', detail: 'Main / Harbor / Airport demo branches', included: true, scope: 'partial' },
    { id: 'recipes', group: 'Stock', label: 'Recipe / BOM per item', detail: 'Manager sets ingredients → ERP BOM', included: true, scope: 'in' },
    { id: 'stock-deduct', group: 'Stock', label: 'Auto stock deduct', detail: 'On send or payment (settings)', included: true, scope: 'partial' },
    { id: 'ledger', group: 'Stock', label: 'Live stock ledger', detail: 'Stock Ledger Entry + Bin balances', included: true, scope: 'in' },
    { id: 'stock-recv', group: 'Stock', label: 'Receive / write-off stock', detail: 'Material Receipt Stock Entry', included: true, scope: 'in' },
    { id: 'stock-pr', group: 'Stock', label: 'Purchase Receipt → store', detail: 'PR no. + supplier into stores', included: true, scope: 'partial' },
    { id: 'stock-xfer', group: 'Stock', label: 'Store-to-store transfer', detail: 'Material Transfer Stock Entry', included: true, scope: 'in' },
    { id: 'reports', group: 'Reports', label: 'Full report pack', detail: 'Summary, Z, items, payments, staff, branch', included: true, scope: 'in' },
    { id: 'export', group: 'Reports', label: 'TXT / CSV export', detail: 'Manager export', included: true, scope: 'in' },
    { id: 'print-reports', group: 'Reports', label: 'Print reports', detail: 'Browser print', included: true, scope: 'in' },
    { id: 'shift', group: 'Manager', label: 'Open / close shift', detail: 'POS Opening / Closing Entry', included: true, scope: 'in' },
    { id: 'reconcile', group: 'Manager', label: 'Payment reconcile', detail: 'Cash declared vs expected', included: true, scope: 'in' },
    { id: 'accounting', group: 'Manager', label: 'Accounting view', detail: 'Tender + tax snapshot', included: true, scope: 'partial' },
    { id: 'void', group: 'Manager', label: 'Void ticket', detail: 'Cancel / delete POS Invoice', included: true, scope: 'in' },
    { id: 'settings', group: 'Manager', label: 'Restaurant settings', detail: 'Tax, SLA, footer, branding text', included: true, scope: 'in' },
    { id: 'customize-ui', group: 'Later phase', label: 'Custom branding / theme', detail: 'Logo, colors — scoped after order', included: false, scope: 'out' },
    { id: 'fiscal', group: 'Later phase', label: 'Fiscal / tax device', detail: 'Country fiscal printers', included: false, scope: 'out' },
    { id: 'online-order', group: 'Later phase', label: 'Online ordering intake', detail: 'Web / app orders into KDS', included: false, scope: 'out' },
    { id: 'loyalty', group: 'Later phase', label: 'Loyalty / CRM', detail: 'Points & guest profiles', included: false, scope: 'out' },
  ];
}
