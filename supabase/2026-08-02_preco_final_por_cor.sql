-- "fixedSalePrice" (preço final travado manualmente) era um único valor pro
-- produto inteiro. Agora vira um valor por cor, no mesmo padrão já usado
-- por "marginByColor" (json, uma chave por nome de cor).

alter table public.products add column if not exists "fixedSalePriceByColor" jsonb;

-- Preço de venda por m², por cor — pra produtos que variam por área (ex.:
-- chapas de mármore), onde o total deve multiplicar pela medida da peça em
-- vez de usar um valor fixo travado.
alter table public.products add column if not exists "pricePerSqmByColor" jsonb;
