-- Etapa 5.1 — novo campo data_entrega (separado da data de conclusão), base
-- do novo fluxo de status: Pendente em aprovação → Aguardando →
-- Entregue – a receber → Concluído → Cancelado.
alter table public.quotes
  add column if not exists delivered_at date;

-- Migração: vendas já concluídas (sale_completed = true) recebem
-- delivered_at = concluded_at, já que "entregue" é pré-requisito de
-- "concluído" no fluxo novo — sem isso ficariam com status ambíguo.
update public.quotes
set delivered_at = concluded_at
where sale_completed = true and delivered_at is null and concluded_at is not null;

-- Regra de reconhecimento de receita da DRE passa a ser "Entrega" (no lugar
-- de "Conclusão") — renomeia o valor salvo e troca a restrição da coluna.
alter table public.cashflow_settings drop constraint if exists cashflow_settings_sale_recognition_date_check;
update public.cashflow_settings set sale_recognition_date = 'delivery' where sale_recognition_date = 'conclusion';
alter table public.cashflow_settings
  add constraint cashflow_settings_sale_recognition_date_check
  check (sale_recognition_date in ('delivery', 'approval'));
alter table public.cashflow_settings alter column sale_recognition_date set default 'delivery';
