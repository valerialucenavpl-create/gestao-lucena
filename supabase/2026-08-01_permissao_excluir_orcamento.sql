-- Vendedoras (e Financeiro) agora podem excluir orçamentos livremente
-- (inclusive testes) — a trava "só Admin exclui/restaura" continua valendo
-- para sales, cashflow, payables, clients e receivables, só sai de quotes.
--
-- A exclusão de VENDA (que marca o orçamento como Recusado) continua
-- restrita a Admin, mas isso é feito no código (components/Sales.tsx),
-- porque tecnicamente é uma edição comum de status, não uma exclusão —
-- não dá pra distinguir isso só com regra de banco.

drop trigger if exists trg_bloquear_exclusao_nao_admin on public.quotes;
