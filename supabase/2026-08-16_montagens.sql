-- Catálogo de "Montagens" (ex.: Montagem Pia Padrão): valor fixo cobrado
-- do cliente + lista de insumos internos (cantoneira, argamassa etc.) que
-- compõem o custo real, para aparecer no detalhamento financeiro do Admin
-- sem o cliente ver o nome "montagem" (fica embutido no valor da peça).
create table if not exists public.montagens (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric not null default 0,
  insumos jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.montagens enable row level security;

-- Mesma regra de "cad_" (products, inventory etc.): todos os papéis leem
-- (vendedora precisa pra montar orçamento), só Admin cria/edita/apaga.
drop policy if exists "cad_ler" on public.montagens;
drop policy if exists "cad_criar" on public.montagens;
drop policy if exists "cad_editar" on public.montagens;
drop policy if exists "cad_apagar" on public.montagens;

create policy "cad_ler" on public.montagens for select to authenticated
  using ( public.auth_role() in ('Admin','Finance','Sales') );

create policy "cad_criar" on public.montagens for insert to authenticated
  with check ( public.auth_role() = 'Admin' );

create policy "cad_editar" on public.montagens for update to authenticated
  using      ( public.auth_role() = 'Admin' )
  with check ( public.auth_role() = 'Admin' );

create policy "cad_apagar" on public.montagens for delete to authenticated
  using ( public.auth_role() = 'Admin' );
