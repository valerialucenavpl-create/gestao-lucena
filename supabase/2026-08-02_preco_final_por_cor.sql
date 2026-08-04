-- "fixedSalePrice" (preço final travado manualmente) era um único valor pro
-- produto inteiro. Agora vira um valor por cor, no mesmo padrão já usado
-- por "marginByColor" (json, uma chave por nome de cor).

alter table public.products add column if not exists "fixedSalePriceByColor" jsonb;
