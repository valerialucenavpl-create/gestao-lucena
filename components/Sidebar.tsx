import React from 'react';
import { Icon } from './icons/Icon';
import { View, User } from '../types';

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  currentUser: User;
}

const NavItem: React.FC<{
  view: View;
  label: string;
  icon: React.ReactNode;
  activeView: View;
  onClick: (view: View) => void;
}> = ({ view, label, icon, activeView, onClick }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick(view);
      }}
      className={`flex items-center p-3 my-1 rounded-lg text-gray-100 hover:bg-primary-700 transition-colors duration-200 ${
        activeView === view ? 'bg-primary-700 font-semibold' : ''
      }`}
    >
      {icon}
      <span className="ml-3">{label}</span>
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isSidebarOpen, setSidebarOpen, currentUser }) => {
    
  const handleNavClick = (view: View) => {
    setActiveView(view);
    if (window.innerWidth < 768) {
        setSidebarOpen(false);
    }
  }

  const navItems: { view: View; label: string; icon: React.ReactNode; roles: User['role'][] }[] = [
    { view: 'dashboard', label: 'Dashboard', roles: ['Admin', 'Finance', 'Sales'], icon: <Icon><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></Icon> },
    { view: 'quotes', label: 'Orçamentos', roles: ['Admin', 'Sales'], icon: <Icon><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></Icon> },
    { view: 'sales', label: 'Vendas', roles: ['Admin', 'Finance', 'Sales'], icon: <Icon><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Icon> },
    { view: 'clients', label: 'Clientes', roles: ['Admin', 'Sales'], icon: <Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon> },
    { view: 'products', label: 'Produtos', roles: ['Admin', 'Sales'], icon: <Icon><path d="M20.59 13.41l-7.17 7.17a1 1 0 0 1-1.41 0l-7.17-7.17a1 1 0 0 1 0-1.41l7.17-7.17a1 1 0 0 1 1.41 0l7.17 7.17a1 1 0 0 1 0 1.41z"/><line x1="7.34" y1="15.56" x2="16.66" y2="6.24"/></Icon> },
    { view: 'inventory', label: 'Matéria Prima', roles: ['Admin', 'Sales'], icon: <Icon><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Icon> },
    { view: 'cashflow', label: 'Caixa', roles: ['Admin', 'Finance'], icon: <Icon><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></Icon> },
    { view: 'financials', label: 'Financeiro', roles: ['Admin', 'Finance'], icon: <Icon><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></Icon> },
    { view: 'reports', label: 'Relatórios', roles: ['Admin', 'Finance', 'Sales'], icon: <Icon><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1V4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-2.1V3.6c0-.4-.2-.8-.5-1.1-.3-.3-.7-.5-1.1-.5zM12 15c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z"/><path d="M6 22V8h12v14z"/></Icon> },
    { view: 'settings', label: 'Configurações', roles: ['Admin'], icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon> },
  ];

  return (
    <>
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setSidebarOpen(false)}></div>
        <aside className={`absolute md:relative z-40 flex flex-col w-64 h-full bg-primary-900 text-white transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
            <div className="flex items-center justify-center h-20 border-b border-primary-800">
                <Icon>
                    <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>
                </Icon>
                <h1 className="text-2xl font-bold ml-2">Gestão PRO</h1>
            </div>
            <nav className="flex-1 px-4 py-4">
                <ul>
                    {navItems.filter(item => item.roles.includes(currentUser.role)).map(item => (
                         <NavItem 
                            key={item.view}
                            view={item.view} 
                            label={item.label} 
                            activeView={activeView} 
                            onClick={handleNavClick} 
                            icon={item.icon} 
                        />
                    ))}
                </ul>
            </nav>
            <div className="px-4 py-4 border-t border-primary-800">
                 <NavItem view="assistant" label="Assistente IA" activeView={activeView} onClick={handleNavClick} icon={
                    <Icon><path d="M12 8V4H8" /><rect x="4" y="12" width="8" height="8" rx="2" /><path d="M8 12v-2a2 2 0 1 1 4 0v2" /><path d="m18 12 2-2 2 2" /><path d="m18 20-2 2-2-2" /></Icon>
                 } />
            </div>
        </aside>
    </>
  );
};

export default Sidebar;