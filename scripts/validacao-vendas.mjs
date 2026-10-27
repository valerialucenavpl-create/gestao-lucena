// Etapa 6 item 8 — validação da aba Vendas (Relatórios). Só leitura, não grava nada.
//
// Usa as MESMAS funções de cálculo da tela (utils/salesReport.ts) — o Node 24
// lê o arquivo .ts direto.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/validacao-vendas.mjs
//   (opcional) ... node scripts/validacao-vendas.mjs 2026-10-01 2026-10-12

import { createClient } from "@supabase/supabase-js";
import {
  SECTORS, SECTOR_LABELS, DEFAULT_RELIABLE_START, cancelledQuoteIdsFrom, createdQuotesIn, inferSector,
  isCancelledSale, isPeriodUnreliable, itemCost, itemLaborCost, itemRevenue, norm, parseItems, previousPeriod, quoteOutcome,
  revenueBySector, soldQuotesIn, timeToYmd, toNum,
} from "../utils/salesReport.ts";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n) => `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const ratio = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const br = (s) => s.split("-").reverse().join("/");

async function fetchAll(table, columns, filter) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`Erro ${table}:`, error.message); process.exit(1); }
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

const FROM = process.argv[2] || "2026-10-01";
const TO = process.argv[3] || timeToYmd(Date.now());

const [quoteRows, saleRows, productRows, sellerRows, settingsRows] = await Promise.all([
  fetchAll("quotes", "*", (q) => q.is("deleted_at", null)),
  fetchAll("sales", "quote_id, status", (q) => q.is("deleted_at", null)),
  fetchAll("products", "id, name, productCategory"),
  fetchAll("sellers", "id, name, monthly_target, active"),
  fetchAll("cashflow_settings", "*"),
]);

const settings = settingsRows[0] || {};
const reliableStart = settings.reliable_data_start ? String(settings.reliable_data_start).slice(0, 10) : DEFAULT_RELIABLE_START;
const recognitionField = settings.sale_recognition_date === "approval" ? "approvedAt" : "deliveredAt";
const minMargin = settings.min_margin_by_sector || {};

const quotes = quoteRows.map((r) => ({
  id: String(r.id), status: r.status ?? "Pendente", items: r.items ?? [], date: r.date ?? "",
  totalPrice: Number(r.total_price ?? 0), subtotal: Number(r.subtotal ?? 0),
  approvedAt: r.approved_at ?? "", deliveredAt: r.delivered_at ?? "",
  salesperson: r.salesperson ?? "", clientId: r.client_id ?? "", customerName: r.customer_name ?? "",
  originLegacy: Boolean(r.origin_legacy), lostReason: r.lost_reason ?? "", lostReasonDetail: r.lost_reason_detail ?? "",
  quoteNumber: r.quote_number,
}));
const sales = saleRows.map((r) => ({ quoteId: String(r.quote_id ?? ""), status: r.status ?? "" }));
const byId = Object.fromEntries(productRows.map((p) => [String(p.id), { ...p, category: p.productCategory || "" }]));
const cancelledIds = cancelledQuoteIdsFrom(sales);

console.log(`\n=== VALIDAÇÃO — ABA VENDAS — ${br(FROM)} a ${br(TO)} ===`);
console.log(`Início dos dados confiáveis: ${br(reliableStart)} · DRE reconhece receita por: ${recognitionField === "deliveredAt" ? "entrega" : "aprovação"}`);

// ── 0) Convenção de item.price (total da linha x unitário) ──
let qtyGt1 = 0, matchLine = 0, matchUnit = 0;
quotes.forEach((q) => {
  const items = parseItems(q.items);
  if (!items.some((it) => toNum(it.quantity) > 1) || !q.subtotal) return;
  qtyGt1 += 1;
  const sumLine = items.reduce((s, it) => s + toNum(it.price), 0);
  const sumUnit = items.reduce((s, it) => s + toNum(it.price) * Math.max(1, toNum(it.quantity) || 1), 0);
  if (Math.abs(sumLine - q.subtotal) < 0.05) matchLine += 1;
  else if (Math.abs(sumUnit - q.subtotal) < 0.05) matchUnit += 1;
});
console.log(`\n[0] Orçamentos com item de quantidade > 1: ${qtyGt1} — subtotal bate com "price = total da linha": ${matchLine} · com "price = unitário": ${matchUnit}`);

// ── 1) Por setor: Aprovação x Entrega ──
const soldApproval = soldQuotesIn(quotes, cancelledIds, "approval", FROM, TO);
const soldDelivery = soldQuotesIn(quotes, cancelledIds, "delivery", FROM, TO);
const secA = revenueBySector(soldApproval, byId);
const secE = revenueBySector(soldDelivery, byId);
const totA = soldApproval.reduce((s, q) => s + q.totalPrice, 0);
const totE = soldDelivery.reduce((s, q) => s + q.totalPrice, 0);
console.log(`\n[1] TOTAL VENDIDO POR SETOR`);
console.log(`${"Setor".padEnd(34)}${"Base Aprovação".padStart(18)}${"Base Entrega".padStart(18)}`);
SECTORS.forEach((s) => console.log(`${SECTOR_LABELS[s].padEnd(34)}${money(secA[s].revenue).padStart(18)}${money(secE[s].revenue).padStart(18)}`));
const semA = totA - SECTORS.reduce((s, sec) => s + secA[sec].revenue, 0);
const semE = totE - SECTORS.reduce((s, sec) => s + secE[sec].revenue, 0);
console.log(`${"Sem setor (frete/inst./ajustes/desc.)".padEnd(34)}${money(semA).padStart(18)}${money(semE).padStart(18)}`);
console.log(`${"TOTAL".padEnd(34)}${money(totA).padStart(18)}${money(totE).padStart(18)}`);
console.log(`${"Nº de vendas".padEnd(34)}${String(soldApproval.length).padStart(18)}${String(soldDelivery.length).padStart(18)}`);

// ── 2) Base Entrega x DRE ──
// Reproduz, de forma independente, o filtro da DRE (Dre.tsx → buildPeriod):
// status Aprovado, não cancelado, data de reconhecimento no período.
const dreQuotes = quotes.filter((q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledIds)
  && q[recognitionField] && String(q[recognitionField]).slice(0, 10) >= FROM && String(q[recognitionField]).slice(0, 10) <= TO);
const dre = Object.fromEntries(SECTORS.map((s) => [s, 0]));
dreQuotes.forEach((q) => parseItems(q.items).forEach((it) => { dre[inferSector(it, byId)] += itemRevenue(it); }));
// Como a DRE calculava ANTES desta etapa (price × quantidade, sem tirar canceladas).
const dreOldQuotes = quotes.filter((q) => q.status === "Aprovado"
  && q[recognitionField] && String(q[recognitionField]).slice(0, 10) >= FROM && String(q[recognitionField]).slice(0, 10) <= TO);
const dreOld = Object.fromEntries(SECTORS.map((s) => [s, 0]));
dreOldQuotes.forEach((q) => parseItems(q.items).forEach((it) => {
  dreOld[inferSector(it, byId)] += toNum(it.price) * Math.max(1, toNum(it.quantity) || 1);
}));
console.log(`\n[2] BASE ENTREGA x RECEITA POR SETOR DA DRE`);
console.log(`${"Setor".padEnd(12)}${"Vendas (Entrega)".padStart(18)}${"DRE".padStart(16)}${"Diferença".padStart(14)}${"DRE antes da correção".padStart(24)}`);
let allMatch = true;
SECTORS.forEach((s) => {
  const diff = secE[s].revenue - dre[s];
  if (Math.abs(diff) > 0.005) allMatch = false;
  console.log(`${SECTOR_LABELS[s].padEnd(12)}${money(secE[s].revenue).padStart(18)}${money(dre[s]).padStart(16)}${money(diff).padStart(14)}${money(dreOld[s]).padStart(24)}`);
});
if (recognitionField !== "deliveredAt") console.log("ATENÇÃO: a DRE está configurada pra reconhecer por APROVAÇÃO — compare com a base Aprovação.");
console.log(allMatch ? "OK — base Entrega bate com a DRE em todos os setores." : "DIVERGÊNCIA — ver linhas acima.");
const cancelledInPeriod = dreOldQuotes.filter((q) => isCancelledSale(q, cancelledIds));
if (cancelledInPeriod.length) {
  console.log(`Vendas canceladas que a DRE antiga contava: ${cancelledInPeriod.map((q) => `Nº ${q.quoteNumber ?? q.id} (${money(q.totalPrice)})`).join(", ")}`);
}

// ── 2b) Material aplicado na DRE (pedidos entregues no período) ──
const deliveredForMaterial = quotes.filter((q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledIds)
  && q.deliveredAt && String(q.deliveredAt).slice(0, 10) >= FROM && String(q.deliveredAt).slice(0, 10) <= TO);
let custoTotal = 0, maoDeObra = 0;
deliveredForMaterial.forEach((q) => parseItems(q.items).forEach((it) => { custoTotal += itemCost(it); maoDeObra += itemLaborCost(it); }));
console.log(`\n[2b] MATERIAL APLICADO NA DRE (custo orçado dos ${deliveredForMaterial.length} pedidos entregues)`);
console.log(`Antes (material + mão de obra): ${money(custoTotal)} · Agora (só material): ${money(custoTotal - maoDeObra)} · Mão de obra que estava duplicada: ${money(maoDeObra)}`);

// ── 3) Margem por produto ──
const prod = new Map();
soldApproval.forEach((q) => parseItems(q.items).forEach((it) => {
  const key = String(it.productId || "") || `nome:${norm(it.productName)}`;
  const r = prod.get(key) || { name: byId[String(it.productId ?? "")]?.name || it.productName || "?", sector: inferSector(it, byId), revenue: 0, cost: 0 };
  r.revenue += itemRevenue(it); r.cost += itemCost(it);
  prod.set(key, r);
}));
const prodList = Array.from(prod.values()).map((r) => ({ ...r, marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }));
const noCost = prodList.filter((r) => r.cost === 0);
const belowMin = prodList.filter((r) => r.cost !== 0 && minMargin[r.sector] != null && r.revenue > 0 && r.marginPct < Number(minMargin[r.sector]));
console.log(`\n[3] MARGEM POR PRODUTO (base aprovação) — ${prodList.length} produto(s) vendido(s)`);
console.log(`Margem mínima configurada: ${Object.keys(minMargin).length ? SECTORS.map((s) => `${SECTOR_LABELS[s]} ${minMargin[s] ?? "—"}%`).join(" · ") : "NENHUMA (configure em Configurações)"}`);
console.log(`Abaixo da margem mínima: ${belowMin.length}`);
belowMin.forEach((r) => console.log(`   - ${r.name} (${SECTOR_LABELS[r.sector]}): ${pct(r.marginPct)} < ${minMargin[r.sector]}%`));
console.log(`Sem custo cadastrado: ${noCost.length}`);
noCost.forEach((r) => console.log(`   - ${r.name} (${SECTOR_LABELS[r.sector]}): receita ${money(r.revenue)}`));

// ── 4) Conversão ──
const created = createdQuotesIn(quotes, FROM, TO);
const outcome = { aprovado: 0, aberto: 0, recusado: 0, cancelado: 0 };
let createdValue = 0, approvedValue = 0;
const bySeller = new Map();
created.forEach((q) => {
  const o = quoteOutcome(q, cancelledIds);
  outcome[o] += 1; createdValue += q.totalPrice;
  if (o === "aprovado") approvedValue += q.totalPrice;
  const name = (q.salesperson || "Sem vendedora").trim();
  const r = bySeller.get(norm(name)) || { name, created: 0, approved: 0, cv: 0, av: 0 };
  r.created += 1; r.cv += q.totalPrice;
  if (o === "aprovado") { r.approved += 1; r.av += q.totalPrice; }
  bySeller.set(norm(name), r);
});
console.log(`\n[4] CONVERSÃO (orçamentos criados no período, sem os do sistema antigo)`);
console.log(`Criados: ${created.length} (${money(createdValue)}) · Aprovados: ${outcome.aprovado} (${money(approvedValue)}) · Em aberto: ${outcome.aberto} · Recusados: ${outcome.recusado} · Cancelados: ${outcome.cancelado}`);
console.log(`Conversão geral: ${pct(ratio(outcome.aprovado, created.length))} por quantidade · ${pct(ratio(approvedValue, createdValue))} por valor`);
Array.from(bySeller.values()).sort((a, b) => b.created - a.created).forEach((r) => {
  console.log(`   - ${r.name}: ${r.approved}/${r.created} = ${pct(ratio(r.approved, r.created))} (qtd) · ${pct(ratio(r.av, r.cv))} (valor)`);
});

// ── 5) Aviso de período não conferido (setembro) ──
const setFrom = "2026-09-01";
console.log(`\n[5] AVISO AO SELECIONAR SETEMBRO (${br(setFrom)} a 30/09/2026)`);
console.log(isPeriodUnreliable(setFrom, reliableStart)
  ? `Aparece: "Período anterior a ${br(reliableStart)} — dados não conferidos, use apenas como referência"`
  : "NÃO aparece — confira a data de início em Configurações.");
const prevOct = previousPeriod(FROM, TO);
console.log(`Comparação do período validado (${br(FROM)}–${br(TO)}) com ${br(prevOct.from)}–${br(prevOct.to)}: ${isPeriodUnreliable(prevOct.from, reliableStart) ? "\"Sem comparação: período anterior não conferido\"" : "mostrada"}`);
console.log("");
