import { supabase } from "./supabase";
import { CashFlowCategory, DfcGroup, DreGroup } from "../types";

const mapRow = (r: any): CashFlowCategory => ({
  id: String(r.id),
  type: r.type,
  category: r.category || "",
  groupTitle: r.group_title || "",
  subcategory: r.subcategory || "",
  grupoDre: (r.grupo_dre || "NAO_ENTRA") as DreGroup,
  grupoDfc: (r.grupo_dfc || "NAO_ENTRA") as DfcGroup,
  sortOrder: Number(r.sort_order || 0),
  active: r.active !== false,
});

export async function getCashFlowCategories() {
  const { data, error } = await supabase
    .from("cashflow_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Erro ao carregar plano de contas:", error);
    return { ok: false, error, data: [] as CashFlowCategory[] };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

export async function createCashFlowCategory(input: {
  type: "Entrada" | "Saída";
  category: string;
  groupTitle: string;
  subcategory: string;
  grupoDre: DreGroup;
  grupoDfc: DfcGroup;
}) {
  const { data, error } = await supabase
    .from("cashflow_categories")
    .insert({
      type: input.type,
      category: input.category.trim().toUpperCase(),
      group_title: input.groupTitle.trim().toLowerCase(),
      subcategory: input.subcategory.trim().toLowerCase(),
      grupo_dre: input.grupoDre,
      grupo_dfc: input.grupoDfc,
    })
    .select()
    .single();
  if (error) {
    console.error("Erro ao criar categoria:", error);
    return { ok: false, error };
  }
  return { ok: true, data: mapRow(data) };
}

export async function updateCashFlowCategory(
  id: string,
  fields: Partial<{ grupoDre: DreGroup; grupoDfc: DfcGroup; active: boolean }>
) {
  const payload: Record<string, unknown> = {};
  if (fields.grupoDre !== undefined) payload.grupo_dre = fields.grupoDre;
  if (fields.grupoDfc !== undefined) payload.grupo_dfc = fields.grupoDfc;
  if (fields.active !== undefined) payload.active = fields.active;

  const { data, error } = await supabase.from("cashflow_categories").update(payload).eq("id", id).select().single();
  if (error) {
    console.error("Erro ao atualizar categoria:", error);
    return { ok: false, error };
  }
  return { ok: true, data: mapRow(data) };
}
