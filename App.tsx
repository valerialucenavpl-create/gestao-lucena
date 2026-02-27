// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";

// COMPONENTES
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import DashboardSales from "./components/DashboardSales";
import Reports from "./components/Reports";
import Inventory from "./components/Inventory";
import Clients from "./components/Clients";
import Assistant from "./components/Assistant";
import Settings from "./components/Settings";
import Financials from "./components/financial/Financials";
import Login from "./components/Login";
import CashFlowForm from "./components/CashFlowForm";
import Products from "./components/Products";
import Sellers from "./components/Sellers";

// FUNCIONÁRIOS
import EmployeesList from "./components/employees/EmployeesList";
import EmployeeForm from "./components/employees/EmployeesForm";

// ORÇAMENTOS
import Quotes from "./components/Quotes";
import NewQuote from "./components/NewQuote";
import QuoteDetail from "./components/QuoteDetail";

// VENDAS
import Sales from "./components/Sales";

// SUPABASE
import { supabase } from "./services/supabase";

// SERVICES
import { loadCompanySettings } from "./services/companySettingsServices";
import { getSales } from "./services/salesServices";
import { getQuotes, createQuote, updateQuote } from "./services/quotesServices";
import { getCashFlow } from "./services/cashFlowServices";
import { getUsers } from "./services/userService";

// CSS
import "./index.css";

// TIPOS
import {
  User,
  View,
  CompanySettings,
  Quote,
  Sale,
  Client,
  InventoryItem,
  Product,
  VariableExpense,
  CashFlowEntry,
} from "./types";

const USERS_TABLE = "users";
const CLIENTS_TABLE = "clientes";
const INVENTORY_TABLE = "inventory";
const PRODUCTS_TABLE = "products";
const VARIABLE_EXPENSES_TABLE = "variable_expenses";

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rawMaterials, setRawMaterials] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);

  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    name: "",
    legalName: "",
    cnpj: "",
    address: "",
    phone: "",
    email: "",
    logo: undefined,
  });

  // ===============================
  // LOGIN
  // ===============================
  const loadUsers = async () => {
    const res = await getUsers();
    if (res.ok) setUsers(res.data ?? []);
  };

  const handleLogin = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return alert("Email ou senha inválidos");

    const { data: profile } = await supabase
      .from(USERS_TABLE)
      .select("*")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    setCurrentUser({
      id: data.user.id,
      name: profile?.name ?? email.split("@")[0],
      email,
      role: profile?.role ?? "Admin",
      monthlyGoal: profile?.monthly_goal ?? undefined,
    });

    loadUsers();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // ===============================
  // BOOT
  // ===============================
  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const email = data.session.user.email ?? "";
        const { data: profile } = await supabase
          .from(USERS_TABLE)
          .select("*")
          .eq("auth_user_id", data.session.user.id)
          .maybeSingle();

        setCurrentUser({
          id: data.session.user.id,
          name: profile?.name ?? email.split("@")[0],
          email,
          role: profile?.role ?? "Admin",
          monthlyGoal: profile?.monthly_goal ?? undefined,
        });

        await loadUsers();
      }
      setLoading(false);
    };

    boot();
  }, []);

  // ===============================
  // LOADERS
  // ===============================
  useEffect(() => {
    loadCompanySettings().then((res) => res.ok && res.data && setCompanySettings(res.data));
    getQuotes().then((r) => r.ok && setQuotes(r.data ?? []));
    getSales().then((r) => r.ok && setSales(r.data ?? []));
    getCashFlow().then((r) => r.ok && setCashFlow(r.data ?? []));
  }, []);

  useEffect(() => {
    const loadSystemData = async () => {
      const c = await supabase.from(CLIENTS_TABLE).select("*");
      if (Array.isArray(c.data)) setClients(c.data as Client[]);

      const i = await supabase.from(INVENTORY_TABLE).select("*");
      if (Array.isArray(i.data)) setRawMaterials(i.data as InventoryItem[]);

      const p = await supabase.from(PRODUCTS_TABLE).select("*");
      if (Array.isArray(p.data)) setProducts(p.data as Product[]);

      const v = await supabase.from(VARIABLE_EXPENSES_TABLE).select("*");
      if (Array.isArray(v.data)) setVariableExpenses(v.data as VariableExpense[]);
    };

    loadSystemData();
  }, []);

  // ===============================
  // PERMISSÕES (SEM LOOP)
  // ===============================
  const role = currentUser?.role ?? "Admin";

  const canAccess = useMemo(() => {
    return (view: View) => {
      if (role === "Admin") return true;

      if (role === "Finance") {
        return (["dashboard", "cashflow", "financials", "assistant"] as any).includes(view);
      }

      if (role === "Sales") {
        return (
          ([
            "dashboard",
            "quotes",
            "newQuote",
            "quoteDetail",
            "sales",
            "clients",
            "products",
            "inventory",
            "assistant",
          ] as any).includes(view)
        );
      }

      return false;
    };
  }, [role]);

  // ===============================
  // RENDER VIEW (ÚNICO)
  // ===============================
  const renderView = () => {
    if (!currentUser) return null;

    // ✅ editar funcionário: "employee-edit-<id>"
  // 👩‍💼 EDITAR FUNCIONÁRIO
if (
  typeof activeView === "string" &&
  activeView.startsWith("employee-edit-")
) {
  const employeeId = activeView.replace("employee-edit-", "");
  return <EmployeeForm id={employeeId} setActiveView={setActiveView} />;
}


    // 🔒 se não tem permissão, mostra dashboard (sem setActiveView aqui!)
    if (!canAccess(activeView)) {
      return role === "Sales" ? (
        <DashboardSales
          currentUser={currentUser}
          sales={sales}
          companyMonthlyGoal={(companySettings as any)?.monthlyGoal || 0}
        />
      ) : (
        <Dashboard currentUser={currentUser} setActiveView={setActiveView} />
      );
    }

    switch (activeView) {
      case "dashboard":
        return role === "Sales" ? (
          <DashboardSales
            currentUser={currentUser}
            sales={sales}
            companyMonthlyGoal={(companySettings as any)?.monthlyGoal || 0}
          />
        ) : (
          <Dashboard currentUser={currentUser} setActiveView={setActiveView} />
        );

      // ✅ ORÇAMENTOS
      case "quotes":
        return (
          <Quotes
            quotes={quotes}
            setActiveView={(v: any, id?: string) => {
              if (id) setSelectedQuoteId(id);
              setActiveView(v);
            }}
          />
        );

      case "newQuote":
        return (
          <NewQuote
            currentUser={currentUser}
            clients={clients}
            rawMaterials={rawMaterials}
            products={products}
            variableExpenses={variableExpenses}
            onAddQuote={async (q: any) => {
              const r = await createQuote(q);
              if (r.ok) {
                setQuotes((prev) => [r.data as Quote, ...prev]);
                setActiveView("quotes");
              }
            }}
            onAddNewClient={(c: any) => setClients((prev) => [c, ...prev])}
            onCancel={() => setActiveView("quotes")}
          />
        );

      case "quoteDetail": {
        const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);
        return selectedQuote ? (
          <QuoteDetail
            quote={selectedQuote}
            rawMaterials={rawMaterials}
            products={products}
            variableExpenses={variableExpenses}
            companySettings={companySettings}
            onUpdateQuote={async (u: any) => {
              const r = await updateQuote(u.id, u);
              if (r.ok) {
                setQuotes((prev) => prev.map((q) => (q.id === u.id ? (r.data as Quote) : q)));
              }
            }}
            onBack={() => setActiveView("quotes")}
          />
        ) : null;
      }

      // ✅ VENDAS
      case "sales":
        return <Sales sales={sales} quotes={quotes} clients={clients} cashFlow={cashFlow} />;

      // ✅ CLIENTES / ESTOQUE / PRODUTOS
      case "clients":
        return <Clients />;

      case "inventory":
        return (
          <Inventory rawMaterials={rawMaterials} setRawMaterials={setRawMaterials} currentUser={currentUser} />
        );

      case "products":
        return (
          <Products
            products={products}
            setProducts={setProducts}
            rawMaterials={rawMaterials}
            variableExpenses={variableExpenses}
            currentUser={currentUser}
          />
        );

      // ✅ FINANCEIRO / CAIXA
      case "cashflow":
        return <CashFlowForm cashFlow={cashFlow} setCashFlow={setCashFlow} />;

      case "financials":
        return <Financials />;

      // ✅ ADMIN
      case "employees":
        return <EmployeesList setActiveView={setActiveView} />;

      case "employee-new":
        return <EmployeeForm setActiveView={setActiveView} />;

      case "sellers":
        return <Sellers />;

      case "reports":
        return <Reports />;

      case "settings":
        return (
          <Settings
            companySettings={companySettings}
            setCompanySettings={setCompanySettings}
            users={users}
            setUsers={setUsers}
          />
        );

      case "assistant":
        return <Assistant />;

      default:
        return <Dashboard currentUser={currentUser} setActiveView={setActiveView} />;
    }
  };

  // ===============================
  // RETURN
  // ===============================
  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <div className={`flex h-screen ${isDarkMode ? "dark bg-gray-900" : "bg-gray-100"}`}>
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentUser={currentUser}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          currentUser={currentUser}
          users={users}
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
          toggleTheme={() => setIsDarkMode(!isDarkMode)}
          isDarkMode={isDarkMode}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto p-4">{renderView()}</main>
      </div>
    </div>
  );
};

export default App;
