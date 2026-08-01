import { supabase } from "./supabase";
import { createCashFlowEntry } from "./cashFlowServices";
import { Receivable } from "../types";

const TABLE = "receivables";

type DbRow = {
  id: string;
  quote_id: number;
  quote_number: number | null;
  customer_name: string | null;
  amount: number | null;
  payment_method: string | null;
  due_date: string | null;
  status: string;
  received_at: string | null;
  received_by: string | null;
  created_at: string | null;
};

const mapRow = (r: DbRow): Receivable & { quoteNumber?: number } => ({
  id: r.id,
  quoteId: String(r.quote_id),
  quoteNumber: r.quote_number ?? undefined,
  customerName: r.customer_name ?? "Cliente não identificado",
  amount: Number(r.amount ?? 0),
  paymentMethod: r.payment_method ?? "A Definir",
  dueDate: r.due_date ?? "",
  status: (r.status as "pending" | "received") ?? "pending",
  receivedAt: r.received_at ?? undefined,
  receivedBy: r.received_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

export const getReceivables = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  if (error) return { ok: false as const, error };
  return { ok: true as const, data: (data ?? []).map(mapRow) };
};

// Marca como recebido e lança automaticamente a "Entrada" correspondente no
// caixa — mantém os dois em sincronia sem depender de digitação manual.
export const markReceivableAsReceived = async (
  receivable: Receivable,
  options?: { category?: string; description?: string }
) => {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) return { ok: false as const, error: authErr };

  // .eq("status","pending") também evita dar baixa duas vezes no mesmo item.
  // Um UPDATE que a RLS ou essa condição barrar não retorna erro — só não
  // afeta nenhuma linha — por isso confirmamos com .select() que gravou.
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      received_by: authData.user.id,
    })
    .eq("id", receivable.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false as const,
      error: error ?? new Error("Não foi possível dar baixa (já recebido ou sem permissão)."),
    };
  }

  const cfResult = await createCashFlowEntry({
    type: "Entrada",
    amount: receivable.amount,
    category: (options?.category ?? "VENDA").trim().toUpperCase(),
    subcategory: `quote:${receivable.quoteId}`,
    description: options?.description ?? `Recebimento - ${receivable.customerName}`,
    date: new Date().toISOString().split("T")[0],
  });

  if (!cfResult.ok) {
    // Desfaz a baixa pra não ficar "recebido" sem o lançamento de caixa.
    await supabase
      .from(TABLE)
      .update({ status: "pending", received_at: null, received_by: null })
      .eq("id", receivable.id);
    return { ok: false as const, error: cfResult.error };
  }

  return { ok: true as const };
};
