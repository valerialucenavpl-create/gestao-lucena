-- Novo campo "Alimentação (R$)" no orçamento (custo de alimentar a equipe
-- de instalação) -- reduz o lucro, diferente de "installation" (que é
-- cobrado do cliente).
alter table public.quotes add column if not exists feeding_cost numeric default 0;
