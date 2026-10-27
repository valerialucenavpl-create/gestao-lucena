-- Alteração de pedido, devolução ao cliente e crédito com fornecedor.
-- Tudo fica ligado ao pedido (quotes.id) e aparece no "Ver histórico do
-- pedido". Nenhum lançamento de receita existente é alterado: correções são
-- sempre novos registros.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Alterações de pedido (item trocado/valor ajustado)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.pedido_alteracoes (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.quotes(id) on delete cascade,
  item_id text not null,
  dados_antes jsonb not null,
  dados_depois jsonb not null,
  diferenca numeric not null default 0,
  motivo text not null,
  observacao text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);
create index if not exists pedido_alteracoes_pedido_idx on public.pedido_alteracoes (pedido_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Crédito a receber do fornecedor (aba Despesas do pedido)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.pedido_creditos_fornecedor (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.quotes(id) on delete cascade,
  fornecedor text not null,
  valor numeric not null default 0,
  motivo text,
  status text not null default 'Pendente' check (status in ('Pendente','Recebido')),
  data_recebimento date,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);
create index if not exists pedido_creditos_fornecedor_pedido_idx on public.pedido_creditos_fornecedor (pedido_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Devolução ao cliente = lançamento de Caixa (Saída) marcado como
--    movement_kind = 'devolucao', na categoria DEDUÇÕES → "devoluções de
--    vendas" (grupo DRE "Deduções": deduz a receita bruta, não é despesa).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.cashflow
  add column if not exists movement_kind text,
  add column if not exists attachment_path text,
  add column if not exists pedido_alteracao_id bigint references public.pedido_alteracoes(id) on delete set null;

-- "devoluções de vendas"         → devolução SEM alteração ligada: deduz a receita na DRE.
-- "devolução de diferença de pedido" → devolução LIGADA a uma alteração: a
--   alteração já baixou o valor do pedido (e a receita da DRE, que lê o valor
--   atual do pedido), então aqui só sai o dinheiro no Caixa/DFC — NAO_ENTRA na
--   DRE, senão a mesma redução seria descontada duas vezes.
insert into public.cashflow_categories (type, category, group_title, subcategory, grupo_dre, grupo_dfc, sort_order)
values
  ('Saída', 'DEDUÇÕES', 'devoluções', 'devoluções de vendas', 'DEDUCOES', 'OPERACIONAL', 42),
  ('Saída', 'DEDUÇÕES', 'devoluções', 'devolução de diferença de pedido', 'NAO_ENTRA', 'OPERACIONAL', 43)
on conflict (type, category, subcategory) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Histórico do pedido: descrição do evento e nome de quem fez
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.quote_history
  add column if not exists event_description text,
  add column if not exists created_by_name text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS — Admin/Financeiro gravam; vendedora só lê (vê o pedido dela
--    alterado, mas não registra devolução nem crédito). Só Admin apaga.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.pedido_alteracoes enable row level security;
alter table public.pedido_creditos_fornecedor enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['pedido_alteracoes', 'pedido_creditos_fornecedor'] loop
    execute format('drop policy if exists "ped_ler" on public.%I;', t);
    execute format('drop policy if exists "ped_criar" on public.%I;', t);
    execute format('drop policy if exists "ped_editar" on public.%I;', t);
    execute format('drop policy if exists "ped_apagar" on public.%I;', t);

    execute format($f$
      create policy "ped_ler" on public.%I for select to authenticated
        using ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);
    execute format($f$
      create policy "ped_criar" on public.%I for insert to authenticated
        with check ( public.auth_role() in ('Admin','Finance') );
    $f$, t);
    execute format($f$
      create policy "ped_editar" on public.%I for update to authenticated
        using      ( public.auth_role() in ('Admin','Finance') )
        with check ( public.auth_role() in ('Admin','Finance') );
    $f$, t);
    execute format($f$
      create policy "ped_apagar" on public.%I for delete to authenticated
        using ( public.auth_role() = 'Admin' );
    $f$, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Comprovantes de devolução — bucket PRIVADO (link gerado na hora de abrir)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('pedido-comprovantes', 'pedido-comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "pedido_comprovantes_ler" on storage.objects;
create policy "pedido_comprovantes_ler" on storage.objects for select to authenticated
  using ( bucket_id = 'pedido-comprovantes' and public.auth_role() in ('Admin','Finance') );

drop policy if exists "pedido_comprovantes_enviar" on storage.objects;
create policy "pedido_comprovantes_enviar" on storage.objects for insert to authenticated
  with check ( bucket_id = 'pedido-comprovantes' and public.auth_role() in ('Admin','Finance') );
