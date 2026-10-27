// Migra lançamentos antigos de recebimento de venda no Caixa (cashflow),
// gravados com category="Vendas" e subcategory="quote:<id>" (vínculo
// embutido em texto), para o novo formato:
//   - orcamento_id = <id> (coluna própria)
//   - category = "RECEITAS OPERACIONAIS"
//   - subcategory = conforme a forma de pagamento (ex.: "venda pix")
//   - payment_method = forma de pagamento estruturada
//
// A forma de pagamento é lida do texto entre parênteses no final da
// descrição (ex.: "... (PIX)", "... (Cartão crédito parcelado 3x)"). Se a
// descrição disser só "(Cartão)" (sem detalhe de débito/crédito), tenta usar
// o payment_method cadastrado no orçamento; se também não ajudar, assume
// "venda cartão crédito à vista" e MARCA o registro para revisão manual
// (campo needs_review=true não é gravado no banco, só aparece no relatório).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-cashflow-sales.mjs
//     -> modo TESTE (dry-run): mostra quantos registros mudariam e 10
//        exemplos antes/depois. NÃO grava nada.
//   ... node scripts/migrate-cashflow-sales.mjs --apply
//     -> grava de verdade — mas primeiro salva um backup JSON de todos os
//        registros afetados (estado original) em scripts/backups/.

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

// ── mesma tabela usada em utils/paymentMethods.ts, duplicada aqui pra esse
// script não depender de um passo de build ──
function saleReceiptSubcategory(paymentMethodLabel) {
  const key = String(paymentMethodLabel || "").trim().toLowerCase();
  switch (key) {
    case "dinheiro":
      return "venda dinheiro";
    case "pix":
      return "venda pix";
    case "cartão débito":
    case "cartao debito":
      return "venda cartão débito";
    case "cartão crédito à vista":
    case "cartao credito a vista":
    case "cartão":
    case "cartao":
      return "venda cartão crédito à vista";
    case "cartão crédito parcelado":
    case "cartao credito parcelado":
      return "venda cartão crédito parcelado";
    case "link de pagamento":
    case "link":
      return "venda link de pagamento";
    case "transferência bancária":
    case "transferencia bancaria":
    case "transferência":
    case "transferencia":
      return "venda transferência bancária";
    case "boleto":
      return "venda boleto";
    default:
      return "venda outros";
  }
}

// Extrai o texto entre parênteses no FINAL da descrição, ex.:
// "Recebimento - Nº 353 - Fulano (Cartão crédito parcelado 3x)" -> "Cartão crédito parcelado 3x"
function extractMethodFromDescription(description) {
  const match = String(description || "").match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : "";
}

// Separa "Cartão crédito parcelado 3x" em { label: "Cartão crédito parcelado", installments: 3 }
function parseMethodText(text) {
  const installmentsMatch = text.match(/(\d+)\s*x\s*$/i);
  const installments = installmentsMatch ? Number(installmentsMatch[1]) : null;
  const label = text.replace(/\s*\d+\s*x\s*$/i, "").trim();
  return { label, installments };
}

// Resolve a forma de pagamento pra um lançamento com "(Cartão)" ambíguo,
// usando o payment_method cadastrado no orçamento de origem.
function resolveFromQuotePaymentMethod(quotePaymentMethod) {
  const v = String(quotePaymentMethod || "").trim();
  if (!v || v === "A Definir" || v === "Cartão") return null; // não ajuda a desambiguar
  return v; // "PIX" | "Dinheiro" | "Transferência" | "Boleto"
}

async function run() {
  console.log(APPLY ? "MODO APLICAR — vai gravar no banco (com backup antes).\n" : "MODO TESTE (dry-run) — nada será gravado.\n");

  const { data: rows, error } = await supabase
    .from("cashflow")
    .select("id, category, subcategory, description, orcamento_id")
    .ilike("subcategory", "quote:%")
    .is("deleted_at", null);

  if (error) {
    console.error("Erro ao buscar lançamentos:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("Nenhum lançamento com subcategory 'quote:<id>' encontrado. Nada a fazer.");
    return;
  }

  // Busca o payment_method de todos os orçamentos envolvidos, de uma vez,
  // pra desambiguar os casos "(Cartão)" sem detalhe.
  const quoteIds = [
    ...new Set(rows.map((r) => String(r.subcategory).replace(/^quote:/i, "")).filter(Boolean)),
  ];
  const { data: quotesData } = await supabase
    .from("quotes")
    .select("id, payment_method")
    .in("id", quoteIds.filter((id) => /^\d+$/.test(id)).map(Number));
  const quotePaymentMethodById = new Map((quotesData || []).map((q) => [String(q.id), q.payment_method]));

  const results = rows.map((row) => {
    const quoteIdStr = String(row.subcategory).replace(/^quote:/i, "");
    const rawMethodText = extractMethodFromDescription(row.description);
    const { label: parsedLabel, installments: parsedInstallments } = parseMethodText(rawMethodText);

    let finalLabel = parsedLabel;
    let needsReview = false;
    let reviewReason = "";

    if (!finalLabel) {
      needsReview = true;
      reviewReason = "Descrição sem forma de pagamento identificável";
      finalLabel = "Cartão"; // cai no default abaixo
    }

    if (finalLabel.toLowerCase() === "cartão" || finalLabel.toLowerCase() === "cartao") {
      // Ambíguo: "(Cartão)" sozinho, sem débito/crédito/parcelado.
      const fromQuote = resolveFromQuotePaymentMethod(quotePaymentMethodById.get(quoteIdStr));
      if (fromQuote) {
        finalLabel = fromQuote;
      } else {
        needsReview = true;
        reviewReason = reviewReason || "\"(Cartão)\" sem detalhe e orçamento sem forma de pagamento útil — assumido crédito parcelado (nº de parcelas não identificado, revisar)";
        finalLabel = "Cartão crédito parcelado";
      }
    }

    const newSubcategory = saleReceiptSubcategory(finalLabel);
    const isParcelado = newSubcategory === "venda cartão crédito parcelado";

    return {
      id: row.id,
      quoteIdStr,
      before: { category: row.category, subcategory: row.subcategory, description: row.description },
      after: {
        orcamento_id: /^\d+$/.test(quoteIdStr) ? Number(quoteIdStr) : null,
        category: "RECEITAS OPERACIONAIS",
        subcategory: newSubcategory,
        payment_method: finalLabel,
        installments: isParcelado ? parsedInstallments || null : null,
      },
      needsReview,
      reviewReason,
    };
  });

  const needingReview = results.filter((r) => r.needsReview);

  console.log(`Total de lançamentos afetados: ${results.length}`);
  console.log(`Precisam de revisão manual (forma de pagamento ambígua): ${needingReview.length}\n`);

  console.log("── 10 exemplos (antes → depois) ──");
  results.slice(0, 10).forEach((r) => {
    console.log(`\n#${r.id}${r.needsReview ? "  ⚠ REVISAR: " + r.reviewReason : ""}`);
    console.log("  antes :", JSON.stringify(r.before));
    console.log("  depois:", JSON.stringify(r.after));
  });

  if (needingReview.length > 0) {
    console.log("\n── Lançamentos marcados pra revisão (todos) ──");
    needingReview.forEach((r) => console.log(`  #${r.id} — ${r.reviewReason} — descrição: "${r.before.description}"`));
  }

  if (!APPLY) {
    console.log("\nIsso foi um teste (dry-run). Confere o relatório acima. Pra aplicar de verdade, rode de novo com --apply no final.");
    return;
  }

  // Backup antes de aplicar — estado original completo de cada linha afetada.
  const { data: fullBackupRows } = await supabase
    .from("cashflow")
    .select("*")
    .in("id", results.map((r) => r.id));

  const backupDir = join(__dirname, "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `cashflow-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify(fullBackupRows ?? [], null, 2), "utf-8");
  console.log(`\nBackup salvo em: ${backupPath}`);

  let okCount = 0;
  let errCount = 0;
  for (const r of results) {
    const { error: updErr } = await supabase.from("cashflow").update(r.after).eq("id", r.id);
    if (updErr) {
      errCount += 1;
      console.error(`  -> ERRO ao atualizar #${r.id}:`, updErr.message);
    } else {
      okCount += 1;
    }
  }

  console.log(`\nConcluído: ${okCount} atualizado(s), ${errCount} com erro.`);
  if (needingReview.length > 0) {
    console.log(
      `Lembrete: ${needingReview.length} registro(s) foram marcados pra revisão (assumidos como "Cartão crédito à vista") — vale conferir manualmente no Caixa.`
    );
  }
}

run();
