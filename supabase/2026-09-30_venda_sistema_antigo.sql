-- Etapa 3.2 item 5 — marcador "origem: sistema antigo" nos orçamentos/vendas
-- migrados manualmente, pra dar pra filtrar depois quantos ainda faltam.
alter table public.quotes
  add column if not exists origin_legacy boolean not null default false;
