// Regras da aba Produção (Relatórios) — prazos, atrasos e lucro realizado por
// pedido. Sem dependência de execução (só tipos), pra rodar também no Node
// (scripts/validacao-producao.mjs).
import type { CashFlowEntry, Quote } from "../types";
import {
  SECTORS, type Sector, inferSector, isCancelledSale, itemMaterialCost, parseItems, toNum, ymd, ymdToTime, inYmdRange,
} from "./salesReport.ts";

export const daysBetween = (from?: string, to?: string) => {
  const a = ymdToTime(ymd(from));
  const b = ymdToTime(ymd(to));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
};

export const orderSectors = (q: Quote, byId: Record<string, any>): Sector[] => {
  const set = new Set<Sector>();
  parseItems(q.items).forEach((it) => set.add(inferSector(it, byId)));
  return SECTORS.filter((s) => set.has(s));
};

// Recebido líquido do pedido: entradas ligadas a ele − devoluções ao cliente.
export const netReceivedByQuote = (cf: CashFlowEntry[]) => {
  const m = new Map<string, number>();
  cf.forEach((e) => {
    if (e.isTransfer || !e.orcamentoId) return;
    const k = String(e.orcamentoId);
    if (e.type === "Entrada") m.set(k, (m.get(k) || 0) + toNum(e.amount));
    else if (e.movementKind === "devolucao") m.set(k, (m.get(k) || 0) - toNum(e.amount));
  });
  return m;
};

// "Aguardando" = aprovado, não cancelado, sem entrega e não concluído.
export const isAwaiting = (q: Quote, cancelledIds: Set<string>) =>
  q.status === "Aprovado" && !isCancelledSale(q, cancelledIds) && !q.deliveredAt && !q.saleCompleted;

export type LateOrder = {
  quote: Quote; sectors: Sector[]; promised: string; daysLate: number; pctReceived: number; received: number;
};

export const lateOrders = (
  quotes: Quote[], cancelledIds: Set<string>, byId: Record<string, any>, received: Map<string, number>, today: string
): LateOrder[] =>
  quotes
    .filter((q) => isAwaiting(q, cancelledIds) && ymd(q.deliveryDate) && ymd(q.deliveryDate) < today)
    .map((q) => {
      const rec = received.get(String(q.id)) || 0;
      return {
        quote: q,
        sectors: orderSectors(q, byId),
        promised: ymd(q.deliveryDate),
        daysLate: daysBetween(q.deliveryDate, today) ?? 0,
        received: rec,
        pctReceived: toNum(q.totalPrice) > 0 ? (rec / toNum(q.totalPrice)) * 100 : 0,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);

export const deliveredIn = (quotes: Quote[], cancelledIds: Set<string>, from: string, to: string) =>
  quotes.filter((q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledIds) && inYmdRange(q.deliveredAt, from, to));

export type DeadlineStats = {
  delivered: number;        // entregues no período
  withDeadline: number;     // com prazo prometido (entram no % no prazo)
  onTime: number;
  late: number;
  avgPromised: number | null; // dias aprovação → prazo prometido
  avgActual: number | null;   // dias aprovação → entrega
  avgDelay: number | null;    // média de atraso só das entregues atrasadas
  openLate: number;           // em "Aguardando" com prazo vencido hoje
  openAvgDelay: number | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export const deadlineStats = (delivered: Quote[], openLate: LateOrder[]): DeadlineStats => {
  const promised: number[] = [], actual: number[] = [], delays: number[] = [];
  let withDeadline = 0, onTime = 0;
  delivered.forEach((q) => {
    const p = daysBetween(q.approvedAt || q.date, q.deliveryDate);
    const a = daysBetween(q.approvedAt || q.date, q.deliveredAt);
    if (p != null && p >= 0) promised.push(p);
    if (a != null && a >= 0) actual.push(a);
    if (ymd(q.deliveryDate)) {
      withDeadline += 1;
      const d = daysBetween(q.deliveryDate, q.deliveredAt) ?? 0;
      if (d <= 0) onTime += 1; else delays.push(d);
    }
  });
  return {
    delivered: delivered.length, withDeadline, onTime, late: delays.length,
    avgPromised: avg(promised), avgActual: avg(actual), avgDelay: avg(delays),
    openLate: openLate.length, openAvgDelay: avg(openLate.map((o) => o.daysLate)),
  };
};

// Pedido com itens de mais de um setor entra em cada setor.
export const deadlineStatsBySector = (
  delivered: Quote[], openLate: LateOrder[], byId: Record<string, any>
): Record<Sector, DeadlineStats> => {
  const out = {} as Record<Sector, DeadlineStats>;
  SECTORS.forEach((s) => {
    out[s] = deadlineStats(
      delivered.filter((q) => orderSectors(q, byId).includes(s)),
      openLate.filter((o) => o.sectors.includes(s))
    );
  });
  return out;
};

// ─── Lucro realizado por pedido ─────────────────────────────
// costs = linhas de pedido_custos cujo lançamento ainda existe no Caixa.
export type RealizedRow = {
  quote: Quote; revenue: number; budgetedCost: number; linkedCost: number; profit: number; margin: number;
};

export const realizedProfit = (
  delivered: Quote[], costs: { quoteId: string; cashflowId: string; amount: number }[], cf: CashFlowEntry[]
): RealizedRow[] => {
  const alive = new Set(cf.map((e) => String(e.id)));
  const linked = new Map<string, number>();
  costs.forEach((c) => {
    if (!alive.has(String(c.cashflowId))) return;
    linked.set(String(c.quoteId), (linked.get(String(c.quoteId)) || 0) + toNum(c.amount));
  });
  return delivered.map((q) => {
    const revenue = toNum(q.totalPrice);
    const linkedCost = linked.get(String(q.id)) || 0;
    const profit = revenue - linkedCost;
    return {
      quote: q, revenue, linkedCost, profit,
      budgetedCost: parseItems(q.items).reduce((s, it) => s + itemMaterialCost(it), 0),
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
  });
};
