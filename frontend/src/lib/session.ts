/** Persist demo session so shift / orders survive refresh & role switch.
 *  Also sync shared floor/kitchen state across Captain / Cashier / Kitchen tabs & devices.
 */

const KEY = 'ury-pos-demo-session-v3';
const CHANNEL = 'ury-pos-demo-session-v3';
const LEGACY_KEYS = [
  'ury-pos-demo-session-v2',
  'ury-pos-demo-session-v1',
] as const;

export type SessionBlob = {
  /** Monotonic write clock for multi-device last-write-wins */
  rev?: number;
  /** Tab / device id that wrote this blob */
  origin?: string;
  /** Highest ticket number issued (shared allocator floor) */
  ticketSeq?: number;
  ticketBook?: unknown;
  dayOrders?: unknown;
  ticket?: unknown;
  /** Dedicated expo board — survives New ticket / Delivery without wiping table orders */
  kitchenBoard?: unknown;
  sales?: unknown;
  moves?: unknown;
  tables?: unknown;
  stock?: unknown;
  stockByStore?: unknown;
  activeStoreId?: string;
  recipes?: unknown;
  shift?: unknown;
  shiftHistory?: unknown;
  branchId?: string;
  settings?: unknown;
  features?: unknown;
  /** Admin extras: kitchen sections, combos, notification rules, PINs, presence */
  extras?: unknown;
};

/** Fields that must match on every station (not the local open ticket draft). */
export const SHARED_SESSION_KEYS = [
  'ticketBook',
  'dayOrders',
  'kitchenBoard',
  'sales',
  'moves',
  'tables',
  'stock',
  'stockByStore',
  'activeStoreId',
  'recipes',
  'shift',
  'shiftHistory',
  'branchId',
  'settings',
  'features',
  'extras',
] as const satisfies ReadonlyArray<keyof SessionBlob>;

export type SharedSessionKey = (typeof SHARED_SESSION_KEYS)[number];

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(store: Storage, key: string): SessionBlob | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SessionBlob;
  } catch {
    return null;
  }
}

export function loadSession(): SessionBlob | null {
  const ls = storage();
  if (!ls) return null;

  const current = readRaw(ls, KEY);
  if (current) return current;

  // Migrate older sessionStorage / localStorage keys once.
  for (const legacy of LEGACY_KEYS) {
    const fromLs = readRaw(ls, legacy);
    if (fromLs) {
      saveSession(fromLs);
      try {
        ls.removeItem(legacy);
      } catch {
        /* ignore */
      }
      return fromLs;
    }
    try {
      const fromSs = readRaw(window.sessionStorage, legacy);
      if (fromSs) {
        saveSession(fromSs);
        window.sessionStorage.removeItem(legacy);
        return fromSs;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function saveSession(blob: SessionBlob) {
  try {
    storage()?.setItem(KEY, JSON.stringify(blob));
  } catch {
    /* ignore quota */
  }
}

/** Merge-patch so one field update cannot wipe another (e.g. shift). */
export function patchSession(partial: SessionBlob) {
  const prev = loadSession() ?? {};
  saveSession({ ...prev, ...partial });
}

export function clearSession() {
  try {
    const ls = storage();
    ls?.removeItem(KEY);
    for (const legacy of LEGACY_KEYS) {
      ls?.removeItem(legacy);
      window.sessionStorage?.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
}

/** Per-device staff role — stays on reload; not synced across Captain/Kitchen tablets. */
const ROLE_KEY = 'ury-pos-demo-role-v1';
const VIEW_KEY = 'ury-pos-demo-view-v1';

export function loadStaffRole(): string | null {
  try {
    return storage()?.getItem(ROLE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveStaffRole(roleId: string | null) {
  try {
    const ls = storage();
    if (!ls) return;
    if (roleId) ls.setItem(ROLE_KEY, roleId);
    else ls.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStaffView(): string | null {
  try {
    return storage()?.getItem(VIEW_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveStaffView(view: string | null) {
  try {
    const ls = storage();
    if (!ls) return;
    if (view) ls.setItem(VIEW_KEY, view);
    else ls.removeItem(VIEW_KEY);
  } catch {
    /* ignore */
  }
}

export function sessionStorageKey() {
  return KEY;
}

/** ERP Frappe endpoints (shared session across Captain / Cashier / Kitchen). */
export function demoSessionApiUrl(): string {
  return '/api/method/ths_pos.api.session.get_session';
}

export function demoTicketSeqApiUrl(): string {
  return '/api/method/ths_pos.api.session.reserve_ticket';
}

function csrfToken(): string {
  try {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

/** Atomically reserve the next ticket # across all tablets. */
export async function reserveTicketNumber(floor = 0): Promise<number> {
  try {
    const res = await fetch(demoTicketSeqApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken(),
      },
      credentials: 'include',
      body: JSON.stringify({ floor }),
    });
    if (!res.ok) throw new Error('seq failed');
    const data = (await res.json()) as { message?: { number?: number }; number?: number };
    const n = Number(data.message?.number ?? data.number);
    if (!Number.isFinite(n) || n <= 0) throw new Error('bad seq');
    return n;
  } catch {
    // Offline fallback — local only (may still collide if two tablets are offline).
    return Math.max(floor, 0) + 1;
  }
}

let broadcast: BroadcastChannel | null = null;

function getBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!broadcast) {
    try {
      broadcast = new BroadcastChannel(CHANNEL);
    } catch {
      return null;
    }
  }
  return broadcast;
}

/** Instant sync for multiple windows on the same browser (screen extension). */
export function publishSessionPeers(blob: SessionBlob) {
  try {
    getBroadcast()?.postMessage(blob);
  } catch {
    /* ignore */
  }
}

export function subscribeSessionPeers(onRemote: (blob: SessionBlob) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      onRemote(JSON.parse(e.newValue) as SessionBlob);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);

  const bc = getBroadcast();
  const onMessage = (ev: MessageEvent) => {
    if (ev.data && typeof ev.data === 'object') onRemote(ev.data as SessionBlob);
  };
  bc?.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.removeEventListener('message', onMessage);
  };
}

export async function pullSharedSession(): Promise<SessionBlob | null> {
  try {
    const res = await fetch(demoSessionApiUrl(), {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.message ?? data) as SessionBlob;
  } catch {
    return null;
  }
}

export async function pushSharedSession(blob: SessionBlob): Promise<SessionBlob | null> {
  try {
    const res = await fetch('/api/method/ths_pos.api.session.save_session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken(),
      },
      credentials: 'include',
      body: JSON.stringify({ blob }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.message ?? data) as SessionBlob;
  } catch {
    return null;
  }
}

export function nextSessionRev(prev?: number | null): number {
  const now = Date.now();
  return Math.max(now, (prev ?? 0) + 1);
}
