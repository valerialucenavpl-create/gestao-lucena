-- Liga a transmissão em tempo real (Realtime) das tabelas quotes e sales.
-- Sem isso, o app pode "escutar" mudanças à vontade que nunca chega nada -
-- o Supabase só transmite tabelas explicitamente adicionadas a essa
-- publicação. Idempotente: pode rodar de novo sem erro se já estiver ligado.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quotes'
  ) then
    alter publication supabase_realtime add table public.quotes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;
