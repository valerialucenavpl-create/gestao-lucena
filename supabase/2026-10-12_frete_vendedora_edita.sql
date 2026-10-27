-- Vendedoras (Sales) passam a cadastrar e editar locais de frete.
-- Excluir continua só Admin.
drop policy if exists "cad_criar" on public.freight_rates;
drop policy if exists "cad_editar" on public.freight_rates;

create policy "cad_criar" on public.freight_rates for insert to authenticated
  with check ( public.auth_role() in ('Admin','Sales') );

create policy "cad_editar" on public.freight_rates for update to authenticated
  using      ( public.auth_role() in ('Admin','Sales') )
  with check ( public.auth_role() in ('Admin','Sales') );
