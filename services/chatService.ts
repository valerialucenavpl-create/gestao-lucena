export async function sendMessageToAI(messages: any[]) {
  const response = await fetch(import.meta.env.VITE_AI_URL + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text);

  return JSON.parse(text);
}
