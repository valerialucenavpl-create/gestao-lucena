import { supabase } from "./supabase";
import { BankAccount } from "../types";

const mapRow = (r: any): BankAccount => ({
  id: String(r.id),
  name: r.name || "",
  initialBalance: Number(r.initial_balance || 0),
  initialBalanceDate: r.initial_balance_date || "",
  active: r.active !== false,
  accountType: r.account_type === "reserva" ? "reserva" : "movimento",
});

export async function getBankAccounts() {
  const { data, error } = await supabase.from("bank_accounts").select("*").order("name", { ascending: true });
  if (error) {
    console.error("Erro ao carregar contas:", error);
    return { ok: false, error, data: [] as BankAccount[] };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

export async function createBankAccount(input: {
  name: string;
  initialBalance: number;
  initialBalanceDate: string;
  accountType?: "movimento" | "reserva";
}) {
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      name: input.name.trim(),
      initial_balance: input.initialBalance,
      initial_balance_date: input.initialBalanceDate,
      account_type: input.accountType || "movimento",
    })
    .select()
    .single();
  if (error) {
    console.error("Erro ao criar conta:", error);
    return { ok: false, error };
  }
  return { ok: true, data: mapRow(data) };
}

export async function updateBankAccount(
  id: string,
  fields: Partial<{ name: string; initialBalance: number; initialBalanceDate: string; active: boolean; accountType: "movimento" | "reserva" }>
) {
  const payload: Record<string, unknown> = {};
  if (fields.name !== undefined) payload.name = fields.name.trim();
  if (fields.initialBalance !== undefined) payload.initial_balance = fields.initialBalance;
  if (fields.initialBalanceDate !== undefined) payload.initial_balance_date = fields.initialBalanceDate;
  if (fields.active !== undefined) payload.active = fields.active;
  if (fields.accountType !== undefined) payload.account_type = fields.accountType;

  const { data, error } = await supabase.from("bank_accounts").update(payload).eq("id", id).select().single();
  if (error) {
    console.error("Erro ao atualizar conta:", error);
    return { ok: false, error };
  }
  return { ok: true, data: mapRow(data) };
}
