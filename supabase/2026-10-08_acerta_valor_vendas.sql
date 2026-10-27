-- Acerta o valor das vendas já feitas pro VALOR FINAL do pedido (com
-- desconto). A venda guardava o valor do momento em que foi gerada; se o
-- pedido foi editado/teve desconto depois, a tela de Vendas mostrava o valor
-- antigo. Daqui pra frente o sistema já atualiza sozinho ao salvar o pedido.
-- Rode UMA parte de cada vez.

-- 1) CONFERIR (só leitura): vendas com valor diferente do pedido
select q.quote_number as os, q.customer_name as cliente,
       s.total        as valor_na_venda,
       q.total_price  as valor_final_do_pedido,
       round((q.total_price - s.total)::numeric, 2) as diferenca,
       s.date, q.discount
from public.sales s
join public.quotes q on q.id = s.quote_id
where s.deleted_at is null
  and q.deleted_at is null
  and coalesce(s.status, '') <> 'Cancelado'
  and abs(coalesce(s.total, 0) - coalesce(q.total_price, 0)) > 0.005
order by s.date desc;

-- 2) CORRIGIR: grava o valor final do pedido nessas vendas
update public.sales s
set total = q.total_price
from public.quotes q
where q.id = s.quote_id
  and s.deleted_at is null
  and q.deleted_at is null
  and coalesce(s.status, '') <> 'Cancelado'
  and abs(coalesce(s.total, 0) - coalesce(q.total_price, 0)) > 0.005;
