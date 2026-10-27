import React, { useEffect, useMemo, useState } from "react";
import { CashFlowEntry, CashFlowSettings, Product, Quote, Sale } from "../types";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import { getPedidoCustos, PedidoCusto } from "../services/pedidoCustosServices";
import UnreliablePeriodBanner from "./common/UnreliablePeriodBanner";
import {
  SECTORS, SECTOR_COLORS, SECTOR_LABELS, cancelledQuoteIdsFrom, reliableStartOf, timeToYmd, ymd,
} from "../utils/salesReport";
import {
  DeadlineStats, deadlineStats, deadlineStatsBySector, deliveredIn, lateOrders, netReceivedByQuote, realizedProfit,
} from "../utils/productionReport";

const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const days = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`);
const formatBR = (s?: string) => {
  const [y, m, d] = String(s || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
};

type Props = {
  quotes?: Quote[] | null;
  sales?: Sale[] | null;
  cashFlow?: CashFlowEntry[] | null;
  products?: Product[] | null;
  fromDate: string;
  toDate: string;
};

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm">
    <h3 className="font-semibold text-gray-700">{title}</h3>
    {subtitle && <p className="text-xs text-gray-500 mt-0.5 mb-3">{subtitle}</p>}
    {children}
  </div>
);

const ProductionReport: React.FC<Props> = ({ quotes, sales, cashFlow, products, fromDate, toDate }) => {
  const [settings, setSettings] = useState<CashFlowSettings>({});
  const [costs, setCosts] = useState<PedidoCusto[]>([]);
  const [costsAvailable, setCostsAvailable] = useState(true);
  const [onlyWithoutCost, setOnlyWithoutCost] = useState(false);

  useEffect(() => {
    getCashFlowSettings().then((r) => { if (r.ok) setSettings(r.data ?? {}); });
    getPedidoCustos().then((r) => { setCostsAvailable(r.ok); if (r.ok) setCosts(r.data); });
  }, []);

  const qs = Array.isArray(quotes) ? quotes : [];
  const cf = Array.isArray(cashFlow) ? cashFlow : [];
  const ps = Array.isArray(products) ? products : [];
  const byId = useMemo(() => ps.reduce((a, p) => { a[String(p.id)] = p; return a; }, {} as Record<string, any>), [ps]);
  const cancelledIds = useMemo(() => cancelledQuoteIdsFrom(sales), [sales]);
  const reliableStart = reliableStartOf(settings);
  const today = timeToYmd(Date.now());

  const received = useMemo(() => netReceivedByQuote(cf), [cf]);
  const late = useMemo(() => lateOrders(qs, cancelledIds, byId, received, today), [qs, cancelledIds, byId, received, today]);
  const delivered = useMemo(() => deliveredIn(qs, cancelledIds, fromDate, toDate), [qs, cancelledIds, fromDate, toDate]);
  const total = useMemo(() => deadlineStats(delivered, late), [delivered, late]);
  const bySector = useMemo(() => deadlineStatsBySector(delivered, late, byId), [delivered, late, byId]);
  const realized = useMemo(
    () => realizedProfit(delivered, costs, cf).sort((a, b) => b.revenue - a.revenue),
    [delivered, costs, cf]
  );
  const realizedView = onlyWithoutCost ? realized.filter((r) => r.linkedCost === 0) : realized;
  const withoutCostCount = realized.filter((r) => r.linkedCost === 0).length;
  const realizedTotals = realized.reduce(
    (s, r) => ({ revenue: s.revenue + r.revenue, linked: s.linked + r.linkedCost, budgeted: s.budgeted + r.budgetedCost }),
    { revenue: 0, linked: 0, budgeted: 0 }
  );

  // Setor "gargalo": maior atraso médio entre os pedidos em aberto (agora) e,
  // se não houver, entre os entregues atrasados no período.
  const bottleneck = useMemo(() => {
    const score = (s: DeadlineStats) => s.openAvgDelay ?? s.avgDelay ?? 0;
    const ranked = SECTORS.map((sec) => ({ sec, v: score(bySector[sec]) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    return ranked[0] || null;
  }, [bySector]);

  const statRow = (label: React.ReactNode, s: DeadlineStats, key: string, bold = false) => (
    <tr key={key} className={`border-b border-gray-50 ${bold ? "font-bold border-t" : ""}`}>
      <td className="py-1.5 px-2">{label}</td>
      <td className="py-1.5 px-2 text-right">{s.delivered}</td>
      <td className="py-1.5 px-2 text-right">
        {s.withDeadline > 0 ? pct((s.onTime / s.withDeadline) * 100) : "—"}
        <span className="block text-[10px] text-gray-400 font-normal">{s.onTime}/{s.withDeadline} com prazo</span>
      </td>
      <td className="py-1.5 px-2 text-right">{days(s.avgPromised)}</td>
      <td className={`py-1.5 px-2 text-right ${s.avgActual != null && s.avgPromised != null && s.avgActual > s.avgPromised ? "text-red-600" : ""}`}>{days(s.avgActual)}</td>
      <td className="py-1.5 px-2 text-right">{days(s.avgDelay)}{s.late > 0 && <span className="block text-[10px] text-gray-400 font-normal">{s.late} atrasada(s)</span>}</td>
      <td className={`py-1.5 px-2 text-right ${s.openLate > 0 ? "text-red-600" : ""}`}>
        {s.openLate}
        {s.openLate > 0 && <span className="block text-[10px] text-gray-400 font-normal">média {days(s.openAvgDelay)}</span>}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-xl font-bold text-gray-800">Produção</h2>
        <p className="text-xs text-gray-500">
          Prazos de entrega e lucro realizado por pedido. Indicadores do período usam a <b>data de entrega</b>; a lista de atrasados é a situação de hoje.
        </p>
      </div>

      <UnreliablePeriodBanner fromDate={fromDate} reliableStart={reliableStart} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Entregue no prazo</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{total.withDeadline > 0 ? pct((total.onTime / total.withDeadline) * 100) : "—"}</p>
          <p className="text-xs text-gray-400">{total.onTime} de {total.withDeadline} entregas com prazo · {total.delivered} entregue(s)</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Prazo prometido x realizado</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{days(total.avgPromised)} <span className="text-gray-400 text-lg">x</span> {days(total.avgActual)}</p>
          <p className="text-xs text-gray-400">média de dias da aprovação até a entrega</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Atrasados agora</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{late.length}</p>
          <p className="text-xs text-gray-400">atraso médio {days(total.openAvgDelay)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Gargalo</p>
          <p className="text-2xl font-bold mt-1" style={{ color: bottleneck ? SECTOR_COLORS[bottleneck.sec] : "#9ca3af" }}>
            {bottleneck ? SECTOR_LABELS[bottleneck.sec] : "—"}
          </p>
          <p className="text-xs text-gray-400">{bottleneck ? `maior atraso médio: ${days(bottleneck.v)}` : "nenhum setor com atraso"}</p>
        </div>
      </div>

      {/* Prazos por setor */}
      <Section
        title="Prazos por setor"
        subtitle="Entregas no período. Prometido = aprovação → prazo prometido; realizado = aprovação → entrega. Atraso médio considera só as entregas atrasadas. Pedido com itens de mais de um setor conta em cada setor."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left py-1 px-2">Setor</th>
                <th className="text-right py-1 px-2">Entregues</th>
                <th className="text-right py-1 px-2">No prazo</th>
                <th className="text-right py-1 px-2">Prazo médio prometido</th>
                <th className="text-right py-1 px-2">Prazo médio realizado</th>
                <th className="text-right py-1 px-2">Atraso médio</th>
                <th className="text-right py-1 px-2">Atrasados agora</th>
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((sec) => statRow(<span className="font-semibold" style={{ color: SECTOR_COLORS[sec] }}>{SECTOR_LABELS[sec]}</span>, bySector[sec], sec))}
              {statRow("Total (cada pedido uma vez)", total, "total", true)}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Atrasados */}
      <Section
        title={`Pedidos atrasados (${late.length})`}
        subtitle={`Vendas em "Aguardando" com prazo prometido vencido em ${formatBR(today)} — não depende do período escolhido.`}
      >
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left py-1 px-2">Nº</th>
                <th className="text-left py-1 px-2">Cliente</th>
                <th className="text-left py-1 px-2">Setor</th>
                <th className="text-left py-1 px-2">Prazo prometido</th>
                <th className="text-right py-1 px-2">Dias de atraso</th>
                <th className="text-right py-1 px-2">% recebido</th>
              </tr>
            </thead>
            <tbody>
              {late.map((o) => {
                const oldOrder = ymd(o.quote.approvedAt || o.quote.date) < reliableStart;
                return (
                  <tr key={o.quote.id} className={`border-b border-gray-50 ${oldOrder ? "text-gray-400" : ""}`}>
                    <td className="py-1.5 px-2">{o.quote.quoteNumber ?? o.quote.id}</td>
                    <td className="py-1.5 px-2">
                      {o.quote.customerName}
                      {oldOrder && <span className="ml-2 text-[10px] uppercase">aprovado antes de {formatBR(reliableStart)}</span>}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      {o.sectors.map((s) => <span key={s} className="mr-2" style={{ color: oldOrder ? undefined : SECTOR_COLORS[s] }}>{SECTOR_LABELS[s]}</span>)}
                    </td>
                    <td className="py-1.5 px-2">{formatBR(o.promised)}</td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${oldOrder ? "" : "text-red-600"}`}>{o.daysLate}</td>
                    <td className="py-1.5 px-2 text-right">{pct(o.pctReceived)}</td>
                  </tr>
                );
              })}
              {late.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-4">Nenhum pedido atrasado.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Lucro realizado */}
      <Section
        title="Lucro realizado por pedido"
        subtitle="Pedidos entregues no período. Custos vinculados = saídas do Caixa ligadas ao pedido (compras, frete de fornecedores, consumíveis, mão de obra terceirizada). Mão de obra própria (salários) não entra."
      >
        {!costsAvailable && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Não foi possível ler os custos vinculados — rode a migração supabase/2026-10-13_pedido_custos.sql.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Receita</p><p className="font-bold">{money(realizedTotals.revenue)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Custos vinculados</p><p className="font-bold text-red-600">{money(realizedTotals.linked)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Material orçado</p><p className="font-bold">{money(realizedTotals.budgeted)}</p></div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-500">Sem custo vinculado</p>
            <p className={`font-bold ${withoutCostCount > 0 ? "text-amber-600" : ""}`}>{withoutCostCount} de {realized.length}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          <input type="checkbox" checked={onlyWithoutCost} onChange={(e) => setOnlyWithoutCost(e.target.checked)} />
          Mostrar só pedidos sem custo vinculado
        </label>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left py-1 px-2">Nº</th>
                <th className="text-left py-1 px-2">Cliente</th>
                <th className="text-left py-1 px-2">Entregue em</th>
                <th className="text-right py-1 px-2">Receita</th>
                <th className="text-right py-1 px-2">Material orçado</th>
                <th className="text-right py-1 px-2">Custos vinculados</th>
                <th className="text-right py-1 px-2">Lucro realizado</th>
                <th className="text-right py-1 px-2">Margem</th>
              </tr>
            </thead>
            <tbody>
              {realizedView.map((r) => (
                <tr key={r.quote.id} className={`border-b border-gray-50 ${r.linkedCost === 0 ? "bg-amber-50" : ""}`}>
                  <td className="py-1.5 px-2">{r.quote.quoteNumber ?? r.quote.id}</td>
                  <td className="py-1.5 px-2">
                    {r.quote.customerName}
                    {r.linkedCost === 0 && <span className="ml-2 text-[10px] font-semibold uppercase bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">sem custo vinculado</span>}
                  </td>
                  <td className="py-1.5 px-2">{formatBR(r.quote.deliveredAt)}</td>
                  <td className="py-1.5 px-2 text-right">{money(r.revenue)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-500">{money(r.budgetedCost)}</td>
                  <td className={`py-1.5 px-2 text-right ${r.linkedCost > r.budgetedCost && r.budgetedCost > 0 ? "text-red-600 font-semibold" : ""}`}>{money(r.linkedCost)}</td>
                  <td className={`py-1.5 px-2 text-right font-semibold ${r.profit < 0 ? "text-red-600" : ""}`}>{r.linkedCost === 0 ? "—" : money(r.profit)}</td>
                  <td className="py-1.5 px-2 text-right">{r.linkedCost === 0 ? "—" : pct(r.margin)}</td>
                </tr>
              ))}
              {realizedView.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-4">Nenhum pedido entregue no período.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Custo vinculado acima do material orçado fica em vermelho.</p>
      </Section>
    </div>
  );
};

export default ProductionReport;
