import { supabase } from "./supabase";
import { Quote } from "../types";

// ---------------------------
// GET ALL QUOTES
// ---------------------------
export async function getQuotes() {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .is("deleted_at", null)
    .order("date", { ascending: false });

  if (error) {
    console.error("Erro ao carregar orçamentos:", error);
    return { ok: false, error };
  }

  return { ok: true, data: (data || []).map(normalizeQuoteFromDb) as Quote[] };
}

// ---------------------------
// GET ONE QUOTE BY ID
// ---------------------------
export async function getQuoteById(id: string) {
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).single();

  if (error) {
    console.error("Erro ao buscar orçamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: normalizeQuoteFromDb(data) as Quote };
}

// ---------------------------
// CREATE QUOTE
// ---------------------------
export async function createQuote(quote: Quote) {
  const payload = normalizeQuoteForDb(quote);
  delete payload["id"];

  const { data, error } = await supabase.from("quotes").insert(payload).select().single();
  if (error) {
    console.error("Erro ao criar orçamento:", error);
    return { ok: false, error };
  }
  return { ok: true, data: normalizeQuoteFromDb(data) as Quote };
}

// ---------------------------
// UPDATE QUOTE
// ---------------------------
export async function updateQuote(id: string, fields: Partial<Quote>) {
  const payload = normalizeQuoteForDb(fields as Quote);

  const { data, error } = await supabase.from("quotes").update(payload).eq("id", id).select().single();
  if (error) {
    console.error("Erro ao atualizar orçamento:", error);
    return { ok: false, error };
  }
  return { ok: true, data: normalizeQuoteFromDb(data) as Quote };
}

// ---------------------------
// DELETE QUOTE (exclusão reversível — marca deleted_at, não apaga a linha)
// ---------------------------
export async function deleteQuote(id: string) {
  const { data: authData } = await supabase.auth.getUser();

  // Um UPDATE barrado pela RLS não retorna erro — só não afeta nenhuma
  // linha. Por isso confirmamos com .select() que a linha voltou.
  const { data, error } = await supabase
    .from("quotes")
    .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Erro ao excluir orçamento:", error);
    return { ok: false, error: error ?? new Error("Nenhuma linha foi alterada (verifique permissão).") };
  }

  // Cancela também a conta a receber pendente gerada por este orçamento, se
  // houver — o gatilho no banco só reage a mudança de status (Aprovado ->
  // outro), não à exclusão do orçamento em si.
  await supabase
    .from("receivables")
    .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null })
    .eq("quote_id", id)
    .eq("status", "pending")
    .is("deleted_at", null);

  return { ok: true };
}

// ---------------------------
// HELPERS
// ---------------------------

/** camelCase → snake_case payload for Supabase */
function normalizeQuoteForDb(quote: Partial<Quote>): Record<string, unknown> {
  const q = quote as any;

  // client_id só inclui se for um ID real do banco (não local_xxx gerado pelo front)
  const rawClientId = q.clientId ?? q.client_id;
  const validClientId = rawClientId && !String(rawClientId).startsWith("local_") && !String(rawClientId).startsWith("tmp_")
    ? rawClientId : undefined;

  const payload: Record<string, unknown> = {
    id:               q.id,
    client_id:        validClientId,
    customer_name:    q.customerName  ?? q.customer_name,
    salesperson:      q.salesperson,
    date:             q.date instanceof Date ? q.date.toISOString() : q.date,
    status:           q.status,
    items:            q.items,
    subtotal:         q.subtotal,
    discount:         q.discount,
    freight:          q.freight,
    freight_items:    q.freightItems ?? q.freight_items,
    dissolve_freight: q.dissolveFreight ?? q.dissolve_freight,
    installation:     q.installation,
    installation_cost_items: q.installationCostItems ?? q.installation_cost_items,
    total_price:      q.totalPrice    ?? q.total_price,
    payment_method:   q.paymentMethod ?? q.payment_method,
    cost_of_goods:    q.costOfGoods   ?? q.cost_of_goods,
    fixed_costs:      q.fixedCosts    ?? q.fixed_costs,
    machine_fee:      q.machineFee    ?? q.machine_fee,
    taxes:            q.taxes,
    assembly_notes:   q.assemblyNotes ?? q.assembly_notes,
    measurement_notes: q.measurementNotes ?? q.measurement_notes,
    referral_commission_rate:  q.referralCommissionRate  ?? q.referral_commission_rate,
    referral_commission_value: q.referralCommissionValue ?? q.referral_commission_value,
    quote_number:     q.quoteNumber   ?? q.quote_number,
    delivery_date:    q.deliveryDate  ?? q.delivery_date,
    internal_status:  q.internalStatus ?? q.internal_status,
    sale_completed:   q.saleCompleted   ?? q.sale_completed,
  };

  // Remove undefined fields
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  return payload;
}

/** snake_case DB row → camelCase Quote */
function normalizeQuoteFromDb(row: any): Quote {
  return {
    id:                row.id,
    clientId:          row.client_id        ?? row.clientId        ?? "",
    customerName:      row.customer_name    ?? row.customerName    ?? "",
    salesperson:       row.salesperson      ?? "",
    date:              row.date             ?? "",
    status:            row.status           ?? "Pendente",
    items:             Array.isArray(row.items) ? row.items : [],
    subtotal:          Number(row.subtotal  ?? 0),
    discount:          Number(row.discount  ?? 0),
    freight:           Number(row.freight   ?? 0),
    freightItems:      Array.isArray(row.freight_items ?? row.freightItems)
      ? (row.freight_items ?? row.freightItems)
      : [],
    dissolveFreight:   (row.dissolve_freight ?? row.dissolveFreight) !== false,
    installation:      Number(row.installation ?? 0),
    installationCostItems: Array.isArray(row.installation_cost_items ?? row.installationCostItems)
      ? (row.installation_cost_items ?? row.installationCostItems)
      : [],
    totalPrice:        Number(row.total_price     ?? row.totalPrice     ?? 0),
    paymentMethod:     row.payment_method   ?? row.paymentMethod   ?? "A Definir",
    costOfGoods:       Number(row.cost_of_goods   ?? row.costOfGoods   ?? 0),
    fixedCosts:        Number(row.fixed_costs     ?? row.fixedCosts    ?? 0),
    machineFee:        Number(row.machine_fee     ?? row.machineFee    ?? 0),
    taxes:             Number(row.taxes     ?? 0),
    assemblyNotes:     row.assembly_notes   ?? row.assemblyNotes   ?? "",
    measurementNotes:  row.measurement_notes ?? row.measurementNotes ?? "",
    referralCommissionRate:  Number(row.referral_commission_rate  ?? row.referralCommissionRate  ?? 0),
    referralCommissionValue: Number(row.referral_commission_value ?? row.referralCommissionValue ?? 0),
    quoteNumber:       row.quote_number     ?? row.quoteNumber,
    deliveryDate:      row.delivery_date    ?? row.deliveryDate    ?? "",
    internalStatus:    row.internal_status  ?? row.internalStatus  ?? "Pedido",
    saleCompleted:     Boolean(row.sale_completed ?? row.saleCompleted ?? false),
  };
}

