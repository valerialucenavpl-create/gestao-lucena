-- Adiciona colunas faltantes na tabela quotes
alter table if exists quotes
  add column if not exists items              jsonb    default '[]'::jsonb,
  add column if not exists quote_number      integer,
  add column if not exists subtotal          numeric  default 0,
  add column if not exists discount          numeric  default 0,
  add column if not exists freight           numeric  default 0,
  add column if not exists installation      numeric  default 0,
  add column if not exists total_price       numeric  default 0,
  add column if not exists payment_method    text,
  add column if not exists cost_of_goods     numeric  default 0,
  add column if not exists fixed_costs       numeric  default 0,
  add column if not exists machine_fee       numeric  default 0,
  add column if not exists taxes             numeric  default 0,
  add column if not exists assembly_notes    text,
  add column if not exists measurement_notes text,
  add column if not exists referral_commission_rate  numeric default 0,
  add column if not exists referral_commission_value numeric default 0;
