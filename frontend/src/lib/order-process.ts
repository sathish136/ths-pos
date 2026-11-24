/** Restaurant order process — status machine, guards, and totals. */

export type OrderType = 'Dine in' | 'Takeaway' | 'Delivery';

export type OrderStatus =
  | 'Open'
  | 'Sent to kitchen'
  | 'Preparing'
  | 'Ready'
  | 'Served'
  | 'Paid';

export type ProcessAction =
  | 'add_items'
  | 'edit_ticket'
  | 'send_to_kitchen'
  | 'accept_order'
  | 'reject_order'
  | 'start_preparing'
  | 'mark_ready'
  | 'mark_served'
  | 'take_payment'
  | 'void_ticket'
  | 'new_order';

export type PaymentMethod = 'Card' | 'Cash' | 'Split' | 'Credit' | 'Loyalty';

export type PaymentBreakdown = {
  method: PaymentMethod;
  /** Loyalty / discount card number when method is Loyalty */
  loyaltyId?: string;
  /** Amount charged on card (0 if cash-only) */
  cardAmount: number;
  /** Amount taken as cash (0 if card-only) */
  cashAmount: number;
  /** Cash tendered by guest (may be > cashAmount) */
  cashTendered?: number;
  /** Change returned */
  changeDue?: number;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Default price */
  price: number;
  /** Optional price per sales type (e.g. Delivery costs more). Falls back to `price`. */
  prices?: Partial<Record<OrderType, number>>;
  image: string;
  dietaryTags: string[];
  available: boolean;
};

export type OrderLine = {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
  /** Item-level discount (Manager). Taken off this line before bill discount. */
  discount?: { kind: 'percent' | 'amount'; value: number; reason: string; by?: string };
};

export type DeliveryPayMode = 'Cash on delivery' | 'Card on delivery' | 'Paid online' | 'UPI';

export type Ticket = {
  id: string;
  number: string;
  type: OrderType;
  table: string;
  partySize: number;
  items: OrderLine[];
  status: OrderStatus;
  openedAt: string;
  openedAtMs: number;
  sentAt?: string;
  sentAtMs?: number;
  readyAt?: string;
  servedAt?: string;
  paidAt?: string;
  /** Settled tender at payment (Cashier / Delivery) */
  paymentMethod?: PaymentMethod;
  paymentBreakdown?: PaymentBreakdown;
  receiptNumber?: string;
  /** Set when kitchen rejects a sent ticket */
  kitchenRejectReason?: string;
  /** Free-text courier note (legacy / extra) */
  deliveryNote?: string;
  /** Delivery customer details */
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  /** How the guest will pay for delivery (set when taking the order) */
  deliveryPayMode?: DeliveryPayMode;
  /** Bill-level discount (Manager only). Applied before tax. */
  discount?: BillDiscount;
  /** Tip collected with payment (not taxed) */
  tip?: number;
  /** Order was taken for a scheduled pickup / delivery time (HH:MM) */
  scheduledFor?: string;
  /** Sales channel for call center / online intake */
  channel?: 'Walk-in' | 'Phone' | 'Online';
  /** Loyalty card or discount card id used as tender */
  loyaltyId?: string;
  /** Delivery rider who collects payment at the door (required before payment) */
  driverName?: string;
  /** Staff member (named account, or role label) who opened the ticket */
  captain?: string;
  /** Items cancelled from this ticket, with reason (feeds voids & cancels reports) */
  cancelled?: CancelledLine[];
};

export type CancelledLine = {
  name: string;
  qty: number;
  amount: number;
  reason: string;
  by: string;
  captain?: string;
  at: string;
  atMs: number;
  /** true when the item had already gone to the kitchen */
  wasSent: boolean;
};

/** Kitchen SLA target minutes from send → ready */
export const KITCHEN_SLA_MINUTES = 15;

export type PaceStatus = 'on_time' | 'at_risk' | 'late' | 'done';

export function kitchenPace(
  ticket: Ticket,
  nowMs = Date.now(),
  slaMinutes = KITCHEN_SLA_MINUTES,
): {
  elapsedMin: number;
  remainingMin: number;
  pace: PaceStatus;
  label: string;
  elapsedLabel: string;
} {
  const fmt = (m: number) => {
    const mm = Math.floor(m);
    const ss = Math.floor((m - mm) * 60);
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  if (!ticket.sentAtMs) {
    return {
      elapsedMin: 0,
      remainingMin: slaMinutes,
      pace: 'on_time',
      label: 'Not sent',
      elapsedLabel: '00:00',
    };
  }
  const elapsedExact = Math.max(0, (nowMs - ticket.sentAtMs) / 60000);
  const elapsedMin = Math.floor(elapsedExact);
  const elapsedLabel = fmt(elapsedExact);
  const finished = ticket.status === 'Ready' || ticket.status === 'Served' || ticket.status === 'Paid';
  if (finished) {
    const onTime = elapsedMin <= slaMinutes;
    return {
      elapsedMin,
      remainingMin: 0,
      pace: onTime ? 'on_time' : 'late',
      label: onTime ? 'Done · on time' : 'Done · was late',
      elapsedLabel,
    };
  }
  const remainingMin = slaMinutes - elapsedMin;
  if (elapsedMin >= slaMinutes) {
    return {
      elapsedMin,
      remainingMin: 0,
      pace: 'late',
      label: `Late · ${elapsedMin - slaMinutes}m over`,
      elapsedLabel,
    };
  }
  if (elapsedMin >= slaMinutes - 3) {
    return {
      elapsedMin,
      remainingMin,
      pace: 'at_risk',
      label: `At risk · ${remainingMin}m left`,
      elapsedLabel,
    };
  }
  return {
    elapsedMin,
    remainingMin,
    pace: 'on_time',
    label: `On time · ${remainingMin}m left`,
    elapsedLabel,
  };
}

export type Totals = {
  /** Gross before bill discount */
  subtotal: number;
  /** Bill-level discount amount (>= 0) */
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
};

/** Bill-level discount. `percent` is 0–100; `amount` is a currency value. */
export type BillDiscount = {
  kind: 'percent' | 'amount';
  value: number;
  /** Required reason — kept for audit (e.g. "Staff meal", "Complaint") */
  reason: string;
  /** Who applied it (role label) */
  by?: string;
};

export const TAX_RATE = 0.0825;

export const STATUS_FLOW: OrderStatus[] = [
  'Open',
  'Sent to kitchen',
  'Preparing',
  'Ready',
  'Served',
  'Paid',
];

const TRANSITIONS: Record<OrderStatus, Partial<Record<ProcessAction, OrderStatus>>> = {
  Open: {
    send_to_kitchen: 'Sent to kitchen',
    void_ticket: 'Open',
    new_order: 'Open',
  },
  'Sent to kitchen': {
    start_preparing: 'Preparing',
    accept_order: 'Preparing',
    reject_order: 'Open',
    void_ticket: 'Open',
  },
  Preparing: {
    mark_ready: 'Ready',
  },
  Ready: {
    mark_served: 'Served',
    take_payment: 'Paid', // takeaway can pay at ready
  },
  Served: {
    take_payment: 'Paid',
  },
  Paid: {
    new_order: 'Open',
  },
};

/** Which actions are allowed in the current status (before item/type checks). */
export function actionsForStatus(status: OrderStatus): ProcessAction[] {
  return Object.keys(TRANSITIONS[status] ?? {}) as ProcessAction[];
}

/** Edit qty/notes while ticket is still open (not yet fired to kitchen). */
export function canEditTicket(status: OrderStatus): boolean {
  return status === 'Open';
}

/** Add dishes until paid — after kitchen send, new lines need another fire. */
export function canAddItems(status: OrderStatus): boolean {
  return status !== 'Paid';
}

/**
 * Add-ons after fire: keep kitchen status so the expo card does not disappear.
 * New lines show on the same kitchen ticket; Captain does not need to re-send for the demo.
 */
export function reopenForAddons(ticket: Ticket): Ticket {
  return ticket;
}

export function nextKitchenAction(status: OrderStatus): ProcessAction | null {
  if (status === 'Sent to kitchen') return 'start_preparing';
  if (status === 'Preparing') return 'mark_ready';
  if (status === 'Ready') return 'mark_served';
  return null;
}

export function canTakePayment(ticket: Pick<Ticket, 'status' | 'type' | 'items'>): boolean {
  if (!ticket.items.length) return false;
  if (ticket.status === 'Served') return true;
  // Takeaway / Delivery: pay when ready (no table service)
  if ((ticket.type === 'Takeaway' || ticket.type === 'Delivery') && ticket.status === 'Ready') return true;
  return false;
}

export function canSendToKitchen(ticket: Pick<Ticket, 'status' | 'items' | 'type' | 'table'>): {
  ok: boolean;
  reason?: string;
} {
  if (ticket.status !== 'Open') return { ok: false, reason: 'Ticket already sent' };
  if (!ticket.items.length) return { ok: false, reason: 'Add at least one dish' };
  if (ticket.type === 'Dine in' && !ticket.table.trim()) {
    return { ok: false, reason: 'Select a table' };
  }
  return { ok: true };
}

/** Drop corrupt sync lines (e.g. bare numbers) so UI never crashes on `.price`. */
export function sanitizeOrderLines(items: unknown): OrderLine[] {
  if (!Array.isArray(items)) return [];
  return items.filter((line): line is OrderLine => {
    if (!line || typeof line !== 'object') return false;
    const menuItem = (line as OrderLine).menuItem;
    return (
      !!menuItem &&
      typeof menuItem === 'object' &&
      typeof menuItem.price === 'number' &&
      Number.isFinite(menuItem.price) &&
      typeof (line as OrderLine).quantity === 'number'
    );
  });
}

export function sanitizeTicket<T extends { items?: unknown }>(ticket: T): T {
  return { ...ticket, items: sanitizeOrderLines(ticket.items) };
}

/** Money off the bill, clamped to 0..gross. */
export function discountAmount(gross: number, discount?: BillDiscount): number {
  if (!discount || !(discount.value > 0)) return 0;
  const raw =
    discount.kind === 'percent'
      ? (gross * Math.min(discount.value, 100)) / 100
      : discount.value;
  return roundMoney(Math.min(gross, Math.max(0, raw)));
}

/** Unit price for a sales type (falls back to the default price). */
export function unitPrice(menuItem: MenuItem, type: OrderType = 'Dine in'): number {
  const v = menuItem.prices?.[type];
  return typeof v === 'number' && Number.isFinite(v) ? v : menuItem.price;
}

/** Line amount after the item-level discount (never negative). */
export function lineAmount(line: OrderLine, type: OrderType = 'Dine in'): { list: number; off: number; net: number } {
  const list = roundMoney(unitPrice(line.menuItem, type) * line.quantity);
  const off = line.discount ? discountAmount(list, line.discount) : 0;
  return { list, off, net: roundMoney(list - off) };
}

export function calcTotals(
  items: OrderLine[],
  taxRate = TAX_RATE,
  discount?: BillDiscount,
  type: OrderType = 'Dine in',
): Totals {
  const safe = sanitizeOrderLines(items);
  const list = safe.reduce((sum, line) => sum + lineAmount(line, type).list, 0);
  const itemOff = safe.reduce((sum, line) => sum + lineAmount(line, type).off, 0);
  const gross = roundMoney(list - itemOff);
  const off = roundMoney(itemOff + discountAmount(gross, discount));
  const net = roundMoney(list - off);
  // Tax is charged on the discounted (taxable) value
  const tax = roundMoney(net * taxRate);
  const total = roundMoney(net + tax);
  const itemCount = safe.reduce((sum, line) => sum + line.quantity, 0);
  return {
    subtotal: roundMoney(list),
    discount: off,
    tax,
    total,
    itemCount,
  };
}

/** Totals for a whole ticket (lines + item + bill discount, price for its sales type). */
export function ticketTotals(ticket: Pick<Ticket, 'items' | 'discount' | 'type'>): Totals {
  return calcTotals(ticket.items, TAX_RATE, ticket.discount, ticket.type);
}

/** Amount the guest pays: bill total plus any tip. */
export function amountDue(ticket: Pick<Ticket, 'items' | 'discount' | 'type' | 'tip'>): number {
  return roundMoney(ticketTotals(ticket).total + (ticket.tip ?? 0));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyLineDelta(items: OrderLine[], id: string, delta: number): OrderLine[] {
  return items.flatMap((line) => {
    if (line.menuItem.id !== id) return [line];
    const quantity = line.quantity + delta;
    return quantity <= 0 ? [] : [{ ...line, quantity }];
  });
}

export function addOrBumpLine(items: OrderLine[], dish: MenuItem): OrderLine[] {
  if (!dish.available) return items;
  const found = items.find((line) => line.menuItem.id === dish.id);
  if (found) {
    return items.map((line) =>
      line.menuItem.id === dish.id ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }
  return [...items, { menuItem: dish, quantity: 1, notes: '' }];
}

export function setLineNotes(items: OrderLine[], id: string, notes: string): OrderLine[] {
  return items.map((line) => (line.menuItem.id === id ? { ...line, notes } : line));
}

export function removeLine(items: OrderLine[], id: string): OrderLine[] {
  return items.filter((line) => line.menuItem.id !== id);
}

export type ProcessResult =
  | { ok: true; ticket: Ticket; message: string }
  | { ok: false; reason: string };

function nowLabel(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function stamp(ticket: Ticket, status: OrderStatus): Ticket {
  const t = { ...ticket, status };
  if (status === 'Sent to kitchen') {
    t.sentAt = nowLabel();
    t.sentAtMs = Date.now();
  }
  if (status === 'Ready') t.readyAt = nowLabel();
  if (status === 'Served') t.servedAt = nowLabel();
  if (status === 'Paid') t.paidAt = nowLabel();
  return t;
}

/**
 * Run one process step. Pure — returns a new ticket or a rejection reason.
 */
export function runProcess(
  ticket: Ticket,
  action: ProcessAction,
  opts: {
    paymentMethod?: PaymentMethod;
    paymentBreakdown?: PaymentBreakdown;
    rejectReason?: string;
  } = {},
): ProcessResult {
  if (action === 'void_ticket') {
    if (!['Open', 'Sent to kitchen'].includes(ticket.status)) {
      return { ok: false, reason: 'Cannot void after kitchen has started cooking' };
    }
    return {
      ok: true,
      ticket: {
        ...ticket,
        items: [],
        status: 'Open',
        sentAt: undefined,
        readyAt: undefined,
        servedAt: undefined,
        kitchenRejectReason: undefined,
      },
      message: 'Ticket voided',
    };
  }

  if (action === 'new_order') {
    return {
      ok: true,
      ticket: createEmptyTicket(ticket.type, ticket.table, ticket.partySize),
      message: 'New ticket ready',
    };
  }

  if (action === 'send_to_kitchen') {
    const check = canSendToKitchen(ticket);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Cannot send' };
    return {
      ok: true,
      ticket: {
        ...stamp(ticket, 'Sent to kitchen'),
        kitchenRejectReason: undefined,
      },
      message: 'Ticket sent · kitchen has the order',
    };
  }

  if (action === 'reject_order') {
    if (ticket.status !== 'Sent to kitchen') {
      return { ok: false, reason: 'Only new kitchen tickets can be rejected' };
    }
    const reason = (opts.rejectReason || 'Kitchen rejected').trim();
    return {
      ok: true,
      ticket: {
        ...ticket,
        status: 'Open',
        sentAt: undefined,
        sentAtMs: undefined,
        kitchenRejectReason: reason,
      },
      message: `Rejected — ${reason}. Captain can edit & re-send.`,
    };
  }

  if (action === 'accept_order') {
    if (ticket.status === 'Preparing') {
      return { ok: true, ticket, message: 'Already accepted' };
    }
    if (ticket.status !== 'Sent to kitchen') {
      return { ok: false, reason: 'Only new kitchen tickets can be accepted' };
    }
    return {
      ok: true,
      ticket: stamp({ ...ticket, kitchenRejectReason: undefined }, 'Preparing'),
      message: 'Kitchen accepted · preparing',
    };
  }

  if (action === 'take_payment') {
    if (!canTakePayment(ticket)) {
      return {
        ok: false,
        reason:
          ticket.type === 'Delivery' || ticket.type === 'Takeaway'
            ? 'Kitchen must Mark ready before payment'
            : 'Serve the table before taking payment',
      };
    }
    const breakdown = opts.paymentBreakdown;
    const method = breakdown?.method ?? opts.paymentMethod ?? 'Card';
    if (breakdown && breakdown.method !== 'Credit' && breakdown.method !== 'Loyalty') {
      const paid = Math.round((breakdown.cardAmount + breakdown.cashAmount) * 100) / 100;
      const due = amountDue(ticket);
      if (paid + 0.001 < due) {
        return { ok: false, reason: `Payment short — need ${due}, got ${paid}` };
      }
    }
    const change = breakdown?.changeDue ?? 0;
    return {
      ok: true,
      ticket: {
        ...stamp(ticket, 'Paid'),
        paymentMethod: method,
        paymentBreakdown: breakdown,
        receiptNumber: `URY-${String(Date.now()).slice(-6)}`,
      },
      message:
        method === 'Split'
          ? `Paid split · card ${breakdown?.cardAmount ?? 0} + cash ${breakdown?.cashAmount ?? 0}${change ? ` · change ${change}` : ''}`
          : method === 'Cash' && change
            ? `Paid cash · change ${change}`
            : `Paid by ${method}`,
    };
  }

  // Idempotent kitchen taps (mobile double-tap / stale card).
  if (action === 'start_preparing' && ticket.status === 'Preparing') {
    return { ok: true, ticket, message: 'Already preparing' };
  }
  if (action === 'mark_ready' && ticket.status === 'Ready') {
    return { ok: true, ticket, message: 'Already marked ready' };
  }
  if (action === 'mark_served' && ticket.status === 'Served') {
    return { ok: true, ticket, message: 'Already served' };
  }

  const next = TRANSITIONS[ticket.status]?.[action];
  if (!next) {
    return { ok: false, reason: `Action "${action}" not allowed from ${ticket.status}` };
  }

  const messages: Partial<Record<ProcessAction, string>> = {
    start_preparing: 'Kitchen started preparing',
    accept_order: 'Kitchen accepted · preparing',
    mark_ready: 'Order ready for pickup / run',
    mark_served: 'Order served to table',
  };

  return {
    ok: true,
    ticket: stamp(ticket, next),
    message: messages[action] ?? `Moved to ${next}`,
  };
}

let ticketSeq = 42;

/** Keep numbers unique across devices / refreshes (max existing + 1). */
export function syncTicketSeq(tickets: Array<{ number?: string } | number | null | undefined>) {
  let max = ticketSeq;
  for (const t of tickets) {
    if (typeof t === 'number') {
      if (!Number.isNaN(t)) max = Math.max(max, t);
      continue;
    }
    if (t == null) continue;
    const n = Number.parseInt(String(typeof t === 'object' ? t.number ?? '' : t), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  ticketSeq = max;
}

export function currentTicketSeq() {
  return ticketSeq;
}

export function createEmptyTicket(
  type: OrderType = 'Dine in',
  table = 'Table 12',
  partySize = 2,
  deliveryNote = '',
  /** When set (from shared allocator) — guarantees unique # across tablets. */
  numberOverride?: number,
): Ticket {
  let seq: number;
  if (typeof numberOverride === 'number' && numberOverride > 0) {
    seq = numberOverride;
    ticketSeq = Math.max(ticketSeq, seq);
  } else {
    ticketSeq += 1;
    seq = ticketSeq;
  }
  const openedAtMs = Date.now();
  return {
    // seq in id prevents same-ms collisions overwriting another live ticket in the book
    id: `t-${openedAtMs}-${seq}`,
    number: String(seq).padStart(3, '0'),
    type,
    table: type === 'Dine in' ? table : type === 'Delivery' ? 'Delivery' : 'Pickup',
    partySize: type === 'Delivery' ? Math.max(1, partySize) : partySize,
    items: [],
    status: 'Open',
    openedAt: nowLabel(),
    openedAtMs,
    deliveryNote: type === 'Delivery' ? deliveryNote : undefined,
    customerName: type === 'Delivery' ? '' : undefined,
    customerPhone: type === 'Delivery' ? '' : undefined,
    deliveryAddress: type === 'Delivery' ? '' : undefined,
    deliveryPayMode: type === 'Delivery' ? 'Cash on delivery' : undefined,
  };
}

export function statusStepIndex(status: OrderStatus): number {
  return STATUS_FLOW.indexOf(status);
}

export function primaryActionLabel(ticket: Ticket): { action: ProcessAction; label: string } | null {
  if (ticket.status === 'Open') return { action: 'send_to_kitchen', label: 'Send to kitchen' };
  if (ticket.status === 'Sent to kitchen') return { action: 'start_preparing', label: 'Start preparing' };
  if (ticket.status === 'Preparing') return { action: 'mark_ready', label: 'Mark ready' };
  if (ticket.status === 'Ready' && ticket.type === 'Dine in') {
    return { action: 'mark_served', label: 'Mark served' };
  }
  if (canTakePayment(ticket)) return { action: 'take_payment', label: 'Take payment' };
  return null;
}

/** Stable book key — always by id so a new order never wipes another table/delivery ticket. */
export function ticketStorageKey(ticket: Pick<Ticket, 'type' | 'table' | 'id'>): string {
  return `ticket:${ticket.id}`;
}

/**
 * Move qty of one dish from source ticket onto another table's ticket.
 * Creates a new Open dine-in ticket on the destination if needed.
 */
export function moveLineQtyToTable(
  source: Ticket,
  destTableName: string,
  existingDest: Ticket | undefined,
  menuItemId: string,
  qty: number,
  /** Required when creating a brand-new destination ticket (shared allocator). */
  newDestNumber?: number,
): { ok: true; source: Ticket; dest: Ticket } | { ok: false; reason: string } {
  if (source.type !== 'Dine in') {
    return { ok: false, reason: 'Move dishes only works on dine-in tickets' };
  }
  if (source.status === 'Paid') {
    return { ok: false, reason: 'Cannot move dishes from a paid ticket' };
  }
  if (!destTableName || destTableName === source.table) {
    return { ok: false, reason: 'Pick a different table' };
  }
  const line = source.items.find((l) => l.menuItem.id === menuItemId);
  if (!line) return { ok: false, reason: 'Dish not on this ticket' };
  if (!qty || qty < 1 || qty > line.quantity) {
    return { ok: false, reason: `Enter qty between 1 and ${line.quantity}` };
  }
  if (existingDest && existingDest.status === 'Paid') {
    return { ok: false, reason: 'Destination table ticket is already paid' };
  }

  const sourceItems = applyLineDelta(source.items, menuItemId, -qty);
  let dest: Ticket =
    existingDest && existingDest.status !== 'Paid'
      ? { ...existingDest }
      : createEmptyTicket(
          'Dine in',
          destTableName,
          Math.max(1, existingDest?.partySize ?? 2),
          '',
          newDestNumber,
        );

  // Ensure dest is dine-in on the chosen table
  dest = { ...dest, type: 'Dine in', table: destTableName };
  let destItems = [...dest.items];
  for (let i = 0; i < qty; i++) {
    destItems = addOrBumpLine(destItems, line.menuItem);
  }
  if (line.notes) {
    destItems = destItems.map((l) =>
      l.menuItem.id === menuItemId && !l.notes ? { ...l, notes: line.notes } : l,
    );
  }

  return {
    ok: true,
    source: { ...source, items: sourceItems },
    dest: { ...dest, items: destItems },
  };
}

/** Merge order lines from absorb into keep (same menu item → bump qty). */
export function mergeTicketItems(keep: Ticket, absorb: Ticket): Ticket {
  let items = [...keep.items];
  for (const line of absorb.items) {
    items = addOrBumpLine(items, line.menuItem);
    const last = items.find((l) => l.menuItem.id === line.menuItem.id);
    if (last && line.quantity > 1) {
      items = items.map((l) =>
        l.menuItem.id === line.menuItem.id
          ? { ...l, quantity: l.quantity + (line.quantity - 1), notes: l.notes || line.notes }
          : l,
      );
    } else if (last && line.notes && !last.notes) {
      items = items.map((l) =>
        l.menuItem.id === line.menuItem.id ? { ...l, notes: line.notes } : l,
      );
    }
  }
  return {
    ...keep,
    items,
    partySize: keep.partySize + absorb.partySize,
    table: keep.table,
  };
}

/** Find the live dine-in ticket on a table (kitchen / open / served — not paid). */
export function liveTicketForTable(
  book: Record<string, Ticket>,
  tableName: string,
): Ticket | undefined {
  const live = Object.values(book).filter(
    (t) => t.type === 'Dine in' && t.table === tableName && t.status !== 'Paid' && t.items.length > 0,
  );
  if (!live.length) {
    return Object.values(book).find(
      (t) => t.type === 'Dine in' && t.table === tableName && t.status !== 'Paid',
    );
  }
  // Prefer kitchen / in-service over a brand-new empty Open if both somehow exist
  return (
    live.find((t) => t.status !== 'Open') ??
    live.sort((a, b) => (b.openedAtMs ?? 0) - (a.openedAtMs ?? 0))[0]
  );
}

export function isKitchenQueueStatus(status: OrderStatus): boolean {
  return status === 'Sent to kitchen' || status === 'Preparing' || status === 'Ready';
}
