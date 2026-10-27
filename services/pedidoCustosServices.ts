import { supabase } from "./supabase";

// Vínculo de custo do Caixa ao pedido (ver supabase/2026-10-13_pedido_custos.sql).
export type PedidoCusto = {
  id: string;
  cashflowId: string;
  quoteId: string;
  amount: number;
};

export type PedidoCustoAllocation = { quoteId: string; amount: number };

// Subcategorias de Saída que podem ser vinculadas a pedido.
export const COST_LINK_SUBCATEGORIES = [
  "compra de mercadorias",
  "frete de fornecedores",
  "consumíveis de produção",
  "mão de obra terceirizada / instalação",
];

export const canLinkCostToPedido = (entry: { type?: string; subcategory?: string; date?: string; isTransfer?: boolean }, reliableStart: string) =>
  entry.type === "Saída" &&
  !entry.isTransfer &&
  COST_LINK_SUBCATEGORIES.includes((entry.subcategory || "").trim().toLowerCase()) &&
  String(entry.date || "").slice(0, 10) >= reliableStart;

const mapRow = (r: any): PedidoCusto => ({
  id: String(r.id),
  cashflowId: String(r.cashflow_id),
  quoteId: String(r.quote_id),
  amount: Number(r.amount || 0),
});

export async function getPedidoCustos(filter?: { quoteId?: string }) {
  let all: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("pedido_custos").select("*").range(from, from + 999);
    if (filter?.quoteId) q = q.eq("quote_id", filter.quoteId);
    const { data, error } = await q;
    if (error) {
      // Tabela ainda não criada (migração pendente) não deve quebrar as telas.
      console.warn("Não foi possível carregar custos vinculados a pedidos:", error.message);
      return { ok: false, error, data: [] as PedidoCusto[] };
    }
    all = all.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return { ok: true, data: all.map(mapRow) };
}

// Substitui todas as linhas de uma saída pelas novas (lista vazia = desvincula).
export async function setPedidoCustosForCashflow(cashflowId: string, allocations: PedidoCustoAllocation[]) {
  const { error: delError } = await supabase.from("pedido_custos").delete().eq("cashflow_id", cashflowId);
  if (delError) return { ok: false, error: delError };

  const rows = allocations
    .filter((a) => a.quoteId && a.amount > 0)
    .map((a) => ({ cashflow_id: cashflowId, quote_id: a.quoteId, amount: Number(a.amount.toFixed(2)) }));
  if (rows.length === 0) return { ok: true, data: [] as PedidoCusto[] };

  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("pedido_custos")
    .insert(rows.map((r) => ({ ...r, created_by: authData.user?.id ?? null })))
    .select();
  if (error) return { ok: false, error };
  return { ok: true, data: (data ?? []).map(mapRow) };
}
