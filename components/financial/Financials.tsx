// src/components/financial/Financial.tsx
import React, { useMemo, useState } from "react";

import SummaryTab from "./SummaryTab";
import FixedExpensesCards from "./FixedExpensesCards";
import VariableExpensesCards from "./VariableExpensesCards";
import MarkupFaturamentoTab from "./MarkupFaturamentoTab"; // ✅ NOVO
import PartnersTab from "./PartnersTab";
import FreightConfigTab from "./FreightConfigTab";
import EmployeesList from "../employees/EmployeesList";

type TabKey = "summary" | "employees" | "fixed" | "variable" | "markup" | "partners" | "freight_config";

interface FinancialProps {
  onVariableExpensesChange?: (expenses: { id: number; name: string; type: string; value: number }[]) => void;
  // Usado pela aba Funcionários (abrir detalhes / editar / novo funcionário).
  setActiveView?: (view: any) => void;
  initialTab?: TabKey;
}

const Financial: React.FC<FinancialProps> = ({ onVariableExpensesChange, setActiveView, initialTab }) => {
  const tabs = useMemo(
    () => [
      { key: "summary" as const, label: "Resumo" },
      { key: "employees" as const, label: "Funcionários" },
      { key: "fixed" as const, label: "Despesas Fixas" },
      { key: "variable" as const, label: "Despesas Variáveis" },
      { key: "partners" as const, label: "Sócios (Pró-labore)" },
      { key: "markup" as const, label: "MARKUP / FATURAMENTO" }, // ✅ NOVO
      { key: "freight_config" as const, label: "Frete (Configuração)" },
    ],
    []
  );

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? "summary");

  return (
    <div className="space-y-6">
      {/* BOTÕES */}
      <div className="flex gap-3 flex-wrap">
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

      {/* CONTEÚDO */}
      {activeTab === "summary" && <SummaryTab />}
      {activeTab === "employees" && <EmployeesList setActiveView={setActiveView ?? (() => {})} />}
      {activeTab === "fixed" && <FixedExpensesCards />}
      {activeTab === "variable" && <VariableExpensesCards onExpensesChange={onVariableExpensesChange as any} />}
      {activeTab === "partners" && <PartnersTab />}
      {activeTab === "markup" && <MarkupFaturamentoTab />} {/* ✅ NOVO */}
      {activeTab === "freight_config" && <FreightConfigTab />}
    </div>
  );
};

export default Financial;
