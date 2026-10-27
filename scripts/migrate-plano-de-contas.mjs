// Etapa 2 — Migra os lançamentos existentes do Caixa para o plano de contas
// reorganizado (ver supabase/2026-09-29_plano_de_contas_seed.sql).
//
// Regra: só reclassifica (category/subcategory) o que está EXPLICITAMENTE
// mapeado abaixo, exatamente como pedido — "qualquer subcategoria existente
// que NÃO esteja na lista: listar com a quantidade de lançamentos e NÃO
// classificar sozinho". Não mexe em valor, data, tipo, conta nem qualquer
// outra coisa; só category/subcategory.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-plano-de-contas.mjs
//     -> modo TESTE (dry-run): mostra relatório completo (contagens antes/depois
//        por subcategoria + confirmação de que o total de Entradas e o total
//        de Saídas não mudam) e a lista de subcategorias não mapeadas. Não grava nada.
//   ... node scripts/migrate-plano-de-contas.mjs --apply
//     -> grava de verdade — salva backup JSON antes.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltam variáveis: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY antes de rodar.\n" +
      "A service role key fica em Supabase → Project Settings → API Keys → Secret keys."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// chave = `${type}||${category}||${subcategory}` (tudo como está salvo hoje)
// valor = { category, subcategory } novo (mesmo type)
const MAP = new Map([
  // ── Entrada / RECEITAS OPERACIONAIS — sem mudança de nome, só confirma ──
  ["Entrada||RECEITAS OPERACIONAIS||venda dinheiro", { category: "RECEITAS OPERACIONAIS", subcategory: "venda dinheiro" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda pix", { category: "RECEITAS OPERACIONAIS", subcategory: "venda pix" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda cartão débito", { category: "RECEITAS OPERACIONAIS", subcategory: "venda cartão débito" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda cartão crédito à vista", { category: "RECEITAS OPERACIONAIS", subcategory: "venda cartão crédito à vista" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda cartão crédito parcelado", { category: "RECEITAS OPERACIONAIS", subcategory: "venda cartão crédito parcelado" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda link de pagamento", { category: "RECEITAS OPERACIONAIS", subcategory: "venda link de pagamento" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda transferência bancária", { category: "RECEITAS OPERACIONAIS", subcategory: "venda transferência bancária" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda boleto", { category: "RECEITAS OPERACIONAIS", subcategory: "venda boleto" }],
  ["Entrada||RECEITAS OPERACIONAIS||venda outros", { category: "RECEITAS OPERACIONAIS", subcategory: "venda outros" }],
  ["Entrada||RECEITAS OPERACIONAIS||recebimento de crediário / fiado", { category: "RECEITAS OPERACIONAIS", subcategory: "recebimento de crediário / fiado" }],
  ["Entrada||RECEITAS OPERACIONAIS||taxa de entrega", { category: "RECEITAS OPERACIONAIS", subcategory: "taxa de entrega" }],
  ["Entrada||RECEITAS OPERACIONAIS||outras receitas operacionais", { category: "RECEITAS OPERACIONAIS", subcategory: "outras receitas operacionais" }],

  // ── Entrada / RECEITAS NÃO OPERACIONAIS -> ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS ──
  ["Entrada||RECEITAS NÃO OPERACIONAIS||juros de aplicação financeira", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "juros de aplicação financeira" }],
  ["Entrada||RECEITAS NÃO OPERACIONAIS||cashback", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "cashback" }],
  ["Entrada||RECEITAS NÃO OPERACIONAIS||entrada de empréstimo", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "entrada de empréstimo" }],
  ["Entrada||RECEITAS NÃO OPERACIONAIS||aporte da proprietária", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "aporte da proprietária" }],
  ["Entrada||RECEITAS NÃO OPERACIONAIS||resgate de aplicação", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "resgate de aplicação" }],
  ["Entrada||RECEITAS NÃO OPERACIONAIS||outras receitas não operacionais", { category: "ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "outras receitas não operacionais" }],

  // ── Saída / CUSTOS VARIÁVEIS ──
  ["Saída||CUSTOS VARIÁVEIS||compra de mercadorias", { category: "CUSTOS VARIÁVEIS", subcategory: "compra de mercadorias" }],
  ["Saída||CUSTOS VARIÁVEIS||frete de fornecedores", { category: "CUSTOS VARIÁVEIS", subcategory: "frete de fornecedores" }],
  ["Saída||CUSTOS VARIÁVEIS||embalagens", { category: "CUSTOS VARIÁVEIS", subcategory: "embalagens" }],
  ["Saída||CUSTOS VARIÁVEIS||taxa de cartão", { category: "CUSTOS VARIÁVEIS", subcategory: "taxa de cartão" }],
  ["Saída||CUSTOS VARIÁVEIS||taxa de maquininha", { category: "CUSTOS VARIÁVEIS", subcategory: "taxa de maquininha" }],
  ["Saída||CUSTOS VARIÁVEIS||taxa de plataforma / marketplace", { category: "CUSTOS VARIÁVEIS", subcategory: "taxa de plataforma / marketplace" }],
  ["Saída||CUSTOS VARIÁVEIS||taxa de link de pagamento", { category: "CUSTOS VARIÁVEIS", subcategory: "taxa de link de pagamento" }],
  ["Saída||CUSTOS VARIÁVEIS||comissões", { category: "CUSTOS VARIÁVEIS", subcategory: "comissões" }],
  // impostos sobre vendas sai de CUSTOS VARIÁVEIS e vira DEDUÇÕES, com nome novo
  ["Saída||CUSTOS VARIÁVEIS||impostos sobre vendas", { category: "DEDUÇÕES", subcategory: "impostos sobre vendas (DAS)" }],
  // horas extras sai de CUSTOS VARIÁVEIS e vira CUSTOS FIXOS/pessoal
  ["Saída||CUSTOS VARIÁVEIS||horas extras", { category: "CUSTOS FIXOS", subcategory: "horas extras" }],

  // ── Saída / CUSTOS FIXOS ──
  ["Saída||CUSTOS FIXOS||aluguel", { category: "CUSTOS FIXOS", subcategory: "aluguel" }],
  ["Saída||CUSTOS FIXOS||energia", { category: "CUSTOS FIXOS", subcategory: "energia" }],
  ["Saída||CUSTOS FIXOS||água", { category: "CUSTOS FIXOS", subcategory: "água" }],
  ["Saída||CUSTOS FIXOS||internet", { category: "CUSTOS FIXOS", subcategory: "internet" }],
  ["Saída||CUSTOS FIXOS||telefonia", { category: "CUSTOS FIXOS", subcategory: "telefonia" }],
  ["Saída||CUSTOS FIXOS||sistema / software", { category: "CUSTOS FIXOS", subcategory: "sistema / software" }],
  ["Saída||CUSTOS FIXOS||contador", { category: "CUSTOS FIXOS", subcategory: "contador" }],
  // salários -> renomeado salários administrativo
  ["Saída||CUSTOS FIXOS||salários", { category: "CUSTOS FIXOS", subcategory: "salários administrativo" }],
  ["Saída||CUSTOS FIXOS||encargos sociais (inss / fgts)", { category: "CUSTOS FIXOS", subcategory: "encargos sociais (inss / fgts)" }],
  ["Saída||CUSTOS FIXOS||13º salário", { category: "CUSTOS FIXOS", subcategory: "13º salário" }],
  ["Saída||CUSTOS FIXOS||alimentação loja", { category: "CUSTOS FIXOS", subcategory: "alimentação loja" }],
  ["Saída||CUSTOS FIXOS||alimentação viagem", { category: "CUSTOS FIXOS", subcategory: "alimentação viagem" }],
  ["Saída||CUSTOS FIXOS||combustível", { category: "CUSTOS FIXOS", subcategory: "combustível" }],
  ["Saída||CUSTOS FIXOS||ipva", { category: "CUSTOS FIXOS", subcategory: "ipva" }],

  // ── Saída / DESPESAS NÃO OPERACIONAIS -> SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS ──
  ["Saída||DESPESAS NÃO OPERACIONAIS||parcela de empréstimo", { category: "SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "amortização de empréstimo (principal)" }],
  ["Saída||DESPESAS NÃO OPERACIONAIS||aplicação / investimento", { category: "SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "aplicação / investimento" }],
  ["Saída||DESPESAS NÃO OPERACIONAIS||aquisição de imobilizado", { category: "SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "aquisição de imobilizado" }],
  ["Saída||DESPESAS NÃO OPERACIONAIS||distribuição de lucros", { category: "SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "distribuição de lucros" }],
  ["Saída||DESPESAS NÃO OPERACIONAIS||outras saídas", { category: "SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS", subcategory: "outras saídas" }],
]);

async function run() {
  console.log(APPLY ? "MODO APLICAR — vai gravar no banco (com backup antes).\n" : "MODO TESTE (dry-run) — nada será gravado.\n");

  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cashflow")
      .select("id, type, category, subcategory, amount:value")
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Erro ao buscar lançamentos:", error.message);
      process.exit(1);
    }
    const rows = data ?? [];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const totalEntradasBefore = allRows.filter((r) => r.type === "Entrada").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaidasBefore = allRows.filter((r) => r.type === "Saída").reduce((s, r) => s + Number(r.amount || 0), 0);

  const toUpdate = [];
  const unmatchedCounts = new Map(); // key -> { type, category, subcategory, count, amount }

  for (const row of allRows) {
    const key = `${row.type}||${row.category || ""}||${row.subcategory || ""}`;
    const mapped = MAP.get(key);
    if (mapped) {
      if (mapped.category !== row.category || mapped.subcategory !== row.subcategory) {
        toUpdate.push({ id: row.id, before: { category: row.category, subcategory: row.subcategory }, after: mapped });
      }
      continue;
    }
    // ignora lançamentos de transferência entre contas (categoria própria, fora do plano)
    if (row.category === "TRANSFERÊNCIA") continue;
    const existing = unmatchedCounts.get(key);
    if (existing) {
      existing.count += 1;
      existing.amount += Number(row.amount || 0);
    } else {
      unmatchedCounts.set(key, { type: row.type, category: row.category, subcategory: row.subcategory, count: 1, amount: Number(row.amount || 0) });
    }
  }

  // Contagem por subcategoria nova (depois da reclassificação) — pra conferência.
  const afterCounts = new Map();
  for (const row of allRows) {
    const key = `${row.type}||${row.category || ""}||${row.subcategory || ""}`;
    const mapped = MAP.get(key);
    const finalCategory = mapped ? mapped.category : row.category;
    const finalSubcategory = mapped ? mapped.subcategory : row.subcategory;
    const afterKey = `${row.type}||${finalCategory}||${finalSubcategory}`;
    afterCounts.set(afterKey, (afterCounts.get(afterKey) || 0) + 1);
  }

  console.log(`Total de lançamentos (não excluídos): ${allRows.length}`);
  console.log(`Lançamentos que vão mudar category/subcategory: ${toUpdate.length}`);
  console.log(`Subcategorias existentes SEM mapeamento (não tocadas, revisão manual): ${unmatchedCounts.size}\n`);

  console.log("── Contagem por subcategoria DEPOIS da migração ──");
  [...afterCounts.entries()].sort().forEach(([k, count]) => console.log(`  ${k}: ${count}`));

  if (unmatchedCounts.size > 0) {
    console.log("\n── Subcategorias SEM mapeamento (NÃO classificadas automaticamente) ──");
    [...unmatchedCounts.values()]
      .sort((a, b) => b.count - a.count)
      .forEach((u) => console.log(`  [${u.type}] ${u.category || "(sem categoria)"} / ${u.subcategory || "(sem subcategoria)"} — ${u.count} lançamento(s), total ${u.amount.toFixed(2)}`));
  }

  console.log("\n── 10 exemplos de mudança (antes → depois) ──");
  toUpdate.slice(0, 10).forEach((u) => {
    console.log(`  #${u.id}: ${JSON.stringify(u.before)} -> ${JSON.stringify(u.after)}`);
  });

  console.log(`\nTotal de Entradas ANTES: ${totalEntradasBefore.toFixed(2)}`);
  console.log(`Total de Saídas ANTES: ${totalSaidasBefore.toFixed(2)}`);
  console.log("(Reclassificar category/subcategory não altera valor nem tipo — totais depois da migração devem ser EXATAMENTE os mesmos.)");

  if (!APPLY) {
    console.log("\nIsso foi um teste (dry-run). Confere o relatório acima, principalmente a lista de subcategorias sem mapeamento. Pra aplicar de verdade, rode de novo com --apply no final.");
    return;
  }

  if (toUpdate.length === 0) {
    console.log("\nNada para atualizar.");
    return;
  }

  const backupDir = join(__dirname, "backups");
  mkdirSync(backupDir, { recursive: true });
  const { data: fullBackupRows } = await supabase
    .from("cashflow")
    .select("*")
    .in("id", toUpdate.map((u) => u.id));
  const backupPath = join(backupDir, `plano-de-contas-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify(fullBackupRows ?? [], null, 2), "utf-8");
  console.log(`\nBackup salvo em: ${backupPath}`);

  let okCount = 0;
  let errCount = 0;
  for (const u of toUpdate) {
    const { error: updErr } = await supabase
      .from("cashflow")
      .update({ category: u.after.category, subcategory: u.after.subcategory })
      .eq("id", u.id);
    if (updErr) {
      errCount += 1;
      console.error(`  -> ERRO ao atualizar #${u.id}:`, updErr.message);
    } else {
      okCount += 1;
    }
  }

  console.log(`\nConcluído: ${okCount} atualizado(s), ${errCount} com erro.`);
  if (errCount > 0) {
    console.log(`Lembrete: rode este mesmo comando de novo (--apply) pra tentar de novo só os que deram erro — o script pula o que já está certo.`);
  }

  // Busca paginada de novo — sem paginação, o Supabase só devolve os
  // primeiros 1000 registros e a conferência dá "divergente" por engano.
  let afterRows = [];
  let afterFrom = 0;
  while (true) {
    const { data } = await supabase
      .from("cashflow")
      .select("type, value")
      .is("deleted_at", null)
      .range(afterFrom, afterFrom + PAGE_SIZE - 1);
    const rows = data ?? [];
    afterRows = afterRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    afterFrom += PAGE_SIZE;
  }

  const totalEntradasAfter = afterRows.filter((r) => r.type === "Entrada").reduce((s, r) => s + Number(r.value || 0), 0);
  const totalSaidasAfter = afterRows.filter((r) => r.type === "Saída").reduce((s, r) => s + Number(r.value || 0), 0);
  console.log(`\nConferência pós-migração:`);
  console.log(`  Total de Entradas: ${totalEntradasAfter.toFixed(2)} (antes: ${totalEntradasBefore.toFixed(2)}) ${totalEntradasAfter === totalEntradasBefore ? "OK ✅" : "DIVERGENTE ⚠️"}`);
  console.log(`  Total de Saídas: ${totalSaidasAfter.toFixed(2)} (antes: ${totalSaidasBefore.toFixed(2)}) ${totalSaidasAfter === totalSaidasBefore ? "OK ✅" : "DIVERGENTE ⚠️"}`);
}

run();
