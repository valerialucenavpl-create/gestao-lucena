-- Módulo "Detalhamento do Funcionário": jornada, pagamento (vales/horas
-- extras), férias, faltas/atestados/advertências e uniformes/EPIs.
-- Períodos aquisitivo/concessivo de férias NÃO são guardados aqui — são
-- calculados no front a partir de employees.admission_date (já existe).

create table if not exists public.funcionario_jornada (
  funcionario_id bigint primary key references public.employees(id) on delete cascade,
  horario_entrada text,
  inicio_almoco text,
  fim_almoco text,
  horario_saida text,
  trabalha_sabado boolean not null default false,
  horario_sabado text,
  updated_at timestamptz not null default now()
);

create table if not exists public.funcionario_pagamento (
  funcionario_id bigint primary key references public.employees(id) on delete cascade,
  dia_pagamento int,
  forma_pagamento text,
  banco text,
  chave_pix text,
  agencia text,
  conta text,
  updated_at timestamptz not null default now()
);

create table if not exists public.vales (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.employees(id) on delete cascade,
  data date not null,
  valor numeric not null default 0,
  descricao text,
  mes_referencia text,
  created_at timestamptz not null default now()
);

create table if not exists public.horas_extras (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.employees(id) on delete cascade,
  data date not null,
  quantidade_horas numeric not null default 0,
  valor_pago numeric not null default 0,
  mes_referencia text,
  created_at timestamptz not null default now()
);

create table if not exists public.funcionario_ferias (
  funcionario_id bigint primary key references public.employees(id) on delete cascade,
  data_prevista date,
  dias_ferias int not null default 30,
  abono_pecuniario boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.faltas (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.employees(id) on delete cascade,
  data date not null,
  tipo text not null default 'Justificada' check (tipo in ('Justificada', 'Injustificada')),
  observacao text,
  anexo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.advertencias (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.employees(id) on delete cascade,
  data date not null,
  motivo text,
  anexo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.uniformes_epis (
  id bigint generated always as identity primary key,
  funcionario_id bigint not null references public.employees(id) on delete cascade,
  data date not null,
  item text,
  tipo text not null default 'Uniforme' check (tipo in ('Uniforme', 'EPI')),
  tamanho text,
  recebimento_confirmado boolean not null default false,
  anexo_url text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- RLS — mesma regra do restante do financeiro (Admin + Finance leem/escrevem,
-- só Admin apaga, Vendedora não enxerga nada), igual ao bloco fin_* que já
-- cobre a própria tabela employees em 2026-07-30_rls_por_papel.sql.
-- =============================================================================

alter table public.funcionario_jornada enable row level security;
alter table public.funcionario_pagamento enable row level security;
alter table public.vales enable row level security;
alter table public.horas_extras enable row level security;
alter table public.funcionario_ferias enable row level security;
alter table public.faltas enable row level security;
alter table public.advertencias enable row level security;
alter table public.uniformes_epis enable row level security;

do $$
declare
  t text;
  tabelas text[] := array[
    'funcionario_jornada', 'funcionario_pagamento', 'vales', 'horas_extras',
    'funcionario_ferias', 'faltas', 'advertencias', 'uniformes_epis'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop policy if exists "fin_ler" on public.%I;', t);
    execute format('drop policy if exists "fin_criar" on public.%I;', t);
    execute format('drop policy if exists "fin_editar" on public.%I;', t);
    execute format('drop policy if exists "fin_apagar" on public.%I;', t);

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
