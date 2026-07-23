import { supabase } from "./supabase";
import type { Agendamento } from "../types";

export type AgendamentoRow = {
  id: number;
  client_name: string;
  client_id: string | null;
  phone: string | null;
  seller_name: string;
  segment: string;
  service_type: string | null;
  description: string;
  scheduled_date: string;
  scheduled_time: string | null;
  address: string | null;
  status: string;
  created_at: string | null;
};

export type AgendamentoInput = Omit<Agendamento, "id" | "createdAt">;

function rowToAgendamento(row: AgendamentoRow): Agendamento {
  return {
    id: String(row.id),
    clientName: row.client_name,
    clientId: row.client_id ?? undefined,
    phone: row.phone ?? undefined,
    sellerName: row.seller_name,
    segment: row.segment as Agendamento["segment"],
    serviceType: (row.service_type as Agendamento["serviceType"]) ?? undefined,
    description: row.description,
    date: row.scheduled_date,
    time: row.scheduled_time ? row.scheduled_time.slice(0, 5) : undefined,
    address: row.address ?? undefined,
    status: row.status as Agendamento["status"],
    createdAt: row.created_at ?? undefined,
  };
}

function agendamentoToPayload(input: Partial<AgendamentoInput>) {
  const payload: Record<string, unknown> = {};

  if (input.clientName !== undefined) payload.client_name = input.clientName;
  if (input.clientId !== undefined) payload.client_id = input.clientId || null;
  if (input.phone !== undefined) payload.phone = input.phone || null;
  if (input.sellerName !== undefined) payload.seller_name = input.sellerName;
  if (input.segment !== undefined) payload.segment = input.segment;
  if (input.serviceType !== undefined) payload.service_type = input.serviceType || null;
  if (input.description !== undefined) payload.description = input.description;
  if (input.date !== undefined) payload.scheduled_date = input.date;
  if (input.time !== undefined) payload.scheduled_time = input.time || null;
  if (input.address !== undefined) payload.address = input.address || null;
  if (input.status !== undefined) payload.status = input.status;

  return payload;
}

// -------------------------------------------------------
// GET ALL AGENDAMENTOS
// -------------------------------------------------------
export async function getAgendamentos() {
  const { data, error } = await supabase
    .from("agendamentos")
    .select("*")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (error) {
    console.error("Erro ao carregar agendamentos:", error);
    return { ok: false, error, data: [] as Agendamento[] };
  }

  return { ok: true, data: ((data ?? []) as AgendamentoRow[]).map(rowToAgendamento) };
}

// -------------------------------------------------------
// CREATE AGENDAMENTO
// -------------------------------------------------------
export async function createAgendamento(input: AgendamentoInput) {
  const { data, error } = await supabase
    .from("agendamentos")
    .insert(agendamentoToPayload(input))
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar agendamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: rowToAgendamento(data as AgendamentoRow) };
}

// -------------------------------------------------------
// UPDATE AGENDAMENTO
// -------------------------------------------------------
export async function updateAgendamento(id: string, fields: Partial<AgendamentoInput>) {
  const { data, error } = await supabase
    .from("agendamentos")
    .update(agendamentoToPayload(fields))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar agendamento:", error);
    return { ok: false, error };
  }

  return { ok: true, data: rowToAgendamento(data as AgendamentoRow) };
}

// -------------------------------------------------------
// DELETE AGENDAMENTO
// -------------------------------------------------------
export async function deleteAgendamento(id: string) {
  const { error } = await supabase.from("agendamentos").delete().eq("id", id);

  if (error) {
    console.error("Erro ao excluir agendamento:", error);
    return { ok: false, error };
  }

  return { ok: true };
}
