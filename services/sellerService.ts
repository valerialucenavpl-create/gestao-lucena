import { supabase } from "../services/supabase";

interface CreateSellerInput {
  name: string;
  email: string;
  password: string;
  monthlyGoal?: number;
  commission?: number;
}

export async function createSellerWithLogin(input: CreateSellerInput) {
  // 1️⃣ Criar usuário no Auth
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    return { ok: false, error: authError?.message || "Erro ao criar login" };
  }

  // 2️⃣ Salvar vendedora na tabela sellers
  const { error: dbError } = await supabase.from("sellers").insert({
    name: input.name,
    email: input.email,
    auth_user_id: authData.user.id,
    monthly_goal: input.monthlyGoal ?? 0,
    commission: input.commission ?? 0,
    active: true,
  });

  if (dbError) {
    return { ok: false, error: dbError.message };
  }

  return { ok: true };
}
