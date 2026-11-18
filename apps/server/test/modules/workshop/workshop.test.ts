import type { Settings, WorkDay } from '@cs/shared';
import type { Role } from '@cs/shared/vocabulary';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog } from '../../../src/db/schema';
import { DEFAULT_SETTINGS } from '../../../src/modules/workshop';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const workshop = () => t.services.workshop;

async function actorWith(roles: Role[]) {
  const user = await insertStaff(database.db, roles);
  return staffActorOf(user, roles);
}
const owner = () => actorWith(['owner']);

const auditRows = (action: string) =>
  database.db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(asc(auditLog.id));

const settingsInput = (overrides: Partial<Settings['workshop']> = {}): Settings => ({
  workshop: { ...DEFAULT_SETTINGS.workshop, name: 'Avto Pro', ...overrides },
  rules: { ...DEFAULT_SETTINGS.rules },
});

const weekday = (day: number, overrides: Partial<WorkDay> = {}): WorkDay => ({
  weekday: day,
  open: '09:00',
  close: '20:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  ...overrides,
});

async function serviceType(code: string) {
  return t.services.catalog.services.createType(await owner(), {
    code,
    nameUz: code,
    nameRu: code,
    icon: 'sparkles',
  });
}

describe('only the owner changes the workshop’s settings (PLAN 8)', () => {
  it.each<Role[]>([['admin'], ['director'], ['master']])('%j is refused', async (...roles) => {
    const actor = await actorWith(roles);
    const type = await serviceType('wash');
    const refused = { code: 'forbidden' };

    await expect(workshop().settings.get(actor)).rejects.toMatchObject(refused);
    await expect(workshop().settings.update(actor, settingsInput())).rejects.toMatchObject(refused);
    await expect(workshop().hours.get(actor)).rejects.toMatchObject(refused);
    await expect(workshop().hours.replaceWeek(actor, [weekday(1)])).rejects.toMatchObject(refused);
    await expect(
      workshop().hours.addHoliday(actor, { date: '2026-12-31', name: 'Yangi yil' }),
    ).rejects.toMatchObject(refused);
    await expect(workshop().hours.removeHoliday(actor, '2026-12-31')).rejects.toMatchObject(
      refused,
    );
    await expect(workshop().boxes.list(actor)).rejects.toMatchObject(refused);
    await expect(
      workshop().boxes.create(actor, { name: '1-boks', serviceTypeIds: [type.id] }),
    ).rejects.toMatchObject(refused);
    await expect(workshop().boxes.update(actor, type.id, { name: 'X' })).rejects.toMatchObject(
      refused,
    );
    expect(await auditRows('settings.update')).toHaveLength(0);
  });

  it('every panel role sees the workshop’s name, a master does not', async () => {
    for (const roles of [['admin'], ['director'], ['owner']] as Role[][]) {
      const info = await workshop().settings.panelInfo(await actorWith(roles));
      expect(info.name).toBe('CarService');
    }
    await expect(workshop().settings.panelInfo(await actorWith(['master']))).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('settings (PLAN 7.4)', () => {
  it('before anything is saved, the defaults are in force', async () => {
    expect(await workshop().settings.get(await owner())).toEqual(DEFAULT_SETTINGS);
    expect(await workshop().settings.current()).toEqual(DEFAULT_SETTINGS);
  });

  it('saves, and what is saved is what is in force', async () => {
    const actor = await owner();
    const input = settingsInput({
      address: 'Chilonzor, 5',
      policyUrl: 'https://example.uz/policy',
    });
    input.rules.slotStepMin = 15;
    const saved = await workshop().settings.update(actor, input);
    expect(saved.workshop).toMatchObject({ name: 'Avto Pro', address: 'Chilonzor, 5' });
    expect(saved.rules.slotStepMin).toBe(15);
    expect(await workshop().settings.current()).toEqual(saved);
  });

  it('keeps the phone as +998XXXXXXXXX and the reminders earliest first', async () => {
    const actor = await owner();
    const input = settingsInput({ phone: '90 123 45 67' });
    input.rules.reminderHours = [2, 24, 24];
    const saved = await workshop().settings.update(actor, input);
    expect(saved.workshop.phone).toBe('+998901234567');
    expect(saved.rules.reminderHours).toEqual([24, 2]);
  });

  it('refuses a phone that is not one, and rules that contradict each other', async () => {
    const actor = await owner();
    await expect(
      workshop().settings.update(actor, settingsInput({ phone: 'call me' })),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.workshop.phone'] } });

    const input = settingsInput();
    input.rules.callWarnMin = 40;
    input.rules.callEscalateMin = 30;
    await expect(workshop().settings.update(actor, input)).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.rules.callEscalateMin'] },
    });
    expect(await workshop().settings.current()).toEqual(DEFAULT_SETTINGS);
  });

  it('is audited with what it was and what it became; saving the same again is not', async () => {
    const actor = await owner();
    await workshop().settings.update(actor, settingsInput());
    await workshop().settings.update(actor, settingsInput());

    const rows = await auditRows('settings.update');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: actor.userId, entity: 'settings' });
    expect(rows[0]?.before).toEqual(DEFAULT_SETTINGS);
    expect(rows[0]?.after).toMatchObject({ workshop: { name: 'Avto Pro' } });
  });

  it('everyone is told the name, address, phone, map and policy link, but not the version', async () => {
    await workshop().settings.update(
      await owner(),
      settingsInput({ address: 'Chilonzor, 5', policyUrl: 'https://example.uz/policy' }),
    );
    expect(await workshop().settings.publicInfo()).toEqual({
      name: 'Avto Pro',
      address: 'Chilonzor, 5',
      phone: null,
      mapUrl: null,
      policyUrl: 'https://example.uz/policy',
    });
  });
});

describe('working hours (PLAN 7.4)', () => {
  it('start empty: every day is a day off', async () => {
    expect(await workshop().hours.get(await owner())).toEqual({ days: [], holidays: [] });
  });

  it('save the week, read back as HH:mm, in weekday order', async () => {
    const actor = await owner();
    const saved = await workshop().hours.replaceWeek(actor, [
      weekday(6, { open: '10:00', close: '16:00', breakStart: null, breakEnd: null }),
      weekday(1),
    ]);
    expect(saved.days).toEqual([
      weekday(1),
      weekday(6, { open: '10:00', close: '16:00', breakStart: null, breakEnd: null }),
    ]);
  });

  it('a weekday that is left out becomes a day off', async () => {
    const actor = await owner();
    await workshop().hours.replaceWeek(actor, [weekday(1), weekday(2), weekday(3)]);
    const saved = await workshop().hours.replaceWeek(actor, [weekday(1), weekday(3)]);
    expect(saved.days.map((day) => day.weekday)).toEqual([1, 3]);
  });

  it.each<[string, WorkDay[], string[]]>([
    ['closing before opening', [weekday(1, { close: '08:00' })], ['body.days.0.close']],
    ['a break with no end', [weekday(1, { breakEnd: null })], ['body.days.0.breakStart']],
    ['a break outside the hours', [weekday(1, { breakEnd: '21:00' })], ['body.days.0.breakStart']],
    ['a weekday twice', [weekday(1), weekday(1)], ['body.days.1.weekday']],
  ])('%s is refused, naming the entry, and nothing changes', async (_name, days, paths) => {
    const actor = await owner();
    await workshop().hours.replaceWeek(actor, [weekday(2)]);
    await expect(workshop().hours.replaceWeek(actor, days)).rejects.toMatchObject({
      code: 'validation',
      details: { paths },
    });
    expect((await workshop().hours.get(actor)).days.map((day) => day.weekday)).toEqual([2]);
  });

  it('is audited with the week before and after; saving the same again is not', async () => {
    const actor = await owner();
    await workshop().hours.replaceWeek(actor, [weekday(1)]);
    await workshop().hours.replaceWeek(actor, [weekday(1)]);
    await workshop().hours.replaceWeek(actor, [weekday(1), weekday(2)]);

    const rows = await auditRows('work_hours.update');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ before: [], after: [weekday(1)] });
    expect(rows[1]).toMatchObject({ before: [weekday(1)], after: [weekday(1), weekday(2)] });
  });
});

describe('holidays', () => {
  it('are added, listed by date, renamed on the same date and removed', async () => {
    const actor = await owner();
    await workshop().hours.addHoliday(actor, { date: '2027-01-01', name: 'Yangi yil' });
    await workshop().hours.addHoliday(actor, { date: '2026-12-31', name: 'Arafa' });
    await workshop().hours.addHoliday(actor, { date: '2026-12-31', name: 'Yil oxiri' });

    const { holidays } = await workshop().hours.get(actor);
    expect(holidays).toEqual([
      { date: '2026-12-31', name: 'Yil oxiri' },
      { date: '2027-01-01', name: 'Yangi yil' },
    ]);

    await workshop().hours.removeHoliday(actor, '2026-12-31');
    expect((await workshop().hours.get(actor)).holidays).toEqual([
      { date: '2027-01-01', name: 'Yangi yil' },
    ]);
  });

  it('removing one that is not there is not_found', async () => {
    await expect(workshop().hours.removeHoliday(await owner(), '2026-12-31')).rejects.toMatchObject(
      {
        code: 'not_found',
      },
    );
  });

  it('are audited', async () => {
    const actor = await owner();
    await workshop().hours.addHoliday(actor, { date: '2026-12-31', name: 'Arafa' });
    await workshop().hours.removeHoliday(actor, '2026-12-31');
    expect(await auditRows('holiday.add')).toHaveLength(1);
    expect((await auditRows('holiday.remove'))[0]).toMatchObject({
      entityId: '2026-12-31',
      before: { date: '2026-12-31', name: 'Arafa' },
    });
  });
});

describe('boxes (PLAN 7.4)', () => {
  it('are created in order with the kinds of work they do', async () => {
    const actor = await owner();
    const polish = await serviceType('polish');
    const wash = await serviceType('wash');

    const first = await workshop().boxes.create(actor, {
      name: '1-boks',
      note: 'Ko‘targichli',
      serviceTypeIds: [wash.id, polish.id, wash.id],
    });
    const second = await workshop().boxes.create(actor, { name: '2-boks', serviceTypeIds: [] });

    expect(first).toMatchObject({ name: '1-boks', note: 'Ko‘targichli', isActive: true });
    expect([...first.serviceTypeIds].sort()).toEqual([polish.id, wash.id].sort());
    expect(second.sort).toBeGreaterThan(first.sort);
    expect((await workshop().boxes.list(actor)).map((box) => box.name)).toEqual([
      '1-boks',
      '2-boks',
    ]);
  });

  it('are changed: name, note, kinds of work, in service or not, order', async () => {
    const actor = await owner();
    const polish = await serviceType('polish');
    const wash = await serviceType('wash');
    const box = await workshop().boxes.create(actor, {
      name: '1-boks',
      serviceTypeIds: [polish.id],
    });
    const other = await workshop().boxes.create(actor, { name: '2-boks', serviceTypeIds: [] });

    const updated = await workshop().boxes.update(actor, box.id, {
      name: 'Boks 1',
      note: null,
      serviceTypeIds: [wash.id],
      isActive: false,
      sort: other.sort + 1,
    });
    expect(updated).toMatchObject({
      name: 'Boks 1',
      note: null,
      isActive: false,
      serviceTypeIds: [wash.id],
    });
    expect((await workshop().boxes.list(actor)).map((b) => b.name)).toEqual(['2-boks', 'Boks 1']);
  });

  it('refuse a kind of work that does not exist', async () => {
    const actor = await owner();
    const missing = '019a0000-0000-7000-8000-000000000000';
    await expect(
      workshop().boxes.create(actor, { name: '1-boks', serviceTypeIds: [missing] }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.serviceTypeIds'] } });
    expect(await workshop().boxes.list(actor)).toEqual([]);

    const box = await workshop().boxes.create(actor, { name: '1-boks', serviceTypeIds: [] });
    await expect(
      workshop().boxes.update(actor, box.id, { serviceTypeIds: [missing] }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('a box that does not exist is not_found', async () => {
    await expect(
      workshop().boxes.update(await owner(), '019a0000-0000-7000-8000-000000000000', { name: 'X' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('are audited; an update that changes nothing is not', async () => {
    const actor = await owner();
    const box = await workshop().boxes.create(actor, { name: '1-boks', serviceTypeIds: [] });
    await workshop().boxes.update(actor, box.id, { name: '1-boks' });
    await workshop().boxes.update(actor, box.id, { isActive: false });

    expect(await auditRows('box.create')).toHaveLength(1);
    const updates = await auditRows('box.update');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      before: { isActive: true },
      after: { isActive: false },
    });
  });
});
