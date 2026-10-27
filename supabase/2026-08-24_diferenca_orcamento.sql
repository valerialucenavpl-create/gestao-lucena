-- Novo campo "Diferença (R$)" no orçamento — ajuste de preço em nível de
-- pedido (não por produto), lançado depois que os produtos já foram
-- adicionados e o valor final apareceu. Soma direto no total cobrado do
-- cliente como lucro puro, sem afetar custo (diferente de installation, que
-- também é cobrado do cliente, e de feeding_cost, que é custo interno).
alter table public.quotes add column if not exists price_difference numeric default 0;
