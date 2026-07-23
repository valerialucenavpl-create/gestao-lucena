-- ============================================================
--  CORREÇÃO COMPLETA DA TABELA quotes
--  Execute no SQL Editor do Supabase
--  Seguro: não apaga dados existentes
-- ============================================================

-- Cria a tabela caso ainda não exista
create table if not exists quotes (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now()
);

-- Adiciona todas as colunas necessárias (ignora se já existirem)
alter table quotes
  add column if not exists quote_number             integer,
  add column if not exists customer_name            text,
  add column if not exists client_id                text,
  add column if not exists salesperson              text,
  add column if not exists date                     text,
  add column if not exists status                   text     default 'Pendente',
  add column if not exists items                    jsonb    default '[]'::jsonb,
  add column if not exists subtotal                 numeric  default 0,
  add column if not exists discount                 numeric  default 0,
  add column if not exists freight                  numeric  default 0,
  add column if not exists installation             numeric  default 0,
  add column if not exists total_price              numeric  default 0,
  add column if not exists payment_method           text     default 'A Definir',
  add column if not exists cost_of_goods            numeric  default 0,
  add column if not exists fixed_costs              numeric  default 0,
  add column if not exists machine_fee              numeric  default 0,
  add column if not exists taxes                    numeric  default 0,
  add column if not exists assembly_notes           text,
  add column if not exists measurement_notes        text,
  add column if not exists referral_commission_rate  numeric  default 0,
  add column if not exists referral_commission_value numeric  default 0,
  add column if not exists delivery_date             text,
  add column if not exists internal_status           text     default 'Pedido';

-- Confirma que foi executado com sucesso
select 'Tabela quotes corrigida com sucesso!' as resultado;
