-- The system's reason for cancelling a gathered shop order nobody came for (docs/PLAN.md, 9.5).
-- seed:reference writes the reasons only into an empty table, so a workshop that already has them
-- gets this one here. A fresh database gets it from seed:reference, after this migration has run
-- on the empty table and done nothing.
INSERT INTO "cancel_reasons" ("id", "code", "name_uz", "name_ru", "applies_to", "requires_text", "sort", "is_active")
SELECT gen_random_uuid(), 'not_picked_up', 'Muddatida olib ketilmadi', 'Не забрали в срок', 'system', false,
       (SELECT coalesce(max("sort"), 0) + 1 FROM "cancel_reasons"), true
WHERE EXISTS (SELECT 1 FROM "cancel_reasons")
  AND NOT EXISTS (SELECT 1 FROM "cancel_reasons" WHERE "code" = 'not_picked_up');
