-- =============================================================================
-- Corrige um bug real encontrado no saveQuoteWithFallback (services/quotesServices.ts):
-- ele salva o orçamento tentando até 30 vezes, removendo silenciosamente
-- qualquer coluna que o Postgres reclamar não existir, e sempre retorna sucesso.
--
-- "internal_status" e "delivery_date" nunca existiram na tabela "quotes" —
-- ou seja, todo clique em "mudar status interno" (Pedido/Na Produção/Entregue)
-- e toda edição de "data de entrega" na tela de orçamento eram descartados
-- silenciosamente. É por isso que "Entregas por setor" nunca marca nada como
-- entregue de verdade.
-- =============================================================================

alter table public.quotes add column if not exists internal_status text default 'Pedido';
alter table public.quotes add column if not exists delivery_date text;
