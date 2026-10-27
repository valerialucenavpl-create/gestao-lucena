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
  orcamentoId: r.orcamento_id != null ? String(r.orcamento_id) : undefined,
  paymentMethod: (r as any)?.payment_method ?? undefined,
  installments: r.installments != null ? Number(r.installments) : undefined,
  accountId: r.account_id != null ? String(r.account_id) : undefined,
  competenciaDate: r.competencia_date ? toYMD(r.competencia_date) : undefined,
  isTransfer: Boolean(r.is_transfer),
  transferGroupId: r.transfer_group_id || undefined,
  movementKind: r.movement_kind || undefined,
  attachmentPath: r.attachment_path || undefined,
  pedidoAlteracaoId: r.pedido_alteracao_id != null ? String(r.pedido_alteracao_id) : undefined,
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

      orcamento_id: payload.orcamentoId ? Number(payload.orcamentoId) : null,
      payment_method: payload.paymentMethod || null,
      installments: payload.installments || null,
      account_id: payload.accountId ? Number(payload.accountId) : null,
      competencia_date: payload.competenciaDate || null,
      is_transfer: payload.isTransfer || false,
      transfer_group_id: payload.transferGroupId || null,
    };
    // Colunas da devolução (2026-10-05_alteracao_devolucao_pedido.sql) — só
    // entram quando preenchidas, pra não quebrar o lançamento comum caso a
    // migração ainda não tenha rodado.
    if (payload.movementKind) dbPayload.movement_kind = payload.movementKind;
    if (payload.attachmentPath) dbPayload.attachment_path = payload.attachmentPath;
    if (payload.pedidoAlteracaoId) dbPayload.pedido_alteracao_id = Number(payload.pedidoAlteracaoId);

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
//
// Transferência entre contas sempre vem em par (saída numa conta + entrada
// na outra) — excluir um lado tem que excluir o outro também, senão o saldo
// de uma das contas fica errado (uma perna "órfã" da transferência).
export const deleteCashFlowEntry = async (id: string) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const { data: current } = await supabase
      .from(TABLE)
      .select("id, transfer_group_id")
      .eq("id", id)
      .maybeSingle();

    const idsToDelete = [id];
    if (current?.transfer_group_id) {
      const { data: pair } = await supabase
        .from(TABLE)
        .select("id")
        .eq("transfer_group_id", current.transfer_group_id)
        .neq("id", id)
        .is("deleted_at", null);
      (pair || []).forEach((p: any) => idsToDelete.push(String(p.id)));
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user.id })
      .in("id", idsToDelete)
      .select("id");

    if (error) return { ok: false, error };

    if (!data || data.length === 0) {
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

// Transferência entre contas próprias: cria dois lançamentos vinculados
// (saída na origem + entrada no destino), mesmo transfer_group_id nos dois.
// Não é receita nem despesa de verdade — is_transfer=true fica de fora dos
// totais de entrada/saída e do DRE/DFC, só move saldo entre contas.
export const createTransfer = async (input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description?: string;
}) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const groupId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseDescription = input.description?.trim() || "Transferência entre contas";
    const nowIso = new Date().toISOString();

    const rows = [
      {
        user_id: authData.user.id,
        type: "Saída",
        description: baseDescription,
        [AMOUNT_COL]: Number(input.amount || 0),
        category: "TRANSFERÊNCIA",
        subcategory: "transferência entre contas",
        date: ymdToTimestamptz(input.date),
        created_at: nowIso,
        account_id: Number(input.fromAccountId),
        is_transfer: true,
        transfer_group_id: groupId,
      },
      {
        user_id: authData.user.id,
        type: "Entrada",
        description: baseDescription,
        [AMOUNT_COL]: Number(input.amount || 0),
        category: "TRANSFERÊNCIA",
        subcategory: "transferência entre contas",
        date: ymdToTimestamptz(input.date),
        created_at: nowIso,
        account_id: Number(input.toAccountId),
        is_transfer: true,
        transfer_group_id: groupId,
      },
    ];

    const { data, error } = await supabase.from(TABLE).insert(rows).select("*");
    if (error) return { ok: false, error };

    return { ok: true, data: (data as DbRow[]).map(mapRowToEntry) };
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
      orcamento_id: payload.orcamentoId ? Number(payload.orcamentoId) : null,
      payment_method: payload.paymentMethod || null,
      installments: payload.installments || null,
      account_id: payload.accountId ? Number(payload.accountId) : null,
      competencia_date: payload.competenciaDate || null,
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
