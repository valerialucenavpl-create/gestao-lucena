-- Pedidos que foram salvos como "Cliente Desconhecido" (bug de comparação do
-- id do cliente no formulário de orçamento — corrigido no código em
-- 2026-10-08). O nome real ainda pode ser recuperado pelo client_id.
-- Rode UMA parte de cada vez.

-- 1) CONFERIR (só leitura): todos os pedidos afetados e o nome que o
--    cadastro do cliente tem
select q.id, q.quote_number, q.status, q.date, q.total_price,
       q.client_id, c.name as nome_no_cadastro
from public.quotes q
left join public.clients c on c.id::text = q.client_id::text
where q.customer_name = 'Cliente Desconhecido'
  and q.deleted_at is null
order by q.quote_number desc;

-- 2) CORRIGIR os que têm cliente ligado: volta o nome do cadastro
update public.quotes q
set customer_name = c.name
from public.clients c
where c.id::text = q.client_id::text
  and q.customer_name = 'Cliente Desconhecido'
  and q.deleted_at is null;

-- 3) Só se o nº 387 continuar "Cliente Desconhecido" depois do passo 2 (ou
--    seja, ficou sem client_id): grava o nome Sonia direto.
update public.quotes
set customer_name = 'Sonia'
where quote_number = 387
  and customer_name = 'Cliente Desconhecido';
