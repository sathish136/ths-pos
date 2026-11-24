/** Shift open / close + cash reconcile for Manager demo. */

export type ShiftStatus = 'closed' | 'open';

export type ShiftRecord = {
  id: string;
  status: ShiftStatus;
  openedAt: string;
  /** Epoch ms — kitchen / orders for this shift window */
  openedAtMs?: number;
  openedBy: string;
  closedAt?: string;
  closedBy?: string;
  openingFloat: number;
  declaredCash?: number;
  expectedCash?: number;
  cardTotal?: number;
  variance?: number;
  note?: string;
};

export function openShift(by: string, openingFloat: number): ShiftRecord {
  const openedAtMs = Date.now();
  return {
    id: `shift-${openedAtMs}`,
    status: 'open',
    openedAt: new Date(openedAtMs).toLocaleString(),
    openedAtMs,
    openedBy: by,
    openingFloat,
  };
}

export function closeShift(
  shift: ShiftRecord,
  by: string,
  opts: { declaredCash: number; expectedCash: number; cardTotal: number; note?: string },
): ShiftRecord {
  const variance = Math.round((opts.declaredCash - opts.expectedCash) * 100) / 100;
  return {
    ...shift,
    status: 'closed',
    closedAt: new Date().toLocaleString(),
    closedBy: by,
    declaredCash: opts.declaredCash,
    expectedCash: opts.expectedCash,
    cardTotal: opts.cardTotal,
    variance,
    note: opts.note,
  };
}
