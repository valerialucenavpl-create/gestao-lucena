import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons/Icon";
import { View, User } from "../types";
import motivationalQuotes from "../data/motivationalQuotes";
import { supabase } from "../services/supabase";

type SellerRow = {
  id: string | number;
  name: string;
  role?: string | null;
  commission?: number | null;
  monthly_target?: number | null;
  active?: boolean | null;
};

type SaleRowAny = any;

interface DashboardCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  icon,
  color,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`bg-white p-6 rounded-xl shadow-md flex items-center justify-between
    transition-transform transform hover:scale-105 ${onClick ? "cursor-pointer" : ""}`}
  >
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
    <div className={`p-3 rounded-full ${color}`}>{icon}</div>
  </div>
);

interface DashboardProps {
  setActiveView: (view: View) => void;
  currentUser: User;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeSale(row: SaleRowAny) {
  const saleDate = row?.saleDate ?? row?.sale_date ?? row?.date ?? null;
  return {
    id: row?.id,
    amount: Number(row?.amount || 0),
    saleDate,
    // pode existir um ou outro no seu banco/código
    sellerId: row?.seller_id ?? row?.sellerId ?? null,
    salesperson: (row?.salesperson ?? row?.seller_name ?? row?.sellerName ?? "").trim(),
  };
}

function getInitials(name: string) {
  const parts = (name || "").trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
}

const Dashboard: React.FC<DashboardProps> = ({ setActiveView, currentUser }) => {
  const userRole = currentUser?.role || "Admin";

  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ------------------ carregar tudo do Supabase ------------------
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);

      const sellersRes = await supabase
        .from("sellers")
        .select("id,name,role,commission,monthly_target,active")
        .eq("active", true)
        .order("name", { ascending: true });

      const salesRes = await supabase
        .from("sales")
        .select("*")
        .order("sale_date", { ascending: false });

      const safeSellers = Array.isArray(sellersRes.data) ? (sellersRes.data as SellerRow[]) : [];
      const safeSalesRaw = Array.isArray(salesRes.data) ? salesRes.data : [];

      setSellers(safeSellers);
      setSales(safeSalesRaw.map(normalizeSale));
      setLoading(false);
    };

    loadAll();
  }, []);

  // ------------------ frase do dia ------------------
  const quoteOfTheDay = useMemo(() => {
    const dayNumber = Math.floor(Date.now() / 86400000);
    const index = motivationalQuotes.length > 0 ? dayNumber % motivationalQuotes.length : 0;
    return motivationalQuotes[index] || "Hoje é dia de vender com propósito e foco.";
  }, []);

  // ------------------ mês atual ------------------
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const salesThisMonth = useMemo(() => {
    return (Array.isArray(sales) ? sales : []).filter((s: any) => {
      if (!s?.saleDate) return false;
      const d = new Date(s.saleDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [sales, currentMonth, currentYear]);

  const totalSalesCountMonth = salesThisMonth.length;

  const totalSalesAmountCurrentMonth = salesThisMonth.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  );

  const ticketMedioGeral =
    totalSalesCountMonth > 0 ? totalSalesAmountCurrentMonth / totalSalesCountMonth : 0;

  // ------------------ metas: soma das metas das vendedoras ativas ------------------
  const activeSellersWithGoals = sellers.filter((s) => Number(s.monthly_target || 0) > 0);

  const totalGoal = activeSellersWithGoals.reduce(
    (sum: number, s) => sum + Number(s.monthly_target || 0),
    0
  );

  const totalProgressPercent =
    totalGoal > 0 ? Math.min((totalSalesAmountCurrentMonth / totalGoal) * 100, 100) : 0;

  const totalRemaining = Math.max(totalGoal - totalSalesAmountCurrentMonth, 0);

  // ------------------ vendas por vendedora (ID preferido, senão nome) ------------------
  const salesBySeller = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};

    salesThisMonth.forEach((sale: any) => {
      const key =
        sale.sellerId != null ? String(sale.sellerId) : (sale.salesperson || "").toLowerCase().trim();

      if (!key) return;

      if (!map[key]) map[key] = { total: 0, count: 0 };
      map[key].total += Number(sale.amount || 0);
      map[key].count += 1;
    });

    return map;
  }, [salesThisMonth]);

  // ------------------ lista exibida (Sales vê só ela mesma pelo nome) ------------------
  const displayableSellers =
    userRole === "Sales"
      ? activeSellersWithGoals.filter(
          (s) => (s.name || "").toLowerCase().trim() === (currentUser.name || "").toLowerCase().trim()
        )
      : activeSellersWithGoals;

  // ------------------ ranking mensal ------------------
  const ranking = useMemo(() => {
    const rows = activeSellersWithGoals.map((s) => {
      const keyId = String(s.id);
      const keyName = (s.name || "").toLowerCase().trim();

      const byId = salesBySeller[keyId];
      const byName = salesBySeller[keyName];

      const total = Number(byId?.total ?? byName?.total ?? 0);
      const count = Number(byId?.count ?? byName?.count ?? 0);
      const goal = Number(s.monthly_target || 0);
      const percent = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

      return { ...s, total, count, percent };
    });

    return rows.sort((a, b) => b.total - a.total).slice(0, 3);
  }, [activeSellersWithGoals, salesBySeller]);

  return (
    <div className="space-y-6">
      {/* MENSAGEM DO DIA */}
      <div className="bg-gradient-to-r from-primary-800 to-primary-600 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary-200 mb-2 flex items-center gap-2">
            <Icon className="w-4 h-4">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </Icon>
            Mensagem do Dia
          </h3>

          <p className="text-xl font-serif italic">"{quoteOfTheDay}"</p>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Vendido no mês"
          value={`R$ ${money(totalSalesAmountCurrentMonth)}`}
          icon={
            <Icon className="text-white">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </Icon>
          }
          color="bg-green-500"
          onClick={() => setActiveView("sales")}
        />

        <DashboardCard
          title="Qtd. vendas (mês)"
          value={`${totalSalesCountMonth}`}
          icon={
            <Icon className="text-white">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </Icon>
          }
          color="bg-blue-500"
          onClick={() => setActiveView("sales")}
        />

        <DashboardCard
          title="Ticket médio (mês)"
          value={`R$ ${money(ticketMedioGeral)}`}
          icon={
            <Icon className="text-white">
              <path d="M12 8V4H8" />
              <rect x="4" y="12" width="8" height="8" rx="2" />
              <path d="M8 12v-2a2 2 0 1 1 4 0v2" />
              <path d="m18 12 2-2 2 2" />
              <path d="m18 20-2 2-2-2" />
            </Icon>
          }
          color="bg-purple-500"
        />

        <DashboardCard
          title="Falta p/ meta (mês)"
          value={`R$ ${money(totalRemaining)}`}
          icon={
            <Icon className="text-white">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </Icon>
          }
          color="bg-red-500"
        />
      </div>

      {/* META GERAL + METAS INDIVIDUAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* META GERAL */}
        <div className="bg-white p-6 rounded-xl shadow-md lg:col-span-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Meta Geral da Empresa</h3>

          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path
                  className="text-gray-200"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className={`${totalProgressPercent >= 100 ? "text-green-500" : "text-primary-600"}`}
                  strokeDasharray={`${totalProgressPercent}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>

              <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-800">
                  {totalProgressPercent.toFixed(0)}%
                </span>
                <span className="text-xs text-gray-500">Atingido</span>
              </div>
            </div>

            <div className="mt-6 text-center w-full">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Vendido</span>
                <span className="font-bold text-gray-800">
                  R$ {money(totalSalesAmountCurrentMonth)}
                </span>
              </div>

              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Meta</span>
                <span className="font-bold text-gray-800">
                  R$ {money(totalGoal)}
                </span>
              </div>

              <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-sm font-semibold">
                Falta: R$ {money(totalRemaining)}
              </div>

              {loading && (
                <p className="text-xs text-gray-400 mt-3">Carregando dados...</p>
              )}
            </div>
          </div>
        </div>

        {/* METAS INDIVIDUAIS */}
        <div className="bg-white p-6 rounded-xl shadow-md lg:col-span-2">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-800">
              {userRole === "Sales" ? "Sua Meta Individual" : "Metas Individuais - Vendedoras"}
            </h3>

            {/* RANKING TOP 3 */}
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold uppercase text-gray-400">Ranking do mês</p>
              <div className="mt-1 space-y-1">
                {ranking.map((r, idx) => (
                  <div key={String(r.id)} className="text-xs text-gray-700">
                    <b>{idx + 1}º</b> {r.name} • R$ {money(r.total)}
                  </div>
                ))}
                {ranking.length === 0 && (
                  <div className="text-xs text-gray-400">Sem dados ainda</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {displayableSellers.map((seller) => {
              const keyId = String(seller.id);
              const keyName = (seller.name || "").toLowerCase().trim();
              const stats = salesBySeller[keyId] ?? salesBySeller[keyName] ?? { total: 0, count: 0 };

              const sellerSales = Number(stats.total || 0);
              const sellerCount = Number(stats.count || 0);
              const sellerGoal = Number(seller.monthly_target || 0) || 1;

              const percent = Math.min((sellerSales / sellerGoal) * 100, 100);
              const remaining = Math.max(sellerGoal - sellerSales, 0);
              const ticketMedio = sellerCount > 0 ? sellerSales / sellerCount : 0;

              const isGoalMet = percent >= 100;

              return (
                <div key={keyId} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {/* Sem avatar na sellers: usamos iniciais */}
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700">
                        {getInitials(seller.name)}
                      </div>

                      <div>
                        <p className="font-semibold text-gray-800">{seller.name}</p>
                        <p className="text-xs text-gray-500">{seller.role || "Vendedora"}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">R$ {money(sellerSales)}</p>
                      <p className="text-xs text-gray-500">de R$ {money(Number(seller.monthly_target || 0))}</p>
                    </div>
                  </div>

                  {/* INFO EXTRA: qtd + ticket */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 mb-2">
                    <span>
                      <b>{sellerCount}</b> vendas no mês
                    </span>
                    <span>
                      Ticket médio: <b>R$ {money(ticketMedio)}</b>
                    </span>
                  </div>

                  <div className="relative pt-1">
                    <div className="overflow-hidden h-2 mb-3 rounded bg-gray-200">
                      <div
                        style={{ width: `${percent}%` }}
                        className={`${isGoalMet ? "bg-green-500" : "bg-primary-500"} h-2 rounded`}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs font-semibold py-1 px-2 rounded-full ${
                          isGoalMet ? "text-green-600 bg-green-200" : "text-primary-600 bg-primary-200"
                        }`}
                      >
                        {percent.toFixed(1)}%
                      </span>

                      {!isGoalMet ? (
                        <span className="text-xs font-medium text-red-500">
                          Falta vender: R$ {money(remaining)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                          <Icon className="w-3 h-3">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </Icon>
                          Meta Batida!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && displayableSellers.length === 0 && (
              <p className="text-gray-500 text-center py-4">
                Nenhuma meta cadastrada ainda (defina a meta mensal nas Vendedoras).
              </p>
            )}
          </div>

          {/* RANKING NO MOBILE */}
          <div className="md:hidden mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Ranking do mês</p>
            <div className="space-y-1">
              {ranking.map((r, idx) => (
                <div key={String(r.id)} className="text-sm text-gray-800 flex justify-between">
                  <span>
                    <b>{idx + 1}º</b> {r.name}
                  </span>
                  <span className="font-semibold">R$ {money(r.total)}</span>
                </div>
              ))}
              {ranking.length === 0 && <div className="text-sm text-gray-400">Sem dados ainda</div>}
            </div>
          </div>
        </div>
      </div>

      {/* RODAPÉ */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Bem-vindo(a) ao seu Painel de Gestão!</h2>
        <p className="text-gray-600">
          Aqui você tem uma visão geral do seu negócio. Utilize o menu à esquerda para navegar entre
          orçamentos, vendas, estoque e muito mais.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
