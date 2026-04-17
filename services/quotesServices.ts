import { supabase } from "./supabase";
import { Quote } from "../types";

// ---------------------------
// GET ALL QUOTES
// ---------------------------
export async function getQuotes() {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
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
// CREATE QUOTE (with column fallback)
// ---------------------------
export async function createQuote(quote: Quote) {
  return saveQuoteWithFallback("insert", normalizeQuoteForDb(quote));
}

// ---------------------------
// UPDATE QUOTE (with column fallback)
// ---------------------------
export async function updateQuote(id: string, fields: Partial<Quote>) {
  return saveQuoteWithFallback("update", normalizeQuoteForDb(fields as Quote), id);
}

// ---------------------------
// DELETE QUOTE
// ---------------------------
export async function deleteQuote(id: string) {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir orçamento:", error);
    return { ok: false, error };
  }
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
    installation:     q.installation,
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
    installation:      Number(row.installation ?? 0),
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
  };
}

/** Retry insert/update removing unknown columns on each Supabase error */
// Cache em memória apenas — limpa ao recarregar a página
const _badColsMemory = new Set<string>();

async function saveQuoteWithFallback(
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  id?: string
): Promise<{ ok: boolean; data?: Quote; error?: any }> {
  const badCols = new Set<string>(_badColsMemory);
  let safe = { ...payload };

  // Never send a client-generated id on insert — let Supabase auto-generate it
  if (mode === "insert") delete safe["id"];

  badCols.forEach((c) => delete safe[c]);

  for (let attempt = 0; attempt < 30; attempt++) {
    const result =
      mode === "update"
        ? await supabase.from("quotes").update(safe).eq("id", id as any).select().single()
        : await supabase.from("quotes").insert(safe).select().single();

    if (!result.error) {
      // Atualiza cache em memória
      badCols.forEach((c) => _badColsMemory.add(c));
      return { ok: true, data: normalizeQuoteFromDb((result as any).data) };
    }

    const msg = String(result.error.message || "");
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" does not exist/i);

    if (match?.[1]) {
      const col = String(match[1]);
      console.warn(`[quotesServices] Coluna "${col}" não existe no Supabase — será ignorada. Adicione-a na tabela 'quotes'.`);
      badCols.add(col);
      delete safe[col];
      continue;
    }

    console.error("Erro ao criar orçamento:", result.error);
    return { ok: false, error: result.error };
  }

  return { ok: false, error: { message: "Não foi possível salvar o orçamento após várias tentativas." } };
}
