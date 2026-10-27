import { supabase } from "./supabase";
import { CashFlowSettings } from "../types";

const mapRow = (r: any): CashFlowSettings => ({
  defaultAccountDinheiro: r?.default_account_dinheiro != null ? String(r.default_account_dinheiro) : undefined,
  defaultAccountPix: r?.default_account_pix != null ? String(r.default_account_pix) : undefined,
  saleRecognitionDate: r?.sale_recognition_date === "approval" ? "approval" : "delivery",
  targetNetMargin: r?.target_net_margin != null ? Number(r.target_net_margin) : undefined,
  materialCostMode: r?.material_cost_mode === "cashflow" ? "cashflow" : "budgeted",
  reliableDataStart: r?.reliable_data_start ? String(r.reliable_data_start).slice(0, 10) : undefined,
  minMarginBySector:
    r?.min_margin_by_sector && typeof r.min_margin_by_sector === "object" ? r.min_margin_by_sector : undefined,
});

// Config de linha única — cria a linha na primeira leitura se ainda não existir.
export async function getCashFlowSettings() {
  const { data, error } = await supabase.from("cashflow_settings").select("*").limit(1).maybeSingle();
  if (error) {
    console.error("Erro ao carregar config do Caixa:", error);
    return { ok: false, error, data: {} as CashFlowSettings };
  }
  if (!data) return { ok: true, data: {} as CashFlowSettings };
  return { ok: true, data: mapRow(data) };
}

export async function saveCashFlowSettings(settings: CashFlowSettings) {
  const { data: existing } = await supabase.from("cashflow_settings").select("id").limit(1).maybeSingle();

  const payload: Record<string, unknown> = {
    default_account_dinheiro: settings.defaultAccountDinheiro ? Number(settings.defaultAccountDinheiro) : null,
    default_account_pix: settings.defaultAccountPix ? Number(settings.defaultAccountPix) : null,
    sale_recognition_date: settings.saleRecognitionDate || "delivery",
    target_net_margin: settings.targetNetMargin != null ? Number(settings.targetNetMargin) : null,
    material_cost_mode: settings.materialCostMode || "budgeted",
  };
  // Colunas da migração 2026-10-12 — só envia quando preenchidas.
  if (settings.reliableDataStart) payload.reliable_data_start = settings.reliableDataStart;
  if (settings.minMarginBySector) payload.min_margin_by_sector = settings.minMarginBySector;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("cashflow_settings")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { ok: false, error };
    return { ok: true, data: mapRow(data) };
  }

  const { data, error } = await supabase.from("cashflow_settings").insert(payload).select().single();
  if (error) return { ok: false, error };
  return { ok: true, data: mapRow(data) };
}
