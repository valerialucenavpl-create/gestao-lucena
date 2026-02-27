import { supabase } from "./supabase";
import { User } from "../types";

const USERS_TABLE = "users";

/**
 * Tipo da linha no banco (public.users)
 */
type DbUserRow = {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role: "Admin" | "Sales" | "Finance";
  monthly_goal?: number | null;
  created_at?: string;
};

/**
 * 🔹 Buscar todos os usuários (para Settings / Header)
 */
export const getUsers = async (): Promise<{
  ok: boolean;
  data?: User[];
  error?: any;
}> => {
  try {
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      return { ok: false, error };
    }

    const rows = (data ?? []) as DbUserRow[];

    const mapped: User[] = rows.map((r) => ({
      id: r.auth_user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      monthlyGoal:
        r.role === "Sales" || r.role === "Finance"
          ? Number(r.monthly_goal ?? 0)
          : undefined,
      avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
        r.name || r.email
      )}`,
    }));

    return { ok: true, data: mapped };
  } catch (e) {
    return { ok: false, error: e };
  }
};

/**
 * 🔹 Buscar perfil do usuário logado (por auth_user_id)
 */
export const getUserProfile = async (
  authUserId: string,
  emailFallback?: string
): Promise<{
  ok: boolean;
  data?: User;
  error?: any;
}> => {
  try {
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      return { ok: false, error };
    }

    if (!data) {
      // fallback se ainda não existir linha
      return {
        ok: true,
        data: {
          id: authUserId,
          name: (emailFallback ?? "User").split("@")[0],
          email: emailFallback ?? "",
          role: "Admin",
        },
      };
    }

    const row = data as DbUserRow;

    const mapped: User = {
      id: row.auth_user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      monthlyGoal:
        row.role === "Sales" || row.role === "Finance"
          ? Number(row.monthly_goal ?? 0)
          : undefined,
    };

    return { ok: true, data: mapped };
  } catch (e) {
    return { ok: false, error: e };
  }
};

/**
 * 🔹 Criar usuária chamando a Edge Function
 * (usado no modal de cadastro)
 */
export const createUser = async (payload: {
  name: string;
  email: string;
  password: string;
  role: "Admin" | "Sales" | "Finance";
  monthlyGoal?: number;
}) => {
  try {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: payload,
    });

    if (error) return { ok: false, error };
    if (!data?.success) {
      return { ok: false, error: data?.error ?? "Erro ao criar usuária" };
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e };
  }
};
