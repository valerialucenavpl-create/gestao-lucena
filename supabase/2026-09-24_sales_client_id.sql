alter table public.sales add column if not exists client_id bigint references public.clients(id);
