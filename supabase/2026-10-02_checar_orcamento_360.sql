-- Diagnóstico (só leitura) do orçamento nº 360 (Adão): custo de cada item,
-- mão de obra salva x soma do detalhamento, e o que entrou no total.

-- 1) Totais do orçamento
select quote_number, customer_name, total_price, subtotal, discount,
       cost_of_goods, taxes, machine_fee, fixed_costs, payment_method
from public.quotes
where quote_number = 360;

-- 2) Item a item
select
  it->>'productName'                                   as produto,
  it->>'selectedColor'                                 as cor,
  (it->>'quantity')::numeric                           as qtd,
  (it->>'width')::numeric                              as largura,
  (it->>'height')::numeric                             as altura,
  round((it->>'price')::numeric, 2)                    as preco,
  round((it->>'materialCost')::numeric, 2)             as custo_material,
  round((it->>'laborCost')::numeric, 2)                as mao_de_obra_salva,
  round((select coalesce(sum((l->>'total')::numeric), 0)
         from jsonb_array_elements(coalesce(it->'laborBreakdown', '[]'::jsonb)) l), 2)
                                                       as soma_detalhamento,
  round(coalesce((it->>'assemblyCost')::numeric, 0), 2) as montagem,
  round(coalesce((it->>'fixedCostValue')::numeric, 0), 2) as custo_fixo,
  it->'piecesBreakdown'                                as pecas,
  it->'laborBreakdown'                                 as detalhamento_mao_de_obra
from public.quotes q,
     jsonb_array_elements(q.items::jsonb) it
where q.quote_number = 360;
