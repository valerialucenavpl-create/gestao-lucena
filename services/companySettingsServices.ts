// src/services/companySettingsServices.ts
import { supabase } from "./supabase";
import { CompanySettings } from "../types";

const TABLE = "company_settings";

// ⚠️ Se o seu bucket tiver outro nome no Storage, troque aqui:
const LOGO_BUCKET = "company-logos";

export const uploadCompanyLogo = async (file: File) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return { ok: false, error: authErr };

    const userId = authData.user.id;

    // nome do arquivo (evita conflito)
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/logo-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) return { ok: false, error: upErr };

    // URL pública (funciona se o bucket estiver Public)
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);

    return { ok: true, url: data.publicUrl };
  } catch (e) {
    return { ok: false, error: e };
  }
};

export const loadCompanySettings = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("key", "main")
      .single();

    if (error) return { ok: false, error };

    const mapped: CompanySettings = {
      name: data.company_name ?? "",
      legalName: data.legal_name ?? "",
      cnpj: data.cnpj ?? "",
      address: data.address ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      logo: data.logo ?? undefined,
    };

    return { ok: true, data: mapped };
  } catch (e) {
    return { ok: false, error: e };
  }
};

export const saveCompanySettings = async (settings: CompanySettings) => {
  try {
    const payload = {
      key: "main",
      company_name: settings.name,
      legal_name: settings.legalName,
      cnpj: settings.cnpj,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      logo: settings.logo ?? null,
    };

    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "key" });

    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
};
