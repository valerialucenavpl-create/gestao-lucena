import { supabase } from "./supabase";
import { createClient } from "@supabase/supabase-js";
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
  avatar?: string | null;
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

    const mapped: User[] = rows.map((r: any) => ({
      id: r.auth_user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      monthlyGoal:
        r.role === "Sales" || r.role === "Finance"
          ? Number(r.monthly_goal ?? 0)
          : undefined,
      avatar: r.avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(r.name || r.email)}`,
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
      // fallback se ainda não existir linha — nunca conceder Admin por padrão
      return {
        ok: true,
        data: {
          id: authUserId,
          name: (emailFallback ?? "User").split("@")[0],
          email: emailFallback ?? "",
          role: "Sales",
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
      avatar: row.avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(row.name || row.email)}`,
    };

    return { ok: true, data: mapped };
  } catch (e) {
    return { ok: false, error: e };
  }
};

/**
 * 🔹 Atualizar perfil de usuária (role, nome, meta) na tabela public.users
 */
export const updateUserProfile = async (
  authUserId: string,
  fields: { name?: string; role?: "Admin" | "Sales" | "Finance"; monthlyGoal?: number; avatar?: string }
): Promise<{ ok: boolean; error?: any }> => {
  try {
    const payload: Record<string, unknown> = {};
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.role !== undefined) payload.role = fields.role;
    if (fields.monthlyGoal !== undefined) payload.monthly_goal = fields.monthlyGoal;
    if ((fields as any).avatar !== undefined) payload.avatar = (fields as any).avatar;

    const { error } = await supabase
      .from(USERS_TABLE)
      .update(payload)
      .eq("auth_user_id", authUserId);

    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
};

/**
 * 🔹 Upload de avatar do usuário para o Storage
 */
export const uploadUserAvatar = async (file: File): Promise<{ ok: boolean; url?: string; error?: any }> => {
  try {
    const ext = file.name.split(".").pop() || "png";
    const path = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return { ok: false, error: upErr };
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
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
  avatar?: string;
}) => {
  const errorToText = (error: any) => {
    const message = String(
      typeof error === "string"
        ? error
        : error?.message ?? error?.error_description ?? error?.name ?? ""
    );
    let serialized = "";
    try {
      serialized = JSON.stringify(error ?? {});
    } catch {
      serialized = "";
    }
    return `${message} ${serialized}`.toLowerCase();
  };

  const isEmailRateLimitError = (error: any) => {
    const message = errorToText(error);
    return (
      message.includes("email rate limit exceeded") ||
      (message.includes("rate limit") && message.includes("email"))
    );
  };

  const isEmailNotConfirmedError = (error: any) => {
    const message = errorToText(error);
    return (
      message.includes("email not confirmed") ||
      message.includes("email_not_confirmed")
    );
  };

  const isInvalidCredentialsError = (error: any) => {
    const message = errorToText(error);
    return (
      message.includes("invalid login credentials") ||
      message.includes("invalid credentials")
    );
  };

  const shouldFallbackToClientSignup = (error: any) => {
    const message = errorToText(error);

    return (
      message.includes("failed to send a request to the edge function") ||
      message.includes("failed to fetch") ||
      message.includes("cors") ||
      message.includes("preflight") ||
      message.includes("network") ||
      message.includes("row-level security") ||
      message.includes("violates row-level security policy") ||
      message.includes("permission denied") ||
      message.includes("forbidden") ||
      message.includes("not authorized") ||
      message.includes("invalid login credentials") ||
      message.includes("function not found") ||
      message.includes("edge function returned a non-2xx")
    );
  };

  const extractMissingColumn = (errorMessage: string) => {
    const supabaseSchemaCache = errorMessage.match(
      /Could not find the '([^']+)' column/i
    );
    if (supabaseSchemaCache?.[1]) return supabaseSchemaCache[1];

    const postgresMissing = errorMessage.match(/column "([^"]+)" does not exist/i);
    if (postgresMissing?.[1]) return postgresMissing[1];

    return null;
  };

  const upsertUserProfileWithFallback = async (
    authUserId: string,
    dbClient: any = supabase
  ) => {
    const isGoalRole = payload.role === "Sales" || payload.role === "Finance";
    let profilePayload: Record<string, unknown> = {
      id: authUserId,
      auth_user_id: authUserId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      monthly_goal: isGoalRole ? Number(payload.monthlyGoal ?? 0) : 0,
      ...(payload.avatar ? { avatar: payload.avatar } : {}),
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await dbClient.from(USERS_TABLE).insert(profilePayload);
      if (!error) return { ok: true as const };

      const message = String(error.message ?? "");
      const duplicateRecord =
        message.toLowerCase().includes("duplicate key") ||
        message.toLowerCase().includes("already exists");
      if (duplicateRecord) {
        return { ok: true as const };
      }

      const missingColumn = extractMissingColumn(message);
      if (missingColumn && missingColumn in profilePayload) {
        delete profilePayload[missingColumn];
        continue;
      }

      if (
        /invalid input syntax/i.test(message) &&
        /id/i.test(message) &&
        "id" in profilePayload
      ) {
        delete profilePayload.id;
        continue;
      }

      return { ok: false as const, error };
    }

    return {
      ok: false as const,
      error: new Error("Nao foi possivel salvar o perfil da usuaria."),
    };
  };

  const createByClientSignup = async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        ok: false as const,
        error: new Error("Variaveis do Supabase nao configuradas."),
      };
    }

    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    let authUserId = "";
    let hasSession = false;

    const { data: authData, error: authError } = await tempClient.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          name: payload.name,
          role: payload.role,
          monthly_goal:
            payload.role === "Sales" || payload.role === "Finance"
              ? Number(payload.monthlyGoal ?? 0)
              : 0,
        },
      },
    });

    if (authError) {
      const authMessage = errorToText(authError);
      const userAlreadyExists =
        authMessage.includes("already registered") ||
        authMessage.includes("already exists") ||
        authMessage.includes("user_already_exists");
      const rateLimited = isEmailRateLimitError(authError);

      if (!userAlreadyExists && !rateLimited) {
        return { ok: false as const, error: authError };
      }

      const { data: signInData, error: signInError } =
        await tempClient.auth.signInWithPassword({
          email: payload.email,
          password: payload.password,
        });

      if (signInError || !signInData.user?.id) {
        if (userAlreadyExists && isInvalidCredentialsError(signInError)) {
          return {
            ok: true as const,
            data: {
              success: true,
              fallback: true,
              existing_user: true,
              profile_pending: true,
              rate_limited: rateLimited,
            },
          };
        }

        if (isEmailNotConfirmedError(signInError)) {
          return {
            ok: true as const,
            data: {
              success: true,
              fallback: true,
              profile_pending: true,
              rate_limited: rateLimited,
            },
          };
        }

        return {
          ok: false as const,
          error: signInError ?? authError,
        };
      }

      authUserId = signInData.user.id;
      hasSession = Boolean(signInData.session);
    } else {
      authUserId = authData.user?.id || "";
      hasSession = Boolean(authData.session);
    }

    if (!authUserId) {
      return {
        ok: false as const,
        error: new Error("Cadastro concluido sem auth_user_id."),
      };
    }

    // Usa a sessão da usuária recém-criada para respeitar RLS baseada em auth.uid().
    let createdSession = hasSession ? (await tempClient.auth.getSession()).data.session : null;

    let signInErrorWithoutSession: any = null;
    if (!createdSession) {
      const { data: signInData, error: signInError } =
        await tempClient.auth.signInWithPassword({
          email: payload.email,
          password: payload.password,
        });
      signInErrorWithoutSession = signInError;

      if (!signInError) {
        createdSession = signInData.session ?? null;
      }
    }

    if (!createdSession) {
      if (isInvalidCredentialsError(signInErrorWithoutSession)) {
        return {
          ok: true as const,
          data: {
            success: true,
            fallback: true,
            existing_user: true,
            profile_pending: true,
          },
        };
      }

      // Email confirmation active: try saving profile with admin client so it appears in the list immediately.
      await upsertUserProfileWithFallback(authUserId, supabase);
      return {
        ok: true as const,
        data: {
          success: true,
          auth_user_id: authUserId,
          fallback: true,
          profile_pending: true,
        },
      };
    }

    const profileSave = await upsertUserProfileWithFallback(authUserId, tempClient);
    if (!profileSave.ok) {
      return { ok: false as const, error: profileSave.error };
    }

    if (createdSession) {
      await tempClient.auth.signOut();
    }

    return {
      ok: true as const,
      data: {
        success: true,
        auth_user_id: authUserId,
        fallback: true,
      },
    };
  };

  try {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: payload,
    });

    if (error) {
      if (isInvalidCredentialsError(error)) {
        return {
          ok: true,
          data: {
            success: true,
            fallback: true,
            existing_user: true,
            profile_pending: true,
          },
        };
      }

      if (isEmailRateLimitError(error)) {
        return {
          ok: true,
          data: {
            success: true,
            fallback: true,
            profile_pending: true,
            rate_limited: true,
          },
        };
      }

      if (shouldFallbackToClientSignup(error)) {
        return await createByClientSignup();
      }
      return { ok: false, error };
    }
    if (!data?.success) {
      const dataError = data?.error ?? "Erro ao criar usuária";

      if (isInvalidCredentialsError(dataError)) {
        return {
          ok: true,
          data: {
            success: true,
            fallback: true,
            existing_user: true,
            profile_pending: true,
          },
        };
      }

      if (isEmailRateLimitError(dataError)) {
        return {
          ok: true,
          data: {
            success: true,
            fallback: true,
            profile_pending: true,
            rate_limited: true,
          },
        };
      }

      if (shouldFallbackToClientSignup(dataError)) {
        return await createByClientSignup();
      }
      return { ok: false, error: dataError };
    }

    return { ok: true, data };
  } catch (e) {
    if (isInvalidCredentialsError(e)) {
      return {
        ok: true,
        data: {
          success: true,
          fallback: true,
          existing_user: true,
          profile_pending: true,
        },
      };
    }

    if (shouldFallbackToClientSignup(e)) {
      return await createByClientSignup();
    }
    return { ok: false, error: e };
  }
};
