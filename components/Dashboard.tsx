import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./icons/Icon";
import { View, User, Product, QuoteItem } from "../types";
import motivationalQuotes from "../data/motivationalQuotes";
import { supabase } from "../services/supabase";

type SellerRow = {
  id: string | number;
  name: string;
  role?: string | null;
  commission?: number | null;
  monthly_target?: number | null;
  active?: boolean | null;
};

type SaleRowAny = any;
type QuoteRowAny = any;
type ClientRowAny = any;
type EmployeeRowAny = any;
type DeliverySector = "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO AUTOMATICO";

type DeliveryEntry = {
  id: string;
  sector: DeliverySector;
  saleDate: string;
  deliveryDate: string;
  clientName: string;
  clientAddress: string;
};

type BirthdayMonthLabel = "Mês atual" | "Próximo mês" | "Próximos meses";

type BirthdayEntry = {
  id: string;
  name: string;
  dateLabel: string;
  age: number;
  monthLabel: BirthdayMonthLabel;
  sortDate: Date;
};

interface DashboardCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  icon,
  color,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`bg-white p-6 rounded-xl shadow-md flex items-center justify-between
    transition-transform transform hover:scale-105 ${onClick ? "cursor-pointer" : ""}`}
  >
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
    <div className={`p-3 rounded-full ${color}`}>{icon}</div>
  </div>
);

interface DashboardProps {
  setActiveView: (view: View) => void;
  currentUser: User;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const parseIsoDate = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const parseDateFlexible = (value: unknown) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = parseIsoDate(raw.slice(0, 10));
  if (iso) return iso;

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (Number.isNaN(parsed.getTime())) return null;
    if (
      parsed.getFullYear() !== Number(yyyy) ||
      parsed.getMonth() !== Number(mm) - 1 ||
      parsed.getDate() !== Number(dd)
    ) {
      return null;
    }
    return parsed;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const formatDateToISO = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateShort = (value: string) => {
  const parsed = parseDateFlexible(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "Data não informada";
};

const adjustToBusinessDay = (date: Date) => {
  const adjusted = new Date(date);
  while (adjusted.getDay() === 0 || adjusted.getDay() === 6) {
    adjusted.setDate(adjusted.getDate() + 1);
  }
  return adjusted;
};

const calculateDeliveryDate = (saleDate: string, leadDays: number) => {
  const parsedSale = parseDateFlexible(saleDate);
  if (!parsedSale) return "";

  const safeLeadDays = Math.max(0, Math.floor(Number(leadDays) || 0));
  parsedSale.setDate(parsedSale.getDate() + safeLeadDays);
  return formatDateToISO(adjustToBusinessDay(parsedSale));
};

const parseQuoteItems = (items: unknown): QuoteItem[] => {
  if (Array.isArray(items)) return items as QuoteItem[];
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as QuoteItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const extractDeliveryMetadata = (notes: unknown) => {
  const text = String(notes || "");
  const daysMatch = text.match(/Prazo de entrega:\s*(\d+)/i);
  const dateMatch = text.match(
    /Data prevista de entrega:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i
  );

  let deliveryDate = "";
  if (dateMatch?.[1]) {
    const parsed = parseDateFlexible(dateMatch[1]);
    if (parsed) deliveryDate = formatDateToISO(parsed);
  }

  return {
    deliveryLeadDays: daysMatch?.[1] ? Number(daysMatch[1]) : undefined,
    deliveryDate,
  };
};

const getClientAddressLabel = (client: ClientRowAny) => {
  const address = client?.address;

  if (typeof address === "string" && address.trim()) return address.trim();

  if (address && typeof address === "object") {
    const parts = [
      address.street,
      address.number,
      address.neighborhood,
      address.city,
      address.state,
    ]
      .map((part: unknown) => String(part || "").trim())
      .filter(Boolean);

    if (parts.length > 0) return parts.join(", ");
  }

  const fallback = String(client?.address || "").trim();
  return fallback || "Endereço não informado";
};

const inferSectorFromItem = (item: QuoteItem, productsMap: Record<string, Product>): DeliverySector => {
  const product = productsMap[String(item.productId)] as Product | undefined;

  // 1. Prioridade: categoria cadastrada no produto (mais confiável)
  const category = normalizeText(product?.category || "");
  if (category.includes("PORTAO")) return "PORTAO AUTOMATICO";
  if (category.includes("VIDRO")) return "VIDROS";
  if (category.includes("ALUMINIO")) return "ALUMINIO";
  if (category.includes("GRANITO") || category.includes("PEDRA") || category.includes("MARMORE")) return "GRANITO";

  // 2. Fallback: infere pelo nome/descrição (sem considerar categoria)
  const nameText = normalizeText(
    `${product?.name || ""} ${item.productName || ""} ${item.description || ""}`
  );
  if (nameText.includes("PORTAO")) return "PORTAO AUTOMATICO";
  if (nameText.includes("VIDRO")) return "VIDROS";
  if (nameText.includes("ALUMINIO")) return "ALUMINIO";
  return "GRANITO";
};

function normalizeSale(row: SaleRowAny) {
  const saleDate = row?.saleDate ?? row?.sale_date ?? row?.date ?? null;
  return {
    id: row?.id,
    amount: Number(row?.amount || 0),
    saleDate,
    // pode existir um ou outro no seu banco/código
    sellerId: row?.seller_id ?? row?.sellerId ?? null,
    salesperson: (row?.salesperson ?? row?.seller_name ?? row?.sellerName ?? "").trim(),
  };
}

function getInitials(name: string) {
  const parts = (name || "").trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
}

const Dashboard: React.FC<DashboardProps> = ({ setActiveView, currentUser }) => {
  const userRole = currentUser?.role || "Admin";

  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<QuoteRowAny[]>([]);
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [clients, setClients] = useState<ClientRowAny[]>([]);
  const [employees, setEmployees] = useState<EmployeeRowAny[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployeesLite = useCallback(async () => {
    const employeesRes = await supabase.from("employees").select("id,name,birth_date");
    const safeEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
    setEmployees(safeEmployees);
  }, []);

  // ------------------ carregar tudo do Supabase ------------------
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);

      // Todas as queries em paralelo — reduz 6-12s para ~2s
      const [sellersRes, salesRes, quotesRes, productsRes, clientsRes, employeesRes, payablesRes] =
        await Promise.all([
          supabase
            .from("sellers")
            .select("id,name,role,commission,monthly_target,active")
            .eq("active", true)
            .order("name", { ascending: true }),
          supabase
            .from("sales")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase
            .from("quotes")
            .select("*")
            .order("date", { ascending: false }),
          supabase.from("products").select("*"),
          supabase.from("clients").select("*"),
          supabase.from("employees").select("id,name,birth_date"),
          supabase.from("payables").select("*").order("due_date", { ascending: true }),
        ]);

      const safeSellers = Array.isArray(sellersRes.data) ? (sellersRes.data as SellerRow[]) : [];
      const safeSalesRaw = Array.isArray(salesRes.data) ? salesRes.data : [];
      const safeProducts = Array.isArray(productsRes.data) ? (productsRes.data as Product[]) : [];
      const safeClients = Array.isArray(clientsRes.data) ? clientsRes.data : [];
      const safeEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
      setPayables(Array.isArray(payablesRes.data) ? payablesRes.data : []);

      // Quotes: usa Supabase se disponível, senão localStorage
      let safeQuotes = Array.isArray(quotesRes.data) ? quotesRes.data : [];
      if (safeQuotes.length === 0) {
        try {
          const cached = localStorage.getItem("local_quotes_cache");
          if (cached) safeQuotes = JSON.parse(cached);
        } catch {}
      }

      // Sales: se Supabase vazio, constrói a partir das quotes aprovadas
      let finalSales = safeSalesRaw;
      if (finalSales.length === 0) {
        let savedStatuses: Record<string, string> = {};
        try {
          const raw = localStorage.getItem("local_sales_statuses");
          if (raw) savedStatuses = JSON.parse(raw);
        } catch {}
        finalSales = safeQuotes
          .filter((q: any) => q.status === "Aprovado")
          .map((q: any) => ({
            id: `quote-${q.id}`,
            amount: Number(q.totalPrice || q.total_price || 0),
            saleDate: q.date || null,
            sellerId: null,
            salesperson: q.salesperson || "",
          }));
      }

      setSellers(safeSellers);
      setSales(finalSales.map(normalizeSale));
      setQuotes(safeQuotes);
      setProductsCatalog(safeProducts);
      setClients(safeClients);
      setEmployees(safeEmployees);
      setLoading(false);
    };

    loadAll();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-employees-birthdays")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        async () => {
          await loadEmployeesLite();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEmployeesLite]);

  useEffect(() => {
    const refreshOnFocus = () => {
      loadEmployeesLite();
    };

    const intervalId = window.setInterval(() => {
      loadEmployeesLite();
    }, 30000);

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(intervalId);
    };
  }, [loadEmployeesLite]);

  // ------------------ frase do dia ------------------
  const quoteOfTheDay = useMemo(() => {
    const dayNumber = Math.floor(Date.now() / 86400000);
    const index = motivationalQuotes.length > 0 ? dayNumber % motivationalQuotes.length : 0;
    return motivationalQuotes[index] || "Hoje é dia de vender com propósito e foco.";
  }, []);

  // ------------------ mês atual ------------------
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const salesThisMonth = useMemo(() => {
    return (Array.isArray(sales) ? sales : []).filter((s: any) => {
      if (!s?.saleDate) return false;
      const d = new Date(s.saleDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [sales, currentMonth, currentYear]);

  const totalSalesCountMonth = salesThisMonth.length;

  const totalSalesAmountCurrentMonth = salesThisMonth.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  );

  const ticketMedioGeral =
    totalSalesCountMonth > 0 ? totalSalesAmountCurrentMonth / totalSalesCountMonth : 0;

  // ------------------ metas: soma das metas das vendedoras ativas ------------------
  const activeSellersWithGoals = sellers.filter((s) => Number(s.monthly_target || 0) > 0);

  const totalGoal = activeSellersWithGoals.reduce(
    (sum: number, s) => sum + Number(s.monthly_target || 0),
    0
  );

  const totalProgressPercent =
    totalGoal > 0 ? Math.min((totalSalesAmountCurrentMonth / totalGoal) * 100, 100) : 0;

  const totalRemaining = Math.max(totalGoal - totalSalesAmountCurrentMonth, 0);

  // ------------------ vendas por vendedora (ID preferido, senão nome) ------------------
  const salesBySeller = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};

    salesThisMonth.forEach((sale: any) => {
      const key =
        sale.sellerId != null ? String(sale.sellerId) : (sale.salesperson || "").toLowerCase().trim();

      if (!key) return;

      if (!map[key]) map[key] = { total: 0, count: 0 };
      map[key].total += Number(sale.amount || 0);
      map[key].count += 1;
    });

    return map;
  }, [salesThisMonth]);

  // ------------------ lista exibida (Sales vê só ela mesma pelo nome) ------------------
  const displayableSellers =
    userRole === "Sales"
      ? activeSellersWithGoals.filter(
          (s) => (s.name || "").toLowerCase().trim() === (currentUser.name || "").toLowerCase().trim()
        )
      : activeSellersWithGoals;

  // ------------------ ranking mensal ------------------
  const ranking = useMemo(() => {
    const rows = activeSellersWithGoals.map((s) => {
      const keyId = String(s.id);
      const keyName = (s.name || "").toLowerCase().trim();

      const byId = salesBySeller[keyId];
      const byName = salesBySeller[keyName];

      const total = Number(byId?.total ?? byName?.total ?? 0);
      const count = Number(byId?.count ?? byName?.count ?? 0);
      const goal = Number(s.monthly_target || 0);
      const percent = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

      return { ...s, total, count, percent };
    });

    return rows.sort((a, b) => b.total - a.total).slice(0, 3);
  }, [activeSellersWithGoals, salesBySeller]);

  const deliveryEntriesBySector = useMemo(() => {
    const productsMap = (Array.isArray(productsCatalog) ? productsCatalog : []).reduce(
      (acc, product) => {
        acc[String(product.id)] = product;
        return acc;
      },
      {} as Record<string, Product>
    );

    const clientsMap = (Array.isArray(clients) ? clients : []).reduce((acc, client) => {
      acc[String(client.id)] = client;
      return acc;
    }, {} as Record<string, ClientRowAny>);

    const buckets: Record<DeliverySector, DeliveryEntry[]> = {
      GRANITO: [],
      VIDROS: [],
      ALUMINIO: [],
      "PORTAO AUTOMATICO": [],
    };

    (Array.isArray(quotes) ? quotes : []).filter((q: any) => q.status === "Aprovado").forEach((quote) => {
      const quoteItems = parseQuoteItems(quote?.items);
      if (quoteItems.length === 0) return;

      const saleDateISO = formatDateToISO(parseDateFlexible(quote?.date) || new Date());
      const metadata = extractDeliveryMetadata(quote?.measurementNotes);
      const deliveryDateISO =
        metadata.deliveryDate ||
        calculateDeliveryDate(saleDateISO, Number(metadata.deliveryLeadDays ?? 20));

      const quoteClient = clientsMap[String(quote?.clientId)];
      const clientAddress = getClientAddressLabel(quoteClient);
      const sectorsInQuote = new Set<DeliverySector>();

      quoteItems.forEach((item) => sectorsInQuote.add(inferSectorFromItem(item, productsMap)));

      sectorsInQuote.forEach((sector) => {
        buckets[sector].push({
          id: `${quote?.id || Date.now()}-${sector}`,
          sector,
          saleDate: saleDateISO,
          deliveryDate: deliveryDateISO,
          clientName: String(quote?.customerName || "Cliente não informado"),
          clientAddress,
        });
      });
    });

    (Object.keys(buckets) as DeliverySector[]).forEach((sector) => {
      buckets[sector] = buckets[sector].sort((a, b) => {
        const aDate = parseDateFlexible(a.deliveryDate)?.getTime() || 0;
        const bDate = parseDateFlexible(b.deliveryDate)?.getTime() || 0;
        return aDate - bDate;
      });
    });

    return buckets;
  }, [clients, productsCatalog, quotes]);

  const upcomingBirthdays = useMemo(() => {
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const currentMonthIndex = nowDate.getMonth();
    const currentYear = nowDate.getFullYear();

    const rows: BirthdayEntry[] = [];

    (Array.isArray(employees) ? employees : []).forEach((employee) => {
      const birthDate = parseDateFlexible(employee?.birth_date);
      if (!birthDate) return;

      const birthDay = birthDate.getDate();
      const birthMonth = birthDate.getMonth();
      const birthYear = birthDate.getFullYear();

      let nextBirthdayYear = currentYear;
      let nextBirthday = new Date(nextBirthdayYear, birthMonth, birthDay);

      if (nextBirthday < todayStart) {
        nextBirthdayYear = currentYear + 1;
        nextBirthday = new Date(nextBirthdayYear, birthMonth, birthDay);
      }

      if (Number.isNaN(nextBirthday.getTime())) return;

      if (nextBirthday.getMonth() !== birthMonth) {
        nextBirthday = new Date(nextBirthdayYear, birthMonth + 1, 0);
      }

      const monthDiff =
        (nextBirthday.getFullYear() - currentYear) * 12 +
        (nextBirthday.getMonth() - currentMonthIndex);

      let monthLabel: BirthdayMonthLabel = "Próximos meses";
      if (monthDiff === 0) monthLabel = "Mês atual";
      if (monthDiff === 1) monthLabel = "Próximo mês";

      rows.push({
        id: `${employee?.id || employee?.name}-${nextBirthdayYear}`,
        name: String(employee?.name || "Funcionário"),
        dateLabel: nextBirthday.toLocaleDateString("pt-BR"),
        age: nextBirthdayYear - birthYear,
        monthLabel,
        sortDate: nextBirthday,
      });
    });

    return rows.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  }, [employees]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        <p className="text-sm text-gray-400">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MENSAGEM DO DIA */}
      <div className="bg-gradient-to-r from-primary-800 to-primary-600 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary-200 mb-2 flex items-center gap-2">
            <Icon className="w-4 h-4">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </Icon>
            Mensagem do Dia
          </h3>

          <p className="text-xl font-serif italic">"{quoteOfTheDay}"</p>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Vendido no mês"
          value={`R$ ${money(totalSalesAmountCurrentMonth)}`}
          icon={
            <Icon className="text-white">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </Icon>
          }
          color="bg-green-500"
          onClick={() => setActiveView("sales")}
        />

        <DashboardCard
          title="Qtd. vendas (mês)"
          value={`${totalSalesCountMonth}`}
          icon={
            <Icon className="text-white">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </Icon>
          }
          color="bg-blue-500"
          onClick={() => setActiveView("sales")}
        />

        <DashboardCard
          title="Ticket médio (mês)"
          value={`R$ ${money(ticketMedioGeral)}`}
          icon={
            <Icon className="text-white">
              <path d="M12 8V4H8" />
              <rect x="4" y="12" width="8" height="8" rx="2" />
              <path d="M8 12v-2a2 2 0 1 1 4 0v2" />
              <path d="m18 12 2-2 2 2" />
              <path d="m18 20-2 2-2-2" />
            </Icon>
          }
          color="bg-purple-500"
        />

        <DashboardCard
          title="Falta p/ meta (mês)"
          value={`R$ ${money(totalRemaining)}`}
          icon={
            <Icon className="text-white">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </Icon>
          }
          color="bg-red-500"
        />
      </div>

      {/* ENTREGAS POR SETOR */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {(["GRANITO", "VIDROS", "ALUMINIO", "PORTAO AUTOMATICO"] as DeliverySector[]).map((sector) => (
          <div key={sector} className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">{sector}</h3>
              <span className="text-xs font-semibold text-primary-700 bg-primary-50 px-2 py-1 rounded-full">
                {deliveryEntriesBySector[sector]?.length || 0}
              </span>
            </div>

            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {(deliveryEntriesBySector[sector] || []).map((entry) => {
                const delivParsed = parseDateFlexible(entry.deliveryDate);
                const today = new Date(); today.setHours(0,0,0,0);
                const daysLeft = delivParsed ? Math.ceil((delivParsed.getTime() - today.getTime()) / 86400000) : null;
                const daysColor = daysLeft === null ? "" : daysLeft < 0 ? "text-red-600" : daysLeft <= 3 ? "text-red-500" : daysLeft <= 7 ? "text-orange-500" : "text-green-600";
                const daysLabel = daysLeft === null ? "" : daysLeft < 0 ? `${Math.abs(daysLeft)}d atrasado` : daysLeft === 0 ? "Entrega hoje!" : `${daysLeft}d para entrega`;
                return (
                <div key={entry.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-gray-700">
                      <b>Venda:</b> {formatDateShort(entry.saleDate)}{" "}
                      <span className="mx-1">•</span>
                      <b>Previsão:</b> {formatDateShort(entry.deliveryDate)}
                    </p>
                    {daysLabel && (
                      <span className={`text-xs font-bold whitespace-nowrap ${daysColor}`}>
                        ⏱ {daysLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-800 mt-1">
                    <b>Cliente:</b> {entry.clientName}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    <b>END.</b> {entry.clientAddress}
                  </p>
                </div>
                );
              })}

              {(deliveryEntriesBySector[sector] || []).length === 0 && (
                <p className="text-xs text-gray-400">Sem entregas previstas para este setor.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* META GERAL + METAS INDIVIDUAIS + ANIVERSARIANTES + CONTAS A PAGAR */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* META GERAL */}
        <div className="bg-white p-5 rounded-xl shadow-md">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Meta Geral da Empresa</h3>

          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path
                  className="text-gray-200"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className={`${totalProgressPercent >= 100 ? "text-green-500" : "text-primary-600"}`}
                  strokeDasharray={`${totalProgressPercent}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>

              <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-800">
                  {totalProgressPercent.toFixed(0)}%
                </span>
                <span className="text-[11px] text-gray-500">Atingido</span>
              </div>
            </div>

            <div className="mt-4 w-full text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Vendido</span>
                <span className="font-bold text-gray-800">R$ {money(totalSalesAmountCurrentMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Meta</span>
                <span className="font-bold text-gray-800">R$ {money(totalGoal)}</span>
              </div>
              <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-sm font-semibold">
                Falta: R$ {money(totalRemaining)}
              </div>
              {loading && <p className="text-xs text-gray-400">Carregando dados...</p>}
            </div>
          </div>
        </div>

        {/* METAS INDIVIDUAIS (compacto) */}
        <div className="bg-white p-5 rounded-xl shadow-md">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">
              {userRole === "Sales" ? "Sua Meta" : "Metas de Vendedoras"}
            </h3>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-gray-400">Top 3</p>
              {ranking.slice(0, 2).map((r, idx) => (
                <p key={String(r.id)} className="text-[11px] text-gray-700">
                  {idx + 1}º {r.name}
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {displayableSellers.map((seller) => {
              const keyId = String(seller.id);
              const keyName = (seller.name || "").toLowerCase().trim();
              const stats = salesBySeller[keyId] ?? salesBySeller[keyName] ?? { total: 0, count: 0 };

              const sellerSales = Number(stats.total || 0);
              const sellerGoal = Number(seller.monthly_target || 0) || 1;
              const percent = Math.min((sellerSales / sellerGoal) * 100, 100);
              const remaining = Math.max(sellerGoal - sellerSales, 0);

              return (
                <div key={keyId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700">
                        {getInitials(seller.name)}
                      </div>
                      <span className="text-sm font-semibold text-gray-800">{seller.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{percent.toFixed(0)}%</span>
                  </div>

                  <div className="overflow-hidden h-2 rounded bg-gray-200 mb-2">
                    <div
                      style={{ width: `${percent}%` }}
                      className={`${percent >= 100 ? "bg-green-500" : "bg-primary-500"} h-2 rounded`}
                    />
                  </div>

                  <p className="text-xs text-gray-600">
                    R$ {money(sellerSales)} de R$ {money(Number(seller.monthly_target || 0))}
                  </p>
                  <p className="text-xs text-red-500">Falta: R$ {money(remaining)}</p>
                </div>
              );
            })}

            {!loading && displayableSellers.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-2">Nenhuma meta cadastrada.</p>
            )}
          </div>
        </div>

        {/* ANIVERSARIANTES */}
        <div className="bg-white p-5 rounded-xl shadow-md">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Aniversariantes</h3>
          <p className="text-xs text-gray-500 mb-3">Próximos aniversários (a partir de hoje)</p>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {upcomingBirthdays.map((person) => (
              <div key={person.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
                <p className="text-xs text-primary-700 font-semibold">{person.monthLabel}</p>
                <p className="text-sm font-semibold text-gray-800">{person.name}</p>
                <p className="text-xs text-gray-600">
                  {person.dateLabel} • {person.age} anos
                </p>
              </div>
            ))}
            {upcomingBirthdays.length === 0 && (
              <p className="text-sm text-gray-400">Sem aniversariantes cadastrados para o período.</p>
            )}
          </div>
        </div>

        {/* CONTAS A PAGAR */}
        <div className="bg-white p-5 rounded-xl shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Contas a Pagar</h3>
            <button onClick={() => setActiveView("payables")} className="text-xs text-blue-600 hover:underline">
              Ver todas →
            </button>
          </div>
          {payables.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma conta cadastrada.</p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {payables.map((p: any) => {
                const today = new Date().toISOString().split("T")[0];
                const dueDate = p.due_date ? String(p.due_date).split("T")[0] : "";
                const status = p.status || "pending";
                const isOverdue = status !== "paid" && dueDate && dueDate < today;
                const { label, cls } =
                  status === "paid"    ? { label: "Pago",     cls: "bg-green-100 text-green-700" } :
                  status === "partial" ? { label: "Parcial",  cls: "bg-yellow-100 text-yellow-700" } :
                  isOverdue            ? { label: "Vencida",  cls: "bg-red-100 text-red-700" } :
                                         { label: "A Vencer", cls: "bg-blue-100 text-blue-700" };
                const fmt = (ymd: string) => {
                  if (!ymd) return "-";
                  const [y, m, d] = ymd.split("-");
                  return `${d}/${m}/${y}`;
                };
                return (
                  <div key={p.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{p.name}</p>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cls}`}>{label}</span>
                    </div>
                    {p.supplier && <p className="text-xs text-gray-500">{p.supplier}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">{fmt(dueDate)}</p>
                      <p className="text-sm font-bold text-gray-800">
                        {Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RODAPÉ */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Bem-vindo(a) ao seu Painel de Gestão!</h2>
        <p className="text-gray-600">
          Aqui você tem uma visão geral do seu negócio. Utilize o menu à esquerda para navegar entre
          orçamentos, vendas, estoque e muito mais.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
