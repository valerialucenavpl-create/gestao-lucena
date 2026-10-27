-- Etapa 5 — DFC: histórico de conferência de saldo por conta (saldo do
-- sistema x saldo do extrato bancário) por mês.
create table if not exists public.dfc_extrato_conferencia (
  id bigint generated always as identity primary key,
  account_id bigint not null references public.bank_accounts(id),
  period_month text not null, -- 'YYYY-MM'
  extrato_balance numeric not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (account_id, period_month)
);

alter table public.dfc_extrato_conferencia enable row level security;

create policy dfc_conf_ler on public.dfc_extrato_conferencia
  for select using (public.auth_role() in ('Admin', 'Finance', 'Sales'));

create policy dfc_conf_criar on public.dfc_extrato_conferencia
  for insert with check (public.auth_role() = 'Admin');

create policy dfc_conf_editar on public.dfc_extrato_conferencia
  for update using (public.auth_role() = 'Admin');

create policy dfc_conf_apagar on public.dfc_extrato_conferencia
  for delete using (public.auth_role() = 'Admin');
