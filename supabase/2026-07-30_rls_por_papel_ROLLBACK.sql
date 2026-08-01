-- =============================================================================
--  ROLLBACK — desfaz o script 2026-07-30_rls_por_papel.sql
--
--  Use SOMENTE se algo quebrar e você precisar voltar ao estado anterior
--  com urgência para não parar a operação.
--
--  ATENÇÃO: isto devolve o banco ao estado INSEGURO (qualquer logado faz tudo).
--  É um paliativo para não te deixar parada, não uma solução. Me avise o que
--  quebrou para corrigirmos e subir de novo.
-- =============================================================================

-- 1. Remove as políticas novas e devolve a regra permissiva antiga
do $$
declare
  t text;
  pol record;
  tabelas text[] := array[
    'quotes','sales','clients','clientes','cashflow','payables','agendamentos',
    'employees','products','inventory','inventory_variants','material_categories',
    'category_colors','sellers','partners','fixed_expenses','variable_expenses',
    'billing_settings','company_settings','users'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;

    for pol in select policyname from pg_policies
               where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format($f$
      create policy "acesso_liberado_temporario" on public.%I
        for all to authenticated
        using (auth.uid() is not null)
        with check (auth.uid() is not null);
    $f$, t);
  end loop;
end $$;

-- 2. Remove a trava anti-promoção
drop trigger if exists trg_bloquear_escalada_de_papel on public.users;
drop function if exists public.bloquear_escalada_de_papel();

-- 3. Remove a view de custo de pessoal
--    (só rode se você AINDA NÃO trocou as linhas no NewQuote.tsx/ProductModal.tsx,
--     ou se já reverteu essa troca — senão o orçamento para de calcular)
-- drop view if exists public.v_custo_pessoal;

-- 4. A função auth_role() pode ficar — não faz mal e será reutilizada.
-- drop function if exists public.auth_role();

-- 5. As colunas deleted_at/deleted_by podem ficar — são inofensivas.
