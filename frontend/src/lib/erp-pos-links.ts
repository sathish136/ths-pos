/** Deep links from Custom React panels → stock ERP URY POS (/urypos) + desk. */

export type ErpPosLink = {
  /** Primary ERP POS SPA route */
  href: string;
  label: string;
  /** Optional ERPNext desk fallback */
  desk?: string;
};

/** Map each Custom React view to the matching ERP POS screen. */
export const ERP_POS_LINKS: Record<string, ErpPosLink> = {
  seating: { href: '/urypos/tables', label: 'ERP Tables', desk: '/app/ury-table' },
  floor: { href: '/urypos/register', label: 'ERP Register', desk: '/app/pos-invoice' },
  kitchen: { href: '/mosaic', label: 'ERP Kitchen (Mosaic)', desk: '/app/ury-kot' },
  orders: { href: '/urypos/orders', label: 'ERP Orders', desk: '/app/pos-invoice' },
  ledger: { href: '/app/stock-ledger-entry', label: 'Stock Ledger', desk: '/app/stock-ledger-entry' },
  recipes: { href: '/app/bom', label: 'ERP BOM / Recipes', desk: '/app/bom' },
  stock: { href: '/app/stock-entry', label: 'ERP Stock Entry', desk: '/app/warehouse' },
  shifts: { href: '/urypos/open-entries', label: 'ERP Open Entries', desk: '/app/pos-opening-entry' },
  accounting: { href: '/app/account', label: 'ERP Accounts', desk: '/app/general-ledger' },
  reports: { href: '/urypos/dashboard', label: 'ERP Dashboard', desk: '/app/query-report' },
  features: { href: '/urypos/dashboard', label: 'ERP POS Home', desk: '/app' },
  admin: { href: '/urypos/settings', label: 'ERP POS Settings', desk: '/app/pos-profile' },
  settings: { href: '/urypos/settings', label: 'ERP POS Settings', desk: '/app/pos-profile' },
};

export const ERP_POS_HOME = '/urypos';

export function erpPosLinkFor(view: string): ErpPosLink {
  return ERP_POS_LINKS[view] || { href: ERP_POS_HOME, label: 'ERP POS' };
}

export function openErpPos(view?: string) {
  const link = view ? erpPosLinkFor(view) : { href: ERP_POS_HOME, label: 'ERP POS' };
  window.location.href = link.href;
}
