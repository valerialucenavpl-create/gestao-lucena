import { supabase } from "./supabase";

export async function sendMessageToAI(messages: any[]) {
  // O servidor da IA só responde a quem está logado no sistema.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada, faça login novamente");

  const response = await fetch(import.meta.env.VITE_AI_URL + "/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text);

  return JSON.parse(text);
}
