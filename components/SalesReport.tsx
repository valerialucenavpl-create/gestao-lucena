import React, { useEffect, useMemo, useState } from "react";
import { CashFlowSettings, Product, Quote, Sale } from "../types";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import { supabase } from "../services/supabase";
import UnreliablePeriodBanner, { NotConferredTag } from "./common/UnreliablePeriodBanner";
import {
  DateBase, LOST_REASONS, SECTORS, SECTOR_COLORS, SECTOR_LABELS, Sector,
  cancelledQuoteIdsFrom, createdQuotesIn, daysInRange, inferSector, isClosedMonth, isPeriodUnreliable,
  itemCost, itemLaborCost, itemRevenue, last12Months, norm, parseItems, previousPeriod, proportionalGoal, quoteOutcome,
  reliableStartOf, revenueBySector, soldQuotesIn, toNum, ymd, ymdToTime,
} from "../utils/salesReport";

// ─── Helpers de formatação ──────────────────────────────────
const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const formatBR = (s?: string) => {
  const [y, m, d] = String(s || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
};
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const goalColor = (p: number) => (p >= 100 ? "#16a34a" : p >= 70 ? "#eab308" : "#dc2626");

type SellerRow = { id: string | number; name: string; monthly_target?: number | null; active?: boolean | null };

type Props = {
  quotes?: Quote[] | null;
  sales?: Sale[] | null;
  products?: Product[] | null;
  fromDate: string;
  toDate: string;
};

type ConvRow = { key: string; label: string; createdQty: number; approvedQty: number; createdValue: number; approvedValue: number };

type ProductSort = "marginValue" | "marginPct" | "revenue" | "quantity";

const Section: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }> = ({
  title, subtitle, right, children,
}) => (
  <div className="bg-white rounded-xl p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div>
        <h3 className="font-semibold text-gray-700">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const Toggle = <T extends string>({ value, options, onChange }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void;
}) => (
  <div className="flex gap-1">
    {options.map((o) => (
      <button
        key={o.key}
        type="button"
        onClick={() => onChange(o.key)}
        className={`px-3 py-1 text-xs rounded-lg ${value === o.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const SalesReport: React.FC<Props> = ({ quotes, sales, products, fromDate, toDate }) => {
  const [settings, setSettings] = useState<CashFlowSettings>({});
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [sectorBase, setSectorBase] = useState<DateBase>("approval");
  const [sectorView, setSectorView] = useState<"periodo" | "mensal">("periodo");
  const [productSort, setProductSort] = useState<ProductSort>("marginValue");
  const [productSector, setProductSector] = useState<Sector | "todos">("todos");

  useEffect(() => {
    (async () => {
      const [setRes, sellersRes] = await Promise.all([
        getCashFlowSettings(),
        supabase.from("sellers").select("id,name,monthly_target,active").order("name", { ascending: true }),
      ]);
      if (setRes.ok) setSettings(setRes.data ?? {});
      if (Array.isArray(sellersRes.data)) setSellers(sellersRes.data as SellerRow[]);
    })();
  }, []);

  const qs = Array.isArray(quotes) ? quotes : [];
  const ps = Array.isArray(products) ? products : [];
  const byId = useMemo(() => ps.reduce((a, p) => { a[String(p.id)] = p; return a; }, {} as Record<string, any>), [ps]);
  const cancelledIds = useMemo(() => cancelledQuoteIdsFrom(sales), [sales]);

  const reliableStart = reliableStartOf(settings);
  const prev = previousPeriod(fromDate, toDate);
  const prevReliable = !isPeriodUnreliable(prev.from, reliableStart);
  const dreUsesApproval = settings.saleRecognitionDate === "approval";
  const periodDays = daysInRange(fromDate, toDate);
  const closedMonth = isClosedMonth(fromDate, toDate);

  // ─── 1) Resumo (base aprovação) ─────────────────────────────
  const sold = useMemo(() => soldQuotesIn(qs, cancelledIds, "approval", fromDate, toDate), [qs, cancelledIds, fromDate, toDate]);
  const soldPrev = useMemo(() => soldQuotesIn(qs, cancelledIds, "approval", prev.from, prev.to), [qs, cancelledIds, prev.from, prev.to]);
  const sumTotal = (list: Quote[]) => list.reduce((s, q) => s + toNum(q.totalPrice), 0);
  const total = sumTotal(sold);
  const count = sold.length;
  const ticket = count > 0 ? total / count : 0;
  const totalPrev = sumTotal(soldPrev);
  const countPrev = soldPrev.length;
  const ticketPrev = countPrev > 0 ? totalPrev / countPrev : 0;

  // ─── 2) Por setor ───────────────────────────────────────────
  const sectorData = (list: Quote[]) => {
    const rows = revenueBySector(list, byId);
    const totalList = sumTotal(list);
    const sectorsSum = SECTORS.reduce((s, sec) => s + rows[sec].revenue, 0);
    return { rows, total: totalList, semSetor: totalList - sectorsSum, count: list.length };
  };
  const sectorPeriod = useMemo(
    () => sectorData(soldQuotesIn(qs, cancelledIds, sectorBase, fromDate, toDate)),
    [qs, cancelledIds, sectorBase, fromDate, toDate, byId]
  );
  // Setores do maior para o menor valor vendido no período.
  const sectorsByRevenue = [...SECTORS].sort((a, b) => sectorPeriod.rows[b].revenue - sectorPeriod.rows[a].revenue);
  const sectorMonthly = useMemo(() => {
    if (sectorView !== "mensal") return [];
    return last12Months().map((m) => ({
      ...m,
      notConferred: isPeriodUnreliable(m.from, reliableStart),
      data: sectorData(soldQuotesIn(qs, cancelledIds, sectorBase, m.from, m.to)),
    }));
  }, [sectorView, qs, cancelledIds, sectorBase, byId, reliableStart]);

  // ─── 3) Conversão ───────────────────────────────────────────
  const conversion = useMemo(() => {
    const created = createdQuotesIn(qs, fromDate, toDate);
    const byOutcome = { aprovado: [] as Quote[], aberto: [] as Quote[], recusado: [] as Quote[], cancelado: [] as Quote[] };
    created.forEach((q) => byOutcome[quoteOutcome(q, cancelledIds)].push(q));

    const approvalDays = byOutcome.aprovado
      .map((q) => (ymdToTime(q.approvedAt) - ymdToTime(ymd(q.date))) / 86400000)
      .filter((d) => Number.isFinite(d) && d >= 0);
    const avgDays = approvalDays.length > 0 ? approvalDays.reduce((s, d) => s + d, 0) / approvalDays.length : null;

    // Por setor: orçamento com itens de mais de um setor conta em cada um;
    // valor = soma dos itens daquele setor.
    const sectorConv = SECTORS.map((sec) => {
      let createdQty = 0, approvedQty = 0, createdValue = 0, approvedValue = 0;
      created.forEach((q) => {
        const v = parseItems(q.items).filter((it) => inferSector(it, byId) === sec).reduce((s, it) => s + itemRevenue(it), 0);
        const has = parseItems(q.items).some((it) => inferSector(it, byId) === sec);
        if (!has) return;
        createdQty += 1; createdValue += v;
        if (quoteOutcome(q, cancelledIds) === "aprovado") { approvedQty += 1; approvedValue += v; }
      });
      return { key: sec, label: SECTOR_LABELS[sec], createdQty, approvedQty, createdValue, approvedValue };
    }).sort((a, b) => b.createdQty - a.createdQty || b.approvedQty - a.approvedQty);

    const sellerMap = new Map<string, { label: string; createdQty: number; approvedQty: number; createdValue: number; approvedValue: number }>();
    created.forEach((q) => {
      const label = (q.salesperson || "Sem vendedora").trim();
      const key = norm(label);
      const r = sellerMap.get(key) || { label, createdQty: 0, approvedQty: 0, createdValue: 0, approvedValue: 0 };
      r.createdQty += 1; r.createdValue += toNum(q.totalPrice);
      if (quoteOutcome(q, cancelledIds) === "aprovado") { r.approvedQty += 1; r.approvedValue += toNum(q.totalPrice); }
      sellerMap.set(key, r);
    });

    const reasons = new Map<string, { qty: number; value: number }>();
    byOutcome.recusado.forEach((q) => {
      const reason = q.lostReason
        ? q.lostReason === "Outro" && q.lostReasonDetail ? `Outro: ${q.lostReasonDetail}` : q.lostReason
        : "Sem motivo informado";
      const r = reasons.get(reason) || { qty: 0, value: 0 };
      r.qty += 1; r.value += toNum(q.totalPrice);
      reasons.set(reason, r);
    });

    return {
      created, byOutcome, avgDays, sectorConv,
      sellerConv: Array.from(sellerMap.entries()).map(([key, r]): ConvRow => ({ key, ...r })).sort((a, b) => b.createdQty - a.createdQty),
      reasons: Array.from(reasons.entries()).map(([reason, r]) => ({ reason, ...r })).sort((a, b) => b.qty - a.qty || b.value - a.value),
      createdValue: sumTotal(created),
      approvedValue: sumTotal(byOutcome.aprovado),
    };
  }, [qs, cancelledIds, fromDate, toDate, byId]);

  // ─── 4) Por vendedora ───────────────────────────────────────
  const sellerRows = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; goal: number | null; hasSeller: boolean }>();
    sellers.filter((s) => s.active !== false).forEach((s) => {
      map.set(norm(s.name), { name: s.name, total: 0, count: 0, goal: s.monthly_target != null ? Number(s.monthly_target) : null, hasSeller: true });
    });
    sold.forEach((q) => {
      const name = (q.salesperson || "Sem vendedora").trim();
      const key = norm(name);
      const r = map.get(key) || { name, total: 0, count: 0, goal: null, hasSeller: false };
      r.total += toNum(q.totalPrice); r.count += 1;
      map.set(key, r);
    });
    const convByKey = new Map<string, ConvRow>(conversion.sellerConv.map((c) => [c.key, c]));
    return Array.from(map.entries())
      .map(([key, r]) => {
        const conv = convByKey.get(key);
        const periodGoal = r.goal ? proportionalGoal(r.goal, fromDate, toDate) : 0;
        return {
          ...r,
          ticket: r.count > 0 ? r.total / r.count : 0,
          conversion: conv ? ratio(conv.approvedQty, conv.createdQty) : null,
          periodGoal,
          goalPct: periodGoal > 0 ? (r.total / periodGoal) * 100 : null,
        };
      })
      .filter((r) => r.hasSeller || r.count > 0)
      .sort((a, b) => b.total - a.total);
  }, [sellers, sold, conversion.sellerConv, fromDate, toDate]);

  // ─── 5) Margem por produto ──────────────────────────────────
  const minMargin = useMemo(() => settings.minMarginBySector || {}, [settings.minMarginBySector]);
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; sector: Sector; quantity: number; revenue: number; cost: number; labor: number }>();
    sold.forEach((q) => {
      parseItems(q.items).forEach((it) => {
        const key = String(it?.productId || "") || `nome:${norm(it?.productName)}`;
        const product = byId[String(it?.productId ?? "")];
        const r = map.get(key) || {
          name: product?.name || it?.productName || "Produto sem nome",
          sector: inferSector(it, byId), quantity: 0, revenue: 0, cost: 0, labor: 0,
        };
        r.quantity += Math.max(0, toNum(it?.quantity));
        r.revenue += itemRevenue(it);
        r.cost += itemCost(it);
        r.labor += itemLaborCost(it);
        map.set(key, r);
      });
    });
    return Array.from(map.values()).map((r) => {
      const marginValue = r.revenue - r.cost;
      const marginPct = r.revenue > 0 ? (marginValue / r.revenue) * 100 : 0;
      const min = minMargin[r.sector];
      const noCost = r.cost === 0;
      const belowMin = !noCost && min != null && r.revenue > 0 && marginPct < Number(min);
      return { ...r, material: r.cost - r.labor, marginValue, marginPct, noCost, belowMin };
    });
  }, [sold, byId, minMargin]);

  const productRowsView = useMemo(() => {
    const list = productSector === "todos" ? productRows : productRows.filter((r) => r.sector === productSector);
    const key = productSort;
    return [...list].sort((a, b) => (b as any)[key] - (a as any)[key]);
  }, [productRows, productSector, productSort]);
  const belowMinCount = productRows.filter((r) => r.belowMin).length;
  const noCostCount = productRows.filter((r) => r.noCost).length;

  // ─── 6) Top 10 clientes ─────────────────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    sold.forEach((q) => {
      const key = q.clientId ? `id:${q.clientId}` : `nome:${norm(q.customerName)}`;
      const r = map.get(key) || { name: q.customerName || "Cliente sem nome", total: 0, count: 0 };
      r.total += toNum(q.totalPrice); r.count += 1;
      map.set(key, r);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [sold]);

  // ─── Textos ─────────────────────────────────────────────────
  const baseText = dreUsesApproval
    ? "Base: data de aprovação — mesma base da DRE (Configurações)"
    : "Base: data de aprovação — difere da DRE, que usa data de entrega";

  const compareLine = (curr: number, before: number, isMoney: boolean) => {
    if (!prevReliable) return <p className="text-xs text-gray-400 mt-1">Sem comparação: período anterior não conferido</p>;
    const diff = curr - before;
    const variation = before !== 0 ? (diff / Math.abs(before)) * 100 : null;
    return (
      <p className={`text-xs mt-1 ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
        {diff >= 0 ? "▲" : "▼"} {variation !== null ? pct(Math.abs(variation)) : "—"} ({isMoney ? money(diff) : `${diff >= 0 ? "+" : ""}${diff}`}) vs período anterior
      </p>
    );
  };

  // ─── 7) PDF ─────────────────────────────────────────────────
  const handleExportPdf = () => {
    const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:4px 6px;border-bottom:1px solid #d1d5db;font-size:11px;color:#6b7280">${t}</th>`;
    const td = (t: string, right = false, style = "") => `<td style="text-align:${right ? "right" : "left"};padding:4px 6px;border-bottom:1px solid #f3f4f6;${style}">${t}</td>`;
    const table = (head: string[], rows: string[][], rightFrom = 1) =>
      `<table><thead><tr>${head.map((h, i) => th(h, i >= rightFrom)).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c, i) => td(c, i >= rightFrom)).join("")}</tr>`)
        .join("")}</tbody></table>`;

    const sectorRowsPdf = sectorsByRevenue.map((sec) => {
      const r = sectorPeriod.rows[sec];
      return [SECTOR_LABELS[sec], money(r.revenue), pct(ratio(r.revenue, sectorPeriod.total)), String(r.count), money(r.count > 0 ? r.revenue / r.count : 0)];
    });
    sectorRowsPdf.push(["Frete, instalação, ajustes e descontos (sem setor)", money(sectorPeriod.semSetor), pct(ratio(sectorPeriod.semSetor, sectorPeriod.total)), "", ""]);
    sectorRowsPdf.push(["<b>Total</b>", `<b>${money(sectorPeriod.total)}</b>`, "100,0%", String(sectorPeriod.count), money(sectorPeriod.count > 0 ? sectorPeriod.total / sectorPeriod.count : 0)]);

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório de Vendas</title>
      <style>@page{margin:15mm 12mm}body{font-family:Arial,sans-serif;font-size:12px;color:#111}
      h1{font-size:20px;color:#1e3a5f;margin:0 0 4px}h2{font-size:14px;color:#1e3a5f;margin:18px 0 6px}
      .sub{color:#6b7280;font-size:11px;margin-bottom:2px}.warn{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:6px 8px;border-radius:6px;margin:8px 0;font-size:11px}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}</style></head><body>
      <h1>Relatório de Vendas</h1>
      <div class="sub">Período: ${formatBR(fromDate)} a ${formatBR(toDate)}</div>
      <div class="sub">${baseText}</div>
      <div class="sub">Emitido em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
      ${isPeriodUnreliable(fromDate, reliableStart) ? `<div class="warn">Período anterior a ${formatBR(reliableStart)} — dados não conferidos, use apenas como referência</div>` : ""}

      <h2>Resumo</h2>
      ${table(["Indicador", "Valor", "Período anterior"], [
        ["Total vendido (aprovado)", money(total), prevReliable ? money(totalPrev) : "não conferido"],
        ["Nº de vendas", String(count), prevReliable ? String(countPrev) : "não conferido"],
        ["Ticket médio", money(ticket), prevReliable ? money(ticketPrev) : "não conferido"],
      ])}

      <h2>Vendas por setor — base ${sectorBase === "approval" ? "aprovação" : "entrega"}</h2>
      ${table(["Setor", "Valor", "% do total", "Nº vendas", "Ticket médio"], sectorRowsPdf)}

      <h2>Conversão de orçamentos (criados no período)</h2>
      ${table(["Indicador", "Valor"], [
        ["Orçamentos criados", `${conversion.created.length} (${money(conversion.createdValue)})`],
        ["Aprovados", `${conversion.byOutcome.aprovado.length} (${money(conversion.approvedValue)})`],
        ["Conversão por quantidade", pct(ratio(conversion.byOutcome.aprovado.length, conversion.created.length))],
        ["Conversão por valor", pct(ratio(conversion.approvedValue, conversion.createdValue))],
        ["Tempo médio criação → aprovação", conversion.avgDays !== null ? `${conversion.avgDays.toFixed(1).replace(".", ",")} dias` : "—"],
        ["Em aberto / Recusados / Cancelados", `${conversion.byOutcome.aberto.length} / ${conversion.byOutcome.recusado.length} / ${conversion.byOutcome.cancelado.length}`],
      ])}
      ${table(["Vendedora", "Criados", "Aprovados", "Conv. qtd", "Conv. valor"], conversion.sellerConv.map((r) => [
        r.label, String(r.createdQty), String(r.approvedQty), pct(ratio(r.approvedQty, r.createdQty)), pct(ratio(r.approvedValue, r.createdValue)),
      ]))}
      ${conversion.reasons.length > 0 ? table(["Motivo de perda", "Qtd", "Valor"], conversion.reasons.map((r) => [r.reason, String(r.qty), money(r.value)])) : ""}

      <h2>Vendas por vendedora${closedMonth ? "" : ` (meta proporcional a ${periodDays} dias)`}</h2>
      ${table(["Vendedora", "Vendido", "Nº", "Ticket", "Conversão", "Meta", "% meta"], sellerRows.map((r) => [
        r.name, money(r.total), String(r.count), money(r.ticket), r.conversion !== null ? pct(r.conversion) : "—",
        r.periodGoal > 0 ? money(r.periodGoal) : "—", r.goalPct !== null ? pct(r.goalPct) : "—",
      ]))}

      <h2>Margem sobre custo orçado (material + mão de obra)</h2>
      <div class="sub">${belowMinCount} produto(s) com preço abaixo do mínimo · ${noCostCount} sem custo cadastrado</div>
      <table><thead><tr>${["Produto", "Setor", "Qtd", "Receita", "Material", "Mão de obra", "Custo total", "Margem R$", "Margem %"].map((h, i) => th(h, i >= 2)).join("")}</tr></thead><tbody>
      ${productRowsView.map((r) => {
        const bg = r.noCost ? "background:#fef9c3" : r.belowMin ? "background:#fee2e2" : "";
        const tag = r.noCost ? " — sem custo cadastrado" : r.belowMin ? " — preço abaixo do mínimo" : "";
        return `<tr>${td(r.name + tag, false, bg)}${td(SECTOR_LABELS[r.sector], false, bg)}${td(r.quantity.toLocaleString("pt-BR"), true, bg)}${td(money(r.revenue), true, bg)}${td(money(r.material), true, bg)}${td(money(r.labor), true, bg)}${td(money(r.cost), true, bg)}${td(money(r.marginValue), true, bg)}${td(pct(r.marginPct), true, bg)}</tr>`;
      }).join("")}
      </tbody></table>

      <h2>Top 10 clientes</h2>
      ${table(["Cliente", "Valor", "Nº vendas", "% do total"], topClients.map((c) => [c.name, money(c.total), String(c.count), pct(ratio(c.total, total))]))}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("Permita pop-ups para gerar o PDF."); return; }
    win.document.write(html);
    win.document.close();
  };

  // ─── Render ─────────────────────────────────────────────────
  const sectorTotalRow = (d: ReturnType<typeof sectorData>) => d.total;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Vendas</h2>
          <p className="text-xs font-semibold text-blue-700">{baseText}</p>
          <p className="text-xs text-gray-500">Vendas canceladas não entram em nenhum número.</p>
        </div>
        <button onClick={handleExportPdf} className="px-3 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 self-start md:self-auto">
          Exportar PDF
        </button>
      </div>

      <UnreliablePeriodBanner fromDate={fromDate} reliableStart={reliableStart} />

      {/* 1) Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Total vendido (aprovado)</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{money(total)}</p>
          {compareLine(total, totalPrev, true)}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Nº de vendas</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{count}</p>
          {compareLine(count, countPrev, false)}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-purple-600">
          <p className="text-xs font-semibold text-gray-500 uppercase">Ticket médio</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{money(ticket)}</p>
          {compareLine(ticket, ticketPrev, true)}
        </div>
      </div>
      <p className="text-xs text-gray-400 -mt-2">
        Comparação com {formatBR(prev.from)} a {formatBR(prev.to)} (mesmo número de dias: {periodDays}).
      </p>

      {/* 2) Por setor */}
      <Section
        title="Vendas por setor"
        subtitle={
          sectorBase === "delivery"
            ? "Base Entrega — valores por setor iguais à \"Receita Bruta por Setor\" da DRE. Venda com itens de mais de um setor conta em cada setor."
            : "Base Aprovação. Venda com itens de mais de um setor conta em cada setor."
        }
        right={
          <div className="flex flex-wrap gap-2">
            <Toggle value={sectorBase} onChange={setSectorBase} options={[{ key: "approval", label: "Aprovação" }, { key: "delivery", label: "Entrega" }]} />
            <Toggle value={sectorView} onChange={setSectorView} options={[{ key: "periodo", label: "Período" }, { key: "mensal", label: "Mensal (12 meses)" }]} />
          </div>
        }
      >
        {sectorView === "periodo" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 px-2">Setor</th>
                  <th className="text-right py-1 px-2">Valor vendido</th>
                  <th className="text-right py-1 px-2">% do total</th>
                  <th className="text-right py-1 px-2">Nº vendas</th>
                  <th className="text-right py-1 px-2">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {sectorsByRevenue.map((sec) => {
                  const r = sectorPeriod.rows[sec];
                  return (
                    <tr key={sec} className="border-b border-gray-50">
                      <td className="py-1.5 px-2 font-semibold" style={{ color: SECTOR_COLORS[sec] }}>{SECTOR_LABELS[sec]}</td>
                      <td className="py-1.5 px-2 text-right font-bold">{money(r.revenue)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-500">{pct(ratio(r.revenue, sectorPeriod.total))}</td>
                      <td className="py-1.5 px-2 text-right">{r.count}</td>
                      <td className="py-1.5 px-2 text-right">{money(r.count > 0 ? r.revenue / r.count : 0)}</td>
                    </tr>
                  );
                })}
                <tr className="border-b border-gray-50 text-gray-500">
                  <td className="py-1.5 px-2">Frete, instalação, ajustes e descontos (sem setor)</td>
                  <td className={`py-1.5 px-2 text-right ${sectorPeriod.semSetor < 0 ? "text-red-600" : ""}`}>{money(sectorPeriod.semSetor)}</td>
                  <td className="py-1.5 px-2 text-right">{pct(ratio(sectorPeriod.semSetor, sectorPeriod.total))}</td>
                  <td className="py-1.5 px-2" colSpan={2} />
                </tr>
                <tr className="font-bold">
                  <td className="py-1.5 px-2">Total</td>
                  <td className="py-1.5 px-2 text-right">{money(sectorPeriod.total)}</td>
                  <td className="py-1.5 px-2 text-right">{sectorPeriod.total ? "100,0%" : "—"}</td>
                  <td className="py-1.5 px-2 text-right">{sectorPeriod.count}</td>
                  <td className="py-1.5 px-2 text-right">{money(sectorPeriod.count > 0 ? sectorPeriod.total / sectorPeriod.count : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Setor</th>
                  {sectorMonthly.map((m) => (
                    <th key={m.key} className={`text-right py-2 px-2 whitespace-nowrap ${m.notConferred ? "text-gray-400 bg-gray-50" : ""}`}>
                      {m.label}
                      {m.notConferred && <NotConferredTag />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...SECTORS.map((sec) => ({ key: sec as string, label: SECTOR_LABELS[sec], color: SECTOR_COLORS[sec], get: (d: ReturnType<typeof sectorData>) => d.rows[sec].revenue })),
                  { key: "sem", label: "Sem setor (frete/instalação/ajustes)", color: "#6b7280", get: (d: ReturnType<typeof sectorData>) => d.semSetor },
                  { key: "total", label: "Total", color: "#111827", get: sectorTotalRow },
                ].map((row) => (
                  <tr key={row.key} className={row.key === "total" ? "font-bold border-t" : ""}>
                    <td className="py-1.5 px-2 whitespace-nowrap font-semibold" style={{ color: row.color }}>{row.label}</td>
                    {sectorMonthly.map((m) => (
                      <td key={m.key} className={`py-1.5 px-2 text-right whitespace-nowrap ${m.notConferred ? "text-gray-400 bg-gray-50" : ""}`}>
                        {money(row.get(m.data))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 3) Conversão */}
      <Section
        title="Conversão de orçamentos"
        subtitle="Orçamentos criados no período e o que aconteceu com cada um até hoje. Vendas cadastradas do sistema antigo ficam de fora."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Criados", value: String(conversion.created.length), sub: money(conversion.createdValue) },
            { label: "Aprovados", value: String(conversion.byOutcome.aprovado.length), sub: money(conversion.approvedValue) },
            { label: "Conversão (qtd)", value: pct(ratio(conversion.byOutcome.aprovado.length, conversion.created.length)), sub: "aprovados ÷ criados" },
            { label: "Conversão (valor)", value: pct(ratio(conversion.approvedValue, conversion.createdValue)), sub: "R$ aprovado ÷ R$ orçado" },
            { label: "Tempo médio até aprovar", value: conversion.avgDays !== null ? `${conversion.avgDays.toFixed(1).replace(".", ",")} dias` : "—", sub: "criação → aprovação" },
            { label: "Em aberto", value: String(conversion.byOutcome.aberto.length), sub: money(sumTotal(conversion.byOutcome.aberto)) },
            { label: "Recusados", value: String(conversion.byOutcome.recusado.length), sub: money(sumTotal(conversion.byOutcome.recusado)) },
            { label: "Cancelados", value: String(conversion.byOutcome.cancelado.length), sub: money(sumTotal(conversion.byOutcome.cancelado)) },
          ].map((c) => (
            <div key={c.label} className="border rounded-lg p-3">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-lg font-bold text-gray-800">{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: "Por setor", rows: conversion.sectorConv.map((r) => ({ ...r, color: SECTOR_COLORS[r.key as Sector] })) },
            { title: "Por vendedora", rows: conversion.sellerConv.map((r) => ({ ...r, color: "#374151" })) },
          ].map((block) => (
            <div key={block.title} className="overflow-x-auto">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{block.title}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left py-1 px-2" />
                    <th className="text-right py-1 px-2">Criados</th>
                    <th className="text-right py-1 px-2">Aprovados</th>
                    <th className="text-right py-1 px-2">Conv. qtd</th>
                    <th className="text-right py-1 px-2">Conv. valor</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.key} className="border-b border-gray-50">
                      <td className="py-1.5 px-2 font-semibold" style={{ color: r.color }}>{r.label}</td>
                      <td className="py-1.5 px-2 text-right">{r.createdQty}</td>
                      <td className="py-1.5 px-2 text-right">{r.approvedQty}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{pct(ratio(r.approvedQty, r.createdQty))}</td>
                      <td className="py-1.5 px-2 text-right">{pct(ratio(r.approvedValue, r.createdValue))}</td>
                    </tr>
                  ))}
                  {block.rows.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-gray-400 py-3">Nenhum orçamento criado no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Motivos de perda (recusados)</p>
          {conversion.reasons.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum orçamento recusado entre os criados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 px-2">#</th>
                  <th className="text-left py-1 px-2">Motivo</th>
                  <th className="text-right py-1 px-2">Qtd</th>
                  <th className="text-right py-1 px-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {conversion.reasons.map((r, i) => (
                  <tr key={r.reason} className="border-b border-gray-50">
                    <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                    <td className={`py-1.5 px-2 ${r.reason === "Sem motivo informado" ? "text-gray-400 italic" : ""}`}>{r.reason}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{r.qty}</td>
                    <td className="py-1.5 px-2 text-right">{money(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-gray-400 mt-1">Opções: {LOST_REASONS.join(" | ")}. Recusados antes desta versão aparecem como "Sem motivo informado".</p>
        </div>
      </Section>

      {/* 4) Por vendedora */}
      <Section
        title="Vendas por vendedora"
        subtitle={closedMonth ? "Meta do mês (cadastro de Vendedoras)." : `Período não é um mês fechado — meta proporcional aos ${periodDays} dias do período.`}
      >
        <div className="space-y-3">
          {sellerRows.map((r, i) => (
            <div key={r.name} className="border rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-800">
                  <span className="text-gray-400 text-xs mr-2">#{i + 1}</span>{r.name}
                </span>
                <span className="font-bold text-gray-800">{money(r.total)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-gray-500 mt-1">
                <span>Vendas: <b className="text-gray-700">{r.count}</b></span>
                <span>Ticket: <b className="text-gray-700">{money(r.ticket)}</b></span>
                <span>Conversão: <b className="text-gray-700">{r.conversion !== null ? pct(r.conversion) : "—"}</b></span>
                <span>Meta: <b className="text-gray-700">{r.periodGoal > 0 ? money(r.periodGoal) : "sem meta"}</b></span>
                <span>Atingido: <b style={{ color: r.goalPct !== null ? goalColor(r.goalPct) : undefined }}>{r.goalPct !== null ? pct(r.goalPct) : "—"}</b></span>
              </div>
              {r.goalPct !== null && (
                <div className="mt-2 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.goalPct)}%`, backgroundColor: goalColor(r.goalPct) }} />
                </div>
              )}
            </div>
          ))}
          {sellerRows.length === 0 && <p className="text-sm text-gray-400">Nenhuma venda no período.</p>}
        </div>
      </Section>

      {/* 5) Margem por produto */}
      <Section
        title="Margem sobre custo orçado (material + mão de obra)"
        subtitle={`Produtos vendidos no período (base aprovação). Material inclui montagem/cuba/acessórios quando houver. ${belowMinCount} com preço abaixo do mínimo · ${noCostCount} sem custo cadastrado.`}
        right={
          <div className="flex flex-wrap gap-2">
            <select value={productSector} onChange={(e) => setProductSector(e.target.value as Sector | "todos")} className="border rounded-lg px-2 py-1 text-xs">
              <option value="todos">Todos os setores</option>
              {SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
            </select>
            <select value={productSort} onChange={(e) => setProductSort(e.target.value as ProductSort)} className="border rounded-lg px-2 py-1 text-xs">
              <option value="marginValue">Ordenar: margem R$</option>
              <option value="marginPct">Ordenar: margem %</option>
              <option value="revenue">Ordenar: receita</option>
              <option value="quantity">Ordenar: quantidade</option>
            </select>
          </div>
        }
      >
        {Object.keys(minMargin).length === 0 && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
            Defina a margem mínima por setor em Configurações → Plano de Contas (seção DRE) para destacar preços abaixo do mínimo.
          </p>
        )}
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left py-1 px-2">Produto</th>
                <th className="text-left py-1 px-2">Setor</th>
                <th className="text-right py-1 px-2">Qtd</th>
                <th className="text-right py-1 px-2">Receita</th>
                <th className="text-right py-1 px-2">Material</th>
                <th className="text-right py-1 px-2">Mão de obra</th>
                <th className="text-right py-1 px-2">Custo total</th>
                <th className="text-right py-1 px-2">Margem R$</th>
                <th className="text-right py-1 px-2">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {productRowsView.map((r) => (
                <tr key={`${r.sector}-${r.name}`} className={`border-b border-gray-50 ${r.noCost ? "bg-yellow-50" : r.belowMin ? "bg-red-50" : ""}`}>
                  <td className="py-1.5 px-2">
                    {r.name}
                    {r.noCost && <span className="ml-2 text-[10px] font-semibold uppercase bg-yellow-200 text-yellow-900 px-1.5 py-0.5 rounded">sem custo cadastrado</span>}
                    {r.belowMin && <span className="ml-2 text-[10px] font-semibold uppercase bg-red-200 text-red-900 px-1.5 py-0.5 rounded">preço abaixo do mínimo</span>}
                  </td>
                  <td className="py-1.5 px-2" style={{ color: SECTOR_COLORS[r.sector] }}>{SECTOR_LABELS[r.sector]}</td>
                  <td className="py-1.5 px-2 text-right">{r.quantity.toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 px-2 text-right">{money(r.revenue)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600">{money(r.material)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600">{money(r.labor)}</td>
                  <td className="py-1.5 px-2 text-right">{money(r.cost)}</td>
                  <td className={`py-1.5 px-2 text-right font-semibold ${r.marginValue < 0 ? "text-red-600" : ""}`}>{money(r.marginValue)}</td>
                  <td className={`py-1.5 px-2 text-right ${r.belowMin ? "text-red-700 font-bold" : ""}`}>
                    {pct(r.marginPct)}
                    {r.belowMin && minMargin[r.sector] != null && <span className="block text-[10px] text-red-500">mín. {minMargin[r.sector]}%</span>}
                  </td>
                </tr>
              ))}
              {productRowsView.length === 0 && (
                <tr><td colSpan={9} className="text-center text-gray-400 py-4">Nenhum produto vendido no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 6) Top 10 clientes */}
      <Section title="Top 10 clientes" subtitle="Maior valor aprovado no período.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b">
              <th className="text-left py-1 px-2">#</th>
              <th className="text-left py-1 px-2">Cliente</th>
              <th className="text-right py-1 px-2">Valor</th>
              <th className="text-right py-1 px-2">Nº vendas</th>
              <th className="text-right py-1 px-2">% do total</th>
            </tr>
          </thead>
          <tbody>
            {topClients.map((c, i) => (
              <tr key={`${c.name}-${i}`} className="border-b border-gray-50">
                <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                <td className="py-1.5 px-2 font-medium">{c.name}</td>
                <td className="py-1.5 px-2 text-right font-bold text-green-700">{money(c.total)}</td>
                <td className="py-1.5 px-2 text-right">{c.count}</td>
                <td className="py-1.5 px-2 text-right text-gray-500">{pct(ratio(c.total, total))}</td>
              </tr>
            ))}
            {topClients.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-400 py-4">Nenhuma venda no período.</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
};

export default SalesReport;
