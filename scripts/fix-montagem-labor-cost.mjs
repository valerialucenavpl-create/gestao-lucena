// Corrige orçamentos já salvos que têm itens de "Montagem" avulsa (id
// começando com "qi-montagem-") criados antes da correção do bug em que o
// custo de insumo da montagem era jogado inteiro dentro de "Mão de obra"
// (em vez de ser separado em "Custo matéria-prima"), e sem popular
// laborBreakdown (por isso "ver detalhamento" não mostrava as linhas).
//
// O que o script faz por item afetado:
//   - Separa assemblyBreakdown em linhas de insumo (materialBreakdown) e
//     linhas de mão de obra (laborBreakdown), usando o prefixo
//     "Mão de obra (" que já era usado pra marcar as linhas de mão de obra.
//   - Ajusta item.materialCost e item.laborCost pra bater com essa divisão.
//   - Remove item.assemblyCost / item.assemblyBreakdown do item (esse valor
//     também estava contando em dobro na linha "Custo de montagem" do
//     detalhamento Admin).
//   - item.cost e o preço/total do orçamento (quote.totalPrice etc.) NÃO
//     mudam — é só reclassificação interna dos mesmos valores.
//
// Aviso: como o assemblyBreakdown antigo só guardava {insumoName, value}
// (sem contagem de pessoas/horas), as linhas de mão de obra recuperadas
// aqui usam count=1/hours=1/rate=valor — o VALOR total fica certo, mas o
// detalhe de "quantas pessoas x quantas horas" desses registros antigos
// não é recuperável.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-montagem-labor-cost.mjs
//     -> modo TESTE (dry-run): só mostra o que mudaria, não grava nada.
//   ... node scripts/fix-montagem-labor-cost.mjs --apply
//     -> grava de verdade no banco.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltam variáveis: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY antes de rodar.\n" +
      "A service role key fica em Supabase → Project Settings → API Keys → Secret keys (não é a mesma chave 'anon' do site)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const LABOR_PREFIX = "Mão de obra (";

function fixItem(item) {
  if (!item || typeof item !== "object") return null;
  if (!String(item.id || "").startsWith("qi-montagem-")) return null;
  if (!Array.isArray(item.assemblyBreakdown) || item.assemblyBreakdown.length === 0) return null;
  if (Array.isArray(item.laborBreakdown) && item.laborBreakdown.length > 0) return null; // já corrigido

  const materialLines = [];
  const laborLines = [];

  for (const line of item.assemblyBreakdown) {
    const value = Number(line?.value) || 0;
    const name = String(line?.insumoName || "");
    if (name.startsWith(LABOR_PREFIX)) {
      const role = name.slice(LABOR_PREFIX.length, -1) || "Mão de obra";
      laborLines.push({ role, count: 1, hours: 1, rate: value, total: value });
    } else {
      materialLines.push({
        name: name || "Insumo",
        color: "Padrão",
        unit: "un",
        quantity: 1,
        unitCost: value,
        totalCost: value,
      });
    }
  }

  const materialCost = materialLines.reduce((s, l) => s + l.totalCost, 0);
  const laborCost = laborLines.reduce((s, l) => s + l.total, 0);

  const fixed = { ...item };
  fixed.materialCost = materialCost;
  fixed.materialBreakdown = materialLines.length > 0 ? materialLines : undefined;
  fixed.laborCost = laborCost;
  fixed.laborBreakdown = laborLines.length > 0 ? laborLines : undefined;
  fixed.cost = materialCost + laborCost;
  delete fixed.assemblyCost;
  delete fixed.assemblyBreakdown;

  return fixed;
}

async function run() {
  console.log(APPLY ? "MODO APLICAR — vai gravar no banco.\n" : "MODO TESTE (dry-run) — nada será gravado.\n");

  const { data: quotes, error } = await supabase.from("quotes").select("id, quote_number, items");
  if (error) {
    console.error("Erro ao buscar orçamentos:", error.message);
    process.exit(1);
  }

  let quotesAffected = 0;
  let itemsAffected = 0;

  for (const quote of quotes || []) {
    const items = Array.isArray(quote.items) ? quote.items : [];
    let changed = false;
    const newItems = items.map((item) => {
      const fixed = fixItem(item);
      if (!fixed) return item;
      changed = true;
      itemsAffected += 1;
      return fixed;
    });

    if (!changed) continue;
    quotesAffected += 1;

    console.log(
      `Orçamento N° ${quote.quote_number ?? quote.id} (id=${quote.id}): ${newItems.filter((_, i) => newItems[i] !== items[i]).length} item(ns) de montagem corrigido(s).`
    );

    if (APPLY) {
      const { error: updErr } = await supabase.from("quotes").update({ items: newItems }).eq("id", quote.id);
      if (updErr) {
        console.error(`  -> ERRO ao salvar orçamento ${quote.id}:`, updErr.message);
      } else {
        console.log("  -> salvo.");
      }
    }
  }

  console.log(
    `\nResumo: ${quotesAffected} orçamento(s) afetado(s), ${itemsAffected} item(ns) de montagem corrigido(s).`
  );
  if (!APPLY) {
    console.log("Isso foi um teste (dry-run). Pra gravar de verdade, rode de novo com --apply no final.");
  }
}

run();
