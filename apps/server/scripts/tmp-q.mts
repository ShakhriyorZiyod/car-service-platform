import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { createLogger } from '../src/logger';
const url = process.env.DATABASE_URL!;
if (!url.endsWith('_test')) throw new Error('only the test database');
const database = createDatabase(url, { logger: createLogger({ level: 'warn', pretty: true }) });
const rows = await database.db.execute(sql`
  select t.status, t.rework_count,
         (select count(*) from media m where m.task_id = t.id) as photos
  from tasks t join users u on u.id = t.master_id
  where u.full_name = 'Bekzod Aliyev' order by t.created_at desc limit 4`);
console.log(JSON.stringify(rows.rows));
await database.close();
