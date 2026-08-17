-- Controla se o frete aparece diluído dentro do valor dos produtos (padrão,
-- comportamento que já existia) ou como linha separada no PDF/tela.
alter table public.quotes add column if not exists dissolve_freight boolean default true;
