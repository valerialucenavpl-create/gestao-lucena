-- Detalhamento do custo embutido no valor de Instalação do orçamento
-- (ex.: argamassa, cantoneiras, mão de obra), para a margem de lucro
-- deixar de tratar o valor de Instalação como 100% lucro.
alter table public.quotes add column if not exists installation_cost_items jsonb;
