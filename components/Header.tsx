
import React, { useState } from 'react';
import { Icon } from './icons/Icon';
import { User } from '../types';

interface HeaderProps {
  title: string;
  toggleSidebar: () => void;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, toggleSidebar, currentUser, setCurrentUser, users, isDarkMode, toggleTheme }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const handleUserChange = (user: User) => {
    setCurrentUser(user);
    setDropdownOpen(false);
  }

  return (
    <header className="flex items-center justify-between h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 transition-colors duration-200">
      <div className="flex items-center">
        <button onClick={toggleSidebar} className="text-gray-500 dark:text-gray-300 focus:outline-none md:hidden mr-4">
          <Icon><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></Icon>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        {/* Theme Toggle Button */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
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
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </Icon>
          )}
        </button>

        <div className="relative">
          <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center focus:outline-none">
            <img
              className="h-10 w-10 rounded-full object-cover"
              src={currentUser.avatar}
              alt="User avatar"
            />
            <div className="ml-2 hidden md:block text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-white">{currentUser.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.role}</p>
            </div>
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-100 dark:border-gray-700">
              <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 mb-1">Trocar usuário</p>
              {users.map(user => (
                <a
                  key={user.id}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleUserChange(user);
                  }}
                  className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {user.name} ({user.role})
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;