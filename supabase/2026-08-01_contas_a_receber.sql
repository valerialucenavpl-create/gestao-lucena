-- =============================================================================
-- Contas a Receber de verdade — substitui a aproximacao por nome do cliente
-- em cashflow (services antigo em components/Receivables.tsx).
--
-- Regras combinadas com a dona do sistema:
-- 1. Quando um orcamento vira "Aprovado", cria automaticamente um recebivel
--    com o valor total do orcamento.
-- 2. Prazo de recebimento:
--    - PIX / Dinheiro / demais formas: mesma data prevista de entrega
--      (cai na data da venda se nao houver entrega definida ainda)
--    - Cartao: proximo dia util contando a partir da data da venda (o
--      dinheiro cai na conta ~1 dia util depois da transacao em si,
--      independente de quando o produto e entregue)
-- 3. Se o orcamento deixar de ser "Aprovado" (ex: virou Recusado), o
--    recebivel pendente correspondente vai pra lixeira.
-- 4. "Dar baixa" (marcar como recebido) e feito pela tela — so Admin/
--    Financeiro veem e mexem nessa tabela, mesmo nivel de acesso do caixa
--    e contas a pagar.
-- =============================================================================

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  quote_id bigint not null references public.quotes(id) on delete cascade,
  quote_number bigint,
  customer_name text,
  amount numeric not null default 0,
  payment_method text,
  due_date date,
  status text not null default 'pending',
  received_at timestamptz,
  received_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique (quote_id)
);

create index if not exists idx_receivables_nao_excluido
  on public.receivables (deleted_at) where deleted_at is null;

alter table public.receivables enable row level security;

drop policy if exists "recv_ler" on public.receivables;
create policy "recv_ler" on public.receivables for select to authenticated
  using ( public.auth_role() in ('Admin','Finance') );

drop policy if exists "recv_criar" on public.receivables;
create policy "recv_criar" on public.receivables for insert to authenticated
  with check ( public.auth_role() in ('Admin','Finance') );

drop policy if exists "recv_editar" on public.receivables;
create policy "recv_editar" on public.receivables for update to authenticated
  using      ( public.auth_role() in ('Admin','Finance') )
  with check ( public.auth_role() in ('Admin','Finance') );

drop policy if exists "recv_apagar" on public.receivables;
create policy "recv_apagar" on public.receivables for delete to authenticated
  using ( public.auth_role() = 'Admin' );

-- Mesma trava de "só Admin exclui/restaura" já usada em quotes/sales/etc.
drop trigger if exists trg_bloquear_exclusao_nao_admin on public.receivables;
create trigger trg_bloquear_exclusao_nao_admin before update on public.receivables
  for each row execute function public.bloquear_exclusao_nao_admin();

-- ── Próximo dia útil (pula sábado/domingo; não considera feriados) ──────────
create or replace function public.proximo_dia_util(d date)
returns date
language plpgsql
immutable
as $$
declare
  resultado date := d + 1;
begin
  while extract(dow from resultado) in (0, 6) loop
    resultado := resultado + 1;
  end loop;
  return resultado;
end;
$$;

-- ── Gatilho: cria/atualiza/cancela o recebível ao aprovar/editar/recusar ────
create or replace function public.gerenciar_recebivel_do_orcamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_date date;
  v_due_date date;
  v_ficou_aprovado boolean;
  v_deixou_de_ser_aprovado boolean;
begin
  if TG_OP = 'INSERT' then
    v_ficou_aprovado := (new.status = 'Aprovado');
    v_deixou_de_ser_aprovado := false;
  else
    v_ficou_aprovado := (new.status = 'Aprovado' and old.status is distinct from new.status);
    v_deixou_de_ser_aprovado := (old.status = 'Aprovado' and new.status is distinct from old.status);
  end if;

  if v_ficou_aprovado and not exists (select 1 from public.receivables where quote_id = new.id) then
    v_sale_date := coalesce(new.date::date, current_date);
    v_due_date := case
      when new.payment_method = 'Cartão' then public.proximo_dia_util(v_sale_date)
      else coalesce(new.delivery_date::date, v_sale_date)
    end;

    insert into public.receivables (quote_id, quote_number, customer_name, amount, payment_method, due_date, status)
    values (new.id, new.quote_number, new.customer_name, coalesce(new.total_price, 0), new.payment_method, v_due_date, 'pending');

  elsif TG_OP = 'UPDATE' and new.status = 'Aprovado' and old.total_price is distinct from new.total_price then
    -- Preço do orçamento mudou depois de aprovado: atualiza o valor pendente
    -- (não mexe em recebível que já foi marcado como recebido).
    update public.receivables
       set amount = coalesce(new.total_price, 0)
     where quote_id = new.id and status = 'pending' and deleted_at is null;

  elsif v_deixou_de_ser_aprovado then
    -- Orçamento deixou de ser Aprovado (ex: Recusado): cancela o recebível
    -- pendente, se houver.
    update public.receivables
       set deleted_at = now()
     where quote_id = new.id and status = 'pending' and deleted_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_gerenciar_recebivel on public.quotes;
create trigger trg_gerenciar_recebivel
  after insert or update on public.quotes
  for each row execute function public.gerenciar_recebivel_do_orcamento();

-- ── Backfill: orçamentos já aprovados antes desta migração ──────────────────
insert into public.receivables (quote_id, quote_number, customer_name, amount, payment_method, due_date, status)
select
  q.id,
  q.quote_number,
  q.customer_name,
  coalesce(q.total_price, 0),
  q.payment_method,
  case
    when q.payment_method = 'Cartão' then public.proximo_dia_util(coalesce(q.date::date, current_date))
    else coalesce(q.delivery_date::date, q.date::date, current_date)
  end,
  'pending'
from public.quotes q
where q.status = 'Aprovado'
  and (q.deleted_at is null)
  and not exists (select 1 from public.receivables r where r.quote_id = q.id);
