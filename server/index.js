import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/.env (chave da OpenAI) e, como reserva, o .env da raiz (Supabase).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Sem Supabase não há como saber quem está logado — não sobe aberto.
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY no .env do servidor.");
  process.exit(1);
}

// Sites que podem chamar o servidor, separados por vírgula.
// Ex.: ALLOWED_ORIGINS=https://seudominio.com.br,http://localhost:5173
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const SYSTEM_PROMPT =
  "Você é um assistente de negócios de uma empresa de vidros, mármores e portões.";
const MAX_MESSAGES = 30;
const MAX_CHARS = 8000;
const RATE_LIMIT_PER_MIN = 20;

const app = express();
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  })
);
app.use(express.json({ limit: "50kb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Confere o token de login do Supabase enviado pelo navegador.
async function getUserFromToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Limite simples por usuário: N chamadas por minuto.
const usage = new Map();
function isRateLimited(userId) {
  const now = Date.now();
  const recent = (usage.get(userId) || []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MIN) return true;
  recent.push(now);
  usage.set(userId, recent);
  return false;
}

app.post("/chat", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = token ? await getUserFromToken(token) : null;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado" });

    if (isRateLimited(user.id)) {
      return res.status(429).json({ error: "Muitas mensagens, aguarde um minuto" });
    }

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: "Mensagens inválidas" });
    }

    // Só aceita falas de usuário/assistente; o papel "system" é sempre o nosso,
    // para ninguém transformar o servidor num ChatGPT genérico pago por você.
    const clean = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.content ?? "") }));
    const totalChars = clean.reduce((sum, m) => sum + m.content.length, 0);
    if (clean.length === 0 || totalChars > MAX_CHARS) {
      return res.status(400).json({ error: "Mensagem muito longa" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...clean],
      max_tokens: 800,
    });

    res.json({
      reply: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao consultar o ChatGPT" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
