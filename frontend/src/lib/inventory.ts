/** Recipe BOM + stock deduction for restaurant POS demo. */

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  reorderAt: number;
};

export type RecipeLine = {
  ingredientId: string;
  qty: number;
};

/** dishId → recipe lines (seed; mutable in app for recipe editor) */
export type RecipeBook = Record<string, RecipeLine[]>;

export const DEFAULT_RECIPES: RecipeBook = {
  toast: [
    { ingredientId: 'sourdough', qty: 2 },
    { ingredientId: 'ricotta', qty: 0.08 },
    { ingredientId: 'tomato', qty: 0.12 },
    { ingredientId: 'basil', qty: 0.01 },
  ],
  gnocchi: [
    { ingredientId: 'gnocchi', qty: 0.22 },
    { ingredientId: 'butter', qty: 0.04 },
    { ingredientId: 'parmesan', qty: 0.03 },
    { ingredientId: 'hazelnut', qty: 0.02 },
    { ingredientId: 'sage', qty: 0.005 },
  ],
  salmon: [
    { ingredientId: 'salmon', qty: 0.18 },
    { ingredientId: 'fennel', qty: 0.1 },
    { ingredientId: 'lemon', qty: 0.5 },
    { ingredientId: 'creme', qty: 0.04 },
    { ingredientId: 'greens', qty: 0.05 },
  ],
  'short-rib': [
    { ingredientId: 'beef', qty: 0.28 },
    { ingredientId: 'potato', qty: 0.2 },
    { ingredientId: 'carrot', qty: 0.1 },
    { ingredientId: 'redwine', qty: 0.08 },
  ],
  schnitzel: [
    { ingredientId: 'chicken', qty: 0.22 },
    { ingredientId: 'panko', qty: 0.06 },
    { ingredientId: 'cabbage', qty: 0.08 },
    { ingredientId: 'lemon', qty: 0.25 },
  ],
  cake: [
    { ingredientId: 'chocolate', qty: 0.09 },
    { ingredientId: 'oliveoil', qty: 0.03 },
    { ingredientId: 'creme', qty: 0.05 },
    { ingredientId: 'berries', qty: 0.06 },
  ],
};

/** @deprecated use DEFAULT_RECIPES / app state */
export const RECIPES = DEFAULT_RECIPES;

export function seedStock(): Ingredient[] {
  return [
    { id: 'sourdough', name: 'Sourdough slices', unit: 'pc', onHand: 48, reorderAt: 12 },
    { id: 'ricotta', name: 'Whipped ricotta', unit: 'kg', onHand: 2.4, reorderAt: 0.5 },
    { id: 'tomato', name: 'Roasted tomato', unit: 'kg', onHand: 3.1, reorderAt: 0.8 },
    { id: 'basil', name: 'Fresh basil', unit: 'kg', onHand: 0.35, reorderAt: 0.08 },
    { id: 'gnocchi', name: 'Potato gnocchi', unit: 'kg', onHand: 6.5, reorderAt: 1.5 },
    { id: 'butter', name: 'Brown butter', unit: 'kg', onHand: 1.8, reorderAt: 0.4 },
    { id: 'parmesan', name: 'Parmesan', unit: 'kg', onHand: 1.2, reorderAt: 0.3 },
    { id: 'hazelnut', name: 'Toasted hazelnut', unit: 'kg', onHand: 0.9, reorderAt: 0.2 },
    { id: 'sage', name: 'Sage', unit: 'kg', onHand: 0.15, reorderAt: 0.04 },
    { id: 'salmon', name: 'Salmon fillet', unit: 'kg', onHand: 4.2, reorderAt: 1.0 },
    { id: 'fennel', name: 'Fennel', unit: 'kg', onHand: 2.0, reorderAt: 0.5 },
    { id: 'lemon', name: 'Lemon', unit: 'pc', onHand: 36, reorderAt: 10 },
    { id: 'creme', name: 'Crème fraîche', unit: 'kg', onHand: 1.5, reorderAt: 0.3 },
    { id: 'greens', name: 'Baby greens', unit: 'kg', onHand: 1.1, reorderAt: 0.3 },
    { id: 'beef', name: 'Short rib', unit: 'kg', onHand: 5.0, reorderAt: 1.2 },
    { id: 'potato', name: 'Whipped potato', unit: 'kg', onHand: 4.0, reorderAt: 1.0 },
    { id: 'carrot', name: 'Market carrots', unit: 'kg', onHand: 2.5, reorderAt: 0.6 },
    { id: 'redwine', name: 'Red wine reduction', unit: 'L', onHand: 1.6, reorderAt: 0.4 },
    { id: 'chicken', name: 'Chicken breast', unit: 'kg', onHand: 5.5, reorderAt: 1.5 },
    { id: 'panko', name: 'Panko crumb', unit: 'kg', onHand: 2.0, reorderAt: 0.5 },
    { id: 'cabbage', name: 'Shaved cabbage', unit: 'kg', onHand: 2.2, reorderAt: 0.5 },
    { id: 'chocolate', name: 'Dark chocolate', unit: 'kg', onHand: 1.8, reorderAt: 0.4 },
    { id: 'oliveoil', name: 'Olive oil', unit: 'L', onHand: 3.0, reorderAt: 0.8 },
    { id: 'berries', name: 'Seasonal berries', unit: 'kg', onHand: 1.4, reorderAt: 0.3 },
  ];
}

export type StockMove = {
  id: string;
  at: string;
  ticketNumber: string;
  dishName: string;
  dishQty: number;
  ingredientId: string;
  ingredientName: string;
  qty: number;
  unit: string;
  by: string;
};

export type DeductionPreview = {
  dishId: string;
  dishName: string;
  dishQty: number;
  lines: { ingredientId: string; name: string; qty: number; unit: string; before: number; after: number }[];
};

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function previewDeductions(
  stock: Ingredient[],
  lines: { menuItemId: string; menuItemName: string; quantity: number }[],
  recipes: RecipeBook = DEFAULT_RECIPES,
): DeductionPreview[] {
  const byId = Object.fromEntries(stock.map((s) => [s.id, s]));
  return lines
    .map((line) => {
      const recipe = recipes[line.menuItemId] ?? [];
      return {
        dishId: line.menuItemId,
        dishName: line.menuItemName,
        dishQty: line.quantity,
        lines: recipe.map((r) => {
          const ing = byId[r.ingredientId];
          const qty = roundQty(r.qty * line.quantity);
          const before = ing?.onHand ?? 0;
          return {
            ingredientId: r.ingredientId,
            name: ing?.name ?? r.ingredientId,
            qty,
            unit: ing?.unit ?? '',
            before,
            after: roundQty(before - qty),
          };
        }),
      };
    })
    .filter((d) => d.lines.length);
}

/** Apply recipe stock deduction when ticket is sent to kitchen. */
export function deductForTicket(
  stock: Ingredient[],
  lines: { menuItemId: string; menuItemName: string; quantity: number }[],
  meta: { ticketNumber: string; by: string },
  recipes: RecipeBook = DEFAULT_RECIPES,
): { stock: Ingredient[]; moves: StockMove[]; previews: DeductionPreview[] } {
  const previews = previewDeductions(stock, lines, recipes);
  const next = stock.map((s) => ({ ...s }));
  const index = Object.fromEntries(next.map((s, i) => [s.id, i]));
  const moves: StockMove[] = [];
  const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  for (const preview of previews) {
    for (const line of preview.lines) {
      const i = index[line.ingredientId];
      if (i === undefined) continue;
      next[i] = { ...next[i], onHand: roundQty(Math.max(0, next[i].onHand - line.qty)) };
      moves.push({
        id: `m-${Date.now()}-${line.ingredientId}-${preview.dishId}`,
        at,
        ticketNumber: meta.ticketNumber,
        dishName: preview.dishName,
        dishQty: preview.dishQty,
        ingredientId: line.ingredientId,
        ingredientName: line.name,
        qty: line.qty,
        unit: line.unit,
        by: meta.by,
      });
    }
  }

  return { stock: next, moves, previews };
}

export function lowStock(stock: Ingredient[]): Ingredient[] {
  return stock.filter((s) => s.onHand <= s.reorderAt);
}

/** Receive / purchase stock (add qty). */
export function receiveStock(
  stock: Ingredient[],
  ingredientId: string,
  qty: number,
  meta: { by: string; note?: string; receiptNo?: string },
): { stock: Ingredient[]; move: StockMove | null } {
  if (qty <= 0) return { stock, move: null };
  const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  let move: StockMove | null = null;
  const next = stock.map((s) => {
    if (s.id !== ingredientId) return s;
    const onHand = roundQty(s.onHand + qty);
    move = {
      id: `in-${Date.now()}-${s.id}`,
      at,
      ticketNumber: meta.receiptNo?.trim() || 'RECV',
      dishName: meta.note || 'Stock receive',
      dishQty: 1,
      ingredientId: s.id,
      ingredientName: s.name,
      qty: -qty, // negative qty in log = inbound (display as +)
      unit: s.unit,
      by: meta.by,
    };
    return { ...s, onHand };
  });
  return { stock: next, move };
}

/**
 * Post a Purchase Receipt line into a store (demo of PR → warehouse).
 * Updates stockByStore for the target store and returns movement(s).
 */
export function receiveFromPurchaseReceipt(
  stockByStore: StockByStore,
  storeId: string,
  lines: { ingredientId: string; qty: number }[],
  meta: { by: string; receiptNo: string; supplier?: string },
): {
  ok: boolean;
  reason?: string;
  stockByStore: StockByStore;
  moves: StockMove[];
} {
  const receiptNo = meta.receiptNo.trim();
  if (!receiptNo) {
    return { ok: false, reason: 'Enter Purchase Receipt number', stockByStore, moves: [] };
  }
  if (!STOCK_STORES.some((s) => s.id === storeId)) {
    return { ok: false, reason: 'Pick a store / warehouse', stockByStore, moves: [] };
  }
  const validLines = lines.filter((l) => l.qty > 0 && l.ingredientId);
  if (!validLines.length) {
    return { ok: false, reason: 'Add at least one item qty', stockByStore, moves: [] };
  }

  let nextStoreStock = [...(stockByStore[storeId] ?? seedStock())];
  const moves: StockMove[] = [];
  const storeName = storeById(storeId).name;
  const note = meta.supplier
    ? `Purchase Receipt · ${meta.supplier} → ${storeName}`
    : `Purchase Receipt → ${storeName}`;

  for (const line of validLines) {
    const { stock: updated, move } = receiveStock(nextStoreStock, line.ingredientId, line.qty, {
      by: meta.by,
      note,
      receiptNo,
    });
    nextStoreStock = updated;
    if (move) moves.push(move);
  }

  return {
    ok: true,
    stockByStore: { ...stockByStore, [storeId]: nextStoreStock },
    moves,
  };
}

/** Manual adjust (set / write-off). delta can be negative. */
export function adjustStock(
  stock: Ingredient[],
  ingredientId: string,
  delta: number,
  meta: { by: string; note?: string },
): { stock: Ingredient[]; move: StockMove | null } {
  if (delta === 0) return { stock, move: null };
  const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  let move: StockMove | null = null;
  const next = stock.map((s) => {
    if (s.id !== ingredientId) return s;
    const onHand = roundQty(Math.max(0, s.onHand + delta));
    move = {
      id: `adj-${Date.now()}-${s.id}`,
      at,
      ticketNumber: 'ADJ',
      dishName: meta.note || (delta > 0 ? 'Stock adjust +' : 'Write-off'),
      dishQty: 1,
      ingredientId: s.id,
      ingredientName: s.name,
      qty: -delta,
      unit: s.unit,
      by: meta.by,
    };
    return { ...s, onHand };
  });
  return { stock: next, move };
}

export function addIngredient(
  stock: Ingredient[],
  item: Omit<Ingredient, 'id'> & { id?: string },
): Ingredient[] {
  const id =
    item.id ||
    item.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
    `ing-${Date.now()}`;
  if (stock.some((s) => s.id === id)) {
    return receiveStock(stock, id, item.onHand, { by: 'system', note: 'Merge new' }).stock;
  }
  return [...stock, { id, name: item.name, unit: item.unit, onHand: item.onHand, reorderAt: item.reorderAt }];
}

/** Inventory locations for POS store-to-store transfer. */
export type StockStore = { id: string; name: string; code: string };

export const STOCK_STORES: StockStore[] = [
  { id: 'store1', name: 'Store 1', code: 'S1' },
  { id: 'store2', name: 'Store 2', code: 'S2' },
];

export type StockByStore = Record<string, Ingredient[]>;

export function seedStockByStore(): StockByStore {
  const store1 = seedStock();
  // Store 2 starts with ~40% of Store 1 so transfer demo is obvious
  const store2 = seedStock().map((s) => ({
    ...s,
    onHand: roundQty(s.onHand * 0.4),
  }));
  return { store1, store2 };
}

export function storeById(id: string): StockStore {
  return STOCK_STORES.find((s) => s.id === id) ?? STOCK_STORES[0];
}

/** Map POS branch → stock store (Main/Airport → Store 1, Harbor → Store 2). */
export function storeIdForBranch(branchId: string): string {
  return branchId === 'harbor' ? 'store2' : 'store1';
}

/**
 * Transfer qty of one ingredient from Store A → Store B.
 * Creates two movement lines (out + in).
 */
export function transferStock(
  stockByStore: StockByStore,
  fromStoreId: string,
  toStoreId: string,
  ingredientId: string,
  qty: number,
  meta: { by: string; note?: string },
): {
  ok: boolean;
  reason?: string;
  stockByStore: StockByStore;
  moves: StockMove[];
} {
  if (fromStoreId === toStoreId) {
    return { ok: false, reason: 'Pick two different stores', stockByStore, moves: [] };
  }
  if (!qty || qty <= 0) {
    return { ok: false, reason: 'Enter a transfer qty', stockByStore, moves: [] };
  }
  const fromList = stockByStore[fromStoreId];
  const toList = stockByStore[toStoreId];
  if (!fromList || !toList) {
    return { ok: false, reason: 'Unknown store', stockByStore, moves: [] };
  }
  const fromIng = fromList.find((s) => s.id === ingredientId);
  if (!fromIng) {
    return { ok: false, reason: 'Ingredient not found in source store', stockByStore, moves: [] };
  }
  if (fromIng.onHand < qty) {
    return {
      ok: false,
      reason: `Only ${fromIng.onHand} ${fromIng.unit} available in ${storeById(fromStoreId).name}`,
      stockByStore,
      moves: [],
    };
  }

  const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fromName = storeById(fromStoreId).name;
  const toName = storeById(toStoreId).name;
  const note = meta.note || `Transfer ${fromName} → ${toName}`;

  const nextFrom = fromList.map((s) =>
    s.id === ingredientId ? { ...s, onHand: roundQty(s.onHand - qty) } : s,
  );
  let nextTo: Ingredient[];
  if (toList.some((s) => s.id === ingredientId)) {
    nextTo = toList.map((s) =>
      s.id === ingredientId ? { ...s, onHand: roundQty(s.onHand + qty) } : s,
    );
  } else {
    nextTo = [...toList, { ...fromIng, onHand: roundQty(qty) }];
  }

  const moves: StockMove[] = [
    {
      id: `xfer-out-${Date.now()}-${ingredientId}`,
      at,
      ticketNumber: 'XFER',
      dishName: `${note} (out)`,
      dishQty: 1,
      ingredientId: fromIng.id,
      ingredientName: fromIng.name,
      qty, // outbound
      unit: fromIng.unit,
      by: meta.by,
    },
    {
      id: `xfer-in-${Date.now()}-${ingredientId}`,
      at,
      ticketNumber: 'XFER',
      dishName: `${note} (in)`,
      dishQty: 1,
      ingredientId: fromIng.id,
      ingredientName: fromIng.name,
      qty: -qty, // inbound convention
      unit: fromIng.unit,
      by: meta.by,
    },
  ];

  return {
    ok: true,
    stockByStore: {
      ...stockByStore,
      [fromStoreId]: nextFrom,
      [toStoreId]: nextTo,
    },
    moves,
  };
}
