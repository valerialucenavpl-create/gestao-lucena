import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";

type BillingSettings = {
  id: string;
  monthly_revenue_target: number | null;
  work_days: number | null;
  hours_per_day: number | null;
  variable_percent: number | null;
  min_profit_percent: number | null;
};

const parseBR = (v: string) =>
  Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;

const formatBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MarkupFaturamentoTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);

  // campos
  const [monthlyRevenue, setMonthlyRevenue] = useState("120.000,00");
  const [workDays, setWorkDays] = useState("22");
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [variablePercent, setVariablePercent] = useState("18");
  const [minProfitPercent, setMinProfitPercent] = useState("20");

  // custos fixos totais (funcionários + fixas)
  const [employeesTotal, setEmployeesTotal] = useState(0);
  const [fixedManualTotal, setFixedManualTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1) carrega config (1 linha)
      const { data: settings } = await supabase
        .from("billing_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);

      const s = (settings?.[0] as BillingSettings) || null;
      if (s) {
        setRowId(s.id);
        if (s.monthly_revenue_target != null)
          setMonthlyRevenue(
            Number(s.monthly_revenue_target).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          );
        if (s.work_days != null) setWorkDays(String(s.work_days));
        if (s.hours_per_day != null) setHoursPerDay(String(s.hours_per_day));
        if (s.variable_percent != null) setVariablePercent(String(s.variable_percent));
        if (s.min_profit_percent != null) setMinProfitPercent(String(s.min_profit_percent));
      }

      // 2) soma funcionários (custo total)
      const emp = await supabase.from("employees").select("total_monthly_cost");
      const empTotal = (emp.data ?? []).reduce(
        (sum: number, e: any) => sum + Number(e.total_monthly_cost || 0),
        0
      );
      setEmployeesTotal(empTotal);

      // 3) soma despesas fixas manuais
      const fix = await supabase.from("fixed_expenses").select("value");
      const fixTotal = (fix.data ?? []).reduce(
        (sum: number, f: any) => sum + Number(f.value || 0),
        0
      );
      setFixedManualTotal(fixTotal);

      setLoading(false);
    };

    load();
  }, []);

  const monthlyRevenueNum = useMemo(() => parseBR(monthlyRevenue), [monthlyRevenue]);
  const workDaysNum = useMemo(() => Number(workDays) || 0, [workDays]);
  const hoursPerDayNum = useMemo(() => Number(hoursPerDay) || 0, [hoursPerDay]);
  const variablePct = useMemo(() => Number(variablePercent) || 0, [variablePercent]);
  const minProfitPct = useMemo(() => Number(minProfitPercent) || 0, [minProfitPercent]);

  const fixedTotal = useMemo(
    () => employeesTotal + fixedManualTotal,
    [employeesTotal, fixedManualTotal]
  );

  const fixedPercent = useMemo(() => {
    if (monthlyRevenueNum <= 0) return 0;
    return (fixedTotal / monthlyRevenueNum) * 100;
  }, [fixedTotal, monthlyRevenueNum]);

  const hoursMonth = useMemo(() => workDaysNum * hoursPerDayNum, [workDaysNum, hoursPerDayNum]);
  const fixedPerDay = useMemo(() => (workDaysNum > 0 ? fixedTotal / workDaysNum : 0), [fixedTotal, workDaysNum]);
  const fixedPerHour = useMemo(() => (hoursMonth > 0 ? fixedTotal / hoursMonth : 0), [fixedTotal, hoursMonth]);

  const suggestedMarkupFactor = useMemo(() => {
    const totalPct = (fixedPercent + variablePct + minProfitPct) / 100;
    if (totalPct >= 0.95) return 0; // trava
    return 1 / (1 - totalPct);
  }, [fixedPercent, variablePct, minProfitPct]);

  const save = async () => {
    setSaving(true);

    const payload = {
      monthly_revenue_target: monthlyRevenueNum,
      work_days: workDaysNum,
      hours_per_day: hoursPerDayNum,
      variable_percent: variablePct,
      min_profit_percent: minProfitPct,
      updated_at: new Date().toISOString(),
    };

    const res = rowId
      ? await supabase.from("billing_settings").update(payload).eq("id", rowId)
      : await supabase.from("billing_settings").insert([{ ...payload }]).select("id").single();

    if (res.error) {
      console.error(res.error);
      alert(`Erro ao salvar: ${res.error.message}`);
      setSaving(false);
      return;
    }

    // se inseriu agora, pega id
    // @ts-ignore
    const newId = (res.data?.id as string) || rowId;
    if (newId) setRowId(newId);

    alert("Configuração salva!");
    setSaving(false);
  };

  if (loading) return <p>Carregando configuração...</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      <h3 className="text-lg font-semibold">Markup / Faturamento</h3>

      {/* FATURAMENTO */}
      <div className="border rounded-xl p-4 space-y-4">
        <h4 className="font-semibold">Faturamento mensal</h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold">Faturamento mensal desejado (R$)</label>
            <input
              className="w-full p-2 border rounded"
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
              placeholder="120.000,00"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Dias úteis</label>
            <input
              className="w-full p-2 border rounded"
              value={workDays}
              onChange={(e) => setWorkDays(e.target.value)}
              placeholder="22"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Horas por dia</label>
            <input
              className="w-full p-2 border rounded"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
              placeholder="8"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      {/* PARÂMETROS */}
      <div className="border rounded-xl p-4 space-y-4">
        <h4 className="font-semibold">Parâmetros do markup</h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold">Variáveis (%)</label>
            <input
              className="w-full p-2 border rounded"
              value={variablePercent}
              onChange={(e) => setVariablePercent(e.target.value)}
              placeholder="18"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Margem mínima (%)</label>
            <input
              className="w-full p-2 border rounded"
              value={minProfitPercent}
              onChange={(e) => setMinProfitPercent(e.target.value)}
              placeholder="20"
              inputMode="numeric"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>

      {/* PREVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="text-sm text-gray-600">Custos fixos totais</p>
          <p className="font-bold">{formatBRL(fixedTotal)}</p>
          <p className="text-xs text-gray-500">Funcionários + Fixas</p>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="text-sm text-gray-600">Fixos (%)</p>
          <p className="font-bold">{fixedPercent.toFixed(2)}%</p>
          <p className="text-xs text-gray-500">Fixos / faturamento</p>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="text-sm text-gray-600">Fixo por dia</p>
          <p className="font-bold">{formatBRL(fixedPerDay)}</p>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="text-sm text-gray-600">Fixo por hora</p>
          <p className="font-bold">{formatBRL(fixedPerHour)}</p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
        <p className="font-semibold text-blue-900">Preview do Markup mínimo (fator)</p>
        <p className="text-2xl font-bold text-blue-900">
          {suggestedMarkupFactor > 0 ? suggestedMarkupFactor.toFixed(4) : "-"}
        </p>
        <p className="text-xs text-blue-700">
          Usando: Fixos% + Variáveis% + Margem mínima. (A margem real do produto pode ser diferente)
        </p>
      </div>
    </div>
  );
};

export default MarkupFaturamentoTab;
