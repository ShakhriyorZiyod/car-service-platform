-- The number people read out for a warehouse document ("Kirim №59"): one sequence for every kind.
-- It comes before the stock_documents table, whose `number` column takes its default from it.
CREATE SEQUENCE "public"."stock_document_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE;
