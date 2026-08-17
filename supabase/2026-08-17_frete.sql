-- Frete por KM: cadastro de locais (nome + distância em km) e uma
-- configuração única com o valor por km de carro/moto + MKP, usados pra
-- calcular o valor de venda do frete (mesma fórmula da planilha de
-- precificação: valor = (km x valor/km) x (1+MKP) / (1-DVV), onde DVV é
-- comissão + imposto já cadastrados em variable_expenses).

create table if not exists public.freight_rates (
  id bigint generated always as identity primary key,
  city text not null,
  km numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.freight_config (
  id bigint generated always as identity primary key,
  km_rate_car numeric not null default 0,
  km_rate_moto numeric not null default 0,
  markup numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.freight_rates enable row level security;
alter table public.freight_config enable row level security;

-- freight_rates: cadastro dos locais — mesma regra de "cad_" (products,
-- montagens etc.): todos os papéis leem, só Admin cria/edita/apaga.
drop policy if exists "cad_ler" on public.freight_rates;
drop policy if exists "cad_criar" on public.freight_rates;
drop policy if exists "cad_editar" on public.freight_rates;
drop policy if exists "cad_apagar" on public.freight_rates;

create policy "cad_ler" on public.freight_rates for select to authenticated
  using ( public.auth_role() in ('Admin','Finance','Sales') );

create policy "cad_criar" on public.freight_rates for insert to authenticated
  with check ( public.auth_role() = 'Admin' );

create policy "cad_editar" on public.freight_rates for update to authenticated
  using      ( public.auth_role() = 'Admin' )
  with check ( public.auth_role() = 'Admin' );

create policy "cad_apagar" on public.freight_rates for delete to authenticated
  using ( public.auth_role() = 'Admin' );

-- freight_config: fica dentro do Financeiro (Admin + Financeiro editam,
-- igual billing_settings), mas todos os papéis precisam LER pra calcular
-- o frete no orçamento (mesmo motivo de billing_settings/variable_expenses
-- terem sido liberados pra leitura de todos em 2026-08-05).
drop policy if exists "freight_config_ler" on public.freight_config;
drop policy if exists "freight_config_escrever" on public.freight_config;
drop policy if exists "freight_config_apagar" on public.freight_config;

create policy "freight_config_ler" on public.freight_config for select to authenticated
  using ( public.auth_role() in ('Admin','Finance','Sales') );

create policy "freight_config_escrever" on public.freight_config for insert to authenticated
  with check ( public.auth_role() in ('Admin','Finance') );

create policy "freight_config_atualizar" on public.freight_config for update to authenticated
  using      ( public.auth_role() in ('Admin','Finance') )
  with check ( public.auth_role() in ('Admin','Finance') );

create policy "freight_config_apagar" on public.freight_config for delete to authenticated
  using ( public.auth_role() = 'Admin' );
