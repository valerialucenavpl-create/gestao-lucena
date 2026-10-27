-- Orçamentos que já viraram venda (botão "Gerar Venda") mas ficaram com o
-- status "Pendente" — o botão criava a venda sem aprovar o orçamento, então
-- ele continuava na lista de Orçamentos (ex.: OS 325, Leandro da Silva e
-- Silva). Corrigido no código; este script acerta os que já ficaram assim.
--
-- Não mexe em: venda cancelada, venda marcada de propósito como "Pendente"
-- (em aprovação), orçamento excluído ou recusado.
--
-- Rode primeiro só o PASSO 1 pra conferir a lista; depois o PASSO 2.

-- PASSO 1 — conferir quais serão corrigidos
select q.quote_number as os, q.customer_name as cliente, q.status,
       q.total_price, s.date::date as data_venda
from public.quotes q
join public.sales s on s.quote_id = q.id and s.deleted_at is null
where q.deleted_at is null
  and q.status = 'Pendente'
  and coalesce(s.status, '') not in ('Cancelado', 'Pendente')
order by q.quote_number;

-- PASSO 2 — aprovar, com a data da venda como data de aprovação
update public.quotes q
set status = 'Aprovado',
    approved_at = coalesce(q.approved_at, s.date::date)
from public.sales s
where s.quote_id = q.id
  and s.deleted_at is null
  and q.deleted_at is null
  and q.status = 'Pendente'
  and coalesce(s.status, '') not in ('Cancelado', 'Pendente')
returning q.quote_number as os, q.customer_name as cliente, q.status, q.approved_at;
