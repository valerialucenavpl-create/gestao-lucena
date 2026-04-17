// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";

// COMPONENTES
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import DashboardSales from "./components/DashboardSales";
import Reports from "./components/Reports";
import Inventory from "./components/inventory/InventoryPage";
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
import { enrichMaterialRowsWithPhotoUrls } from "./utils/materialPhoto";
import { resolveMaterialPurchaseLengthMeters } from "./utils/materialPurchaseLength";

// SERVICES
import { loadCompanySettings } from "./services/companySettingsServices";
import { getSales } from "./services/salesServices";
import { getQuotes, createQuote, updateQuote, deleteQuote } from "./services/quotesServices";
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
  ProductCompositionItem,
  VariableExpense,
  CashFlowEntry,
} from "./types";

const USERS_TABLE = "users";
const CLIENTS_TABLE = "clients";
const INVENTORY_TABLE = "inventory";
const PRODUCTS_TABLE = "products";
const VARIABLE_EXPENSES_TABLE = "variable_expenses";
const VALID_ROLES: User["role"][] = ["Admin", "Sales", "Finance"];

const normalizeUserRole = (value: unknown): User["role"] => {
  const role = String(value ?? "").trim() as User["role"];
  return VALID_ROLES.includes(role) ? role : "Sales";
};

type MaterialVariantRow = Record<string, unknown>;
type ProductRow = Record<string, unknown>;

const normalizeMaterialVariant = (variant: MaterialVariantRow) => {
  const name = String(
    variant?.name ??
      variant?.color_name ??
      variant?.variant_name ??
      variant?.color ??
      ""
  ).trim();
  if (!name) return null;

  const cost = Number(
    variant?.cost ??
      variant?.cost_price ??
      variant?.price ??
      variant?.value ??
      0
  );

  const salePrice = Number(
    variant?.salePrice ??
      variant?.sale_price ??
      variant?.price ??
      variant?.cost ??
      variant?.cost_price ??
      variant?.value ??
      0
  );

  return {
    name,
    cost: Number.isFinite(cost) ? cost : 0,
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
  };
};

const normalizeRawMaterials = (rows: MaterialVariantRow[]): InventoryItem[] => {
  return rows
    .map((row) => {
      const rawColorVariants = Array.isArray((row as any)?.color_variants)
        ? (row as any).color_variants
        : Array.isArray((row as any)?.colorVariants)
        ? (row as any).colorVariants
        : [];

      const relationVariants = Array.isArray((row as any)?.inventory_variants)
        ? (row as any).inventory_variants
        : [];

      const variantSource =
        rawColorVariants.length > 0 ? rawColorVariants : relationVariants;

      const colorVariants = variantSource
        .map((variant: any) =>
          normalizeMaterialVariant((variant || {}) as MaterialVariantRow)
        )
        .filter(
          (
            variant
          ): variant is { name: string; cost: number; salePrice: number } =>
            Boolean(variant)
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
        );

      const purchaseLengthMeters = resolveMaterialPurchaseLengthMeters(
        row as Record<string, unknown>
      );

      return {
        ...(row as any),
        id: String((row as any)?.id ?? ""),
        name: String((row as any)?.name ?? (row as any)?.material_name ?? ""),
        unit: String((row as any)?.unit ?? "un") as InventoryItem["unit"],
        usageCategory: String(
          (row as any)?.usageCategory ?? (row as any)?.usage_category ?? ""
        ),
        purchaseLengthMeters: Number.isFinite(purchaseLengthMeters)
          ? purchaseLengthMeters
          : 0,
        colorVariants,
      } as InventoryItem;
    })
    .filter((item) => Boolean(item.id) && Boolean(item.name))
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
        sensitivity: "base",
      })
    );
};

const normalizeProductComposition = (value: unknown): ProductCompositionItem[] => {
  if (Array.isArray(value)) return value as ProductCompositionItem[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ProductCompositionItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeProducts = (rows: ProductRow[]): Product[] => {
  return rows
    .map((row) => ({
      ...(row as unknown as Product),
      id: String((row as any)?.id ?? ""),
      name: String((row as any)?.name ?? ""),
      category: String((row as any)?.category || (row as any)?.productCategory || (row as any)?.productcategory || (row as any)?.product_category || ""),
      productCategory: String(
        (row as any)?.productCategory ?? (row as any)?.productcategory ?? (row as any)?.product_category ?? ""
      ),
      productType: String((row as any)?.productType ?? (row as any)?.producttype ?? (row as any)?.product_type ?? ""),
      productSubCategory1: String(
        (row as any)?.productSubCategory1 ?? (row as any)?.productsubcategory1 ?? (row as any)?.product_sub_category_1 ?? ""
      ),
      productSubCategory2: String(
        (row as any)?.productSubCategory2 ?? (row as any)?.productsubcategory2 ?? (row as any)?.product_sub_category_2 ?? ""
      ),
      composition: normalizeProductComposition((row as any)?.composition),
      image: String((row as any)?.image ?? (row as any)?.photo_url ?? ""),
      desiredProfitMargin: Number(
        (row as any)?.desiredProfitMargin ?? (row as any)?.desiredprofitmargin ?? (row as any)?.desired_profit_margin ?? 0
      ),
      laborCost: Number((row as any)?.laborCost ?? (row as any)?.laborcost ?? (row as any)?.labor_cost ?? 0),
      productionHours: Number(
        (row as any)?.productionHours ?? (row as any)?.productionhours ?? (row as any)?.production_hours ?? 0
      ),
      assemblyHours: Number(
        (row as any)?.assemblyHours ?? (row as any)?.assemblyhours ?? (row as any)?.assembly_hours ?? 0
      ),
      hourlyRate: Number((row as any)?.hourlyRate ?? (row as any)?.hourlyrate ?? (row as any)?.hourly_rate ?? 0),
      fixedCostRate: Number(
        (row as any)?.fixedCostRate ?? (row as any)?.fixedcostrate ?? (row as any)?.fixed_cost_rate ?? 0
      ),
      absorptionRate: Number(
        (row as any)?.absorptionRate ?? (row as any)?.absorptionrate ?? (row as any)?.absorption_rate ?? 0
      ),
      quantityReference: Number(
        (row as any)?.quantityReference ?? (row as any)?.quantityreference ?? (row as any)?.quantity_reference ?? 1
      ),
      selectedCategoryColor: String(
        (row as any)?.selectedCategoryColor ?? (row as any)?.selectedcategorycolor ?? (row as any)?.selected_category_color ?? ""
      ),
      referenceWidthMm: Number(
        (row as any)?.referenceWidthMm ?? (row as any)?.referencewidthmm ?? (row as any)?.reference_width_mm ?? 0
      ),
      referenceHeightMm: Number(
        (row as any)?.referenceHeightMm ?? (row as any)?.referenceheightmm ?? (row as any)?.reference_height_mm ?? 0
      ),
    }))
    .filter((product) => Boolean(product.id) && Boolean(product.name));
};

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

  const resolveUserFromAuthSession = async (authUser: any): Promise<User> => {
    const email = String(authUser?.email ?? "");
    const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
    const fallbackName = String(metadata?.name ?? email.split("@")[0] ?? "Usuária");
    const fallbackRole = normalizeUserRole(metadata?.role);
    const fallbackGoalValue = Number(
      metadata?.monthly_goal ?? metadata?.monthlyGoal ?? 0
    );
    const fallbackGoal = Number.isFinite(fallbackGoalValue) ? fallbackGoalValue : 0;

    const { data: existingProfile } = await supabase
      .from(USERS_TABLE)
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    let profile: any = existingProfile;

    if (!profile) {
      const insertPayload: Record<string, unknown> = {
        id: authUser.id,
        auth_user_id: authUser.id,
        name: fallbackName,
        email,
        role: fallbackRole,
        monthly_goal:
          fallbackRole === "Sales" || fallbackRole === "Finance" ? fallbackGoal : 0,
      };

      const { data: insertedProfile, error: insertError } = await supabase
        .from(USERS_TABLE)
        .insert(insertPayload)
        .select("*")
        .maybeSingle();

      if (!insertError && insertedProfile) {
        profile = insertedProfile;
      } else {
        const insertMessage = String(insertError?.message ?? "").toLowerCase();
        const maybeExists =
          insertMessage.includes("duplicate key") ||
          insertMessage.includes("already exists");

        if (maybeExists) {
          const { data: fetchedAfterDuplicate } = await supabase
            .from(USERS_TABLE)
            .select("*")
            .eq("auth_user_id", authUser.id)
            .maybeSingle();
          profile = fetchedAfterDuplicate;
        }
      }
    }

    const resolvedRole = normalizeUserRole(profile?.role ?? fallbackRole);
    const goalRaw = profile?.monthly_goal ?? profile?.monthlyGoal ?? fallbackGoal;
    const parsedGoal = Number(goalRaw);

    return {
      id: authUser.id,
      name: String(profile?.name ?? fallbackName),
      email,
      role: resolvedRole,
      monthlyGoal:
        resolvedRole === "Sales" || resolvedRole === "Finance"
          ? Number.isFinite(parsedGoal)
            ? parsedGoal
            : 0
          : undefined,
    };
  };

  const handleLogin = async (email: string, password: string): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
     if (error || !data.user) {
      const message = error?.message?.toLowerCase() || "";
      if (message.includes("invalid login credentials")) {
        alert("Email ou senha inválidos.");
      } else if (message.includes("email not confirmed")) {
        alert("Confirme seu e-mail antes de entrar.");
      } else if (message.includes("database error") || message.includes("failed to fetch")) {
        alert("Não foi possível conectar ao Supabase agora. Tente novamente em instantes.");
      } else {
        alert(`Falha no login: ${error?.message ?? "erro desconhecido"}`);
      }
      throw new Error(error?.message ?? "Falha no login");
    }

    const resolvedUser = await resolveUserFromAuthSession(data.user);
    setCurrentUser(resolvedUser);

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
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const resolvedUser = await resolveUserFromAuthSession(data.session.user);
          setCurrentUser(resolvedUser);
          await loadUsers();
        }
      } catch (err) {
        console.error("Erro ao inicializar sessão:", err);
      } finally {
        setLoading(false);
      }
    };

    // Timeout de segurança: se demorar mais de 12s, libera a tela de login
    const timeout = setTimeout(() => setLoading(false), 12000);

    boot().finally(() => clearTimeout(timeout));
  }, []);

  // ===============================
  // LOADERS
  // ===============================
  useEffect(() => {
    loadCompanySettings().then((res) => res.ok && res.data && setCompanySettings(res.data));
    // Carrega do Supabase; se vazio/erro, usa localStorage como fallback
    getQuotes().then((r) => {
      if (r.ok && Array.isArray(r.data) && r.data.length > 0) {
        setQuotes(r.data);
        try { localStorage.setItem("local_quotes_cache", JSON.stringify(r.data)); } catch {}
      } else {
        try {
          const cached = localStorage.getItem("local_quotes_cache");
          if (cached) setQuotes(JSON.parse(cached) as Quote[]);
        } catch {}
      }
    });
    getSales().then((r) => {
      if (!r.ok) return;
      const mapped = (r.data ?? []).map((row: any) => ({
        id: String(row.id),
        quoteId: String(row.quote_id ?? ""),
        customerName: "",
        salesperson: "",
        saleDate: row.date ? new Date(row.date) : new Date(),
        amount: Number(row.total ?? 0),
        status: "Pendente",
      })) as Sale[];
      setSales(mapped);
    });
    getCashFlow().then((r) => r.ok && setCashFlow(r.data ?? []));
  }, []);

  useEffect(() => {
    const loadSystemData = async () => {
      let clientsData: Client[] = [];
      for (const tbl of ["clients", "clientes"]) {
        const c = await supabase.from(tbl).select("*");
        if (Array.isArray(c.data) && c.data.length > 0) {
          clientsData = c.data as Client[];
          break;
        }
        if (Array.isArray(c.data) && !c.error) {
          clientsData = [];
          break;
        }
      }
      setClients(clientsData);

      const iWithVariants = await supabase
        .from(INVENTORY_TABLE)
        .select("*, inventory_variants(*)");

      let inventoryRows: MaterialVariantRow[] = Array.isArray(iWithVariants.data)
        ? (iWithVariants.data as MaterialVariantRow[])
        : [];

      if (iWithVariants.error) {
        console.error("Falha ao carregar inventory com variantes:", iWithVariants.error);
        const iFallback = await supabase.from(INVENTORY_TABLE).select("*");
        inventoryRows = Array.isArray(iFallback.data)
          ? (iFallback.data as MaterialVariantRow[])
          : [];
      }

      const inventoryRowsWithPhotos = await enrichMaterialRowsWithPhotoUrls(
        inventoryRows as Record<string, unknown>[]
      );

      setRawMaterials(normalizeRawMaterials(inventoryRowsWithPhotos));

      const p = await supabase.from(PRODUCTS_TABLE).select("*");
      if (Array.isArray(p.data)) {
        setProducts(normalizeProducts(p.data as ProductRow[]));
      }

      const v = await supabase.from(VARIABLE_EXPENSES_TABLE).select("*");
      if (Array.isArray(v.data)) {
        const normalized = v.data.map((e: any) => ({
          ...e,
          type: (String(e.type || "").toLowerCase().includes("percent") || e.type === "Percentual")
            ? "percent"
            : "fixed",
        }));
        setVariableExpenses(normalized as VariableExpense[]);
      }
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
            onDeleteQuote={async (id) => {
              const r = await deleteQuote(id);
              if (r.ok) {
                setQuotes((prev) => {
                  const next = prev.filter((q) => q.id !== id);
                  try { localStorage.setItem("local_quotes_cache", JSON.stringify(next)); } catch {}
                  return next;
                });
              } else {
                alert("Erro ao excluir orçamento.");
              }
            }}
          />
        );

      case "newQuote": {
        const nextQuoteNumber = quotes.length > 0
          ? Math.max(...quotes.map((q) => (q as any).quoteNumber || 0)) + 1
          : 1;
        return (
          <NewQuote
            currentUser={currentUser}
            clients={clients}
            rawMaterials={rawMaterials}
            products={products}
            variableExpenses={variableExpenses}
            companySettings={companySettings}
            nextQuoteNumber={nextQuoteNumber}
            onAddQuote={async (q: any) => {
              const r = await createQuote(q);
              const finalQuote = (r.ok && r.data) ? r.data as Quote : q as Quote;
              if (!r.ok) console.warn("Orçamento não salvo no banco:", r.error?.message);
              setQuotes((prev) => {
                const next = [finalQuote, ...prev];
                try { localStorage.setItem("local_quotes_cache", JSON.stringify(next)); } catch {}
                return next;
              });
            }}
            onAddNewClient={(c: any) => setClients((prev) => [c, ...prev])}
            onCancel={() => setActiveView("quotes")}
          />
        );
      }

      case "quoteDetail": {
        const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);
        return selectedQuote ? (
          <QuoteDetail
            quote={selectedQuote}
            clients={clients}
            rawMaterials={rawMaterials}
            products={products}
            variableExpenses={variableExpenses}
            companySettings={companySettings}
            cashFlow={cashFlow}
            onUpdateQuote={async (u: any) => {
              const r = await updateQuote(u.id, u);
              const finalQuote = (r.ok && r.data) ? r.data as Quote : u as Quote;
              if (!r.ok) console.warn("Orçamento não atualizado no banco:", r.error?.message);
              setQuotes((prev) => {
                const next = prev.map((q) => (q.id === u.id ? finalQuote : q));
                try { localStorage.setItem("local_quotes_cache", JSON.stringify(next)); } catch {}
                return next;
              });
            }}
            onCashFlowAdded={(entry) => {
              setCashFlow((prev) => [entry, ...prev]);
            }}
            onBack={() => setActiveView("quotes")}
            onGoToSales={() => setActiveView("sales")}
          />
        ) : null;
      }

      // ✅ VENDAS
      case "sales":
        return (
          <Sales
            sales={sales}
            quotes={quotes}
            clients={clients}
            cashFlow={cashFlow}
            onOpenQuote={(quoteId) => {
              setSelectedQuoteId(quoteId);
              setActiveView("quoteDetail");
            }}
          />
        );

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
        return (
          <Financials
            onVariableExpensesChange={(expenses) => {
              const normalized = expenses.map((e: any) => ({
                ...e,
                type: (String(e.type || "").toLowerCase().includes("percent") || e.type === "Percentual")
                  ? "percent"
                  : "fixed",
              }));
              setVariableExpenses(normalized as VariableExpense[]);
            }}
          />
        );

      // ✅ ADMIN
      case "employees":
        return <EmployeesList setActiveView={setActiveView} />;

      case "employee-new":
        return <EmployeeForm setActiveView={setActiveView} />;

      case "sellers":
        return <Sellers />;

      case "reports":
        return (
          <Reports
            sales={sales}
            quotes={quotes}
            cashFlow={cashFlow}
            products={products}
          />
        );

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
    <div className={`flex h-screen ${isDarkMode ? "dark" : "bg-gray-100"}`}>
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
