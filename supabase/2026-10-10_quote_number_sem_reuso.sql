-- Número da OS (quotes.quote_number) nunca é reaproveitado.
--
-- Antes o próximo número era calculado no navegador como "maior número da
-- lista na tela + 1" — e a lista não inclui orçamentos excluídos (deleted_at).
-- Excluir o último orçamento fazia o número dele ser usado de novo, e uma
-- vendedora (que pode não enxergar todos os orçamentos) podia gerar número
-- repetido. Agora quem decide é o banco, olhando TODOS os orçamentos,
-- inclusive os excluídos.

-- Próximo número livre (usado pela tela pra mostrar o número antes de salvar).
-- security definer: enxerga todas as linhas, independente da RLS de quem chama.
create or replace function public.next_quote_number()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(max(quote_number), 0) + 1 from public.quotes;
$$;

grant execute on function public.next_quote_number() to authenticated;

-- Ao inserir: se o número veio vazio ou já foi usado (por qualquer
-- orçamento, excluído ou não), troca pelo próximo livre. O lock evita que
-- dois orçamentos salvos ao mesmo tempo peguem o mesmo número.
create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('quotes.quote_number'));
  select coalesce(max(quote_number), 0) into v_max from public.quotes;
  if new.quote_number is null or new.quote_number <= v_max then
    new.quote_number := v_max + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_quote_number on public.quotes;
create trigger trg_assign_quote_number
  before insert on public.quotes
  for each row execute function public.assign_quote_number();

-- Conferência: próximo número que será usado.
select public.next_quote_number() as proximo_numero_os;
