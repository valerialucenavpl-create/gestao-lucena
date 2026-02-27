import React, { useState } from "react";
import { Icon } from "./icons/Icon";
import { supabase } from "../services/supabase";

interface LoginProps {
  onLogin: (email: string, password: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      alert("Digite email e senha.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    console.log("RESPOSTA SUPABASE:", data, error);

    if (error) {
      alert("Email ou senha inválidos!");
      return;
    }

    onLogin(email, password);
  };

  return (
    <div className="min-h-screen w-full flex items-stretch bg-white overflow-hidden">

      {/* Formulário */}
      <div className="w-full md:w-1/2 lg:w-5/12 p-10 md:p-16 lg:p-20 bg-white flex flex-col justify-between">

        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-primary-900 tracking-wide">
            LUCENA.PRO
          </h2>
          <div className="w-10 h-1 bg-primary-900 ml-auto rounded-full"></div>
        </div>

        <div className="flex flex-col justify-center flex-grow max-w-sm mx-auto w-full">
          <h1 className="text-4xl font-normal text-gray-800 mb-10">Log in</h1>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Email */}
            <div className="relative group">
              <input
                type="email"
                className="block w-full pl-10 pr-3 py-3 bg-gray-100 rounded-full focus:ring-2 focus:ring-primary-500"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Senha */}
            <div className="relative group">
              <input
                type="password"
                className="block w-full pl-10 pr-10 py-3 bg-gray-100 rounded-full focus:ring-2 focus:ring-primary-500"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-primary-900 text-white hover:bg-primary-800 transition"
            >
              {loading ? "Entrando..." : "Log in"}
            </button>

          </form>
        </div>
      </div>

      {/* Lado direito design */}
      <div className="hidden md:block w-1/2 lg:w-7/12 bg-primary-900 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[120%] bg-primary-800 rounded-[100px] rotate-45 opacity-50"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/80 to-blue-900/80"></div>
      </div>
    </div>
  );
};

export default Login;
