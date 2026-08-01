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
  createdAt: r.created_at || undefined,
});

export const getCashFlow = async () => {
  try {
    // Auth check only — no user_id filter so all company users share the same cashflow data
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const PAGE_SIZE = 1000;
    let allRows: DbRow[] = [];
    let from = 0;

    while (true) {
      // "id" como desempate final é essencial: muitos lançamentos têm a mesma
      // "date" e "created_at" nulo, então sem um critério único o Postgres não
      // garante a mesma ordem entre as páginas — isso fazia a paginação às
      // vezes repetir (ou pular) uma linha na fronteira de cada lote de 1000,
      // dando um saldo errado e "instável" a cada vez que a tela carregava.
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
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

      // horário real do lançamento (a coluna "date" guarda só o dia, sempre
      // à meia-noite) — usado para mostrar a hora na tela e também ajuda a
      // ordenação a não ter empates entre lançamentos do mesmo dia.
      created_at: new Date().toISOString(),
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

// Exclusão reversível: marca deleted_at/deleted_by em vez de apagar a linha.
// A leitura (getCashFlow) já filtra "deleted_at is null", então o lançamento
// some da tela normalmente, mas fica recuperável — nada de dado financeiro
// se perde de vez por engano.
export const deleteCashFlowEntry = async (id: string) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const { data, error } = await supabase
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user.id })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error };

    if (!data) {
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
