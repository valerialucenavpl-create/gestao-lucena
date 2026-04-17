import React, { useMemo, useState } from "react";
import { CashFlowEntry, Product, Quote, Sale } from "../types";

// ─── Helpers ────────────────────────────────────────────────
const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const parseDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const raw = String(v).trim();
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return null;
  return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
};

const toISO = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const inRange = (v: unknown, from: string, to: string) => {
  const d = parseDate(v);
  if (!d) return false;
  const s = parseDate(from); const e = parseDate(to);
  if (!s || !e) return true;
  s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
  return d >= s && d <= e;
};

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

const isIncome = (t: unknown) => { const n = norm(t); return n.includes("ENTRADA") || n.includes("INCOME"); };
const isExpense = (t: unknown) => { const n = norm(t); return n.includes("SAIDA") || n.includes("EXPENSE"); };

const parseItems = (items: unknown): any[] => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try { const p = JSON.parse(items); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

type Sector = "VIDROS" | "ALUMÍNIO" | "MÁRMORE" | "PORTÃO";
const SECTORS: Sector[] = ["VIDROS", "ALUMÍNIO", "MÁRMORE", "PORTÃO"];
const SECTOR_COLORS: Record<Sector, string> = {
  VIDROS: "#0ea5e9", "ALUMÍNIO": "#8b5cf6", "MÁRMORE": "#f59e0b", PORTÃO: "#10b981",
};

const inferSector = (item: any, byId: Record<string, any>): Sector => {
  const p = byId[String(item?.productId ?? "")];
  const s = norm(`${p?.category || ""} ${p?.name || ""} ${item?.productName || ""}`);
  if (s.includes("PORTAO")) return "PORTÃO";
  if (s.includes("VIDRO")) return "VIDROS";
  if (s.includes("ALUMIN")) return "ALUMÍNIO";
  return "MÁRMORE";
};

type Tab = "overview" | "revenue" | "expenses" | "profit" | "cashflow";

interface Props {
  sales?: Sale[] | null;
  quotes?: Quote[] | null;
  cashFlow?: CashFlowEntry[] | null;
  products?: Product[] | null;
}

// ─── Sub-components ─────────────────────────────────────────
const Bar = ({ value, color }: { value: number; color: string }) => (
  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
    <div className="h-full rounded-full transition-all duration-500"
      style={{ width: `${clamp(value)}%`, backgroundColor: color }} />
  </div>
);

const KpiCard = ({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string;
}) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border-l-4" style={{ borderLeftColor: color }}>
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold mt-1 leading-tight" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <div className="text-3xl opacity-20 ml-2">{icon}</div>
    </div>
  </div>
);

// ─── Main component ──────────────────────────────────────────
const Reports: React.FC<Props> = ({ sales, quotes, cashFlow, products }) => {
  const now = new Date();
  const [fromDate, setFromDate] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [toDate, setToDate] = useState(toISO(now));
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const ss = Array.isArray(sales) ? sales : [];
  const qs = Array.isArray(quotes) ? quotes : [];
  const cf = Array.isArray(cashFlow) ? cashFlow : [];
  const ps = Array.isArray(products) ? products : [];

  const byId = useMemo(() =>
    ps.reduce((a, p) => { a[String(p.id)] = p; return a; }, {} as Record<string, any>),
    [ps]);

  // ─── Filtered ───────────────────────────────────────────
  const filtCF = useMemo(() => cf.filter(e => inRange(e.date, fromDate, toDate)), [cf, fromDate, toDate]);
  const filtSales = useMemo(() =>
    ss.filter(s => inRange((s as any).saleDate ?? (s as any).date, fromDate, toDate)),
    [ss, fromDate, toDate]);
  const filtQuotes = useMemo(() =>
    qs.filter(q => inRange((q as any).date, fromDate, toDate)),
    [qs, fromDate, toDate]);

  // ─── Core KPIs ──────────────────────────────────────────
  const revenue = useMemo(() =>
    filtCF.filter(e => isIncome(e.type)).reduce((s, e) => s + toNum(e.amount), 0), [filtCF]);
  const expenses = useMemo(() =>
    filtCF.filter(e => isExpense(e.type)).reduce((s, e) => s + toNum(e.amount), 0), [filtCF]);
  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const approvedQuotes = useMemo(() =>
    filtQuotes.filter(q => norm((q as any).status) === "APROVADO"), [filtQuotes]);
  const convRate = filtQuotes.length > 0 ? (approvedQuotes.length / filtQuotes.length) * 100 : 0;
  const salesCount = filtSales.length || approvedQuotes.length;
  const ticketAvg = salesCount > 0 ? revenue / salesCount : 0;

  const periodDays = useMemo(() => {
    const s = parseDate(fromDate); const e = parseDate(toDate);
    if (!s || !e) return 1;
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  }, [fromDate, toDate]);

  // ─── Previous period ────────────────────────────────────
  const prevPeriod = useMemo(() => {
    const s = parseDate(fromDate);
    if (!s) return { revenue: 0, expenses: 0 };
    const prevTo = toISO(new Date(s.getTime() - 86400000));
    const prevFrom = toISO(new Date(s.getTime() - periodDays * 86400000));
    const prevCF = cf.filter(e => inRange(e.date, prevFrom, prevTo));
    return {
      revenue: prevCF.filter(e => isIncome(e.type)).reduce((s, e) => s + toNum(e.amount), 0),
      expenses: prevCF.filter(e => isExpense(e.type)).reduce((s, e) => s + toNum(e.amount), 0),
    };
  }, [cf, fromDate, periodDays]);

  const revenueGrowth = prevPeriod.revenue > 0
    ? ((revenue - prevPeriod.revenue) / prevPeriod.revenue) * 100 : null;
  const expenseGrowth = prevPeriod.expenses > 0
    ? ((expenses - prevPeriod.expenses) / prevPeriod.expenses) * 100 : null;

  // ─── By sector ──────────────────────────────────────────
  const bySector = useMemo(() => {
    const base: Record<Sector, { revenue: number; cost: number }> = {
      VIDROS: { revenue: 0, cost: 0 },
      "ALUMÍNIO": { revenue: 0, cost: 0 },
      "MÁRMORE": { revenue: 0, cost: 0 },
      PORTÃO: { revenue: 0, cost: 0 },
    };
    filtQuotes.forEach(q => {
      parseItems((q as any).items).forEach((item: any) => {
        const sector = inferSector(item, byId);
        const qty = Math.max(1, toNum(item?.quantity) || 1);
        base[sector].revenue += toNum(item?.price ?? item?.totalPrice ?? 0) * qty;
        base[sector].cost += toNum(item?.cost ?? 0) * qty;
      });
    });
    const rows = SECTORS.map(s => ({
      sector: s,
      revenue: base[s].revenue,
      cost: base[s].cost,
      profit: base[s].revenue - base[s].cost,
      margin: base[s].revenue > 0 ? ((base[s].revenue - base[s].cost) / base[s].revenue) * 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);
    const maxRev = Math.max(1, ...rows.map(r => r.revenue));
    return rows.map(r => ({ ...r, pct: clamp((r.revenue / maxRev) * 100) }));
  }, [filtQuotes, byId]);

  const sectorTotal = bySector.reduce((s, r) => s + r.revenue, 0);

  // ─── Top clients ────────────────────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    const addToMap = (name: string, amount: number) => {
      const n = String(name || "Desconhecido").trim();
      map.set(n, (map.get(n) || 0) + amount);
    };
    filtSales.forEach(s => addToMap(s.customerName, toNum(s.amount)));
    if (map.size === 0) {
      approvedQuotes.forEach(q => addToMap((q as any).customerName, toNum((q as any).totalPrice)));
    }
    const rows = Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 5);
    const max = Math.max(1, ...rows.map(r => r.amount));
    return rows.map(r => ({ ...r, pct: clamp((r.amount / max) * 100) }));
  }, [filtSales, approvedQuotes]);

  // ─── Top sellers ────────────────────────────────────────
  const topSellers = useMemo(() => {
    const map = new Map<string, number>();
    const addToMap = (name: string, amount: number) => {
      const n = String(name || "Sem vendedor").trim();
      map.set(n, (map.get(n) || 0) + amount);
    };
    filtSales.forEach(s => addToMap(s.salesperson, toNum(s.amount)));
    if (map.size === 0) {
      approvedQuotes.forEach(q => addToMap((q as any).salesperson, toNum((q as any).totalPrice)));
    }
    const rows = Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 5);
    const max = Math.max(1, ...rows.map(r => r.amount));
    return rows.map(r => ({ ...r, pct: clamp((r.amount / max) * 100) }));
  }, [filtSales, approvedQuotes]);

  // ─── Monthly trend (last 6 months) ──────────────────────
  const monthlyTrend = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    return months.map(key => {
      const from = `${key}-01`;
      const [y, m] = key.split("-").map(Number);
      const to = `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const entries = cf.filter(e => inRange(e.date, from, to));
      const inc = entries.filter(e => isIncome(e.type)).reduce((s, e) => s + toNum(e.amount), 0);
      const exp = entries.filter(e => isExpense(e.type)).reduce((s, e) => s + toNum(e.amount), 0);
      return { key, label: monthLabel(key), revenue: inc, expenses: exp, profit: inc - exp };
    });
  }, [cf]);

  const maxMonthly = Math.max(1, ...monthlyTrend.flatMap(m => [m.revenue, m.expenses]));

  // ─── Expenses by category ───────────────────────────────
  const expByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtCF.filter(e => isExpense(e.type)).forEach(e => {
      const k = String(e.category || "Outros").trim().toUpperCase();
      map.set(k, (map.get(k) || 0) + toNum(e.amount));
    });
    const rows = Array.from(map.entries())
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount);
    const max = Math.max(1, ...rows.map(r => r.amount));
    return rows.map(r => ({ ...r, pct: clamp((r.amount / max) * 100) }));
  }, [filtCF]);

  const fixedExp = useMemo(() =>
    filtCF.filter(e => isExpense(e.type) && norm(e.category).includes("FIXO"))
      .reduce((s, e) => s + toNum(e.amount), 0), [filtCF]);
  const varExp = useMemo(() =>
    filtCF.filter(e => isExpense(e.type) && norm(e.category).includes("VARIAV"))
      .reduce((s, e) => s + toNum(e.amount), 0), [filtCF]);
  const otherExp = Math.max(0, expenses - fixedExp - varExp);

  // ─── Top income categories ───────────────────────────────
  const incomeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtCF.filter(e => isIncome(e.type)).forEach(e => {
      const k = String(e.subcategory || e.category || "Outros").trim();
      map.set(k, (map.get(k) || 0) + toNum(e.amount));
    });
    const rows = Array.from(map.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v).slice(0, 6);
    const max = Math.max(1, ...rows.map(r => r.v));
    return rows.map(r => ({ ...r, pct: clamp((r.v / max) * 100) }));
  }, [filtCF]);

  // ─── Alerts ─────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { type: "warning" | "danger" | "info"; msg: string }[] = [];
    if (profit < 0 && revenue > 0)
      list.push({ type: "danger", msg: `Prejuízo no período: ${money(Math.abs(profit))}. Suas despesas estão maiores que o faturamento.` });
    if (margin < 10 && revenue > 0)
      list.push({ type: "danger", msg: `Margem de lucro muito baixa: ${pct(margin)}. Meta mínima recomendada: 15%.` });
    if (expenseGrowth !== null && expenseGrowth > 20)
      list.push({ type: "warning", msg: `Despesas subiram ${pct(expenseGrowth)} em relação ao período anterior. Revise seus custos.` });
    if (revenueGrowth !== null && revenueGrowth < -10)
      list.push({ type: "warning", msg: `Faturamento caiu ${pct(Math.abs(revenueGrowth))} em relação ao período anterior.` });
    if (convRate < 30 && filtQuotes.length >= 5)
      list.push({ type: "info", msg: `Taxa de conversão baixa: ${pct(convRate)}. Apenas ${approvedQuotes.length} de ${filtQuotes.length} orçamentos foram aprovados.` });
    if (revenue > 0 && expenses / revenue > 0.85)
      list.push({ type: "warning", msg: `Despesas representam ${pct((expenses / revenue) * 100)} do faturamento. Ideal: abaixo de 80%.` });
    return list;
  }, [profit, revenue, margin, expenseGrowth, revenueGrowth, convRate, filtQuotes, approvedQuotes, expenses]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Visão Geral", icon: "📊" },
    { key: "revenue", label: "Faturamento", icon: "💰" },
    { key: "expenses", label: "Despesas", icon: "💸" },
    { key: "profit", label: "Lucro", icon: "📈" },
    { key: "cashflow", label: "Caixa", icon: "🏦" },
  ];

  const goThisMonth = () => {
    setFromDate(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
    setToDate(toISO(now));
  };
  const goPrevMonth = () => {
    setFromDate(toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    setToDate(toISO(new Date(now.getFullYear(), now.getMonth(), 0)));
  };

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header + filtro de período */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Relatórios & Dashboard</h2>
          <p className="text-xs text-gray-500">Análise completa do negócio por período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 whitespace-nowrap">De:</label>
            <input type="date" value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 whitespace-nowrap">Até:</label>
            <input type="date" value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm" />
          </div>
          <button onClick={goThisMonth}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
            Este mês
          </button>
          <button onClick={goPrevMonth}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap">
            Mês anterior
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
              activeTab === t.key
                ? "bg-blue-600 text-white shadow"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: VISÃO GERAL                              */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-4">

          {/* Alertas */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
                  a.type === "danger" ? "bg-red-50 border-red-200 text-red-700"
                  : a.type === "warning" ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
                }`}>
                  <span>{a.type === "danger" ? "🚨" : a.type === "warning" ? "⚠️" : "ℹ️"}</span>
                  {a.msg}
                </div>
              ))}
            </div>
          )}

          {/* KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Faturamento" value={money(revenue)}
              sub={revenueGrowth !== null ? `${revenueGrowth >= 0 ? "▲" : "▼"} ${pct(Math.abs(revenueGrowth))} vs período anterior` : undefined}
              color="#16a34a" icon="💰" />
            <KpiCard label="Despesas" value={money(expenses)}
              sub={expenseGrowth !== null ? `${expenseGrowth >= 0 ? "▲" : "▼"} ${pct(Math.abs(expenseGrowth))} vs período anterior` : undefined}
              color="#dc2626" icon="💸" />
            <KpiCard label="Lucro Líquido" value={money(profit)}
              sub={`Margem: ${pct(margin)}`}
              color={profit >= 0 ? "#2563eb" : "#dc2626"} icon="📈" />
            <KpiCard label="Ticket Médio" value={money(ticketAvg)}
              sub={`${salesCount} venda(s) no período`}
              color="#9333ea" icon="🎯" />
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Conversão</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{pct(convRate)}</p>
              <p className="text-xs text-gray-400">{approvedQuotes.length}/{filtQuotes.length} orçamentos</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Desp. / Receita</p>
              <p className={`text-2xl font-bold mt-1 ${revenue > 0 && expenses / revenue > 0.8 ? "text-red-600" : "text-gray-700"}`}>
                {revenue > 0 ? pct((expenses / revenue) * 100) : "—"}
              </p>
              <p className="text-xs text-gray-400">Ideal: abaixo de 80%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Margem</p>
              <p className={`text-2xl font-bold mt-1 ${margin < 10 ? "text-red-600" : margin < 20 ? "text-yellow-600" : "text-green-600"}`}>
                {pct(margin)}
              </p>
              <p className="text-xs text-gray-400">Meta: acima de 20%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Receita / Dia</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{money(revenue / periodDays)}</p>
              <p className="text-xs text-gray-400">Média no período</p>
            </div>
          </div>

          {/* Evolução mensal */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Evolução Mensal — últimos 6 meses</h3>
            <div className="space-y-3">
              {monthlyTrend.map(m => (
                <div key={m.key}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="font-semibold w-12">{m.label}</span>
                    <span className={`font-bold ${m.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      Lucro: {money(m.profit)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-gray-400 text-right">Entradas</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="h-full rounded-full bg-green-500"
                          style={{ width: `${clamp((m.revenue / maxMonthly) * 100)}%` }} />
                      </div>
                      <span className="w-24 text-xs text-green-600 font-medium">{money(m.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-gray-400 text-right">Saídas</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="h-full rounded-full bg-red-400"
                          style={{ width: `${clamp((m.expenses / maxMonthly) * 100)}%` }} />
                      </div>
                      <span className="w-24 text-xs text-red-500 font-medium">{money(m.expenses)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: FATURAMENTO                              */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "revenue" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total Faturado" value={money(revenue)}
              sub={revenueGrowth !== null ? `${revenueGrowth >= 0 ? "▲" : "▼"} ${pct(Math.abs(revenueGrowth))} vs anterior` : undefined}
              color="#16a34a" icon="💰" />
            <KpiCard label="Ticket Médio" value={money(ticketAvg)}
              sub={`${salesCount} venda(s) no período`} color="#9333ea" icon="🎯" />
            <KpiCard label="Conversão" value={pct(convRate)}
              sub={`${approvedQuotes.length} de ${filtQuotes.length} orçamentos aprovados`}
              color="#0ea5e9" icon="📋" />
          </div>

          {/* Por setor */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Faturamento por Setor</h3>
            <div className="space-y-4">
              {bySector.map(r => (
                <div key={r.sector}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold" style={{ color: SECTOR_COLORS[r.sector] }}>{r.sector}</span>
                    <div className="flex gap-4">
                      <span className="font-bold">{money(r.revenue)}</span>
                      <span className="text-gray-400 text-xs self-center">
                        {sectorTotal > 0 ? pct((r.revenue / sectorTotal) * 100) : "0%"}
                      </span>
                    </div>
                  </div>
                  <Bar value={r.pct} color={SECTOR_COLORS[r.sector]} />
                </div>
              ))}
              {sectorTotal === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">
                  Nenhum orçamento aprovado no período.
                </p>
              )}
            </div>
          </div>

          {/* Top clientes */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Top 5 Clientes</h3>
            <div className="space-y-3">
              {topClients.length > 0 ? topClients.map((r, i) => (
                <div key={r.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">
                      <span className="text-gray-400 mr-2 text-xs">#{i + 1}</span>{r.name}
                    </span>
                    <span className="font-bold text-green-600">{money(r.amount)}</span>
                  </div>
                  <Bar value={r.pct} color="#16a34a" />
                </div>
              )) : (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma venda registrada no período.</p>
              )}
            </div>
          </div>

          {/* Vendedoras */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Desempenho por Vendedora</h3>
            <div className="space-y-3">
              {topSellers.length > 0 ? topSellers.map((r, i) => (
                <div key={r.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">
                      <span className="text-gray-400 mr-2 text-xs">#{i + 1}</span>{r.name}
                    </span>
                    <span className="font-bold text-purple-600">{money(r.amount)}</span>
                  </div>
                  <Bar value={r.pct} color="#9333ea" />
                </div>
              )) : (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum dado de vendedora no período.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: DESPESAS                                 */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total Despesas" value={money(expenses)} color="#dc2626" icon="💸" />
            <KpiCard label="% sobre Faturamento"
              value={revenue > 0 ? pct((expenses / revenue) * 100) : "—"}
              sub={revenue > 0 && expenses / revenue > 0.8 ? "⚠️ Acima do ideal (80%)" : "✅ Dentro do controle"}
              color="#f59e0b" icon="📊" />
            <KpiCard label="Variação vs Anterior"
              value={expenseGrowth !== null ? `${expenseGrowth >= 0 ? "▲" : "▼"} ${pct(Math.abs(expenseGrowth))}` : "—"}
              color={expenseGrowth !== null && expenseGrowth > 0 ? "#dc2626" : "#16a34a"} icon="📉" />
          </div>

          {/* Fixo vs Variável */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Custos Fixos vs Variáveis vs Outros</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Custos Fixos", value: fixedExp, color: "#ef4444", icon: "🏢", desc: "Aluguel, salários, contas" },
                { label: "Custos Variáveis", value: varExp, color: "#f59e0b", icon: "📦", desc: "Materiais, comissões" },
                { label: "Outros / Admin", value: otherExp, color: "#6b7280", icon: "📋", desc: "Despesas diversas" },
              ].map(item => (
                <div key={item.label} className="border rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{item.label}</p>
                  <p className="text-xs text-gray-400 mb-2">{item.desc}</p>
                  <p className="text-xl font-bold" style={{ color: item.color }}>{money(item.value)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {expenses > 0 ? pct((item.value / expenses) * 100) : "0%"} do total
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Por categoria */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Ranking de Despesas por Categoria</h3>
            <div className="space-y-3">
              {expByCategory.length > 0 ? expByCategory.map((r, i) => (
                <div key={r.cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">
                      <span className="text-gray-400 mr-2 text-xs">#{i + 1}</span>{r.cat}
                    </span>
                    <div className="flex gap-3">
                      <span className="font-bold text-red-600">{money(r.amount)}</span>
                      <span className="text-gray-400 text-xs self-center">
                        {expenses > 0 ? pct((r.amount / expenses) * 100) : "0%"}
                      </span>
                    </div>
                  </div>
                  <Bar value={r.pct} color="#ef4444" />
                </div>
              )) : (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma despesa no período.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: LUCRO                                    */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "profit" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Lucro Líquido" value={money(profit)}
              sub={`Margem: ${pct(margin)}`}
              color={profit >= 0 ? "#2563eb" : "#dc2626"} icon="📈" />
            <KpiCard label="Faturamento" value={money(revenue)} color="#16a34a" icon="💰" />
            <KpiCard label="Despesas" value={money(expenses)} color="#dc2626" icon="💸" />
          </div>

          {/* Fórmula visual */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Composição do Resultado</h3>
            <div className="flex items-center justify-center gap-4 flex-wrap text-center">
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 min-w-32">
                <p className="text-xs text-gray-500 mb-1">Receita</p>
                <p className="text-xl font-bold text-green-600">{money(revenue)}</p>
              </div>
              <span className="text-3xl font-bold text-gray-300">−</span>
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 min-w-32">
                <p className="text-xs text-gray-500 mb-1">Despesas</p>
                <p className="text-xl font-bold text-red-600">{money(expenses)}</p>
              </div>
              <span className="text-3xl font-bold text-gray-300">=</span>
              <div className={`border rounded-xl p-5 min-w-32 ${profit >= 0 ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
                <p className="text-xs text-gray-500 mb-1">Lucro</p>
                <p className={`text-xl font-bold ${profit >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(profit)}</p>
                <p className={`text-xs mt-1 ${profit >= 0 ? "text-blue-400" : "text-red-400"}`}>Margem: {pct(margin)}</p>
              </div>
            </div>
          </div>

          {/* Por setor */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Lucro por Setor</h3>
            <div className="space-y-3">
              {bySector.map(r => (
                <div key={r.sector} className="border rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm" style={{ color: SECTOR_COLORS[r.sector] }}>
                      {r.sector}
                    </span>
                    <span className={`font-bold text-sm ${r.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      {money(r.profit)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 text-xs gap-2">
                    <div>
                      <span className="text-gray-400">Receita: </span>
                      <span className="font-medium text-green-600">{money(r.revenue)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Custo: </span>
                      <span className="font-medium text-red-500">{money(r.cost)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Margem: </span>
                      <span className={`font-semibold ${r.margin < 10 ? "text-red-600" : r.margin < 20 ? "text-yellow-600" : "text-green-600"}`}>
                        {pct(r.margin)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {bySector.every(r => r.revenue === 0) && (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum dado de orçamento no período.</p>
              )}
            </div>
          </div>

          {/* Evolução mensal do lucro */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Lucro Mensal — últimos 6 meses</h3>
            <div className="space-y-2">
              {monthlyTrend.map(m => {
                const maxP = Math.max(1, ...monthlyTrend.map(x => Math.abs(x.profit)));
                return (
                  <div key={m.key} className="flex items-center gap-3">
                    <span className="w-12 text-right text-xs text-gray-500">{m.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div className="h-full rounded-full flex items-center justify-center text-white font-semibold transition-all"
                        style={{
                          width: `${clamp((Math.abs(m.profit) / maxP) * 100)}%`,
                          minWidth: m.profit !== 0 ? "2rem" : "0",
                          fontSize: "10px",
                          backgroundColor: m.profit >= 0 ? "#2563eb" : "#dc2626",
                        }}>
                        {Math.abs(m.profit) > 500 && money(m.profit)}
                      </div>
                    </div>
                    <span className={`w-24 text-right text-xs font-bold ${m.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      {money(m.profit)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: CAIXA                                    */}
      {/* ══════════════════════════════════════════════ */}
      {activeTab === "cashflow" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Entradas no Período" value={money(revenue)} color="#16a34a" icon="⬆️" />
            <KpiCard label="Saídas no Período" value={money(expenses)} color="#dc2626" icon="⬇️" />
            <KpiCard label="Saldo do Período" value={money(profit)}
              sub={profit >= 0 ? "✅ Saldo positivo" : "⚠️ Saldo negativo"}
              color={profit >= 0 ? "#2563eb" : "#dc2626"} icon="💼" />
          </div>

          {/* Entradas e saídas por categoria */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">Principais Entradas</h3>
              <div className="space-y-3">
                {incomeByCategory.length > 0 ? incomeByCategory.map(r => (
                  <div key={r.k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{r.k}</span>
                      <span className="font-semibold text-green-600">{money(r.v)}</span>
                    </div>
                    <Bar value={r.pct} color="#16a34a" />
                  </div>
                )) : <p className="text-gray-400 text-sm text-center py-4">Sem entradas no período.</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-4">Principais Saídas</h3>
              <div className="space-y-3">
                {expByCategory.slice(0, 6).length > 0 ? expByCategory.slice(0, 6).map(r => (
                  <div key={r.cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{r.cat}</span>
                      <span className="font-semibold text-red-600">{money(r.amount)}</span>
                    </div>
                    <Bar value={r.pct} color="#ef4444" />
                  </div>
                )) : <p className="text-gray-400 text-sm text-center py-4">Sem saídas no período.</p>}
              </div>
            </div>
          </div>

          {/* Histórico mensal */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Histórico Mensal de Caixa — últimos 6 meses</h3>
            <div className="space-y-4">
              {monthlyTrend.map(m => (
                <div key={m.key}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="font-semibold">{m.label}</span>
                    <span className={`font-bold ${m.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Saldo: {money(m.profit)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-right text-gray-400">Entradas</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4">
                        <div className="h-full rounded-full bg-green-500 flex items-center justify-end pr-1"
                          style={{ width: `${clamp((m.revenue / maxMonthly) * 100)}%` }} />
                      </div>
                      <span className="w-24 text-xs text-green-600 font-medium">{money(m.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-right text-gray-400">Saídas</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4">
                        <div className="h-full rounded-full bg-red-400 flex items-center justify-end pr-1"
                          style={{ width: `${clamp((m.expenses / maxMonthly) * 100)}%` }} />
                      </div>
                      <span className="w-24 text-xs text-red-500 font-medium">{money(m.expenses)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Reports;
