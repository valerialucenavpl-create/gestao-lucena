import React from "react";
import { Icon } from "./icons/Icon";
import { SALES_DATA, QUOTES_DATA, FINANCIAL_DATA } from "../constants";

const Reports: React.FC = () => {
  const totalIncome = FINANCIAL_DATA.reduce((sum, item) => sum + item.income, 0);
  const totalSales = SALES_DATA.length;
  const pendingQuotes = QUOTES_DATA.filter((q) => q.status === "Pendente").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">
        Relatórios Gerais
      </h1>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Faturamento (semestre)</p>
            <p className="text-2xl font-bold text-gray-800">
              R$ {totalIncome.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="p-3 rounded-full bg-green-500 text-white">
            <Icon>
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </Icon>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Vendas realizadas</p>
            <p className="text-2xl font-bold text-gray-800">{totalSales}</p>
          </div>
          <div className="p-3 rounded-full bg-blue-500 text-white">
            <Icon>
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </Icon>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Orçamentos pendentes</p>
            <p className="text-2xl font-bold text-gray-800">{pendingQuotes}</p>
          </div>
          <div className="p-3 rounded-full bg-yellow-500 text-white">
            <Icon>
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
            </Icon>
          </div>
        </div>
      </div>

      {/* Texto explicativo */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Visão geral dos relatórios
        </h2>
        <p className="text-gray-600">
          Aqui você acompanha os principais números do seu negócio.  
          Use o menu lateral para ver detalhes de Vendas, Financeiro,
          Orçamentos e muito mais.
        </p>
      </div>
    </div>
  );
};

export default Reports;
