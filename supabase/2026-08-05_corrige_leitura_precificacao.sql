-- BUG CRÍTICO: billing_settings, fixed_expenses e variable_expenses ficaram
-- restritas a Admin/Financeiro na migração de RLS (BLOCO 5), mas o calculo
-- de preco do orcamento roda no navegador de QUEM ESTIVER LOGADO -
-- inclusive vendedora - e precisa ler esses percentuais (imposto, comissao,
-- taxa de cartao, meta de faturamento) pra calcular o preco certo.
--
-- Pra vendedora essas consultas voltavam vazias, entao o sistema calculava
-- como se nao existisse imposto/comissao/taxa nenhuma - dando um preco MENOR
-- que o real em todo orcamento criado por vendedora desde a migracao.
--
-- Diferente de cashflow/payables/employees/partners (que tem dado sensivel
-- de dinheiro em caixa e folha de pagamento individual e continuam
-- fechados), essas 3 tabelas so tem percentuais/metas gerais da empresa -
-- por isso reabrir a LEITURA pra vendedora tambem e seguro. So a leitura;
-- criar/editar/apagar continua exclusivo de Admin/Financeiro.

do $$
declare
  t text;
  tabelas text[] := array['billing_settings','fixed_expenses','variable_expenses'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "fin_ler" on public.%I', t);
    execute format($f$
      create policy "fin_ler" on public.%I for select to authenticated
        using ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);
  end loop;
end $$;
