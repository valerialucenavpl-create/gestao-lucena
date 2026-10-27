// Mostra o estado atual completo (no banco) de um orçamento pelo número —
// pra separar "não gravou no banco" de "gravou mas a tela não atualizou".
// Só leitura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/checar-orcamento.mjs 44

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const quoteNumber = process.argv[2];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!quoteNumber) {
  console.error("Uso: node scripts/checar-orcamento.mjs <numero_do_orcamento>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  const [byId, byNumber] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", Number(quoteNumber)),
    supabase.from("quotes").select("*").eq("quote_number", Number(quoteNumber)),
  ]);
  if (byId.error) { console.error("Erro:", byId.error.message); process.exit(1); }
  if (byNumber.error) { console.error("Erro:", byNumber.error.message); process.exit(1); }

  const seen = new Set();
  const data = [...(byId.data ?? []), ...(byNumber.data ?? [])].filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });

  if (!data || data.length === 0) {
    console.log(`Nenhum orçamento com número ${quoteNumber} encontrado.`);
    return;
  }

  data.forEach((q) => {
    console.log(`\n── Orçamento #${q.id} (nº ${q.quote_number}) ──`);
    console.log(`  customer_name: ${q.customer_name}`);
    console.log(`  status: ${q.status}`);
    console.log(`  sale_completed: ${q.sale_completed}`);
    console.log(`  delivered_at: ${q.delivered_at}`);
    console.log(`  approved_at: ${q.approved_at}`);
    console.log(`  concluded_at: ${q.concluded_at}`);
    console.log(`  deleted_at: ${q.deleted_at}`);
    console.log(`  updated/created_at: ${q.created_at ?? "(sem coluna created_at)"}`);
  });
}

run();
