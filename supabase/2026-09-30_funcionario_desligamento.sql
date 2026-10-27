-- Marcar funcionário como desligado sem apagar o histórico dele.
alter table public.employees
  add column if not exists active boolean not null default true,
  add column if not exists termination_date date;
