import { supabase } from "./supabase";
import { Quote } from "../types";

export type QuoteHistoryRow = {
  id: number;
  quote_id: number;
  snapshot: Quote;
  created_at: string;
  // "edit" (padrão, salvo do formulário completo) | "cancel" | "reactivate"
  // — usado só pra rotular a linha na lista de histórico.
  event_type?: string | null;
  event_label?: string | null;
  event_description?: string | null;
  created_by_name?: string | null;
};

// -------------------------------------------------------
// LISTAR HISTÓRICO DE UM ORÇAMENTO
// -------------------------------------------------------
export async function getQuoteHistory(quoteId: string) {
  const { data, error } = await supabase
    .from("quote_history")
    .select("*")
    .eq("quote_id", Number(quoteId))
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar histórico do orçamento:", error);
    return { ok: false, error, data: [] as QuoteHistoryRow[] };
  }

  return { ok: true, data: (data ?? []) as QuoteHistoryRow[] };
}

// -------------------------------------------------------
// CRIAR ENTRADA DE HISTÓRICO (snapshot do orçamento no momento do save)
// -------------------------------------------------------
export async function createQuoteHistoryEntry(
  quoteId: string,
  snapshot: Quote,
  eventType?: string,
  eventLabel?: string,
  extra?: { description?: string; userName?: string }
) {
  const { data: authData } = await supabase.auth.getUser();

  const row: Record<string, unknown> = {
    quote_id: Number(quoteId),
    snapshot,
    created_by: authData.user?.id ?? null,
    event_type: eventType ?? "edit",
    event_label: eventLabel ?? null,
  };
  // Colunas novas (2026-10-05) só quando usadas — eventos antigos continuam
  // gravando mesmo sem a migração.
  if (extra?.description) row.event_description = extra.description;
  if (extra?.userName) row.created_by_name = extra.userName;

  const { data, error } = await supabase
    .from("quote_history")
    .insert(row)
    .select()
    .single();

  if (error) {
    // Histórico é um registro auxiliar — se a gravação falhar (ex.: tabela
    // ainda não criada no banco), não deve travar o salvamento do
    // orçamento em si, só avisa no console.
    console.error("Erro ao registrar histórico do orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}
