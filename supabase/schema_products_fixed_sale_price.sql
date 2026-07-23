-- IMPORTANTE: nome de coluna entre aspas duplas para preservar o
-- camelCase exatamente como o app envia (sem aspas o Postgres salva
-- tudo em minúsculo e o Supabase passa a "ignorar" essa coluna de novo).
alter table if exists products
  add column if not exists "fixedSalePrice" numeric;
