import type { Staff } from '@cs/shared';
import { normalizePhone } from '@cs/shared/format';
import { ROLES, type Role } from '@cs/shared/vocabulary';
import { and, asc, eq, exists, isNotNull, ne, or } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { sessions, userRoles, users } from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import { isAcceptablePassword, normalizeLogin } from '../domain/credentials';
import { canUsePanel } from '../domain/roles';
import { credentialProblem, keepsAnOwner, type CredentialProblem } from '../domain/staff';
import { hashPassword } from './passwords';
import { rolesOf, rolesOfMany, violatedUniqueConstraint } from './users';

/** Managing staff: the owner's "Xodimlar va rollar" (docs/PLAN.md, section 8; design A13). */

export interface StaffServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface NewStaff {
  fullName: string;
  phone: string;
  roles: Role[];
  specialization?: string | null | undefined;
  login?: string | null | undefined;
  password?: string | undefined;
}

export interface StaffPatch {
  fullName?: string | undefined;
  phone?: string | undefined;
  roles?: Role[] | undefined;
  specialization?: string | null | undefined;
  login?: string | null | undefined;
  isBlocked?: boolean | undefined;
}

export interface StaffService {
  list(actor: StaffActor): Promise<Staff[]>;
  create(actor: StaffActor, input: NewStaff, ip?: string): Promise<Staff>;
  update(actor: StaffActor, id: string, patch: StaffPatch, ip?: string): Promise<Staff>;
  setPassword(actor: StaffActor, id: string, password: string, ip?: string): Promise<void>;
  /** The first owner, from the command line (`npm run owner:create`); no actor exists yet. */
  bootstrapOwner(input: {
    fullName: string;
    phone: string;
    login: string;
    password: string;
  }): Promise<Staff>;
}

const invalid = (field: string, message: string) =>
  new AppError('validation', message, { paths: [`body.${field}`] });

const PROBLEM_FIELD: Record<CredentialProblem, string> = {
  login_required: 'login',
  login_not_allowed: 'login',
  password_required: 'password',
  password_not_allowed: 'password',
};

const uniqueRoles = (roles: readonly Role[]): Role[] =>
  ROLES.filter((role) => roles.includes(role));

function parsePhone(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw invalid('phone', 'not a phone number');
  return phone;
}

function parseLogin(input: string | null | undefined): string | null {
  if (!input) return null;
  const login = normalizeLogin(input);
  if (!login) throw invalid('login', 'not a valid login');
  return login;
}

function checkPassword(password: string): void {
  if (!isAcceptablePassword(password)) throw invalid('password', 'the password is too short');
}

/** A taken login or phone ends a write as a unique violation; this names it for the client. */
function rethrowConflict(error: unknown): never {
  const constraint = violatedUniqueConstraint(error);
  if (constraint === 'users_login_unique') throw new AppError('login_taken');
  if (constraint === 'users_phone_unique') throw new AppError('phone_taken');
  throw error;
}

export function createStaffService(deps: StaffServiceDeps): StaffService {
  const { db, audit } = deps;

  async function viewOf(db: DbOrTx, id: string): Promise<Staff> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new AppError('not_found');
    return toStaff(user, await rolesOf(db, id));
  }

  function toStaff(user: typeof users.$inferSelect, roles: readonly Role[]): Staff {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone ?? '',
      roles: uniqueRoles(roles),
      specialization: user.specialization,
      login: user.login,
      isBlocked: user.isBlocked,
      telegramLinked: user.telegramId !== null,
      lastSeen: user.lastSeenAt ? presentInstant(user.lastSeenAt) : null,
    };
  }

  /** Every owner after a change: refuses one that would leave nobody able to manage the workshop. */
  async function assertKeepsAnOwner(
    tx: Tx,
    changed: { id: string; roles: readonly Role[]; isBlocked: boolean },
  ): Promise<void> {
    const others = await tx
      .select({ id: users.id, isBlocked: users.isBlocked })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'owner')))
      .where(ne(users.id, changed.id))
      .for('update', { of: users });
    const owners = [
      ...others.map((owner) => ({ roles: ['owner'] as Role[], isBlocked: owner.isBlocked })),
      { roles: changed.roles, isBlocked: changed.isBlocked },
    ];
    if (!keepsAnOwner(owners)) throw new AppError('last_owner');
  }

  async function replaceRoles(
    tx: Tx,
    userId: string,
    roles: readonly Role[],
    grantedBy: string | null,
  ) {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roles.length > 0) {
      await tx.insert(userRoles).values(roles.map((role) => ({ userId, role, grantedBy })));
    }
  }

  const revokeSessions = (tx: DbOrTx, userId: string) =>
    tx.delete(sessions).where(eq(sessions.userId, userId));

  /** What the audit log keeps of a staff member: never the password hash. */
  const auditView = (staff: Staff) => ({
    fullName: staff.fullName,
    phone: staff.phone,
    roles: staff.roles,
    specialization: staff.specialization,
    login: staff.login,
    isBlocked: staff.isBlocked,
  });

  async function create(actorId: string | null, input: NewStaff, ip?: string): Promise<Staff> {
    const phone = parsePhone(input.phone);
    const roles = uniqueRoles(input.roles);
    const login = parseLogin(input.login);
    const problem = credentialProblem({
      roles,
      login,
      passwordGiven: input.password !== undefined,
    });
    if (problem) throw invalid(PROBLEM_FIELD[problem], problem);
    if (input.password !== undefined) checkPassword(input.password);
    const passwordHash = input.password !== undefined ? await hashPassword(input.password) : null;

    try {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(users)
          .where(eq(users.phone, phone))
          .for('update');
        let userId: string;
        if (existing) {
          // Someone already uses the Mini App with this number: they become staff, one row stays.
          if (existing.login || (await rolesOf(tx, existing.id)).length > 0) {
            throw new AppError('phone_taken');
          }
          await tx
            .update(users)
            .set({
              fullName: input.fullName,
              specialization: input.specialization ?? null,
              login,
              passwordHash,
              isBlocked: false,
            })
            .where(eq(users.id, existing.id));
          userId = existing.id;
        } else {
          const [inserted] = await tx
            .insert(users)
            .values({
              fullName: input.fullName,
              phone,
              specialization: input.specialization ?? null,
              login,
              passwordHash,
              createdBy: actorId,
            })
            .returning({ id: users.id });
          if (!inserted) throw new Error('insert returned no row');
          userId = inserted.id;
        }
        await replaceRoles(tx, userId, roles, actorId);

        const staff = await viewOf(tx, userId);
        await audit.record(tx, {
          actorId,
          action: 'staff.create',
          entity: 'user',
          entityId: userId,
          after: auditView(staff),
          ip: ip ?? null,
        });
        return staff;
      });
    } catch (error) {
      rethrowConflict(error);
    }
  }

  return {
    async list(actor) {
      requirePermission(actor, 'staff.manage');
      // Staff are those who hold a role or a panel login, blocked or not.
      const rows = await db
        .select()
        .from(users)
        .where(
          or(
            isNotNull(users.login),
            exists(db.select().from(userRoles).where(eq(userRoles.userId, users.id))),
          ),
        )
        .orderBy(asc(users.fullName), asc(users.id));
      const roles = await rolesOfMany(
        db,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toStaff(row, roles.get(row.id) ?? []));
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'staff.manage');
      return create(actor.userId, input, ip);
    },

    async update(actor, id, patch, ip) {
      requirePermission(actor, 'staff.manage');
      if (patch.isBlocked === true && id === actor.userId) {
        throw new AppError('forbidden', 'nobody blocks themselves');
      }
      if (patch.login) parseLogin(patch.login);

      try {
        return await db.transaction(async (tx) => {
          const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
          const currentRoles = user ? await rolesOf(tx, user.id) : [];
          if (!user || (!user.login && currentRoles.length === 0)) throw new AppError('not_found');
          const before = toStaff(user, currentRoles);

          const roles = patch.roles ? uniqueRoles(patch.roles) : currentRoles;
          const login = patch.login === undefined ? user.login : parseLogin(patch.login);
          const isBlocked = patch.isBlocked ?? user.isBlocked;
          const problem = credentialProblem({ roles, login });
          if (problem) throw invalid(PROBLEM_FIELD[problem], problem);

          let phone = user.phone;
          if (patch.phone !== undefined && parsePhone(patch.phone) !== user.phone) {
            // Telegram verified the number the account is linked to; only the person changes it.
            if (user.telegramId !== null)
              throw invalid('phone', 'the number is linked to Telegram');
            phone = parsePhone(patch.phone);
          }

          const losesOwner =
            currentRoles.includes('owner') && (!roles.includes('owner') || isBlocked);
          if (losesOwner) await assertKeepsAnOwner(tx, { id, roles, isBlocked });

          await tx
            .update(users)
            .set({
              fullName: patch.fullName ?? user.fullName,
              phone,
              specialization:
                patch.specialization === undefined ? user.specialization : patch.specialization,
              login,
              isBlocked,
            })
            .where(eq(users.id, id));
          if (patch.roles) await replaceRoles(tx, id, roles, actor.userId);

          // Whoever can no longer use the panel loses their open sessions at once.
          const panelBefore = !user.isBlocked && canUsePanel(currentRoles);
          const panelAfter = !isBlocked && canUsePanel(roles);
          if (panelBefore && !panelAfter) await revokeSessions(tx, id);

          const after = await viewOf(tx, id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'staff.update',
            entity: 'user',
            entityId: id,
            before: auditView(before),
            after: auditView(after),
            ip: ip ?? null,
          });
          return after;
        });
      } catch (error) {
        rethrowConflict(error);
      }
    },

    async setPassword(actor, id, password, ip) {
      requirePermission(actor, 'staff.manage');
      checkPassword(password);
      const passwordHash = await hashPassword(password);
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
        if (!user) throw new AppError('not_found');
        if (!user.login) throw invalid('password', 'set a login first');
        await tx.update(users).set({ passwordHash }).where(eq(users.id, id));
        // Whoever knew the old password is signed out.
        await revokeSessions(tx, id);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'staff.password_set',
          entity: 'user',
          entityId: id,
          ip: ip ?? null,
        });
      });
    },

    async bootstrapOwner(input) {
      const phone = parsePhone(input.phone);
      const login = parseLogin(input.login);
      checkPassword(input.password);
      const passwordHash = await hashPassword(input.password);
      try {
        return await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(users)
            .where(eq(users.phone, phone))
            .for('update');
          let userId: string;
          if (existing) {
            await tx
              .update(users)
              .set({ fullName: input.fullName, login, passwordHash, isBlocked: false })
              .where(eq(users.id, existing.id));
            userId = existing.id;
          } else {
            const [inserted] = await tx
              .insert(users)
              .values({ fullName: input.fullName, phone, login, passwordHash })
              .returning({ id: users.id });
            if (!inserted) throw new Error('insert returned no row');
            userId = inserted.id;
          }
          await tx
            .insert(userRoles)
            .values({ userId, role: 'owner', grantedBy: null })
            .onConflictDoNothing();
          const staff = await viewOf(tx, userId);
          await audit.record(tx, {
            actorId: null,
            action: 'owner.bootstrap',
            entity: 'user',
            entityId: userId,
            after: auditView(staff),
          });
          return staff;
        });
      } catch (error) {
        rethrowConflict(error);
      }
    },
  };
}
