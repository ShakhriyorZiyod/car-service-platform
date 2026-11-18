import type { AdminRoutes, AuthContext, AuthRoutes, TmaRoutes } from '../../../http/contexts';
import type { StaffActor } from '../../../platform/actors';
import { AppError } from '../../../platform/errors';
import type { ClientsWriter } from '../app/clients';
import type { StaffService } from '../app/staff';
import type { StaffAuthService } from '../app/staff-auth';
import type { TmaService } from '../app/tma';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const tmaRoutes = (tma: TmaService, clients: ClientsWriter): TmaRoutes => ({
  'tma.requestDeletion': async (_input, { actor }) => {
    await clients.requestDeletion(actor);
    return { ok: true };
  },
  'tma.bootstrap': (_input, { actor }) => tma.bootstrap(actor),
  'tma.saveOnboarding': ({ body }, { actor }) =>
    tma.saveOnboarding(actor, { lang: body.lang, fullName: body.fullName }),
  'tma.updateMe': ({ body }, { actor }) => tma.updateProfile(actor, body),
  'tma.sharePhone': ({ body }, { actor }) => tma.sharePhone(actor, body.contact),
});

async function sessionActor(auth: StaffAuthService, context: AuthContext): Promise<StaffActor> {
  const actor = context.sessionToken ? await auth.authenticate(context.sessionToken) : null;
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

export const authRoutes = (auth: StaffAuthService): AuthRoutes => ({
  'auth.login': async ({ body }, context) => {
    const result = await auth.signIn({
      identifier: body.login,
      password: body.password,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    if (result.kind === 'code_sent') {
      const { challengeId, expiresInSec, resendAfterSec } = result;
      return { status: 'code_sent', challengeId, expiresInSec, resendAfterSec };
    }
    context.startSession(result.token);
    return { status: 'signed_in', me: result.me };
  },

  'auth.verifyCode': async ({ body }, context) => {
    const { token, me } = await auth.verifyCode({
      challengeId: body.challengeId,
      code: body.code,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    context.startSession(token);
    return { me };
  },

  'auth.logout': async (_input, context) => {
    if (context.sessionToken) await auth.signOut(context.sessionToken);
    context.endSession();
    return { ok: true };
  },

  'auth.me': async (_input, context) => auth.me(await sessionActor(auth, context)),

  'auth.updateMe': async ({ body }, context) =>
    auth.setLang(await sessionActor(auth, context), body.lang),
});

export const staffAdminRoutes = (
  staff: StaffService,
): Pick<
  AdminRoutes,
  'admin.staffList' | 'admin.createStaff' | 'admin.updateStaff' | 'admin.setStaffPassword'
> => ({
  'admin.staffList': async (_input, { actor }) => ({ items: await staff.list(actor) }),
  'admin.createStaff': ({ body }, { actor, ip }) => staff.create(actor, body, ip),
  'admin.updateStaff': ({ params, body }, { actor, ip }) =>
    staff.update(actor, params.id, body, ip),
  'admin.setStaffPassword': async ({ params, body }, { actor, ip }) => {
    await staff.setPassword(actor, params.id, body.password, ip);
    return { ok: true };
  },
});
