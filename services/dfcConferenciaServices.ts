import { supabase } from "./supabase";

export type DfcConferencia = {
  id: string;
  accountId: string;
  periodMonth: string; // 'YYYY-MM'
  extratoBalance: number;
  createdAt?: string;
};

const mapRow = (r: any): DfcConferencia => ({
  id: String(r.id),
  accountId: String(r.account_id),
  periodMonth: r.period_month,
  extratoBalance: Number(r.extrato_balance || 0),
  createdAt: r.created_at || undefined,
});

export async function getDfcConferencias() {
  const { data, error } = await supabase
    .from("dfc_extrato_conferencia")
    .select("*")
    .order("period_month", { ascending: false });
  if (error) {
    console.error("Erro ao carregar conferências de extrato:", error);
    return { ok: false, error, data: [] as DfcConferencia[] };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

// Upsert manual (sem depender de constraint) — busca se já existe pra esse
// mês+conta e atualiza; senão insere. Mantém histórico só do valor atual
// (um registro por conta+mês, sobrescrito se a usuária digitar de novo).
export async function saveDfcConferencia(input: { accountId: string; periodMonth: string; extratoBalance: number }) {
  const { data: authData } = await supabase.auth.getUser();
  const { data: existing } = await supabase
    .from("dfc_extrato_conferencia")
    .select("id")
    .eq("account_id", Number(input.accountId))
    .eq("period_month", input.periodMonth)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("dfc_extrato_conferencia")
      .update({ extrato_balance: input.extratoBalance })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { ok: false, error };
    return { ok: true, data: mapRow(data) };
  }

  const { data, error } = await supabase
    .from("dfc_extrato_conferencia")
    .insert({
      account_id: Number(input.accountId),
      period_month: input.periodMonth,
      extrato_balance: input.extratoBalance,
      created_by: authData.user?.id ?? null,
    })
    .select()
    .single();
  if (error) return { ok: false, error };
  return { ok: true, data: mapRow(data) };
}
