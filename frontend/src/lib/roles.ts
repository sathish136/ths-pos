/** Staff roles for the restaurant POS demo. */

export type RoleId =
  | 'captain'
  | 'cashier'
  | 'cashier2'
  | 'supervisor'
  | 'callcenter'
  | 'kitchen'
  | 'delivery'
  | 'manager';

export function isRoleId(value: string | null | undefined): value is RoleId {
  return (
    value === 'captain' ||
    value === 'cashier' ||
    value === 'cashier2' ||
    value === 'supervisor' ||
    value === 'callcenter' ||
    value === 'kitchen' ||
    value === 'delivery' ||
    value === 'manager'
  );
}

export type Role = {
  id: RoleId;
  label: string;
  title: string;
  pin: string;
  initials: string;
  blurb: string;
};

export const ROLES: Role[] = [
  {
    id: 'captain',
    label: 'Captain',
    title: 'Floor captain',
    pin: '1111',
    initials: 'CA',
    blurb: 'Take orders · seating · send to kitchen · serve guests',
  },
  {
    id: 'cashier',
    label: 'Cashier',
    title: 'Cashier',
    pin: '2222',
    initials: 'CH',
    blurb: 'Collect payments · print guest receipt',
  },
  {
    id: 'cashier2',
    label: 'Cashier 2',
    title: 'Second cashier',
    pin: '2223',
    initials: 'C2',
    blurb: 'Collect payments · same rights as Cashier 1',
  },
  {
    id: 'supervisor',
    label: 'Cash Supervisor',
    title: 'Cash supervisor',
    pin: '6666',
    initials: 'CS',
    blurb: 'Approve discounts & voids · tax invoice · shift close · reports',
  },
  {
    id: 'callcenter',
    label: 'Call Center',
    title: 'Call center',
    pin: '7777',
    initials: 'CC',
    blurb: 'Takeaway, delivery & online orders · send to kitchen',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    title: 'Kitchen station',
    pin: '4444',
    initials: 'KT',
    blurb: 'See orders · prep · mark ready · print chit',
  },
  {
    id: 'delivery',
    label: 'Delivery',
    title: 'Delivery rider',
    pin: '5555',
    initials: 'DL',
    blurb: 'Deliver food · collect payment at customer',
  },
  {
    id: 'manager',
    label: 'Manager',
    title: 'Manager',
    pin: '3333',
    initials: 'MG',
    blurb: 'Full access · every role + shift, reports, stock, settings',
  },
];

export type Permission =
  | 'order.take'
  | 'order.send_kitchen'
  | 'order.kitchen_progress'
  | 'order.serve'
  | 'order.pay'
  | 'order.void'
  | 'order.discount'
  | 'invoice.tax'
  | 'orders.view'
  | 'kitchen.view'
  | 'kitchen.print'
  | 'stock.view'
  | 'stock.adjust'
  | 'recipes.view'
  | 'recipes.edit'
  | 'reports.view'
  | 'reports.export'
  | 'seating.manage'
  | 'branch.switch'
  | 'shift.manage'
  | 'accounting.view'
  | 'features.view'
  | 'settings.edit'
  | 'delivery.run';

/**
 * Demo role map (client pitch):
 * Captain → floor · Cashier → counter pay · Kitchen → KDS · Delivery → COD at door · Manager → admin
 */
const PERMS: Record<RoleId, Permission[]> = {
  captain: [
    'order.take',
    'order.send_kitchen',
    'order.serve',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'seating.manage',
  ],
  cashier: [
    'order.pay',
    'invoice.tax',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'seating.manage',
  ],
  cashier2: [
    'order.pay',
    'invoice.tax',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'seating.manage',
  ],
  // Cash supervisor: approves discounts and voids, issues tax invoices, closes shift, sees reports
  supervisor: [
    'order.pay',
    'order.discount',
    'order.void',
    'invoice.tax',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'seating.manage',
    'reports.view',
    'reports.export',
    'shift.manage',
    'accounting.view',
  ],
  // Call center: takeaway / delivery / online intake, sends to kitchen
  callcenter: [
    'order.take',
    'order.send_kitchen',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'delivery.run',
  ],
  kitchen: [
    'order.kitchen_progress',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
  ],
  // Rider: see ready deliveries + collect payment at customer
  delivery: [
    'delivery.run',
    'order.pay',
    'orders.view',
    'kitchen.view',
  ],
  // Listed for clarity — can() also grants Manager every permission.
  manager: [
    'order.take',
    'order.send_kitchen',
    'order.kitchen_progress',
    'order.serve',
    'order.pay',
    'order.void',
    'orders.view',
    'kitchen.view',
    'kitchen.print',
    'stock.view',
    'stock.adjust',
    'recipes.view',
    'recipes.edit',
    'reports.view',
    'reports.export',
    'seating.manage',
    'branch.switch',
    'shift.manage',
    'accounting.view',
    'features.view',
    'settings.edit',
    'delivery.run',
  ],
};

/** Manager-edited permissions per role (Admin → Staff & permissions). Empty = built-in defaults. */
let permissionOverrides: Partial<Record<RoleId, Permission[]>> = {};

export function setPermissionOverrides(next: Partial<Record<RoleId, Permission[]>> | undefined) {
  permissionOverrides = next ?? {};
}

export function defaultPermissions(role: RoleId): Permission[] {
  return [...PERMS[role]];
}

/** Effective permissions for a role (override if the manager changed them). */
export function rolePermissions(role: RoleId): Permission[] {
  return permissionOverrides[role] ?? PERMS[role];
}

export const ALL_PERMISSIONS: Permission[] = [
  'order.take', 'order.send_kitchen', 'order.kitchen_progress', 'order.serve', 'order.pay', 'order.void',
  'order.discount', 'invoice.tax', 'orders.view', 'kitchen.view', 'kitchen.print', 'stock.view', 'stock.adjust',
  'recipes.view', 'recipes.edit', 'reports.view', 'reports.export', 'seating.manage', 'branch.switch',
  'shift.manage', 'accounting.view', 'features.view', 'settings.edit', 'delivery.run',
];

export const PERMISSION_LABEL: Record<Permission, string> = {
  'order.take': 'Take orders',
  'order.send_kitchen': 'Send to kitchen',
  'order.kitchen_progress': 'Kitchen prep / ready',
  'order.serve': 'Serve to table',
  'order.pay': 'Take payment',
  'order.void': 'Void / cancel sent items',
  'order.discount': 'Apply discounts',
  'invoice.tax': 'Create tax invoice',
  'orders.view': 'See orders',
  'kitchen.view': 'See kitchen board',
  'kitchen.print': 'Print kitchen chit',
  'stock.view': 'View stock',
  'stock.adjust': 'Adjust stock',
  'recipes.view': 'View recipes',
  'recipes.edit': 'Edit recipes',
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'seating.manage': 'Manage seating / tables',
  'branch.switch': 'Switch branch',
  'shift.manage': 'Open / close shift',
  'accounting.view': 'Accounting',
  'features.view': 'Features list',
  'settings.edit': 'Settings & admin',
  'delivery.run': 'Delivery run & collect',
};

export function can(role: RoleId, permission: Permission): boolean {
  // Manager can do everything (all roles combined).
  if (role === 'manager') return true;
  return rolePermissions(role).includes(permission);
}

export function roleById(id: RoleId): Role {
  return ROLES.find((r) => r.id === id)!;
}

export function defaultViewForRole(id: RoleId): string {
  if (id === 'kitchen') return 'kitchen';
  if (id === 'captain') return 'seating';
  if (id === 'cashier' || id === 'cashier2') return 'floor';
  if (id === 'supervisor') return 'reports';
  if (id === 'callcenter') return 'orders';
  if (id === 'delivery') return 'orders';
  if (id === 'manager') return 'shifts';
  return 'floor';
}
