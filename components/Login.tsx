
import React, { useState } from 'react';
import { Icon } from './icons/Icon';

interface LoginProps {
  onLogin: (email: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulação de login simples
    if (email && password) {
      onLogin(email);
    } else {
      alert("Por favor, preencha email e senha.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-stretch bg-white overflow-hidden">
      {/* Lado Esquerdo - Formulário */}
      <div className="w-full md:w-1/2 lg:w-5/12 flex flex-col justify-between p-10 md:p-16 lg:p-20 relative z-10 bg-white">
        
        {/* Header Logo Texto */}
        <div className="flex items-center gap-2">
             <h2 className="text-2xl font-bold text-primary-900 tracking-wide">LUCENA.PRO</h2>
             <div className="w-10 h-1 bg-primary-900 ml-auto rounded-full"></div>
        </div>

        {/* Form Container */}
        <div className="flex flex-col justify-center flex-grow max-w-sm mx-auto w-full">
          <h1 className="text-4xl font-normal text-gray-800 mb-10">Log in</h1>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Icon className="h-5 w-5 text-gray-500 group-focus-within:text-primary-600">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </Icon>
              </div>
              <input
                type="email"
                className="block w-full pl-10 pr-3 py-3 border-none bg-gray-100 rounded-full text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Icon className="h-5 w-5 text-gray-500 group-focus-within:text-primary-600">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </Icon>
              </div>
              <input
                type="password"
                className="block w-full pl-10 pr-10 py-3 border-none bg-gray-100 rounded-full text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
               <div className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer">
                 <Icon className="h-4 w-4 text-gray-400"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-primary-900 hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              Log in
            </button>
          </form>
        </div>

        {/* Footer Logo */}
        <div className="flex justify-center mt-8">
             <div className="relative">
                <h1 className="text-4xl font-black italic text-primary-900 tracking-tighter uppercase" style={{ transform: 'skewX(-10deg)' }}>LUCENA</h1>
                <div className="h-2 w-full bg-orange-500 mt-0 transform skew-x-[-10deg]"></div>
                <Icon className="absolute -top-3 -right-6 w-8 h-8 text-orange-500 transform rotate-12">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </Icon>
             </div>
        </div>
      </div>

      {/* Lado Direito - Arte Abstrata */}
      <div className="hidden md:block w-1/2 lg:w-7/12 bg-primary-900 relative overflow-hidden">
        {/* Formas Geométricas para imitar o design */}
        <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[120%] bg-primary-800 rounded-[100px] transform rotate-45 opacity-50"></div>
        <div className="absolute top-[10%] right-[20%] w-[60%] h-[100%] bg-blue-600 rounded-[80px] transform rotate-45 opacity-60 mix-blend-overlay"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[100%] bg-primary-700 rounded-[100px] transform rotate-45 opacity-40"></div>
        
        {/* Overlay de Gradiente */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/80 to-blue-900/80 pointer-events-none"></div>
      </div>
    </div>
  );
};

export default Login;
