-- Diagnóstico (só leitura): vendas geradas nos últimos 3 dias e se foram
-- marcadas como entregues/concluídas. O banco NÃO guarda quem marcou a
-- entrega (só a data) — a partir de 2026-10-08 isso passa a ficar no
-- "Ver histórico do pedido".
-- Rode UMA consulta de cada vez (copie a partir do "select").

-- 1) Vendas recentes com os campos de entrega
select q.quote_number as os, q.customer_name as cliente, q.salesperson as vendedora,
       s.date as data_venda, s.id as venda_id,
       q.sale_completed as concluida, q.delivered_at as entregue_em,
       q.concluded_at as concluida_em, q.internal_status
from public.sales s
join public.quotes q on q.id = s.quote_id
where s.deleted_at is null
  and s.date >= now() - interval '3 days'
order by s.id desc;

-- 2) Histórico registrado desses pedidos (com o nome de quem fez, quando houver)
select q.quote_number as os, h.created_at, h.event_type, h.event_label,
       h.event_description, h.created_by_name,
       u.name as usuario
from public.quote_history h
join public.quotes q on q.id = h.quote_id
left join public.users u on u.id::text = h.created_by::text
where h.created_at >= now() - interval '3 days'
order by h.created_at desc;
