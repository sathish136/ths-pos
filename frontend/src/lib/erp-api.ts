/** Frappe / URY API client for THS React POS — every /pos/app panel uses these. */

function csrfToken(): string {
  try {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

async function call<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Frappe-CSRF-Token': csrfToken(),
    },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok || data.exc) {
    const msg = data._error_message || data.message || data.exc || res.statusText;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return (data.message ?? data) as T;
}

export type ErpMenuItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  prices: { 'Dine in': number; Takeaway: number; Delivery: number };
  available: boolean;
  image?: string;
};

export type ErpDayOrder = {
  id: string;
  invoice: string;
  number: string;
  customer?: string;
  table?: string;
  type?: string;
  partySize?: number;
  grand_total?: number;
  status: string;
  docstatus?: number;
  posting_time?: string;
  openedAtMs?: number;
  by?: string;
  items: Array<{ code: string; name: string; qty: number; price: number; amount?: number }>;
};

export type ErpBootstrap = {
  user: string;
  full_name: string;
  roles: string[];
  company: string;
  pos_profile: string;
  menu: ErpMenuItem[];
  tables: Array<{
    id: string;
    name: string;
    seats: number;
    occupied?: boolean;
    zone?: string;
    shape?: string;
    x?: number;
    y?: number;
  }>;
  branches: Array<{ id: string; name: string; code?: string; city?: string; address?: string }>;
  staff?: Array<{ id: string; name: string; email?: string; roleId: string; pin: string; active: boolean }>;
  pins?: Record<string, string>;
  day_orders?: ErpDayOrder[];
  kots?: Array<Record<string, unknown>>;
  shift?: {
    id: string;
    pos_profile?: string;
    opened_at?: string;
    opened_by?: string;
    openingFloat?: number;
    status?: string;
  } | null;
  recipes?: Record<string, Array<{ ingredientId: string; qty: number }>>;
  config?: Record<string, unknown>;
};

export const erpBootstrap = () => call<ErpBootstrap>('ths_pos.api.pos.bootstrap');
export const erpGetMenu = (pos_profile?: string) =>
  call<ErpMenuItem[]>('ths_pos.api.pos.get_menu', { pos_profile });
export const erpGetTables = () => call('ths_pos.api.pos.get_tables');
export const erpSyncOrder = (payload: Record<string, unknown>) =>
  call<{ invoice: string; grand_total: number; status: string }>('ths_pos.api.pos.sync_order', {
    payload,
  });
export const erpPayOrder = (invoice: string, payments: Array<{ mode_of_payment: string; amount: number }>) =>
  call('ths_pos.api.pos.pay_order', { invoice, payments });
export const erpListDayOrders = (date?: string) =>
  call<ErpDayOrder[]>('ths_pos.api.pos.list_day_orders', { date });
export const erpVoidOrder = (invoice: string) => call('ths_pos.api.pos.void_order', { invoice });
export const erpSendKot = (payload: Record<string, unknown>) =>
  call<{ kot: string; invoice: string; status: string }>('ths_pos.api.pos.send_kot', { payload });
export const erpUpdateKotStatus = (kot: string, status: string) =>
  call('ths_pos.api.pos.update_kot_status', { kot, status });
export const erpListKots = (limit?: number) => call('ths_pos.api.pos.list_kots', { limit });
export const erpGetShift = (pos_profile?: string) => call('ths_pos.api.pos.get_shift', { pos_profile });
export const erpOpenShift = (pos_profile?: string, opening_float?: number) =>
  call('ths_pos.api.pos.open_shift', { pos_profile, opening_float });
export const erpCloseShift = (pos_profile?: string, declared_cash?: number) =>
  call('ths_pos.api.pos.close_shift', { pos_profile, declared_cash });
export const erpImportMaster = () => call('ths_pos.api.migrate.import_master_data', { force: 1 });
export const erpSaveMenuItem = (item: Record<string, unknown>) =>
  call('ths_pos.api.admin.save_menu_item', { item });
export const erpSetItemAvailable = (item_code: string, available: number) =>
  call('ths_pos.api.admin.set_item_available', { item_code, available });
export const erpStockLedger = () => call('ths_pos.api.admin.stock_ledger');
export const erpStockBalance = () => call('ths_pos.api.admin.stock_balance');
export const erpReceiveStock = (item_code: string, qty: number, warehouse?: string) =>
  call('ths_pos.api.admin.receive_stock', { item_code, qty, warehouse });
export const erpTransferStock = (
  item_code: string,
  qty: number,
  from_warehouse: string,
  to_warehouse: string,
) => call('ths_pos.api.admin.transfer_stock', { item_code, qty, from_warehouse, to_warehouse });
export const erpWriteOffStock = (item_code: string, qty: number, warehouse?: string, reason?: string) =>
  call('ths_pos.api.admin.write_off_stock', { item_code, qty, warehouse, reason });
export const erpSalesReport = (date?: string) => call('ths_pos.api.admin.sales_report', { date });
export const erpSaveRecipe = (item_code: string, ingredients: unknown[]) =>
  call('ths_pos.api.admin.save_recipe', { item_code, ingredients });
export const erpListRecipes = () =>
  call<Record<string, Array<{ ingredientId: string; qty: number }>>>('ths_pos.api.admin.list_recipes');
export const erpListWarehouses = () => call('ths_pos.api.admin.list_warehouses');
export const erpGetConfig = () => call<Record<string, unknown>>('ths_pos.api.admin.get_config');
export const erpSaveConfig = (config: Record<string, unknown>) =>
  call('ths_pos.api.admin.save_config', { config });
