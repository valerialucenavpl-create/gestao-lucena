-- Etapa 6 — Data de início dos dados confiáveis + aba "Vendas" em Relatórios.

-- 1) Configurações: data de início dos dados confiáveis (vale pra DRE, DFC,
-- Vendas e próximas abas) e margem mínima por setor (%), usada na seção
-- "Margem sobre custo orçado (material)".
alter table public.cashflow_settings
  add column if not exists reliable_data_start date default '2026-10-01',
  add column if not exists min_margin_by_sector jsonb not null default '{}'::jsonb;

update public.cashflow_settings
set reliable_data_start = '2026-10-01'
where reliable_data_start is null;

-- 2) Orçamentos: motivo da recusa (obrigatório ao marcar "Recusado").
-- lost_reason = uma das opções fixas; lost_reason_detail = texto quando "Outro".
alter table public.quotes
  add column if not exists lost_reason text,
  add column if not exists lost_reason_detail text;
