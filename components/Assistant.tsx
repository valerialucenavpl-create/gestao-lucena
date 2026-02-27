
import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { Icon } from './icons/Icon';
import { sendMessageToAI } from "../services/chatService";

const Assistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: 'Olá! Sou seu assistente de negócios. Como posso ajudar a sua empresa hoje?', sender: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

const handleSend = async () => {
  if (!input.trim() || isLoading) return;

  const userMessage = {
    role: "user",
    content: input,
  };

  setMessages((prev) => [...prev, { text: input, sender: "user" }]);
  setInput("");
  setIsLoading(true);

  try {
    const data = await sendMessageToAI([
      { role: "system", content: "Você é um assistente de negócios." },
      userMessage,
    ]);

    setMessages((prev) => [
      ...prev,
      { text: data.reply, sender: "bot" },
    ]);
  } catch (err) {
    console.error(err);
    alert("Erro ao conversar com a IA");
  } finally {
    setIsLoading(false);
  }
};

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  }
  
  const suggestions = [
      "Como otimizar meu estoque?",
      "Me dê dicas para aumentar as vendas.",
      "Qual a melhor forma de precificar meus produtos?",
      "Como melhorar o atendimento ao cliente?"
  ];
  
  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    // Directly call handleSend after setting the input
    // Need to pass the suggestion directly as state update is async
    const userMessage: Message = { id: Date.now(), text: suggestion, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const botTypingMessage: Message = { id: Date.now() + 1, text: '', sender: 'bot', isTyping: true };
    setMessages(prev => [...prev, botTypingMessage]);


const handleSuggestionClick = async (suggestion: string) => {
  setInput(suggestion);

  const userMessage: Message = {
    id: Date.now(),
    text: suggestion,
    sender: "user",
  };

  setMessages((prev) => [...prev, userMessage]);
  setInput("");
  setIsLoading(true);

  const botTypingMessage: Message = {
    id: Date.now() + 1,
    text: "",
    sender: "bot",
    isTyping: true,
  };

  setMessages((prev) => [...prev, botTypingMessage]);

  const data = await sendMessageToAI([
    { role: "system", content: "Você é um assistente de gestão para marmoraria." },
    { role: "user", content: suggestion },
  ]);

  const botMessage: Message = {
    id: Date.now() + 2,
    text: data.reply,
    sender: "bot",
  };

  setMessages((prev) => [...prev.filter(m => !m.isTyping), botMessage]);
  setIsLoading(false);
};

};

  return (
    <div className="bg-white rounded-xl shadow-md h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="text-xl font-semibold text-gray-800">Assistente de Negócios IA</h3>
        <p className="text-sm text-gray-500">Peça conselhos sobre gestão, vendas, marketing e mais.</p>
      </div>
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white flex-shrink-0"><Icon className="w-5 h-5"><path d="M12 8V4H8" /><rect x="4" y="12" width="8" height="8" rx="2" /><path d="M8 12v-2a2 2 0 1 1 4 0v2" /></Icon></div>}
            <div className={`max-w-lg px-4 py-3 rounded-2xl ${msg.sender === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
              {msg.isTyping ? (
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: msg.text.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-800 text-white p-2 rounded-md"><code>$1</code></pre>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}></p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

        {messages.length <= 1 && (
            <div className="p-4 pt-0">
                <p className="text-sm text-gray-500 mb-2">Sugestões:</p>
                <div className="flex flex-wrap gap-2">
                    {suggestions.map(s => (
                        <button key={s} onClick={() => handleSuggestionClick(s)} className="px-3 py-1 bg-gray-100 text-sm text-primary-700 rounded-full hover:bg-primary-100 transition-colors">
                            {s}
                        </button>
                    ))}
                </div>
            </div>
        )}
      
      <div className="p-4 border-t">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta aqui..."
            className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || input.trim() === ''}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Icon className="w-5 h-5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Icon>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Assistant;
