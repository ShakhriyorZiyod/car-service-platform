import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditLog } from '../../src/db/schema';
import { createTestServices } from '../helpers/services';
import { useTestDatabase } from '../helpers/db';

const database = useTestDatabase();

describe('the audit log is append-only (PLAN 7.3, 15)', () => {
  async function oneEntry() {
    const { services } = createTestServices(database.db);
    await services.audit.record(database.db, {
      actorId: null,
      action: 'test.action',
      entity: 'test',
      after: { value: 1 },
    });
    const [entry] = await database.db.select().from(auditLog);
    if (!entry) throw new Error('nothing was recorded');
    return entry;
  }

  it('an entry cannot be changed', async () => {
    const entry = await oneEntry();
    await expect(
      database.db.update(auditLog).set({ action: 'forged' }).where(eq(auditLog.id, entry.id)),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('an entry cannot be removed, even with raw SQL', async () => {
    const entry = await oneEntry();
    await expect(
      database.db.execute(sql`delete from audit_log where id = ${entry.id}`),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await database.db.select().from(auditLog)).toHaveLength(1);
  });
});
