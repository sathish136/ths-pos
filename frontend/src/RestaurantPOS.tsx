import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair, ArrowRight, Banknote, BarChart3, BookOpen, Boxes, Calculator, Check, CheckCircle2, ChefHat,
  ChevronDown, ClipboardCheck, ClipboardList, Clock3, Combine, CookingPot, CreditCard, Delete, ExternalLink, Leaf, ListChecks, Lock, LogOut, Minus, Package,
  Plus, Printer, Search, Send, Settings, ShoppingBag, SlidersHorizontal, Sparkles,
  Truck, Unlock, Utensils, X,
} from 'lucide-react';
import {
  type MenuItem,
  type ProcessAction,
  type Ticket,
  addOrBumpLine,
  applyLineDelta,
  ticketTotals,
  amountDue,
  unitPrice,
  lineAmount,
  type BillDiscount,
  type CancelledLine,
  canAddItems,
  canEditTicket,
  createEmptyTicket,
  isKitchenQueueStatus,
  primaryActionLabel,
  removeLine,
  reopenForAddons,
  runProcess,
  setLineNotes,
  statusStepIndex,
  ticketStorageKey,
  liveTicketForTable,
  mergeTicketItems,
  moveLineQtyToTable,
  syncTicketSeq,
  currentTicketSeq,
  sanitizeTicket,
  sanitizeOrderLines,
  type DeliveryPayMode,
  type PaymentBreakdown,
  type PaymentMethod,
} from './lib/order-process';
import { mergeSessionBlobs } from './lib/session-merge';
import {
  erpBootstrap,
  erpListDayOrders,
  erpPayOrder,
  erpSaveConfig,
  erpSendKot,
  erpSyncOrder,
  erpUpdateKotStatus,
  erpVoidOrder,
  type ErpDayOrder,
  type ErpMenuItem,
} from './lib/erp-api';
import {
  type DeductionPreview,
  type Ingredient,
  type RecipeBook,
  type StockByStore,
  type StockMove,
  DEFAULT_RECIPES,
  deductForTicket,
  seedStock,
  seedStockByStore,
  storeIdForBranch,
} from './lib/inventory';
import { type RoleId, ROLES, can, defaultViewForRole, isRoleId, roleById, setPermissionOverrides } from './lib/roles';
import { BRANCHES, branchById } from './lib/branches';
import { ERP_POS_HOME, erpPosLinkFor } from './lib/erp-pos-links';
import { seedFeatures, type FeatureItem } from './lib/features';
import { type ShiftRecord } from './lib/shifts';
import {
  clearSession,
  loadSession,
  loadStaffRole,
  loadStaffView,
  nextSessionRev,
  patchSession,
  publishSessionPeers,
  pullSharedSession,
  pushSharedSession,
  reserveTicketNumber,
  saveSession,
  saveStaffRole,
  saveStaffView,
  subscribeSessionPeers,
  type SessionBlob,
} from './lib/session';
import { type SeatTable, clearTable, linkTicket, markBill, markDirty, mergeSeatTables, seedTables } from './lib/seating';
import { SeatingPanel } from './components/pos/SeatingPanel';
import { KitchenPanel } from './components/pos/KitchenPanel';
import { OrdersPanel } from './components/pos/OrdersPanel';
import { LedgerPanel } from './components/pos/LedgerPanel';
import { RecipesPanel } from './components/pos/RecipesPanel';
import { StockPanel } from './components/pos/StockPanel';
import { ReportsPanel, type SaleRecord } from './components/pos/ReportsPanel';
import { ShiftsPanel } from './components/pos/ShiftsPanel';
import { AdminPanel } from './components/pos/AdminPanel';
import {
  DEFAULT_EXTRAS,
  applyMenuOverrides,
  mergeExtras,
  renderNotice,
  staffForPin,
  whereMatches,
  type NotifyTrigger,
  type PosExtras,
  comboLine,
  effectivePin,
  sectionForItem,
  validateComboPick,
} from './lib/extras';
import { BillDiscountControl } from './components/pos/BillDiscountControl';
import { AccountingPanel } from './components/pos/AccountingPanel';
import { FeaturesPanel } from './components/pos/FeaturesPanel';
import { DEFAULT_SETTINGS, SettingsPanel, type PosSettings } from './components/pos/SettingsPanel';

type View =
  | 'seating'
  | 'floor'
  | 'kitchen'
  | 'orders'
  | 'ledger'
  | 'recipes'
  | 'stock'
  | 'reports'
  | 'shifts'
  | 'accounting'
  | 'features'
  | 'settings'
  | 'admin';

const imageBase = `${import.meta.env.BASE_URL}images/ury-restaurant/`;
const BASE_MENU: MenuItem[] = [
  { id: 'toast', name: 'Tomato & ricotta toast', category: 'Small plates', description: 'Whipped ricotta, slow-roasted tomato, basil, grilled sourdough', price: 14, image: `${imageBase}tomato-toast.jpg`, dietaryTags: ['Vegetarian'], available: true },
  { id: 'gnocchi', name: 'Brown butter gnocchi', category: 'Mains', description: 'Crisp potato gnocchi, sage, parmesan, toasted hazelnut', price: 18, image: `${imageBase}gnocchi.jpg`, dietaryTags: ['Vegetarian', 'Contains nuts'], available: true },
  { id: 'salmon', name: 'Crispy-skin salmon', category: 'Mains', description: 'Fennel, charred lemon, dill crème fraîche, baby greens', price: 28, image: `${imageBase}salmon.jpg`, dietaryTags: ['Gluten free'], available: true },
  { id: 'short-rib', name: 'Red wine short rib', category: 'Mains', description: 'Slow-braised beef, whipped potato, market carrots, thyme', price: 31, image: `${imageBase}short-rib.jpg`, dietaryTags: ['Gluten free'], available: true },
  { id: 'schnitzel', name: 'Sunday chicken schnitzel', category: 'Mains', description: 'Panko-crusted chicken, shaved cabbage, parsley, lemon', price: 24, image: `${imageBase}schnitzel.jpg`, dietaryTags: [], available: true },
  { id: 'cake', name: 'Chocolate olive oil cake', category: 'Dessert', description: 'Dark chocolate, crème fraîche, seasonal berries', price: 12, image: `${imageBase}chocolate-cake.jpg`, dietaryTags: ['Vegetarian'], available: true },
];
const categories = ['All dishes', 'Small plates', 'Mains', 'Dessert'];
const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const PROCESS_STEPS = ['Open', 'Kitchen', 'Prep', 'Ready', 'Served', 'Paid'] as const;
const qtyLabel = (n: number, unit: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(n < 1 ? 3 : 2)} ${unit}`;

function freshTicket(numberOverride?: number): Ticket {
  return createEmptyTicket('Dine in', 'Table 12', 2, '', numberOverride);
}

function readSaved<T>(key: keyof import('./lib/session').SessionBlob, fallback: T): T {
  const s = loadSession();
  if (!s || s[key] === undefined || s[key] === null) return fallback;
  return s[key] as T;
}

function sanitizeTicketMap(book: Record<string, Ticket>): Record<string, Ticket> {
  const next: Record<string, Ticket> = {};
  for (const [k, t] of Object.entries(book || {})) {
    if (!t || typeof t !== 'object' || !t.id) continue;
    next[k] = sanitizeTicket(t);
  }
  return next;
}

function sanitizeTicketList(list: Ticket[]): Ticket[] {
  return (list || [])
    .filter((t) => t && typeof t === 'object' && t.id)
    .map((t) => sanitizeTicket(t));
}

function mapErpOrderType(raw?: string): Ticket['type'] {
  const v = (raw || '').toLowerCase();
  if (v.includes('take')) return 'Takeaway';
  if (v.includes('deliv')) return 'Delivery';
  return 'Dine in';
}

function mapErpOrderStatus(raw?: string): Ticket['status'] {
  const v = (raw || '').toLowerCase();
  if (v === 'paid' || v.includes('paid')) return 'Paid';
  if (v.includes('serv')) return 'Served';
  if (v.includes('ready')) return 'Ready';
  if (v.includes('prep')) return 'Preparing';
  if (v.includes('sent') || v.includes('kitchen')) return 'Sent to kitchen';
  return 'Open';
}

/** Map ERP day-order rows into React Ticket shape for Orders / Floor. */
function erpDayOrderToTicket(o: ErpDayOrder): Ticket {
  const type = mapErpOrderType(o.type);
  const status = mapErpOrderStatus(o.status);
  const openedAtMs = o.openedAtMs || Date.now();
  return {
    id: o.id,
    number: o.number || o.invoice || o.id,
    type,
    table: o.table || (type === 'Dine in' ? '—' : type),
    partySize: o.partySize || 0,
    status,
    openedAt: o.posting_time || new Date(openedAtMs).toLocaleString(),
    openedAtMs,
    paidAt: status === 'Paid' ? o.posting_time : undefined,
    customerName: o.customer,
    captain: o.by,
    items: (o.items || []).map((line, idx) => ({
      id: `${o.id}-${idx}`,
      menuItem: {
        id: line.code,
        name: line.name || line.code,
        category: 'Mains',
        description: '',
        price: line.price || 0,
        image: '',
        dietaryTags: [],
        available: true,
      },
      quantity: line.qty || 1,
      notes: '',
    })),
  };
}

export default function RestaurantPOS() {
  const [roleId, setRoleId] = useState<RoleId | null>(() => {
    const saved = loadStaffRole();
    return isRoleId(saved) ? saved : null;
  });
  const [loginPick, setLoginPick] = useState<RoleId | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [view, setView] = useState<View>(() => {
    const savedRole = loadStaffRole();
    const savedView = loadStaffView();
    if (savedView === 'seating' || savedView === 'floor' || savedView === 'kitchen' || savedView === 'orders' ||
        savedView === 'stock' || savedView === 'recipes' || savedView === 'shifts' || savedView === 'reports' ||
        savedView === 'accounting' || savedView === 'features' || savedView === 'settings') {
      return savedView;
    }
    return isRoleId(savedRole) ? (defaultViewForRole(savedRole) as View) : 'seating';
  });
  const [category, setCategory] = useState('All dishes');
  const [query, setQuery] = useState('');
  // No auto-seeded orders — kitchen / orders stay empty until staff create them.
  const [ticketBook, setTicketBook] = useState<Record<string, Ticket>>(() =>
    sanitizeTicketMap(readSaved('ticketBook', {})),
  );
  const [dayOrders, setDayOrders] = useState<Ticket[]>(() =>
    sanitizeTicketList(readSaved('dayOrders', [])),
  );
  const [ticket, setTicketState] = useState<Ticket>(() =>
    sanitizeTicket(readSaved('ticket', freshTicket())),
  );
  /** Expo board keyed by ticket id — only send/prep/ready touch this; New ticket cannot wipe it. */
  const [kitchenBoard, setKitchenBoard] = useState<Record<string, Ticket>>(() => {
    const saved = sanitizeTicketMap(readSaved('kitchenBoard', {}));
    if (Object.keys(saved).length) return saved;
    // Migrate: seed from existing book / day orders still in kitchen
    const seed: Record<string, Ticket> = {};
    const book = sanitizeTicketMap(readSaved('ticketBook', {}));
    const days = sanitizeTicketList(readSaved('dayOrders', []));
    for (const t of [...Object.values(book), ...days]) {
      if (isKitchenQueueStatus(t.status) && t.items.length > 0) seed[t.id] = t;
    }
    return seed;
  });
  const [guestPrint, setGuestPrint] = useState<(Ticket & { total: number }) | null>(null);
  const [reprintSale, setReprintSale] = useState<SaleRecord | null>(null);
  const [extras, setExtras] = useState<PosExtras>(() => mergeExtras(readSaved('extras', DEFAULT_EXTRAS)));
  // Manager-edited permissions apply to every can() check on this device.
  setPermissionOverrides(extras.permOverrides);
  const [erpMenu, setErpMenu] = useState<MenuItem[] | null>(null);
  const [erpMeta, setErpMeta] = useState<{ company?: string; pos_profile?: string; user?: string }>({});
  const [erpBranches, setErpBranches] = useState<typeof BRANCHES | null>(null);
  const invoiceByTicket = useRef<Record<string, string>>({});
  const kotByTicket = useRef<Record<string, string>>({});
  /** Menu with manager availability and per-sales-type prices applied */
  const menuBase = erpMenu && erpMenu.length ? erpMenu : BASE_MENU;
  const menu = useMemo(() => applyMenuOverrides(menuBase, extras.menuOverrides), [menuBase, extras.menuOverrides]);
  const branches = erpBranches && erpBranches.length ? erpBranches : BRANCHES;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await erpBootstrap();
        if (cancelled) return;
        setErpMeta({ company: boot.company, pos_profile: boot.pos_profile, user: boot.user });
        if (boot.menu?.length) {
          const mapped: MenuItem[] = boot.menu.map((m: ErpMenuItem) => ({
            id: m.id || m.code,
            name: m.name,
            category: m.category || 'Mains',
            description: m.category || '',
            price: m.price || m.prices?.['Dine in'] || 0,
            prices: {
              'Dine in': m.prices?.['Dine in'] ?? m.price ?? 0,
              Takeaway: m.prices?.Takeaway ?? m.price ?? 0,
              Delivery: m.prices?.Delivery ?? m.price ?? 0,
            },
            image: m.image || `${imageBase}tomato-toast.jpg`,
            dietaryTags: [],
            available: m.available !== false,
          }));
          setErpMenu(mapped);
        }
        if (boot.branches?.length) {
          setErpBranches(
            boot.branches.map((b) => ({
              id: b.id,
              name: b.name,
              code: b.code || b.id.slice(0, 4).toUpperCase(),
              city: b.city || '',
              address: b.address || '',
            })),
          );
        }
        if (boot.tables?.length) {
          setTables((prev) => {
            const byName = new Map(prev.map((t) => [t.name, t]));
            const byId = new Map(prev.map((t) => [t.id, t]));
            return boot.tables.map((t, i) => {
              const existing = byName.get(t.name) || byId.get(t.id);
              const zone = (t.zone === 'Patio' || t.zone === 'Bar' || t.zone === 'Window' || t.zone === 'Main'
                ? t.zone
                : existing?.zone || 'Main') as SeatTable['zone'];
              const shape = (t.shape === 'round' || t.shape === 'square' || t.shape === 'rect' || t.shape === 'bar'
                ? t.shape
                : existing?.shape || 'square') as SeatTable['shape'];
              return {
                id: t.id,
                name: t.name,
                zone,
                seats: t.seats || existing?.seats || 2,
                shape,
                x: t.x ?? existing?.x ?? 14 + (i % 4) * 18,
                y: t.y ?? existing?.y ?? 18 + Math.floor(i / 4) * 22,
                status: existing?.status || 'free',
                ticketNumber: existing?.ticketNumber,
              } satisfies SeatTable;
            });
          });
        }
        // Restore PIN pad + named staff from ERP (React demo data)
        if (boot.pins || boot.staff?.length) {
          setExtras((ex) => ({
            ...ex,
            pinOverrides: { ...ex.pinOverrides, ...(boot.pins || {}) },
            staff: boot.staff?.length
              ? boot.staff.map((s) => ({
                  id: s.id,
                  name: s.name,
                  roleId: s.roleId as typeof ROLES[number]['id'],
                  pin: s.pin,
                  active: s.active !== false,
                }))
              : ex.staff,
          }));
        }
        // Config from Admin/Settings saved on ERP
        const cfg = boot.config || {};
        if (cfg.settings && typeof cfg.settings === 'object') {
          setSettings((s) => ({ ...s, ...(cfg.settings as PosSettings) }));
        }
        if (Array.isArray(cfg.features)) setFeatures(cfg.features as FeatureItem[]);
        if (cfg.extras && typeof cfg.extras === 'object') {
          setExtras((ex) => mergeExtras({ ...ex, ...(cfg.extras as PosExtras) }));
        }
        if (boot.recipes && Object.keys(boot.recipes).length) {
          setRecipes((prev) => ({ ...prev, ...boot.recipes }));
        }
        if (boot.shift && boot.shift.status === 'open') {
          setShift({
            id: boot.shift.id,
            status: 'open',
            openedAt: boot.shift.opened_at || new Date().toISOString(),
            openedBy: boot.shift.opened_by || boot.full_name || 'ERP',
            openingFloat: boot.shift.openingFloat ?? 0,
          });
        }
        if (boot.day_orders?.length) {
          const mapped = boot.day_orders.map(erpDayOrderToTicket);
          setDayOrders((prev) => {
            const byId = new Map(prev.map((t) => [t.id, t]));
            for (const t of mapped) byId.set(t.id, { ...byId.get(t.id), ...t } as Ticket);
            return Array.from(byId.values()).sort((a, b) => (b.openedAtMs || 0) - (a.openedAtMs || 0));
          });
          for (const o of boot.day_orders) {
            if (o.invoice) invoiceByTicket.current[o.id] = o.invoice;
          }
        }
        if (boot.full_name) setOperator((op) => op || boot.full_name);
      } catch (err) {
        console.warn('ERP bootstrap failed — using local demo menu', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persist Admin / Settings / Features / floor to ERP so every option is ERP-backed. */
  function persistErpConfig(patch: Record<string, unknown>) {
    void erpSaveConfig(patch).catch((err) => console.warn('ERP save_config', err));
  }

  function saveExtrasToErp(next: PosExtras) {
    setExtras(next);
    persistErpConfig({
      extras: next,
      pins: next.pinOverrides,
      staff: next.staff,
      kitchen: { sections: next.kitchenSections, combos: next.combos },
    });
  }

  function saveSettingsToErp(next: PosSettings) {
    setSettings(next);
    persistErpConfig({ settings: next });
  }

  function saveFeaturesToErp(next: FeatureItem[]) {
    setFeatures(next);
    persistErpConfig({ features: next });
  }

  function saveTablesToErp(next: SeatTable[]) {
    setTables(next);
    persistErpConfig({
      tables: next.map((t) => ({
        id: t.id,
        name: t.name,
        zone: t.zone,
        seats: t.seats,
        shape: t.shape,
        x: t.x,
        y: t.y,
      })),
    });
  }

  /** Named staff member signed in (ticket captain / report name). Falls back to the role label. */
  const [operator, setOperator] = useState<string>(() => {
    try {
      return window.localStorage.getItem('ury-staff-name') ?? '';
    } catch {
      return '';
    }
  });
  const [dismissedNotices, setDismissedNotices] = useState<string[]>([]);
  /** Notices from the shared inbox that this screen should show */
  const notices = useMemo(
    () =>
      extras.inbox
        .filter((n) => whereMatches(n.where, roleId) && !dismissedNotices.includes(n.id) && Date.now() - n.atMs < 10 * 60_000)
        .slice(0, 4),
    [extras.inbox, roleId, dismissedNotices],
  );
  const noticeSeq = useRef(0);
  const [taxInvoice, setTaxInvoice] = useState<null | {
    ticket: Ticket;
    customerName: string;
    taxId: string;
    issuedAt: string;
  }>(null);
  const [printKitchenOnSend, setPrintKitchenOnSend] = useState(true);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Card');
  const [cashTendered, setCashTendered] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [moveDishId, setMoveDishId] = useState('');
  const [moveQty, setMoveQty] = useState('1');
  const [moveToTable, setMoveToTable] = useState('');
  const [moveNewTable, setMoveNewTable] = useState('');
  const [receipt, setReceipt] = useState<(Ticket & { total: number }) | null>(null);
  const [notice, setNotice] = useState('');
  const [stockByStore, setStockByStore] = useState<StockByStore>(() =>
    readSaved('stockByStore', seedStockByStore()),
  );
  const [activeStoreId, setActiveStoreId] = useState(() =>
    readSaved('activeStoreId', storeIdForBranch(readSaved('branchId', 'main'))),
  );
  const [stock, setStock] = useState<Ingredient[]>(() => {
    const byStore = readSaved<StockByStore>('stockByStore', seedStockByStore());
    const storeId = readSaved('activeStoreId', storeIdForBranch(readSaved('branchId', 'main')));
    return byStore[storeId] ?? readSaved('stock', seedStock());
  });
  const [recipes, setRecipes] = useState<RecipeBook>(() => readSaved('recipes', structuredClone(DEFAULT_RECIPES)));
  const [moves, setMoves] = useState<StockMove[]>(() => readSaved('moves', []));
  const [ledgerHighlight, setLedgerHighlight] = useState<string[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>(() => readSaved('sales', []));
  const [tables, setTables] = useState<SeatTable[]>(() => readSaved('tables', seedTables()));
  const [settings, setSettings] = useState<PosSettings>(() => readSaved('settings', DEFAULT_SETTINGS));
  const [branchId, setBranchId] = useState(() => readSaved('branchId', 'main'));
  const [shift, setShift] = useState<ShiftRecord | null>(() => readSaved('shift', null));
  const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>(() => readSaved('shiftHistory', []));
  const [features, setFeatures] = useState<FeatureItem[]>(() => readSaved('features', seedFeatures()));
  const [deductionModal, setDeductionModal] = useState<DeductionPreview[] | null>(null);
  const [kitchenPrint, setKitchenPrint] = useState<Ticket | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Only clear stored open shift when Manager taps Close (not on role switch / stale renders). */
  const shiftClearIntentRef = useRef(false);
  const kitchenBoardRef = useRef(kitchenBoard);
  kitchenBoardRef.current = kitchenBoard;
  const sharedRef = useRef({
    ticketBook,
    dayOrders,
    kitchenBoard,
    sales,
    moves,
    tables,
    stock,
    stockByStore,
    activeStoreId,
    recipes,
    shift,
    shiftHistory,
    branchId,
    settings,
    features,
    extras,
  });
  sharedRef.current = {
    ticketBook,
    dayOrders,
    kitchenBoard,
    sales,
    moves,
    tables,
    stock,
    stockByStore,
    activeStoreId,
    recipes,
    shift,
    shiftHistory,
    branchId,
    settings,
    features,
    extras,
  };
  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const lastAppliedRevRef = useRef(Number(loadSession()?.rev ?? 0));
  const suppressPersistRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? branchById(branchId);

  function localSharedSnapshot(): SessionBlob {
    return {
      ...sharedRef.current,
      rev: lastAppliedRevRef.current,
      origin: tabIdRef.current,
    };
  }

  /** Apply shared station state from another tab/device (keep local draft ticket + role UI). */
  function applySharedSession(blob: SessionBlob, source: 'peer' | 'server') {
    if (blob.origin && blob.origin === tabIdRef.current && source === 'peer') {
      const revOnly = Number(blob.rev ?? 0);
      if (revOnly > lastAppliedRevRef.current) lastAppliedRevRef.current = revOnly;
      return;
    }
    // Merge with local so a stale peer cannot revive Paid tickets / closed shift / bill ghosts.
    const merged = mergeSessionBlobs(localSharedSnapshot(), blob) as SessionBlob;
    const rev = Number(merged.rev ?? 0);
    if (!rev) return;
    // Always accept server merges (content may improve at same/higher rev). Peers need newer rev.
    if (source === 'peer' && rev < lastAppliedRevRef.current) return;
    if (source === 'peer' && rev === lastAppliedRevRef.current && blob.origin === tabIdRef.current) return;

    lastAppliedRevRef.current = Math.max(lastAppliedRevRef.current, rev);
    suppressPersistRef.current = true;

    if (typeof merged.ticketSeq === 'number') syncTicketSeq([merged.ticketSeq]);
    if (merged.ticketBook && typeof merged.ticketBook === 'object') {
      const book = sanitizeTicketMap(merged.ticketBook as Record<string, Ticket>);
      setTicketBook(book);
      syncTicketSeq([
        merged.ticketSeq,
        ...Object.values(book),
        ...sanitizeTicketList((merged.dayOrders as Ticket[]) ?? []),
      ]);
    }
    if (Array.isArray(merged.dayOrders)) setDayOrders(sanitizeTicketList(merged.dayOrders as Ticket[]));
    if (merged.kitchenBoard && typeof merged.kitchenBoard === 'object') {
      setKitchenBoard(sanitizeTicketMap(merged.kitchenBoard as Record<string, Ticket>));
    } else {
      setKitchenBoard({});
    }
    if (Array.isArray(merged.sales)) setSales(merged.sales as SaleRecord[]);
    if (Array.isArray(merged.moves)) setMoves(merged.moves as StockMove[]);
    if (Array.isArray(merged.tables)) setTables(merged.tables as SeatTable[]);
    if (Array.isArray(merged.stock)) setStock(merged.stock as Ingredient[]);
    if (merged.stockByStore && typeof merged.stockByStore === 'object') {
      setStockByStore(merged.stockByStore as StockByStore);
    }
    if (typeof merged.activeStoreId === 'string') setActiveStoreId(merged.activeStoreId);
    if (merged.recipes && typeof merged.recipes === 'object') setRecipes(merged.recipes as RecipeBook);
    if (merged.shift === null || (merged.shift && typeof merged.shift === 'object')) {
      const nextShift = merged.shift as ShiftRecord | null;
      shiftClearIntentRef.current = nextShift == null;
      setShift(nextShift);
    }
    if (Array.isArray(merged.shiftHistory)) setShiftHistory(merged.shiftHistory as ShiftRecord[]);
    if (typeof merged.branchId === 'string') setBranchId(merged.branchId);
    if (merged.settings && typeof merged.settings === 'object') setSettings(merged.settings as PosSettings);
    if (Array.isArray(merged.features)) setFeatures(merged.features as FeatureItem[]);
    if (merged.extras && typeof merged.extras === 'object') setExtras(mergeExtras(merged.extras));

    const prev = loadSession() ?? {};
    saveSession({
      ...prev,
      ...merged,
      ticket: prev.ticket ?? ticket,
      rev: lastAppliedRevRef.current,
      origin: merged.origin ?? tabIdRef.current,
    });
  }

  // Persist day state. Never let a stale null wipe an open shift in storage.
  useEffect(() => {
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false;
      return;
    }
    const prev = loadSession() ?? {};
    let shiftOut: ShiftRecord | null | unknown = shift;
    if (
      shiftOut == null &&
      !shiftClearIntentRef.current &&
      prev.shift &&
      typeof prev.shift === 'object' &&
      (prev.shift as ShiftRecord).status === 'open'
    ) {
      shiftOut = prev.shift;
      setShift(prev.shift as ShiftRecord);
    }
    // Before first server pull, only mirror to localStorage — don't overwrite peers.
    const seqFloor = Math.max(
      currentTicketSeq(),
      Number(prev.ticketSeq ?? 0) || 0,
    );
    if (!syncReady) {
      saveSession({
        ...prev,
        ticketBook,
        dayOrders,
        ticket,
        kitchenBoard,
        sales,
        moves,
        tables,
        stock,
        stockByStore,
        activeStoreId,
        recipes,
        shift: shiftOut,
        shiftHistory,
        branchId,
        settings,
        features,
        extras,
        ticketSeq: seqFloor,
        rev: lastAppliedRevRef.current || Number(prev.rev ?? 0),
        origin: tabIdRef.current,
      });
      return;
    }
    const rev = nextSessionRev(Math.max(Number(prev.rev ?? 0), lastAppliedRevRef.current));
    lastAppliedRevRef.current = rev;
    const blob: SessionBlob = {
      ...prev,
      ticketBook,
      dayOrders,
      ticket,
      kitchenBoard,
      sales,
      moves,
      tables,
      stock,
      stockByStore,
      activeStoreId,
      recipes,
      shift: shiftOut,
      shiftHistory,
      branchId,
      settings,
      features,
      extras,
      ticketSeq: seqFloor,
      rev,
      origin: tabIdRef.current,
    };
    saveSession(blob);
    publishSessionPeers(blob);
    if (pushTimerRef.current != null) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const saved = await pushSharedSession(blob);
        // Server merge may drop stale kitchen cards another tablet tried to revive.
        if (saved) applySharedSession(saved, 'server');
      })();
    }, 250);
  }, [ticketBook, dayOrders, ticket, kitchenBoard, sales, moves, tables, stock, stockByStore, activeStoreId, recipes, shift, shiftHistory, branchId, settings, features, extras, syncReady]);

  // Unique ticket numbers across devices / refreshes.
  useEffect(() => {
    syncTicketSeq([...Object.values(ticketBook), ...dayOrders, ticket]);
  }, [ticketBook, dayOrders, ticket]);

  // Keep staff role screen across browser reload (logout still clears it).
  useEffect(() => {
    if (roleId) saveStaffView(view);
  }, [view, roleId]);

  // Same browser windows (screen extension) + other devices on this demo host.
  useEffect(() => {
    const stopPeers = subscribeSessionPeers((blob) => applySharedSession(blob, 'peer'));
    let cancelled = false;
    const pull = async () => {
      const remote = await pullSharedSession();
      if (cancelled || !remote) return;
      applySharedSession(remote, 'server');
    };
    void (async () => {
      await pull();
      if (!cancelled) setSyncReady(true);
    })();
    const poll = window.setInterval(() => {
      void pull();
    }, 1200);
    return () => {
      cancelled = true;
      stopPeers();
      window.clearInterval(poll);
      if (pushTimerRef.current != null) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

  /** Always write shift immediately — role switch must not lose an open shift. */
  function commitShift(next: ShiftRecord | null) {
    shiftClearIntentRef.current = next == null;
    setShift(next);
    const rev = nextSessionRev(lastAppliedRevRef.current);
    lastAppliedRevRef.current = rev;
    const blob: SessionBlob = {
      ...(loadSession() ?? {}),
      ticketBook,
      dayOrders,
      ticket,
      kitchenBoard,
      sales,
      moves,
      tables,
      stock,
      stockByStore,
      activeStoreId,
      recipes,
      shift: next,
      shiftHistory,
      branchId,
      settings,
      features,
      extras,
      rev,
      origin: tabIdRef.current,
    };
    saveSession(blob);
    publishSessionPeers(blob);
    // Push open/close to all tablets immediately (don't wait for debounced persist).
    void pushSharedSession(blob).then((saved) => {
      if (saved) applySharedSession(saved, 'server');
    });
  }

  function commitShiftHistory(next: ShiftRecord[]) {
    setShiftHistory(next);
    patchSession({ shiftHistory: next });
  }

  /** Close shift — clear floor + KDS, keep today's orders list (Paid + unfinished) for reports. */
  function commitCloseShift(closed: ShiftRecord) {
    notifyTrigger('shift_closed');
    shiftClearIntentRef.current = true;
    const nextHistory = [closed, ...shiftHistory].slice(0, 20);
    const clearedTables = seedTables();
    const emptyTicket = freshTicket();
    const rev = nextSessionRev(lastAppliedRevRef.current);
    lastAppliedRevRef.current = rev;

    setShiftHistory(nextHistory);
    setShift(null);
    setKitchenBoard({});
    setTables(clearedTables);
    setTicketState(emptyTicket);
    // Keep ticketBook / dayOrders — do not wipe Orders after close.

    const blob: SessionBlob = {
      ...(loadSession() ?? {}),
      shift: null,
      shiftHistory: nextHistory,
      kitchenBoard: {},
      tables: clearedTables,
      ticketBook,
      dayOrders,
      ticket: emptyTicket,
      rev,
      origin: tabIdRef.current,
    };
    saveSession(blob);
    publishSessionPeers(blob);
    void pushSharedSession(blob);
    flash('Shift closed · kitchen & floor cleared · orders kept');
  }

  function resetDemoDay() {
    shiftClearIntentRef.current = true;
    clearSession();
    const empty = freshTicket();
    setTicketBook({});
    setDayOrders([]);
    setKitchenBoard({});
    setTicketState(empty);
    setSales([]);
    setMoves([]);
    setTables(seedTables());
    const freshStores = seedStockByStore();
    setStockByStore(freshStores);
    setActiveStoreId('store1');
    setStock(freshStores.store1);
    setRecipes(structuredClone(DEFAULT_RECIPES));
    setShift(null);
    setShiftHistory([]);
    setLedgerHighlight([]);
    setReceipt(null);
    setDeductionModal(null);
    setKitchenPrint(null);
    setGuestPrint(null);
    flash('Demo day reset — no orders, shift closed');
  }

  function syncTicketSideState(resolved: Ticket) {
    const key = ticketStorageKey(resolved);
    setTicketBook((book) => {
      const updated: Record<string, Ticket> = { ...book, [key]: resolved };
      // Drop legacy table:* keys for this same ticket id (migration from older demos).
      for (const [k, v] of Object.entries(updated)) {
        if (k.startsWith('table:') && v.id === resolved.id && k !== key) {
          delete updated[k];
        }
      }
      // Never let an Open draft erase another id that is still on the expo board.
      for (const [id, kt] of Object.entries(kitchenBoardRef.current)) {
        if (id === resolved.id) continue;
        const k = ticketStorageKey(kt);
        if (!updated[k] || !isKitchenQueueStatus(updated[k].status)) {
          updated[k] = kt;
        }
      }
      return updated;
    });
    if (resolved.items.length > 0) {
      setDayOrders((prevOrders) => {
        const i = prevOrders.findIndex((t) => t.id === resolved.id);
        if (i >= 0) {
          const nextOrders = [...prevOrders];
          nextOrders[i] = resolved;
          return nextOrders;
        }
        return [resolved, ...prevOrders];
      });
    }
  }

  function isKitchenFinished(t: Ticket) {
    return (
      t.status === 'Paid' ||
      t.status === 'Served' ||
      (t.status === 'Open' && Boolean(t.kitchenRejectReason))
    );
  }

  /** Put / update / clear a ticket on the dedicated kitchen expo board. */
  function upsertKitchenBoard(next: Ticket) {
    setKitchenBoard((board) => {
      if (isKitchenQueueStatus(next.status) && next.items.length > 0) {
        return { ...board, [next.id]: next };
      }
      // Drop when paid / served / rejected — never leave a closed invoice on KDS.
      if (isKitchenFinished(next)) {
        if (!board[next.id]) return board;
        const copy = { ...board };
        delete copy[next.id];
        return copy;
      }
      if (next.status === 'Open' && board[next.id]) {
        // New empty / draft Open with same id shouldn't wipe a live kitchen card.
        return board;
      }
      return board;
    });
  }

  /** Rebuild expo board from live sources only — paid/served tickets must not stick. */
  function rebuildKitchenBoard(
    book: Record<string, Ticket> = ticketBook,
    days: Ticket[] = dayOrders,
    active: Ticket = ticket,
  ) {
    if (shift?.status !== 'open') {
      setKitchenBoard((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    const shiftStart = shift.openedAtMs ?? 0;
    setKitchenBoard((prev) => {
      const next: Record<string, Ticket> = {};
      const finished = new Set<string>();
      const rank: Record<string, number> = {
        'Sent to kitchen': 1,
        Preparing: 2,
        Ready: 3,
      };
      const note = (t: Ticket) => {
        if (isKitchenFinished(t)) finished.add(t.id);
      };
      const consider = (t: Ticket) => {
        note(t);
        if (finished.has(t.id)) return;
        if (shiftStart && (t.openedAtMs ?? 0) < shiftStart) return;
        if (!isKitchenQueueStatus(t.status) || t.items.length === 0) return;
        const cur = next[t.id];
        if (!cur || (rank[t.status] ?? 0) >= (rank[cur.status] ?? 0)) {
          next[t.id] = t;
        }
      };
      for (const t of Object.values(book)) consider(t);
      for (const t of days) consider(t);
      consider(active);
      // Drop anything known finished even if an older kitchen copy was still on the board.
      for (const id of finished) delete next[id];

      const prevIds = Object.keys(prev);
      const nextIds = Object.keys(next);
      if (prevIds.length === nextIds.length && nextIds.every((id) => prev[id] === next[id])) {
        return prev;
      }
      return next;
    });
  }

  function setTicket(next: Ticket | ((prev: Ticket) => Ticket)) {
    setTicketState((prev) => (typeof next === 'function' ? next(prev) : next));
  }

  // Keep book + dayOrders aligned with the active ticket (no microtask lag).
  useEffect(() => {
    syncTicketSideState(ticket);
  }, [ticket]);

  // Keep expo board in sync whenever tickets change — Kitchen must update without re-login.
  // While shift is closed, KDS stays empty (orders list still keeps history).
  useEffect(() => {
    if (shift?.status !== 'open') {
      setKitchenBoard((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    rebuildKitchenBoard(ticketBook, dayOrders, ticket);
  }, [ticketBook, dayOrders, ticket, shift]);

  // Opening Kitchen tab always refreshes from current sources.
  useEffect(() => {
    if (view === 'kitchen' && shift?.status === 'open') rebuildKitchenBoard();
  }, [view, shift]);

  // Orders tab pulls live POS Invoice list from ERP
  useEffect(() => {
    if (view !== 'orders') return;
    let cancelled = false;
    void erpListDayOrders()
      .then((rows) => {
        if (cancelled || !rows?.length) return;
        const mapped = rows.map(erpDayOrderToTicket);
        setDayOrders((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          for (const t of mapped) byId.set(t.id, { ...byId.get(t.id), ...t } as Ticket);
          return Array.from(byId.values()).sort((a, b) => (b.openedAtMs || 0) - (a.openedAtMs || 0));
        });
        for (const o of rows) {
          if (o.invoice) invoiceByTicket.current[o.id] = o.invoice;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view]);

  /** Fire enabled notification rules for an event (banner stack, auto-dismiss). */
  function navLabel(id: string, fallback: string): string {
    const fromNav = extras.navButtons.find((b) => b.id === id)?.label?.trim();
    return fromNav || extras.labels[id]?.trim() || fallback;
  }

  function navVisible(id: string): boolean {
    const b = extras.navButtons.find((x) => x.id === id);
    return b ? b.visible : true;
  }

  const navOrder = (extras.navButtons.length
    ? extras.navButtons.map((b) => b.id)
    : ['seating', 'floor', 'kitchen', 'orders', 'ledger', 'recipes', 'stock', 'shifts', 'accounting', 'reports', 'features', 'admin', 'settings']);


  /** Fire the matching admin notification rules into the shared inbox (every device sees them). */
  function notifyTrigger(trigger: NotifyTrigger, data: Record<string, string | number | undefined> = {}) {
    const rules = extras.notifications.filter((r) => {
      if (!r.enabled || r.trigger !== trigger) return false;
      if (r.threshold && r.threshold > 0 && (trigger === 'discount_applied' || trigger === 'large_sale')) {
        const v = Number(trigger === 'large_sale' ? data.amount : data.value);
        if (!(v >= r.threshold)) return false;
      }
      return true;
    });
    if (!rules.length) return;
    const atMs = Date.now();
    const by = operator || role?.label || '';
    setExtras((prev) => ({
      ...prev,
      inbox: [
        ...rules.map((r) => ({
          id: `${atMs}-${r.id}-${Math.random().toString(36).slice(2, 6)}`,
          atMs,
          where: r.where ?? 'all',
          text: renderNotice(r.message, { by, ...data }),
        })),
        ...prev.inbox,
      ].slice(0, 40),
    }));
  }

  // Presence heartbeat so other stations can see open cashier sessions (close-shift check)
  useEffect(() => {
    if (!roleId) return;
    const beat = () =>
      setExtras((prev) => {
        const now = Date.now();
        const presence = { ...prev.presence, [tabIdRef.current]: { role: roleId, at: now } };
        for (const k of Object.keys(presence)) if (now - presence[k].at > 5 * 60_000) delete presence[k];
        return { ...prev, presence };
      });
    beat();
    const id = window.setInterval(beat, 30_000);
    return () => window.clearInterval(id);
  }, [roleId]);

  /** Write a ticket into book + dayOrders (+ kitchen board when relevant). */
  function commitTicket(next: Ticket, opts?: { activate?: boolean }) {
    syncTicketSideState(next);
    upsertKitchenBoard(next);
    if (isKitchenQueueStatus(next.status) && next.items.length > 0) {
      // Immediate board write (don't wait for effect) so Kitchen tab updates instantly.
      setKitchenBoard((board) => ({ ...board, [next.id]: next }));
    } else if (isKitchenFinished(next)) {
      // Immediate drop so invoice close never leaves a ghost KDS card.
      setKitchenBoard((board) => {
        if (!board[next.id]) return board;
        const copy = { ...board };
        delete copy[next.id];
        return copy;
      });
    }
    if (opts?.activate || next.id === ticket.id) {
      setTicketState(next);
    }
  }

  function openKitchenPrint(t: Ticket) {
    setKitchenPrint(t);
    setGuestPrint(null);
    flash('Kitchen print — confirm in dialog');
    window.setTimeout(() => window.print(), 250);
  }

  function openGuestPrint(t: Ticket) {
    const totals = ticketTotals(t);
    setKitchenPrint(null);
    setGuestPrint({ ...t, total: totals.total });
    flash('Guest order print');
    window.setTimeout(() => window.print(), 250);
  }

  /** Tax invoice — Cashier or Manager. Asks for optional customer name / tax ID. */
  function openTaxInvoice(t: Ticket) {
    if (!role || !can(role.id, 'invoice.tax')) {
      flash('Cashier or Manager issues tax invoice');
      return;
    }
    if (!t.items.length) {
      flash('Add items before tax invoice');
      return;
    }
    const customerName = (window.prompt('Customer name (optional)', t.customerName ?? '') ?? '').trim();
    const taxId = (window.prompt('Customer tax ID (optional)', '') ?? '').trim();
    setKitchenPrint(null);
    setGuestPrint(null);
    setTaxInvoice({ ticket: t, customerName, taxId, issuedAt: new Date().toLocaleString('en-US') });
    flash('Tax invoice ready');
    window.setTimeout(() => window.print(), 250);
  }

  /** Set or clear the bill-level discount on the open ticket. Manager only. */
  function applyBillDiscount(next?: BillDiscount) {
    if (!role || !can(role.id, 'order.discount')) {
      flash('Manager only — discounts');
      return;
    }
    if (ticket.status === 'Paid') {
      flash('Ticket already paid');
      return;
    }
    commitTicket({ ...ticket, discount: next ? { ...next, by: role.label } : undefined }, { activate: true });
    flash(next ? `Discount applied · ${next.reason}` : 'Discount removed');
    if (next) notifyTrigger('discount_applied', { value: next.kind === 'percent' ? next.value : undefined, ticket: ticket.number, by: operator || role.label });
  }

  const role = roleId ? roleById(roleId) : null;
  const { type, table, partySize, items, status } = ticket;
  const shiftOpen = shift?.status === 'open';
  const canTakeOrders = !!role && can(role.id, 'order.take') && shiftOpen;
  const canAdd = canTakeOrders && canAddItems(status);
  const editable = canTakeOrders && canEditTicket(status);
  const comboTiles = useMemo<MenuItem[]>(
    () =>
      extras.combos.map((c) => ({
        id: `combo-def:${c.id}`,
        name: c.name,
        category: 'Combos',
        description: c.groups.map((g) => g.label).join(' + '),
        price: c.price,
        image: menu[0].image,
        dietaryTags: [],
        available: true,
      })),
    [extras.combos],
  );
  const visibleMenu = useMemo(() => [...menu, ...comboTiles].filter((dish) => {
    const inCategory = category === 'All dishes' || dish.category === category;
    const terms = `${dish.name} ${dish.category} ${dish.description} ${dish.dietaryTags.join(' ')}`.toLowerCase();
    return inCategory && terms.includes(query.trim().toLowerCase());
  }), [category, query, comboTiles]);
  const { subtotal, discount: discountAmt, tax, total, itemCount } = ticketTotals(ticket);
  const primary = useMemo(() => {
    const base = primaryActionLabel(ticket);
    if (!base || !roleId) return null;
    const need: Partial<Record<ProcessAction, Parameters<typeof can>[1]>> = {
      send_to_kitchen: 'order.send_kitchen',
      start_preparing: 'order.kitchen_progress',
      mark_ready: 'order.kitchen_progress',
      mark_served: 'order.serve',
      take_payment: 'order.pay',
      void_ticket: 'order.void',
      new_order: 'order.take',
    };
    const perm = need[base.action];
    if (perm && !can(roleId, perm)) {
      // Cashier: jump to pay when allowed even if kitchen steps pending for others
      if (can(roleId, 'order.pay') && (ticket.status === 'Served' || ((ticket.type === 'Takeaway' || ticket.type === 'Delivery') && ticket.status === 'Ready'))) {
        return { action: 'take_payment' as ProcessAction, label: 'Take payment' };
      }
      if (can(roleId, 'order.serve') && ticket.status === 'Ready' && ticket.type === 'Dine in') {
        return { action: 'mark_served' as ProcessAction, label: 'Mark served' };
      }
      return null;
    }
    return base;
  }, [ticket, roleId]);
  const step = statusStepIndex(status);

  function flash(message: string, ms = 2800) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), ms);
  }

  function applyStockDeduction(nextTicket: Ticket) {
    if (!role) return nextTicket;
    const result = deductForTicket(
      stock,
      nextTicket.items.map((l) => ({
        menuItemId: l.menuItem.id,
        menuItemName: l.menuItem.name,
        quantity: l.quantity,
      })),
      { ticketNumber: nextTicket.number, by: role.label },
      recipes,
    );
    setStock(result.stock);
    setStockByStore((prev) => ({ ...prev, [activeStoreId]: result.stock }));
    setMoves((m) => [...result.moves, ...m].slice(0, 120));
    setLedgerHighlight(result.moves.map((mv) => mv.id));
    setDeductionModal(result.previews);
    return nextTicket;
  }

  function selectStore(storeId: string) {
    setActiveStoreId(storeId);
    setStock(stockByStore[storeId] ?? seedStock());
    flash(`Viewing ${storeId === 'store2' ? 'Store 2' : 'Store 1'} stock`);
  }

  function completeLogin(id: RoleId, name?: string) {
    const who = name?.trim() || roleById(id).label;
    setOperator(who);
    try {
      window.localStorage.setItem('ury-staff-name', who);
    } catch {
      /* ignore */
    }
    setDismissedNotices([]);
    // Keep tickets / kitchen queue / sales / open shift across role switches.
    setRoleId(id);
    saveStaffRole(id);
    setLoginPick(null);
    setPin('');
    setPinError('');
    setReceipt(null);
    setDeductionModal(null);
    setKitchenPrint(null);
    setGuestPrint(null);
    const nextView = defaultViewForRole(id) as View;
    setView(nextView);
    saveStaffView(nextView);

    // Rehydrate open shift from storage (guards against any in-memory loss).
    const saved = loadSession();
    const savedShift = saved?.shift as ShiftRecord | null | undefined;
    if (savedShift && savedShift.status === 'open') {
      setShift(savedShift);
    }
    if (Array.isArray(saved?.shiftHistory)) {
      setShiftHistory(saved.shiftHistory as ShiftRecord[]);
    }

    const tips: Record<RoleId, string> = {
      captain: 'Captain — take orders. Kitchen queue & open shift stay active.',
      cashier: 'Cashier — collect payment when ticket is Served / Ready.',
      cashier2: 'Cashier 2 — collect payment when ticket is Served / Ready.',
      supervisor: 'Cash Supervisor — approve discounts & voids, tax invoice, close shift.',
      callcenter: 'Call Center — takeaway, delivery & online orders to kitchen.',
      kitchen: 'Kitchen — same day’s tickets stay here after Captain sends.',
      delivery: 'Delivery rider — pick Ready deliveries, deliver, collect payment at customer.',
      manager:
        savedShift?.status === 'open'
          ? `Manager — shift still OPEN (since ${savedShift.openedAt}).`
          : 'Manager — open shift, reconcile, reports, accounting, features list.',
    };
    flash(tips[id]);
  }

  function tryPin(nextPin: string) {
    if (!loginPick) return;
    setPin(nextPin);
    setPinError('');
    if (nextPin.length < 4) return;
    const r = roleById(loginPick);
    const staffHit = staffForPin(extras.staff, loginPick, nextPin);
    if (staffHit || nextPin === effectivePin(r, extras.pinOverrides)) {
      completeLogin(loginPick, staffHit?.name);
      return;
    }
    setPinError('Wrong PIN — try again');
    window.setTimeout(() => setPin(''), 280);
  }

  const readyToServe = useMemo(() => {
    const byId = new Map<string, Ticket>();
    for (const t of Object.values(ticketBook)) byId.set(t.id, t);
    byId.set(ticket.id, ticket);
    return Array.from(byId.values()).filter((t) => t.status === 'Ready' && t.type === 'Dine in' && t.items.length > 0);
  }, [ticketBook, ticket]);

  async function mintTicket(
    type: Ticket['type'],
    tableName: string,
    party: number,
    deliveryNote = '',
  ): Promise<Ticket> {
    syncTicketSeq([...Object.values(ticketBook), ...dayOrders, ticket, currentTicketSeq()]);
    const n = await reserveTicketNumber(currentTicketSeq());
    syncTicketSeq([n]);
    return { ...createEmptyTicket(type, tableName, party, deliveryNote, n), captain: operator || role?.label };
  }

  function openOrderOnTable(seat: SeatTable, partySize: number) {
    if (shift?.status !== 'open') {
      flash('Open a shift first (Manager → Shifts)');
      return;
    }
    const bookFromAll: Record<string, Ticket> = {};
    for (const t of allTicketsById.values()) bookFromAll[ticketStorageKey(t)] = t;
    const existing = liveTicketForTable(bookFromAll, seat.name);
    if (existing && existing.status !== 'Paid') {
      setTicketState(existing);
      setExpandedNote(null);
      setView('floor');
      flash(`Restored ticket #${existing.number} · ${seat.name}`);
      return;
    }
    void (async () => {
      const fresh = await mintTicket('Dine in', seat.name, partySize);
      setTicket(fresh);
      setExpandedNote(null);
      setView('floor');
      flash(`Floor order · ${seat.name} · #${fresh.number}`);
    })();
  }

  function dispatchOn(target: Ticket, action: ProcessAction) {
    if (!role) return;

    const needsOpenShift: ProcessAction[] = [
      'send_to_kitchen',
      'start_preparing',
      'accept_order',
      'reject_order',
      'mark_ready',
      'mark_served',
      'take_payment',
      'new_order',
    ];
    if (needsOpenShift.includes(action) && shift?.status !== 'open') {
      flash('Open a shift first (Manager → Shifts)');
      return;
    }

    // Mint a shared unique number — do not use local-only createEmptyTicket.
    if (action === 'new_order') {
      if (!can(role.id, 'order.take')) {
        flash('Captain or Cashier starts a new ticket');
        return;
      }
      void (async () => {
        syncTicketSideState(target);
        upsertKitchenBoard(target);
        const fresh = await mintTicket(target.type, target.table, target.partySize);
        setTicket(fresh);
        setReceipt(null);
        setExpandedNote(null);
        setDeductionModal(null);
        flash(`New ticket #${fresh.number}`);
      })();
      return;
    }

    if (action === 'send_to_kitchen' && !can(role.id, 'order.send_kitchen')) {
      flash('Captain or Cashier can send to kitchen');
      return;
    }
    if (['start_preparing', 'mark_ready'].includes(action) && !can(role.id, 'order.kitchen_progress')) {
      flash('Captain or Manager advances kitchen prep');
      return;
    }
    if (action === 'mark_served' && !can(role.id, 'order.serve')) {
      flash('Captain or Manager marks served');
      return;
    }
    if (action === 'take_payment' && !can(role.id, 'order.pay')) {
      flash('Cashier, Delivery rider, or Manager takes payment');
      return;
    }
    if (action === 'void_ticket' && !can(role.id, 'order.void')) {
      flash('Manager only — void ticket');
      return;
    }

    if (action === 'take_payment' && target.type === 'Delivery' && !target.driverName?.trim()) {
      flash('Enter the driver name who collects payment (Delivery form)');
      return;
    }
    let payOpts: { paymentMethod?: PaymentMethod; paymentBreakdown?: PaymentBreakdown; rejectReason?: string } = {
      paymentMethod,
    };
    if (action === 'take_payment') {
      const due = Math.round(amountDue(target) * 100) / 100;
      if (paymentMethod === 'Cash') {
        const tendered = Number(cashTendered);
        if (!cashTendered.trim() || Number.isNaN(tendered) || tendered < due) {
          flash(`Enter cash received (at least ${money(due)})`);
          return;
        }
        const changeDue = Math.round((tendered - due) * 100) / 100;
        payOpts = {
          paymentMethod: 'Cash',
          paymentBreakdown: {
            method: 'Cash',
            cardAmount: 0,
            cashAmount: due,
            cashTendered: tendered,
            changeDue,
          },
        };
      } else if (paymentMethod === 'Split') {
        const cashAmt = Number(splitCash) || 0;
        const cardAmt = Number(splitCard) || 0;
        const paid = Math.round((cashAmt + cardAmt) * 100) / 100;
        if (paid + 0.001 < due) {
          flash(`Split must cover ${money(due)} (cash + card = ${money(paid)})`);
          return;
        }
        payOpts = {
          paymentMethod: 'Split',
          paymentBreakdown: {
            method: 'Split',
            cardAmount: cardAmt,
            cashAmount: cashAmt,
            cashTendered: cashAmt,
            changeDue: 0,
          },
        };
      } else if (paymentMethod === 'Credit') {
        if (!target.customerName?.trim()) {
          flash('Credit sale needs a customer name — set it on Delivery / Call Center ticket or enter below');
          return;
        }
        payOpts = {
          paymentMethod: 'Credit',
          paymentBreakdown: { method: 'Credit', cardAmount: 0, cashAmount: 0 },
        };
      } else if (paymentMethod === 'Loyalty') {
        const card = (window.prompt('Loyalty / discount card number') ?? '').trim();
        if (!card) {
          flash('Enter loyalty card number');
          return;
        }
        payOpts = {
          paymentMethod: 'Loyalty',
          paymentBreakdown: { method: 'Loyalty', loyaltyId: card, cardAmount: 0, cashAmount: 0 },
        };
      } else {
        payOpts = {
          paymentMethod: 'Card',
          paymentBreakdown: { method: 'Card', cardAmount: due, cashAmount: 0 },
        };
      }
    }
    if (action === 'reject_order') {
      const reason = window.prompt('Reject reason (shown to Captain)', '86 item / too busy') || 'Kitchen rejected';
      const available = menu
        .filter((m) => m.available && !target.items.some((l) => l.menuItem.id === m.id))
        .map((m) => m.name)
        .join(', ');
      const alt = (window.prompt(`Suggest an alternative dish for the captain (optional).\nAvailable: ${available}`, '') ?? '').trim();
      payOpts = { rejectReason: alt ? `${reason} · Try: ${alt}` : reason };
    }

    const result = runProcess(target, action, payOpts);
    if (!result.ok) {
      flash(result.reason);
      return;
    }

    let next = result.ticket;
    if (action === 'void_ticket') {
      notifyTrigger('void', { ticket: target.number, by: operator || role.label });
      const inv = invoiceByTicket.current[target.id] || target.id;
      void erpVoidOrder(inv).catch((err) => console.warn('ERP void_order failed', err));
    }
    if (action === 'send_to_kitchen') {
      if (settings.stockDeductOn === 'send_kitchen') next = applyStockDeduction(next);
      if (next.type === 'Dine in') setTables((tb) => linkTicket(tb, next.table, next.number));
      // Force kitchen board + book before any print delay so KDS updates immediately.
      setTicketBook((book) => ({ ...book, [ticketStorageKey(next)]: next }));
      setDayOrders((prevOrders) => {
        const i = prevOrders.findIndex((t) => t.id === next.id);
        if (i >= 0) {
          const copy = [...prevOrders];
          copy[i] = next;
          return copy;
        }
        return [next, ...prevOrders];
      });
      setKitchenBoard((board) => ({ ...board, [next.id]: next }));
      // Persist draft POS Invoice + URY KOT on ERP
      void (async () => {
        try {
          const lineItems = next.items.map((l) => ({
            code: l.menuItem.id,
            name: l.menuItem.name,
            qty: l.quantity,
            price: unitPrice(l.menuItem, next.type),
            notes: l.notes,
          }));
          const r = await erpSyncOrder({
            company: erpMeta.company,
            pos_profile: erpMeta.pos_profile,
            invoice: invoiceByTicket.current[next.id],
            table: next.table,
            order_type: next.type,
            no_of_pax: next.partySize,
            items: lineItems,
          });
          if (r?.invoice) invoiceByTicket.current[next.id] = r.invoice;
          const kot = await erpSendKot({
            invoice: invoiceByTicket.current[next.id],
            pos_profile: erpMeta.pos_profile,
            table: next.table,
            items: lineItems,
            comments: `Ticket ${next.number}`,
          });
          if (kot?.kot) kotByTicket.current[next.id] = kot.kot;
        } catch (err) {
          console.warn('ERP sync/send_kot failed', err);
        }
      })();
      flash(
        printKitchenOnSend
          ? `${result.message} · sent to Kitchen · printing chit`
          : `${result.message} · open Kitchen tab to see it`,
      );
      if (printKitchenOnSend) {
        window.setTimeout(() => openKitchenPrint(next), 300);
      }
    } else if (action === 'mark_ready') {
      const kotId = kotByTicket.current[next.id];
      if (kotId) void erpUpdateKotStatus(kotId, 'ready').catch(() => undefined);
      flash(
        next.type === 'Dine in'
          ? `Ready · ${next.table} — Captain: tap Serve to table`
          : `Ready · ${next.type} — Cashier can take payment`,
      );
    } else if (action === 'mark_served') {
      const kotId = kotByTicket.current[next.id];
      if (kotId) void erpUpdateKotStatus(kotId, 'served').catch(() => undefined);
      flash(`Served ${next.table} · Cashier can take payment`);
    } else {
      flash(result.message);
    }
    if (action === 'mark_served' && next.type === 'Dine in') {
      setTables((tb) => markBill(tb, next.table));
    }

    // Persist the advanced ticket; only steal the Floor draft when it is the same ticket.
    commitTicket(next, { activate: target.id === ticket.id });

    if (action === 'take_payment' && next.status === 'Paid') {
      if (next.paymentBreakdown?.method === 'Credit') notifyTrigger('credit_sale', { customer: next.customerName ?? '', ticket: next.number, table: next.table });
      // Hard-clear KDS for this ticket (guards against stale board / multi-device lag).
      setKitchenBoard((board) => {
        if (!board[next.id]) return board;
        const copy = { ...board };
        delete copy[next.id];
        return copy;
      });
      if (settings.stockDeductOn === 'payment') applyStockDeduction(next);
      const totals = ticketTotals(next);
      // Submit POS Invoice on ERP
      void (async () => {
        try {
          let inv = invoiceByTicket.current[next.id];
          if (!inv) {
            const synced = await erpSyncOrder({
              company: erpMeta.company,
              pos_profile: erpMeta.pos_profile,
              table: next.table,
              order_type: next.type,
              no_of_pax: next.partySize,
              items: next.items.map((l) => ({
                code: l.menuItem.id,
                name: l.menuItem.name,
                qty: l.quantity,
                price: unitPrice(l.menuItem, next.type),
                notes: l.notes,
              })),
            });
            inv = synced.invoice;
            invoiceByTicket.current[next.id] = inv;
          }
          const method = next.paymentMethod || paymentMethod;
          const payments =
            method === 'Split'
              ? [
                  { mode_of_payment: 'Cash', amount: next.paymentBreakdown?.cashAmount || 0 },
                  { mode_of_payment: 'Card', amount: next.paymentBreakdown?.cardAmount || 0 },
                ]
              : [{ mode_of_payment: method === 'Cash' ? 'Cash' : 'Card', amount: totals.total }];
          await erpPayOrder(inv, payments);
        } catch (err) {
          console.warn('ERP pay_order failed', err);
        }
      })();
      notifyTrigger('large_sale', { amount: totals.total, ticket: next.number, table: next.table, customer: next.customerName ?? '' });
      setReceipt({ ...next, total: totals.total });
      setCashTendered('');
      setSplitCash('');
      setSplitCard('');
      setSales((s) => [
        {
          id: next.receiptNumber ?? `s-${Date.now()}`,
          at: next.paidAt ?? '',
          ticketNumber: next.number,
          type: next.type,
          table: next.table,
          paymentMethod: next.paymentMethod ?? paymentMethod,
          cashAmount: next.paymentBreakdown?.cashAmount,
          cardAmount: next.paymentBreakdown?.cardAmount,
          changeDue: next.paymentBreakdown?.changeDue,
          total: totals.total,
          discount: totals.discount,
          tip: next.tip ?? 0,
          paidAtMs: Date.now(),
          customerName: next.customerName || undefined,
          loyaltyId: next.paymentBreakdown?.loyaltyId,
          channel: next.channel ?? next.type,
          itemCount: totals.itemCount,
          by: operator || role.label,
          branchId,
          captain: next.captain,
          covers: next.partySize,
          driverName: next.driverName,
          cancelled: next.cancelled,
          lines: next.items.map((l) => ({
            name: l.menuItem.name,
            qty: l.quantity,
            amount: lineAmount(l, next.type).net,
            category: l.menuItem.category,
          })),
        },
        ...s,
      ]);
      if (next.type === 'Dine in') {
        const tableId = tables.find((t) => t.name === next.table)?.id;
        if (tableId) setTables((tb) => markDirty(tb, tableId));
      }
    }
    if (action === 'reject_order') {
      flash(result.message);
      notifyTrigger('kitchen_reject');
    }
  }

  function dispatch(action: ProcessAction) {
    dispatchOn(ticket, action);
  }

  const allTicketsById = useMemo(() => {
    const rank: Record<string, number> = {
      Open: 0,
      'Sent to kitchen': 1,
      Preparing: 2,
      Ready: 3,
      Served: 4,
      Paid: 5,
    };
    const byId = new Map<string, Ticket>();
    const prefer = (a: Ticket | undefined, b: Ticket): Ticket => {
      if (!a) return b;
      const ra = rank[a.status] ?? 0;
      const rb = rank[b.status] ?? 0;
      if (rb !== ra) return rb > ra ? b : a;
      return (b.sentAtMs ?? b.openedAtMs ?? 0) >= (a.sentAtMs ?? a.openedAtMs ?? 0) ? b : a;
    };
    for (const t of dayOrders) byId.set(t.id, prefer(byId.get(t.id), t));
    for (const t of Object.values(ticketBook)) byId.set(t.id, prefer(byId.get(t.id), t));
    byId.set(ticket.id, prefer(byId.get(ticket.id), ticket));
    return byId;
  }, [ticketBook, dayOrders, ticket]);

  function kitchenAction(ticketId: string, action: ProcessAction) {
    const target =
      allTicketsById.get(ticketId) ??
      Object.values(ticketBook).find((t) => t.id === ticketId) ??
      (ticket.id === ticketId ? ticket : null);
    if (!target) {
      flash('Ticket not found');
      return;
    }
    dispatchOn(target, action);
  }

  const kitchenTickets = useMemo(() => {
    // No open shift → no KDS cards (prevents old tickets reappearing after close).
    if (shift?.status !== 'open') return [];
    const shiftStart = shift.openedAtMs ?? 0;
    const finishedIds = new Set<string>();
    for (const t of allTicketsById.values()) {
      if (t.status === 'Paid' || t.status === 'Served' || (t.status === 'Open' && t.kitchenRejectReason)) {
        finishedIds.add(t.id);
      }
    }
    const byId = new Map<string, Ticket>();
    // Dedicated board first — New ticket / Delivery must not drop table orders.
    for (const t of Object.values(kitchenBoard)) {
      if (finishedIds.has(t.id)) continue;
      if (shiftStart && (t.openedAtMs ?? 0) < shiftStart) continue;
      if (isKitchenQueueStatus(t.status) && t.items.length > 0) byId.set(t.id, t);
    }
    // Fallbacks from book / day / active (prefer higher kitchen status)
    const rank: Record<string, number> = {
      'Sent to kitchen': 1,
      Preparing: 2,
      Ready: 3,
    };
    for (const t of allTicketsById.values()) {
      if (finishedIds.has(t.id)) continue;
      if (shiftStart && (t.openedAtMs ?? 0) < shiftStart) continue;
      if (!isKitchenQueueStatus(t.status) || !t.items.length) continue;
      const prev = byId.get(t.id);
      if (!prev || (rank[t.status] ?? 0) >= (rank[prev.status] ?? 0)) byId.set(t.id, t);
    }
    return Array.from(byId.values());
  }, [kitchenBoard, allTicketsById, shift]);

  const kitchenLiveCount = kitchenTickets.length;

  // Keep floor in sync — clear ghost ORDERED / BILL READY when no unpaid live ticket remains.
  useEffect(() => {
    const list = Array.from(allTicketsById.values());
    setTables((prev) => {
      let changed = false;
      const next = prev.map((seat) => {
        if (seat.status !== 'ordered' && seat.status !== 'bill' && seat.status !== 'seated') return seat;
        const live = list.find(
          (t) =>
            t.type === 'Dine in' &&
            t.table === seat.name &&
            t.items.length > 0 &&
            t.status !== 'Paid' &&
            (isKitchenQueueStatus(t.status) || t.status === 'Served' || t.status === 'Open'),
        );
        if (live) {
          if (live.status === 'Served' && seat.status !== 'bill') {
            changed = true;
            return { ...seat, status: 'bill' as const, ticketNumber: live.number, partySize: live.partySize };
          }
          if (isKitchenQueueStatus(live.status) && seat.status !== 'ordered') {
            changed = true;
            return { ...seat, status: 'ordered' as const, ticketNumber: live.number, partySize: live.partySize };
          }
          if (seat.ticketNumber !== live.number) {
            changed = true;
            return { ...seat, ticketNumber: live.number, partySize: live.partySize ?? seat.partySize };
          }
          return seat;
        }
        // Paid / missing — never leave BILL READY after invoice close or shift close.
        changed = true;
        return {
          ...seat,
          status: 'free' as const,
          partySize: undefined,
          ticketNumber: undefined,
          server: undefined,
        };
      });
      return changed ? next : prev;
    });
  }, [allTicketsById]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!role) return;
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setReceipt(null);
        setDeductionModal(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && primary && view === 'floor') {
        event.preventDefault();
        dispatch(primary.action);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function updateItem(id: string, delta: number) {
    if (!canAdd) {
      flash(blockAddReason());
      return;
    }
    setTicket((t) => {
      const next = { ...t, items: applyLineDelta(t.items, id, delta) };
      return delta > 0 ? reopenForAddons(next) : next;
    });
  }
  function blockAddReason(): string {
    if (!role) return 'Sign in first';
    if (!can(role.id, 'order.take')) {
      return 'Cashier cannot add dishes — switch to Captain or Manager';
    }
    if (status === 'Paid') return 'Ticket paid — tap New order first';
    return 'Cannot add dishes right now';
  }
  /** Cancel one dish from the ticket with a reason. Sent items need order.void (Supervisor / Manager). */
  function cancelDishLine(dishId: string) {
    if (!role) return;
    const line = ticket.items.find((l) => l.menuItem.id === dishId);
    if (!line) return;
    const sent = Boolean(ticket.sentAtMs);
    if (sent && !can(role.id, 'order.void')) {
      flash('Already sent to kitchen — Cash Supervisor or Manager cancels it');
      return;
    }
    const reason = (window.prompt(`Reason for cancelling ${line.quantity}× ${line.menuItem.name} (required)`, '') ?? '').trim();
    if (!reason) {
      flash('Cancel needs a reason');
      return;
    }
    const by = operator || role.label;
    const entry: CancelledLine = {
      name: line.menuItem.name,
      qty: line.quantity,
      amount: lineAmount(line, ticket.type).net,
      reason,
      by,
      captain: ticket.captain,
      at: new Date().toLocaleTimeString(),
      atMs: Date.now(),
      wasSent: sent,
    };
    setTicket((t) => ({ ...t, items: removeLine(t.items, dishId), cancelled: [...(t.cancelled ?? []), entry] }));
    notifyTrigger('item_cancelled', { table: ticket.table, ticket: ticket.number, reason, by, value: entry.amount });
    flash(`Cancelled ${entry.name} — logged in Reports › Voids & cancels`);
  }

  function openComboPicker(comboTileId: string) {
    const combo = extras.combos.find((c) => `combo-def:${c.id}` === comboTileId);
    if (!combo) return;
    if (!canAdd) {
      flash(blockAddReason());
      return;
    }
    const picks: string[][] = [];
    for (const g of combo.groups) {
      const opts = g.options.map((id, i) => `${i + 1}. ${menu.find((m) => m.id === id)?.name ?? id}`).join('\n');
      const raw = window.prompt(`${combo.name} — ${g.label}\nChoose ${g.min}–${g.max} (comma-separated numbers)\n${opts}`, '1');
      if (raw === null) return;
      const chosen = raw
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= g.options.length)
        .map((n) => g.options[n - 1]);
      picks.push([...new Set(chosen)]);
    }
    const err = validateComboPick(combo, picks);
    if (err) {
      flash(err);
      return;
    }
    const line = comboLine(combo, picks, menu);
    setTicket((t) => reopenForAddons({ ...t, items: [...t.items, line] }));
    flash(`${combo.name} added`, 1800);
  }

  /** Move chosen lines to a NEW bill on the same table (per-guest split). */
  function splitBillOut() {
    if (!role || type !== 'Dine in' || !canAdd || items.length < 2) {
      flash('Split needs an open dine-in ticket with 2+ lines');
      return;
    }
    const list = items.map((l, i) => `${i + 1}. ${l.menuItem.name} ×${l.quantity}`).join('\n');
    const raw = window.prompt(`Move to a NEW bill on ${table} — enter item numbers (comma-separated):\n${list}`, '');
    if (!raw) return;
    const idx = raw
      .split(',')
      .map((x) => Number(x.trim()) - 1)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < items.length);
    const unique = [...new Set(idx)];
    if (!unique.length || unique.length === items.length) {
      flash('Pick some items, not all of them');
      return;
    }
    const moved = unique.map((i) => items[i]);
    const kept = items.filter((_, i) => !unique.includes(i));
    const fresh = createEmptyTicket('Dine in', table, 1);
    commitTicket({ ...ticket, items: kept }, { activate: true });
    commitTicket({ ...fresh, items: moved }, { activate: false });
    flash(`Split out new bill #${fresh.number} on ${table}`);
  }

  function addDish(dish: MenuItem) {
    if (dish.id.startsWith('combo-def:')) {
      openComboPicker(dish.id);
      return;
    }
    if (!dish.available) {
      flash('Dish unavailable');
      return;
    }
    if (!canAdd) {
      flash(blockAddReason());
      return;
    }
    setTicket((t) => {
      const withLine = { ...t, items: addOrBumpLine(t.items, dish) };
      return reopenForAddons(withLine);
    });
    flash(`${dish.name} added`, 1800);
  }
  function updateNote(id: string, notes: string) {
    if (!canAdd) return;
    setTicket((t) => ({ ...t, items: setLineNotes(t.items, id, notes) }));
  }
  function setType(next: Ticket['type']) {
    // Lock type after send — never morph a kitchen ticket into Delivery (that removed Table 04).
    if (!canEditTicket(status)) {
      flash('Type locked after send — tap New ticket, then Delivery');
      return;
    }
    if (!canAdd) return;
    // If this ticket already has items and is dine-in, switching type would steal the table order —
    // force a brand-new ticket instead so kitchen / map stay correct.
    if (ticket.type === 'Dine in' && next !== 'Dine in' && ticket.items.length > 0) {
      syncTicketSideState(ticket);
      upsertKitchenBoard(ticket);
      void (async () => {
        const fresh = await mintTicket(next, next === 'Delivery' ? 'Delivery' : 'Pickup', partySize);
        setTicketState(fresh);
        setExpandedNote(null);
        flash(`${next} started as a new ticket #${fresh.number} — ${ticket.table} order kept`);
      })();
      return;
    }
    setTicket((t) => {
      if (t.type === 'Dine in' && next !== 'Dine in') {
        const tableId = tables.find((seat) => seat.name === t.table)?.id;
        if (tableId) setTables((tb) => clearTable(tb, tableId));
      }
      return {
        ...t,
        type: next,
        table:
          next === 'Dine in'
            ? (t.table === 'Pickup' || t.table === 'Delivery' ? 'Table 12' : t.table)
            : next === 'Delivery'
              ? 'Delivery'
              : 'Pickup',
        deliveryNote: next === 'Delivery' ? (t.deliveryNote ?? '') : undefined,
        customerName: next === 'Delivery' ? (t.customerName ?? '') : undefined,
        customerPhone: next === 'Delivery' ? (t.customerPhone ?? '') : undefined,
        deliveryAddress: next === 'Delivery' ? (t.deliveryAddress ?? '') : undefined,
        deliveryPayMode: next === 'Delivery' ? (t.deliveryPayMode ?? 'Cash on delivery') : undefined,
      };
    });
  }
  function moveDishesToOtherTable() {
    if (!canTakeOrders) {
      flash('Captain moves dishes between tables');
      return;
    }
    if (type !== 'Dine in') {
      flash('Switch to a dine-in table ticket first');
      return;
    }
    if (status === 'Paid') {
      flash('Ticket already paid');
      return;
    }
    const dishId = moveDishId || items[0]?.menuItem.id;
    const newName = moveNewTable.trim();
    const targetName = newName || moveToTable;
    if (newName && !tables.some((t) => t.name === newName)) {
      const zone = tables.find((t) => t.name === table)?.zone ?? 'Main';
      setTables((tb) => [
        ...tb,
        { id: `t-${Date.now().toString(36)}`, name: newName, zone, seats: 4, shape: 'square', status: 'free', x: 50, y: 50 },
      ]);
    }
    if (!dishId || !targetName) {
      flash('Pick a dish and destination table (or type a new table name)');
      return;
    }
    void (async () => {
      const bookFromAll: Record<string, Ticket> = {};
      for (const t of allTicketsById.values()) bookFromAll[ticketStorageKey(t)] = t;
      const existingDest = liveTicketForTable(bookFromAll, targetName);
      let newDestNumber: number | undefined;
      if (!existingDest || existingDest.status === 'Paid') {
        syncTicketSeq([...Object.values(ticketBook), ...dayOrders, ticket, currentTicketSeq()]);
        newDestNumber = await reserveTicketNumber(currentTicketSeq());
        syncTicketSeq([newDestNumber]);
      }
      const result = moveLineQtyToTable(
        ticket,
        targetName,
        existingDest,
        dishId,
        Number(moveQty) || 0,
        newDestNumber,
      );
      if (!result.ok) {
        flash(result.reason);
        return;
      }
      commitTicket(result.source, { activate: true });
      commitTicket(result.dest, { activate: false });
      setTicketBook((book) => ({
        ...book,
        [ticketStorageKey(result.source)]: result.source,
        [ticketStorageKey(result.dest)]: result.dest,
      }));
      if (result.source.items.length > 0) {
        setTables((tb) => linkTicket(tb, result.source.table, result.source.number));
      }
      setTables((tb) => linkTicket(tb, result.dest.table, result.dest.number));
      const movedLine = items.find((l) => l.menuItem.id === dishId);
      flash(
        `Moved ${moveQty}× ${movedLine?.menuItem.name ?? 'dish'} → ${targetName} (ticket #${result.dest.number})`,
      );
      setMoveQty('1');
      setMoveNewTable('');
    })();
  }

  function startNewTicket() {
    if (!canTakeOrders) {
      flash('Captain or Cashier starts a new ticket');
      return;
    }
    // Park whatever is on screen so expo board never loses a live kitchen ticket.
    syncTicketSideState(ticket);
    upsertKitchenBoard(ticket);

    const nextType = type === 'Takeaway' || type === 'Delivery' ? type : 'Dine in';
    const nextTable =
      nextType === 'Dine in' ? table : nextType === 'Delivery' ? 'Delivery' : 'Pickup';
    void (async () => {
      const fresh = await mintTicket(nextType, nextTable, partySize);
      setTicketState(fresh);
      setExpandedNote(null);
      setReceipt(null);
      setDeductionModal(null);
      setView('floor');
      flash(
        nextType === 'Delivery'
          ? `New delivery #${fresh.number} — earlier kitchen tickets stay on the board`
          : `New ticket #${fresh.number} — kitchen keeps every order already sent`,
      );
    })();
  }

  if (!role) {
    const picked = loginPick ? roleById(loginPick) : null;
    return (
      <main className="ury-pos ury-login">
        <LoginStyles />
        <div className="ury-login-card">
          <div className="ury-login-brand">
            <span className="ury-mark">u.</span>
            <div>
              <strong>URY POS</strong>
              <small>Staff login · restaurant demo</small>
            </div>
          </div>
          {!picked ? (
            <>
              <p className="ury-login-lead">Captain takes orders · Cashier / Delivery collect pay · Kitchen KDS · Manager shift &amp; accounting.</p>
              {shift?.status === 'open' && (
                <p className="ury-login-lead" style={{ marginTop: -4, color: '#365847', fontWeight: 700 }}>
                  Shift still OPEN · opened {shift.openedAt} by {shift.openedBy}
                </p>
              )}
              <p className="ury-login-lead" style={{ marginTop: -8 }}>
                <a href={`${import.meta.env.BASE_URL}docs/URY-POS-User-Guide.pdf`} target="_blank" rel="noreferrer" style={{ color: '#8c6845', fontWeight: 700 }}>
                  Download user guide (PDF v2.1)
                </a>
              </p>
              <div className="ury-role-grid">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="ury-role-card"
                    onClick={() => { setLoginPick(r.id); setPin(''); setPinError(''); }}
                  >
                    <span className="ury-role-avatar">{r.initials}</span>
                    <span className="ury-role-meta">
                      <strong>{r.label}</strong>
                      <small>{r.blurb}</small>
                      <em>PIN required</em>
                    </span>
                    <Lock size={14} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="ury-pin-panel">
              <button type="button" className="ury-pin-back" onClick={() => { setLoginPick(null); setPin(''); setPinError(''); }}>
                ← Change role
              </button>
              <div className="ury-pin-who">
                <span className="ury-role-avatar">{picked.initials}</span>
                <div>
                  <strong>{picked.label}</strong>
                  <small>Enter PIN to continue</small>
                </div>
              </div>
              <div className="ury-pin-dots" aria-label="PIN length">
                {[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? 'on' : ''} />)}
              </div>
              {pinError ? <p className="ury-pin-error">{pinError}</p> : <p className="ury-pin-hint">PINs: Captain 1111 · Cashier 2222/2223 · Kitchen 4444 · Delivery 5555 · Manager 3333 · Supervisor 6666 · Call 7777</p>}
              <div className="ury-pin-pad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
                  if (!key) return <span key="sp" />;
                  if (key === 'del') {
                    return (
                      <button key="del" type="button" className="ury-pin-key" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">
                        <Delete size={18} />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      className="ury-pin-key"
                      onClick={() => tryPin((pin + key).slice(0, 4))}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="ury-pos">
      <PosStyles />
      <header className="ury-topbar">
        <div className="ury-brand" aria-label="URY neighborhood bistro">
          <span className="ury-mark">u.</span>
          <span className="ury-wordmark">URY<small>NEIGHBORHOOD BISTRO</small></span>
        </div>
        <nav className="ury-nav" aria-label="ERP POS links">
          {navOrder.map((id) => {
            if (!navVisible(id)) return null;
            const link = erpPosLinkFor(id);
            const cls = view === id ? 'on' : '';
            if (id === 'seating' && can(role.id, 'seating.manage')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <Armchair size={13} /> {navLabel('seating', 'Seating')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'floor' && (can(role.id, 'order.take') || can(role.id, 'order.pay'))) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  {navLabel('floor', 'Floor')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'kitchen' && can(role.id, 'kitchen.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <ChefHat size={13} /> {navLabel('kitchen', 'Kitchen')} <ExternalLink size={11} />
                  {kitchenLiveCount > 0 ? <b>{kitchenLiveCount}</b> : null}
                </a>
              );
            }
            if (id === 'orders' && can(role.id, 'orders.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <ClipboardList size={13} /> {navLabel('orders', 'Orders')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'ledger' && can(role.id, 'stock.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <BookOpen size={13} /> {navLabel('ledger', 'Ledger')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'recipes' && can(role.id, 'recipes.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <CookingPot size={13} /> {navLabel('recipes', 'Recipes')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'stock' && can(role.id, 'stock.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <Boxes size={13} /> {navLabel('stock', 'Stock')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'shifts' && can(role.id, 'shift.manage')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <ClipboardCheck size={13} /> {navLabel('shifts', 'Shifts')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'accounting' && can(role.id, 'accounting.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <Calculator size={13} /> {navLabel('accounting', 'Accounts')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'reports' && can(role.id, 'reports.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <BarChart3 size={13} /> {navLabel('reports', 'Reports')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'features' && can(role.id, 'features.view')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <ListChecks size={13} /> {navLabel('features', 'Features')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'admin' && can(role.id, 'settings.edit')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  {navLabel('admin', 'Admin')} <ExternalLink size={11} />
                </a>
              );
            }
            if (id === 'settings' && can(role.id, 'settings.edit')) {
              return (
                <a key={id} className={cls} href={link.href} title={link.label}>
                  <Settings size={13} /> {navLabel('settings', 'Settings')} <ExternalLink size={11} />
                </a>
              );
            }
            return null;
          })}
        </nav>
        <div className="ury-topright">
          <a className="ury-erp-pos-btn" href={ERP_POS_HOME} title="Open stock URY ERP POS">
            <ExternalLink size={13} /> ERP POS
          </a>
          {can(role.id, 'branch.switch') && (
            <label className="ury-branch">
              <span>Branch</span>
              <select
                value={branchId}
                onChange={(e) => {
                  const nextBranch = e.target.value;
                  setBranchId(nextBranch);
                  const storeId = storeIdForBranch(nextBranch);
                  setActiveStoreId(storeId);
                  setStock(stockByStore[storeId] ?? seedStock());
                  const label = branches.find((b) => b.id === nextBranch)?.name ?? nextBranch;
                  flash(`Switched to ${label} · ${storeId === 'store2' ? 'Store 2' : 'Store 1'} stock`);
                }}
                aria-label="Switch branch"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className={`ury-shift-pill ${shift?.status === 'open' ? 'open' : 'closed'}`} title={shift?.status === 'open' ? `Opened ${shift.openedAt} by ${shift.openedBy}` : 'Open a shift before taking orders'}>
            {shift?.status === 'open' ? <Unlock size={12} /> : <Lock size={12} />}
            {shift?.status === 'open' ? 'Shift OPEN' : 'Shift closed'}
          </div>
          <div className="ury-open"><i /> {role.title} · {branch.code}</div>
          <div className="ury-clock">Ticket #{ticket.number}</div>
          <div className="ury-staff" title={role.label}>{role.initials}</div>
          <button
            type="button"
            className="ury-logout"
            onClick={() => {
              setRoleId(null);
              saveStaffRole(null);
              setOperator('');
              try {
                window.localStorage.removeItem('ury-staff-name');
              } catch {
                /* ignore */
              }
              saveStaffView(null);
              setLoginPick(null);
              setPin('');
            }}
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {view === 'seating' && (
        <SeatingPanel
          tables={tables}
          floorBackground={extras.floorBackground}
          tableColors={extras.tableColors}
          onChange={setTables}
          onOpenOrder={openOrderOnTable}
          onMergeTables={(keep, absorb) => {
            const bookFromAll: Record<string, Ticket> = {};
            for (const t of allTicketsById.values()) bookFromAll[ticketStorageKey(t)] = t;
            const keepTicket = liveTicketForTable(bookFromAll, keep.name);
            const absorbTicket = liveTicketForTable(bookFromAll, absorb.name);
            if (!keepTicket && !absorbTicket) {
              setTables((tb) => mergeSeatTables(tb, keep.id, absorb.id));
              flash(`Merged ${absorb.name} → ${keep.name} (no tickets yet)`);
              return;
            }
            if (keepTicket && absorbTicket && keepTicket.id !== absorbTicket.id) {
              if (keepTicket.status === 'Paid' || absorbTicket.status === 'Paid') {
                flash('Cannot merge a paid ticket');
                return;
              }
              const merged = mergeTicketItems(keepTicket, absorbTicket);
              commitTicket(merged, { activate: true });
              // Remove absorb ticket from book / kitchen / day orders
              setTicketBook((book) => {
                const next = { ...book };
                delete next[ticketStorageKey(absorbTicket)];
                next[ticketStorageKey(merged)] = merged;
                return next;
              });
              setKitchenBoard((board) => {
                const next = { ...board };
                delete next[absorbTicket.id];
                if (isKitchenQueueStatus(merged.status)) next[merged.id] = merged;
                return next;
              });
              setDayOrders((orders) => {
                const without = orders.filter((o) => o.id !== absorbTicket.id && o.id !== keepTicket.id);
                return [merged, ...without];
              });
              setTables((tb) =>
                linkTicket(mergeSeatTables(tb, keep.id, absorb.id), keep.name, merged.number),
              );
              setView('floor');
              flash(`Merged ${absorb.name} → ${keep.name} · ticket #${merged.number}`);
              return;
            }
            const only = keepTicket ?? absorbTicket!;
            const moved = { ...only, table: keep.name, partySize: (keep.partySize ?? 0) + (absorb.partySize ?? only.partySize) };
            commitTicket(moved, { activate: true });
            setTables((tb) => linkTicket(mergeSeatTables(tb, keep.id, absorb.id), keep.name, moved.number));
            setView('floor');
            flash(`Merged ${absorb.name} → ${keep.name}`);
          }}
          canManage={can(role.id, 'seating.manage') && shiftOpen}
          staffName={role.label}
          flash={flash}
        />
      )}

      {view === 'kitchen' && can(role.id, 'kitchen.view') && (
        <KitchenPanel
          key={`kds-${kitchenTickets.map((t) => `${t.id}:${t.status}`).join('|') || 'empty'}`}
          tickets={kitchenTickets}
          slaMinutes={settings.kitchenSlaMinutes}
          sections={extras.kitchenSections}
          canProgress={shiftOpen && can(role.id, 'order.kitchen_progress')}
          canServe={shiftOpen && can(role.id, 'order.serve')}
          canPrint={can(role.id, 'kitchen.print')}
          onAction={kitchenAction}
          onOpenTicket={(t) => {
            setTicketState(t);
            setView('floor');
            flash(`Opened ticket #${t.number} on Floor`);
          }}
          onPrintTicket={(t) => openKitchenPrint(t)}
        />
      )}

      {view === 'orders' && can(role.id, 'orders.view') && (
        <OrdersPanel
          orders={dayOrders}
          canPrintKitchen={can(role.id, 'kitchen.print')}
          deliveryRunner={can(role.id, 'delivery.run') && role.id === 'delivery'}
          canCollectPay={can(role.id, 'order.pay')}
          onCollectPay={(t) => {
            setTicketState(t);
            setPaymentMethod('Cash');
            setCashTendered(String(ticketTotals(t).total));
            setView('floor');
            flash(`Delivery #${t.number} — enter cash / card / split, then Take payment`);
          }}
          onOpen={(t) => {
            setTicketState(t);
            setView(
              t.status === 'Paid'
                ? 'orders'
                : can(role.id, 'order.pay') || can(role.id, 'order.take')
                  ? 'floor'
                  : 'kitchen',
            );
            flash(`Opened #${t.number}`);
          }}
          onPrintGuest={openGuestPrint}
          onPrintKitchen={openKitchenPrint}
        />
      )}

      {view === 'ledger' && can(role.id, 'stock.view') && (
        <LedgerPanel stock={stock} moves={moves} highlightIds={ledgerHighlight} />
      )}

      {view === 'recipes' && can(role.id, 'recipes.view') && (
        <RecipesPanel
          menu={menu}
          stock={stock}
          recipes={recipes}
          canEdit={can(role.id, 'recipes.edit')}
          onChange={setRecipes}
          flash={flash}
        />
      )}

      {view === 'floor' && (
        <div className="ury-workspace">
          <section className="ury-catalog" aria-label="Restaurant menu">
            {can(role.id, 'order.serve') && readyToServe.length > 0 && (
              <div className="ury-serve-banner" role="status">
                <div>
                  <strong>{readyToServe.length} ready to serve</strong>
                  <span>{readyToServe.map((t) => `${t.table} (#${t.number})`).join(' · ')}</span>
                </div>
                <div className="ury-serve-banner-actions">
                  {readyToServe.slice(0, 2).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="ury-submit"
                      onClick={() => {
                        setTicketState(t);
                        kitchenAction(t.id, 'mark_served');
                      }}
                    >
                      Serve {t.table}
                    </button>
                  ))}
                  <button type="button" className="ury-ghost" onClick={() => setView('kitchen')}>{navLabel('kitchen', 'Kitchen')}</button>
                </div>
              </div>
            )}
            <div className="ury-heading">
              <div>
                <div className="ury-eyebrow"><Sparkles size={13} /> {settings.restaurantName.toUpperCase()}</div>
                <h1>A good night <em>starts here.</em></h1>
                <p>
                  {status === 'Paid'
                    ? 'Ticket is paid — tap New ticket to add dishes again.'
                    : status === 'Ready' && type === 'Dine in'
                      ? 'Kitchen marked Ready — tap Mark served, then Cashier pays.'
                      : 'Tap any dish to add it to the ticket, then Send to kitchen.'}
                </p>
              </div>
              <button type="button" className="ury-new-ticket" onClick={startNewTicket}>New ticket</button>
              <div className="ury-service-picker" aria-label="Order type">
                <button className={type === 'Dine in' ? 'selected' : ''} type="button" onClick={() => setType('Dine in')} aria-pressed={type === 'Dine in'} disabled={!canEditTicket(status)}><Utensils /> Dine in</button>
                <button className={type === 'Takeaway' ? 'selected' : ''} type="button" onClick={() => setType('Takeaway')} aria-pressed={type === 'Takeaway'} disabled={!canEditTicket(status)}><ShoppingBag /> Takeaway</button>
                <button className={type === 'Delivery' ? 'selected' : ''} type="button" onClick={() => setType('Delivery')} aria-pressed={type === 'Delivery'} disabled={!canEditTicket(status)}><Truck /> Delivery</button>
              </div>
            </div>
            <div className="ury-menu-tools">
              <label className="ury-search">
                <Search size={17} aria-hidden="true" />
                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes…" aria-label="Search menu" disabled={!can(role.id, 'order.take')} />
                {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ display: 'grid', placeItems: 'center', border: 0, padding: 2, color: '#829087', background: 'transparent' }}><X size={15} /></button> : <kbd>/</kbd>}
              </label>
              <button className="ury-reset" type="button" onClick={() => { setCategory('All dishes'); setQuery(''); }}><SlidersHorizontal size={15} /> All dishes <ChevronDown size={14} /></button>
            </div>
            <nav className="ury-category-row" aria-label="Menu categories">
              {[...categories, ...(extras.combos.length ? ['Combos'] : [])].map((name) => <button key={name} className={`ury-category ${category === name ? 'active' : ''}`} onClick={() => setCategory(name)} type="button" aria-pressed={category === name}>{name}</button>)}
            </nav>
            <div className="ury-menu-meta"><span>{category === 'All dishes' ? 'HOUSE FAVORITES' : category.toUpperCase()}</span><b>{visibleMenu.length.toString().padStart(2, '0')} DISHES</b></div>
            {visibleMenu.length ? (
              <div className="ury-menu-grid">
                {visibleMenu.map((dish, index) => {
                  const quantity = items.find((item) => item.menuItem.id === dish.id)?.quantity ?? 0;
                  return (
                    <button key={dish.id} type="button" className="ury-dish" disabled={!dish.available} onClick={() => addDish(dish)} aria-label={`Add ${dish.name}`} style={{ animationDelay: `${index * 35}ms` }}>
                      <span className="ury-dish-photo">
                        <img src={dish.image} alt={dish.name} loading={index < 4 ? 'eager' : 'lazy'} />
                        {dish.id === 'gnocchi' && <span className="ury-dish-badge"><Sparkles size={10} /> HOUSE FAVORITE</span>}
                        {quantity > 0 && <span className="ury-dish-count"><Check size={11} /> {quantity}</span>}
                        <span className="ury-dish-add"><Plus size={17} /></span>
                      </span>
                      <span className="ury-dish-copy">
                        <span className="ury-dish-category">{dish.category}</span>
                        <span className="ury-dish-name">{dish.name}</span>
                        <span className="ury-dish-description">{dish.description}</span>
                        <span className="ury-dish-bottom">
                          <span className="ury-dish-price">{money(dish.price)}</span>
                          <span className="ury-tags">{dish.dietaryTags.slice(0, 1).map((tag) => <span className="ury-tag" key={tag}><Leaf size={9} /> {tag}</span>)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ury-no-results"><span><Search size={20} /></span><h3>No dishes found</h3><p>Try a different search.</p></div>
            )}
          </section>

          <aside className="ury-ticket" aria-label="Active order ticket">
            <div className="ury-ticket-head">
              <div className="ury-ticket-label"><span>ACTIVE TICKET</span><span className="ury-ticket-number">#{ticket.number}</span></div>
              <div className="ury-ticket-titleline">
                <h2>Order details</h2>
                <span className="ury-count">{itemCount}</span>
                <span className={`ury-status ${status !== 'Open' ? 'sent' : ''}`}>
                  <span>{status === 'Open' ? <Clock3 size={11} /> : <CheckCircle2 size={11} />}</span>{status}
                </span>
              </div>
              <div className="ury-process" aria-label="Order process">
                {PROCESS_STEPS.map((label, i) => (
                  <span key={label} className={i < step ? 'done' : i === step ? 'current' : ''}>
                    <i />
                    {label}
                  </span>
                ))}
              </div>
              <div className="ury-ticket-context">
                <span className="ury-context-icon">
                  {type === 'Dine in' ? <Utensils size={16} /> : type === 'Delivery' ? <Truck size={16} /> : <ShoppingBag size={16} />}
                </span>
                <span className="ury-context-copy">
                  <small>Service</small>
                  <strong>
                    {type === 'Dine in'
                      ? `Dine in · ${partySize} guests`
                      : type === 'Delivery'
                        ? 'Delivery · courier'
                        : 'Takeaway · counter'}
                  </strong>
                </span>
                {type === 'Dine in' && (
                  <select
                    value={table}
                    onChange={(e) => canAdd && setTicket((t) => ({ ...t, table: e.target.value }))}
                    aria-label="Select table"
                    disabled={!canAdd}
                  >
                    {tables.map((place) => <option key={place.id} value={place.name}>{place.name}</option>)}
                  </select>
                )}
              </div>
              {type === 'Dine in' && (
                <div className="ury-party">
                  <span>Party</span>
                  <button type="button" onClick={() => canAdd && setTicket((t) => ({ ...t, partySize: Math.max(1, t.partySize - 1) }))} disabled={!canAdd} aria-label="Decrease party"><Minus size={12} /></button>
                  <strong>{partySize}</strong>
                  <button type="button" onClick={() => canAdd && setTicket((t) => ({ ...t, partySize: Math.min(12, t.partySize + 1) }))} disabled={!canAdd} aria-label="Increase party"><Plus size={12} /></button>
                  <span style={{ marginLeft: 'auto', color: '#9b9b8c' }}>Opened {ticket.openedAt}</span>
                </div>
              )}
              {type === 'Delivery' && (
                <div className="ury-delivery-fields" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <label className="ury-field">
                    <span>Customer name</span>
                    <input
                      value={ticket.customerName ?? ''}
                      disabled={!canAdd}
                      placeholder="Guest full name"
                      onChange={(e) => canAdd && setTicket((t) => ({ ...t, customerName: e.target.value }))}
                    />
                  </label>
                  <label className="ury-field">
                    <span>Phone</span>
                    <input
                      value={ticket.customerPhone ?? ''}
                      disabled={!canAdd}
                      placeholder="Mobile number"
                      inputMode="tel"
                      onChange={(e) => canAdd && setTicket((t) => ({ ...t, customerPhone: e.target.value }))}
                    />
                  </label>
                  <label className="ury-field">
                    <span>Delivery address</span>
                    <input
                      value={ticket.deliveryAddress ?? ''}
                      disabled={!canAdd}
                      placeholder="Street, building, area"
                      onChange={(e) => canAdd && setTicket((t) => ({ ...t, deliveryAddress: e.target.value }))}
                    />
                  </label>
                  <label className="ury-field">
                    <span>Driver (collects payment)</span>
                    <input
                      value={ticket.driverName ?? ''}
                      disabled={status === 'Paid'}
                      placeholder="Rider name"
                      onChange={(e) => setTicket((t) => ({ ...t, driverName: e.target.value }))}
                    />
                  </label>
                  <label className="ury-field">
                    <span>Payment mode</span>
                    <select
                      value={ticket.deliveryPayMode ?? 'Cash on delivery'}
                      disabled={!canAdd}
                      onChange={(e) =>
                        canAdd &&
                        setTicket((t) => ({
                          ...t,
                          deliveryPayMode: e.target.value as DeliveryPayMode,
                        }))
                      }
                    >
                      <option value="Cash on delivery">Cash on delivery</option>
                      <option value="Card on delivery">Card on delivery</option>
                      <option value="UPI">UPI</option>
                      <option value="Paid online">Paid online</option>
                    </select>
                  </label>
                  <label className="ury-field">
                    <span>Courier note (optional)</span>
                    <input
                      value={ticket.deliveryNote ?? ''}
                      disabled={!canAdd}
                      placeholder="Gate code, landmark, allergy…"
                      onChange={(e) => canAdd && setTicket((t) => ({ ...t, deliveryNote: e.target.value }))}
                    />
                  </label>
                </div>
              )}
            </div>

            {(type === 'Takeaway' || type === 'Delivery') && (
              <div className="ury-form-row" style={{ marginBottom: 8 }}>
                <label className="ury-field">
                  <span>{type === 'Takeaway' ? 'Pickup time' : 'Delivery time'}</span>
                  <input type="time" value={ticket.scheduledFor ?? ''} disabled={!canAdd} onChange={(e) => canAdd && setTicket((t) => ({ ...t, scheduledFor: e.target.value || undefined }))} />
                </label>
                <label className="ury-field">
                  <span>Channel</span>
                  <select value={ticket.channel ?? 'Walk-in'} disabled={!canAdd} onChange={(e) => canAdd && setTicket((t) => ({ ...t, channel: e.target.value as Ticket['channel'] }))}>
                    <option>Walk-in</option>
                    <option>Phone</option>
                    <option>Online</option>
                  </select>
                </label>
              </div>
            )}

            {items.length ? (
              <div className="ury-ticket-items pos-scroll">
                {sanitizeOrderLines(items).map((line, index) => {
                  const { menuItem: dish, quantity, notes } = line;
                  const amt = lineAmount(line, type);
                  return (
                  <div className="ury-ticket-item" key={dish.id}>
                    <div className="ury-item-main">
                      <span className="ury-item-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ury-item-copy">
                        <strong>{dish.name}</strong>
                        <small>{money(unitPrice(dish, type))} each{notes ? ` · ${notes}` : ''}{line.discount ? ` · item discount ${line.discount.kind === 'percent' ? `${line.discount.value}%` : money(line.discount.value)} (${line.discount.reason})` : ''}</small>
                      </span>
                      <span className="ury-item-total">{money(amt.net)}</span>
                      {role && can(role.id, 'order.discount') && canAdd && (
                        <button type="button" className="ury-ghost" onClick={() => {
                          const raw = window.prompt(`Item discount for ${dish.name} — enter % (e.g. 10%) or amount, blank to clear`, line.discount ? String(line.discount.value) : '');
                          if (raw === null) return;
                          const trimmed = raw.trim();
                          if (!trimmed) {
                            setTicket((t) => ({ ...t, items: t.items.map((l) => (l.menuItem.id === dish.id ? { ...l, discount: undefined } : l)) }));
                            return;
                          }
                          const isPct = trimmed.endsWith('%');
                          const n = Number(trimmed.replace('%', ''));
                          if (!(n > 0) || (isPct && n > 100)) { flash('Enter a valid discount'); return; }
                          const reason = (window.prompt('Reason for item discount (required)', '') ?? '').trim();
                          if (!reason) { flash('Item discount needs a reason'); return; }
                          setTicket((t) => ({ ...t, items: t.items.map((l) => (l.menuItem.id === dish.id ? { ...l, discount: { kind: isPct ? 'percent' : 'amount', value: n, reason, by: role.label } } : l)) }));
                          notifyTrigger('discount_applied', { value: isPct ? n : undefined, ticket: ticket.number, by: operator || role.label });
                        }}>%</button>
                      )}
                    </div>
                    <div className="ury-item-tools">
                      <span className="ury-quantity">
                        <button type="button" aria-label={`Decrease ${dish.name}`} onClick={() => updateItem(dish.id, -1)} disabled={!canAdd}><Minus size={12} /></button>
                        <b>{quantity}</b>
                        <button type="button" aria-label={`Increase ${dish.name}`} onClick={() => updateItem(dish.id, 1)} disabled={!canAdd}><Plus size={12} /></button>
                      </span>
                      <button type="button" className="ury-note-button" onClick={() => canAdd && setExpandedNote(expandedNote === dish.id ? null : dish.id)} disabled={!canAdd} aria-expanded={expandedNote === dish.id}>
                        <ChefHat size={12} /> {notes ? 'Edit note' : 'Note'}
                      </button>
                      <button type="button" className="ury-remove" onClick={() => canAdd && setTicket((t) => ({ ...t, items: removeLine(t.items, dish.id) }))} disabled={!canAdd} aria-label={`Remove ${dish.name}`}><X size={14} /></button>
                      {role && status !== 'Paid' && (canAdd || can(role.id, 'order.void')) && (
                        <button type="button" className="ury-ghost" onClick={() => cancelDishLine(dish.id)} title="Cancel with reason (logged in reports)">Cancel</button>
                      )}
                    </div>
                    {expandedNote === dish.id && (
                      <textarea className="ury-note" value={notes} onChange={(e) => updateNote(dish.id, e.target.value)} placeholder="Kitchen note…" disabled={!canAdd} />
                    )}
                  </div>
                  );
                })}

                {type === 'Dine in' && canTakeOrders && status !== 'Paid' && items.length > 0 && (
                  <div className="ury-form-card" style={{ margin: '12px 0 4px', padding: 12 }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Move dishes to another table</h3>
                    <p className="ury-muted" style={{ margin: '0 0 8px', fontSize: 11 }}>
                      e.g. 4 dishes ordered — keep 2 here, move 2 to Table 07
                    </p>
                    <label className="ury-field">
                      <span>Dish</span>
                      <select
                        value={moveDishId || items[0]?.menuItem.id || ''}
                        onChange={(e) => {
                          setMoveDishId(e.target.value);
                          const line = items.find((l) => l.menuItem.id === e.target.value);
                          setMoveQty(line ? String(Math.min(line.quantity, 1)) : '1');
                        }}
                      >
                        {items.map((l) => (
                          <option key={l.menuItem.id} value={l.menuItem.id}>
                            {l.menuItem.name} ({l.quantity} on this ticket)
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="ury-form-row">
                      <label className="ury-field">
                        <span>Qty to move</span>
                        <input
                          value={moveQty}
                          inputMode="numeric"
                          onChange={(e) => setMoveQty(e.target.value)}
                        />
                      </label>
                      <label className="ury-field">
                        <span>To table</span>
                        <select value={moveToTable} onChange={(e) => setMoveToTable(e.target.value)}>
                          <option value="">Select…</option>
                          {tables
                            .filter((t) => t.name !== table)
                            .map((t) => (
                              <option key={t.id} value={t.name}>
                                {t.name}
                                {t.status !== 'free' ? ` · ${t.status}` : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <label className="ury-field">
                      <span>…or new table name (split to a new table)</span>
                      <input value={moveNewTable} onChange={(e) => setMoveNewTable(e.target.value)} placeholder="e.g. Table 04-B" />
                    </label>
                    <button type="button" className="ury-submit" onClick={moveDishesToOtherTable}>
                      Move to table
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="ury-ticket-empty">
                <span><ShoppingBag size={23} /></span>
                <strong>Ticket is empty</strong>
                <p>Tap a dish on the left to add it.</p>
                <button type="button" className="ury-ghost" style={{ marginTop: 12 }} onClick={startNewTicket}>New ticket</button>
              </div>
            )}

            <div className="ury-payment">
              {(can(role.id, 'order.pay') || status === 'Served' || status === 'Ready') && (
                <>
                  <div className="ury-section-label"><span>PAYMENT</span><span>{can(role.id, 'order.pay') ? 'OPEN' : 'VIEW'}</span></div>
                  <div className="ury-pay-options">
                    <button type="button" className={paymentMethod === 'Card' ? 'selected' : ''} onClick={() => setPaymentMethod('Card')} disabled={!can(role.id, 'order.pay')}><CreditCard size={16} /> Card {paymentMethod === 'Card' && <Check size={12} />}</button>
                    <button type="button" className={paymentMethod === 'Cash' ? 'selected' : ''} onClick={() => { setPaymentMethod('Cash'); if (!cashTendered) setCashTendered(String(total)); }} disabled={!can(role.id, 'order.pay')}><Banknote size={16} /> Cash {paymentMethod === 'Cash' && <Check size={12} />}</button>
                    <button type="button" className={paymentMethod === 'Split' ? 'selected' : ''} onClick={() => { setPaymentMethod('Split'); if (!splitCash && !splitCard) { setSplitCash(String(Math.round(total / 2 * 100) / 100)); setSplitCard(String(Math.round((total - total / 2) * 100) / 100)); } }} disabled={!can(role.id, 'order.pay')}><Combine size={16} /> Split {paymentMethod === 'Split' && <Check size={12} />}</button>
                    <button type="button" className={paymentMethod === 'Credit' ? 'selected' : ''} onClick={() => setPaymentMethod('Credit')} disabled={!can(role.id, 'order.pay')}>Credit {paymentMethod === 'Credit' && <Check size={12} />}</button>
                    <button type="button" className={paymentMethod === 'Loyalty' ? 'selected' : ''} onClick={() => setPaymentMethod('Loyalty')} disabled={!can(role.id, 'order.pay')}>Loyalty {paymentMethod === 'Loyalty' && <Check size={12} />}</button>
                  </div>
                  {can(role.id, 'order.pay') && paymentMethod === 'Cash' && (
                    <div className="ury-pay-tender" style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <label className="ury-field">
                        <span>Cash received</span>
                        <input
                          value={cashTendered}
                          inputMode="decimal"
                          placeholder={String(total)}
                          onChange={(e) => setCashTendered(e.target.value)}
                        />
                      </label>
                      <div className="ury-total-line">
                        <span>Change due</span>
                        <strong>
                          {money(Math.max(0, Math.round(((Number(cashTendered) || 0) - total) * 100) / 100))}
                        </strong>
                      </div>
                    </div>
                  )}
                  {can(role.id, 'order.pay') && paymentMethod === 'Credit' && (
                    <label className="ury-field" style={{ marginTop: 8 }}>
                      <span>Credit customer name</span>
                      <input value={ticket.customerName ?? ''} placeholder="Account holder" onChange={(e) => canAdd && setTicket((t) => ({ ...t, customerName: e.target.value }))} />
                    </label>
                  )}
                  {can(role.id, 'order.pay') && (
                    <label className="ury-field" style={{ marginTop: 8 }}>
                      <span>Tip (not taxed)</span>
                      <input
                        value={ticket.tip ? String(ticket.tip) : ''}
                        inputMode="decimal"
                        placeholder="0"
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          commitTicket({ ...ticket, tip: v || undefined }, { activate: true });
                        }}
                      />
                    </label>
                  )}
                  {can(role.id, 'order.pay') && paymentMethod === 'Split' && (
                    <div className="ury-pay-tender" style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <div className="ury-form-row">
                        <label className="ury-field">
                          <span>Cash amount</span>
                          <input value={splitCash} inputMode="decimal" onChange={(e) => setSplitCash(e.target.value)} />
                        </label>
                        <label className="ury-field">
                          <span>Card amount</span>
                          <input value={splitCard} inputMode="decimal" onChange={(e) => setSplitCard(e.target.value)} />
                        </label>
                      </div>
                      <div className="ury-total-line">
                        <span>Cash + Card</span>
                        <strong>{money((Number(splitCash) || 0) + (Number(splitCard) || 0))}</strong>
                      </div>
                    </div>
                  )}
                </>
              )}
              {items.length > 0 && status !== 'Paid' && role && (
                <BillDiscountControl
                  discount={ticket.discount}
                  canApply={can(role.id, 'order.discount')}
                  onApply={applyBillDiscount}
                />
              )}
              <div className="ury-totals">
                <div className="ury-total-line"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                {discountAmt > 0 && (
                  <div className="ury-total-line">
                    <span>Discount{ticket.discount?.kind === 'percent' ? ` ${ticket.discount.value}%` : ''}</span>
                    <strong>−{money(discountAmt)}</strong>
                  </div>
                )}
                <div className="ury-total-line"><span>Tax 8.25%</span><strong>{money(tax)}</strong></div>
                {!!ticket.tip && <div className="ury-total-line"><span>Tip</span><strong>{money(ticket.tip)}</strong></div>}
                <div className="ury-grand"><span>Total</span><strong>{money(amountDue(ticket))}</strong></div>
              </div>

              {ticket.kitchenRejectReason && status === 'Open' && (
                <p className="ury-muted" style={{ color: '#a85840', fontWeight: 600 }}>
                  Kitchen rejected: {ticket.kitchenRejectReason} — edit &amp; send again
                </p>
              )}

              {primary && (
                <button type="button" className="ury-submit" onClick={() => dispatch(primary.action)} disabled={!items.length && primary.action !== 'new_order'}>
                  <span>{primary.label}</span>
                  <span className="ury-submit-end">
                    {primary.action === 'take_payment' ? money(amountDue(ticket)) : primary.action === 'send_to_kitchen' ? <><Send size={15} /> {itemCount}</> : <ArrowRight size={15} />}
                  </span>
                </button>
              )}

              <div className="ury-ticket-footer">
                <div className="ury-action-row">
                  {items.length > 0 && (
                    <button type="button" className="ury-ghost" onClick={() => openGuestPrint(ticket)}>
                      <Printer size={12} aria-hidden />
                      <span>Print</span>
                    </button>
                  )}
                  {items.length > 0 && can(role.id, 'invoice.tax') && (
                    <button type="button" className="ury-ghost" onClick={() => openTaxInvoice(ticket)}>
                      <Printer size={12} aria-hidden />
                      <span>Tax invoice</span>
                    </button>
                  )}
                  {items.length > 0 && can(role.id, 'kitchen.print') && status !== 'Open' && status !== 'Paid' && (
                    <button type="button" className="ury-ghost" onClick={() => openKitchenPrint(ticket)}>
                      <Printer size={12} aria-hidden />
                      <span>Kitchen</span>
                    </button>
                  )}
                  {type === 'Dine in' && canAdd && items.length > 1 && (
                    <button type="button" className="ury-ghost" onClick={splitBillOut}>Split bill</button>
                  )}
                  {can(role.id, 'order.void') && status !== 'Paid' && (
                    <button type="button" className="ury-ghost" onClick={() => dispatch('void_ticket')}>Void</button>
                  )}
                  <button type="button" className="ury-ghost" onClick={startNewTicket}>New</button>
                </div>
                {can(role.id, 'order.send_kitchen') && (
                  <label className="ury-ticket-check">
                    <input type="checkbox" checked={printKitchenOnSend} onChange={(e) => setPrintKitchenOnSend(e.target.checked)} />
                    <span>Print kitchen chit when sending</span>
                  </label>
                )}
                <p className="ury-demo-note">Send to kitchen → KDS · Orders tab for today</p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {view === 'stock' && can(role.id, 'stock.view') && (
        <StockPanel
          stock={stock}
          stockByStore={stockByStore}
          activeStoreId={activeStoreId}
          moves={moves}
          canAdjust={can(role.id, 'stock.adjust')}
          staffName={role.label}
          onStock={setStock}
          onStockByStore={setStockByStore}
          onActiveStore={selectStore}
          onMove={(move) => setMoves((m) => [move, ...m].slice(0, 80))}
          flash={flash}
        />
      )}

      {view === 'reports' && can(role.id, 'reports.view') && (
        <ReportsPanel
          sales={sales}
          moves={moves}
          restaurantName={settings.restaurantName}
          taxRatePct={settings.taxRatePct}
          branchId={branchId}
          branchName={branch.name}
          reportColumns={extras.reportColumns}
          excelTemplate={extras.excelTemplate}
          openTickets={Array.from(allTicketsById.values())}
          accountPayments={extras.accountPayments}
          statementTemplate={extras.statementTemplate}
          onRecordPayment={(payment) => setExtras((prev) => ({ ...prev, accountPayments: [...prev.accountPayments, payment] }))}
          canExport={can(role.id, 'reports.export')}
          flash={flash}
          onReprint={(sale) => { setReprintSale(sale); window.setTimeout(() => window.print(), 250); }}
        />
      )}

      {view === 'shifts' && can(role.id, 'shift.manage') && (
        <ShiftsPanel
          shift={shift}
          history={shiftHistory}
          sales={sales}
          staffName={role.label}
          canManage={can(role.id, 'shift.manage')}
          onShift={commitShift}
          onHistory={commitShiftHistory}
          onCloseShift={commitCloseShift}
          openTicketCount={Object.values(ticketBook).filter((t) => t.status !== 'Paid' && t.items.length > 0).length}
          otherCashierStations={Object.entries(extras.presence).filter(([id, p]) => id !== tabIdRef.current && ['cashier', 'cashier2', 'supervisor'].includes(p.role) && Date.now() - p.at < 90_000).length}
          flash={flash}
          posProfile={erpMeta.pos_profile}
        />
      )}

      {view === 'accounting' && can(role.id, 'accounting.view') && (
        <AccountingPanel
          moves={moves}
          sales={sales}
          taxRatePct={settings.taxRatePct}
          shift={shift}
          restaurantName={settings.restaurantName}
        />
      )}

      {view === 'features' && can(role.id, 'features.view') && (
        <FeaturesPanel
          features={features}
          canEdit={can(role.id, 'settings.edit')}
          onChange={saveFeaturesToErp}
          flash={flash}
        />
      )}

      {view === 'admin' && can(role.id, 'settings.edit') && (
        <AdminPanel
          extras={extras}
          onChange={saveExtrasToErp}
          menuIds={(menuBase.length ? menuBase : BASE_MENU).map((m) => ({ id: m.id, name: m.name }))}
          menuItems={menuBase.length ? menuBase : BASE_MENU}
          tables={tables}
          onTablesChange={saveTablesToErp}
          sampleSales={sales as unknown as Array<Record<string, string | number | undefined>>}
          roles={ROLES.map((r) => ({ id: r.id, label: r.label, pin: extras.pinOverrides[r.id] || r.pin }))}
          viewIds={[
            { id: 'seating', label: 'Seating' }, { id: 'floor', label: 'Floor' }, { id: 'kitchen', label: 'Kitchen' },
            { id: 'orders', label: 'Orders' }, { id: 'ledger', label: 'Ledger' }, { id: 'recipes', label: 'Recipes' },
            { id: 'stock', label: 'Stock' }, { id: 'shifts', label: 'Shifts' }, { id: 'accounting', label: 'Accounting' },
            { id: 'reports', label: 'Reports' }, { id: 'features', label: 'Features' }, { id: 'settings', label: 'Settings' },
            { id: 'admin', label: 'Admin' },
          ]}
          onBackup={() => ({ ...sharedRef.current, extras })}
          onRestore={(data) => {
            const next = data as Parameters<typeof saveSession>[0];
            saveSession(next);
            persistErpConfig({
              extras: next.extras,
              settings: next.settings,
              features: next.features,
              tables: next.tables,
            });
            window.location.reload();
          }}
          flash={flash}
        />
      )}

      {view === 'settings' && (
        <SettingsPanel
          settings={settings}
          canEdit={can(role.id, 'settings.edit')}
          onChange={saveSettingsToErp}
          flash={flash}
          onResetDay={can(role.id, 'settings.edit') ? resetDemoDay : undefined}
        />
      )}

      {notice && <div className="ury-notice" role="status"><CheckCircle2 size={15} />{notice}</div>}

      {deductionModal && (
        <div className="ury-modal-scrim" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setDeductionModal(null); }}>
          <section className="ury-receipt ury-stock-modal" role="dialog" aria-modal="true">
            <button type="button" className="ury-receipt-close" onClick={() => setDeductionModal(null)} aria-label="Close"><X size={18} /></button>
            <div className="ury-receipt-check"><Package size={22} /></div>
            <div className="ury-receipt-kicker">RECIPE STOCK DEDUCTED</div>
            <h2>Kitchen ticket locked stock.</h2>
            <p className="ury-receipt-sub">BOM pulled when order was sent to kitchen</p>
            <div className="ury-receipt-rule"><span /> STOCK <span /></div>
            {deductionModal.map((d) => (
              <div key={d.dishId} className="ury-deduct-block">
                <strong>{d.dishQty}× {d.dishName}</strong>
                {d.lines.map((l) => (
                  <div key={l.ingredientId} className="ury-receipt-item">
                    <span>{l.name}</span>
                    <strong>−{qtyLabel(l.qty, l.unit)} <small>({qtyLabel(l.before, l.unit)} → {qtyLabel(l.after, l.unit)})</small></strong>
                  </div>
                ))}
              </div>
            ))}
            <div className="ury-receipt-actions">
              <button type="button" onClick={() => { setDeductionModal(null); setView('ledger'); }}>Open ledger <ArrowRight size={15} /></button>
            </div>
          </section>
        </div>
      )}

      {receipt && (
        <div className="ury-modal-scrim" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setReceipt(null); }}>
          <section className="ury-receipt" role="dialog" aria-modal="true">
            <button type="button" className="ury-receipt-close" onClick={() => setReceipt(null)} aria-label="Close"><X size={18} /></button>
            <div className="ury-receipt-check"><Check size={24} /></div>
            <div className="ury-receipt-kicker">PAYMENT COMPLETE</div>
            <h2>Thank you.</h2>
            <p className="ury-receipt-sub">{receipt.type === 'Dine in' ? receipt.table : receipt.type} · {receipt.paymentMethod} · {receipt.paidAt}</p>
            <div className="ury-receipt-rule"><span /> URY <span /></div>
            <div className="ury-receipt-meta"><span>RECEIPT</span><strong>{receipt.receiptNumber}</strong></div>
            <div className="ury-receipt-items">
              {sanitizeOrderLines(receipt.items).map(({ menuItem: dish, quantity }) => (
                <div key={dish.id} className="ury-receipt-item"><span>{quantity} × {dish.name}</span><strong>{money(dish.price * quantity)}</strong></div>
              ))}
            </div>
            <div className="ury-receipt-total"><span>Total paid</span><strong>{money(receipt.total)}</strong></div>
            <div className="ury-receipt-note">{settings.receiptFooter} · {role.label}</div>
            <div className="ury-receipt-actions">
              <button type="button" onClick={() => dispatch('new_order')}>Next order <ArrowRight size={15} /></button>
              <button type="button" onClick={() => { flash('Printing guest receipt'); window.print(); }} aria-label="Print"><Printer size={15} /> Print</button>
            </div>
          </section>
        </div>
      )}

      {kitchenPrint && (
        <div className="ury-kitchen-print-sheet" aria-hidden={!kitchenPrint}>
          <div className="ury-kprint">
            <button type="button" className="ury-receipt-close no-print" onClick={() => setKitchenPrint(null)} aria-label="Close"><X size={18} /></button>
            <h2>KITCHEN CHIT</h2>
            <p>#{kitchenPrint.number} · {kitchenPrint.type} · {kitchenPrint.table}</p>
            <p>{branch.name} · {kitchenPrint.sentAt ?? kitchenPrint.openedAt}</p>
            {kitchenPrint.customerName ? <p>Guest: {kitchenPrint.customerName}</p> : null}
            {kitchenPrint.customerPhone ? <p>Phone: {kitchenPrint.customerPhone}</p> : null}
            {kitchenPrint.deliveryAddress ? <p>Addr: {kitchenPrint.deliveryAddress}</p> : null}
            {kitchenPrint.deliveryPayMode ? <p>Pay: {kitchenPrint.deliveryPayMode}</p> : null}
            {kitchenPrint.deliveryNote ? <p>Note: {kitchenPrint.deliveryNote}</p> : null}
            <hr />
            <ul>
              {sanitizeOrderLines(kitchenPrint.items).map((l) => (
                <li key={l.menuItem.id}>
                  <b>{l.quantity}×</b> {l.menuItem.name}
                  {l.notes ? <em> — {l.notes}</em> : null}
                </li>
              ))}
            </ul>
            <div className="ury-receipt-actions no-print" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => window.print()}><Printer size={15} /> Print chit</button>
              <button type="button" onClick={() => setKitchenPrint(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="ury-notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className="ury-notice-item">
            <span>{n.text}</span>
            <button type="button" onClick={() => setDismissedNotices((d) => [...d, n.id])} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>

      {reprintSale && (
        <div className="ury-kitchen-print-sheet" aria-hidden={!reprintSale}>
          <div className="ury-kprint ury-guest-print">
            <button type="button" className="ury-receipt-close no-print" onClick={() => setReprintSale(null)} aria-label="Close"><X size={18} /></button>
            <h2>REPRINT · #{reprintSale.ticketNumber}</h2>
            <p>{settings.restaurantName} · {reprintSale.type} · {reprintSale.table}</p>
            <p>Paid {reprintSale.at || '-'} · {reprintSale.paymentMethod}{reprintSale.customerName ? ` · ${reprintSale.customerName}` : ''}</p>
            <hr />
            <ul>
              {reprintSale.lines.map((l, i) => (
                <li key={`${l.name}-${i}`}><b>{l.qty}×</b> {l.name}<span style={{ float: 'right' }}>{money(l.amount)}</span></li>
              ))}
            </ul>
            {!!reprintSale.discount && <p>Discount <span style={{ float: 'right' }}>−{money(reprintSale.discount)}</span></p>}
            {!!reprintSale.tip && <p>Tip <span style={{ float: 'right' }}>{money(reprintSale.tip)}</span></p>}
            <p style={{ marginTop: 12, fontWeight: 700 }}>Total <span style={{ float: 'right' }}>{money(reprintSale.total)}</span></p>
            <p className="ury-muted">Reprint copy</p>
            <div className="ury-receipt-actions no-print" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>
              <button type="button" onClick={() => setReprintSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {taxInvoice && (
        <div className="ury-kitchen-print-sheet" aria-hidden={!taxInvoice}>
          <div className="ury-kprint ury-guest-print">
            <button type="button" className="ury-receipt-close no-print" onClick={() => setTaxInvoice(null)} aria-label="Close"><X size={18} /></button>
            <h2>TAX INVOICE</h2>
            <p>{settings.restaurantName} · {branch.name}</p>
            <p>Invoice {taxInvoice.ticket.receiptNumber ?? `TI-${taxInvoice.ticket.number}`} · {taxInvoice.issuedAt}</p>
            <p>{taxInvoice.ticket.type} · {taxInvoice.ticket.table}</p>
            {taxInvoice.customerName ? <p>Customer: {taxInvoice.customerName}</p> : null}
            {taxInvoice.taxId ? <p>Customer tax ID: {taxInvoice.taxId}</p> : null}
            <hr />
            <ul>
              {sanitizeOrderLines(taxInvoice.ticket.items).map((l) => (
                <li key={l.menuItem.id}>
                  <b>{l.quantity}×</b> {l.menuItem.name}
                  <span style={{ float: 'right' }}>{money(lineAmount(l, taxInvoice.ticket.type).net)}</span>
                </li>
              ))}
            </ul>
            <hr />
            <p>Subtotal <span style={{ float: 'right' }}>{money(ticketTotals(taxInvoice.ticket).subtotal)}</span></p>
            {ticketTotals(taxInvoice.ticket).discount > 0 && (
              <p>
                Discount {taxInvoice.ticket.discount?.reason ? `(${taxInvoice.ticket.discount.reason})` : ''}
                <span style={{ float: 'right' }}>−{money(ticketTotals(taxInvoice.ticket).discount)}</span>
              </p>
            )}
            <p>Taxable value <span style={{ float: 'right' }}>{money(ticketTotals(taxInvoice.ticket).subtotal - ticketTotals(taxInvoice.ticket).discount)}</span></p>
            <p>Tax ({settings.taxRatePct}%) <span style={{ float: 'right' }}>{money(ticketTotals(taxInvoice.ticket).tax)}</span></p>
            <p style={{ marginTop: 8, fontWeight: 700 }}>Total <span style={{ float: 'right' }}>{money(ticketTotals(taxInvoice.ticket).total)}</span></p>
            <div className="ury-receipt-actions no-print" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>
              <button type="button" onClick={() => setTaxInvoice(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {guestPrint && (
        <div className="ury-kitchen-print-sheet" aria-hidden={!guestPrint}>
          <div className="ury-kprint ury-guest-print">
            <button type="button" className="ury-receipt-close no-print" onClick={() => setGuestPrint(null)} aria-label="Close"><X size={18} /></button>
            <h2>ORDER · #{guestPrint.number}</h2>
            <p>{guestPrint.type} · {guestPrint.table} · {guestPrint.status}</p>
            <p>{branch.name} · {guestPrint.openedAt}</p>
            {guestPrint.customerName ? <p>Guest: {guestPrint.customerName}</p> : null}
            {guestPrint.customerPhone ? <p>Phone: {guestPrint.customerPhone}</p> : null}
            {guestPrint.deliveryAddress ? <p>Addr: {guestPrint.deliveryAddress}</p> : null}
            {guestPrint.deliveryPayMode ? <p>Pay: {guestPrint.deliveryPayMode}</p> : null}
            {guestPrint.driverName ? <p>Driver: {guestPrint.driverName}</p> : null}
            {guestPrint.deliveryNote ? <p>Note: {guestPrint.deliveryNote}</p> : null}
            <hr />
            <ul>
              {sanitizeOrderLines(guestPrint.items).map((l) => (
                <li key={l.menuItem.id}>
                  <b>{l.quantity}×</b> {l.menuItem.name}
                  <span style={{ float: 'right' }}>{money(lineAmount(l, guestPrint.type).net)}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12, fontWeight: 700 }}>Total {money(guestPrint.total)}</p>
            <div className="ury-receipt-actions no-print" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>
              <button type="button" onClick={() => setGuestPrint(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LoginStyles() {
  return (
    <style>{`
      .ury-login { min-height:100dvh; display:grid; place-items:center; padding:24px; background:
        radial-gradient(900px 420px at 10% -10%, #d9e4d4 0%, transparent 55%),
        radial-gradient(700px 380px at 100% 0%, #e8d7b8 0%, transparent 50%),
        #f4f1e8; color:#263a33; font-family:'DM Sans',sans-serif; }
      .ury-login-card { width:min(100%,560px); padding:28px; border:1px solid #e4dfd1; border-radius:14px; background:#fffdf7; box-shadow:0 18px 50px #24392e18; }
      .ury-login-brand { display:flex; gap:12px; align-items:center; margin-bottom:14px; }
      .ury-login-brand .ury-mark { display:grid; place-items:center; width:40px; height:40px; border:1px solid rgba(228,191,133,.68); border-radius:50%; color:#c39153; font:700 22px Georgia,serif; background:#25483a; }
      .ury-login-brand strong { display:block; font:700 16px Manrope,sans-serif; letter-spacing:.08em; color:#203d34; }
      .ury-login-brand small { color:#829087; font-size:11px; }
      .ury-login-lead { margin:0 0 18px; color:#66756a; font-size:13px; line-height:1.5; }
      .ury-role-grid { display:grid; gap:10px; }
      .ury-role-card { display:flex; align-items:center; gap:12px; width:100%; padding:14px; border:1px solid #e7e2d6; border-radius:10px; background:#faf8f1; text-align:left; color:inherit; cursor:pointer; transition:transform .15s ease,border-color .15s; }
      .ury-role-card:hover { transform:translateY(-1px); border-color:#b7c6b5; }
      .ury-role-avatar { display:grid; place-items:center; width:42px; height:42px; border-radius:50%; background:#25483a; color:#e8c28b; font-weight:700; font-size:12px; }
      .ury-role-meta { flex:1; min-width:0; }
      .ury-role-meta strong { display:block; color:#314a3c; font-size:14px; }
      .ury-role-meta small { display:block; margin-top:3px; color:#7a8478; font-size:11px; line-height:1.35; }
      .ury-role-meta em { display:block; margin-top:5px; color:#a47c48; font-size:10px; font-style:normal; font-weight:700; letter-spacing:.04em; }
      .ury-pin-panel { margin-top:4px; }
      .ury-pin-back { border:0; background:transparent; color:#66756a; font-size:12px; font-weight:600; padding:0 0 12px; cursor:pointer; }
      .ury-pin-who { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
      .ury-pin-who strong { display:block; color:#314a3c; font-size:15px; }
      .ury-pin-who small { color:#829087; font-size:11px; }
      .ury-pin-dots { display:flex; justify-content:center; gap:12px; margin:8px 0 12px; }
      .ury-pin-dots i { width:12px; height:12px; border-radius:50%; border:2px solid #c9b07a; background:transparent; display:block; }
      .ury-pin-dots i.on { background:#25483a; border-color:#25483a; }
      .ury-pin-hint { text-align:center; color:#8b9083; font-size:11px; margin:0 0 14px; }
      .ury-pin-error { text-align:center; color:#a85840; font-size:12px; font-weight:700; margin:0 0 14px; }
      .ury-pin-pad { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; max-width:280px; margin:0 auto; }
      .ury-pin-key { height:52px; border:1px solid #e7e2d6; border-radius:10px; background:#faf8f1; color:#314a3c; font:700 18px Manrope,sans-serif; cursor:pointer; display:grid; place-items:center; }
      .ury-pin-key:hover { background:#fffdf7; border-color:#b7c6b5; }
    `}</style>
  );
}

function PosStyles() {
  return (
    <style>{`
      .ury-pos {
        --ink:#263a33; --muted:#829087; --forest:#203d34; --cream:#f4f1e8; --paper:#fffdf7;
        --line:#e7e2d6; --gold:#c39153; min-height:100dvh; background:var(--cream);
        color:var(--ink); font-family:'DM Sans',sans-serif; font-size:13px;
      }
      .ury-pos * { box-sizing:border-box; }
      .ury-pos button,.ury-pos input,.ury-pos textarea,.ury-pos select { font:inherit; }
      .ury-pos button { cursor:pointer; }
      .ury-topbar { height:68px; display:flex; align-items:center; gap:22px; padding:0 24px; background:var(--forest); color:#f7f3e9; }
      .ury-brand { display:flex; align-items:center; gap:11px; min-width:180px; }
      .ury-mark { display:grid; place-items:center; width:34px; height:34px; border:1px solid rgba(228,191,133,.68); border-radius:50%; color:#e8c28b; font-family:Georgia,serif; font-weight:bold; font-size:21px; }
      .ury-wordmark { font:700 14px Manrope,sans-serif; letter-spacing:.17em; }
      .ury-wordmark small { display:block; margin-top:2px; color:#aebcb0; font:600 8px DM Sans,sans-serif; letter-spacing:.19em; }
      .ury-nav { display:flex; gap:6px; }
      .ury-nav button, .ury-nav a { display:flex; align-items:center; gap:6px; height:34px; padding:0 12px; border:1px solid transparent; border-radius:6px; color:#c5d0c3; background:transparent; font-size:11px; font-weight:600; text-decoration:none; cursor:pointer; }
      .ury-nav button.on, .ury-nav a.on { color:#203d34; background:#e5c28e; }
      .ury-nav button b, .ury-nav a b { display:grid; place-items:center; min-width:16px; height:16px; border-radius:8px; background:#a85840; color:#fff; font-size:9px; }
      .ury-topright { margin-left:auto; display:flex; align-items:center; gap:14px; }
      .ury-erp-pos-btn { display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 12px; border-radius:6px; background:#1f5c45; color:#fff; font-size:11px; font-weight:700; text-decoration:none; }
      .ury-erp-pos-btn:hover { background:#143d2e; }
      .ury-branch { display:flex; align-items:center; gap:8px; color:#c6d2c4; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
      .ury-branch select { height:32px; max-width:180px; border:1px solid #ffffff28; border-radius:6px; background:#1a332b; color:#f7f3e9; font-size:11px; font-weight:600; padding:0 8px; text-transform:none; letter-spacing:0; }
      .ury-open { display:flex; align-items:center; gap:8px; color:#c6d2c4; font-size:11px; }
      .ury-open i { width:7px; height:7px; border-radius:50%; background:#9ac28f; box-shadow:0 0 0 3px #9ac28f24; }
      .ury-clock { color:#d7dcd1; border-left:1px solid #ffffff24; padding-left:14px; font-size:11px; font-variant-numeric:tabular-nums; }
      .ury-staff { display:grid; place-items:center; width:33px; height:33px; border-radius:50%; color:var(--forest); background:#e5c28e; font-weight:700; font-size:11px; }
      .ury-logout { display:grid; place-items:center; width:32px; height:32px; border:1px solid #ffffff28; border-radius:6px; color:#d7dcd1; background:transparent; }
      .ury-workspace { display:grid; grid-template-columns:minmax(0,1fr) 388px; max-width:1680px; margin:auto; min-height:calc(100dvh - 68px); }
      .ury-catalog { min-width:0; padding:27px 30px 20px; }
      .ury-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; flex-wrap:wrap; }
      .ury-new-ticket { height:37px; padding:0 14px; border:1px solid #c9b07a; border-radius:6px; background:#f7efe2; color:#8c6845; font-size:11px; font-weight:700; }
      .ury-eyebrow { display:flex; align-items:center; gap:7px; color:#8f785b; font-size:9px; font-weight:700; letter-spacing:.15em; }
      .ury-heading h1 { margin:9px 0 3px; color:var(--forest); font:600 clamp(27px,2.7vw,36px)/1.08 Manrope,sans-serif; letter-spacing:-.055em; }
      .ury-heading h1 em { color:#a46f45; font-family:Georgia,serif; font-weight:500; }
      .ury-heading p { margin:0; color:#879087; font-size:12px; max-width:420px; }
      .ury-service-picker { display:flex; background:#eae7dc; padding:4px; gap:3px; border-radius:8px; }
      .ury-service-picker button { display:flex; align-items:center; justify-content:center; gap:7px; min-height:37px; padding:0 13px; border:0; border-radius:6px; color:#777f74; background:transparent; font-size:11px; font-weight:600; }
      .ury-service-picker button.selected { color:#29463b; background:#fffdf7; box-shadow:0 1px 4px #24392e12; }
      .ury-service-picker button:disabled { opacity:.5; }
      .ury-menu-tools { margin-top:24px; display:flex; align-items:center; gap:13px; }
      .ury-search { display:flex; align-items:center; gap:10px; flex:1; height:43px; padding:0 13px; color:#859087; background:var(--paper); border:1px solid var(--line); border-radius:7px; }
      .ury-search input { flex:1; min-width:0; border:0; outline:0; background:transparent; color:var(--ink); font-size:12px; }
      .ury-search kbd { padding:2px 6px; border:1px solid #e5e1d6; border-radius:4px; color:#9a9c91; background:#fbfaf4; font-size:10px; }
      .ury-reset { display:flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:7px; padding:0 12px; height:43px; color:#66756a; background:var(--paper); font-size:11px; }
      .ury-category-row { display:flex; gap:7px; padding:15px 0 16px; overflow:auto; scrollbar-width:none; }
      .ury-category { flex:0 0 auto; padding:8px 12px; border:1px solid transparent; border-radius:5px; background:transparent; color:#7c867c; font-size:11px; }
      .ury-category.active { background:#e3e9de; color:#315344; border-color:#d3ddd0; font-weight:700; }
      .ury-menu-meta { display:flex; justify-content:space-between; padding:11px 1px; border-top:1px solid var(--line); color:#9b9b8e; font-size:9px; font-weight:700; letter-spacing:.13em; }
      .ury-menu-meta b { color:#667d6a; font-size:10px; }
      .ury-menu-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px 15px; }
      .ury-dish { min-width:0; padding:0; border:0; border-radius:7px; background:transparent; color:inherit; text-align:left; }
      .ury-dish:not(:disabled):hover { transform:translateY(-2px); }
      .ury-dish:disabled { opacity:.5; cursor:not-allowed; }
      .ury-dish-photo { position:relative; display:block; aspect-ratio:1.35/1; overflow:hidden; border-radius:7px; background:#e1dccd; }
      .ury-dish-photo img { width:100%; height:100%; display:block; object-fit:cover; }
      .ury-dish-badge { position:absolute; top:9px; left:9px; display:flex; align-items:center; gap:5px; padding:5px 7px; border-radius:4px; background:#faf8efeb; color:#526a55; font-size:8px; font-weight:700; }
      .ury-dish-add { position:absolute; right:9px; bottom:9px; display:grid; place-items:center; width:32px; height:32px; border-radius:50%; color:#f8f3e8; background:#244538; }
      .ury-dish-count { position:absolute; top:9px; right:9px; display:flex; align-items:center; gap:5px; padding:5px 7px; border-radius:4px; background:#23483cef; color:#fff8e9; font-size:9px; font-weight:700; }
      .ury-dish-copy { display:block; padding:9px 1px 0; }
      .ury-dish-category { display:block; color:#9a9a8d; font-size:8px; text-transform:uppercase; letter-spacing:.13em; font-weight:700; }
      .ury-dish-name { display:block; margin-top:4px; color:#334a3f; font-size:12px; font-weight:700; }
      .ury-dish-description { display:block; margin-top:4px; color:#868d82; font-size:10px; line-height:1.45; min-height:28px; }
      .ury-dish-bottom { display:flex; align-items:center; justify-content:space-between; margin-top:7px; }
      .ury-dish-price { color:#8c6845; font:700 15px Manrope,sans-serif; }
      .ury-tags { display:flex; gap:4px; }
      .ury-tag { display:flex; align-items:center; gap:3px; padding:3px 5px; border-radius:3px; color:#66785f; background:#e9eee4; font-size:8px; }
      .ury-no-results { min-height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#77847a; }
      .ury-ticket { position:sticky; top:0; display:flex; flex-direction:column; height:calc(100dvh - 68px); overflow:hidden; background:var(--paper); border-left:1px solid #e4dfd1; box-shadow:-8px 0 25px #293c2910; min-width:0; }
      .ury-ticket-head { padding:23px 23px 17px; }
      .ury-ticket-label { display:flex; justify-content:space-between; color:#8a8e80; font-size:9px; font-weight:700; letter-spacing:.15em; }
      .ury-ticket-number { color:#aa8759; }
      .ury-ticket-titleline { display:flex; align-items:center; gap:10px; margin-top:6px; }
      .ury-ticket-titleline h2 { margin:0; color:var(--forest); font:600 25px Manrope,sans-serif; letter-spacing:-.05em; }
      .ury-count { display:grid; place-items:center; min-width:22px; height:22px; border-radius:50%; color:#4b6855; background:#e7ede2; font-size:10px; font-weight:700; }
      .ury-status { margin-left:auto; display:flex; align-items:center; gap:5px; padding:5px 7px; border:1px solid #e6e2d7; border-radius:4px; color:#7e826f; font-size:9px; font-weight:600; }
      .ury-status.sent { border-color:#d6e2d2; color:#477150; background:#edf3e9; }
      .ury-process { display:grid; grid-template-columns:repeat(6,1fr); gap:4px; margin-top:14px; }
      .ury-process span { display:flex; flex-direction:column; align-items:center; gap:4px; color:#a3a796; font-size:7px; font-weight:700; text-transform:uppercase; }
      .ury-process i { display:block; width:100%; height:3px; border-radius:2px; background:#e6e2d6; }
      .ury-process span.done { color:#4d6b55; } .ury-process span.done i { background:#6d9576; }
      .ury-process span.current { color:#25483a; } .ury-process span.current i { background:#25483a; }
      .ury-ticket-context { display:flex; align-items:center; gap:9px; margin-top:16px; padding:10px; border:1px solid #ece8dc; border-radius:6px; background:#faf8f1; }
      .ury-context-icon { display:grid; place-items:center; width:31px; height:31px; border-radius:5px; color:#496956; background:#e8ede3; }
      .ury-context-copy { flex:1; min-width:0; }
      .ury-context-copy small { display:block; color:#969789; font-size:8px; letter-spacing:.11em; text-transform:uppercase; font-weight:700; }
      .ury-context-copy strong { display:block; margin-top:3px; color:#395244; font-size:11px; }
      .ury-ticket-context select { max-width:110px; border:0; background:transparent; color:#45604e; font-weight:700; font-size:10px; }
      .ury-party { display:flex; align-items:center; gap:8px; margin-top:10px; color:#8d9185; font-size:10px; }
      .ury-party button { display:grid; place-items:center; width:24px; height:24px; border:1px solid #e5e2d8; border-radius:5px; background:#fffdf7; color:#59705d; }
      .ury-party button:disabled { opacity:.4; }
      .ury-ticket-items { flex:1; min-height:100px; overflow:auto; padding:0 23px; }
      .ury-ticket-item { padding:13px 0 12px; border-top:1px solid #efede5; }
      .ury-item-main { display:flex; gap:9px; }
      .ury-item-index { flex:0 0 24px; display:grid; place-items:center; width:24px; height:24px; border-radius:5px; color:#637363; background:#edf0e8; font-size:9px; font-weight:700; }
      .ury-item-copy { flex:1; } .ury-item-copy strong { display:block; color:#394c40; font-size:11px; }
      .ury-item-copy small { display:block; margin-top:3px; color:#97988c; font-size:9px; }
      .ury-item-total { color:#465b4a; font-size:11px; font-weight:700; }
      .ury-item-tools { display:flex; align-items:center; gap:9px; margin:9px 0 0 33px; }
      .ury-quantity { display:flex; align-items:center; gap:10px; height:25px; padding:0 4px; border:1px solid #e8e4d8; border-radius:5px; }
      .ury-quantity button { border:0; background:transparent; color:#617267; }
      .ury-quantity button:disabled { opacity:.35; }
      .ury-note-button,.ury-remove { display:flex; align-items:center; gap:4px; border:0; color:#8b9285; background:transparent; font-size:9px; }
      .ury-remove { margin-left:auto; }
      .ury-note { display:block; width:calc(100% - 33px); margin:8px 0 0 33px; min-height:48px; resize:vertical; padding:8px; border:1px solid #e8e4d9; border-radius:5px; background:#fcfaf4; font-size:10px; }
      .ury-ticket-empty { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; text-align:center; color:#94988c; }
      .ury-ticket-empty strong { margin-top:13px; color:#43594b; font:600 15px Manrope,sans-serif; }
      .ury-payment { flex-shrink:0; padding:14px 20px 16px; border-top:1px solid #efede5; background:#fffdf7; width:100%; box-sizing:border-box; }
      .ury-section-label { display:flex; justify-content:space-between; margin-bottom:9px; color:#8f9184; font-size:8px; font-weight:700; letter-spacing:.13em; }
      .ury-pay-options { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .ury-pay-options button { height:37px; display:flex; align-items:center; gap:8px; padding:0 10px; border:1px solid #e7e5dc; border-radius:5px; color:#778075; background:#fbfaf5; font-size:10px; }
      .ury-pay-options button.selected { border-color:#a9bbab; color:#365847; background:#edf2e9; font-weight:700; }
      .ury-pay-options button svg:last-child { margin-left:auto; }
      .ury-totals { padding-top:12px; }
      .ury-total-line { display:flex; justify-content:space-between; padding:4px 0; color:#83897e; font-size:10px; }
      .ury-grand { display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding:11px 0 13px; border-top:1px solid #eae7dc; color:#314a3c; font-size:12px; font-weight:700; }
      .ury-grand strong { font:700 24px Manrope,sans-serif; }
      .ury-submit { width:100%; min-height:47px; display:flex; justify-content:space-between; align-items:center; padding:0 14px; border:0; border-radius:5px; color:#fff9ed; background:#25483a; font-size:11px; font-weight:700; box-sizing:border-box; }
      .ury-submit:disabled { color:#a2a699; background:#e8e9df; }
      .ury-submit-end { display:inline-flex; align-items:center; gap:8px; color:#e9d6ae; flex-shrink:0; }
      .ury-ticket-footer { margin-top:10px; display:flex; flex-direction:column; gap:10px; width:100%; }
      .ury-action-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(0,1fr)); gap:8px; width:100%; margin:0; }
      .ury-ghost {
        width:100%; min-width:0; height:36px; margin:0; padding:0 8px;
        display:inline-flex; align-items:center; justify-content:center; gap:6px;
        border:1px solid #e0ddd2; border-radius:5px; background:#fffdf7; color:#66756a;
        font-size:10px; font-weight:700; line-height:1; box-sizing:border-box; white-space:nowrap;
      }
      .ury-ghost svg { flex-shrink:0; display:block; }
      .ury-ticket-check {
        display:flex; align-items:center; gap:8px; margin:0; padding:0;
        color:#4a5d4f; font-size:11px; font-weight:600; line-height:1.2; cursor:pointer;
      }
      .ury-ticket-check input { width:14px; height:14px; margin:0; flex-shrink:0; accent-color:#25483a; }
      .ury-demo-note { display:block; margin:0; padding:0; text-align:center; color:#9a9a8a; font-size:8px; line-height:1.35; }
      .ury-notice { position:fixed; z-index:15; left:50%; bottom:22px; transform:translateX(-50%); display:flex; align-items:center; gap:8px; padding:11px 15px; border:1px solid #486a58; border-radius:6px; color:#f5f1e6; background:#24483b; box-shadow:0 8px 24px #182a2350; font-size:11px; font-weight:600; }
      .ury-modal-scrim { position:fixed; z-index:30; inset:0; display:grid; place-items:center; padding:18px; background:#162c25aa; backdrop-filter:blur(4px); }
      .ury-receipt { position:relative; width:min(100%,430px); max-height:94dvh; overflow:auto; padding:30px 34px 25px; border-radius:9px; text-align:center; color:#294538; background:#fbf9f1; box-shadow:0 24px 70px #10231d55; }
      .ury-stock-modal { text-align:left; width:min(100%,480px); }
      .ury-stock-modal h2,.ury-stock-modal .ury-receipt-kicker,.ury-stock-modal .ury-receipt-sub,.ury-stock-modal .ury-receipt-check { text-align:center; }
      .ury-deduct-block { margin:10px 0; padding:10px 0; border-top:1px solid #e8e4d8; }
      .ury-deduct-block > strong { display:block; margin-bottom:6px; color:#314a3c; font-size:12px; }
      .ury-receipt-close { position:absolute; right:12px; top:12px; display:grid; place-items:center; width:30px; height:30px; border:0; color:#8a8e82; background:transparent; }
      .ury-receipt-check { display:grid; place-items:center; width:48px; height:48px; margin:0 auto 13px; border:1px solid #d4e0d0; border-radius:50%; color:#4c7658; background:#e7eee2; }
      .ury-receipt-kicker { color:#a47c48; font-size:8px; font-weight:700; letter-spacing:.18em; }
      .ury-receipt h2 { margin:6px 0 3px; font:600 29px Manrope,sans-serif; letter-spacing:-.055em; }
      .ury-receipt-sub { margin:0; color:#8b9083; font-size:11px; }
      .ury-receipt-rule { display:flex; align-items:center; gap:10px; margin:20px 0 14px; color:#9d784b; font:700 10px Manrope,sans-serif; letter-spacing:.16em; }
      .ury-receipt-rule span { flex:1; border-top:1px dashed #ded8ca; }
      .ury-receipt-meta { display:flex; justify-content:space-between; padding:5px 0; color:#858a7c; font-size:9px; }
      .ury-receipt-items { margin-top:10px; padding:9px 0; border-top:1px solid #e8e4d8; border-bottom:1px solid #e8e4d8; }
      .ury-receipt-item { display:flex; justify-content:space-between; gap:10px; padding:5px 0; color:#667063; font-size:10px; text-align:left; }
      .ury-receipt-item strong { color:#485c4b; white-space:nowrap; }
      .ury-receipt-item small { color:#8b9083; font-weight:500; }
      .ury-receipt-total { display:flex; justify-content:space-between; padding:13px 0; color:#345041; font-size:12px; font-weight:700; }
      .ury-receipt-total strong { font:700 22px Manrope,sans-serif; }
      .ury-receipt-note { padding:9px; border-radius:4px; color:#85897c; background:#efeee5; font-size:9px; }
      .ury-receipt-actions { display:flex; gap:8px; margin-top:12px; }
      .ury-receipt-actions button { min-height:43px; flex:1; display:flex; align-items:center; justify-content:center; gap:8px; border:0; border-radius:5px; color:#fff9ed; background:#25483a; font-size:10px; font-weight:700; }
      .ury-panel { max-width:1100px; margin:0 auto; padding:28px 24px 40px; }
      .ury-panel-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:22px; }
      .ury-panel-head h1 { margin:8px 0 4px; color:var(--forest); font:600 32px Manrope,sans-serif; letter-spacing:-.04em; }
      .ury-panel-head p { margin:0; color:#879087; }
      .ury-low-pill { padding:8px 12px; border-radius:999px; background:#f3e3dc; color:#a85840; font-size:11px; font-weight:700; }
      .ury-stock-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
      .ury-stock-card { padding:14px; border:1px solid var(--line); border-radius:8px; background:var(--paper); }
      .ury-stock-card.low { border-color:#e2b7a8; background:#fbf4f0; }
      .ury-stock-card strong { display:block; font-size:11px; color:#4a5d4f; }
      .ury-stock-card b { display:block; margin-top:8px; font:700 18px Manrope,sans-serif; color:#25483a; }
      .ury-stock-card small { display:block; margin-top:4px; color:#8b9083; font-size:9px; }
      .ury-panel-sub { margin:28px 0 10px; color:#314a3c; font:600 15px Manrope,sans-serif; }
      .ury-muted { color:#8b9083; font-size:12px; }
      .ury-move-list { display:grid; gap:6px; }
      .ury-move { display:grid; grid-template-columns:70px 64px 1.2fr 1.4fr 70px; gap:8px; align-items:center; padding:10px 12px; border:1px solid var(--line); border-radius:7px; background:var(--paper); font-size:11px; color:#66756a; }
      .ury-move strong { color:#314a3c; }
      .ury-move em { color:#a85840; font-style:normal; font-weight:700; }
      .ury-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
      .ury-kpi { padding:16px; border:1px solid var(--line); border-radius:8px; background:var(--paper); }
      .ury-kpi small { display:block; color:#8b9083; font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
      .ury-kpi strong { display:block; margin-top:8px; font:700 20px Manrope,sans-serif; color:#25483a; }
      .ury-report-cols { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:8px; }
      .ury-report-line { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #efece3; font-size:12px; color:#66756a; }
      .ury-report-line strong { color:#314a3c; }
      .ury-report-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .ury-report-actions .ury-ghost { width:auto; padding:0 12px; display:flex; align-items:center; gap:6px; }
      .ury-seat-kpis { display:flex; gap:10px; flex-wrap:wrap; color:#66756a; font-size:11px; }
      .ury-seat-kpis b { color:#25483a; margin-right:3px; }
      .ury-zone-row { display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; }
      .ury-zone-row button { height:32px; padding:0 12px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:#66756a; font-size:11px; font-weight:600; }
      .ury-zone-row button.on { background:#25483a; color:#fff9ed; border-color:#25483a; }
      .ury-floor { display:grid; grid-template-columns:minmax(0,1fr) 280px; gap:18px; }
      .ury-floor-canvas {
        position:relative; min-height:520px; height:min(68dvh,620px); overflow:hidden;
        border:1px solid #d6d0c0; border-radius:14px;
        background:
          linear-gradient(90deg, #ebe4d4 0 48%, transparent 48%),
          linear-gradient(#e7e0ce 1px, transparent 1px) 0 0 / 28px 28px,
          linear-gradient(90deg, #e7e0ce 1px, transparent 1px) 0 0 / 28px 28px,
          linear-gradient(160deg, #f3eee2, #e8e1d1);
        box-shadow: inset 0 0 0 1px #fff8;
      }
      .ury-zone-label { position:absolute; z-index:1; font:700 9px Manrope,sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#9a9484; pointer-events:none; }
      .ury-zone-label.zl-main { left:12%; top:6%; }
      .ury-zone-label.zl-window { right:22%; top:6%; }
      .ury-zone-label.zl-patio { left:28%; bottom:4%; }
      .ury-zone-label.zl-bar { right:6%; top:4%; }
      .ury-floor-window { position:absolute; right:2%; top:8%; bottom:28%; width:10px; border-radius:4px; background:linear-gradient(180deg,#c5d8e8,#9bb8cc); opacity:.55; box-shadow:0 0 12px #9bb8cc55; }
      .ury-floor-bar-counter { position:absolute; right:4%; top:8%; width:18%; height:14%; border-radius:8px; background:linear-gradient(180deg,#5c4332,#3d2c22); box-shadow:0 4px 10px #0002; opacity:.9; }
      .ury-floor-patio-edge { position:absolute; left:8%; right:18%; bottom:2%; height:8px; border-radius:4px; background:repeating-linear-gradient(90deg,#7a9a6a 0 12px,#6d8c5e 12px 24px); opacity:.45; }
      .ury-real-table {
        position:absolute; z-index:2; transform:translate(-50%,-50%);
        border:0; padding:0; background:transparent; color:inherit; cursor:pointer;
      }
      .ury-table-surface { position:relative; display:grid; place-items:center; }
      .ury-chair {
        position:absolute; width:11px; height:11px; border-radius:50%;
        background:#d7cbb6; border:1.5px solid #b7a88e; transform:translate(-50%,-50%);
        box-shadow:0 1px 2px #0001;
      }
      .ury-table-core {
        position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:1px; color:#314a3c; background:linear-gradient(160deg,#f7f1e4,#e8dcc6);
        border:2px solid #c4b79a; box-shadow:0 6px 14px #2a241810, inset 0 1px 0 #fff8;
      }
      .ury-table-core strong { font:700 12px Manrope,sans-serif; letter-spacing:.02em; }
      .ury-table-core em { font-style:normal; font-size:7px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#8b9083; }
      .ury-table-party { display:inline-flex; align-items:center; gap:2px; margin-top:1px; font-size:8px; font-weight:700; color:#66756a; }
      .ury-table-party.muted { font-weight:600; color:#9a9484; }
      .ury-real-table.shape-round .ury-table-surface { width:78px; height:78px; }
      .ury-real-table.shape-round .ury-table-core { width:52px; height:52px; border-radius:50%; }
      .ury-real-table.shape-square .ury-table-surface { width:84px; height:84px; }
      .ury-real-table.shape-square .ury-table-core { width:54px; height:54px; border-radius:10px; }
      .ury-real-table.shape-rect .ury-table-surface { width:110px; height:72px; }
      .ury-real-table.shape-rect .ury-table-core { width:86px; height:42px; border-radius:8px; }
      .ury-real-table.shape-bar .ury-table-surface { width:44px; height:44px; }
      .ury-real-table.shape-bar .ury-table-core {
        width:36px; height:36px; border-radius:8px 8px 4px 4px;
        background:linear-gradient(180deg,#6a4a36,#3f2b20); color:#f3e6d4; border-color:#2a1c14;
      }
      .ury-real-table.shape-bar .ury-table-core em { color:#d2b59a; }
      .ury-real-table.selected .ury-table-core { box-shadow:0 0 0 3px #25483a55, 0 8px 18px #2a241820; transform:scale(1.04); }
      .ury-real-table:hover .ury-table-core { transform:translateY(-1px); }
      .ury-real-table.status-free .ury-table-core { border-color:#9cba9a; }
      .ury-real-table.status-free .ury-table-core em { color:#4d6b55; }
      .ury-real-table.status-seated .ury-table-core { border-color:#c9b07a; background:linear-gradient(160deg,#fbf6ea,#f0e2c4); }
      .ury-real-table.status-seated .ury-table-core em { color:#8c6845; }
      .ury-real-table.status-ordered .ury-table-core { border-color:#6f9a7a; background:linear-gradient(160deg,#edf3e9,#d5e4d6); }
      .ury-real-table.status-ordered .ury-table-core em { color:#365847; }
      .ury-real-table.status-bill .ury-table-core { border-color:#c39153; background:linear-gradient(160deg,#f7efe2,#ead3ad); }
      .ury-real-table.status-bill .ury-table-core em { color:#a47c48; }
      .ury-real-table.status-dirty .ury-table-core { border-color:#d2b0a4; background:linear-gradient(160deg,#fbf4f0,#edd9d0); }
      .ury-real-table.status-dirty .ury-table-core em { color:#a85840; }
      .ury-side-preview { width:64px; height:64px; display:grid; place-items:center; margin-bottom:10px; }
      .ury-side-preview .ury-table-core { width:52px; height:52px; }
      .ury-side-preview.shape-round .ury-table-core { border-radius:50%; }
      .ury-side-preview.shape-square .ury-table-core,
      .ury-side-preview.shape-rect .ury-table-core { border-radius:10px; }
      .ury-side-preview.shape-bar .ury-table-core { border-radius:8px; background:#3f2b20; color:#f3e6d4; }
      .ury-seat-side { padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
      .ury-seat-side h2 { margin:0 0 4px; font:600 20px Manrope,sans-serif; color:#25483a; }
      .ury-seat-ticket { color:#a47c48; font-weight:700; font-size:12px; }
      .ury-seat-actions { display:grid; gap:8px; margin-top:14px; }
      .ury-legend { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; font-size:9px; font-weight:700; }
      .ury-legend span { padding:4px 8px; border-radius:4px; background:#efeee5; }
      .ury-legend .status-free { color:#4d6b55; } .ury-legend .status-seated { color:#8c6845; }
      .ury-legend .status-ordered { color:#365847; } .ury-legend .status-bill { color:#a47c48; } .ury-legend .status-dirty { color:#a85840; }
      .ury-field { display:grid; gap:5px; margin-top:10px; font-size:11px; color:#66756a; }
      .ury-field span { font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
      .ury-field input,.ury-field select,.ury-field textarea { height:38px; padding:0 10px; border:1px solid var(--line); border-radius:6px; background:#fffdf7; color:#314a3c; }
      .ury-field textarea { height:auto; padding:10px; }
      .ury-stock-forms { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:8px; }
      .ury-form-card { padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
      .ury-form-card h3 { margin:0 0 8px; font:600 14px Manrope,sans-serif; color:#314a3c; }
      .ury-form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .ury-stock-card.picked { outline:2px solid #25483a; }
      .ury-move em.in { color:#365847; }
      .ury-settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 16px; }
      .ury-check { display:flex; align-items:center; gap:8px; margin-top:18px; color:#4a5d4f; font-size:12px; }
      .ury-settings-help ul { margin:0; padding-left:18px; color:#66756a; font-size:12px; line-height:1.6; }
      .ury-kitchen-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:280px; padding:40px; border:1px dashed var(--line); border-radius:12px; background:var(--paper); color:#8b9083; text-align:center; }
      .ury-kitchen-empty p { margin:0; color:#314a3c; font:600 16px Manrope,sans-serif; }
      .ury-kitchen-board { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; align-items:start; }
      .ury-kitchen-col { min-width:0; padding:12px; border:1px solid var(--line); border-radius:10px; background:#f7f4eb; }
      .ury-kitchen-col > header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
      .ury-kitchen-col > header strong { color:#314a3c; font-size:12px; }
      .ury-kitchen-col > header em { font-style:normal; color:#8b9083; font-size:11px; font-weight:700; }
      .ury-kitchen-cards { display:grid; gap:10px; }
      .ury-k-card { padding:12px; border-radius:8px; border:1px solid #d9d4c6; background:#fffdf7; }
      .ury-k-card.pace-on_time { border-color:#7fa88a; }
      .ury-k-card.pace-at_risk { border-color:#c9b07a; background:#fbf6ea; }
      .ury-k-card.pace-late { border-color:#c47a68; background:#fbf4f0; box-shadow:0 0 0 1px #c47a6833; }
      .ury-k-top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
      .ury-k-where { display:flex; align-items:center; gap:5px; margin-top:4px; color:#66756a; font-size:11px; }
      .ury-k-timer { display:flex; flex-direction:column; align-items:flex-end; gap:2px; min-width:88px; }
      .ury-k-timer b { font:700 16px Manrope,sans-serif; font-variant-numeric:tabular-nums; color:#25483a; }
      .ury-k-timer small { font-size:9px; font-weight:700; color:#66756a; }
      .ury-k-timer.pace-at_risk b,.ury-k-timer.pace-at_risk small { color:#8c6845; }
      .ury-k-timer.pace-late b,.ury-k-timer.pace-late small { color:#a85840; }
      .ury-k-note { margin:8px 0 0; padding:6px 8px; border-radius:4px; background:#efeee5; color:#66756a; font-size:10px; }
      .ury-k-card ul { margin:10px 0 0; padding:0; list-style:none; }
      .ury-k-card li { padding:4px 0; border-top:1px solid #efede5; color:#4a5d4f; font-size:11px; }
      .ury-k-card li em { color:#8b9083; font-style:normal; }
      .ury-k-actions { display:flex; gap:6px; margin-top:10px; }
      .ury-k-actions .ury-submit,.ury-k-actions .ury-ghost { width:auto; flex:1; min-height:34px; height:34px; padding:0 10px; font-size:10px; justify-content:center; }
      .ury-k-empty-col { margin:12px 0; text-align:center; }
      .ury-k-ready-hint { flex:1; font-size:9px; font-weight:700; color:#8c6845; text-align:center; padding:8px 6px; background:#fbf6ea; border-radius:5px; }
      .ury-serve-banner { display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:18px; padding:12px 14px; border:1px solid #7fa88a; border-radius:10px; background:#edf3e9; }
      .ury-serve-banner strong { display:block; color:#25483a; font-size:13px; }
      .ury-serve-banner span { display:block; margin-top:3px; color:#4d6b55; font-size:11px; }
      .ury-serve-banner-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .ury-serve-banner-actions .ury-submit { width:auto; min-height:34px; height:34px; padding:0 12px; font-size:10px; }
      .ury-serve-banner-actions .ury-ghost { width:auto; padding:0 12px; }
      .ury-ledger-layout { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(220px,0.7fr); gap:18px; align-items:start; }
      .ury-ledger-table { display:grid; gap:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--paper); }
      .ury-ledger-row { display:grid; grid-template-columns:70px 64px 1.3fr 1.2fr 90px 70px; gap:8px; align-items:center; padding:10px 12px; border-top:1px solid #efece3; font-size:11px; color:#66756a; }
      .ury-ledger-row.head { border-top:0; background:#f7f4eb; color:#8b9083; font-size:9px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
      .ury-ledger-row strong { color:#314a3c; }
      .ury-ledger-row em { font-style:normal; font-weight:700; }
      .ury-ledger-row em.out { color:#a85840; }
      .ury-ledger-row em.in { color:#365847; }
      .ury-ledger-row.hot { background:#edf3e9; animation:uryPulse 1.2s ease 2; }
      @keyframes uryPulse { 0%,100% { background:#edf3e9; } 50% { background:#dce8da; } }
      .ury-ledger-bal-list { display:grid; gap:6px; max-height:70dvh; overflow:auto; }
      .ury-ledger-bal { padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--paper); }
      .ury-ledger-bal.low { border-color:#e2b7a8; background:#fbf4f0; }
      .ury-ledger-bal strong { display:block; font-size:11px; color:#4a5d4f; }
      .ury-ledger-bal b { display:block; margin-top:4px; font:700 16px Manrope,sans-serif; color:#25483a; }
      .ury-ledger-bal small { color:#8b9083; font-size:9px; }
      .ury-report-tabs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
      .ury-report-tabs button { height:32px; padding:0 11px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:#66756a; font-size:10px; font-weight:700; }
      .ury-report-tabs button.on { background:#25483a; color:#fff9ed; border-color:#25483a; }
      .ury-report-scope { height:34px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:#314a3c; font-size:11px; padding:0 8px; }
      .ury-z-block { max-width:420px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
      .ury-recipe-layout { display:grid; grid-template-columns:240px minmax(0,1fr); gap:16px; }
      .ury-recipe-dishes { display:grid; gap:8px; align-content:start; }
      .ury-recipe-dish { text-align:left; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:inherit; }
      .ury-recipe-dish.on { border-color:#25483a; background:#edf3e9; }
      .ury-recipe-dish strong { display:block; font-size:12px; color:#314a3c; }
      .ury-recipe-dish small { color:#8b9083; font-size:10px; }
      .ury-recipe-editor { padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
      .ury-recipe-editor h2 { margin:0 0 4px; font:600 20px Manrope,sans-serif; color:#25483a; }
      .ury-recipe-lines { display:grid; gap:8px; margin-top:14px; }
      .ury-recipe-line { display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #efece3; border-radius:8px; }
      .ury-recipe-line strong { display:block; font-size:12px; color:#314a3c; }
      .ury-recipe-line small { color:#8b9083; font-size:10px; }
      .ury-kitchen-print-sheet { position:fixed; z-index:40; inset:0; display:grid; place-items:center; padding:18px; background:#162c25aa; }
      .ury-kprint { width:min(100%,360px); padding:24px; background:#fffdf7; color:#25483a; border-radius:8px; position:relative; }
      .ury-kprint h2 { margin:0 0 8px; font:700 16px Manrope,sans-serif; letter-spacing:.12em; }
      .ury-notices { position:fixed; right:16px; bottom:16px; z-index:60; display:grid; gap:8px; width:min(340px,calc(100vw - 32px)); }
      .ury-notice-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:6px; background:#203d34; color:#fbf6ea; font-size:12px; box-shadow:0 2px 10px #0003; }
      .ury-notice-item button { background:transparent; border:0; color:#e5c28e; font-size:16px; cursor:pointer; }
      .ury-kprint ul { margin:12px 0 0; padding:0; list-style:none; }
      .ury-kprint li { padding:6px 0; border-top:1px dashed #ddd; font-size:13px; }
      .ury-shift-pill { display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:999px; font-size:11px; font-weight:700; }
      .ury-shift-pill.open { background:#edf3e9; color:#365847; }
      .ury-shift-pill.closed { background:#efeee5; color:#8b9083; }
      .ury-feature-list { display:grid; gap:8px; }
      .ury-feature-row { display:grid; grid-template-columns:22px 1fr auto; gap:12px; align-items:start; padding:12px 14px; border:1px solid var(--line); border-radius:8px; background:var(--paper); cursor:pointer; }
      .ury-feature-row.on { border-color:#7fa88a; background:#edf3e9; }
      .ury-feature-row strong { display:block; font-size:12px; color:#314a3c; }
      .ury-feature-row small { display:block; margin-top:3px; color:#8b9083; font-size:11px; }
      .ury-feature-row em { font-style:normal; font-size:10px; font-weight:700; color:#8c6845; }
      .ury-feature-row.on em { color:#365847; }
      .ury-orders-list { display:grid; gap:10px; }
      .ury-order-row { padding:14px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
      .ury-order-row.status-paid { border-color:#c9b07a; background:#fbf6ea; }
      .ury-order-main { display:grid; grid-template-columns:64px 1.1fr 1fr 110px 80px; gap:8px; align-items:center; font-size:11px; color:#66756a; }
      .ury-order-main strong { color:#25483a; font-size:13px; }
      .ury-order-main em { font-style:normal; font-weight:700; color:#8c6845; }
      .ury-order-main b { color:#25483a; text-align:right; }
      .ury-order-lines { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:8px; font-size:10px; color:#8b9083; }
      .ury-order-actions { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
      .ury-order-actions .ury-ghost { width:auto; padding:0 10px; display:flex; align-items:center; gap:5px; }
      @media print {
        .ury-topbar,.ury-nav,.ury-notice,.ury-report-actions,.ury-logout,.no-print,.ury-receipt-close,
        .ury-workspace,.ury-serve-banner,.ury-branch,.ury-report-tabs,.ury-report-scope { display:none!important; }
        .ury-kitchen-print-sheet { position:static; background:transparent; padding:0; display:block; }
        .ury-modal-scrim { position:static; background:transparent; display:block; padding:0; inset:auto; }
        .ury-receipt,.ury-kprint { box-shadow:none!important; max-width:100%; }
        .ury-panel { max-width:100%; padding:0; }
        body { background:#fff; }
      }
      @media(max-width:1120px) {
        .ury-workspace { grid-template-columns:minmax(0,1fr) 350px; }
        .ury-menu-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .ury-kpi-row { grid-template-columns:1fr 1fr; }
        .ury-move { grid-template-columns:1fr 1fr; }
        .ury-floor { grid-template-columns:1fr; }
        .ury-stock-forms,.ury-settings-grid { grid-template-columns:1fr; }
        .ury-floor-canvas { min-height:420px; height:520px; }
        .ury-kitchen-board { grid-template-columns:1fr; }
        .ury-ledger-layout { grid-template-columns:1fr; }
        .ury-ledger-row { grid-template-columns:1fr 1fr; }
        .ury-recipe-layout { grid-template-columns:1fr; }
        .ury-order-main { grid-template-columns:1fr 1fr; }
      }
      @media(max-width:760px) {
        .ury-topbar { height:auto; flex-wrap:wrap; padding:10px 14px; gap:10px; }
        .ury-nav { order:3; width:100%; overflow:auto; }
        .ury-workspace { display:flex; flex-direction:column; }
        .ury-ticket { position:relative; height:auto; border-left:0; border-top:1px solid #e4dfd1; }
        .ury-menu-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .ury-report-cols,.ury-kpi-row { grid-template-columns:1fr; }
        .ury-service-picker { width:100%; }
        .ury-service-picker button { flex:1; padding:0 8px; }
      }
    `}</style>
  );
}
