import React, { useState } from "react";
import { Icon } from "./icons/Icon";

interface RegisterProps {
  onRegister: (email: string, password: string) => void;
  onBackToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onBackToLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("As senhas não coincidem.");
      return;
    }

    onRegister(email, password);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 px-6">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          Criar Conta
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            className="w-full p-3 rounded-lg bg-gray-100 border-none"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            className="w-full p-3 rounded-lg bg-gray-100 border-none"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <input
            type="password"
            className="w-full p-3 rounded-lg bg-gray-100 border-none"
            placeholder="Confirmar Senha"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            className="w-full bg-primary-900 text-white py-3 rounded-lg hover:bg-primary-800 transition"
          >
            Cadastrar
          </button>
        </form>

        <p className="text-center mt-4 text-sm">
          Já tem conta?{" "}
          <button
            onClick={onBackToLogin}
            className="text-primary-900 underline"
          >
            Voltar ao login
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;
