-- Two bookings of one box never overlap while both hold it (docs/PLAN.md, section 7.7).
-- The database guarantees this, not the code: it is what makes double booking impossible.
-- `[)` makes back-to-back stretches (10:00–12:00 and 12:00–13:00) fine.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("box_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("released_at" IS NULL);
