import React from 'react';
import { Icon } from './icons/Icon';
import { User } from '../types';

interface HeaderProps {
  toggleSidebar: () => void;
  currentUser: User;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  toggleSidebar,
  currentUser,
  isDarkMode,
  toggleTheme,
  onLogout
}) => {

  if (!currentUser) return null;

  return (
    <header className="flex items-center justify-between h-16 bg-white dark:bg-gray-800
                       border-b border-gray-200 dark:border-gray-700 px-4 md:px-6">

      {/* BOTÃO MOBILE PARA ABRIR SIDEBAR */}
      <div className="flex items-center">
        <button
          onClick={toggleSidebar}
          className="text-gray-500 dark:text-gray-300 md:hidden mr-4"
        >
          <Icon>
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </Icon>
        </button>

        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Painel de Gestão
        </h1>
      </div>

      {/* ÁREA DIREITA */}
      <div className="flex items-center gap-4">

        {/* BOTÃO DE TEMA */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          title={isDarkMode ? "Mudar para modo claro" : "Mudar para modo escuro"}
        >
          {isDarkMode ? (
            <Icon className="w-6 h-6 text-yellow-400">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </Icon>
          ) : (
            <Icon className="w-6 h-6 text-gray-600">
              <path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79z" />
            </Icon>
          )}
        </button>

        {/* USUÁRIO + LOGOUT */}
        <div className="flex items-center gap-3">

          <img
            className="h-10 w-10 rounded-full object-cover"
            src={currentUser?.avatar ?? "/default-avatar.png"}
            alt={currentUser?.name ?? "Usuário"}
          />

          <div className="hidden md:block text-left">
            <p className="text-sm font-medium text-gray-800 dark:text-white">
              {currentUser.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {currentUser.role ?? "Admin"}
            </p>
          </div>

          <button
            onClick={onLogout}
            className="ml-3 px-3 py-1 rounded-md text-sm bg-red-500 text-white hover:bg-red-600"
          >
            Sair
          </button>

        </div>

      </div>

    </header>
  );
};

export default Header;
