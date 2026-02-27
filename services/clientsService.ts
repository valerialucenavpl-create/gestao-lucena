import { supabase } from "./supabase";
import type { Client } from "../types";

export async function getClients() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar clientes:", error);
    return [];
  }

  return data as Client[];
}

export async function addClient(client: any) {
  const { data, error } = await supabase
    .from("clientes")
    .insert([client])
    .select("*")
    .single();

  if (error) {
    console.error("Erro ao adicionar cliente:", error);
    return null;
  }

  return data as Client;
}

export async function updateClient(id: string, client: any) {
  const { data, error } = await supabase
    .from("clientes")
    .update(client)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Erro ao atualizar cliente:", error);
    return null;
  }

  return data as Client;
}

export async function deleteClient(id: string) {
  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) {
    console.error("Erro ao excluir cliente:", error);
    return false;
  }

  return true;
}

