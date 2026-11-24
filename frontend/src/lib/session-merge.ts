/** Merge shared POS session blobs so a stale tablet cannot revive paid / closed work. */

export type MergeTicket = {
  id: string;
  number?: string;
  status: string;
  items?: unknown[];
  openedAtMs?: number;
  paidAt?: string;
  kitchenRejectReason?: string;
  table?: string;
  type?: string;
  partySize?: number;
  [key: string]: unknown;
};

export type MergeSeat = {
  id: string;
  name: string;
  status: string;
  partySize?: number;
  ticketNumber?: string;
  server?: string;
  [key: string]: unknown;
};

export type MergeBlob = {
  rev?: number;
  origin?: string;
  ticketSeq?: number;
  ticketBook?: Record<string, MergeTicket> | unknown;
  dayOrders?: MergeTicket[] | unknown;
  kitchenBoard?: Record<string, MergeTicket> | unknown;
  sales?: unknown[] | unknown;
  moves?: unknown[] | unknown;
  tables?: MergeSeat[] | unknown;
  stock?: unknown;
  stockByStore?: unknown;
  activeStoreId?: string;
  recipes?: unknown;
  shift?: { id?: string; status?: string } | null | unknown;
  shiftHistory?: unknown[] | unknown;
  branchId?: string;
  settings?: unknown;
  features?: unknown;
  ticket?: unknown;
};

const STATUS_RANK: Record<string, number> = {
  Open: 0,
  'Sent to kitchen': 1,
  Preparing: 2,
  Ready: 3,
  Served: 4,
  Paid: 5,
};

function isKitchenQueue(status: string) {
  return status === 'Sent to kitchen' || status === 'Preparing' || status === 'Ready';
}

function isFinished(t: MergeTicket) {
  return (
    t.status === 'Paid' ||
    t.status === 'Served' ||
    (t.status === 'Open' && Boolean(t.kitchenRejectReason))
  );
}

function sanitizeItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.filter((line) => {
    if (!line || typeof line !== 'object') return false;
    const menuItem = (line as { menuItem?: { price?: unknown } }).menuItem;
    return !!menuItem && typeof menuItem === 'object' && typeof menuItem.price === 'number';
  });
}

function sanitizeTicket(t: MergeTicket | undefined): MergeTicket | undefined {
  if (!t || typeof t !== 'object' || !t.id) return undefined;
  return { ...t, items: sanitizeItems(t.items) };
}

export function mergeTickets(a: MergeTicket | undefined, b: MergeTicket | undefined): MergeTicket | undefined {
  const left = sanitizeTicket(a);
  const right = sanitizeTicket(b);
  if (!left) return right;
  if (!right) return left;
  const ra = STATUS_RANK[left.status] ?? 0;
  const rb = STATUS_RANK[right.status] ?? 0;
  if (ra !== rb) return ra > rb ? left : right;
  // Same status — prefer richer / newer copy.
  const aMs = left.openedAtMs ?? 0;
  const bMs = right.openedAtMs ?? 0;
  if (left.paidAt && !right.paidAt) return left;
  if (right.paidAt && !left.paidAt) return right;
  return bMs >= aMs ? { ...left, ...right, items: sanitizeItems(right.items ?? left.items) } : { ...right, ...left, items: sanitizeItems(left.items ?? right.items) };
}

function asBook(value: unknown): Record<string, MergeTicket> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, MergeTicket>;
}

function asTickets(value: unknown): MergeTicket[] {
  return Array.isArray(value) ? (value as MergeTicket[]) : [];
}

function asSeats(value: unknown): MergeSeat[] {
  return Array.isArray(value) ? (value as MergeSeat[]) : [];
}

function asRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mergeBooks(
  a: Record<string, MergeTicket>,
  b: Record<string, MergeTicket>,
): Record<string, MergeTicket> {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, MergeTicket> = {};
  for (const id of ids) {
    const merged = mergeTickets(a[id], b[id]);
    if (merged) out[id] = merged;
  }
  return out;
}

function mergeDayOrders(a: MergeTicket[], b: MergeTicket[]): MergeTicket[] {
  const byId = new Map<string, MergeTicket>();
  for (const t of [...a, ...b]) {
    if (!t?.id) continue;
    const merged = mergeTickets(byId.get(t.id), t);
    if (merged) byId.set(t.id, merged);
  }
  return Array.from(byId.values()).sort((x, y) => (y.openedAtMs ?? 0) - (x.openedAtMs ?? 0));
}

function cleanKitchenBoard(
  board: Record<string, MergeTicket>,
  book: Record<string, MergeTicket>,
  days: MergeTicket[],
): Record<string, MergeTicket> {
  const finished = new Set<string>();
  for (const t of [...Object.values(book), ...days]) {
    if (isFinished(t)) finished.add(t.id);
  }
  const out: Record<string, MergeTicket> = {};
  for (const [id, t] of Object.entries(board)) {
    if (!t || finished.has(id)) continue;
    const canonical = book[id] ?? days.find((d) => d.id === id);
    const status = canonical?.status ?? t.status;
    if (!isKitchenQueue(status) || (canonical?.items?.length === 0)) continue;
    if ((t.items?.length ?? 0) === 0) continue;
    out[id] = canonical && (STATUS_RANK[canonical.status] ?? 0) >= (STATUS_RANK[t.status] ?? 0) ? canonical : t;
  }
  // Also ensure live kitchen tickets from book/days appear
  for (const t of [...Object.values(book), ...days]) {
    if (!t?.id || finished.has(t.id)) continue;
    if (!isKitchenQueue(t.status) || (t.items?.length ?? 0) === 0) continue;
    const cur = out[t.id];
    out[t.id] = mergeTickets(cur, t) ?? t;
  }
  return out;
}

function mergeSales(a: unknown[], b: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  for (const row of [...a, ...b]) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as { id?: string }).id ?? '');
    if (!id) continue;
    byId.set(id, row);
  }
  return Array.from(byId.values());
}

function mergeTables(a: MergeSeat[], b: MergeSeat[], book: Record<string, MergeTicket>, days: MergeTicket[]): MergeSeat[] {
  if (!a.length) return b;
  if (!b.length) return a;
  const byId = new Map<string, MergeSeat>();
  for (const t of a) byId.set(t.id, t);
  for (const t of b) {
    const prev = byId.get(t.id);
    byId.set(t.id, prev ? { ...prev, ...t } : t);
  }

  const live = [...Object.values(book), ...days];
  return Array.from(byId.values()).map((seat) => {
    const unpaid = live.find(
      (t) =>
        t.type === 'Dine in' &&
        t.table === seat.name &&
        t.status !== 'Paid' &&
        (t.items?.length ?? 0) > 0 &&
        (isKitchenQueue(t.status) || t.status === 'Served' || t.status === 'Open'),
    );
    if (!unpaid) {
      // No live ticket — don't keep ghost bill/ordered after pay or shift close.
      if (seat.status === 'bill' || seat.status === 'ordered' || seat.status === 'seated') {
        return {
          ...seat,
          status: 'free',
          partySize: undefined,
          ticketNumber: undefined,
          server: undefined,
        };
      }
      return seat;
    }
    if (unpaid.status === 'Served') {
      return {
        ...seat,
        status: 'bill',
        ticketNumber: unpaid.number ?? seat.ticketNumber,
        partySize: unpaid.partySize ?? seat.partySize,
      };
    }
    if (isKitchenQueue(unpaid.status)) {
      return {
        ...seat,
        status: 'ordered',
        ticketNumber: unpaid.number ?? seat.ticketNumber,
        partySize: unpaid.partySize ?? seat.partySize,
      };
    }
    return seat;
  });
}

function closedShiftIds(currentHistory: unknown[], incomingHistory: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const h of [...asRows(currentHistory), ...asRows(incomingHistory)]) {
    if (!h || typeof h !== 'object') continue;
    const row = h as { id?: string; status?: string; closedAt?: string };
    // History rows are closed shifts; require closed marker so probe/junk ids cannot block reopen.
    if (row.status === 'closed' || row.closedAt) {
      const id = String(row.id ?? '');
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Shift merge rules:
 * - New open (id not in closed history) always wins over stale null from other tablets.
 * - Null close wins only when that open id is recorded in shiftHistory (real close).
 * - Stale open of an already-closed id is ignored.
 */
function mergeShift(
  current: MergeBlob['shift'],
  incoming: MergeBlob['shift'],
  currentHistory: unknown[],
  incomingHistory: unknown[],
): MergeBlob['shift'] {
  if (incoming === undefined) return (current as MergeBlob['shift']) ?? null;

  const closedIds = closedShiftIds(currentHistory, incomingHistory);
  const inc = incoming as { id?: string; status?: string } | null;
  const cur = (current ?? null) as { id?: string; status?: string } | null;

  // Fresh open from Manager — never let another tablet's leftover null wipe it.
  if (inc && inc.status === 'open') {
    if (inc.id && closedIds.has(inc.id)) {
      // This id was already closed; ignore stale reopen.
      return cur?.status === 'open' && cur.id && !closedIds.has(cur.id) ? cur : null;
    }
    return inc;
  }

  // Incoming explicit close (null).
  if (incoming === null) {
    if (cur?.status === 'open' && cur.id) {
      // Real close only if this open shift appears in history as closed.
      if (closedIds.has(cur.id)) return null;
      // Stale null from another device — keep the live open shift.
      return cur;
    }
    return null;
  }

  return incoming;
}

/** Merge two session blobs. Paid / closed state always beats stale kitchen copies. */
export function mergeSessionBlobs(current: MergeBlob | null | undefined, incoming: MergeBlob): MergeBlob {
  const cur = current ?? {};
  const book = mergeBooks(asBook(cur.ticketBook), asBook(incoming.ticketBook));
  const days = mergeDayOrders(asTickets(cur.dayOrders), asTickets(incoming.dayOrders));
  const kitchenBoard = cleanKitchenBoard(
    mergeBooks(asBook(cur.kitchenBoard), asBook(incoming.kitchenBoard)),
    book,
    days,
  );
  const tables = mergeTables(asSeats(cur.tables), asSeats(incoming.tables), book, days);
  const sales = mergeSales(asRows(cur.sales), asRows(incoming.sales));
  const moves = mergeSales(asRows(cur.moves), asRows(incoming.moves));
  const shiftHistory = mergeSales(asRows(cur.shiftHistory), asRows(incoming.shiftHistory));
  const shift = mergeShift(cur.shift, incoming.shift, asRows(cur.shiftHistory), asRows(incoming.shiftHistory));

  const ticketSeq = Math.max(
    Number(cur.ticketSeq ?? 0) || 0,
    Number(incoming.ticketSeq ?? 0) || 0,
    ...Object.values(book).map((t) => Number.parseInt(String(t.number ?? ''), 10) || 0),
    ...days.map((t) => Number.parseInt(String(t.number ?? ''), 10) || 0),
  );

  return {
    ...cur,
    ...incoming,
    rev: Math.max(Number(cur.rev ?? 0), Number(incoming.rev ?? 0)),
    origin: incoming.origin ?? cur.origin,
    ticketSeq,
    ticketBook: book,
    dayOrders: days,
    kitchenBoard,
    tables,
    sales,
    moves,
    shiftHistory,
    shift,
    // Prefer incoming for inventory/settings when provided.
    stock: incoming.stock ?? cur.stock,
    stockByStore: incoming.stockByStore ?? cur.stockByStore,
    activeStoreId: incoming.activeStoreId ?? cur.activeStoreId,
    recipes: incoming.recipes ?? cur.recipes,
    branchId: incoming.branchId ?? cur.branchId,
    settings: incoming.settings ?? cur.settings,
    features: incoming.features ?? cur.features,
  };
}

export function nextTicketSeqFromTickets(tickets: Array<{ number?: string }>): number {
  let max = 42;
  for (const t of tickets) {
    const n = Number.parseInt(String(t.number ?? ''), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max;
}
