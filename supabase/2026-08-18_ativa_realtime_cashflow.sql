-- Liga a transmissão em tempo real da tabela cashflow — sem isso, a tela
-- de detalhe de um orçamento aberta não reflete um pagamento registrado
-- em outra aba/computador.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cashflow'
  ) then
    alter publication supabase_realtime add table public.cashflow;
  end if;
end $$;
