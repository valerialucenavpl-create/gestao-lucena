-- Etapa 3 — DRE Gerencial: datas de aprovação/conclusão da venda (pra
-- reconhecimento de receita) + configs novas (regra de reconhecimento e
-- meta de margem líquida).

alter table public.quotes
  add column if not exists approved_at date,
  add column if not exists concluded_at date;

-- Preenche approved_at/concluded_at pros orçamentos que já estão
-- aprovados/concluídos hoje, usando a data do orçamento como aproximação
-- (não temos histórico exato de quando cada um mudou de status).
update public.quotes
set approved_at = date::date
where status = 'Aprovado' and approved_at is null;

update public.quotes
set concluded_at = coalesce(delivery_date::date, date::date)
where sale_completed = true and concluded_at is null;

-- Dispara sozinho daqui pra frente: primeira vez que o status vira
-- 'Aprovado' grava approved_at; primeira vez que sale_completed vira true
-- grava concluded_at (e limpa se for desmarcado, pra poder ser marcado de
-- novo depois com a data certa).
create or replace function public.stamp_quote_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Aprovado' and (old.status is distinct from 'Aprovado') and new.approved_at is null then
    new.approved_at := current_date;
  end if;

  if new.sale_completed = true and (old.sale_completed is distinct from true) and new.concluded_at is null then
    new.concluded_at := current_date;
  end if;

  if new.sale_completed = false and old.sale_completed = true then
    new.concluded_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_quote_dates on public.quotes;
create trigger trg_stamp_quote_dates
  before update on public.quotes
  for each row
  execute function public.stamp_quote_dates();

alter table public.cashflow_settings
  add column if not exists sale_recognition_date text not null default 'conclusion'
    check (sale_recognition_date in ('conclusion', 'approval')),
  add column if not exists target_net_margin numeric;
