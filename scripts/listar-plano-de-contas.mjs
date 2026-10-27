// Lista o plano de contas (categorias/subcategorias com grupo_dre/grupo_dfc
// e contagem de lançamentos) e as contas bancárias cadastradas. Só leitura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/listar-plano-de-contas.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function fetchAllCashflow() {
  const PAGE_SIZE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cashflow")
      .select("type, category, subcategory")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) { console.error("Erro cashflow:", error.message); process.exit(1); }
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function run() {
  const [catRes, accRes, cashflow] = await Promise.all([
    supabase.from("cashflow_categories").select("*").order("type").order("category").order("sort_order"),
    supabase.from("bank_accounts").select("*").order("name"),
    fetchAllCashflow(),
  ]);

  if (catRes.error) { console.error("Erro categorias:", catRes.error.message); process.exit(1); }
  if (accRes.error) { console.error("Erro contas:", accRes.error.message); process.exit(1); }

  const countMap = new Map();
  cashflow.forEach((r) => {
    const k = `${r.type}||${r.category}||${r.subcategory}`;
    countMap.set(k, (countMap.get(k) || 0) + 1);
  });

  console.log("── Plano de contas ──\n");
  console.log("Tipo\tCategoria\tSubcategoria\tgrupo_dre\tgrupo_dfc\tLançamentos");
  (catRes.data ?? []).forEach((c) => {
    const k = `${c.type}||${c.category}||${c.subcategory}`;
    const count = countMap.get(k) || 0;
    console.log(`${c.type}\t${c.category}\t${c.subcategory}\t${c.grupo_dre}\t${c.grupo_dfc}\t${count}`);
  });

  console.log("\n── Contas bancárias ──\n");
  console.log("Nome\tTipo\tAtiva\tSaldo inicial\tData de corte");
  (accRes.data ?? []).forEach((a) => {
    console.log(`${a.name}\t${a.account_type || "movimento"}\t${a.active ? "sim" : "não"}\t${money(a.initial_balance)}\t${a.initial_balance_date}`);
  });
}

run();
