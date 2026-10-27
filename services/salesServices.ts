import { supabase } from "./supabase";

export type SaleRow = {
  id: number;
  quote_id: number | null;
  total: number | null;
  date: string | null; // timestamptz
  client_id?: number | null;
  seller_id?: number | null;
  // Status próprio da venda — hoje só usado pra "Cancelado" (cancelar não
  // mexe no orçamento de origem, só marca a venda em si).
  status?: string | null;
};

// -------------------------------------------------------
// GET ALL SALES
// -------------------------------------------------------
export async function getSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .is("deleted_at", null)
    .order("date", { ascending: false }); // <-- era saleDate

  if (error) {
    console.error("Erro ao carregar vendas:", error);
    return { ok: false, error, data: [] as SaleRow[] }; // <-- IMPORTANTE: sempre array
  }

  return { ok: true, data: (data ?? []) as SaleRow[] };
}

// -------------------------------------------------------
// CREATE SALE
// -------------------------------------------------------
export async function createSale(input: {
  quote_id: number;
  total?: number | null;
  date?: string | null; // ex: new Date().toISOString()
}) {
  // Colunas reais da tabela "sales" (conferido direto no banco):
  // id, date, seller_id, total, deleted_at, deleted_by, client_id, quote_id.
  // Sem created_at — a tabela não tem essa coluna.
  const { data, error } = await supabase
    .from("sales")
    .insert({
      quote_id: input.quote_id ?? null,
      total: input.total ?? null,
      date: input.date ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar venda:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}

// -------------------------------------------------------
// UPDATE SALE
// -------------------------------------------------------
export async function updateSale(id: number, fields: Partial<SaleRow>) {
  const { data, error } = await supabase
    .from("sales")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar venda:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}

// -------------------------------------------------------
// DELETE SALE (exclusão reversível — marca deleted_at, não apaga a linha)
// -------------------------------------------------------
export async function deleteSale(id: number) {
  const { data: authData } = await supabase.auth.getUser();

  // Um UPDATE barrado pela RLS não retorna erro — só não afeta nenhuma
  // linha. Por isso confirmamos com .select() que a linha voltou.
  const { data, error } = await supabase
    .from("sales")
    .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Erro ao deletar venda:", error);
    return { ok: false, error: error ?? new Error("Nenhuma linha foi alterada (verifique permissão).") };
  }

  return { ok: true };
}
