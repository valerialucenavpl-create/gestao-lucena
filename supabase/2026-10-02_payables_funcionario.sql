-- Vincula Contas a Pagar a um funcionário.
-- As baixas dessas contas aparecem na seção "Pagamentos" do painel do
-- funcionário, e contas de funcionário desativado somem de Contas a Pagar
-- (voltam se ele for reativado — nada é apagado).
alter table public.payables
  add column if not exists employee_id bigint references public.employees(id) on delete set null;

-- Data/forma da baixa de conta à vista (parceladas guardam isso em cada
-- parcela, dentro de installments).
alter table public.payables
  add column if not exists paid_date date,
  add column if not exists payment_method text;

create index if not exists payables_employee_id_idx on public.payables (employee_id);

-- Vínculo automático das contas de salário já cadastradas: liga quando o
-- Fornecedor bate com o primeiro nome de UM único funcionário ativo.
-- Casos ambíguos ficam sem vínculo — dá pra ligar pelo "Editar" da conta.
update public.payables p
set employee_id = m.employee_id
from (
  select p2.id as payable_id, min(e.id) as employee_id
  from public.payables p2
  join public.employees e
    on upper(split_part(trim(e.name), ' ', 1)) = upper(trim(p2.supplier))
   and coalesce(e.active, true)
  where p2.employee_id is null
    and p2.payable_category = 'FUNCIONARIO'
  group by p2.id
  having count(*) = 1
) m
where p.id = m.payable_id;
