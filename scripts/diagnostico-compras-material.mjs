// Etapa 3.2 item 2 — diagnóstico Compras x Material Aplicado, mês a mês
// (julho/agosto/setembro de 2026). Só leitura, não grava nada.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/diagnostico-compras-material.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltam variáveis: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY antes de rodar."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseItems = (items) => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const p = JSON.parse(items);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

const MONTHS = [
  { label: "Julho/2026", from: "2026-07-01", to: "2026-07-31" },
  { label: "Agosto/2026", from: "2026-08-01", to: "2026-08-31" },
  { label: "Setembro/2026", from: "2026-09-01", to: "2026-09-30" },
];

async function run() {
  const { data: quotes, error: qErr } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_name, status, sale_completed, concluded_at, total_price, items")
    .is("deleted_at", null)
    .eq("status", "Aprovado")
    .eq("sale_completed", true);
  if (qErr) {
    console.error("Erro ao buscar orçamentos:", qErr.message);
    process.exit(1);
  }

  const { data: cashflowRows, error: cErr } = await supabase
    .from("cashflow")
    .select("id, date, description, value, account_id, subcategory")
    .is("deleted_at", null)
    .eq("type", "Saída")
    .ilike("subcategory", "compra de mercadorias");
  if (cErr) {
    console.error("Erro ao buscar caixa:", cErr.message);
    process.exit(1);
  }

  const { data: accounts } = await supabase.from("bank_accounts").select("id, name");
  const accountNameById = new Map((accounts || []).map((a) => [String(a.id), a.name]));

  console.log("── Compras x Material Aplicado — por mês ──\n");

  const rows = [];
  for (const m of MONTHS) {
    const concluded = (quotes || []).filter((q) => q.concluded_at && q.concluded_at >= m.from && q.concluded_at <= m.to);
    const receita = concluded.reduce((s, q) => s + Number(q.total_price || 0), 0);

    let custoOrcadoTotal = 0;
    const semCusto = [];
    concluded.forEach((q) => {
      let quoteCost = 0;
      parseItems(q.items).forEach((item) => {
        const qty = Math.max(1, Number(item?.quantity) || 1);
        quoteCost += Number(item?.cost || 0) * qty;
      });
      custoOrcadoTotal += quoteCost;
      if (quoteCost === 0) semCusto.push(q);
    });
    const receitaSemCusto = semCusto.reduce((s, q) => s + Number(q.total_price || 0), 0);

    const compras = (cashflowRows || [])
      .filter((r) => r.date && r.date.slice(0, 10) >= m.from && r.date.slice(0, 10) <= m.to)
      .reduce((s, r) => s + Number(r.value || 0), 0);

    rows.push({ mes: m.label, pedidosConcluidos: concluded.length, receita, custoOrcadoTotal, semCustoQtd: semCusto.length, receitaSemCusto, compras });
  }

  console.table(
    rows.map((r) => ({
      Mês: r.mes,
      "Pedidos concluídos": r.pedidosConcluidos,
      "Receita desses pedidos": money(r.receita),
      "Custo orçado total": money(r.custoOrcadoTotal),
      "Concluídos c/ custo=0": r.semCustoQtd,
      "Receita (custo=0)": money(r.receitaSemCusto),
      "Compras de mercadorias (Caixa)": money(r.compras),
    }))
  );

  console.log("\n── 20 maiores lançamentos de 'compra de mercadorias' (jul-set/2026) ──\n");
  const top20 = (cashflowRows || [])
    .filter((r) => r.date && r.date.slice(0, 10) >= "2026-07-01" && r.date.slice(0, 10) <= "2026-09-30")
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 20);

  console.table(
    top20.map((r) => ({
      Data: r.date?.slice(0, 10),
      Descrição: r.description || "-",
      Valor: money(r.value),
      Conta: accountNameById.get(String(r.account_id)) || "Não informada",
    }))
  );
}

run();
