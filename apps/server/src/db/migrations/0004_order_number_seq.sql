-- The number people read out for an order ("№1042"): one sequence, starting at 1001.
-- It comes before the orders table, whose `number` column takes its default from it.
CREATE SEQUENCE "public"."order_number_seq" START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;
