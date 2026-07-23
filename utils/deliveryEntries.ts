import { Product, QuoteItem } from "../types";

export type DeliverySector = "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO AUTOMATICO";

export type QuoteRowAny = any;
export type ClientRowAny = any;

export const SECTOR_LABELS: Record<DeliverySector, string> = {
  GRANITO: "Granito",
  VIDROS: "Vidros",
  ALUMINIO: "Alumínio",
  "PORTAO AUTOMATICO": "Portão Automático",
};

export const SECTOR_DOT_COLORS: Record<DeliverySector, string> = {
  GRANITO: "bg-amber-500",
  VIDROS: "bg-sky-500",
  ALUMINIO: "bg-slate-400",
  "PORTAO AUTOMATICO": "bg-purple-500",
};

export type DeliveryEntry = {
  id: string;
  sector: DeliverySector;
  saleDate: string;
  deliveryDate: string;
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  productLabel: string;
  totalPrice: number;
  internalStatus: string;
  isPending: boolean;
};

export const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

export const parseIsoDate = (value: string) => {
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

export const parseDateFlexible = (value: unknown) => {
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

export const formatDateToISO = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateShort = (value: string) => {
  const parsed = parseDateFlexible(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "Data não informada";
};

export const adjustToBusinessDay = (date: Date) => {
  const adjusted = new Date(date);
  while (adjusted.getDay() === 0 || adjusted.getDay() === 6) {
    adjusted.setDate(adjusted.getDate() + 1);
  }
  return adjusted;
};

export const calculateDeliveryDate = (saleDate: string, leadDays: number) => {
  const parsedSale = parseDateFlexible(saleDate);
  if (!parsedSale) return "";

  const safeLeadDays = Math.max(0, Math.floor(Number(leadDays) || 0));
  parsedSale.setDate(parsedSale.getDate() + safeLeadDays);
  return formatDateToISO(adjustToBusinessDay(parsedSale));
};

export const parseQuoteItems = (items: unknown): QuoteItem[] => {
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

export const extractDeliveryMetadata = (notes: unknown) => {
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

export const getClientAddressLabel = (client: ClientRowAny) => {
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

export const inferSectorFromItem = (item: QuoteItem, productsMap: Record<string, Product>): DeliverySector => {
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

export const buildDeliveryEntriesBySector = (
  quotes: QuoteRowAny[],
  clients: ClientRowAny[],
  productsCatalog: Product[]
): Record<DeliverySector, DeliveryEntry[]> => {
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
    const clientPhone = String(quoteClient?.phone || "").trim();
    const internalStatus = String(quote?.internalStatus || "Pedido");
    const isPending = internalStatus !== "Entregue";
    const totalPrice = Number(quote?.totalPrice || quote?.total_price || 0);

    const itemsBySector = new Map<DeliverySector, Set<string>>();

    quoteItems.forEach((item) => {
      const sector = inferSectorFromItem(item, productsMap);
      const product = productsMap[String(item.productId)] as Product | undefined;
      const label = String(product?.name || item.productName || item.description || "").trim();

      if (!itemsBySector.has(sector)) itemsBySector.set(sector, new Set());
      if (label) itemsBySector.get(sector)!.add(label);
    });

    itemsBySector.forEach((labels, sector) => {
      buckets[sector].push({
        id: `${quote?.id || Date.now()}-${sector}`,
        sector,
        saleDate: saleDateISO,
        deliveryDate: deliveryDateISO,
        clientName: String(quote?.customerName || "Cliente não informado"),
        clientAddress,
        clientPhone,
        productLabel: Array.from(labels).join(", "),
        totalPrice,
        internalStatus,
        isPending,
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
};
