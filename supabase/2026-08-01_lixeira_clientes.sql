-- =============================================================================
-- Complemento ao BLOCO 9 da migração de RLS (PASSO 3b — lixeira de verdade)
--
-- Correção: a primeira versão deste arquivo tentava alterar "clientes", mas
-- essa tabela não existe neste projeto — o app usa "clients" (o código tenta
-- os dois nomes e cai no que existe). "clients" já tem deleted_at/deleted_by
-- desde o BLOCO 9 original, então não precisa de nada novo pra ela.
-- =============================================================================

-- O app agora "apaga" marcando deleted_at (UPDATE) em vez de um DELETE de
-- verdade. Mas a política de UPDATE dessas tabelas é mais aberta que a de
-- DELETE (ex: Finance edita cashflow, só Admin apaga) — sem esta trava,
-- marcar deleted_at por uma edição comum viraria uma forma de "excluir" sem
-- ser Admin. Mesmo princípio do BLOCO 2 (trava de papel).
create or replace function public.bloquear_exclusao_nao_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and coalesce(public.auth_role(), '') <> 'Admin' then
    raise exception 'Somente um Admin pode excluir ou restaurar este registro.';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  tabelas text[] := array['quotes','sales','clients','cashflow','payables'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_bloquear_exclusao_nao_admin on public.%I', t);
    execute format(
      'create trigger trg_bloquear_exclusao_nao_admin before update on public.%I
         for each row execute function public.bloquear_exclusao_nao_admin()', t
    );
  end loop;
end $$;
