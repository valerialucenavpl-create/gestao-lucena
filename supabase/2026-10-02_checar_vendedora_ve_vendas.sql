-- Diagnóstico (só leitura): a vendedora enxerga as linhas da tabela sales?
-- Se ela não enxerga, a tela de Vendas dela mostra a versão "virtual" da
-- venda (derivada do orçamento aprovado) em vez da venda real.

-- 1) Políticas de acesso ativas na tabela sales. O esperado é a "fin_ler"
--    (ou equivalente de SELECT) incluir o papel 'Sales'.
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'sales'
order by cmd, policyname;

-- 2) Vendas reais de hoje e de ontem, com o orçamento de origem, pra conferir
--    a data gravada na venda x data do orçamento x data de aprovação.
select s.id as venda_id, s.date as data_venda, s.status,
       q.quote_number, q.customer_name, q.salesperson,
       q.date as data_orcamento, q.approved_at
from public.sales s
left join public.quotes q on q.id = s.quote_id
where s.deleted_at is null
  and s.date >= now() - interval '2 days'
order by s.date desc;
