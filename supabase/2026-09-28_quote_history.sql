-- Histórico de alterações do orçamento/venda — cada vez que o formulário
-- completo de edição é salvo, guarda uma cópia (snapshot) do orçamento
-- naquele momento, pra poder ver "como estava antes" e abrir o PDF
-- correspondente a cada versão.
create table if not exists public.quote_history (
  id bigint generated always as identity primary key,
  quote_id bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists quote_history_quote_id_idx on public.quote_history (quote_id, created_at desc);

alter table public.quote_history enable row level security;

drop policy if exists qh_ler on public.quote_history;
create policy qh_ler on public.quote_history
  for select
  to authenticated
  using (auth_role() = ANY (ARRAY['Admin'::text, 'Finance'::text, 'Sales'::text]));

drop policy if exists qh_criar on public.quote_history;
create policy qh_criar on public.quote_history
  for insert
  to authenticated
  with check (auth_role() = ANY (ARRAY['Admin'::text, 'Finance'::text, 'Sales'::text]));
