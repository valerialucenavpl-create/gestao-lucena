import React, { useMemo } from "react";
import { Icon } from "./icons/Icon";
import { User, Sale } from "../types";

interface DashboardSalesProps {
  currentUser: User;
  sales: Sale[];
  companyMonthlyGoal?: number; // meta geral da empresa (opcional)
}

const DashboardSales: React.FC<DashboardSalesProps> = ({
  currentUser,
  sales,
  companyMonthlyGoal = 0,
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // 🔹 vendas SOMENTE da vendedora logada no mês atual
  const mySalesThisMonth = useMemo(() => {
    return sales.filter((sale: any) => {
      const d = new Date(sale.saleDate);
      return (
        sale.seller_id === currentUser.id &&
        d.getMonth() === currentMonth &&
        d.getFullYear() === currentYear
      );
    });
  }, [sales, currentUser.id, currentMonth, currentYear]);

  const totalSold = mySalesThisMonth.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  );

  const totalSalesCount = mySalesThisMonth.length;

  const ticketAverage =
    totalSalesCount > 0 ? totalSold / totalSalesCount : 0;

  const myGoal = Number(currentUser.monthlyGoal || 0);
  const remainingToGoal = Math.max(myGoal - totalSold, 0);
  const progressPercent =
    myGoal > 0 ? Math.min((totalSold / myGoal) * 100, 100) : 0;

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* TOPO */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-500 rounded-xl p-6 text-white shadow-lg">
        <h2 className="text-xl font-bold">
          Olá, {currentUser.name} 👋
        </h2>
        <p className="text-sm opacity-90">
          Aqui está o resumo do seu desempenho neste mês
        </p>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          title="Vendido no mês"
          value={`R$ ${formatCurrency(totalSold)}`}
          color="bg-green-500"
        />

        <Card
          title="Quantidade de vendas"
          value={String(totalSalesCount)}
          color="bg-blue-500"
        />

        <Card
          title="Ticket médio"
          value={`R$ ${formatCurrency(ticketAverage)}`}
          color="bg-purple-500"
        />

        <Card
          title="Falta para sua meta"
          value={`R$ ${formatCurrency(remainingToGoal)}`}
          color="bg-red-500"
        />
      </div>

      {/* META DA VENDEDORA */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Sua Meta Mensal
        </h3>

        <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-3">
          <div
            className={`h-4 ${
              progressPercent >= 100 ? "bg-green-500" : "bg-primary-600"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            Progresso: {progressPercent.toFixed(1)}%
          </span>
          <span className="font-semibold text-gray-800">
            Meta: R$ {formatCurrency(myGoal)}
          </span>
        </div>
      </div>

      {/* META GERAL (SEM EXPOR OUTRAS VENDEDORAS) */}
      {companyMonthlyGoal > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Meta Geral da Empresa
          </h3>
          <p className="text-gray-600">
            Meta do mês:{" "}
            <strong>R$ {formatCurrency(companyMonthlyGoal)}</strong>
          </p>
        </div>
      )}
    </div>
  );
};

const Card = ({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) => (
  <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between">
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
    <div className={`p-3 rounded-full ${color}`}>
      <Icon className="text-white w-5 h-5">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </div>
  </div>
);

export default DashboardSales;
