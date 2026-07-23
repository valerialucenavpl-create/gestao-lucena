-- Adiciona colunas ausentes na tabela employees
-- Execute este script no Supabase SQL Editor

alter table if exists employees
  add column if not exists birth_date     date,
  add column if not exists gender         text,
  add column if not exists cpf            text,
  add column if not exists phone          text,
  add column if not exists city           text,
  add column if not exists address        text,
  add column if not exists admission_date date,
  add column if not exists dependents     text,
  add column if not exists net_salary     numeric,
  add column if not exists hour_value     numeric,
  add column if not exists minute_value   numeric,
  add column if not exists monthly_hours  numeric,
  add column if not exists inss_value     numeric,
  add column if not exists inss_employer  numeric,
  add column if not exists fgts           numeric,
  add column if not exists fgts_fine_40   numeric,
  add column if not exists thirteenth_salary numeric,
  add column if not exists total_monthly_cost numeric;
