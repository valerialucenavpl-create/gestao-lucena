// Etapa 5 item 10 — validação da DFC. Só leitura, não grava nada.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/validacao-dfc.mjs

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
      .select("id, type, category, subcategory, value, date, account_id, is_transfer")
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
  const [cfRes, catRes, accRes] = await Promise.all([
    fetchAllCashflow(),
    supabase.from("cashflow_categories").select("type, category, subcategory, grupo_dfc, grupo_dre"),
    supabase.from("bank_accounts").select("*"),
  ]);
  const cashflow = cfRes;
  const categories = catRes.data ?? [];
  const accounts = accRes.data ?? [];

  const catMap = new Map(categories.map((c) => [`${c.type}||${c.category}||${c.subcategory}`, c.grupo_dfc]));

  // ── 1) DFC consolidada de setembro/2026 ──
  const from = "2026-09-01";
  const to = "2026-09-30";
  const inPeriod = cashflow.filter((r) => !r.is_transfer && r.date && r.date.slice(0, 10) >= from && r.date.slice(0, 10) <= to);

  const OPERATIONAL_DRE_LABEL = {
    RECEITA_BRUTA: "Recebimentos de clientes (grupo_dre RECEITA_BRUTA)",
    OUTRAS_RECEITAS: "Outros recebimentos (OUTRAS_RECEITAS)",
    RESULTADO_FINANCEIRO: "Financeiro (RESULTADO_FINANCEIRO)",
    CUSTO_DIRETO: "Fornecedores (CUSTO_DIRETO)",
    DESPESA_PESSOAL: "Pessoal (DESPESA_PESSOAL)",
    DEDUCOES: "Impostos (DEDUCOES)",
    DESPESA_VARIAVEL: "Taxas/comissões (DESPESA_VARIAVEL)",
    DESPESA_FIXA: "Despesas fixas (DESPESA_FIXA)",
  };

  const totalsByDfc = { OPERACIONAL: 0, INVESTIMENTO: 0, FINANCIAMENTO: 0, NAO_ENTRA_OU_SEM_CAT: 0 };
  const totalsByLabel = {};
  const semGrupoDfc = new Map();

  for (const r of inPeriod) {
    const catRow = categories.find((c) => c.type === r.type && c.category === r.category && c.subcategory === r.subcategory);
    const grupoDfc = catRow?.grupo_dfc;
    const signedValue = r.type === "Saída" ? -Number(r.value || 0) : Number(r.value || 0);

    if (!catRow || !grupoDfc || grupoDfc === "NAO_ENTRA") {
      if (r.category !== "TRANSFERÊNCIA") {
        const k = `[${r.type}] ${r.category || "(sem categoria)"} / ${r.subcategory || "(sem subcategoria)"}`;
        const ex = semGrupoDfc.get(k) || { count: 0, amount: 0 };
        ex.count += 1;
        ex.amount += Number(r.value || 0);
        semGrupoDfc.set(k, ex);
      }
      continue;
    }
    totalsByDfc[grupoDfc] = (totalsByDfc[grupoDfc] || 0) + signedValue;
    const label = OPERATIONAL_DRE_LABEL[catRow.grupo_dre] || catRow.grupo_dre || "outros";
    totalsByLabel[label] = (totalsByLabel[label] || 0) + signedValue;
  }

  console.log("── DFC consolidada — Setembro/2026 ──\n");
  console.log("Por atividade (grupo_dfc):");
  console.log(`  Operacional:   ${money(totalsByDfc.OPERACIONAL)}`);
  console.log(`  Investimento:  ${money(totalsByDfc.INVESTIMENTO)}`);
  console.log(`  Financiamento: ${money(totalsByDfc.FINANCIAMENTO)}`);
  console.log(`  Variação de caixa (soma): ${money(totalsByDfc.OPERACIONAL + totalsByDfc.INVESTIMENTO + totalsByDfc.FINANCIAMENTO)}`);
  console.log("\nDetalhe por grupo_dre (dentro de Operacional):");
  Object.entries(totalsByLabel).forEach(([k, v]) => console.log(`  ${k}: ${money(v)}`));

  // ── 2) Saldo por conta hoje ──
  console.log("\n── Saldo por conta — hoje ──\n");
  const todayISO = new Date().toISOString().slice(0, 10);
  for (const acc of accounts) {
    let bal = Number(acc.initial_balance || 0);
    const cutoff = acc.initial_balance_date;
    for (const r of cashflow) {
      if (String(r.account_id) !== String(acc.id)) continue;
      if (!r.date) continue;
      const d = r.date.slice(0, 10);
      if (d > todayISO) continue;
      if (cutoff && d <= cutoff) continue;
      bal += r.type === "Saída" ? -Number(r.value || 0) : Number(r.value || 0);
    }
    console.log(`  ${acc.name}: ${money(bal)} (corte: ${cutoff || "-"})`);
  }
  console.log("\n(Confere esses valores com o card de saldo no topo da tela Caixa — devem bater exatamente.)");

  // ── 3) Lançamentos sem grupo_dfc no período ──
  console.log(`\n── Lançamentos SEM grupo_dfc definido em Setembro/2026: ${semGrupoDfc.size} ──\n`);
  if (semGrupoDfc.size > 0) {
    [...semGrupoDfc.entries()].forEach(([k, v]) => console.log(`  ${k} — ${v.count} lançamento(s), total ${money(v.amount)}`));
  } else {
    console.log("  Nenhum — todas as subcategorias usadas em setembro têm grupo_dfc definido. ✅");
  }
}

run();
