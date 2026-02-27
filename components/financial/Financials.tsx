// src/components/financial/Financial.tsx
import React, { useMemo, useState } from "react";

import SummaryTab from "./SummaryTab";
import FixedExpensesCards from "./FixedExpensesCards";
import VariableExpensesCards from "./VariableExpensesCards";
import MarkupFaturamentoTab from "./MarkupFaturamentoTab"; // ✅ NOVO

type TabKey = "summary" | "fixed" | "variable" | "markup"; // ✅ NOVO

const Financial: React.FC = () => {
  const tabs = useMemo(
    () => [
      { key: "summary" as const, label: "Resumo" },
      { key: "fixed" as const, label: "Despesas Fixas" },
      { key: "variable" as const, label: "Despesas Variáveis" },
      { key: "markup" as const, label: "MARKUP / FATURAMENTO" }, // ✅ NOVO
    ],
    []
  );

  const [activeTab, setActiveTab] = useState<TabKey>("summary");

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
      {activeTab === "fixed" && <FixedExpensesCards />}
      {activeTab === "variable" && <VariableExpensesCards />}
      {activeTab === "markup" && <MarkupFaturamentoTab />} {/* ✅ NOVO */}
    </div>
  );
};

export default Financial;
