-- Cancela recebíveis pendentes cujo orçamento de origem já foi excluído
-- (o gatilho antigo só reagia a mudança de status, não à exclusão do
-- orçamento; corrigido no código, isto aqui resolve o que já ficou preso).
--
-- A trava "só Admin exclui" olha pra sessão de login da PostgREST/app; no
-- SQL Editor (rodando como "postgres") não existe essa sessão, então ela
-- bloqueia até o Admin real. Por isso desligamos e ligamos a trava em volta
-- deste ajuste pontual.

alter table public.receivables disable trigger trg_bloquear_exclusao_nao_admin;

update public.receivables r
set deleted_at = now()
where r.status = 'pending'
  and r.deleted_at is null
  and exists (
    select 1 from public.quotes q
    where q.id = r.quote_id and q.deleted_at is not null
  );

alter table public.receivables enable trigger trg_bloquear_exclusao_nao_admin;
