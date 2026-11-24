/** Multi-branch / outlet switcher for POS demo. */

export type Branch = {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
};

export const BRANCHES: Branch[] = [
  {
    id: 'main',
    name: 'URY Main Street',
    code: 'MAIN',
    city: 'Downtown',
    address: '12 Main Street',
  },
  {
    id: 'harbor',
    name: 'URY Harbor',
    code: 'HBR',
    city: 'Waterfront',
    address: '4 Pier Lane',
  },
  {
    id: 'airport',
    name: 'URY Airport',
    code: 'APT',
    city: 'Terminal B',
    address: 'Gate plaza · T2',
  },
];

export function branchById(id: string): Branch {
  return BRANCHES.find((b) => b.id === id) ?? BRANCHES[0];
}
