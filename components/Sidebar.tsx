import React, { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Users,
  Box,
  Layers,
  Wallet,
  CreditCard,
  TrendingUp,
  BarChart3,
  Settings,
  Bot,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Lock,
  Calendar,
  Wrench,
} from "lucide-react";

import { User, View } from "../types";

type Props = {
  activeView: View;
  setActiveView: (view: View) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentUser: User;
};

// Views that each role CANNOT access (padlock shown, click shows toast)
const BLOCKED_VIEWS: Partial<Record<User["role"], Set<string>>> = {
  Sales:   new Set(["cashflow", "payables", "receivables", "financials", "employees", "reports", "montagens"]),
  Finance: new Set(["products", "inventory", "sellers", "settings", "montagens"]),
};

const Sidebar: React.FC<Props> = ({
  activeView,
  setActiveView,
  isSidebarOpen,
  setSidebarOpen,
  currentUser,
}) => {
  const [showDenied, setShowDenied] = useState(false);
  const role = currentUser?.role ?? "Admin";

  const isLocked = (view: string) => {
    if (role === "Admin") return false;
    return BLOCKED_VIEWS[role]?.has(view) ?? false;
  };

  const handleNav = (view: View) => {
    if (isLocked(view as string)) {
      setShowDenied(true);
      setTimeout(() => setShowDenied(false), 2500);
      return;
    }
    setActiveView(view);
  };

  const Item = ({
    view,
    label,
    Icon,
  }: {
    view: View;
    label: string;
    Icon: React.ElementType;
  }) => {
    const locked = isLocked(view as string);
    const isActive = activeView === view && !locked;

    return (
      <button
        onClick={() => handleNav(view)}
        style={{ fontSize: "13px", padding: "8px 12px", gap: "8px" }}
        className={`flex items-center w-full rounded-lg font-medium transition
          ${
            isActive
              ? "bg-blue-600 text-white"
              : locked
              ? "text-blue-300/70 hover:bg-blue-700/20 cursor-not-allowed"
              : "text-blue-100 hover:bg-blue-700/40"
          }`}
      >
        <Icon size={16} className="shrink-0" />
        {isSidebarOpen && (
          <span className="flex-1 text-left">{label}</span>
        )}
        {isSidebarOpen && locked && (
          <Lock size={11} className="shrink-0 opacity-70" />
        )}
      </button>
    );
  };

  return (
    <aside
      className={`${
        isSidebarOpen ? "w-64" : "w-16"
      } bg-blue-800 text-white h-full flex flex-col transition-all duration-300 relative`}
    >
      {/* TOPO */}
      <div
        className="flex items-center justify-between border-b border-blue-700"
        style={{ padding: "12px 14px" }}
      >
        {isSidebarOpen && (
          <span className="font-bold" style={{ fontSize: "15px" }}>
            Gestão PRO
          </span>
        )}
        <button
          onClick={() => setSidebarOpen(!isSidebarOpen)}
          className="text-blue-200 hover:text-white"
        >
          {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* MENU */}
      <nav
        className="flex-1 overflow-y-auto"
        style={{
          padding: "6px 6px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <Item view="dashboard"  label="Dashboard"       Icon={LayoutDashboard} />
        <Item view="quotes"     label="Orçamentos"      Icon={FileText} />
        <Item view="sales"      label="Vendas"           Icon={ShoppingCart} />
        <Item view="clients"    label="Clientes"         Icon={Users} />
        <Item view="agenda"     label="Agenda"           Icon={Calendar} />
        <Item view="products"   label="Produtos"         Icon={Box} />
        <Item view="inventory"  label="Matéria Prima"    Icon={Layers} />
        <Item view="montagens"  label="Montagens"        Icon={Wrench} />
        <Item view="cashflow"    label="Caixa"             Icon={Wallet} />
        <Item view="payables"   label="Contas a Pagar"   Icon={CreditCard} />
        <Item view="receivables" label="Contas a Receber" Icon={TrendingUp} />
        <Item view="financials" label="Financeiro"       Icon={BarChart3} />
        <Item view="employees"  label="Funcionários"     Icon={Users} />
        <Item view="sellers"    label="Vendedoras"       Icon={UserCheck} />
        <Item view="reports"    label="Relatórios"       Icon={BarChart3} />
        <Item view="settings"   label="Configurações"    Icon={Settings} />
      </nav>

      {/* ASSISTENTE IA */}
      <div className="border-t border-blue-700" style={{ padding: "6px 6px" }}>
        <button
          onClick={() => setActiveView("assistant")}
          style={{ fontSize: "13px", padding: "8px 12px", gap: "8px" }}
          className={`flex items-center w-full rounded-lg font-medium transition ${
            activeView === "assistant"
              ? "bg-blue-600 text-white"
              : "text-blue-100 hover:bg-blue-700/40"
          }`}
        >
          <Bot size={16} />
          {isSidebarOpen && <span>Assistente IA</span>}
        </button>
      </div>

      {/* TOAST: Acesso não permitido */}
      {showDenied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-3 rounded-xl shadow-2xl z-[9999] flex items-center gap-2 text-sm font-semibold pointer-events-none">
          <Lock size={14} />
          Acesso não permitido
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
