-- ============================================================
--  CLT (carteira assinada) + cadastro de Sócios (pró-labore)
--  Execute no SQL Editor do Supabase
--  Seguro: não apaga dados existentes
-- ============================================================

-- 1) Funcionários: novo campo "Possui carteira assinada (CLT)?"
--    Default true para não afetar funcionários já cadastrados.
alter table if exists employees
  add column if not exists is_clt        boolean default true,
  add column if not exists vacation_extra numeric;

-- 2) Cadastro de Sócios (pró-labore) — separado do módulo de Funcionários
create table if not exists partners (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  name          text not null,
  pro_labore    numeric default 0,
  inss_value    numeric default 0,
  net_value     numeric default 0
);

select 'Colunas/tabela criadas com sucesso!' as resultado;
