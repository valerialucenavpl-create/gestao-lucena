import React, { useMemo, useState } from "react";
import { supabase } from "../services/supabase";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
}
const STORE_LOGO_FALLBACK =
  "https://api.dicebear.com/9.x/initials/svg?seed=Lucena%20Pro&backgroundType=gradientLinear";
const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
const [resetLoading, setResetLoading] = useState(false);

  const emailIsValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      alert("Digite email e senha.");
      return;
    }

    setLoading(true);

 try {
      await onLogin(email, password);
    } finally {
      setLoading(false);
    }
  };
const handleForgotPassword = async () => {
    if (!email || !emailIsValid) {
      alert("Digite um e-mail válido para recuperar a senha.");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
  setResetLoading(false);

    if (error) {
     alert(`Não foi possível enviar o e-mail de recuperação: ${error.message}`);
      return;
    }

    alert("Enviamos o link de recuperação para seu e-mail.");
  };


return (
   <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:grid-cols-2">
        <div className="relative hidden md:flex flex-col justify-between bg-gradient-to-br from-blue-900 via-primary-800 to-blue-700 p-10 text-white">
          <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

          <div className="relative z-10">
            <p className="text-sm uppercase tracking-[0.2em] text-blue-100/90">Painel de Gestão</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight">Bem-vindo à sua operação.</h2>
            <p className="mt-4 max-w-md text-blue-100/90">
              Controle vendas, orçamento, matéria-prima e produção em um único sistema.
            </p>
          </div>

          <div className="relative z-10 mt-10 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
            <p className="text-sm text-blue-100/90">Acesse com sua conta para continuar.</p>
          </div>
        </div>
         <div className="flex flex-col justify-center p-6 sm:p-10 md:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-4">
              <img
                src={STORE_LOGO_FALLBACK}
                alt="Logo da loja"
                className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-cover p-1"
              />
                <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Área segura</p>
                <h1 className="text-2xl font-bold text-slate-900">Entrar no sistema</h1>
              </div>
            </div>
           <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="seuemail@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60"
                >
                  {resetLoading ? "Enviando..." : "Esqueci minha senha"}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary-700 py-3 font-semibold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              Se quiser, posso ajustar com seu rascunho visual e aplicar a identidade da loja.
            </p>
          </div>
        </div>
      </div>

  
    </div>
  );
};

export default Login;
