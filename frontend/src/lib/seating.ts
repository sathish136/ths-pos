/** Restaurant seating / floor plan for POS demo. */

export type SeatZone = 'Main' | 'Window' | 'Patio' | 'Bar';
export type SeatStatus = 'free' | 'seated' | 'ordered' | 'bill' | 'dirty';
export type TableShape = 'round' | 'square' | 'rect' | 'bar';

export type SeatTable = {
  id: string;
  name: string;
  zone: SeatZone;
  seats: number;
  status: SeatStatus;
  shape: TableShape;
  partySize?: number;
  ticketNumber?: string;
  server?: string;
  /** percent position on floor plan canvas */
  x: number;
  y: number;
};

export const SEAT_STATUS_LABEL: Record<SeatStatus, string> = {
  free: 'Free',
  seated: 'Seated',
  ordered: 'Ordered',
  bill: 'Bill ready',
  dirty: 'Needs clear',
};

export function seedTables(): SeatTable[] {
  // Clean day — no ghost orders; all free until Captain seats / orders.
  return [
    { id: 't04', name: 'Table 04', zone: 'Main', seats: 2, shape: 'round', status: 'free', x: 14, y: 22 },
    { id: 't07', name: 'Table 07', zone: 'Main', seats: 4, shape: 'square', status: 'free', x: 32, y: 20 },
    { id: 't12', name: 'Table 12', zone: 'Main', seats: 4, shape: 'square', status: 'free', x: 18, y: 48 },
    { id: 't16', name: 'Table 16', zone: 'Main', seats: 8, shape: 'rect', status: 'free', x: 38, y: 48 },

    { id: 't09', name: 'Table 09', zone: 'Window', seats: 2, shape: 'round', status: 'free', x: 58, y: 18 },
    { id: 't14', name: 'Table 14', zone: 'Window', seats: 6, shape: 'rect', status: 'free', x: 72, y: 40 },
    { id: 't18', name: 'Table 18', zone: 'Window', seats: 4, shape: 'square', status: 'free', x: 58, y: 48 },

    { id: 'p02', name: 'Patio 02', zone: 'Patio', seats: 4, shape: 'square', status: 'free', x: 22, y: 78 },
    { id: 'p03', name: 'Patio 03', zone: 'Patio', seats: 2, shape: 'round', status: 'free', x: 40, y: 78 },
    { id: 'p04', name: 'Patio 04', zone: 'Patio', seats: 6, shape: 'rect', status: 'free', x: 60, y: 78 },

    { id: 'b01', name: 'Bar 01', zone: 'Bar', seats: 1, shape: 'bar', status: 'free', x: 84, y: 16 },
    { id: 'b02', name: 'Bar 02', zone: 'Bar', seats: 1, shape: 'bar', status: 'free', x: 92, y: 16 },
  ];
}

export function seatTable(
  tables: SeatTable[],
  id: string,
  partySize: number,
  server: string,
): SeatTable[] {
  return tables.map((t) =>
    t.id === id
      ? { ...t, status: 'seated' as const, partySize, server, ticketNumber: undefined }
      : t,
  );
}

export function clearTable(tables: SeatTable[], id: string): SeatTable[] {
  return tables.map((t) =>
    t.id === id
      ? { ...t, status: 'free' as const, partySize: undefined, ticketNumber: undefined, server: undefined }
      : t,
  );
}

export function markDirty(tables: SeatTable[], id: string): SeatTable[] {
  return tables.map((t) =>
    t.id === id
      ? { ...t, status: 'dirty' as const, partySize: undefined, ticketNumber: undefined, server: undefined }
      : t,
  );
}

export function linkTicket(tables: SeatTable[], name: string, ticketNumber: string): SeatTable[] {
  return tables.map((t) =>
    t.name === name ? { ...t, status: 'ordered' as const, ticketNumber } : t,
  );
}

export function markBill(tables: SeatTable[], name: string): SeatTable[] {
  return tables.map((t) => (t.name === name ? { ...t, status: 'bill' as const } : t));
}

export function countsByStatus(tables: SeatTable[]) {
  return tables.reduce(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    { free: 0, seated: 0, ordered: 0, bill: 0, dirty: 0 } as Record<SeatStatus, number>,
  );
}

/** Merge absorb table into keep table on the map (absorb becomes free). */
export function mergeSeatTables(
  tables: SeatTable[],
  keepId: string,
  absorbId: string,
): SeatTable[] {
  if (keepId === absorbId) return tables;
  const keep = tables.find((t) => t.id === keepId);
  const absorb = tables.find((t) => t.id === absorbId);
  if (!keep || !absorb) return tables;
  const party = (keep.partySize ?? 0) + (absorb.partySize ?? 0);
  return tables.map((t) => {
    if (t.id === keepId) {
      return {
        ...t,
        partySize: party || t.partySize,
        status: t.status === 'free' ? ('seated' as const) : t.status,
        ticketNumber: t.ticketNumber ?? absorb.ticketNumber,
        server: t.server ?? absorb.server,
      };
    }
    if (t.id === absorbId) {
      return {
        ...t,
        status: 'free' as const,
        partySize: undefined,
        ticketNumber: undefined,
        server: undefined,
      };
    }
    return t;
  });
}
