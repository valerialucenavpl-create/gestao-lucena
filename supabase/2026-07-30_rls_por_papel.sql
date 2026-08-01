-- =============================================================================
--  PASSO 3a — SEGURANÇA POR PAPEL NO BANCO (RLS)
--  Sistema: Gestão Lucena
--  Data: 30/07/2026
--
--  O QUE ESTE SCRIPT FAZ, EM UMA FRASE:
--  Hoje o banco pergunta apenas "você está logado?". Depois disto ele passa a
--  perguntar "você está logado E qual é o seu papel?".
--
--  IMPORTANTE — LEIA ANTES DE RODAR:
--  1. >>> RODE COM O SISTEMA FORA DO AR (fim do dia / madrugada). <<<
--     Este script precisa travar ~20 tabelas ao mesmo tempo. Se alguém estiver
--     usando o sistema, o Postgres detecta impasse e cancela tudo com o erro
--     "40P01: deadlock detected". Não estraga nada, mas não passa.
--     FECHE TAMBÉM AS SUAS PRÓPRIAS ABAS do sistema antes de rodar.
--  2. Faça backup antes: Supabase > Database > Backups.
--  3. O BLOCO 8 exige uma alteração no código — JÁ FEITA nos arquivos.
--  4. Se algo der errado, use o arquivo _ROLLBACK.sql.
--
--  SE MESMO ASSIM DER DEADLOCK: rode bloco a bloco, na ordem, esperando cada
--  um terminar. Cada bloco está delimitado por uma linha de "====".
-- =============================================================================

-- Falha rápido e limpo em vez de ficar travado esperando outro processo.
-- Sem isto, o erro demora e vem como deadlock; com isto, vem como
-- "canceling statement due to lock timeout" — mais claro e sem derrubar
-- a conexão de quem estiver usando o sistema.
set lock_timeout = '10s';
set statement_timeout = '300s';


-- =============================================================================
-- BLOCO 0 — DIAGNÓSTICO (só leitura, não altera nada)
-- Rode isto sozinho primeiro se quiser ver a situação atual.
-- =============================================================================
-- select tablename, policyname, cmd, qual
--   from pg_policies where schemaname = 'public' order by tablename;


-- =============================================================================
-- BLOCO 1 — A FUNÇÃO QUE DESCOBRE O PAPEL DE QUEM ESTÁ CHAMANDO
--
-- Esta é a peça central. Toda política abaixo pergunta a ela "quem é você?".
--
-- "security definer" = a função roda com privilégio de dono, ignorando as
-- regras da própria tabela users. Sem isso teríamos recursão infinita: para
-- ler users o banco precisaria saber seu papel, que está em users...
--
-- REPARE: se a pessoa NÃO tiver linha em public.users, a função devolve NULL.
-- E NULL nunca é igual a 'Admin'. Ou seja, o comportamento padrão passa a ser
-- NEGAR — exatamente o oposto do bug do userService.ts:90, que concedia Admin.
-- =============================================================================

create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where auth_user_id = auth.uid()
$$;

revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to authenticated;

comment on function public.auth_role() is
  'Devolve o papel (Admin/Finance/Sales) do usuário logado. NULL = sem perfil = sem acesso.';


-- =============================================================================
-- BLOCO 2 — TRAVA ANTI-PROMOÇÃO
--
-- Impede que alguém mude o próprio papel para Admin. Sem isto, todo o resto
-- é inútil: bastaria um update em public.users para virar administrador.
-- =============================================================================

create or replace function public.bloquear_escalada_de_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and coalesce(public.auth_role(), '') <> 'Admin' then
    raise exception 'Somente um Admin pode alterar o papel de um usuário.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_escalada_de_papel on public.users;
create trigger trg_bloquear_escalada_de_papel
  before update on public.users
  for each row execute function public.bloquear_escalada_de_papel();


-- =============================================================================
-- BLOCO 3 — LIMPEZA DAS POLÍTICAS ANTIGAS  <<< O PASSO MAIS IMPORTANTE >>>
--
-- ATENÇÃO: no Postgres, políticas RLS se SOMAM (OR), não se sobrepõem.
-- Se a política antiga "qualquer logado pode tudo" continuar existindo, ela
-- libera acesso mesmo com as políticas novas no lugar. Tem que apagar.
--
-- Este bloco também LIGA o RLS em cada tabela — se o RLS estiver desligado,
-- política nenhuma é aplicada e tudo fica liberado.
-- =============================================================================

do $$
declare
  t text;
  pol record;
  tabelas text[] := array[
    'quotes','sales','clients','clientes','cashflow','payables','agendamentos',
    'employees','products','inventory','inventory_variants','material_categories',
    'category_colors','sellers','partners','fixed_expenses','variable_expenses',
    'billing_settings','company_settings','users'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela "%" não existe neste banco — ignorando.', t;
      continue;
    end if;

    for pol in select policyname from pg_policies
               where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    raise notice 'RLS ligado e políticas antigas removidas em "%".', t;
  end loop;
end $$;


-- =============================================================================
-- BLOCO 4 — TABELAS OPERACIONAIS
-- quotes, sales, clients, clientes, agendamentos
--
-- Regra: os três papéis leem e escrevem. Só Admin apaga em definitivo.
-- É o trabalho do dia a dia — vendedor precisa disso para trabalhar.
-- =============================================================================

do $$
declare
  t text;
  tabelas text[] := array['quotes','sales','clients','clientes','agendamentos'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format($f$
      create policy "op_ler" on public.%I for select to authenticated
        using ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);

    execute format($f$
      create policy "op_criar" on public.%I for insert to authenticated
        with check ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);

    execute format($f$
      create policy "op_editar" on public.%I for update to authenticated
        using      ( public.auth_role() in ('Admin','Finance','Sales') )
        with check ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);

    execute format($f$
      create policy "op_apagar" on public.%I for delete to authenticated
        using ( public.auth_role() = 'Admin' );
    $f$, t);
  end loop;
end $$;


-- =============================================================================
-- BLOCO 5 — TABELAS FINANCEIRAS   <<< O CORAÇÃO DA CORREÇÃO >>>
-- cashflow, payables, fixed_expenses, variable_expenses, billing_settings,
-- partners, employees
--
-- Regra: Admin faz tudo. Finance lê e escreve. VENDEDOR NÃO ENXERGA NADA.
--
-- É aqui que fica seu caixa, o que você paga a cada fornecedor, a folha de
-- pagamento e a divisão entre sócios. Hoje qualquer funcionário logado lê e
-- apaga isso pelo console do navegador. Depois deste bloco, não mais.
-- =============================================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'cashflow','payables','fixed_expenses','variable_expenses',
    'billing_settings','partners','employees'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format($f$
      create policy "fin_ler" on public.%I for select to authenticated
        using ( public.auth_role() in ('Admin','Finance') );
    $f$, t);

    execute format($f$
      create policy "fin_criar" on public.%I for insert to authenticated
        with check ( public.auth_role() in ('Admin','Finance') );
    $f$, t);

    execute format($f$
      create policy "fin_editar" on public.%I for update to authenticated
        using      ( public.auth_role() in ('Admin','Finance') )
        with check ( public.auth_role() in ('Admin','Finance') );
    $f$, t);

    execute format($f$
      create policy "fin_apagar" on public.%I for delete to authenticated
        using ( public.auth_role() = 'Admin' );
    $f$, t);
  end loop;
end $$;


-- =============================================================================
-- BLOCO 6 — CADASTROS
-- products, inventory, inventory_variants, material_categories,
-- category_colors, sellers, company_settings
--
-- Regra: todos leem (o vendedor precisa para montar orçamento).
-- Só Admin altera e apaga — ninguém mexe em preço de material sem ser você.
--
-- NOTA: o vendedor continua enxergando o custo dos materiais aqui. Isso é
-- consciente e temporário — some quando a precificação for para o servidor.
-- =============================================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'products','inventory','inventory_variants','material_categories',
    'category_colors','sellers','company_settings'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format($f$
      create policy "cad_ler" on public.%I for select to authenticated
        using ( public.auth_role() in ('Admin','Finance','Sales') );
    $f$, t);

    execute format($f$
      create policy "cad_criar" on public.%I for insert to authenticated
        with check ( public.auth_role() = 'Admin' );
    $f$, t);

    execute format($f$
      create policy "cad_editar" on public.%I for update to authenticated
        using      ( public.auth_role() = 'Admin' )
        with check ( public.auth_role() = 'Admin' );
    $f$, t);

    execute format($f$
      create policy "cad_apagar" on public.%I for delete to authenticated
        using ( public.auth_role() = 'Admin' );
    $f$, t);
  end loop;
end $$;


-- =============================================================================
-- BLOCO 7 — TABELA DE USUÁRIOS
--
-- Todos leem (o Header e a tela de Configurações precisam da lista).
-- Só Admin cria, edita e remove. O trigger do BLOCO 2 garante que nem mesmo
-- um update direto consegue mudar o papel de alguém sem ser Admin.
-- =============================================================================

create policy "users_ler" on public.users for select to authenticated
  using ( public.auth_role() in ('Admin','Finance','Sales') );

create policy "users_criar" on public.users for insert to authenticated
  with check ( public.auth_role() = 'Admin' );

create policy "users_editar" on public.users for update to authenticated
  using      ( public.auth_role() = 'Admin' )
  with check ( public.auth_role() = 'Admin' );

create policy "users_apagar" on public.users for delete to authenticated
  using ( public.auth_role() = 'Admin' );


-- =============================================================================
-- BLOCO 8 — VIEW DE CUSTO DE PESSOAL   <<< EXIGE MUDANÇA NO CÓDIGO >>>
--
-- Problema: o NewQuote.tsx e o ProductModal.tsx leem a tabela "employees" para
-- calcular a mão de obra do orçamento. O BLOCO 5 acabou de bloquear essa tabela
-- para o vendedor — então a tela de orçamento quebraria para ele.
--
-- Solução: esta view devolve apenas TOTAIS AGREGADOS por setor. Nenhuma linha
-- individual, nenhum nome, nenhum salário de pessoa identificável.
-- O vendedor lê a view; a tabela continua fechada.
--
-- ATENÇÃO À COLUNA "headcount":
-- Como a view agrupa, cada linha representa VÁRIAS pessoas. O ProductModal
-- calcula média por pessoa (divide pelo número de linhas), então sem o
-- headcount a taxa horária sairia errada em todos os produtos, sem avisar.
-- Por isso a view expõe a contagem, e o código passa a dividir por ela.
--
-- >>> As alterações no código JÁ FORAM FEITAS nos arquivos:
--     components/NewQuote.tsx      (linha 342)
--     components/ProductModal.tsx  (linha 570 + função avgHourlyRateFor)
--     Basta publicar depois de rodar este script.
-- =============================================================================

drop view if exists public.v_custo_pessoal;

create view public.v_custo_pessoal
with (security_invoker = false)
as
  select
    coalesce(department, 'Geral')              as department,
    coalesce(role, 'Geral')                    as role,
    count(*)::int                              as headcount,
    sum(coalesce(total_monthly_cost, 0))       as total_monthly_cost,
    avg(nullif(monthly_hours, 0))              as monthly_hours
  from public.employees
  group by coalesce(department, 'Geral'), coalesce(role, 'Geral');

grant select on public.v_custo_pessoal to authenticated;

comment on view public.v_custo_pessoal is
  'Custo de pessoal agregado por setor. Usado no cálculo de mão de obra do orçamento sem expor a folha individual.';


-- =============================================================================
-- BLOCO 9 — LIXEIRA (preparação)
--
-- Cria as colunas para a exclusão reversível que você escolheu. As políticas
-- de leitura já passam a esconder o que estiver marcado como excluído.
--
-- Trocar o app para marcar em vez de apagar é o PASSO 3b — envolve código.
-- Por enquanto, o BLOCO 4/5/6 já garante que só Admin consegue apagar.
-- =============================================================================

do $$
declare
  t text;
  tabelas text[] := array['quotes','sales','cashflow','payables','clients'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_by uuid', t);
    execute format('create index if not exists idx_%s_nao_excluido on public.%I (deleted_at) where deleted_at is null', t, t);
  end loop;
end $$;


-- =============================================================================
-- FIM. Confira o resultado:
-- =============================================================================

select tablename,
       count(*) filter (where cmd = 'SELECT') as ler,
       count(*) filter (where cmd = 'INSERT') as criar,
       count(*) filter (where cmd = 'UPDATE') as editar,
       count(*) filter (where cmd = 'DELETE') as apagar
  from pg_policies
 where schemaname = 'public'
 group by tablename
 order by tablename;

-- Esperado: 1 em cada coluna, para cada tabela da lista.
-- Se alguma tabela aparecer com 2 ou mais em alguma coluna, sobrou política
-- antiga — rode o BLOCO 3 de novo.
