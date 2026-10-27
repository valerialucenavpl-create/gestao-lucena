// Busca orçamentos da vendedora Joyce criados nos últimos dias — pra
// descobrir se um orçamento que "sumiu" da tela realmente não foi salvo no
// banco, ou só não está aparecendo por algum filtro. Só leitura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/buscar-orcamento-sumido.mjs

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
  // Busca TODOS (inclusive excluídos/deleted_at) pra não esconder nada.
  const { data: all, error } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_name, salesperson, status, date, total_price, deleted_at, created_at")
    .ilike("salesperson", "%joyce%")
    .order("date", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Erro ao buscar orçamentos:", error.message);
    process.exit(1);
  }

  console.log(`── Últimos 30 orçamentos da Joyce (qualquer status, inclusive excluídos) ──\n`);
  (all ?? []).forEach((q) => {
    const deleted = q.deleted_at ? ` [EXCLUÍDO em ${q.deleted_at}]` : "";
    console.log(
      `  Nº ${q.quote_number ?? q.id} — ${q.customer_name} — ${q.status} — ${money(q.total_price)} — data: ${String(q.date).slice(0, 10)}${deleted}`
    );
  });

  if ((all ?? []).length === 0) {
    console.log("  Nenhum orçamento encontrado pra 'Joyce' — confere se o nome da vendedora está exatamente assim no cadastro.");
  }
}

run();
