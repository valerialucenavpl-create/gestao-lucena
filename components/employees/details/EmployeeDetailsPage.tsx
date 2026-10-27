import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../services/supabase";
import ResumoTab from "./tabs/ResumoTab";
import JornadaTab from "./tabs/JornadaTab";
import PagamentoTab from "./tabs/PagamentoTab";
import FeriasTab from "./tabs/FeriasTab";
import FaltasTab from "./tabs/FaltasTab";
import UniformesTab from "./tabs/UniformesTab";
import DateInputModal from "../../common/DateInputModal";

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
  active: boolean;
  termination_date: string | null;
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
        .select("id, name, role, base_salary, admission_date, active, termination_date")
        .eq("id", funcionarioId)
        .single();
      if (error) console.error(error);
      setEmployee((data as EmployeeSummary) || null);
      setLoading(false);
    })();
  }, [funcionarioId]);

  const [togglingActive, setTogglingActive] = useState(false);
  const [showTerminationModal, setShowTerminationModal] = useState(false);

  const handleConfirmTermination = async (terminationDate: string) => {
    if (!employee) return;
    if (!window.confirm(`Desativar ${employee.name}? Ele some das listas ativas e as contas vinculadas a ele saem de Contas a Pagar, mas o histórico continua guardado.`)) return;
    setTogglingActive(true);
    const { error } = await supabase
      .from("employees")
      .update({ active: false, termination_date: terminationDate })
      .eq("id", funcionarioId);
    setTogglingActive(false);
    if (error) return alert("Não foi possível desativar: " + error.message);
    setEmployee({ ...employee, active: false, termination_date: terminationDate });
  };

  const handleToggleActive = async () => {
    if (!employee) return;
    if (employee.active) {
      setShowTerminationModal(true);
      return;
    }
    if (!window.confirm(`Reativar ${employee.name}?`)) return;
    setTogglingActive(true);
    const { error } = await supabase
      .from("employees")
      .update({ active: true, termination_date: null })
      .eq("id", funcionarioId);
    setTogglingActive(false);
    if (error) return alert("Não foi possível reativar: " + error.message);
    setEmployee({ ...employee, active: true, termination_date: null });
  };

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
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {employee.name || "-"}
            {!employee.active && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 uppercase">
                Desativado{employee.termination_date ? ` em ${new Date(employee.termination_date + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
              </span>
            )}
          </h2>
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
        {isManager && (
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={togglingActive}
            className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${
              employee.active
                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            {togglingActive ? "Salvando..." : employee.active ? "Desativar" : "Reativar"}
          </button>
        )}
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

      {showTerminationModal && (
        <DateInputModal
          title="Data de desligamento"
          defaultValue={new Date().toISOString().slice(0, 10)}
          confirmLabel="Desativar"
          onConfirm={(date) => {
            setShowTerminationModal(false);
            handleConfirmTermination(date);
          }}
          onCancel={() => setShowTerminationModal(false)}
        />
      )}
    </div>
  );
};

export default EmployeeDetailsPage;
