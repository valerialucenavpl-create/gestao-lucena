// Investiga a(s) venda(s) do cliente OTANER: olha a tabela "sales" bruta
// (quote_id, total, date) e tenta achar o orçamento correspondente em
// "quotes", pra descobrir por que a tela mostra "OS #44" sem existir um
// orçamento com esse id. Só leitura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/checar-venda-otaner.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function run() {
  // 1) Orçamentos com cliente "OTANER"
  const { data: quotesOtaner, error: qErr } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_name, status, sale_completed, delivered_at, total_price, deleted_at")
    .ilike("customer_name", "%otaner%");
  if (qErr) { console.error("Erro quotes:", qErr.message); process.exit(1); }

  console.log("── Orçamentos com cliente 'OTANER' ──\n");
  (quotesOtaner ?? []).forEach((q) => {
    console.log(`  id=${q.id} nº=${q.quote_number} — ${q.customer_name} — ${q.status} — ${money(q.total_price)}${q.deleted_at ? " [EXCLUÍDO]" : ""}`);
  });

  // 2) Vendas (tabela sales) cujo quote_id aponta pra algum desses orçamentos,
  // OU cujo total bate com R$22.600,00 (valor visto na tela)
  const ids = (quotesOtaner ?? []).map((q) => q.id);
  const { data: salesRows, error: sErr } = await supabase
    .from("sales")
    .select("id, quote_id, total, date, status, deleted_at")
    .or(`quote_id.in.(${ids.join(",") || "0"}),total.eq.22600`);
  if (sErr) { console.error("Erro sales:", sErr.message); process.exit(1); }

  console.log("\n── Linhas em 'sales' relacionadas (por quote_id ou valor R$22.600,00) ──\n");
  (salesRows ?? []).forEach((s) => {
    console.log(`  sales.id=${s.id} quote_id=${s.quote_id} total=${money(s.total)} data=${String(s.date).slice(0,10)} status=${s.status}${s.deleted_at ? " [EXCLUÍDO]" : ""}`);
  });

  if ((salesRows ?? []).length === 0) {
    console.log("  Nenhuma linha encontrada — a venda pode ainda ser 'virtual' (nunca gerada de verdade na tabela sales).");
  }
}

run();
