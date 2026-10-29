-- Contas a Receber guarda uma CÓPIA do nome do cliente de quando o pedido
-- foi aprovado. Pedidos que nasceram como "Cliente Desconhecido" e depois
-- foram corrigidos continuavam com o nome antigo aqui.
-- Rode UMA parte de cada vez.

-- 1) CONFERIR (só leitura): títulos com nome diferente do pedido
select r.id, r.quote_number, r.customer_name as nome_no_titulo, q.customer_name as nome_no_pedido
from public.receivables r
join public.quotes q on q.id = r.quote_id
where r.deleted_at is null
  and coalesce(q.customer_name, '') <> ''
  and r.customer_name is distinct from q.customer_name;

-- 2) CORRIGIR: copia o nome atual do pedido pro título
update public.receivables r
set customer_name = q.customer_name
from public.quotes q
where q.id = r.quote_id
  and r.deleted_at is null
  and coalesce(q.customer_name, '') <> ''
  and r.customer_name is distinct from q.customer_name;
