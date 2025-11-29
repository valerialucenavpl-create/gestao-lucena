
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

const SYSTEM_INSTRUCTION = `You are an expert business consultant specializing in workshops for marble, glass, and metalwork (marmoraria, vidraçaria, e serralheria). Your advice should be practical, concise, and tailored to small-to-medium-sized businesses in this sector. Respond in Brazilian Portuguese using Markdown for formatting when appropriate.`;

export const getBusinessAdvice = async (query: string): Promise<string> => {
  if (!API_KEY) {
    return "Erro: A chave da API do Gemini não está configurada. Por favor, configure a variável de ambiente API_KEY.";
  }
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: "user", parts: [{text: query}] }],
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.7,
        },
    });

    return response.text;
  } catch (error) {
    console.error("Error fetching advice from Gemini API:", error);
    return "Desculpe, não consegui obter uma resposta do assistente no momento. Verifique o console para mais detalhes e tente novamente mais tarde.";
  }
};
