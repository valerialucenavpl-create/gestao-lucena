// src/components/Sidebar.tsx
import React from "react";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Users,
  Box,
  Layers,
  Wallet,
  BarChart3,
  Settings,
  Bot,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";

import { User, View } from "../types";

type Props = {
  activeView: View;
  setActiveView: (view: View) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentUser: User;
};

const Sidebar: React.FC<Props> = ({
  activeView,
  setActiveView,
  isSidebarOpen,
  setSidebarOpen,
  currentUser,
}) => {
  const role = currentUser?.role ?? "Admin";
  const isAdmin = role === "Admin";
  const isSales = role === "Sales";
  const isFinance = role === "Finance";

  const Item = ({
    view,
    label,
    Icon,
  }: {
    view: View;
    label: string;
    Icon: React.ElementType;
  }) => (
    <button
      onClick={() => setActiveView(view)}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition
        ${
          activeView === view
            ? "bg-blue-600 text-white"
            : "text-blue-100 hover:bg-blue-700/40"
        }`}
    >
      <Icon size={18} />
      {isSidebarOpen && <span>{label}</span>}
    </button>
  );

  return (
    <aside
      className={`${
        isSidebarOpen ? "w-64" : "w-16"
      } bg-blue-800 text-white h-full flex flex-col transition-all duration-300`}
    >
      {/* TOPO */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-blue-700">
        {isSidebarOpen && <span className="font-bold text-lg">Gestão PRO</span>}
        <button
          onClick={() => setSidebarOpen(!isSidebarOpen)}
          className="text-blue-200 hover:text-white"
        >
          {isSidebarOpen ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </div>

      {/* MENU */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {/* Todos */}
        <Item view="dashboard" label="Dashboard" Icon={LayoutDashboard} />

        {/* Sales + Admin */}
        {(isAdmin || isSales) && (
          <Item view="quotes" label="Orçamentos" Icon={FileText} />
        )}
        {(isAdmin || isSales) && (
          <Item view="sales" label="Vendas" Icon={ShoppingCart} />
        )}
        {(isAdmin || isSales) && (
          <Item view="clients" label="Clientes" Icon={Users} />
        )}
        {(isAdmin || isSales) && (
          <Item view="products" label="Produtos" Icon={Box} />
        )}
        {(isAdmin || isSales) && (
          <Item view="inventory" label="Matéria Prima" Icon={Layers} />
        )}

        {/* Finance + Admin */}
        {(isAdmin || isFinance) && (
          <Item view="cashflow" label="Caixa" Icon={Wallet} />
        )}
        {(isAdmin || isFinance) && (
          <Item view="financials" label="Financeiro" Icon={BarChart3} />
        )}

        {/* Somente Admin */}
        {isAdmin && (
          <Item view="employees" label="Funcionários" Icon={Users} />
        )}
        {isAdmin && (
          <Item view="sellers" label="Vendedoras" Icon={UserCheck} />
        )}
        {isAdmin && (
          <Item view="reports" label="Relatórios" Icon={BarChart3} />
        )}
        {isAdmin && (
          <Item view="settings" label="Configurações" Icon={Settings} />
        )}
      </nav>

      {/* ASSISTENTE IA (todos) */}
      <div className="p-3 border-t border-blue-700">
        <button
          onClick={() => setActiveView("assistant")}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-blue-100 hover:bg-blue-700/40"
        >
          <Bot size={18} />
          {isSidebarOpen && <span>Assistente IA</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
