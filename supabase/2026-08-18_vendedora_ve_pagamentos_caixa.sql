-- A vendedora precisa ver se o pagamento de uma venda dela já caiu (pra o
-- status "Concluindo"/"Aguardando" do card em Vendas bater igual pro Admin,
-- pro Financeiro e pra ela) — mas continua sem poder criar, editar ou
-- apagar lançamento de caixa, e continua sem acesso à tela "Caixa" (isso já
-- é bloqueado no front, em components/Sidebar.tsx).
--
-- Só troca a política de LEITURA da tabela cashflow. Insert/update/delete
-- continuam Admin+Finance (fin_criar/fin_editar/fin_apagar, inalteradas).

drop policy if exists "fin_ler" on public.cashflow;

create policy "fin_ler" on public.cashflow for select to authenticated
  using ( public.auth_role() in ('Admin','Finance','Sales') );
