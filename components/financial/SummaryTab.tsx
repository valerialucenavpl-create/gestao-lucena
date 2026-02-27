import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";

/* =======================
   TYPES
======================= */
type Employee = {
  id: number;
  name: string;
  base_salary: number | null;
  total_monthly_cost: number | null;
};

type FixedExpense = {
  id: number;
  value: number;
};

type VariableExpense = {
  id: number;
  type: string;
  value: number;
};

/* =======================
   HELPERS
======================= */
const formatBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

// fallback para funcionários antigos
const calcTotalMonthlyCost = (base: number) => {
  const inss_employer = base * 0.09;
  const fgts = base * 0.08;
  const fgts_fine_40 = fgts * 0.4;
  const thirteenth = base / 12;
  const vacation_extra = (base / 3) / 12;

  return (
    base +
    inss_employer +
    fgts +
    fgts_fine_40 +
    thirteenth +
    vacation_extra
  );
};

/* =======================
   COMPONENT
======================= */
const SummaryTab: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fixed, setFixed] = useState<FixedExpense[]>([]);
  const [variable, setVariable] = useState<VariableExpense[]>([]);
  const [loading, setLoading] = useState(true);

  /* =======================
     LOAD DATA
  ======================= */
  useEffect(() => {
    const load = async () => {
      const [empRes, fixRes, varRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, base_salary, total_monthly_cost"),

        supabase.from("fixed_expenses").select("id, value"),

        supabase.from("variable_expenses").select("id, type, value"),
      ]);

      setEmployees((empRes.data as Employee[]) ?? []);
      setFixed((fixRes.data as FixedExpense[]) ?? []);
      setVariable((varRes.data as VariableExpense[]) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  /* =======================
     CALCULATIONS
  ======================= */

  // ✅ FOLHA TOTAL = SOMA DO CUSTO TOTAL MENSAL
  const folhaTotal = useMemo(
    () =>
      employees.reduce((acc, e) => {
        const total =
          Number(e.total_monthly_cost || 0) > 0
            ? Number(e.total_monthly_cost)
            : calcTotalMonthlyCost(Number(e.base_salary || 0));

        return acc + total;
      }, 0),
    [employees]
  );

  const totalFixas = useMemo(
    () => fixed.reduce((acc, f) => acc + Number(f.value || 0), 0),
    [fixed]
  );

  const totalVariavelPercent = useMemo(
    () =>
      variable
        .filter((v) =>
          String(v.type || "").toLowerCase().includes("percent")
        )
        .reduce((acc, v) => acc + Number(v.value || 0), 0),
    [variable]
  );

  if (loading) return <p>Carregando resumo...</p>;

  /* =======================
     UI
  ======================= */
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Folha Total</p>
          <p className="text-xl font-bold">{formatBRL(folhaTotal)}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Despesas Fixas</p>
          <p className="text-xl font-bold">{formatBRL(totalFixas)}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Variáveis (%)</p>
          <p className="text-xl font-bold">
            {totalVariavelPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* RESUMO FUNCIONÁRIOS */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-3">
          Resumo Funcionários (Custo Total)
        </h3>

        {employees.length === 0 ? (
          <p className="text-gray-500">Nenhum funcionário cadastrado.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {employees.map((e) => {
              const total =
                Number(e.total_monthly_cost || 0) > 0
                  ? Number(e.total_monthly_cost)
                  : calcTotalMonthlyCost(Number(e.base_salary || 0));

              return (
                <li
                  key={e.id}
                  className="flex justify-between border-b pb-1"
                >
                  <span>{e.name}</span>
                  <span className="font-medium">
                    {formatBRL(total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SummaryTab;
