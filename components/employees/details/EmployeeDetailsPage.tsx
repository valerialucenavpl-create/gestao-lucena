import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../services/supabase";
import ResumoTab from "./tabs/ResumoTab";
import JornadaTab from "./tabs/JornadaTab";
import PagamentoTab from "./tabs/PagamentoTab";
import FeriasTab from "./tabs/FeriasTab";
import FaltasTab from "./tabs/FaltasTab";
import UniformesTab from "./tabs/UniformesTab";

type Props = {
  id: string;
  currentUser: { role: string };
  setActiveView: (view: any) => void;
};

type EmployeeSummary = {
  id: number;
  name: string | null;
  role: string | null;
  base_salary: number | null;
  admission_date: string | null;
};

type TabKey = "resumo" | "jornada" | "pagamento" | "ferias" | "faltas" | "uniformes";

const initials = (name: string | null) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const EmployeeDetailsPage: React.FC<Props> = ({ id, currentUser, setActiveView }) => {
  const funcionarioId = Number(id);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("resumo");

  const isManager = currentUser.role === "Admin" || currentUser.role === "Finance";

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, base_salary, admission_date")
        .eq("id", funcionarioId)
        .single();
      if (error) console.error(error);
      setEmployee((data as EmployeeSummary) || null);
      setLoading(false);
    })();
  }, [funcionarioId]);

  const tabs = useMemo(
    () =>
      [
        { key: "resumo" as const, label: "Resumo" },
        { key: "jornada" as const, label: "Jornada" },
        isManager ? ({ key: "pagamento" as const, label: "Pagamento" }) : null,
        { key: "ferias" as const, label: "Férias" },
        { key: "faltas" as const, label: "Faltas & Atestados" },
        { key: "uniformes" as const, label: "Uniformes & EPIs" },
      ].filter(Boolean) as { key: TabKey; label: string }[],
    [isManager]
  );

  if (loading) {
    return <div className="bg-white p-6 rounded-xl shadow">Carregando...</div>;
  }

  if (!employee) {
    return (
      <div className="bg-white p-6 rounded-xl shadow">
        <p className="text-red-600">Funcionário não encontrado.</p>
        <button
          type="button"
          onClick={() => setActiveView("employees")}
          className="mt-3 text-primary-700 underline text-sm"
        >
          Voltar para Funcionários
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl shadow flex items-center gap-4">
        <button
          type="button"
          onClick={() => setActiveView("employees")}
          className="text-primary-700 hover:underline text-sm mr-2"
        >
          ← Voltar
        </button>
        <div className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold shrink-0">
          {initials(employee.name)}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{employee.name || "-"}</h2>
          <p className="text-sm text-gray-500">
            {employee.role || "-"}
            {isManager && employee.base_salary != null && (
              <>
                {" · "}
                R${" "}
                {Number(employee.base_salary).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex gap-3 flex-wrap border-b mb-6 pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-2 rounded-lg font-medium transition ${
                activeTab === t.key
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "resumo" && (
          <ResumoTab
            funcionarioId={funcionarioId}
            admissionDate={employee.admission_date}
            baseSalary={Number(employee.base_salary) || 0}
            isManager={isManager}
          />
        )}
        {activeTab === "jornada" && <JornadaTab funcionarioId={funcionarioId} />}
        {activeTab === "pagamento" && isManager && (
          <PagamentoTab funcionarioId={funcionarioId} baseSalary={Number(employee.base_salary) || 0} />
        )}
        {activeTab === "ferias" && (
          <FeriasTab funcionarioId={funcionarioId} admissionDate={employee.admission_date} />
        )}
        {activeTab === "faltas" && <FaltasTab funcionarioId={funcionarioId} />}
        {activeTab === "uniformes" && <UniformesTab funcionarioId={funcionarioId} />}
      </div>
    </div>
  );
};

export default EmployeeDetailsPage;
