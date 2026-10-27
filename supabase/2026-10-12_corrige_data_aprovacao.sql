-- Data de aprovação (quotes.approved_at) diferente da data da venda.
--
-- Achado na validação da aba Vendas (12/10/2026): a aba Vendas/DRE usam
-- approved_at, o Dashboard usa a data da venda (sales.date). 9 pedidos
-- divergiam em outubro:
--   - aprovados "em 01/10" mas vendidos antes (OTANER 332/335/338/345/349/354,
--     Cleiciane 323) — o gatilho grava a data do DIA em que o status virou
--     Aprovado, mesmo quando a venda já existia há meses;
--   - Aprovados sem approved_at (Cleide 280, Junior Silva 202) — o gatilho
--     só rodava em UPDATE, não quando o pedido já nasce Aprovado.
--
-- Regra: se o pedido tem venda (não cancelada), a data de aprovação é a data
-- da venda. Rode UMA parte de cada vez.

-- PASSO 1 — CONFERIR (só leitura): todos os pedidos com data divergente
select q.quote_number as os, q.customer_name as cliente,
       q.approved_at as aprovado_hoje, s.data_venda, q.total_price
from public.quotes q
join (
  select quote_id, min(date)::date as data_venda
  from public.sales
  where deleted_at is null and coalesce(status, '') <> 'Cancelado'
  group by quote_id
) s on s.quote_id = q.id
where q.deleted_at is null
  and q.status = 'Aprovado'
  and (q.approved_at is null or q.approved_at <> s.data_venda)
order by s.data_venda;

-- PASSO 2 — CORRIGIR: approved_at = data da venda
update public.quotes q
set approved_at = s.data_venda
from (
  select quote_id, min(date)::date as data_venda
  from public.sales
  where deleted_at is null and coalesce(status, '') <> 'Cancelado'
  group by quote_id
) s
where s.quote_id = q.id
  and q.deleted_at is null
  and q.status = 'Aprovado'
  and (q.approved_at is null or q.approved_at <> s.data_venda)
returning q.quote_number as os, q.customer_name as cliente, q.approved_at;

-- PASSO 3 — daqui pra frente: ao virar Aprovado sem data, usa a data da
-- venda se já existir uma (senão hoje); e também roda quando o pedido já é
-- criado como Aprovado (cadastro de venda do sistema antigo).
create or replace function public.stamp_quote_dates()
returns trigger
language plpgsql
as $$
declare
  v_sale_date date;
begin
  if new.status = 'Aprovado'
     and (tg_op = 'INSERT' or old.status is distinct from 'Aprovado')
     and new.approved_at is null then
    if tg_op = 'UPDATE' then
      select min(s.date)::date into v_sale_date
      from public.sales s
      where s.quote_id = new.id and s.deleted_at is null and coalesce(s.status, '') <> 'Cancelado';
    end if;
    new.approved_at := coalesce(
      v_sale_date,
      case when tg_op = 'INSERT' and new.date::text ~ '^\d{4}-\d{2}-\d{2}' then left(new.date::text, 10)::date end,
      current_date
    );
  end if;

  if new.sale_completed = true
     and (tg_op = 'INSERT' or old.sale_completed is distinct from true)
     and new.concluded_at is null then
    new.concluded_at := current_date;
  end if;

  if tg_op = 'UPDATE' and new.sale_completed = false and old.sale_completed = true then
    new.concluded_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_quote_dates on public.quotes;
create trigger trg_stamp_quote_dates
  before insert or update on public.quotes
  for each row
  execute function public.stamp_quote_dates();
