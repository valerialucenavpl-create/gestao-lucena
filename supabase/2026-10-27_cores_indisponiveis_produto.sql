-- Cores que o produto NÃO tem, mesmo existindo como variante na
-- matéria-prima (ex.: a matéria-prima lista Branco/Bronze/Preto, mas este
-- produto só existe em Branco). Lista json de nomes de cor; vazio/nulo =
-- todas as cores disponíveis (comportamento antigo).

alter table public.products add column if not exists "unavailableColors" jsonb;
