-- IMPORTANTE: nomes de coluna entre aspas duplas para preservar o
-- camelCase exatamente como o app envia (sem aspas o Postgres salva
-- tudo em minúsculo e o Supabase passa a "ignorar" essas colunas de novo).
alter table if exists products
  add column if not exists "widthIncrement" numeric,
  add column if not exists "heightIncrement" numeric,
  add column if not exists "instProfCount" numeric,
  add column if not exists "instProfInstHours" numeric,
  add column if not exists "instProfRate" numeric,
  add column if not exists "instHelpCount" numeric,
  add column if not exists "instHelpInstHours" numeric,
  add column if not exists "instHelpRate" numeric,
  add column if not exists "laborSector" text;
