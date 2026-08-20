-- Pagamento 100% sozinho nao pode marcar a venda como "Concluindo" no
-- painel de Vendas -- o produto pode ainda nao ter sido entregue. Agora
-- isso vira uma marcacao manual, so Admin, via botao "Marcar como
-- Concluido" no card da venda.
alter table public.quotes add column if not exists sale_completed boolean default false;
