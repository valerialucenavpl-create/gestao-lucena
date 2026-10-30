import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./icons/Icon";
import { View, User, Product } from "../types";
import motivationalQuotes from "../data/motivationalQuotes";
import { supabase } from "../services/supabase";
import { fetchAllClients } from "../services/clientsServices";
import {
  DeliverySector,
  SECTOR_LABELS,
  SECTOR_DOT_COLORS,
  buildDeliveryEntriesBySector,
  parseDateFlexible,
} from "../utils/deliveryEntries";
import AgendaCard from "./agenda/AgendaCard";
import AgendaReminderCard from "./agenda/AgendaReminderCard";
import MetaCelebration from "./common/MetaCelebration";
import { getReceivables } from "../services/receivablesServices";
import { getCashFlow } from "../services/cashFlowServices";

type SellerRow = {
  id: string | number;
  name: string;
  role?: string | null;
  commission?: number | null;
  monthly_target?: number | null;
  active?: boolean | null;
};

type SaleRowAny = any;
type QuoteRowAny = any;
type ClientRowAny = any;
type EmployeeRowAny = any;

type BirthdayMonthLabel = "Mês atual" | "Próximo mês" | "Próximos meses";

type BirthdayEntry = {
  id: string;
  name: string;
  dateLabel: string;
  age: number;
  monthLabel: BirthdayMonthLabel;
  sortDate: Date;
};

interface DashboardCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  onClick?: () => void;
  change?: number | null;
  invertChangeColor?: boolean;
  progressPercent?: number;
}

const ChangeIndicator: React.FC<{ change?: number | null; invert?: boolean }> = ({ change, invert }) => {
  if (change === undefined) return null;

  if (change === null) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">— sem comparação</span>;
  }

  const rounded = Math.round(change);
  const isUp = change > 0;
  const isDown = change < 0;
  const isGood = invert ? isDown : isUp;
  const colorClass = rounded === 0
    ? "text-gray-400 dark:text-gray-500"
    : isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${colorClass}`}>
      {rounded !== 0 && (
        <Icon className="w-3 h-3">
          {isUp ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
        </Icon>
      )}
      {rounded > 0 ? "+" : ""}
      {rounded}% vs. mês anterior
    </span>
  );
};

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  icon,
  onClick,
  change,
  invertChangeColor,
  progressPercent,
}) => (
  <div
    onClick={onClick}
    className={`bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 rounded-xl p-4 ${
      onClick ? "cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 transition-colors" : ""
    }`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-orange-700/80 dark:text-orange-300/80">{title}</p>
        <p className="text-2xl font-bold text-orange-900 dark:text-white mt-1">{value}</p>
      </div>
      <div className="p-2.5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-500 dark:text-orange-300">
        {icon}
      </div>
    </div>

    <div className="mt-3">
      <ChangeIndicator change={change} invert={invertChangeColor} />
    </div>

    {progressPercent !== undefined && (
      <div className="mt-2 h-1.5 rounded-full bg-orange-200 dark:bg-orange-900/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${progressPercent >= 100 ? "bg-green-500" : "bg-orange-500"}`}
          style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
        />
      </div>
    )}
  </div>
);

interface DashboardProps {
  setActiveView: (view: View) => void;
  currentUser: User;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Data "pura" (YYYY-MM-DD, sem hora) — não usa fuso, só reorganiza os
// componentes, então nunca bate um dia errado.
function formatContactDate(value: unknown): string {
  const str = String(value || "").slice(0, 10);
  const [y, m, d] = str.split("-");
  if (!y || !m || !d) return "—";
  const todayISO = new Date().toISOString().slice(0, 10);
  if (str === todayISO) return "Hoje";
  if (str < todayISO) return `${d}/${m} · atrasado`;
  return `${d}/${m}`;
}

function isContactDatePastOrToday(value: unknown): boolean {
  const str = String(value || "").slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);
  return Boolean(str) && str <= todayISO;
}

function normalizeSale(row: SaleRowAny) {
  const saleDate = row?.saleDate ?? row?.sale_date ?? row?.date ?? null;
  return {
    id: row?.id,
    amount: Number(row?.amount ?? row?.total ?? 0),
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
  const [quotes, setQuotes] = useState<QuoteRowAny[]>([]);
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [clients, setClients] = useState<ClientRowAny[]>([]);
  const [employees, setEmployees] = useState<EmployeeRowAny[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [totalOverdueReceivables, setTotalOverdueReceivables] = useState(0);
  const [customerCredits, setCustomerCredits] = useState<{ id: string; number: string; customer: string; credit: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Total vencido de Contas a Receber — mesma lógica de Receivables.tsx
  // (status calculado a partir do que já entrou no Caixa, não do campo salvo;
  // títulos de vendas ainda "Aguardando" entrega não contam como vencidos).
  useEffect(() => {
    const loadOverdue = async () => {
      const [recRes, cfRes, cancelledRes] = await Promise.all([
        getReceivables(),
        getCashFlow(),
        supabase.from("sales").select("quote_id").eq("status", "Cancelado").is("deleted_at", null),
      ]);
      const receivables = recRes.ok && Array.isArray(recRes.data) ? recRes.data : [];
      const cashFlowRows = cfRes.ok && Array.isArray(cfRes.data) ? cfRes.data : [];
      // Venda cancelada não tem mais nada a receber.
      const cancelledQuoteIds = new Set((cancelledRes.data ?? []).map((s: any) => String(s.quote_id)));
      const today = new Date().toISOString().slice(0, 10);
      let total = 0;
      for (const r of receivables as any[]) {
        if (cancelledQuoteIds.has(String(r.quoteId))) continue;
        const q = quotes.find((qq: any) => String(qq.id) === String(r.quoteId));
        const awaitingDelivery = q && q.status === "Aprovado" && !(q.sale_completed ?? q.saleCompleted) && !(q.delivered_at ?? q.deliveredAt);
        if (awaitingDelivery) continue;
        const payments = cashFlowRows.filter(
          (e: any) => e.type === "Entrada" && (String(e.orcamentoId ?? "") === String(r.quoteId) || e.subcategory === `quote:${r.quoteId}`)
        );
        const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        const remaining = Math.max(0, Number(r.amount || 0) - totalPaid);
        if (remaining > 0.005 && r.dueDate && r.dueDate < today) total += remaining;
      }
      setTotalOverdueReceivables(total);

      // Pedidos com crédito do cliente a devolver:
      // saldo = valor do pedido − recebido + devolvido < 0
      const byQuote = new Map<string, { received: number; refunded: number }>();
      for (const e of cashFlowRows as any[]) {
        const qid = e.orcamentoId != null ? String(e.orcamentoId) : "";
        if (!qid || e.isTransfer) continue;
        const acc = byQuote.get(qid) || { received: 0, refunded: 0 };
        if (e.type === "Entrada") acc.received += Number(e.amount || 0);
        else if (e.movementKind === "devolucao") acc.refunded += Number(e.amount || 0);
        byQuote.set(qid, acc);
      }
      const credits: { id: string; number: string; customer: string; credit: number }[] = [];
      for (const q of quotes as any[]) {
        const acc = byQuote.get(String(q.id));
        if (!acc) continue;
        const saldo = Number(q.total_price ?? q.totalPrice ?? 0) - acc.received + acc.refunded;
        // Menos de R$ 0,10 é arredondamento (valor do pedido com fração de
        // centavo, ex.: 2.189,9941 pago com 2.190,00) — não é crédito real.
        if (saldo < -0.1) {
          credits.push({
            id: String(q.id),
            number: String(q.quote_number ?? q.quoteNumber ?? q.id),
            customer: q.customer_name ?? q.customerName ?? "",
            credit: -saldo,
          });
        }
      }
      setCustomerCredits(credits.sort((a, b) => b.credit - a.credit));
    };
    loadOverdue();
  }, [quotes]);

  const loadEmployeesLite = useCallback(async () => {
    const employeesRes = await supabase.from("employees").select("id,name,birth_date").eq("active", true);
    const safeEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
    setEmployees(safeEmployees);
  }, []);

  // ------------------ carregar tudo do Supabase ------------------
  const loadAll = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);

      // Todas as queries em paralelo — reduz 6-12s para ~2s
      const [sellersRes, salesRes, quotesRes, productsRes, clientsRes, employeesRes, payablesRes] =
        await Promise.all([
          supabase
            .from("sellers")
            .select("id,name,role,commission,monthly_target,active")
            .eq("active", true)
            .order("name", { ascending: true }),
          supabase
            .from("sales")
            .select("*")
            .is("deleted_at", null)
            .order("date", { ascending: false }),
          supabase
            .from("quotes")
            .select("*")
            .is("deleted_at", null)
            .order("date", { ascending: false }),
          // Só usamos nome/categoria pra montar "Entregas por setor" — o
          // Dashboard não mostra foto de produto. Buscar "*" trazia a foto em
          // base64 de cada produto (60+ MB no total) e deixava o painel
          // demorando muito pra carregar por causa só desse payload.
          supabase.from("products").select("id,name,productCategory"),
          fetchAllClients(),
          supabase.from("employees").select("id,name,birth_date").eq("active", true),
          supabase.from("payables").select("*").is("deleted_at", null).order("due_date", { ascending: true }),
        ]);

      const safeSellers = Array.isArray(sellersRes.data) ? (sellersRes.data as SellerRow[]) : [];
      const safeSalesRaw = Array.isArray(salesRes.data) ? salesRes.data : [];
      const safeProducts = Array.isArray(productsRes.data) ? (productsRes.data as Product[]) : [];
      const safeClients = Array.isArray(clientsRes.data) ? clientsRes.data : [];
      const safeEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
      setPayables(Array.isArray(payablesRes.data) ? payablesRes.data : []);

      // Quotes: usa Supabase se disponível, senão localStorage
      let safeQuotes = Array.isArray(quotesRes.data) ? quotesRes.data : [];
      if (safeQuotes.length === 0) {
        try {
          const cached = localStorage.getItem("local_quotes_cache");
          if (cached) safeQuotes = JSON.parse(cached);
        } catch {}
      }

      // Sales: mescla as vendas reais com "vendas virtuais" derivadas dos
      // orçamentos aprovados que ainda não têm uma linha em sales — antes
      // era tudo ou nada (só olhava as vendas aprovadas quando a tabela
      // sales estava 100% vazia), então assim que existia qualquer venda
      // real, orçamentos recém-aprovados paravam de aparecer no Dashboard.
      const realSaleQuoteIds = new Set(safeSalesRaw.map((s: any) => String(s.quote_id)));
      const virtualSales = safeQuotes
        .filter((q: any) => q.status === "Aprovado" && !realSaleQuoteIds.has(String(q.id)))
        .map((q: any) => ({
          id: `quote-${q.id}`,
          amount: Number(q.totalPrice || q.total_price || 0),
          // Data em que virou venda (aprovação), não a de criação do
          // orçamento — mesma regra da tela de Vendas e de Minhas Comissões.
          saleDate: q.approved_at || q.approvedAt || q.date || null,
          sellerId: null,
          salesperson: q.salesperson || "",
        }));

      // Vendas reais (linha própria em "sales") nunca gravam seller_id nem
      // nome da vendedora (createSale só manda quote_id/total/date) — sem
      // isso, o painel "Metas de Vendedoras" não tinha como saber de quem
      // era a venda assim que ela deixava de ser "virtual", e simplesmente
      // sumia do cálculo por vendedora (a soma geral continuava certa, só
      // o agrupamento por pessoa que ficava quebrado). Busca a vendedora no
      // orçamento de origem, igual já é feito pras vendas virtuais.
      const quoteById = new Map(safeQuotes.map((q: any) => [String(q.id), q]));
      // Venda cancelada não conta pra meta nem pro total do mês.
      const enrichedRealSales = safeSalesRaw.filter((s: any) => s.status !== "Cancelado").map((s: any) => {
        const quote = quoteById.get(String(s.quote_id));
        return { ...s, salesperson: quote?.salesperson || "" };
      });

      const finalSales = [...enrichedRealSales, ...virtualSales];

      setSellers(safeSellers);
      setSales(finalSales.map(normalizeSale));
      setQuotes(safeQuotes);
      setProductsCatalog(safeProducts);
      setClients(safeClients);
      setEmployees(safeEmployees);
      if (showLoader) setLoading(false);
    },
    []
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Tempo real: orçamento aprovado ou venda lançada aparece no Dashboard na
  // hora, sem precisar dar F5 (mesmo padrão já usado abaixo pra aniversário
  // de funcionário e contas a pagar).
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-quotes-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, () => loadAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => loadAll(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-employees-birthdays")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        async () => {
          await loadEmployeesLite();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEmployeesLite]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-payables")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payables" },
        async () => {
          const { data } = await supabase
            .from("payables")
            .select("*")
            .is("deleted_at", null)
            .order("due_date", { ascending: true });
          if (data) setPayables(data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      loadEmployeesLite();
    };

    const intervalId = window.setInterval(() => {
      loadEmployeesLite();
    }, 30000);

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(intervalId);
    };
  }, [loadEmployeesLite]);

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

  // ------------------ data de hoje (faixa da mensagem do dia) ------------------
  const todayLabel = useMemo(() => {
    const label = now.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  const salesThisMonth = useMemo(() => {
    return (Array.isArray(sales) ? sales : []).filter((s: any) => {
      if (!s?.saleDate) return false;
      // Datas de orçamento/venda são salvas como meia-noite UTC (dia
      // "puro", sem hora) — ler com getMonth()/getFullYear() (hora local)
      // volta um dia em fusos atrás de UTC (Brasil inteiro), fazendo uma
      // venda do dia 1 "escorregar" pro mês anterior. getUTC* lê o dia
      // exatamente como foi salvo, sem esse deslocamento.
      const d = new Date(s.saleDate);
      return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear;
    });
  }, [sales, currentMonth, currentYear]);

  const totalSalesCountMonth = salesThisMonth.length;

  const totalSalesAmountCurrentMonth = salesThisMonth.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  );

  const ticketMedioGeral =
    totalSalesCountMonth > 0 ? totalSalesAmountCurrentMonth / totalSalesCountMonth : 0;

  // ------------------ mês anterior (comparação) ------------------
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const previousMonth = previousMonthDate.getMonth();
  const previousYear = previousMonthDate.getFullYear();

  const salesPreviousMonth = useMemo(() => {
    return (Array.isArray(sales) ? sales : []).filter((s: any) => {
      if (!s?.saleDate) return false;
      const d = new Date(s.saleDate);
      return d.getUTCMonth() === previousMonth && d.getUTCFullYear() === previousYear;
    });
  }, [sales, previousMonth, previousYear]);

  const totalSalesCountPreviousMonth = salesPreviousMonth.length;

  const totalSalesAmountPreviousMonth = salesPreviousMonth.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  );

  const ticketMedioPreviousMonth =
    totalSalesCountPreviousMonth > 0 ? totalSalesAmountPreviousMonth / totalSalesCountPreviousMonth : 0;

  // ------------------ metas: soma das metas das vendedoras ativas ------------------
  const activeSellersWithGoals = sellers.filter((s) => Number(s.monthly_target || 0) > 0);

  const totalGoal = activeSellersWithGoals.reduce(
    (sum: number, s) => sum + Number(s.monthly_target || 0),
    0
  );

  const totalProgressPercent =
    totalGoal > 0 ? Math.min((totalSalesAmountCurrentMonth / totalGoal) * 100, 100) : 0;

  const totalRemaining = Math.max(totalGoal - totalSalesAmountCurrentMonth, 0);

  const totalRemainingPreviousMonth = Math.max(totalGoal - totalSalesAmountPreviousMonth, 0);

  // ------------------ variação percentual vs. mês anterior ------------------
  // Dados confiáveis só a partir de out/2026 — a primeira comparação que faz
  // sentido é novembro (vs. outubro). Antes disso, não mostra variação.
  const comparisonsEnabled = currentYear * 12 + currentMonth >= 2026 * 12 + 10;

  const computeChange = (current: number, previous: number) => {
    if (!comparisonsEnabled || !previous) return null;
    return ((current - previous) / previous) * 100;
  };

  const changeSalesAmount = computeChange(totalSalesAmountCurrentMonth, totalSalesAmountPreviousMonth);
  const changeSalesCount = computeChange(totalSalesCountMonth, totalSalesCountPreviousMonth);
  const changeTicketMedio = computeChange(ticketMedioGeral, ticketMedioPreviousMonth);
  const changeRemaining = computeChange(totalRemaining, totalRemainingPreviousMonth);

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

  // Vendedoras ativas SEM meta (ex.: Letícia) — aparecem no card só com o
  // total vendido no mês, sem barra de progresso, e não entram na meta geral.
  const sellersWithoutGoals = useMemo(() => {
    const list = sellers.filter((s) => !(Number(s.monthly_target || 0) > 0));
    return userRole === "Sales"
      ? list.filter((s) => (s.name || "").toLowerCase().trim() === (currentUser.name || "").toLowerCase().trim())
      : list;
  }, [sellers, userRole, currentUser.name]);

  // ------------------ comemoração de meta batida ------------------
  // Quando uma vendedora chega a 100% da meta do mês, abre o card com
  // confetes — uma vez por vendedora por mês neste navegador. Pra ver de
  // novo/testar: ?testeMeta=Joyce na URL. Só aparece no login da própria
  // vendedora — admin/gerência não recebem o card.
  const [celebrationQueue, setCelebrationQueue] = useState<string[]>([]);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("testeMeta");
    if (preview) setCelebrationQueue([preview]);
  }, []);

  useEffect(() => {
    if (loading || userRole !== "Sales") return;
    const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const reached: string[] = [];
    displayableSellers.forEach((seller) => {
      const goal = Number(seller.monthly_target || 0);
      if (!(goal > 0)) return;
      const stats =
        salesBySeller[String(seller.id)] ?? salesBySeller[(seller.name || "").toLowerCase().trim()];
      if (Number(stats?.total || 0) < goal) return;
      const storageKey = `metaCelebrada_${seller.id}_${monthKey}`;
      try {
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(storageKey, "1");
      } catch {
        // sem localStorage: ainda mostra, só não lembra
      }
      reached.push(seller.name || "");
    });
    if (reached.length > 0) setCelebrationQueue((q) => [...q, ...reached]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, salesBySeller, displayableSellers.length, userRole]);

  const closeCelebration = useCallback(() => setCelebrationQueue((q) => q.slice(1)), []);

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

  const deliveryEntriesBySector = useMemo(() => {
    return buildDeliveryEntriesBySector(quotes, clients, productsCatalog);
  }, [clients, productsCatalog, quotes]);

  // Orçamentos com data de "próximo contato" marcada — todas, não só
  // hoje/atrasadas, pra servir de lista de prospecção. Vendedora só vê os
  // dela; Admin/Finance vê de todo mundo.
  const contactReminders = useMemo(() => {
    return (Array.isArray(quotes) ? quotes : [])
      .filter((q: any) => {
        if (!q.next_contact_date) return false;
        if (q.status === "Aprovado" || q.status === "Recusado") return false;
        // Marcado como "Não fechou" no painel de Orçamentos: sai da lista.
        if (q.not_closed ?? q.notClosed) return false;
        if (userRole === "Sales") {
          return (q.salesperson || "").toLowerCase().trim() === (currentUser?.name || "").toLowerCase().trim();
        }
        return true;
      })
      .sort((a: any, b: any) => String(a.next_contact_date).localeCompare(String(b.next_contact_date)));
  }, [quotes, userRole, currentUser?.name]);

  const upcomingBirthdays = useMemo(() => {
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const currentMonthIndex = nowDate.getMonth();
    const currentYear = nowDate.getFullYear();

    const rows: BirthdayEntry[] = [];

    (Array.isArray(employees) ? employees : []).forEach((employee) => {
      const birthDate = parseDateFlexible(employee?.birth_date);
      if (!birthDate) return;

      const birthDay = birthDate.getDate();
      const birthMonth = birthDate.getMonth();
      const birthYear = birthDate.getFullYear();

      let nextBirthdayYear = currentYear;
      let nextBirthday = new Date(nextBirthdayYear, birthMonth, birthDay);

      if (nextBirthday < todayStart) {
        nextBirthdayYear = currentYear + 1;
        nextBirthday = new Date(nextBirthdayYear, birthMonth, birthDay);
      }

      if (Number.isNaN(nextBirthday.getTime())) return;

      if (nextBirthday.getMonth() !== birthMonth) {
        nextBirthday = new Date(nextBirthdayYear, birthMonth + 1, 0);
      }

      const monthDiff =
        (nextBirthday.getFullYear() - currentYear) * 12 +
        (nextBirthday.getMonth() - currentMonthIndex);

      let monthLabel: BirthdayMonthLabel = "Próximos meses";
      if (monthDiff === 0) monthLabel = "Mês atual";
      if (monthDiff === 1) monthLabel = "Próximo mês";

      rows.push({
        id: `${employee?.id || employee?.name}-${nextBirthdayYear}`,
        name: String(employee?.name || "Funcionário"),
        dateLabel: nextBirthday.toLocaleDateString("pt-BR"),
        age: nextBirthdayYear - birthYear,
        monthLabel,
        sortDate: nextBirthday,
      });
    });

    return rows.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  }, [employees]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        <p className="text-sm text-gray-400">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {celebrationQueue.length > 0 && (
        <MetaCelebration
          key={celebrationQueue[0]}
          sellerName={celebrationQueue[0]}
          onClose={closeCelebration}
        />
      )}
      <AgendaReminderCard />

      {/* MENSAGEM DO DIA */}
      <div className="flex items-center justify-between gap-3 bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800/60 rounded-lg px-4 py-2">
        <p className="flex items-center gap-2 text-sm text-primary-900 dark:text-primary-100 italic truncate">
          <Icon className="w-4 h-4 text-primary-600 dark:text-primary-300 shrink-0">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </Icon>
          <span className="truncate">"{quoteOfTheDay}"</span>
        </p>
        <span className="text-xs font-semibold text-primary-500 dark:text-primary-400 whitespace-nowrap">
          {todayLabel}
        </span>
      </div>

      {/* CARDS */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${userRole === "Admin" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <DashboardCard
          title="Vendido no mês"
          value={`R$ ${money(totalSalesAmountCurrentMonth)}`}
          icon={
            <Icon>
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </Icon>
          }
          onClick={() => setActiveView("sales")}
          change={changeSalesAmount}
        />

        <DashboardCard
          title="Qtd. vendas (mês)"
          value={`${totalSalesCountMonth}`}
          icon={
            <Icon>
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </Icon>
          }
          onClick={() => setActiveView("sales")}
          change={changeSalesCount}
        />

        <DashboardCard
          title="Ticket médio (mês)"
          value={`R$ ${money(ticketMedioGeral)}`}
          icon={
            <Icon>
              <path d="M12 8V4H8" />
              <rect x="4" y="12" width="8" height="8" rx="2" />
              <path d="M8 12v-2a2 2 0 1 1 4 0v2" />
              <path d="m18 12 2-2 2 2" />
              <path d="m18 20-2 2-2-2" />
            </Icon>
          }
          change={changeTicketMedio}
        />

        <DashboardCard
          title="Falta p/ meta (mês)"
          value={`R$ ${money(totalRemaining)}`}
          icon={
            <Icon>
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </Icon>
          }
          change={changeRemaining}
          invertChangeColor
          progressPercent={totalProgressPercent}
        />

        {userRole === "Admin" && (
          <DashboardCard
            title="Vencido (a receber)"
            value={`R$ ${money(totalOverdueReceivables)}`}
            icon={
              <Icon>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </Icon>
            }
            onClick={() => setActiveView("receivables" as any)}
          />
        )}
      </div>

      {/* ENTREGAS POR SETOR */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Entregas por setor</h3>

        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {(["GRANITO", "VIDROS", "ALUMINIO", "PORTAO AUTOMATICO", "PRODUTOS PRONTOS"] as DeliverySector[]).map((sector) => {
            const pendingCount = (deliveryEntriesBySector[sector] || []).filter((e) => e.isPending).length;

            return (
              <div
                key={sector}
                role="button"
                tabIndex={0}
                onClick={() => setActiveView(`delivery-sector-${sector}` as any)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveView(`delivery-sector-${sector}` as any);
                  }
                }}
                className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${SECTOR_DOT_COLORS[sector]}`} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {SECTOR_LABELS[sector]}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {pendingCount} {pendingCount === 1 ? "entrega pendente" : "entregas pendentes"}
                  </span>
                  <Icon className="w-4 h-4 text-gray-400">
                    <path d="M9 18l6-6-6-6" />
                  </Icon>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AGENDA */}
      <AgendaCard />

      {/* LEMBRETE DE CONTATO — orçamentos com "próximo contato" marcado pra
          hoje ou atrasado. Só visualização, nenhuma ação aqui. */}
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800/60 dark:bg-sky-950/30">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300">
            <Icon className="w-4 h-4">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </Icon>
          </span>
          <h3 className="text-sm font-bold text-sky-800 dark:text-sky-200">Lembrete de contato</h3>
        </div>
        {contactReminders.length === 0 ? (
          <p className="text-sm text-sky-700/60 dark:text-sky-300/60">
            Nenhum contato marcado pra hoje ou atrasado.
          </p>
        ) : (
          <div className="space-y-2">
            {contactReminders.map((q: any) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm dark:border-sky-900/50 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800 dark:text-white">
                    {q.customer_name || "Cliente"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    N° {q.quote_number ?? "—"}
                    {userRole !== "Sales" && q.salesperson ? ` · ${q.salesperson}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    isContactDatePastOrToday(q.next_contact_date)
                      ? "text-red-600 dark:text-red-400"
                      : "text-sky-700 dark:text-sky-300"
                  }`}
                >
                  {formatContactDate(q.next_contact_date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* META GERAL + METAS INDIVIDUAIS + ANIVERSARIANTES + CONTAS A PAGAR */}
      <div className={`grid grid-cols-1 gap-6 ${userRole === "Sales" ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
        {/* META GERAL */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Meta Geral da Empresa</h3>

          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path
                  className="text-gray-200 dark:text-gray-700"
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
                <span className="text-2xl font-bold text-gray-800 dark:text-white">
                  {totalProgressPercent.toFixed(0)}%
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Atingido</span>
              </div>
            </div>

            <div className="mt-4 w-full text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Vendido</span>
                <span className="font-bold text-gray-800 dark:text-white">R$ {money(totalSalesAmountCurrentMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Meta</span>
                <span className="font-bold text-gray-800 dark:text-white">R$ {money(totalGoal)}</span>
              </div>
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-500/10 rounded text-red-600 dark:text-red-400 text-sm font-semibold">
                Falta: R$ {money(totalRemaining)}
              </div>
              {loading && <p className="text-xs text-gray-400 dark:text-gray-500">Carregando dados...</p>}
            </div>
          </div>
        </div>

        {/* METAS INDIVIDUAIS (compacto) */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">
              {userRole === "Sales" ? "Sua Meta" : "Metas de Vendedoras"}
            </h3>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">Top 3</p>
              {ranking.slice(0, 2).map((r, idx) => (
                <p key={String(r.id)} className="text-[11px] text-gray-700 dark:text-gray-300">
                  {idx + 1}º {r.name}
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {displayableSellers.map((seller) => {
              const keyId = String(seller.id);
              const keyName = (seller.name || "").toLowerCase().trim();
              const stats = salesBySeller[keyId] ?? salesBySeller[keyName] ?? { total: 0, count: 0 };

              const sellerSales = Number(stats.total || 0);
              const sellerGoal = Number(seller.monthly_target || 0) || 1;
              const percent = Math.min((sellerSales / sellerGoal) * 100, 100);
              const remaining = Math.max(sellerGoal - sellerSales, 0);

              return (
                <div key={keyId} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-200">
                        {getInitials(seller.name)}
                      </div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-white">{seller.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{percent.toFixed(0)}%</span>
                  </div>

                  <div className="overflow-hidden h-2 rounded bg-gray-200 dark:bg-gray-700 mb-2">
                    <div
                      style={{ width: `${percent}%` }}
                      className={`${percent >= 100 ? "bg-green-500" : "bg-primary-500"} h-2 rounded`}
                    />
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    R$ {money(sellerSales)} de R$ {money(Number(seller.monthly_target || 0))}
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400">Falta: R$ {money(remaining)}</p>
                </div>
              );
            })}

            {sellersWithoutGoals.map((seller) => {
              const keyId = String(seller.id);
              const keyName = (seller.name || "").toLowerCase().trim();
              const stats = salesBySeller[keyId] ?? salesBySeller[keyName] ?? { total: 0, count: 0 };
              return (
                <div key={keyId} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-200">
                        {getInitials(seller.name)}
                      </div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-white">{seller.name}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">Sem meta</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Vendido no mês: <span className="font-semibold text-gray-800 dark:text-white">R$ {money(Number(stats.total || 0))}</span>
                    {" · "}
                    {stats.count} venda(s)
                  </p>
                </div>
              );
            })}

            {!loading && displayableSellers.length === 0 && sellersWithoutGoals.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-2">Nenhuma meta cadastrada.</p>
            )}
          </div>
        </div>

        {/* ANIVERSARIANTES */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Aniversariantes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Próximos aniversários (a partir de hoje)</p>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {upcomingBirthdays.map((person) => (
              <div key={person.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50/60 dark:bg-gray-700/40">
                <p className="text-xs text-primary-700 dark:text-primary-300 font-semibold">{person.monthLabel}</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{person.name}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {person.dateLabel} • {person.age} anos
                </p>
              </div>
            ))}
            {upcomingBirthdays.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sem aniversariantes cadastrados para o período.</p>
            )}
          </div>
        </div>

        {/* CRÉDITO A DEVOLVER — pedidos em que o cliente pagou a mais */}
        {userRole !== "Sales" && customerCredits.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">Crédito a devolver</h3>
              <span className="text-sm font-bold text-amber-600">
                R$ {money(customerCredits.reduce((s, c) => s + c.credit, 0))}
              </span>
            </div>
            <div className="space-y-2">
              {customerCredits.slice(0, 8).map((c) => (
                <div key={c.id} className="flex items-center justify-between border border-amber-100 dark:border-amber-900/40 rounded-lg p-3 bg-amber-50/60 dark:bg-amber-900/10">
                  <div>
                    <p className="text-xs font-mono text-primary-700 dark:text-primary-300 font-semibold">OS #{c.number}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{c.customer || "—"}</p>
                  </div>
                  <p className="text-sm font-bold text-amber-600">R$ {money(c.credit)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONTAS A PAGAR — oculto para vendedoras */}
        {userRole !== "Sales" && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Contas a Pagar</h3>
            {(userRole === "Admin" || userRole === "Finance") && (
              <button onClick={() => setActiveView("payables")} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Ver todas →
              </button>
            )}
          </div>
          {(() => {
            const today = new Date().toISOString().split("T")[0];
            const fmt = (ymd: string) => {
              if (!ymd) return "-";
              const [y, m, d] = ymd.split("-");
              return `${d}/${m}/${y}`;
            };
            const money = (n: number) =>
              Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

            // Expand each payable into individual installment rows
            const rows: { key: string; name: string; supplier: string; date: string; amount: number; isPaid: boolean; instLabel?: string }[] = [];

            payables.forEach((p: any) => {
              const insts = Array.isArray(p.installments) ? p.installments : [];
              if (insts.length === 0) {
                // Sem parcelas — mostra a conta inteira
                const dueDate = p.due_date ? String(p.due_date).split("T")[0] : "";
                const isPaid = (p.status || "") === "paid";
                rows.push({ key: p.id, name: p.name, supplier: p.supplier || "", date: dueDate, amount: Number(p.amount || 0), isPaid });
              } else {
                // Expande cada parcela pendente
                const wholePayablePaid = (p.status || "") === "paid";
                insts.forEach((inst: any, idx: number) => {
                  rows.push({
                    key: `${p.id}-${inst.id || idx}`,
                    name: p.name,
                    supplier: p.supplier || "",
                    date: inst.dueDate || inst.due_date || "",
                    amount: Number(inst.amount || 0),
                    isPaid: inst.paid === true || wholePayablePaid,
                    instLabel: `Parcela ${idx + 1}`,
                  });
                });
              }
            });

            // Remove paid rows — only show pending/overdue
            const unpaidRows = rows.filter((r) => !r.isPaid);

            // Sort by date ascending (earliest first)
            unpaidRows.sort((a, b) => a.date.localeCompare(b.date));

            if (unpaidRows.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma conta pendente.</p>;

            return (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {unpaidRows.map((row) => {
                  const daysUntil = row.date
                    ? Math.round((new Date(row.date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000)
                    : null;
                  const { label, cls } = row.isPaid
                    ? { label: "Pago",           cls: "bg-green-100 text-green-700 border border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40" }
                    : daysUntil === null || daysUntil < 0
                      ? { label: "Vencida",        cls: "bg-red-100 text-red-700 border border-red-400 font-bold dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40" }
                      : daysUntil === 0
                        ? { label: "Vence hoje",   cls: "bg-blue-100 text-blue-700 border border-blue-400 font-bold dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40" }
                        : daysUntil <= 3
                          ? { label: `${daysUntil}d`,  cls: "bg-yellow-100 text-yellow-800 border border-yellow-400 font-bold dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40" }
                          : { label: "A Vencer",   cls: "bg-green-100 text-green-700 border border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40" };
                  return (
                    <div key={row.key} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50/60 dark:bg-gray-700/40">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight truncate">{row.name}</p>
                          {(row.supplier || row.instLabel) && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{[row.supplier, row.instLabel].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cls}`}>{label}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fmt(row.date)}</p>
                        <p className="text-sm font-bold text-gray-800 dark:text-white">{money(row.amount)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        )}
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
