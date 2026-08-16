import React, { useEffect, useState } from "react";
import { supabase } from "../../../../services/supabase";
import { Icon } from "../../../icons/Icon";
import { formatMoneyInputBR } from "../../../../utils/money";

type Jornada = {
  horario_entrada: string | null;
  inicio_almoco: string | null;
  fim_almoco: string | null;
  horario_saida: string | null;
  trabalha_sabado: boolean;
  horario_sabado: string | null;
};

type Pagamento = {
  dia_pagamento: number | null;
  forma_pagamento: string | null;
};

type UniformeRow = { data: string; item: string | null; tipo: string };
type FaltaRow = { data: string; tipo: string };
type AdvertenciaRow = { data: string };
type ValeRow = { data: string; valor: number };
type HoraExtraRow = { data: string; valor_pago: number; quantidade_horas: number };

const addMonths = (dateStr: string, months: number) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d;
};
const formatBR = (d: Date) => d.toLocaleDateString("pt-BR");
const money = (v: number) => `R$ ${formatMoneyInputBR(v)}`;

const getCurrentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonthLabel = (monthStr: string) => {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

type TileColor = "blue" | "purple" | "amber" | "red" | "green" | "teal" | "gray";

const TILE_COLORS: Record<TileColor, { bg: string; text: string; iconBg: string; iconText: string }> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60",
    text: "text-blue-700/80 dark:text-blue-300/80",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconText: "text-blue-500 dark:text-blue-300",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60",
    text: "text-purple-700/80 dark:text-purple-300/80",
    iconBg: "bg-purple-100 dark:bg-purple-900/50",
    iconText: "text-purple-500 dark:text-purple-300",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60",
    text: "text-amber-700/80 dark:text-amber-300/80",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconText: "text-amber-500 dark:text-amber-300",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60",
    text: "text-red-700/80 dark:text-red-300/80",
    iconBg: "bg-red-100 dark:bg-red-900/50",
    iconText: "text-red-500 dark:text-red-300",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800/60",
    text: "text-green-700/80 dark:text-green-300/80",
    iconBg: "bg-green-100 dark:bg-green-900/50",
    iconText: "text-green-500 dark:text-green-300",
  },
  teal: {
    bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60",
    text: "text-teal-700/80 dark:text-teal-300/80",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
    iconText: "text-teal-500 dark:text-teal-300",
  },
  gray: {
    bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
    text: "text-gray-600 dark:text-gray-300",
    iconBg: "bg-gray-100 dark:bg-gray-700",
    iconText: "text-gray-500 dark:text-gray-300",
  },
};

const Tile: React.FC<{
  color: TileColor;
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}> = ({ color, label, value, subtitle, icon }) => {
  const c = TILE_COLORS[color];
  return (
    <div className={`${c.bg} border rounded-xl p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${c.text}`}>{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={`p-2.5 rounded-full ${c.iconBg} ${c.iconText} shrink-0`}>{icon}</div>
      </div>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate">{subtitle}</p>}
    </div>
  );
};

type Props = {
  funcionarioId: number;
  admissionDate: string | null;
  baseSalary: number;
  isManager: boolean;
};

const ResumoTab: React.FC<Props> = ({ funcionarioId, admissionDate, baseSalary, isManager }) => {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);

  const [faltasRows, setFaltasRows] = useState<FaltaRow[]>([]);
  const [advertenciasRows, setAdvertenciasRows] = useState<AdvertenciaRow[]>([]);
  const [uniformesRows, setUniformesRows] = useState<UniformeRow[]>([]);
  const [valesRows, setValesRows] = useState<ValeRow[]>([]);
  const [horasRows, setHorasRows] = useState<HoraExtraRow[]>([]);

  // Filtro de mês — por padrão mostra o total de todo o período; ao
  // desmarcar, restringe todos os cards de lançamentos ao mês escolhido.
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthStr());
  const [showAllPeriods, setShowAllPeriods] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const queries: any[] = [
        supabase.from("funcionario_jornada").select("*").eq("funcionario_id", funcionarioId).maybeSingle(),
        supabase.from("faltas").select("data, tipo").eq("funcionario_id", funcionarioId),
        supabase.from("advertencias").select("data").eq("funcionario_id", funcionarioId),
        supabase
          .from("uniformes_epis")
          .select("data, item, tipo")
          .eq("funcionario_id", funcionarioId)
          .order("data", { ascending: false }),
      ];

      if (isManager) {
        queries.push(
          supabase.from("funcionario_pagamento").select("*").eq("funcionario_id", funcionarioId).maybeSingle(),
          supabase.from("vales").select("valor, data").eq("funcionario_id", funcionarioId),
          supabase
            .from("horas_extras")
            .select("valor_pago, quantidade_horas, data")
            .eq("funcionario_id", funcionarioId)
        );
      }

      const results = await Promise.all(queries);
      if (cancelled) return;

      const [jornadaRes, faltasRes, advertenciasRes, uniformesRes, pagamentoRes, valesRes, horasRes] =
        results as any[];

      setJornada(jornadaRes?.data || null);
      setFaltasRows((faltasRes?.data || []) as FaltaRow[]);
      setAdvertenciasRows((advertenciasRes?.data || []) as AdvertenciaRow[]);
      setUniformesRows((uniformesRes?.data || []) as UniformeRow[]);

      if (isManager) {
        setPagamento(pagamentoRes?.data || null);
        setValesRows((valesRes?.data || []) as ValeRow[]);
        setHorasRows((horasRes?.data || []) as HoraExtraRow[]);
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [funcionarioId, isManager]);

  // Mesma regra de negócio da aba Férias (período concessivo = admissão + 24 meses).
  let feriasStatus: { label: string; color: TileColor; subtitle: string } | null = null;
  if (admissionDate) {
    const concessivoFim = addMonths(admissionDate, 24);
    const diasParaVencer = Math.ceil((concessivoFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diasParaVencer < 0) {
      feriasStatus = { label: "Vencido", color: "red", subtitle: `Prazo era ${formatBR(concessivoFim)}` };
    } else if (diasParaVencer < 60) {
      feriasStatus = {
        label: `Vence em ${diasParaVencer} dias`,
        color: "amber",
        subtitle: `Prazo: ${formatBR(concessivoFim)}`,
      };
    } else {
      feriasStatus = { label: "Em dia", color: "green", subtitle: `Prazo: ${formatBR(concessivoFim)}` };
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Carregando resumo...</p>;

  const scopeLabel = showAllPeriods ? "todo o período" : formatMonthLabel(filterMonth);
  const inScope = (data: string) => showAllPeriods || String(data).slice(0, 7) === filterMonth;

  const faltasScoped = faltasRows.filter((r) => inScope(r.data));
  const faltasJustificadas = faltasScoped.filter((r) => r.tipo === "Justificada").length;
  const faltasInjustificadas = faltasScoped.filter((r) => r.tipo === "Injustificada").length;
  const advertenciasCount = advertenciasRows.filter((r) => inScope(r.data)).length;

  const uniformesScoped = uniformesRows.filter((r) => inScope(r.data));
  const ultimoUniforme = uniformesScoped[0] || null;

  const valesScoped = valesRows.filter((r) => inScope(r.data));
  const valesTotal = valesScoped.reduce((s, r) => s + (Number(r.valor) || 0), 0);

  const horasScoped = horasRows.filter((r) => inScope(r.data));
  const horasExtrasTotal = horasScoped.reduce((s, r) => s + (Number(r.valor_pago) || 0), 0);
  const horasExtrasQtd = horasScoped.reduce((s, r) => s + (Number(r.quantidade_horas) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Filtro de mês */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Mês</label>
          <input
            type="month"
            disabled={showAllPeriods}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value || getCurrentMonthStr())}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-700"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pb-2.5">
          <input
            type="checkbox"
            checked={showAllPeriods}
            onChange={(e) => setShowAllPeriods(e.target.checked)}
          />
          Ver todo o período
        </label>
        <span className="text-xs text-gray-400 dark:text-gray-500 pb-2.5 capitalize">
          Mostrando: {scopeLabel}
        </span>
      </div>

      {feriasStatus && feriasStatus.color !== "green" && (
        <div
          className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
            feriasStatus.color === "red"
              ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300"
              : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300"
          }`}
        >
          <Icon className="w-5 h-5 shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </Icon>
          <p className="text-sm font-semibold">
            {feriasStatus.color === "red" ? "Férias vencidas" : "Férias vencendo"} —{" "}
            {feriasStatus.label.toLowerCase()}. Risco de férias em dobro.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          color="blue"
          label="Jornada"
          value={
            jornada?.horario_entrada && jornada?.horario_saida
              ? `${jornada.horario_entrada} – ${jornada.horario_saida}`
              : "Não configurada"
          }
          subtitle={
            jornada?.inicio_almoco
              ? `Almoço ${jornada.inicio_almoco}–${jornada.fim_almoco}${
                  jornada.trabalha_sabado ? ` · sábado ${jornada.horario_sabado || ""}` : ""
                }`
              : undefined
          }
          icon={
            <Icon className="w-5 h-5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </Icon>
          }
        />

        <Tile
          color={feriasStatus?.color || "purple"}
          label="Férias"
          value={feriasStatus?.label || "Sem data de admissão"}
          subtitle={feriasStatus?.subtitle}
          icon={
            <Icon className="w-5 h-5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </Icon>
          }
        />

        <Tile
          color={faltasInjustificadas > 0 ? "amber" : "gray"}
          label="Faltas"
          value={`${faltasJustificadas + faltasInjustificadas} no total`}
          subtitle={`${faltasJustificadas} justificadas · ${faltasInjustificadas} injustificadas · ${advertenciasCount} advertência${
            advertenciasCount === 1 ? "" : "s"
          }`}
          icon={
            <Icon className="w-5 h-5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </Icon>
          }
        />

        <Tile
          color="teal"
          label="Uniformes & EPIs"
          value={`${uniformesScoped.length} entrega${uniformesScoped.length === 1 ? "" : "s"}`}
          subtitle={
            ultimoUniforme
              ? `Última: ${ultimoUniforme.item || ultimoUniforme.tipo} em ${formatBR(
                  new Date(ultimoUniforme.data + "T00:00:00")
                )}`
              : undefined
          }
          icon={
            <Icon className="w-5 h-5">
              <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
            </Icon>
          }
        />

        {isManager && (
          <>
            <Tile
              color="green"
              label="Salário & pagamento"
              value={money(baseSalary)}
              subtitle={
                pagamento?.dia_pagamento
                  ? `Dia ${pagamento.dia_pagamento} · ${pagamento.forma_pagamento || ""}`
                  : "Dados de pagamento não configurados"
              }
              icon={
                <Icon className="w-5 h-5">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </Icon>
              }
            />
            <Tile
              color="amber"
              label="Vales"
              value={money(valesTotal)}
              subtitle={`${valesScoped.length} lançamento${valesScoped.length === 1 ? "" : "s"}`}
              icon={
                <Icon className="w-5 h-5">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </Icon>
              }
            />
            <Tile
              color="purple"
              label="Horas extras"
              value={money(horasExtrasTotal)}
              subtitle={`${horasExtrasQtd}h lançadas`}
              icon={
                <Icon className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </Icon>
              }
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ResumoTab;
