-- Permite aplicar mais de um frete no mesmo orçamento (ex.: equipe de carro
-- num dia + equipe de moto noutro dia, indo pra mesma cidade ou cidades
-- diferentes). Cada "Aplicar" no seletor de frete cadastrado agora vira um
-- item nessa lista, em vez de sobrescrever o valor único de frete.
alter table public.quotes add column if not exists freight_items jsonb default '[]'::jsonb;
