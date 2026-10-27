// Regras de cálculo compartilhadas entre DRE, DFC, aba Vendas (Relatórios)
// e o script scripts/validacao-vendas.mjs — por isso este arquivo não importa
// nada em tempo de execução (só tipos), pra rodar direto no Node também.
//
// ATENÇÃO: item.price e item.cost já são o TOTAL da linha (preço unitário ×
// quantidade — ver NewQuote.tsx, subtotal = soma de item.price). Nunca
// multiplicar de novo pela quantidade.
import type { Quote, Sale } from "../types";

export type Sector = "VIDROS" | "ALUMÍNIO" | "MÁRMORE" | "PORTÃO";
export const SECTORS: Sector[] = ["VIDROS", "ALUMÍNIO", "MÁRMORE", "PORTÃO"];
export const SECTOR_COLORS: Record<Sector, string> = {
  VIDROS: "#0ea5e9", "ALUMÍNIO": "#8b5cf6", "MÁRMORE": "#f59e0b", PORTÃO: "#10b981",
};
export const SECTOR_LABELS: Record<Sector, string> = {
  VIDROS: "Vidros", "ALUMÍNIO": "Alumínio", "MÁRMORE": "Mármore", PORTÃO: "Portão",
};

// Data a partir da qual os dados foram conferidos — usada quando a
// configuração ainda não foi salva em Configurações.
export const DEFAULT_RELIABLE_START = "2026-10-01";

export const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export const parseItems = (items: unknown): any[] => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try { const p = JSON.parse(items); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

export const inferSector = (item: any, byId: Record<string, any>): Sector => {
  const p = byId[String(item?.productId ?? "")];
  const s = norm(`${p?.category || ""} ${p?.name || ""} ${item?.productName || ""}`);
  if (s.includes("PORTAO")) return "PORTÃO";
  if (s.includes("VIDRO")) return "VIDROS";
  if (s.includes("ALUMIN")) return "ALUMÍNIO";
  return "MÁRMORE";
};

export const itemRevenue = (item: any) => toNum(item?.price);
export const itemCost = (item: any) => toNum(item?.cost);
// cost = matéria-prima + mão de obra (+ montagem/cuba/acessórios em alguns
// itens) — material = cost − mão de obra, pra as duas partes somarem o total.
export const itemLaborCost = (item: any) => Math.min(toNum(item?.laborCost), itemCost(item));
export const itemMaterialCost = (item: any) => itemCost(item) - itemLaborCost(item);

// ─── Datas (YYYY-MM-DD) ─────────────────────────────────────
export const ymd = (v: unknown) => String(v ?? "").slice(0, 10);
export const ymdToTime = (s?: string) => {
  if (!s) return NaN;
  const [y, m, d] = String(s).slice(0, 10).split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};
export const timeToYmd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const inYmdRange = (v: unknown, from: string, to: string) => {
  const s = ymd(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= from && s <= to;
};
export const daysInRange = (from: string, to: string) =>
  Math.max(1, Math.round((ymdToTime(to) - ymdToTime(from)) / 86400000) + 1);

// Período anterior equivalente (mesmo número de dias, colado antes).
export const previousPeriod = (from: string, to: string) => {
  const days = daysInRange(from, to);
  const fromT = ymdToTime(from);
  return { from: timeToYmd(fromT - days * 86400000), to: timeToYmd(fromT - 86400000) };
};

// ─── Data de início dos dados confiáveis ────────────────────
export const reliableStartOf = (settings?: { reliableDataStart?: string } | null) =>
  settings?.reliableDataStart || DEFAULT_RELIABLE_START;
export const isPeriodUnreliable = (from: string, start: string) => ymd(from) < start;

// ─── Vendas canceladas ──────────────────────────────────────
// Cancelamento pode vir de dois lugares: venda marcada "Cancelado" em Vendas
// (o orçamento continua Aprovado) ou orçamento que foi aprovado e depois
// virou "Recusado" (cancelar pela DRE / status da venda).
export const cancelledQuoteIdsFrom = (sales?: Sale[] | null) =>
  new Set(
    (Array.isArray(sales) ? sales : [])
      .filter((s: any) => s.status === "Cancelado")
      .map((s) => String(s.quoteId))
  );

export const isCancelledSale = (q: Quote, cancelledIds: Set<string>) =>
  cancelledIds.has(String(q.id)) || (q.status === "Recusado" && Boolean(q.approvedAt));

export type DateBase = "approval" | "delivery";
export const saleDateOf = (q: Quote, base: DateBase) =>
  base === "approval" ? ymd(q.approvedAt || q.date) : ymd(q.deliveredAt);

// Vendas válidas (aprovadas e não canceladas) com data na base escolhida
// dentro do período.
export const soldQuotesIn = (
  quotes: Quote[], cancelledIds: Set<string>, base: DateBase, from: string, to: string
) => quotes.filter(
  (q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledIds) && inYmdRange(saleDateOf(q, base), from, to)
);

// ─── Receita por setor (mesma conta da DRE) ─────────────────
export type SectorRow = { sector: Sector; revenue: number; cost: number; count: number };
export const revenueBySector = (quotes: Quote[], byId: Record<string, any>) => {
  const rows: Record<Sector, SectorRow> = {
    VIDROS: { sector: "VIDROS", revenue: 0, cost: 0, count: 0 },
    "ALUMÍNIO": { sector: "ALUMÍNIO", revenue: 0, cost: 0, count: 0 },
    "MÁRMORE": { sector: "MÁRMORE", revenue: 0, cost: 0, count: 0 },
    PORTÃO: { sector: "PORTÃO", revenue: 0, cost: 0, count: 0 },
  };
  quotes.forEach((q) => {
    const touched = new Set<Sector>();
    parseItems(q.items).forEach((item) => {
      const s = inferSector(item, byId);
      rows[s].revenue += itemRevenue(item);
      rows[s].cost += itemCost(item);
      touched.add(s);
    });
    // Venda com itens de mais de um setor conta uma vez em cada setor.
    touched.forEach((s) => { rows[s].count += 1; });
  });
  return rows;
};

// ─── Conversão de orçamentos ────────────────────────────────
export type QuoteOutcome = "aprovado" | "aberto" | "recusado" | "cancelado";
export const quoteOutcome = (q: Quote, cancelledIds: Set<string>): QuoteOutcome => {
  if (isCancelledSale(q, cancelledIds)) return "cancelado";
  if (q.status === "Aprovado") return "aprovado";
  if (q.status === "Recusado") return "recusado";
  return "aberto";
};

// Orçamentos criados no período — vendas cadastradas do sistema antigo não
// passaram por orçamento de verdade, então ficam fora da conversão.
export const createdQuotesIn = (quotes: Quote[], from: string, to: string) =>
  quotes.filter((q) => !q.originLegacy && inYmdRange(q.date, from, to));

export const LOST_REASONS = [
  "Preço alto",
  "Prazo",
  "Cliente desistiu",
  "Fechou com concorrente",
  "Sem retorno do cliente",
  "Outro",
] as const;

// ─── Meta proporcional ──────────────────────────────────────
// Soma, mês a mês, a fatia da meta mensal correspondente aos dias do período
// que caem naquele mês — período = mês fechado dá exatamente a meta cheia.
export const proportionalGoal = (monthlyGoal: number, from: string, to: string) => {
  if (!monthlyGoal) return 0;
  let total = 0;
  let cursor = ymdToTime(from);
  const endT = ymdToTime(to);
  while (cursor <= endT) {
    const d = new Date(cursor);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
    const sliceEnd = Math.min(monthEnd, endT);
    const days = Math.round((sliceEnd - cursor) / 86400000) + 1;
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    total += monthlyGoal * (days / daysInMonth);
    cursor = sliceEnd + 86400000;
  }
  return total;
};

export const isClosedMonth = (from: string, to: string) => {
  const f = ymdToTime(from);
  const t = ymdToTime(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return false;
  const fd = new Date(f);
  const lastDay = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getTime();
  return fd.getDate() === 1 && t === lastDay;
};

// Últimos 12 meses (inclui o atual), do mais antigo pro mais recente.
export const last12Months = (now = new Date()) => {
  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      from: timeToYmd(d.getTime()),
      to: timeToYmd(end.getTime()),
    });
  }
  return months;
};
