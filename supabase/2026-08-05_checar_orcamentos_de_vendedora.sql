-- Lista orçamentos criados por vendedora (papel "Sales"), mais recentes
-- primeiro, pra você conferir quais podem ter sido calculados com o bug
-- (imposto/comissão/taxa de cartão zerados). Ajuste a data do "where" pra
-- cobrir o período que fizer sentido.

select
  q.quote_number,
  q.customer_name,
  q.salesperson,
  q.date,
  q.total_price,
  q.status
from public.quotes q
join public.users u on lower(u.name) = lower(q.salesperson)
where u.role = 'Sales'
  and q.deleted_at is null
  and q.date >= now() - interval '10 days'
order by q.date desc;
