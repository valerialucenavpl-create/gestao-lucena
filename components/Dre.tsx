import React, { useEffect, useMemo, useState } from "react";
import { CashFlowCategory, CashFlowEntry, CashFlowSettings, DreGroup, Product, Quote, Sale } from "../types";
import { getCashFlowCategories } from "../services/cashflowCategoriesServices";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import { updateCashFlowEntry } from "../services/cashFlowServices";
import UnreliablePeriodBanner, { NotConferredTag } from "./common/UnreliablePeriodBanner";
import {
  Sector, SECTORS, SECTOR_COLORS, inferSector, parseItems, itemRevenue, itemCost, itemMaterialCost,
  cancelledQuoteIdsFrom, isCancelledSale, reliableStartOf, isPeriodUnreliable, timeToYmd,
} from "../utils/salesReport";

// ─── Helpers ────────────────────────────────────────────────
const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const toISO = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const ymdToTime = (ymd?: string) => {
  if (!ymd) return NaN;
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};
const inRange = (ymd: string | undefined, fromT: number, toT: number) => {
  const t = ymdToTime(ymd);
  if (Number.isNaN(t)) return false;
  return t >= fromT && t <= toT;
};
const daysBetween = (fromT: number, toT: number) => Math.max(1, Math.round((toT - fromT) / 86400000) + 1);
const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};

type Props = {
  quotes?: Quote[] | null;
  // Usado só pra saber quais pedidos tiveram a venda cancelada em Vendas
  // (o cancelamento fica em sales.status; o orçamento continua Aprovado).
  sales?: Sale[] | null;
  cashFlow?: CashFlowEntry[] | null;
  products?: Product[] | null;
  onUpdateQuote?: (u: any) => Promise<{ ok: boolean; error?: any }>;
  onCashFlowChanged?: () => Promise<void>;
  // Período único, controlado pela tela de Relatórios (mesmo filtro pras
  // outras abas) — a DRE só mantém internamente o toggle "Mensal".
  fromDate: string;
  toDate: string;
};

type CatKey = string; // `${type}||${category}||${subcategory}`

const catKey = (type: string, category: string, subcategory: string) =>
  `${type}||${(category || "").trim()}||${(subcategory || "").trim()}`;

// Monta os grupos DRE de um conjunto de lançamentos de Caixa já filtrados
// dentro do período (Saída por competência; Entrada extra sem orcamento_id).
function buildDreGroups(entries: CashFlowEntry[], catMap: Map<CatKey, CashFlowCategory>) {
  const groups = new Map<DreGroup, { total: number; bySub: Map<string, { amount: number; entries: CashFlowEntry[] }> }>();
  const unmapped = new Map<string, { count: number; amount: number }>();

  for (const e of entries) {
    if (e.isTransfer) continue;
    const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
    const grupoDre = cat?.grupoDre;
    if (!cat) {
      const k = `${e.type}||${e.category || "(sem categoria)"}||${e.subcategory || "(sem subcategoria)"}`;
      const ex = unmapped.get(k);
      if (ex) { ex.count += 1; ex.amount += toNum(e.amount); }
      else unmapped.set(k, { count: 1, amount: toNum(e.amount) });
      continue;
    }
    if (!grupoDre || grupoDre === "NAO_ENTRA") continue;

    const g = groups.get(grupoDre) || { total: 0, bySub: new Map() };
    g.total += toNum(e.amount);
    const subKey = e.subcategory || "-";
    const sub = g.bySub.get(subKey) || { amount: 0, entries: [] };
    sub.amount += toNum(e.amount);
    sub.entries.push(e);
    g.bySub.set(subKey, sub);
    groups.set(grupoDre, g);
  }

  return { groups, unmapped };
}

const Dre: React.FC<Props> = ({ quotes, sales, cashFlow, products, onUpdateQuote, onCashFlowChanged, fromDate, toDate }) => {
  const now = new Date();
  const [viewMode, setViewMode] = useState<"periodo" | "mensal">("periodo");
  const [expandedGroup, setExpandedGroup] = useState<DreGroup | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [showSemCustoList, setShowSemCustoList] = useState(false);

  const [categoriesDb, setCategoriesDb] = useState<CashFlowCategory[]>([]);
  const [settings, setSettings] = useState<CashFlowSettings>({});

  useEffect(() => {
    const load = async () => {
      const [catRes, setRes] = await Promise.all([getCashFlowCategories(), getCashFlowSettings()]);
      if (catRes.ok) setCategoriesDb(catRes.data ?? []);
      if (setRes.ok) setSettings(setRes.data ?? {});
    };
    load();
  }, []);

  const catMap = useMemo(() => {
    const m = new Map<CatKey, CashFlowCategory>();
    for (const c of categoriesDb) m.set(catKey(c.type, c.category, c.subcategory), c);
    return m;
  }, [categoriesDb]);

  const qs = Array.isArray(quotes) ? quotes : [];
  const cf = Array.isArray(cashFlow) ? cashFlow : [];
  const ps = Array.isArray(products) ? products : [];
  const byId = useMemo(() => ps.reduce((a, p) => { a[String(p.id)] = p; return a; }, {} as Record<string, any>), [ps]);

  const recognitionField: "approvedAt" | "deliveredAt" =
    settings.saleRecognitionDate === "approval" ? "approvedAt" : "deliveredAt";

  // Venda cancelada não gera receita nem custo — nem a cancelada em Vendas
  // (o orçamento continua "Aprovado", só a venda fica "Cancelado").
  const cancelledQuoteIds = useMemo(() => cancelledQuoteIdsFrom(sales), [sales]);
  const reliableStart = reliableStartOf(settings);

  const buildPeriod = (fromT: number, toT: number) => {
    const recognizedQuotes = qs.filter((q) => {
      if (q.status !== "Aprovado" || isCancelledSale(q, cancelledQuoteIds)) return false;
      const d = (q as any)[recognitionField] as string | undefined;
      return inRange(d, fromT, toT);
    });

    const bySector: Record<Sector, number> = { VIDROS: 0, "ALUMÍNIO": 0, "MÁRMORE": 0, PORTÃO: 0 };
    recognizedQuotes.forEach((q) => {
      parseItems((q as any).items).forEach((item: any) => {
        // item.price já é o total da linha (unitário × quantidade).
        bySector[inferSector(item, byId)] += itemRevenue(item);
      });
    });
    const revenueFromQuoteItems = SECTORS.reduce((s, sec) => s + bySector[sec], 0);
    const revenueExtras = recognizedQuotes.reduce(
      (s, q) => s + toNum((q as any).freight) + toNum((q as any).installation) + toNum((q as any).priceDifference),
      0
    );

    const materialMode = settings.materialCostMode || "budgeted";

    const cfNoQuote = cf.filter((e) => !e.orcamentoId && !e.isTransfer);
    const cfEntradaInPeriod = cfNoQuote.filter((e) => e.type === "Entrada" && inRange(e.date, fromT, toT));
    const cfSaidaInPeriod = cf.filter(
      (e) => e.type === "Saída" && !e.isTransfer && inRange(e.competenciaDate || e.date, fromT, toT)
    );

    // "compra de mercadorias" some da DRE no modo custo orçado (continua na
    // DFC normalmente) — no lugar entra "Material aplicado" pelo custo
    // orçado dos pedidos CONCLUÍDOS no período (não pelos reconhecidos por
    // aprovação, se essa for a regra de receita escolhida).
    const isCompraMercadorias = (e: CashFlowEntry) => (e.subcategory || "").trim().toLowerCase() === "compra de mercadorias";
    const comprasMercadorias = cfSaidaInPeriod.filter(isCompraMercadorias).reduce((s, e) => s + toNum(e.amount), 0);

    const materialQuotes = qs.filter(
      (q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledQuoteIds) && inRange((q as any).deliveredAt, fromT, toT)
    );
    // Sem pedido concluído cadastrado no período (ex.: meses em que só se
    // usava o Caixa direto, antes de existir cadastro de pedidos), custo
    // orçado = zero — nesse caso NÃO tira "compra de mercadorias" do Custo
    // Direto, senão o mês fica com custo zerado escondendo compras reais.
    const useBudgetedMaterial = materialMode === "budgeted" && materialQuotes.length > 0;
    const cfSaidaForDre = useBudgetedMaterial ? cfSaidaInPeriod.filter((e) => !isCompraMercadorias(e)) : cfSaidaInPeriod;
    const materialAplicadoBySector: Record<Sector, number> = { VIDROS: 0, "ALUMÍNIO": 0, "MÁRMORE": 0, PORTÃO: 0 };
    const pedidosSemCustoOrcado: Quote[] = [];
    materialQuotes.forEach((q) => {
      let quoteCost = 0;
      parseItems((q as any).items).forEach((item: any) => {
        // Só a parte de material — a mão de obra do custo orçado já está
        // nos salários (Despesas com Pessoal); somar aqui contava duas vezes.
        materialAplicadoBySector[inferSector(item, byId)] += itemMaterialCost(item);
        quoteCost += itemCost(item);
      });
      if (quoteCost === 0) pedidosSemCustoOrcado.push(q);
    });
    const materialAplicadoTotal = SECTORS.reduce((s, sec) => s + materialAplicadoBySector[sec], 0);
    const receitaPedidosSemCusto = pedidosSemCustoOrcado.reduce((s, q) => s + toNum(q.totalPrice), 0);

    const { groups: entradaGroups, unmapped: entradaUnmapped } = buildDreGroups(cfEntradaInPeriod, catMap);
    const { groups: saidaGroups, unmapped: saidaUnmapped } = buildDreGroups(cfSaidaForDre, catMap);

    const cfReceitaBrutaExtra = entradaGroups.get("RECEITA_BRUTA")?.total || 0;
    const outrasReceitas = entradaGroups.get("OUTRAS_RECEITAS")?.total || 0;
    const resultadoFinanceiroEntrada = entradaGroups.get("RESULTADO_FINANCEIRO")?.total || 0;
    const resultadoFinanceiroSaida = saidaGroups.get("RESULTADO_FINANCEIRO")?.total || 0;

    const receitaBruta = revenueFromQuoteItems + revenueExtras + cfReceitaBrutaExtra;
    const deducoes = saidaGroups.get("DEDUCOES")?.total || 0;
    // Devoluções ao cliente (Finanças do Pedido → Registrar devolução) ficam
    // em DEDUÇÕES → "devoluções de vendas": deduzem a receita bruta e saem
    // numa linha própria, nunca como despesa operacional.
    const devolucoes = saidaGroups.get("DEDUCOES")?.bySub.get("devoluções de vendas")?.amount || 0;
    const receitaLiquida = receitaBruta - deducoes;
    const custoDireto = (saidaGroups.get("CUSTO_DIRETO")?.total || 0) + (useBudgetedMaterial ? materialAplicadoTotal : 0);
    const lucroBruto = receitaLiquida - custoDireto;
    const despesaVariavel = saidaGroups.get("DESPESA_VARIAVEL")?.total || 0;
    const margemContribuicao = lucroBruto - despesaVariavel;
    const despesaPessoal = saidaGroups.get("DESPESA_PESSOAL")?.total || 0;
    const despesaFixa = saidaGroups.get("DESPESA_FIXA")?.total || 0;
    const resultadoOperacional = margemContribuicao - despesaPessoal - despesaFixa;
    const resultadoFinanceiro = resultadoFinanceiroEntrada - resultadoFinanceiroSaida;
    const lucroLiquido = resultadoOperacional + outrasReceitas + resultadoFinanceiro;

    const recebidoVendas = cf
      .filter((e) => e.type === "Entrada" && e.orcamentoId && !e.isTransfer && inRange(e.date, fromT, toT))
      .reduce((s, e) => s + toNum(e.amount), 0);

    const unmappedAll = new Map(entradaUnmapped);
    saidaUnmapped.forEach((v, k) => {
      const ex = unmappedAll.get(k);
      if (ex) { ex.count += v.count; ex.amount += v.amount; }
      else unmappedAll.set(k, v);
    });

    return {
      bySector, receitaBruta, revenueFromQuoteItems, revenueExtras, cfReceitaBrutaExtra,
      deducoes, devolucoes, receitaLiquida, custoDireto, lucroBruto, despesaVariavel, margemContribuicao,
      despesaPessoal, despesaFixa, resultadoOperacional, outrasReceitas, resultadoFinanceiro, lucroLiquido,
      entradaGroups, saidaGroups, recebidoVendas, unmappedAll, recognizedQuotesCount: recognizedQuotes.length,
      materialMode, useBudgetedMaterial, materialAplicadoBySector, materialAplicadoTotal, comprasMercadorias,
      pedidosSemCustoOrcado, receitaPedidosSemCusto,
    };
  };

  const fromT = ymdToTime(fromDate);
  const toT = ymdToTime(toDate);
  const current = useMemo(() => buildPeriod(fromT, toT), [fromT, toT, qs, cf, catMap, byId, recognitionField, cancelledQuoteIds]);

  const prevFromT = fromT - daysBetween(fromT, toT) * 86400000;
  const prevPeriod = useMemo(() => {
    const prevToT = fromT - 86400000;
    return buildPeriod(prevFromT, prevToT);
  }, [fromT, toT, qs, cf, catMap, byId, recognitionField, cancelledQuoteIds]);
  // Só compara quando o período anterior inteiro é posterior ao início dos
  // dados confiáveis (Configurações).
  const prevReliable = !isPeriodUnreliable(timeToYmd(prevFromT), reliableStart);

  // Alertas — antes ficavam na aba "Visão Geral" (removida), agora saem
  // direto da DRE e usam a meta única de margem líquida de Configurações.
  const dreAlerts = useMemo(() => {
    if (settings.targetNetMargin == null) return null;

    const despesasTotais = current.deducoes - current.devolucoes + current.custoDireto + current.despesaVariavel + current.despesaPessoal + current.despesaFixa;
    const despesasTotaisPrev = prevPeriod.deducoes - prevPeriod.devolucoes + prevPeriod.custoDireto + prevPeriod.despesaVariavel + prevPeriod.despesaPessoal + prevPeriod.despesaFixa;
    const expenseGrowth = prevReliable && despesasTotaisPrev > 0 ? ((despesasTotais - despesasTotaisPrev) / despesasTotaisPrev) * 100 : null;
    const revenueGrowth = prevReliable && prevPeriod.receitaBruta > 0 ? ((current.receitaBruta - prevPeriod.receitaBruta) / prevPeriod.receitaBruta) * 100 : null;
    const margemLiquidaPctLocal = current.receitaBruta > 0 ? (current.lucroLiquido / current.receitaBruta) * 100 : 0;

    const list: { type: "danger" | "warning"; msg: string }[] = [];
    if (current.lucroLiquido < 0 && current.receitaBruta > 0) {
      list.push({ type: "danger", msg: `Prejuízo no período: ${money(Math.abs(current.lucroLiquido))}.` });
    }
    if (current.receitaBruta > 0 && margemLiquidaPctLocal < settings.targetNetMargin!) {
      list.push({ type: "danger", msg: `Margem líquida abaixo da meta: ${pct(margemLiquidaPctLocal)} (meta: ${settings.targetNetMargin}%).` });
    }
    if (expenseGrowth !== null && expenseGrowth > 20) {
      list.push({ type: "warning", msg: `Despesas subiram ${pct(expenseGrowth)} em relação ao período anterior.` });
    }
    if (revenueGrowth !== null && revenueGrowth < -10) {
      list.push({ type: "warning", msg: `Faturamento caiu ${pct(Math.abs(revenueGrowth))} em relação ao período anterior.` });
    }
    if (current.receitaBruta > 0 && despesasTotais / current.receitaBruta > 0.85) {
      list.push({ type: "warning", msg: `Despesas representam ${pct((despesasTotais / current.receitaBruta) * 100)} da receita bruta. Ideal: abaixo de 85%.` });
    }
    return list;
  }, [current, prevPeriod, prevReliable, settings.targetNetMargin]);

  // Compras x Material aplicado — acumulado dos últimos 3 meses (fixo, não
  // segue o filtro de período escolhido acima).
  const last3Months = useMemo(() => {
    const from3 = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    return buildPeriod(from3, now.getTime());
  }, [qs, cf, catMap, byId, recognitionField, settings.materialCostMode, cancelledQuoteIds]);

  const [pedidosClienteFilter, setPedidosClienteFilter] = useState("");
  const [pedidosDaysFilter, setPedidosDaysFilter] = useState<"todos" | "0-30" | "31-60" | "61-90" | "90+">("todos");

  const todayStr = toISO(now);

  // Pedidos ainda em andamento: aguardando entrega ou entregues com saldo a
  // receber. Fica de fora: venda cancelada em Vendas (o orçamento continua
  // "Aprovado", só a venda é marcada Cancelado), venda concluída e pedido
  // entregue que já foi pago por inteiro (na prática, concluído).
  const pedidosEmAbertoAll = useMemo(() => {
    return qs
      .filter((q) => q.status === "Aprovado" && !q.saleCompleted && !cancelledQuoteIds.has(String(q.id)))
      .map((q) => {
        const recebido = cf
          .filter((e) => e.type === "Entrada" && !e.isTransfer && String(e.orcamentoId) === String(q.id))
          .reduce((s, e) => s + toNum(e.amount), 0);
        const approvalT = ymdToTime((q as any).approvedAt) || ymdToTime((q as any).date);
        const days = Number.isNaN(approvalT) ? 0 : Math.max(0, Math.round((Date.now() - approvalT) / 86400000));
        const totalPrice = toNum(q.totalPrice);
        const pctRecebido = totalPrice > 0 ? (recebido / totalPrice) * 100 : 0;
        const deliveryDate = (q as any).deliveryDate || "";
        const isLate = Boolean(deliveryDate) && deliveryDate < todayStr;
        return {
          id: q.id, quoteNumber: q.quoteNumber, customerName: q.customerName,
          approvalDate: (q as any).approvedAt || q.date, totalPrice,
          recebido, days, pctRecebido, deliveryDate, isLate,
          contactLog: q.contactLog,
          entregue: Boolean((q as any).deliveredAt),
        };
      })
      .filter((p) => !(p.entregue && p.recebido >= p.totalPrice - 0.005))
      .sort((a, b) => b.days - a.days);
  }, [qs, cf, todayStr, cancelledQuoteIds]);

  const pedidosEmAberto = useMemo(() => {
    const term = pedidosClienteFilter.trim().toLowerCase();
    return pedidosEmAbertoAll.filter((p) => {
      if (term && !p.customerName.toLowerCase().includes(term)) return false;
      if (pedidosDaysFilter === "0-30" && !(p.days <= 30)) return false;
      if (pedidosDaysFilter === "31-60" && !(p.days >= 31 && p.days <= 60)) return false;
      if (pedidosDaysFilter === "61-90" && !(p.days >= 61 && p.days <= 90)) return false;
      if (pedidosDaysFilter === "90+" && !(p.days > 90)) return false;
      return true;
    });
  }, [pedidosEmAbertoAll, pedidosClienteFilter, pedidosDaysFilter]);
  const totalRecebidoAberto = pedidosEmAberto.reduce((s, p) => s + p.recebido, 0);

  const margemPorSetorEstimada = useMemo(() => {
    const base: Record<Sector, { revenue: number; cost: number }> = {
      VIDROS: { revenue: 0, cost: 0 }, "ALUMÍNIO": { revenue: 0, cost: 0 },
      "MÁRMORE": { revenue: 0, cost: 0 }, PORTÃO: { revenue: 0, cost: 0 },
    };
    qs.filter((q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledQuoteIds) && inRange((q as any)[recognitionField], fromT, toT)).forEach((q) => {
      parseItems((q as any).items).forEach((item: any) => {
        const sector = inferSector(item, byId);
        base[sector].revenue += itemRevenue(item);
        base[sector].cost += itemCost(item);
      });
    });
    return SECTORS.map((s) => ({
      sector: s, revenue: base[s].revenue, cost: base[s].cost,
      margin: base[s].revenue > 0 ? ((base[s].revenue - base[s].cost) / base[s].revenue) * 100 : 0,
    }));
  }, [qs, byId, fromT, toT, recognitionField, cancelledQuoteIds]);

  const monthly = useMemo(() => {
    if (viewMode !== "mensal") return [];
    const months: { key: string; label: string; fromT: number; toT: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        fromT: from.getTime(), toT: to.getTime(),
      });
    }
    return months.map((m) => ({
      ...m,
      data: buildPeriod(m.fromT, m.toT),
      notConferred: isPeriodUnreliable(timeToYmd(m.fromT), reliableStart),
    }));
  }, [viewMode, qs, cf, catMap, byId, recognitionField, cancelledQuoteIds, reliableStart]);

  // ── "Sem setor" — checagem de possível duplicidade ──
  // Lançamentos de venda no Caixa sem orcamento_id cuja descrição cite um nº
  // de orçamento ou nome de cliente que bate com um orçamento existente —
  // podem já estar contados via o orçamento em si, então vale checar.
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const semSetorEntries = useMemo(() => {
    const group = current.entradaGroups.get("RECEITA_BRUTA");
    if (!group) return [];
    const entries: CashFlowEntry[] = [];
    group.bySub.forEach((data) => entries.push(...data.entries));
    return entries.map((e) => {
      const desc = norm(e.description || "");
      const numMatch = (e.description || "").match(/n[ºo°]\s*(\d+)/i) || (e.description || "").match(/quote:(\d+)/i);
      let matched: Quote | undefined;
      if (numMatch) {
        const num = numMatch[1];
        matched = qs.find((q) => String(q.quoteNumber) === num || String(q.id) === num);
      }
      if (!matched) {
        matched = qs.find((q) => q.customerName && desc.includes(norm(q.customerName)) && norm(q.customerName).length > 3);
      }
      return { entry: e, matched };
    });
  }, [current, qs]);
  const possibleDuplicates = semSetorEntries.filter((r) => r.matched);

  const handleLinkToQuote = async (entry: CashFlowEntry, quoteId: string) => {
    setLinkingId(entry.id);
    try {
      const { id, ...rest } = entry;
      const r = await updateCashFlowEntry(id, { ...rest, orcamentoId: quoteId });
      if (!r.ok) {
        alert("Não foi possível vincular: " + (r.error?.message ?? "ver console"));
        return;
      }
      await onCashFlowChanged?.();
    } finally {
      setLinkingId(null);
    }
  };

  const pctOfRevenue = (v: number) => (current.receitaBruta > 0 ? pct((v / current.receitaBruta) * 100) : "—");
  const varPct = (curr: number, prev: number) => (prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : curr !== 0 ? 100 : 0);

  const margemContribuicaoPct = current.receitaBruta > 0 ? (current.margemContribuicao / current.receitaBruta) * 100 : 0;
  const margemLiquidaPct = current.receitaBruta > 0 ? (current.lucroLiquido / current.receitaBruta) * 100 : 0;
  const pontoEquilibrio =
    margemContribuicaoPct > 0
      ? (current.despesaPessoal + current.despesaFixa) / (margemContribuicaoPct / 100)
      : null;
  const faltaFaturar = pontoEquilibrio !== null ? Math.max(0, pontoEquilibrio - current.receitaBruta) : null;

  const handleExportPdf = () => {
    const fmt = (n: number) => money(n);
    const line = (label: string, value: number, bold = false) => `
      <tr style="${bold ? "font-weight:700;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb" : ""}">
        <td style="padding:6px 8px">${label}</td>
        <td style="padding:6px 8px;text-align:right;${value < 0 ? "color:#dc2626" : ""}">${fmt(value)}</td>
        <td style="padding:6px 8px;text-align:right;color:#6b7280">${pctOfRevenue(value)}</td>
      </tr>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>DRE Gerencial</title>
      <style>@page{margin:20mm 15mm}body{font-family:Arial,sans-serif;font-size:13px;color:#111}
      h1{font-size:20px;color:#1e3a5f;margin:0 0 4px}.sub{color:#6b7280;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}</style></head><body>
      <h1>DRE Gerencial</h1>
      <div class="sub">Período: ${formatBR(fromDate)} a ${formatBR(toDate)} — gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
      <table>
        ${line("RECEITA BRUTA", current.receitaBruta, true)}
        ${line("(-) Devoluções de vendas", -current.devolucoes)}
        ${line("(-) Deduções", -(current.deducoes - current.devolucoes))}
        ${line("= RECEITA LÍQUIDA", current.receitaLiquida, true)}
        ${line("(-) Custo Direto", -current.custoDireto)}
        ${line("= LUCRO BRUTO", current.lucroBruto, true)}
        ${line("(-) Despesas Variáveis", -current.despesaVariavel)}
        ${line("= MARGEM DE CONTRIBUIÇÃO", current.margemContribuicao, true)}
        ${line("(-) Despesas com Pessoal", -current.despesaPessoal)}
        ${line("(-) Despesas Fixas", -current.despesaFixa)}
        ${line("= RESULTADO OPERACIONAL", current.resultadoOperacional, true)}
        ${line("(+) Outras Receitas", current.outrasReceitas)}
        ${line("(+/-) Resultado Financeiro", current.resultadoFinanceiro)}
        ${line("= LUCRO LÍQUIDO", current.lucroLiquido, true)}
      </table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("Permita pop-ups para gerar o PDF."); return; }
    win.document.write(html);
    win.document.close();
  };

  const Row = ({
    label, value, group, isSubtotal, indent,
  }: { label: string; value: number; group?: DreGroup; isSubtotal?: boolean; indent?: boolean }) => {
    const isExpanded = group && expandedGroup === group;
    const groupData = group ? (current.entradaGroups.get(group) || current.saidaGroups.get(group)) : undefined;
    return (
      <>
        <tr
          className={`${isSubtotal ? "font-bold border-t border-b bg-gray-50" : ""} ${group ? "cursor-pointer hover:bg-gray-50" : ""}`}
          onClick={() => group && setExpandedGroup(isExpanded ? null : group)}
        >
          <td className={`py-2 px-3 ${indent ? "pl-6 text-gray-600" : ""}`}>
            {group && <span className="text-gray-400 mr-1">{isExpanded ? "▾" : "▸"}</span>}
            {label}
          </td>
          <td className={`py-2 px-3 text-right ${value < 0 ? "text-red-600" : ""}`}>{money(value)}</td>
          <td className="py-2 px-3 text-right text-gray-400 text-xs">{pctOfRevenue(value)}</td>
        </tr>
        {isExpanded && groupData && (
          <tr>
            <td colSpan={3} className="bg-gray-50 px-3 pb-2">
              {Array.from(groupData.bySub.entries())
                .sort((a, b) => b[1].amount - a[1].amount)
                .map(([sub, data]) => (
                  <div key={sub}>
                    <div
                      className="flex justify-between text-xs py-1 pl-6 cursor-pointer hover:text-primary-600"
                      onClick={(ev) => { ev.stopPropagation(); setExpandedSub(expandedSub === `${group}-${sub}` ? null : `${group}-${sub}`); }}
                    >
                      <span>{sub}</span>
                      <span className="font-semibold">{money(data.amount)}</span>
                    </div>
                    {expandedSub === `${group}-${sub}` && (
                      <div className="pl-10 pb-1">
                        {data.entries.map((e) => (
                          <div key={e.id} className="flex justify-between text-xs text-gray-500 py-0.5">
                            <span>{formatBR(e.competenciaDate || e.date)} — {e.description || "-"}</span>
                            <span>{money(toNum(e.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtro de período */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">DRE Gerencial</h2>
          <p className="text-xs text-gray-500">
            Receita reconhecida por {recognitionField === "approvedAt" ? "aprovação do orçamento" : "conclusão da venda"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setViewMode("periodo")} className={`px-3 py-1 text-xs rounded-lg ${viewMode === "periodo" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Período</button>
          <button onClick={() => setViewMode("mensal")} className={`px-3 py-1 text-xs rounded-lg ${viewMode === "mensal" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Mensal (12 meses)</button>
          <button onClick={handleExportPdf} className="px-3 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700">Exportar PDF</button>
        </div>
      </div>

      {viewMode === "periodo" && <UnreliablePeriodBanner fromDate={fromDate} reliableStart={reliableStart} />}

      {/* Alertas */}
      {viewMode === "periodo" && (
        dreAlerts === null ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border bg-blue-50 border-blue-200 text-blue-700">
            ℹ️ Defina a meta de margem em Configurações.
          </div>
        ) : dreAlerts.length > 0 ? (
          <div className="space-y-2">
            {dreAlerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
                a.type === "danger" ? "bg-red-50 border-red-200 text-red-700" : "bg-yellow-50 border-yellow-200 text-yellow-700"
              }`}>
                <span>{a.type === "danger" ? "🚨" : "⚠️"}</span>
                {a.msg}
              </div>
            ))}
          </div>
        ) : null
      )}

      {viewMode === "mensal" ? (
        <div className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Linha</th>
                {monthly.map((m) => (
                  <th key={m.key} className={`text-right py-2 px-3 whitespace-nowrap ${m.notConferred ? "text-gray-400 bg-gray-50" : ""}`}>
                    {m.label}
                    {m.notConferred && <NotConferredTag />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Receita Bruta", key: "receitaBruta" },
                { label: "Receita Líquida", key: "receitaLiquida" },
                { label: "Lucro Bruto", key: "lucroBruto" },
                { label: "Margem de Contribuição", key: "margemContribuicao" },
                { label: "Resultado Operacional", key: "resultadoOperacional" },
                { label: "Lucro Líquido", key: "lucroLiquido" },
              ].map((row) => (
                <tr key={row.key} className={row.key === "lucroLiquido" ? "font-bold border-t" : ""}>
                  <td className="py-1.5 px-3">{row.label}</td>
                  {monthly.map((m) => {
                    const v = (m.data as any)[row.key] as number;
                    return (
                      <td key={m.key} className={`py-1.5 px-3 text-right ${m.notConferred ? "text-gray-400 bg-gray-50" : v < 0 ? "text-red-600" : ""}`}>
                        {money(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase">Margem de Contribuição</p>
              <p className="text-xl font-bold text-blue-600">{pct(margemContribuicaoPct)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase">Lucro Líquido</p>
              <p className={`text-xl font-bold ${current.lucroLiquido >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(current.lucroLiquido)}</p>
              <p className="text-xs text-gray-400">Margem: {pct(margemLiquidaPct)}{settings.targetNetMargin != null && ` (meta: ${settings.targetNetMargin}%)`}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase">Ponto de Equilíbrio</p>
              <p className="text-xl font-bold text-gray-700">{pontoEquilibrio !== null ? money(pontoEquilibrio) : "—"}</p>
              <p className="text-xs text-gray-400">
                {faltaFaturar !== null ? (faltaFaturar > 0 ? `Falta faturar ${money(faltaFaturar)}` : "Atingido ✅") : "Sem margem de contribuição"}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase">Meta de Margem Líquida</p>
              <p className="text-xl font-bold text-gray-700">{settings.targetNetMargin != null ? `${settings.targetNetMargin}%` : "Não definida"}</p>
              <p className={`text-xs ${margemLiquidaPct >= (settings.targetNetMargin ?? 0) ? "text-green-600" : "text-red-500"}`}>
                {settings.targetNetMargin != null && (margemLiquidaPct >= settings.targetNetMargin ? "Dentro da meta" : "Abaixo da meta")}
              </p>
            </div>
          </div>

          {/* Receita bruta por setor */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Receita Bruta por Setor</h3>
            <div className="space-y-2">
              {SECTORS.map((s) => (
                <div key={s} className="flex justify-between text-sm">
                  <span style={{ color: SECTOR_COLORS[s] }} className="font-semibold">{s}</span>
                  <span className="font-bold">{money(current.bySector[s])}</span>
                </div>
              ))}
              {(current.revenueExtras > 0 || current.cfReceitaBrutaExtra > 0) && (
                <div className="border-t pt-2">
                  <div
                    className="flex justify-between text-sm text-gray-500 cursor-pointer hover:text-primary-600"
                    onClick={() => setExpandedSub(expandedSub === "sem-setor" ? null : "sem-setor")}
                  >
                    <span>
                      <span className="text-gray-400 mr-1">{expandedSub === "sem-setor" ? "▾" : "▸"}</span>
                      Frete / instalação / ajustes / vendas de balcão (sem setor)
                      {possibleDuplicates.length > 0 && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{possibleDuplicates.length} possível(is) duplicidade(s)</span>
                      )}
                    </span>
                    <span className="font-medium">{money(current.revenueExtras + current.cfReceitaBrutaExtra)}</span>
                  </div>
                  {expandedSub === "sem-setor" && (
                    <div className="mt-2 pl-5 space-y-1">
                      {semSetorEntries.length === 0 && current.revenueExtras > 0 && (
                        <p className="text-xs text-gray-400">Frete/instalação/ajustes de orçamentos — {money(current.revenueExtras)} (sem lançamento avulso no Caixa).</p>
                      )}
                      {semSetorEntries.map(({ entry, matched }) => (
                        <div key={entry.id} className={`flex items-center justify-between text-xs py-1 ${matched ? "bg-amber-50" : ""} rounded px-1.5`}>
                          <span className={matched ? "text-amber-800" : "text-gray-500"}>
                            {formatBR(entry.date)} — {entry.description || "-"}
                            {matched && ` (possível: Nº ${matched.quoteNumber ?? matched.id} — ${matched.customerName})`}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">{money(toNum(entry.amount))}</span>
                            {matched && (
                              <button
                                type="button"
                                onClick={() => handleLinkToQuote(entry, matched!.id)}
                                disabled={linkingId === entry.id}
                                className="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-60"
                              >
                                {linkingId === entry.id ? "Vinculando..." : "Vincular"}
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Total</span>
                <span>{money(current.receitaBruta)}</span>
              </div>
            </div>
          </div>

          {/* Aviso: sem pedido cadastrado no período, caiu pro modo Caixa */}
          {current.materialMode === "budgeted" && !current.useBudgetedMaterial && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                ℹ Nenhum pedido concluído cadastrado neste período — o Custo Direto usou "compra de mercadorias" do Caixa (modo padrão só funciona a partir de quando os pedidos passaram a ser cadastrados no sistema).
              </p>
            </div>
          )}

          {/* Alerta: pedidos concluídos sem custo orçado */}
          {current.useBudgetedMaterial && current.pedidosSemCustoOrcado.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowSemCustoList((v) => !v)}
              >
                <p className="text-sm font-semibold text-amber-800">
                  ⚠ {current.pedidosSemCustoOrcado.length} pedido(s) concluído(s) sem custo orçado no período (R$ {money(current.receitaPedidosSemCusto)} de receita)
                </p>
                <span className="text-amber-600 text-xs">{showSemCustoList ? "ocultar" : "ver lista"}</span>
              </div>
              {showSemCustoList && (
                <div className="mt-3 space-y-1">
                  {current.pedidosSemCustoOrcado.map((q) => (
                    <div key={q.id} className="flex justify-between text-xs text-amber-800 py-1 border-t border-amber-100">
                      <span>Nº {q.quoteNumber ?? q.id} — {q.customerName}</span>
                      <span className="font-semibold">{money(toNum(q.totalPrice))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Material aplicado por setor (custo orçado) */}
          {current.useBudgetedMaterial && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-1">Material Aplicado (Custo Orçado) por Setor</h3>
              <p className="text-xs text-gray-500 mb-3">Custo orçado de material (sem mão de obra, que já está em Despesas com Pessoal) dos itens dos pedidos entregues no período — entra como Custo Direto na DRE no lugar de "compra de mercadorias".</p>
              <div className="space-y-2">
                {SECTORS.map((s) => (
                  <div key={s} className="flex justify-between text-sm">
                    <span style={{ color: SECTOR_COLORS[s] }} className="font-semibold">{s}</span>
                    <span className="font-bold">{money(current.materialAplicadoBySector[s])}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>Total</span>
                  <span>{money(current.materialAplicadoTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Compras x Material aplicado */}
          {current.useBudgetedMaterial && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-3">Compras x Material Aplicado</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2">No período selecionado</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs text-gray-500">Compras</p><p className="font-bold">{money(current.comprasMercadorias)}</p></div>
                    <div><p className="text-xs text-gray-500">Material aplicado</p><p className="font-bold">{money(current.materialAplicadoTotal)}</p></div>
                    <div><p className="text-xs text-gray-500">Diferença</p><p className={`font-bold ${current.comprasMercadorias - current.materialAplicadoTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(current.comprasMercadorias - current.materialAplicadoTotal)}</p></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">Acumulado — últimos 3 meses</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs text-gray-500">Compras</p><p className="font-bold">{money(last3Months.comprasMercadorias)}</p></div>
                    <div><p className="text-xs text-gray-500">Material aplicado</p><p className="font-bold">{money(last3Months.materialAplicadoTotal)}</p></div>
                    <div><p className="text-xs text-gray-500">Diferença</p><p className={`font-bold ${last3Months.comprasMercadorias - last3Months.materialAplicadoTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(last3Months.comprasMercadorias - last3Months.materialAplicadoTotal)}</p></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Estrutura da DRE */}
          <div className="bg-white rounded-xl p-5 shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-gray-700 mb-3">Estrutura</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 px-3">Linha</th>
                  <th className="text-right py-1 px-3">Valor</th>
                  <th className="text-right py-1 px-3">% Receita Bruta</th>
                </tr>
              </thead>
              <tbody>
                <Row label="RECEITA BRUTA" value={current.receitaBruta} isSubtotal />
                <Row label="(-) Devoluções de vendas" value={-current.devolucoes} indent />
                <Row label="(-) Deduções" value={-(current.deducoes - current.devolucoes)} group="DEDUCOES" indent />
                <Row label="= RECEITA LÍQUIDA" value={current.receitaLiquida} isSubtotal />
                <Row label="(-) Custo Direto" value={-current.custoDireto} group="CUSTO_DIRETO" indent />
                <Row label="= LUCRO BRUTO" value={current.lucroBruto} isSubtotal />
                <Row label="(-) Despesas Variáveis" value={-current.despesaVariavel} group="DESPESA_VARIAVEL" indent />
                <Row label="= MARGEM DE CONTRIBUIÇÃO" value={current.margemContribuicao} isSubtotal />
                <Row label="(-) Despesas com Pessoal" value={-current.despesaPessoal} group="DESPESA_PESSOAL" indent />
                <Row label="(-) Despesas Fixas" value={-current.despesaFixa} group="DESPESA_FIXA" indent />
                <Row label="= RESULTADO OPERACIONAL" value={current.resultadoOperacional} isSubtotal />
                <Row label="(+) Outras Receitas" value={current.outrasReceitas} group="OUTRAS_RECEITAS" indent />
                <Row label="(+/-) Resultado Financeiro" value={current.resultadoFinanceiro} group="RESULTADO_FINANCEIRO" indent />
                <Row label="= LUCRO LÍQUIDO" value={current.lucroLiquido} isSubtotal />
              </tbody>
            </table>
          </div>

          {/* Comparação com período anterior equivalente */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Comparação com Período Anterior Equivalente</h3>
            {!prevReliable ? (
              <p className="text-sm text-gray-500">Sem comparação: período anterior não conferido</p>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {[
                { label: "Receita Bruta", curr: current.receitaBruta, prev: prevPeriod.receitaBruta },
                { label: "Resultado Operacional", curr: current.resultadoOperacional, prev: prevPeriod.resultadoOperacional },
                { label: "Lucro Líquido", curr: current.lucroLiquido, prev: prevPeriod.lucroLiquido },
              ].map((r) => {
                const v = varPct(r.curr, r.prev);
                return (
                  <div key={r.label} className="border rounded-lg p-3">
                    <p className="text-xs text-gray-500">{r.label}</p>
                    <p className="text-lg font-bold">{money(r.curr)}</p>
                    <p className={`text-xs ${v >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {v >= 0 ? "▲" : "▼"} {pct(Math.abs(v))} ({money(r.curr - r.prev)}) vs anterior
                    </p>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Conferência Receita x Recebimentos */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Receita x Recebimentos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-gray-500">Receita reconhecida (DRE)</p><p className="text-lg font-bold">{money(current.receitaBruta)}</p></div>
              <div><p className="text-xs text-gray-500">Recebido de vendas no Caixa</p><p className="text-lg font-bold">{money(current.recebidoVendas)}</p></div>
              <div><p className="text-xs text-gray-500">Diferença</p><p className={`text-lg font-bold ${current.receitaBruta - current.recebidoVendas >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(current.receitaBruta - current.recebidoVendas)}</p></div>
            </div>
          </div>

          {/* Pedidos em aberto */}
          <div className="bg-white rounded-xl p-5 shadow-sm overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-gray-700">Pedidos em Aberto (aguardando entrega ou pagamento)</h3>
                <p className="text-xs text-gray-500">{pedidosEmAberto.length} pedido(s) — total já recebido: {money(totalRecebidoAberto)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Filtrar por cliente..."
                  value={pedidosClienteFilter}
                  onChange={(e) => setPedidosClienteFilter(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm"
                />
                <select value={pedidosDaysFilter} onChange={(e) => setPedidosDaysFilter(e.target.value as any)} className="border rounded-lg px-2 py-1 text-sm">
                  <option value="todos">Todos os dias em aberto</option>
                  <option value="0-30">Até 30 dias</option>
                  <option value="31-60">31–60 dias</option>
                  <option value="61-90">61–90 dias</option>
                  <option value="90+">Mais de 90 dias</option>
                </select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 px-2">Nº</th>
                  <th className="text-left py-1 px-2">Cliente</th>
                  <th className="text-left py-1 px-2">Situação</th>
                  <th className="text-left py-1 px-2">Aprovado em</th>
                  <th className="text-left py-1 px-2">Prazo prometido</th>
                  <th className="text-right py-1 px-2">Valor total</th>
                  <th className="text-right py-1 px-2">Recebido</th>
                  <th className="text-right py-1 px-2">% recebido</th>
                  <th className="text-right py-1 px-2">Dias em aberto</th>
                </tr>
              </thead>
              <tbody>
                {pedidosEmAberto.map((p) => (
                  <tr key={p.id} className={p.pctRecebido > 100 ? "bg-red-50" : p.pctRecebido === 0 ? "bg-orange-50" : p.pctRecebido >= 100 ? "bg-blue-50" : p.days > 30 ? "bg-yellow-50" : ""}>
                    <td className="py-1.5 px-2">{p.quoteNumber ?? p.id}</td>
                    <td className="py-1.5 px-2">{p.customerName}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      {p.entregue
                        ? <span className="px-2 py-0.5 text-xs rounded-full border bg-orange-50 text-orange-700 border-orange-200">Entregue – a receber</span>
                        : <span className="px-2 py-0.5 text-xs rounded-full border bg-amber-50 text-amber-700 border-amber-200">Aguardando entrega</span>}
                    </td>
                    <td className="py-1.5 px-2">{formatBR(p.approvalDate)}</td>
                    <td className={`py-1.5 px-2 ${p.isLate && !p.entregue ? "text-red-600 font-semibold" : ""}`}>{p.deliveryDate ? formatBR(p.deliveryDate) : "-"}</td>
                    <td className="py-1.5 px-2 text-right">{money(p.totalPrice)}</td>
                    <td className="py-1.5 px-2 text-right">{money(p.recebido)}</td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${p.pctRecebido > 100 ? "text-red-600" : p.pctRecebido === 0 ? "text-orange-600" : ""}`} title={
                      p.pctRecebido > 100 ? "Recebido maior que o valor da venda — verificar crédito do cliente ou vínculo errado" :
                      p.pctRecebido === 0 ? "Em produção sem sinal registrado" : undefined
                    }>
                      {pct(p.pctRecebido)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold">{p.days}</td>
                  </tr>
                ))}
                {pedidosEmAberto.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-gray-400 py-4">Nenhum pedido em aberto.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Margem bruta estimada por setor */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-1">Margem Bruta Estimada por Setor</h3>
            <p className="text-xs text-gray-500 mb-3">Estimativa com base no custo orçado (não é o custo real lançado no Caixa).</p>
            <div className="space-y-3">
              {margemPorSetorEstimada.map((r) => (
                <div key={r.sector} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm" style={{ color: SECTOR_COLORS[r.sector] }}>{r.sector}</span>
                    <span className={`font-bold text-sm ${r.margin >= 0 ? "text-blue-600" : "text-red-600"}`}>{pct(r.margin)}</span>
                  </div>
                  <div className="grid grid-cols-2 text-xs gap-2">
                    <div><span className="text-gray-400">Receita: </span><span className="text-green-600 font-medium">{money(r.revenue)}</span></div>
                    <div><span className="text-gray-400">Custo orçado: </span><span className="text-red-500 font-medium">{money(r.cost)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subcategorias sem grupo_dre */}
          {current.unmappedAll.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 mb-2">Subcategorias sem classificação de DRE no período</h3>
              <div className="space-y-1 text-sm">
                {Array.from(current.unmappedAll.entries()).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-amber-700">
                    <span>{k.replace(/\|\|/g, " / ")}</span>
                    <span>{v.count} lançamento(s) — {money(v.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default Dre;
