-- Tabela de agendamentos (medições, instalações, entregas, orçamentos, visitas)
-- Execute este script no Supabase SQL Editor
-- (Painel Supabase → SQL Editor → New query → cole e clique em Run)

create table if not exists agendamentos (
  id bigint generated always as identity primary key,
  client_name text not null,
  client_id text,
  phone text,
  seller_name text not null,
  segment text not null,          -- 'Vidro/Esquadria' | 'Mármore/Granito' | 'Portão'
  service_type text,              -- 'Medição' | 'Instalação' | 'Entrega' | 'Orçamento' | 'Visita'
  description text not null,
  scheduled_date date not null,
  scheduled_time time,
  address text,
  status text not null default 'Pendente', -- Pendente | Confirmado | Concluído | Cancelado
  created_at timestamptz not null default now()
);

alter table agendamentos enable row level security;

drop policy if exists "Allow authenticated select agendamentos" on agendamentos;
create policy "Allow authenticated select agendamentos"
on agendamentos for select
using (auth.uid() is not null);

drop policy if exists "Allow authenticated insert agendamentos" on agendamentos;
create policy "Allow authenticated insert agendamentos"
on agendamentos for insert
with check (auth.uid() is not null);

drop policy if exists "Allow authenticated update agendamentos" on agendamentos;
create policy "Allow authenticated update agendamentos"
on agendamentos for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "Allow authenticated delete agendamentos" on agendamentos;
create policy "Allow authenticated delete agendamentos"
on agendamentos for delete
using (auth.uid() is not null);
