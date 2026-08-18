// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";

// COMPONENTES
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
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
import Montagens from "./components/Montagens";
import Freight from "./components/Freight";
import Payables from "./components/Payables";
import Receivables from "./components/Receivables";
import AgendaPage from "./components/agenda/AgendaPage";

// FUNCIONÁRIOS
import EmployeesList from "./components/employees/EmployeesList";
import EmployeeForm from "./components/employees/EmployeesForm";
import EmployeeDetailsPage from "./components/employees/details/EmployeeDetailsPage";
import DeliverySectorDetail from "./components/DeliverySectorDetail";
import { DeliverySector } from "./utils/deliveryEntries";

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
  Montagem,
  FreightRate,
  FreightConfig,
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

const normalizeMarginByColor = (value: unknown): Record<string, number> | undefined => {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const result: Record<string, number> = {};
  Object.entries(parsed as Record<string, unknown>).forEach(([key, val]) => {
    const num = Number(val);
    if (key && Number.isFinite(num)) result[key] = num;
  });
  return Object.keys(result).length > 0 ? result : undefined;
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
      marginByColor: normalizeMarginByColor(
        (row as any)?.marginByColor ?? (row as any)?.marginbycolor ?? (row as any)?.margin_by_color
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
  const [authResolved, setAuthResolved] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rawMaterials, setRawMaterials] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [montagens, setMontagens] = useState<Montagem[]>([]);
  const [freightRates, setFreightRates] = useState<FreightRate[]>([]);
  const [freightConfig, setFreightConfig] = useState<FreightConfig>({ kmRateCar: 0, kmRateMoto: 0, markup: 0 });
  const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const [showEscConfirm, setShowEscConfirm] = useState(false);
  const [escConfirmTarget, setEscConfirmTarget] = useState<View | null>(null);

  // Telas que precisam de confirmação antes de sair com ESC
  const ESC_CONFIRM_VIEWS = new Set(["newQuote", "employee-new"]);

  // ESC key → volta para a tela anterior
  const ESC_BACK_MAP: Partial<Record<string, View>> = {
    newQuote:     "quotes",
    quoteDetail:  "quotes",
    quotes:       "dashboard",
    sales:        "dashboard",
    clients:      "dashboard",
    products:     "dashboard",
    inventory:    "dashboard",
    cashflow:     "dashboard",
    payables:     "dashboard",
    receivables:  "dashboard",
    financials:   "dashboard",
    employees:    "dashboard",
    "employee-new": "employees",
    sellers:      "dashboard",
    reports:      "dashboard",
    settings:     "dashboard",
    assistant:    "dashboard",
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (document.querySelector(".fixed.inset-0")) return;
      const isEmpEdit = typeof activeView === "string" && activeView.startsWith("employee-edit-");
      const isEmpDetails = typeof activeView === "string" && activeView.startsWith("employee-details-");
      const back = ESC_BACK_MAP[activeView as string] || (isEmpEdit || isEmpDetails ? "employees" as View : null);
      if (!back) return;
      if (ESC_CONFIRM_VIEWS.has(activeView as string) || isEmpEdit || isEmpDetails) {
        setEscConfirmTarget(back);
        setShowEscConfirm(true);
      } else {
        setActiveView(back);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [activeView]);;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  // Quando preenchido, a tela "newQuote" abre em modo de edição desse
  // orçamento (carrega os itens/dados existentes) em vez de criar um novo.
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
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

    const avatarUrl = profile?.avatar ||
      `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(profile?.name ?? fallbackName)}`;

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
      avatar: avatarUrl,
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
        setAuthResolved(true);
      }
    };

    // Timeout de segurança: se demorar mais de 12s, libera a tela de login
    const timeout = setTimeout(() => {
      setLoading(false);
      setAuthResolved(true);
    }, 12000);

    boot().finally(() => clearTimeout(timeout));
  }, []);

  // ===============================
  // LOADERS
  // ===============================
  useEffect(() => {
    // Espera a sessão do Supabase resolver antes de buscar dados: em máquinas/
    // redes mais lentas, disparar essas consultas antes do token de auth estar
    // anexado ao cliente fazia o RLS filtrar tudo silenciosamente (sem erro),
    // dando a impressão de que o cadastro estava vazio.
    if (!authResolved) return;

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
  }, [authResolved]);

  // Tempo real: orçamentos, vendas e clientes atualizam sozinhos em todas as
  // telas abertas assim que alguém cria/edita/aprova um orçamento, registra
  // uma venda ou cadastra/edita um cliente — sem precisar recarregar a
  // página pra ver o que outra pessoa fez.
  useEffect(() => {
    if (!authResolved) return;

    const reloadQuotes = async () => {
      const r = await getQuotes();
      if (r.ok && Array.isArray(r.data)) {
        setQuotes(r.data);
        try { localStorage.setItem("local_quotes_cache", JSON.stringify(r.data)); } catch {}
      }
    };

    const reloadSales = async () => {
      const r = await getSales();
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
    };

    const reloadClients = async () => {
      const clientsRes = await supabase.from("clients").select("*").is("deleted_at", null);
      if (Array.isArray(clientsRes.data)) setClients(clientsRes.data as Client[]);
    };

    const channel = supabase
      .channel("realtime-quotes-sales-clients")
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, reloadQuotes)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, reloadSales)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, reloadClients)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authResolved]);

  useEffect(() => {
    // Só busca depois que a sessão do Supabase terminou de resolver (ver
    // comentário no efeito de LOADERS acima) — evita que a consulta de
    // produtos saia sem o token de autenticação anexado e volte vazia por
    // causa do RLS, mesmo sem nenhum erro.
    if (!authResolved) return;

    // Repete a consulta enquanto ela vier vazia sem erro (não só em caso de
    // erro de fato): um array vazio sem erro é exatamente o sintoma do RLS
    // filtrando tudo por o token de auth ainda não estar anexado, então
    // aceitar essa resposta de primeira apagava produtos/matéria-prima que
    // já existiam no banco.
    const fetchAllWithRetry = async <T,>(
      run: () => PromiseLike<{ data: T[] | null; error: unknown }>,
      attempts = 4
    ): Promise<{ data: T[] | null; error: unknown }> => {
      let lastResult: { data: T[] | null; error: unknown } = { data: null, error: null };
      for (let i = 0; i < attempts; i++) {
        const result = await run();
        lastResult = result;
        if (Array.isArray(result.data) && result.data.length > 0) return result;
        if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
      }
      return lastResult;
    };

    const fetchProductsWithRetry = () =>
      fetchAllWithRetry<ProductRow>(() => supabase.from(PRODUCTS_TABLE).select("*"));

    // As 5 buscas abaixo são independentes entre si (nenhuma usa o
    // resultado da outra), mas antes rodavam uma atrás da outra com
    // "await" em sequência — cada retry de inventory/products esperava
    // a busca anterior terminar antes de sequer começar, o que deixava a
    // tela de Novo Orçamento demorando bem mais que o necessário pra
    // mostrar os produtos (chegava a piscar "nenhum produto encontrado").
    // Rodando em paralelo com Promise.all, o tempo total vira o da busca
    // mais lenta, não a soma de todas.
    const loadSystemData = async () => {
      try {
        const loadClients = async () => {
          const clientsRes = await supabase.from("clients").select("*").is("deleted_at", null);
          setClients(Array.isArray(clientsRes.data) ? (clientsRes.data as Client[]) : []);
        };

        const loadInventory = async () => {
          const iWithVariants = await fetchAllWithRetry<MaterialVariantRow>(() =>
            supabase.from(INVENTORY_TABLE).select("*, inventory_variants(*)")
          );

          let inventoryRows: MaterialVariantRow[] = Array.isArray(iWithVariants.data)
            ? (iWithVariants.data as MaterialVariantRow[])
            : [];

          if (iWithVariants.error) {
            console.error("Falha ao carregar inventory com variantes:", iWithVariants.error);
            const iFallback = await fetchAllWithRetry<MaterialVariantRow>(() =>
              supabase.from(INVENTORY_TABLE).select("*")
            );
            inventoryRows = Array.isArray(iFallback.data)
              ? (iFallback.data as MaterialVariantRow[])
              : [];
          }

          let inventoryRowsWithPhotos: Record<string, unknown>[] = inventoryRows as Record<string, unknown>[];
          try {
            inventoryRowsWithPhotos = await enrichMaterialRowsWithPhotoUrls(inventoryRows as Record<string, unknown>[]);
          } catch (e) {
            console.warn("enrichMaterialRowsWithPhotoUrls falhou, usando dados sem fotos:", e);
          }

          setRawMaterials(normalizeRawMaterials(inventoryRowsWithPhotos));
        };

        const loadProducts = async () => {
          const p = await fetchProductsWithRetry();
          if (p.data) {
            setProducts(normalizeProducts(p.data));
          } else if (p.error) {
            console.error("Erro ao carregar produtos após tentativas:", p.error);
          }
        };

        const loadMontagens = async () => {
          const montagensRes = await supabase.from("montagens").select("*").order("name", { ascending: true });
          if (Array.isArray(montagensRes.data)) {
            setMontagens(
              montagensRes.data.map((row: any) => ({
                id: String(row.id),
                name: row.name || "",
                price: Number(row.price || 0),
                insumos: Array.isArray(row.insumos) ? row.insumos : [],
              }))
            );
          }
        };

        const loadFreightRates = async () => {
          const freightRes = await supabase.from("freight_rates").select("*").order("city", { ascending: true });
          if (Array.isArray(freightRes.data)) {
            setFreightRates(
              freightRes.data.map((row: any) => ({
                id: String(row.id),
                city: row.city || "",
                km: Number(row.km || 0),
              }))
            );
          }
        };

        const loadFreightConfig = async () => {
          const cfgRes = await supabase
            .from("freight_config")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(1);
          const row = cfgRes.data?.[0];
          if (row) {
            setFreightConfig({
              kmRateCar: Number(row.km_rate_car || 0),
              kmRateMoto: Number(row.km_rate_moto || 0),
              markup: Number(row.markup || 0),
            });
          }
        };

        const loadVariableExpenses = async () => {
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

        await Promise.all([
          loadClients(),
          loadInventory(),
          loadProducts(),
          loadMontagens(),
          loadFreightRates(),
          loadFreightConfig(),
          loadVariableExpenses(),
        ]);
      } catch (err) {
        console.error("Erro ao carregar dados do sistema:", err);
      }
    };

    loadSystemData();
  }, [authResolved]);

  // ===============================
  // PERMISSÕES (SEM LOOP)
  // ===============================
  const role = currentUser?.role ?? "Sales";

  const canAccess = useMemo(() => {
    return (view: View) => {
      if (role === "Admin") return true;

      if (role === "Finance") {
        return (
          ([
            "dashboard",
            "quotes", "newQuote", "quoteDetail",
            "sales",
            "clients",
            "agenda",
            "cashflow",
            "payables",
            "receivables",
            "financials",
            "employees",
            "sellers",
            "reports",
            "frete",
            "assistant",
          ] as any).includes(view)
        );
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
            "agenda",
            "products",
            "inventory",
            "sellers",
            "frete",
            "settings",
            "assistant",
          ] as any).includes(view)
        );
      }

      return false;
    };
  }, [role]);

  // Mescla as vendas reais com "vendas virtuais" derivadas dos orçamentos
  // aprovados que ainda não têm uma linha em sales — antes era tudo ou
  // nada (só olhava os orçamentos aprovados quando sales estava 100%
  // vazia), então assim que existia qualquer venda real, orçamentos
  // recém-aprovados paravam de aparecer aqui.
  const effectiveSales = useMemo<Sale[]>(() => {
    const realSaleQuoteIds = new Set(sales.map((s) => s.quoteId));

    const virtualSales = quotes
      .filter((q) => q.status === "Aprovado" && !realSaleQuoteIds.has(q.id))
      .map((q) => ({
        id: `quote-${q.id}`,
        quoteId: q.id,
        customerName: q.customerName || "",
        salesperson: q.salesperson || "",
        saleDate: q.date ? new Date(q.date) : new Date(),
        amount: Number(q.totalPrice || 0),
        status: "" as any,
      }));

    return [...sales, ...virtualSales];
  }, [sales, quotes]);

  // Compartilhado entre QuoteDetail (edição de status/data) e NewQuote em
  // modo de edição (adicionar/remover item de um orçamento já salvo).
  const handleUpdateQuote = async (u: any) => {
    const r = await updateQuote(u.id, u);
    const finalQuote = (r.ok && r.data) ? r.data as Quote : u as Quote;
    if (!r.ok) console.warn("Orçamento não atualizado no banco:", r.error?.message);
    setQuotes((prev) => {
      const next = prev.map((q) => (q.id === u.id ? finalQuote : q));
      try { localStorage.setItem("local_quotes_cache", JSON.stringify(next)); } catch {}
      return next;
    });
  };

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

    // 🧾 detalhamento do funcionário: "employee-details-<id>"
    if (
      typeof activeView === "string" &&
      activeView.startsWith("employee-details-")
    ) {
      const employeeId = activeView.replace("employee-details-", "");
      return (
        <EmployeeDetailsPage id={employeeId} currentUser={currentUser} setActiveView={setActiveView} />
      );
    }

    // 🚚 entregas pendentes por setor: "delivery-sector-<SETOR>"
    if (
      typeof activeView === "string" &&
      activeView.startsWith("delivery-sector-")
    ) {
      const sector = activeView.replace("delivery-sector-", "") as DeliverySector;
      return <DeliverySectorDetail sector={sector} setActiveView={setActiveView} />;
    }


    // 🔒 se não tem permissão, mostra dashboard
    if (!canAccess(activeView)) {
      return <Dashboard currentUser={currentUser} setActiveView={setActiveView} />;
    }

    switch (activeView) {
      case "dashboard":
        return <Dashboard currentUser={currentUser} setActiveView={setActiveView} />;

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
        const editingQuote = editingQuoteId ? quotes.find((q) => q.id === editingQuoteId) || null : null;
        return (
          <NewQuote
            currentUser={currentUser}
            clients={clients}
            rawMaterials={rawMaterials}
            products={products}
            montagens={montagens}
            freightRates={freightRates}
            freightConfig={freightConfig}
            variableExpenses={variableExpenses}
            companySettings={companySettings}
            nextQuoteNumber={nextQuoteNumber}
            editingQuote={editingQuote}
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
            onUpdateQuote={handleUpdateQuote}
            onAddNewClient={(c: any) => setClients((prev) => [c, ...prev])}
            onCancel={() => {
              // Limpa o modo de edição só ao sair de fato da tela — limpar
              // logo após salvar (com a prévia do PDF ainda aberta) fazia o
              // título voltar pra "Novo Orçamento" e arriscava criar um
              // orçamento duplicado se salvasse de novo por engano.
              const wasEditing = Boolean(editingQuoteId);
              setEditingQuoteId(null);
              setActiveView(wasEditing ? "quoteDetail" : "quotes");
            }}
          />
        );
      }

      case "quoteDetail": {
        const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);
        return selectedQuote ? (
          <QuoteDetail
            quote={selectedQuote}
            currentUser={currentUser}
            clients={clients}
            rawMaterials={rawMaterials}
            products={products}
            variableExpenses={variableExpenses}
            companySettings={companySettings}
            cashFlow={cashFlow}
            onUpdateQuote={handleUpdateQuote}
            onCashFlowAdded={(entry) => {
              setCashFlow((prev) => [entry, ...prev]);
            }}
            onBack={() => setActiveView("quotes")}
            onGoToSales={() => setActiveView("sales")}
            onEditQuote={() => {
              setEditingQuoteId(selectedQuote.id);
              setActiveView("newQuote");
            }}
          />
        ) : null;
      }

      // ✅ VENDAS
      case "sales":
        return (
          <Sales
            currentUser={currentUser}
            sales={effectiveSales}
            quotes={quotes}
            clients={clients}
            cashFlow={cashFlow}
            onOpenQuote={(quoteId) => {
              setSelectedQuoteId(quoteId);
              setActiveView("quoteDetail");
            }}
            onDeleteSale={(saleId) => {
              setSales((prev) => prev.filter((s) => String((s as any).id) !== saleId));
            }}
          />
        );

      // ✅ CLIENTES / ESTOQUE / PRODUTOS
      case "clients":
        return <Clients />;

      case "agenda":
        return <AgendaPage currentUser={currentUser} />;

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

      case "payables":
        return <Payables />;

      case "receivables":
        return <Receivables />;

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
        return <Sellers currentUser={currentUser} />;

      case "montagens":
        return (
          <Montagens
            montagens={montagens}
            setMontagens={setMontagens}
            currentUser={currentUser}
            rawMaterials={rawMaterials}
            variableExpenses={variableExpenses}
          />
        );

      case "frete":
        return (
          <Freight
            freightRates={freightRates}
            setFreightRates={setFreightRates}
            freightConfig={freightConfig}
            currentUser={currentUser}
            variableExpenses={variableExpenses}
          />
        );

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
            currentUser={currentUser}
            onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
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

      {/* Confirmação de saída via ESC */}
      {showEscConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 text-center">
            <p className="text-lg font-semibold text-gray-800 mb-1">Sair sem salvar?</p>
            <p className="text-sm text-gray-500 mb-5">As alterações feitas ainda não foram salvas.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEscConfirm(false)}
                className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-medium"
              >
                Continuar editando
              </button>
              <button
                onClick={() => { setShowEscConfirm(false); if (escConfirmTarget) setActiveView(escConfirmTarget); }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-medium"
              >
                Sair sem salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
