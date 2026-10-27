-- Etapa 3.1 item 3 — modo de cálculo do custo de material na DRE:
-- custo orçado dos pedidos concluídos (padrão) ou compras lançadas no Caixa.
alter table public.cashflow_settings
  add column if not exists material_cost_mode text not null default 'budgeted'
    check (material_cost_mode in ('budgeted', 'cashflow'));
