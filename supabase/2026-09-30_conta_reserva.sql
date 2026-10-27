-- Conta reserva + ajuste de data de corte.
alter table public.bank_accounts
  add column if not exists account_type text not null default 'movimento'
    check (account_type in ('movimento', 'reserva'));

insert into public.bank_accounts (name, initial_balance, initial_balance_date, active, account_type)
values ('Mercado Pago – Reserva', 0, '2026-09-30', true, 'reserva')
on conflict (name) do nothing;

-- Data de corte das 6 contas (não mexe no saldo inicial — a Valéria vai
-- digitar cada um em Configurações).
update public.bank_accounts set initial_balance_date = '2026-09-30';
