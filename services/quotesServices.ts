import { supabase } from "./supabase";
import { Quote } from "../types";

// ---------------------------
// GET ALL QUOTES
// ---------------------------
export async function getQuotes() {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Erro ao carregar orçamentos:", error);
    return { ok: false, error };
  }

  return { ok: true, data: (data || []) as Quote[] };
}

// ---------------------------
// GET ONE QUOTE BY ID
// ---------------------------
export async function getQuoteById(id: string) {
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).single();

  if (error) {
    console.error("Erro ao buscar orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: data as Quote };
}

// ---------------------------
// CREATE QUOTE
// ---------------------------
export async function createQuote(quote: Quote) {
  const payload = normalizeQuoteForDb(quote);

  const { data, error } = await supabase.from("quotes").insert(payload).select().single();

  if (error) {
    console.error("Erro ao criar orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: data as Quote };
}

// ---------------------------
// UPDATE QUOTE
// ---------------------------
export async function updateQuote(id: string, fields: Partial<Quote>) {
  const payload = normalizeQuoteForDb(fields as Quote);

  const { data, error } = await supabase
    .from("quotes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: data as Quote };
}

// ---------------------------
// DELETE QUOTE
// ---------------------------
export async function deleteQuote(id: string) {
  const { error } = await supabase.from("quotes").delete().eq("id", id);

  if (error) {
    console.error("Erro ao deletar orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true };
}

// ---------------------------
// HELPERS
// ---------------------------
function normalizeQuoteForDb(quote: Quote) {
  // IMPORTANTÍSSIMO:
  // Supabase normalmente guarda "date" como string/ISO.
  // Também é comum "items" ser jsonb.
  const safe: any = { ...quote };

  // Normaliza date
  if (safe.date instanceof Date) safe.date = safe.date.toISOString();

  // Se vier "string | Date", deixa como string ISO
  if (typeof safe.date === "string") {
    // tenta manter como está; se for string simples, ok.
  }

  return safe;
}
