import React, { useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import { Icon } from "./icons/Icon";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

// Marca Lucena: azul-marinho + laranja (mesma paleta usada nos PDFs de orçamento).
const NAVY_DEEP = "#16305F";
const NAVY = "#1E3D7A";
const NAVY_LIGHT = "#2C53A0";
const ACCENT = "#F26B21";
const ACCENT_DARK = "#D9591A";

const LOGO_SRC = "/logo-lucena.png";

const FEATURES = [
  "Orçamentos e vendas",
  "Matéria-prima e produção",
  "Financeiro e contas a pagar/receber",
];

const HexagonPattern: React.FC = () => (
  <svg
    className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
    viewBox="0 0 400 400"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <pattern id="hex" width="44" height="76" patternUnits="userSpaceOnUse" patternTransform="scale(1)">
        <polygon
          points="22,0 44,13 44,38 22,51 0,38 0,13"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        />
        <polygon
          points="22,25 44,38 44,63 22,76 0,63 0,38"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        />
      </pattern>
    </defs>
    <rect width="400" height="400" fill="url(#hex)" />
  </svg>
);

const MailIcon: React.FC = () => (
  <Icon className="h-5 w-5">
    <path d="M4 4h16v16H4z" opacity="0" />
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
    <path d="m3.5 6 8.5 6.5L20.5 6" />
  </Icon>
);

const LockIcon: React.FC = () => (
  <Icon className="h-5 w-5">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

type AuthStage = "login" | "code" | "newPassword";

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Fluxo "esqueci minha senha": envia um código de 6 dígitos por e-mail em
  // vez do link tradicional, para o formulário evoluir na própria tela
  // (código → nova senha) sem precisar abrir o e-mail e clicar num link.
  const [authStage, setAuthStage] = useState<AuthStage>("login");
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newPasswordLoading, setNewPasswordLoading] = useState(false);

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

  const sendRecoveryCode = async () => {
    if (!email || !emailIsValid) {
      alert("Digite um e-mail válido para recuperar a senha.");
      return false;
    }

    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetLoading(false);

    if (error) {
      alert(`Não foi possível enviar o código: ${error.message}`);
      return false;
    }

    return true;
  };

  const handleForgotPassword = async () => {
    const sent = await sendRecoveryCode();
    if (sent) setAuthStage("code");
  };

  const handleResendCode = async () => {
    const sent = await sendRecoveryCode();
    if (sent) alert("Reenviamos o código para seu e-mail.");
  };

  const handleConfirmCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      alert("Digite o código recebido por e-mail.");
      return;
    }

    setCodeLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "recovery",
    });
    setCodeLoading(false);

    if (error) {
      alert(`Código inválido ou expirado: ${error.message}`);
      return;
    }

    setAuthStage("newPassword");
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      alert("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("As senhas não coincidem.");
      return;
    }

    setNewPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setNewPasswordLoading(false);

    if (error) {
      alert(`Não foi possível salvar a nova senha: ${error.message}`);
      return;
    }

    await supabase.auth.signOut();

    setAuthStage("login");
    setCode("");
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    alert("Senha atualizada com sucesso! Faça login com a nova senha.");
  };

  const handleCancelRecovery = () => {
    setAuthStage("login");
    setCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 md:p-8"
      style={{ backgroundColor: "#EEF2FA" }}
    >
      {/* Blobs decorativos de fundo (azul + laranja) */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: `${NAVY_LIGHT}33` }}
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: `${ACCENT}26` }}
      />

      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">
        {/* Painel esquerdo: identidade + resumo do sistema */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex"
          style={{
            backgroundImage: `linear-gradient(135deg, ${NAVY_DEEP} 0%, ${NAVY} 55%, ${NAVY_LIGHT} 100%)`,
          }}
        >
          <HexagonPattern />

          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
            style={{ backgroundColor: `${ACCENT}40` }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "#ffffff1a" }}
          />

          <div className="relative z-10">
            <span
              className="inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ backgroundColor: `${ACCENT}2e`, color: "#FFD9BE" }}
            >
              Gestão PRO
            </span>

            <h2 className="mt-5 text-3xl font-bold leading-tight md:text-4xl">
              Bem-vindo de volta!
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-blue-100/90">
              O sistema completo para marmorarias e serralherias: orçamentos, vendas,
              matéria-prima, produção e financeiro em um só lugar — do orçamento à entrega.
            </p>

            <ul className="mt-7 space-y-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-blue-50">
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                      <path
                        d="M4 10.5 8 14l8-8"
                        stroke="white"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="relative z-10 mt-10 rounded-2xl border p-5 backdrop-blur-sm"
            style={{ borderColor: "#ffffff2e", backgroundColor: "#ffffff14" }}
          >
            <p className="text-sm text-blue-100/90">
              Acesse com sua conta para continuar de onde parou.
            </p>
          </div>
        </div>

        {/* Painel direito: formulário de login */}
        <div className="flex flex-col justify-center p-6 sm:p-10 md:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex flex-col items-center gap-4 text-center">
              {!logoFailed ? (
                <img
                  src={LOGO_SRC}
                  alt="Lucena"
                  className="h-12 w-auto object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="text-2xl font-extrabold italic tracking-tight" style={{ color: NAVY }}>
                  LUCENA
                </span>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Área segura
                </p>
                <h1 className="text-2xl font-bold text-slate-900">
                  {authStage === "login" && "Entrar no sistema"}
                  {authStage === "code" && "Digite o código"}
                  {authStage === "newPassword" && "Crie uma nova senha"}
                </h1>
              </div>
            </div>

            {authStage === "login" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                      <MailIcon />
                    </span>
                    <input
                      type="email"
                      className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition focus:border-[--nv] focus:ring-2"
                      style={{ ["--nv" as any]: NAVY }}
                      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${NAVY}22`)}
                      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                      placeholder="seuemail@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                      <LockIcon />
                    </span>
                    <input
                      type="password"
                      className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition"
                      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${NAVY}22`)}
                      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                      placeholder="Digite sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                    className="text-sm font-semibold hover:opacity-80 disabled:opacity-60"
                    style={{ color: NAVY }}
                  >
                    {resetLoading ? "Enviando..." : "Esqueci minha senha"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl py-3 font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ACCENT, boxShadow: `0 10px 20px -8px ${ACCENT}80` }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_DARK)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </form>
            )}

            {authStage === "code" && (
              <form onSubmit={handleConfirmCode} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Enviamos um código de verificação para <strong>{email}</strong>. Digite-o
                  abaixo para continuar.
                </p>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Código de verificação
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] text-slate-900 outline-none transition"
                    onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${NAVY}22`)}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleCancelRecovery}
                    className="font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resetLoading}
                    className="font-semibold hover:opacity-80 disabled:opacity-60"
                    style={{ color: NAVY }}
                  >
                    {resetLoading ? "Enviando..." : "Reenviar código"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={codeLoading}
                  className="w-full rounded-xl py-3 font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ACCENT, boxShadow: `0 10px 20px -8px ${ACCENT}80` }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_DARK)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                >
                  {codeLoading ? "Verificando..." : "Confirmar código"}
                </button>
              </form>
            )}

            {authStage === "newPassword" && (
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Código confirmado! Agora é só criar sua nova senha.
                </p>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Nova senha
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                      <LockIcon />
                    </span>
                    <input
                      type="password"
                      className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition"
                      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${NAVY}22`)}
                      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
                      <LockIcon />
                    </span>
                    <input
                      type="password"
                      className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition"
                      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${NAVY}22`)}
                      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                      placeholder="Repita a nova senha"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={newPasswordLoading}
                  className="w-full rounded-xl py-3 font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ACCENT, boxShadow: `0 10px 20px -8px ${ACCENT}80` }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_DARK)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                >
                  {newPasswordLoading ? "Salvando..." : "Salvar nova senha"}
                </button>
              </form>
            )}

            <p className="mt-8 text-center text-xs text-slate-400">
              © {new Date().getFullYear()} Lucena · Gestão PRO
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
