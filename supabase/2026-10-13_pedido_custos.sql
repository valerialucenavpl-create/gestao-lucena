-- Etapa 7 — Vínculo de custo ao pedido (Caixa → Pedido).
--
-- Uma saída do Caixa (compra de mercadorias, frete de fornecedores,
-- consumíveis de produção, mão de obra terceirizada / instalação) pode ser
-- dividida entre vários pedidos — cada linha aqui é "R$ X desta saída vai
-- para o pedido Y". O que sobra da saída (valor − soma das linhas) é
-- "Estoque geral" e não é gravado.
--
-- Não usa cashflow.orcamento_id de propósito: esse campo já liga
-- recebimentos/devoluções ao pedido e entra no cálculo do "recebido".
--
-- Os tipos de cashflow.id e quotes.id são lidos do banco (não sabemos se são
-- bigint ou uuid em todas as instalações).

do $$
declare
  t_cashflow text;
  t_quote text;
begin
  select data_type into t_cashflow from information_schema.columns
  where table_schema = 'public' and table_name = 'cashflow' and column_name = 'id';
  select data_type into t_quote from information_schema.columns
  where table_schema = 'public' and table_name = 'quotes' and column_name = 'id';

  execute format($f$
    create table if not exists public.pedido_custos (
      id bigint generated always as identity primary key,
      cashflow_id %s not null references public.cashflow(id) on delete cascade,
      quote_id %s not null references public.quotes(id) on delete cascade,
      amount numeric(12,2) not null check (amount > 0),
      created_at timestamptz not null default now(),
      created_by uuid
    )$f$, t_cashflow, t_quote);
end $$;

create index if not exists pedido_custos_cashflow_idx on public.pedido_custos (cashflow_id);
create index if not exists pedido_custos_quote_idx on public.pedido_custos (quote_id);

alter table public.pedido_custos enable row level security;

-- Mesma regra do Caixa: Admin e Financeiro.
drop policy if exists pc_ler on public.pedido_custos;
create policy pc_ler on public.pedido_custos for select to authenticated
  using ( public.auth_role() in ('Admin','Finance') );

drop policy if exists pc_criar on public.pedido_custos;
create policy pc_criar on public.pedido_custos for insert to authenticated
  with check ( public.auth_role() in ('Admin','Finance') );

drop policy if exists pc_editar on public.pedido_custos;
create policy pc_editar on public.pedido_custos for update to authenticated
  using ( public.auth_role() in ('Admin','Finance') )
  with check ( public.auth_role() in ('Admin','Finance') );

drop policy if exists pc_apagar on public.pedido_custos;
create policy pc_apagar on public.pedido_custos for delete to authenticated
  using ( public.auth_role() in ('Admin','Finance') );
