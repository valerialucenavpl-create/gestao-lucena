-- Data marcada pra próximo contato (lembrete de prospecção) — aparece no
-- Dashboard da vendedora responsável até essa data.
alter table public.quotes add column if not exists next_contact_date date;
