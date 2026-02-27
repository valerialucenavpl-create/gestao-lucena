import { supabase } from "./supabase";

export const createInventoryItem = async (payload: any) => {
  return await supabase
    .from("inventory")
    .insert(payload)
    .select()
    .single();
};

export const getInventory = async () => {
  return await supabase
    .from("inventory")
    .select("*")
    .order("created_at", { ascending: false });
};
