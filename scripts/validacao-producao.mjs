// Etapa 7 — validação da aba Produção (Relatórios). Só leitura, não grava nada.
// Usa as MESMAS funções da tela (utils/productionReport.ts).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/validacao-producao.mjs [2026-10-01] [2026-10-12]

import { createClient } from "@supabase/supabase-js";
import { SECTORS, SECTOR_LABELS, cancelledQuoteIdsFrom, timeToYmd } from "../utils/salesReport.ts";
import {
  deadlineStats, deadlineStatsBySector, deliveredIn, lateOrders, netReceivedByQuote, realizedProfit,
} from "../utils/productionReport.ts";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n) => `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const d = (v) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`);
const br = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");

async function fetchAll(table, columns, filter, optional = false) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) {
      if (optional) { console.log(`(aviso) ${table}: ${error.message}`); return []; }
      console.error(`Erro ${table}:`, error.message); process.exit(1);
    }
    all = all.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return all;
}

const FROM = process.argv[2] || "2026-10-01";
const TODAY = timeToYmd(Date.now());
const TO = process.argv[3] || TODAY;

const [quoteRows, saleRows, productRows, cfRows, costRows] = await Promise.all([
  fetchAll("quotes", "*", (q) => q.is("deleted_at", null)),
  fetchAll("sales", "quote_id, status", (q) => q.is("deleted_at", null)),
  fetchAll("products", "id, name, productCategory"),
  fetchAll("cashflow", "id, type, value, orcamento_id, movement_kind, is_transfer", (q) => q.is("deleted_at", null)),
  fetchAll("pedido_custos", "cashflow_id, quote_id, amount", null, true),
]);

const quotes = quoteRows.map((r) => ({
  id: String(r.id), quoteNumber: r.quote_number, customerName: r.customer_name ?? "", status: r.status ?? "Pendente",
  items: r.items ?? [], date: r.date ?? "", totalPrice: Number(r.total_price ?? 0),
  approvedAt: r.approved_at ?? "", deliveredAt: r.delivered_at ?? "", deliveryDate: r.delivery_date ?? "",
  saleCompleted: Boolean(r.sale_completed),
}));
const sales = saleRows.map((r) => ({ quoteId: String(r.quote_id ?? ""), status: r.status ?? "" }));
const byId = Object.fromEntries(productRows.map((p) => [String(p.id), { ...p, category: p.productCategory || "" }]));
const cf = cfRows.map((r) => ({
  id: String(r.id), type: String(r.type || "").toLowerCase().startsWith("sa") ? "Saída" : "Entrada",
  amount: Number(r.value || 0), orcamentoId: r.orcamento_id != null ? String(r.orcamento_id) : undefined,
  movementKind: r.movement_kind || undefined, isTransfer: Boolean(r.is_transfer),
}));
const costs = costRows.map((c) => ({ cashflowId: String(c.cashflow_id), quoteId: String(c.quote_id), amount: Number(c.amount || 0) }));
const cancelledIds = cancelledQuoteIdsFrom(sales);

const late = lateOrders(quotes, cancelledIds, byId, netReceivedByQuote(cf), TODAY);
const delivered = deliveredIn(quotes, cancelledIds, FROM, TO);
const total = deadlineStats(delivered, late);
const bySector = deadlineStatsBySector(delivered, late, byId);

console.log(`\n=== VALIDAÇÃO — ABA PRODUÇÃO — ${br(FROM)} a ${br(TO)} ===`);
console.log(`\n[1] ATRASADOS AGORA (${br(TODAY)}): ${late.length}`);
late.slice(0, 15).forEach((o) => console.log(`   Nº ${o.quote.quoteNumber ?? o.quote.id} — ${o.quote.customerName} | ${o.sectors.map((s) => SECTOR_LABELS[s]).join("/")} | prazo ${br(o.promised)} | ${o.daysLate} dias | ${pct(o.pctReceived)} recebido`));
if (late.length > 15) console.log(`   ... e mais ${late.length - 15}`);

console.log(`\n[2] PRAZOS DAS ENTREGAS NO PERÍODO`);
console.log(`${"Setor".padEnd(10)}${"Entregues".padStart(10)}${"No prazo".padStart(16)}${"Prometido".padStart(11)}${"Realizado".padStart(11)}${"Atraso méd.".padStart(13)}${"Atras. agora".padStart(14)}`);
const line = (label, s) => console.log(
  `${label.padEnd(10)}${String(s.delivered).padStart(10)}${`${s.withDeadline ? pct((s.onTime / s.withDeadline) * 100) : "—"} (${s.onTime}/${s.withDeadline})`.padStart(16)}` +
  `${d(s.avgPromised).padStart(11)}${d(s.avgActual).padStart(11)}${d(s.avgDelay).padStart(13)}${String(s.openLate).padStart(14)}`
);
SECTORS.forEach((s) => line(SECTOR_LABELS[s], bySector[s]));
line("TOTAL", total);

const realized = realizedProfit(delivered, costs, cf);
const withCost = realized.filter((r) => r.linkedCost > 0);
console.log(`\n[3] LUCRO REALIZADO — ${realized.length} pedido(s) entregue(s), ${withCost.length} com custo vinculado (${costs.length} vínculo(s) no total)`);
withCost.forEach((r) => console.log(`   Nº ${r.quote.quoteNumber ?? r.quote.id} — ${r.quote.customerName}: receita ${money(r.revenue)} · vinculado ${money(r.linkedCost)} · material orçado ${money(r.budgetedCost)} · lucro ${money(r.profit)} (${pct(r.margin)})`));
console.log("");
