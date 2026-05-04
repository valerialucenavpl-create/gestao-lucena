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

const normalizeType = (t: string): "Entrada" | "Saída" => {
  const v = String(t || "").toLowerCase().trim();
  if (v === "saída" || v === "saida" || v === "expense" || v === "out" || v === "saída") return "Saída";
  return "Entrada";
};

const mapRowToEntry = (r: DbRow): CashFlowEntry => ({
  id: String(r.id),
  type: normalizeType(r.type ?? "Entrada"),
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

    // Supabase default limit is 1000 rows — paginate to fetch ALL records
    const PAGE_SIZE = 1000;
    let allRows: DbRow[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", authData.user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) return { ok: false, error };

      const rows = (data ?? []) as DbRow[];
      allRows = [...allRows, ...rows];

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return { ok: true, data: allRows.map(mapRowToEntry) };
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

    // validação pós-delete para evitar falso positivo/falso negativo
    const { data: stillExists, error: checkError } = await supabase
      .from(TABLE)
      .select("id")
      .eq("id", id)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (checkError) return { ok: false, error: checkError };

    if (stillExists) {
      return {
        ok: false,
        error: new Error(
          "Nenhum lançamento foi removido. Verifique permissão de exclusão (RLS) ou se o registro ainda existe."
        ),
      };
    }

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
