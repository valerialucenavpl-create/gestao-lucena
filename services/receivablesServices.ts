import { supabase } from "./supabase";
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
