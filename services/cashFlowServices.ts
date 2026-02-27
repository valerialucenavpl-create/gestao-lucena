// src/services/cashFlowServices.ts
import { supabase } from "./supabase";
import { CashFlowEntry } from "../types";

const TABLE = "cashflow";

/**
 * 🔧 AJUSTE AQUI se o nome da coluna do valor NÃO for "value"
 * No seu print aparece "val..." (cortado).
 * Exemplos comuns: "value", "valor", "val", "amount"
 */
const AMOUNT_COL = "value"; // <-- troque se necessário

type DbRow = {
  id: string | number;
  user_id?: string | null;

  type: string; // "Entrada" | "Saída"
  description?: string | null;

  // coluna de valor (nome varia)
  [key: string]: any;

  // no seu print é timestamptz
  date: string; // ex: "2026-01-07T00:00:00+00:00" ou "2026-01-07"
  created_at?: string;
};

const toYMD = (dateLike: string): string => {
  // Se vier "2026-01-07T..." corta para "2026-01-07"
  if (!dateLike) return "";
  return dateLike.includes("T") ? dateLike.split("T")[0] : dateLike;
};

const ymdToTimestamptz = (ymd: string): string => {
  // Para salvar em timestamptz sem dor
  // "2026-01-07" -> "2026-01-07T00:00:00.000Z"
  return `${ymd}T00:00:00.000Z`;
};

const mapRowToEntry = (r: DbRow): CashFlowEntry => ({
  id: String(r.id),
  type: (r.type as any) ?? "Entrada",
  amount: Number(r?.[AMOUNT_COL] ?? 0),
  category: (r as any)?.category ?? "",
  subcategory: (r as any)?.subcategory ?? "",
  description: r.description ?? "",
  date: toYMD(r.date),
});

export const getCashFlow = async () => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", authData.user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error };

    const rows = (data ?? []) as DbRow[];
    return { ok: true, data: rows.map(mapRowToEntry) };
  } catch (e) {
    return { ok: false, error: e };
  }
};

export const createCashFlowEntry = async (
  payload: Omit<CashFlowEntry, "id">
) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const dbPayload: any = {
      user_id: authData.user.id,
      type: payload.type,
      description: payload.description ?? null,

      // valor
      [AMOUNT_COL]: Number(payload.amount || 0),

      // se você adicionou category/subcategory na tabela, isso salva também:
      category: payload.category?.trim() || null,
      subcategory: payload.subcategory?.trim() || null,

      // sua coluna no print é timestamptz:
      date: ymdToTimestamptz(payload.date),
    };

    const { data, error } = await supabase
      .from(TABLE)
      .insert(dbPayload)
      .select("*")
      .maybeSingle();

    if (error) return { ok: false, error };

    return { ok: true, data: mapRowToEntry(data as DbRow) };
  } catch (e) {
    return { ok: false, error: e };
  }
};

export const deleteCashFlowEntry = async (id: string) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    // extra segurança: só apaga do próprio user
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", authData.user.id);

    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
};

// (opcional) se você quiser editar lançamentos depois
export const updateCashFlowEntry = async (
  id: string,
  payload: Omit<CashFlowEntry, "id">
) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const dbPayload: any = {
      type: payload.type,
      description: payload.description ?? null,
      [AMOUNT_COL]: Number(payload.amount || 0),
      category: payload.category?.trim() || null,
      subcategory: payload.subcategory?.trim() || null,
      date: ymdToTimestamptz(payload.date),
    };

    const { data, error } = await supabase
      .from(TABLE)
      .update(dbPayload)
      .eq("id", id)
      .eq("user_id", authData.user.id)
      .select("*")
      .maybeSingle();

    if (error) return { ok: false, error };
    return { ok: true, data: mapRowToEntry(data as DbRow) };
  } catch (e) {
    return { ok: false, error: e };
  }
};
