-- btree_gist lets one EXCLUDE constraint compare box ids with = and time ranges with &&
-- (bookings_no_overlap, docs/PLAN.md section 7.7). It is a trusted extension: the database owner
-- creates it without superuser rights.
CREATE EXTENSION IF NOT EXISTS btree_gist;
