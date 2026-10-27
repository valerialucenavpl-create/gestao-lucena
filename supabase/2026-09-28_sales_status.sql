-- Status próprio da venda (hoje só existe o status do orçamento de origem).
-- Usado principalmente pra "Cancelado": cancelar uma venda não deve mexer
-- no orçamento (que continua Aprovado), só marcar a venda em si.
alter table public.sales add column if not exists status text;
