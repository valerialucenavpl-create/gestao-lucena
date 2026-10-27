-- Vínculo direto com o orçamento/venda de origem (antes só existia embutido
-- no texto de subcategory, ex.: "quote:353") e forma de pagamento
-- estruturada (antes só aparecia dentro da descrição, ex.: "(PIX)").
alter table public.cashflow add column if not exists orcamento_id bigint;
alter table public.cashflow add column if not exists payment_method text;
alter table public.cashflow add column if not exists installments integer;

create index if not exists cashflow_orcamento_id_idx on public.cashflow (orcamento_id);
