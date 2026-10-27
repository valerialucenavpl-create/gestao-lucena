-- Plano de contas (categorias/subcategorias do Caixa com classificação de
-- DRE/DFC), contas bancárias e config de conta padrão por forma de
-- pagamento. Também estende "cashflow" com conta, competência e
-- transferência entre contas.

create table if not exists public.cashflow_categories (
  id bigint generated always as identity primary key,
  type text not null check (type in ('Entrada','Saída')),
  category text not null,
  group_title text not null,
  subcategory text not null,
  grupo_dre text not null default 'NAO_ENTRA',
  grupo_dfc text not null default 'NAO_ENTRA',
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (type, category, subcategory)
);

create table if not exists public.bank_accounts (
  id bigint generated always as identity primary key,
  name text not null unique,
  initial_balance numeric not null default 0,
  initial_balance_date date not null default current_date,
  active boolean not null default true
);

create table if not exists public.cashflow_settings (
  id bigint generated always as identity primary key,
  default_account_dinheiro bigint references public.bank_accounts(id),
  default_account_pix bigint references public.bank_accounts(id)
);

alter table public.cashflow add column if not exists account_id bigint references public.bank_accounts(id);
alter table public.cashflow add column if not exists competencia_date date;
alter table public.cashflow add column if not exists is_transfer boolean not null default false;
alter table public.cashflow add column if not exists transfer_group_id text;

create index if not exists cashflow_account_id_idx on public.cashflow (account_id);
create index if not exists cashflow_transfer_group_idx on public.cashflow (transfer_group_id);

alter table public.cashflow_categories enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.cashflow_settings enable row level security;

drop policy if exists cfc_ler on public.cashflow_categories;
create policy cfc_ler on public.cashflow_categories for select to authenticated
  using (auth_role() = ANY (ARRAY['Admin'::text,'Finance'::text,'Sales'::text]));
drop policy if exists cfc_criar on public.cashflow_categories;
create policy cfc_criar on public.cashflow_categories for insert to authenticated
  with check (auth_role() = 'Admin'::text);
drop policy if exists cfc_editar on public.cashflow_categories;
create policy cfc_editar on public.cashflow_categories for update to authenticated
  using (auth_role() = 'Admin'::text) with check (auth_role() = 'Admin'::text);
drop policy if exists cfc_apagar on public.cashflow_categories;
create policy cfc_apagar on public.cashflow_categories for delete to authenticated
  using (auth_role() = 'Admin'::text);

drop policy if exists ba_ler on public.bank_accounts;
create policy ba_ler on public.bank_accounts for select to authenticated
  using (auth_role() = ANY (ARRAY['Admin'::text,'Finance'::text,'Sales'::text]));
drop policy if exists ba_criar on public.bank_accounts;
create policy ba_criar on public.bank_accounts for insert to authenticated
  with check (auth_role() = 'Admin'::text);
drop policy if exists ba_editar on public.bank_accounts;
create policy ba_editar on public.bank_accounts for update to authenticated
  using (auth_role() = 'Admin'::text) with check (auth_role() = 'Admin'::text);
drop policy if exists ba_apagar on public.bank_accounts;
create policy ba_apagar on public.bank_accounts for delete to authenticated
  using (auth_role() = 'Admin'::text);

drop policy if exists cfs_ler on public.cashflow_settings;
create policy cfs_ler on public.cashflow_settings for select to authenticated
  using (auth_role() = ANY (ARRAY['Admin'::text,'Finance'::text,'Sales'::text]));
drop policy if exists cfs_criar on public.cashflow_settings;
create policy cfs_criar on public.cashflow_settings for insert to authenticated
  with check (auth_role() = 'Admin'::text);
drop policy if exists cfs_editar on public.cashflow_settings;
create policy cfs_editar on public.cashflow_settings for update to authenticated
  using (auth_role() = 'Admin'::text) with check (auth_role() = 'Admin'::text);

-- Contas iniciais já cadastradas, pra não começar do zero.
insert into public.bank_accounts (name, initial_balance, initial_balance_date, active)
values
  ('InfinitePay', 0, current_date, true),
  ('Banco Cora', 0, current_date, true),
  ('Mercado Pago', 0, current_date, true),
  ('Banco do Brasil', 0, current_date, true),
  ('Caixa físico', 0, current_date, true)
on conflict (name) do nothing;
