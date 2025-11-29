import React from 'react';
import { Icon } from './icons/Icon';

const AccessDenied: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center bg-white p-6 rounded-xl shadow-md">
      <Icon className="w-16 h-16 text-red-500">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </Icon>
      <h2 className="mt-4 text-2xl font-bold text-gray-800">Acesso Negado</h2>
      <p className="mt-2 text-gray-600">
        Você não tem permissão para visualizar esta página.
        <br />
        Por favor, entre em contato com o administrador do sistema se você acredita que isso é um erro.
      </p>
    </div>
  );
};

export default AccessDenied;
