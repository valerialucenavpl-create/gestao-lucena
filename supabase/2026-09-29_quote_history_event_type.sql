-- Rótulo do evento que gerou a entrada de histórico do orçamento (ex.:
-- "edit" = salvo pelo formulário completo, "cancel" = venda cancelada,
-- "reactivate" = cancelamento desfeito). event_label é o texto pronto pra
-- exibir (ex.: "Venda cancelada"), opcional.
alter table public.quote_history add column if not exists event_type text default 'edit';
alter table public.quote_history add column if not exists event_label text;
