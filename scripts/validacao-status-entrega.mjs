// Etapa 5.1 item 9 — validação do novo fluxo de status. Só leitura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/validacao-status-entrega.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function getSaleStatus(q) {
  if (q.status === "Recusado") return "Cancelado";
  if (q.status === "Pendente") return "Pendente em aprovação";
  if (q.sale_completed) return "Concluído";
  if (q.delivered_at) return "Entregue – a receber";
  return "Aguardando";
}

async function run() {
  const { data: quotes, error: qErr } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_name, status, sale_completed, delivered_at, concluded_at, delivery_date, total_price")
    .is("deleted_at", null);
  if (qErr) { console.error("Erro ao buscar orçamentos:", qErr.message); process.exit(1); }

  // ── 1) Quantas vendas em cada status ──
  const counts = {};
  quotes.forEach((q) => {
    const s = getSaleStatus(q);
    counts[s] = (counts[s] || 0) + 1;
  });
  console.log("── Vendas por status ──\n");
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // ── 2) Quantas "Concluído" foram migradas com delivered_at ──
  const concluidos = quotes.filter((q) => q.sale_completed);
  const migradosComData = concluidos.filter((q) => q.delivered_at);
  console.log(`\n── Concluídos: ${concluidos.length} total, ${migradosComData.length} com delivered_at preenchido ──`);
  if (migradosComData.length < concluidos.length) {
    console.log("  Faltando delivered_at:");
    concluidos.filter((q) => !q.delivered_at).forEach((q) => console.log(`    Nº ${q.quote_number ?? q.id} — ${q.customer_name}`));
  }

  // ── 3) Títulos de Contas a Receber duplicados ──
  const { data: receivables, error: rErr } = await supabase
    .from("receivables")
    .select("id, quote_id, customer_name, amount")
    .is("deleted_at", null);
  if (rErr) { console.error("Erro ao buscar recebíveis:", rErr.message); process.exit(1); }
  const byQuote = new Map();
  receivables.forEach((r) => {
    const arr = byQuote.get(r.quote_id) || [];
    arr.push(r);
    byQuote.set(r.quote_id, arr);
  });
  const duplicated = [...byQuote.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`\n── Títulos de Contas a Receber duplicados: ${duplicated.length} ──`);
  duplicated.forEach(([quoteId, arr]) => {
    console.log(`  quote_id ${quoteId}: ${arr.length} títulos — ${arr.map((r) => money(r.amount)).join(", ")}`);
  });

  // ── Extra: vendas "Aguardando" sem prazo de entrega prometido ──
  const aguardandoSemPrazo = quotes.filter((q) => getSaleStatus(q) === "Aguardando" && !q.delivery_date);
  console.log(`\n── Vendas "Aguardando" SEM prazo de entrega prometido: ${aguardandoSemPrazo.length} ──`);
  aguardandoSemPrazo.forEach((q) => console.log(`  Nº ${q.quote_number ?? q.id} — ${q.customer_name} — ${money(q.total_price)}`));
}

run();
