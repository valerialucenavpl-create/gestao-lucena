import { supabase } from "./supabase";

export type SaleRow = {
  id: number;
  client_id: number | null;
  quote_id: number | null;
  total: number | null;
  date: string | null;        // timestamptz
  created_at: string | null;  // timestamptz
};

// -------------------------------------------------------
// GET ALL SALES
// -------------------------------------------------------
export async function getSales() {
  const { data, error } = await supabase
    .from("sales")
    .select("*")
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
  client_id?: number | null;
  quote_id?: number | null;
  total?: number | null;
  date?: string | null; // ex: new Date().toISOString()
}) {
  const { data, error } = await supabase
    .from("sales")
    .insert({
      client_id: input.client_id ?? null,
      quote_id: input.quote_id ?? null,
      total: input.total ?? null,
      date: input.date ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
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
// DELETE SALE
// -------------------------------------------------------
export async function deleteSale(id: number) {
  const { error } = await supabase.from("sales").delete().eq("id", id);

  if (error) {
    console.error("Erro ao deletar venda:", error);
    return { ok: false, error };
  }

  return { ok: true };
}
