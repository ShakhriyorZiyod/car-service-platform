import { PERMISSIONS, type Permission, type Role } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import {
  canUsePanel,
  effectiveRoles,
  needsSecondFactor,
  permissionsOf,
  shellOf,
} from '../../../src/modules/identity/domain/roles';

describe('shellOf: which part of the Mini App opens (PLAN 4.7)', () => {
  it.each<[Role[], string]>([
    [[], 'client'],
    [['master'], 'master'],
    [['admin'], 'staff'],
    [['director'], 'staff'],
    [['owner'], 'staff'],
    // A master who also has a panel role still works from the Mini App.
    [['master', 'admin'], 'master'],
    [['admin', 'owner'], 'staff'],
  ])('%j → %s', (roles, shell) => {
    expect(shellOf(roles)).toBe(shell);
  });

  it('blocked staff are clients: their roles stop counting', () => {
    expect(effectiveRoles(['master', 'owner'], true)).toEqual([]);
    expect(shellOf(effectiveRoles(['master'], true))).toBe('client');
  });

  it('effective roles are ordered and without repeats', () => {
    expect(effectiveRoles(['owner', 'admin', 'owner'], false)).toEqual(['admin', 'owner']);
  });
});

/** The matrix of PLAN section 8, written out so a change to it is a visible change here. */
const EXPECTED: Record<Role, readonly Permission[]> = {
  master: [],
  admin: [
    'panel.access',
    'today.read',
    'orders.read',
    'orders.write',
    'schedule.read',
    'schedule.write',
    'reception.write',
    'tasks.review',
    'checkout.write',
    'clients.read',
    'clients.write',
    'stock.read',
    'stock.write',
  ],
  director: [
    'panel.access',
    'today.read',
    'orders.read',
    'schedule.read',
    'clients.read',
    'stock.read',
    'costs.read',
  ],
  owner: PERMISSIONS,
};

describe('permissionsOf: the roles × permissions matrix (PLAN 8)', () => {
  const cases = Object.entries(EXPECTED).flatMap(([role, allowed]) =>
    PERMISSIONS.map(
      (permission) => [role as Role, permission, allowed.includes(permission)] as const,
    ),
  );

  it.each(cases)('%s may %s: %s', (role, permission, allowed) => {
    expect(permissionsOf([role]).includes(permission)).toBe(allowed);
  });

  it('only the owner manages staff, settings, the audit log and the exceptions', () => {
    const ownerOnly: Permission[] = [
      'staff.manage',
      'settings.write',
      'audit.read',
      'discount.unlimited',
      'orders.cancel_in_work',
      'payments.correct',
      'clients.anonymize',
      'products.write',
    ];
    for (const role of ['master', 'admin', 'director'] as const) {
      for (const permission of ownerOnly) expect(permissionsOf([role])).not.toContain(permission);
    }
  });

  it('the director only reads', () => {
    expect(
      permissionsOf(['director']).filter((p) => !p.endsWith('.read') && p !== 'panel.access'),
    ).toEqual([]);
  });

  it('only the director and the owner see purchase prices (TZ 2)', () => {
    expect(permissionsOf(['admin'])).not.toContain('costs.read');
    expect(permissionsOf(['director'])).toContain('costs.read');
  });

  it('several roles add up', () => {
    expect(permissionsOf(['director', 'admin'])).toEqual([
      ...permissionsOf(['admin']),
      'costs.read',
    ]);
    expect(permissionsOf(['master', 'director'])).toEqual(permissionsOf(['director']));
  });
});

describe('who signs in to the panel, and with a second step', () => {
  it.each<[Role[], boolean, boolean]>([
    [[], false, false],
    [['master'], false, false],
    [['admin'], true, false],
    [['director'], true, true],
    [['owner'], true, true],
    [['admin', 'owner'], true, true],
  ])('%j: panel %s, second step %s', (roles, panel, secondStep) => {
    expect(canUsePanel(roles)).toBe(panel);
    expect(needsSecondFactor(roles)).toBe(secondStep);
  });
});
