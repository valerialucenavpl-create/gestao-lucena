// Diagnóstico — por que o "Vendido no mês" do Dashboard difere do total da aba
// Vendas (base aprovação). Só leitura, não grava nada.
//
// Dashboard: venda com linha em "sales" usa sales.date e sales.total; orçamento
//            aprovado sem linha em "sales" usa approved_at e total_price.
// Vendas:    orçamento Aprovado e não cancelado, approved_at (ou date) e total_price.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/diagnostico-vendas-mes.mjs [2026-10]

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const d10 = (v) => String(v ?? "").slice(0, 10);
const br = (s) => (s ? s.split("-").reverse().join("/") : "—");

const MONTH = process.argv[2] || "2026-10";

async function fetchAll(table, columns, filter) {
  let all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`Erro ${table}:`, error.message); process.exit(1); }
    all = all.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return all;
}

const [quotes, sales] = await Promise.all([
  fetchAll("quotes", "id, quote_number, customer_name, status, date, approved_at, total_price, origin_legacy", (q) => q.is("deleted_at", null)),
  fetchAll("sales", "id, quote_id, date, total, status", (q) => q.is("deleted_at", null)),
]);

const salesByQuote = new Map();
sales.forEach((s) => {
  const k = String(s.quote_id);
  if (!salesByQuote.has(k)) salesByQuote.set(k, []);
  salesByQuote.get(k).push(s);
});
const cancelled = new Set(sales.filter((s) => s.status === "Cancelado").map((s) => String(s.quote_id)));

// Dashboard
const dash = new Map(); // quoteId -> { date, amount }
sales.filter((s) => s.status !== "Cancelado").forEach((s) => {
  if (d10(s.date).slice(0, 7) !== MONTH) return;
  const k = String(s.quote_id);
  const prev = dash.get(k);
  dash.set(k, { date: d10(s.date), amount: (prev?.amount || 0) + Number(s.total || 0), rows: (prev?.rows || 0) + 1 });
});
quotes.filter((q) => q.status === "Aprovado" && !salesByQuote.has(String(q.id))).forEach((q) => {
  const d = d10(q.approved_at || q.date);
  if (d.slice(0, 7) === MONTH) dash.set(String(q.id), { date: d, amount: Number(q.total_price || 0), rows: 0 });
});

// Aba Vendas
const vendas = new Map();
quotes.forEach((q) => {
  if (q.status !== "Aprovado" || cancelled.has(String(q.id))) return;
  const d = d10(q.approved_at || q.date);
  if (d.slice(0, 7) === MONTH) vendas.set(String(q.id), { date: d, amount: Number(q.total_price || 0) });
});

const sum = (m) => Array.from(m.values()).reduce((s, v) => s + v.amount, 0);
console.log(`\n=== ${MONTH} — Dashboard: ${dash.size} vendas, ${money(sum(dash))} · Aba Vendas: ${vendas.size} vendas, ${money(sum(vendas))} ===`);

const qById = new Map(quotes.map((q) => [String(q.id), q]));
const line = (id) => {
  const q = qById.get(id);
  const s = salesByQuote.get(id) || [];
  return `Nº ${q?.quote_number ?? id} — ${q?.customer_name ?? "?"} | status ${q?.status ?? "?"} | criado ${br(d10(q?.date))} | aprovado ${br(d10(q?.approved_at))}` +
    ` | venda(s): ${s.length ? s.map((x) => `${br(d10(x.date))} ${money(x.total)}${x.status ? ` (${x.status})` : ""}`).join(", ") : "nenhuma"}` +
    ` | total pedido ${money(q?.total_price)}${q?.origin_legacy ? " | SISTEMA ANTIGO" : ""}`;
};

const onlyVendas = [...vendas.keys()].filter((k) => !dash.has(k));
const onlyDash = [...dash.keys()].filter((k) => !vendas.has(k));
const diffAmount = [...vendas.keys()].filter((k) => dash.has(k) && Math.abs(dash.get(k).amount - vendas.get(k).amount) > 0.005);

console.log(`\n[A] Só na aba Vendas (${onlyVendas.length}) — ${money(onlyVendas.reduce((s, k) => s + vendas.get(k).amount, 0))}`);
onlyVendas.forEach((k) => console.log("  " + line(k)));
console.log(`\n[B] Só no Dashboard (${onlyDash.length}) — ${money(onlyDash.reduce((s, k) => s + dash.get(k).amount, 0))}`);
onlyDash.forEach((k) => console.log("  " + line(k)));
console.log(`\n[C] Nos dois, com valor diferente (${diffAmount.length})`);
diffAmount.forEach((k) => console.log(`  ${line(k)} | Dashboard ${money(dash.get(k).amount)} x Vendas ${money(vendas.get(k).amount)}`));
console.log("");
