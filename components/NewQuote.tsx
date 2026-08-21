// src/components/NewQuote.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  User,
  Client,
  CompanySettings,
  InventoryItem,
  Product,
  VariableExpense,
  Quote,
  QuoteItem,
  QuoteItemMaterialLine,
  QuoteItemLaborLine,
  Montagem,
  QuoteItemMontagem,
  QuoteItemAssemblyLine,
  FreightRate,
  FreightConfig,
} from "../types";
import { generateQuotePDF, PDFOptions, cityFromAddress } from "../utils/generateQuotePDF";
import { Icon } from "./icons/Icon";

import { HARDWARE_COLORS } from "../constants";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { resolveMaterialPurchaseLengthMeters } from "../utils/materialPurchaseLength";
import { getCompositionLineBreakdown } from "../utils/productComposition";
import { supabase } from "../services/supabase";

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const parseISODate = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateToISO = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateToBR = (value: string) => {
  const parsed = parseISODate(value);
  if (!parsed) return "Data não definida";
  return parsed.toLocaleDateString("pt-BR");
};

const adjustToBusinessDay = (date: Date) => {
  const adjusted = new Date(date);

  while (adjusted.getDay() === 0 || adjusted.getDay() === 6) {
    adjusted.setDate(adjusted.getDate() + 1);
  }

  return adjusted;
};

const calculateDeliveryDate = (saleDate: string, leadDays: number) => {
  const baseDate = parseISODate(saleDate);
  if (!baseDate) return "";

  const safeLeadDays = Math.max(0, Math.floor(Number(leadDays) || 0));
  baseDate.setDate(baseDate.getDate() + safeLeadDays);

  return formatDateToISO(adjustToBusinessDay(baseDate));
};

const stripDeliveryMetaFromNotes = (notes: string) => {
  return String(notes || "")
    .split("\n")
    .filter((line) => {
      const normalizedLine = normalizeText(line).trim();
      return (
        !normalizedLine.startsWith("PRAZO DE ENTREGA:") &&
        !normalizedLine.startsWith("DATA PREVISTA DE ENTREGA:")
      );
    })
    .join("\n")
    .trim();
};

const getMaterialUsageCategory = (material: InventoryItem) =>
  normalizeText((material as any)?.usageCategory || (material as any)?.usage_category || "");

type MaterialVariant = {
  name?: string;
  color_name?: string;
  cost?: number;
  cost_price?: number;
  salePrice?: number;
  sale_price?: number;
};

const getMaterialVariants = (material?: InventoryItem | null): MaterialVariant[] => {
  if (!material) return [];

  const variants = (material as any)?.colorVariants ?? (material as any)?.color_variants ?? [];
  return Array.isArray(variants) ? (variants as MaterialVariant[]) : [];
};

const getVariantName = (variant?: MaterialVariant | null) =>
  String(variant?.name ?? variant?.color_name ?? "").trim();

const getVariantCost = (variant?: MaterialVariant | null) =>
  Number(variant?.cost ?? variant?.cost_price ?? 0);

const getVariantSalePrice = (variant?: MaterialVariant | null) =>
  Number(
    variant?.salePrice ??
      variant?.sale_price ??
      variant?.cost ??
      variant?.cost_price ??
      0
  );

const getMaterialPurchaseLengthMeters = (material?: InventoryItem | null) =>
  resolveMaterialPurchaseLengthMeters(
    ((material || null) as unknown) as Record<string, unknown> | null
  );

const getEffectiveMaterialUnitCost = (
  material: InventoryItem | null | undefined,
  rawCost: number
) => {
  const purchaseLengthMeters = getMaterialPurchaseLengthMeters(material);
  const safeRawCost = Number(rawCost || 0);
  if (!material || !Number.isFinite(safeRawCost) || safeRawCost <= 0) {
    return Number.isFinite(safeRawCost) ? safeRawCost : 0;
  }

  if (!(purchaseLengthMeters > 0)) {
    return safeRawCost;
  }

  const normalizedUnit = String(material.unit || "").trim().toLowerCase();
  if (normalizedUnit === "m") {
    return safeRawCost / purchaseLengthMeters;
  }
  if (normalizedUnit === "cm") {
    return safeRawCost / (purchaseLengthMeters * 100);
  }
  if (normalizedUnit === "mm") {
    return safeRawCost / (purchaseLengthMeters * 1000);
  }

  return safeRawCost;
};

// Só é "o vidro" de fato se for vendido por m² (a peça/chapa de vidro em si).
// Sem essa checagem de unidade, acessórios cujo nome contém "VIDRO" (ex.:
// "CUNHA VIDRO", vendida por unidade) eram confundidos com o vidro selecionado
// no orçamento e tinham o preço errado (do vidro) usado no lugar do preço
// próprio do acessório.
const isGlassMaterial = (material: InventoryItem) =>
  String(material?.unit || "").trim() === "m²" &&
  (getMaterialUsageCategory(material).includes("VIDRO") || normalizeText(material?.name).includes("VIDRO"));

interface NewQuoteProps {
  currentUser: User;
  clients: Client[];
  rawMaterials: InventoryItem[];
  products: Product[];
  montagens: Montagem[];
  freightRates: FreightRate[];
  freightConfig: FreightConfig;
  variableExpenses: VariableExpense[];
  companySettings: CompanySettings;
  nextQuoteNumber: number;
  onAddQuote: (quote: Quote) => Promise<void>;
  // Quando presente, a tela abre em modo de edição: carrega os itens/dados
  // desse orçamento já salvo, e o botão final atualiza em vez de criar novo.
  editingQuote?: Quote | null;
  onUpdateQuote?: (quote: Quote) => Promise<void>;
  onAddNewClient: (client: Client) => void;
  onCancel: () => void;
}

const normalizeMaterialVariant = (variant: Record<string, unknown>) => {
  const name = String(
    (variant as any)?.name ??
      (variant as any)?.color_name ??
      (variant as any)?.variant_name ??
      (variant as any)?.color ??
      ""
  ).trim();
  if (!name) return null;

  const cost = Number(
    (variant as any)?.cost ??
      (variant as any)?.cost_price ??
      (variant as any)?.price ??
      (variant as any)?.value ??
      0
  );

  const salePrice = Number(
    (variant as any)?.salePrice ??
      (variant as any)?.sale_price ??
      (variant as any)?.price ??
      (variant as any)?.cost ??
      (variant as any)?.cost_price ??
      (variant as any)?.value ??
      0
  );

  return {
    name,
    cost: Number.isFinite(cost) ? cost : 0,
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
  };
};

const NewQuote: React.FC<NewQuoteProps> = ({
  currentUser,
  clients,
  rawMaterials: rawMaterialsProp,
  products,
  montagens,
  freightRates,
  freightConfig: freightConfigProp,
  variableExpenses,
  companySettings,
  nextQuoteNumber,
  onAddQuote,
  editingQuote,
  onUpdateQuote,
  onAddNewClient,
  onCancel,
}) => {
  // ============================
  //           STATES
  // ============================
  // Busca matéria-prima diretamente do Supabase ao abrir o orçamento, em vez
  // de confiar só na lista carregada uma única vez no início do app (App.tsx).
  // Sem isso, edições recentes em Matéria-Prima (preço, metragem de compra
  // por barra, cores) ficavam "presas" até o usuário recarregar a página,
  // calculando o orçamento com dados desatualizados.
  const [dbRawMaterials, setDbRawMaterials] = useState<InventoryItem[]>([]);

  // A configuração de frete carregada no App.tsx só é buscada uma vez no
  // início da sessão — se o valor/km foi salvo em Financeiro nessa mesma
  // sessão, o botão "Aplicar" ainda calculava com o valor antigo (zerado)
  // até recarregar a página. Busca uma versão fresca aqui também.
  const [dbFreightConfig, setDbFreightConfig] = useState<FreightConfig | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("freight_config")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      const row = data?.[0];
      if (row && active) {
        setDbFreightConfig({
          kmRateCar: Number(row.km_rate_car || 0),
          kmRateMoto: Number(row.km_rate_moto || 0),
          markup: Number(row.markup || 0),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const freightConfig = dbFreightConfig || freightConfigProp;

  useEffect(() => {
    let active = true;

    const loadFreshRawMaterials = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*, inventory_variants(*)");

      if (error || !Array.isArray(data) || !active) return;

      const normalized = data
        .map((row: any) => {
          const variantSource = Array.isArray(row?.inventory_variants)
            ? row.inventory_variants
            : [];
          const colorVariants = variantSource
            .map((variant: any) => normalizeMaterialVariant(variant))
            .filter((variant): variant is { name: string; cost: number; salePrice: number } =>
              Boolean(variant)
            );

          return {
            ...row,
            id: String(row?.id ?? ""),
            name: String(row?.name ?? row?.material_name ?? "").trim(),
            unit: String(row?.unit ?? "un") as InventoryItem["unit"],
            usageCategory: row?.usageCategory ?? row?.usage_category ?? "",
            purchaseLengthMeters: resolveMaterialPurchaseLengthMeters(
              row as Record<string, unknown>
            ),
            colorVariants,
          } as InventoryItem;
        })
        .filter((item) => Boolean(item.id) && Boolean(item.name));

      if (active) setDbRawMaterials(normalized);
    };

    loadFreshRawMaterials();
    return () => {
      active = false;
    };
  }, []);

  // Combina a lista do App.tsx (pode estar desatualizada) com a busca fresca
  // feita acima; os dados recém-buscados sempre têm prioridade.
  const rawMaterials = useMemo(() => {
    const byId = new Map<string, InventoryItem>();
    rawMaterialsProp.forEach((item) => byId.set(String(item.id), item));
    dbRawMaterials.forEach((item) => {
      const id = String(item.id);
      const existing = byId.get(id);
      byId.set(id, existing ? { ...existing, ...item } : item);
    });
    return Array.from(byId.values());
  }, [rawMaterialsProp, dbRawMaterials]);
  const [showMaterialDetail, setShowMaterialDetail] = useState(false);
  const [showLaborDetail, setShowLaborDetail] = useState(false);
  const [showAssemblyDetail, setShowAssemblyDetail] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState<string>("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState<boolean>(false);
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [deliveryLeadDays, setDeliveryLeadDays] = useState<number>(20);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    calculateDeliveryDate(new Date().toISOString().split("T")[0], 20)
  );
  const [isDeliveryDateManual, setIsDeliveryDateManual] = useState<boolean>(false);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<Quote["paymentMethod"]>("Cartão");
  const [discount, setDiscount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<"percent" | "fixed">("percent");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [discountFixedInput, setDiscountFixedInput] = useState<string>(formatMoneyInputBR(0));
  const [freight, setFreight] = useState<number>(0);
  const [freightInput, setFreightInput] = useState<string>(formatMoneyInputBR(0));
  // Se true, o frete é diluído (rateado) dentro do valor de cada produto —
  // tanto na prévia da tela quanto no PDF. Se false, o frete aparece como
  // linha separada e os produtos mostram o valor "puro", sem frete embutido.
  const [dissolveFreight, setDissolveFreight] = useState<boolean>(true);
  const [freightCityId, setFreightCityId] = useState<string>("");
  const [freightVehicle, setFreightVehicle] = useState<"Carro" | "Moto">("Carro");
  // Cada "Aplicar" vira um item aqui em vez de sobrescrever o frete — permite
  // somar mais de um frete no mesmo orçamento (ex.: carro num dia + moto
  // noutro, pra mesma cidade ou cidades diferentes).
  const [freightItems, setFreightItems] = useState<
    { id: string; cityName: string; vehicle: "Carro" | "Moto"; km: number; value: number }[]
  >([]);
  const [showAdicionaisSaved, setShowAdicionaisSaved] = useState(false);
  const [installation, setInstallation] = useState<number>(0);
  const [installationInput, setInstallationInput] = useState<string>(formatMoneyInputBR(0));
  const [installationCostItems, setInstallationCostItems] = useState<
    { id: string; name: string; value: number; valueInput: string }[]
  >([]);
  const [referralCommissionRate, setReferralCommissionRate] = useState<number>(0); // % (ex: 5)
  const [selectedColor, setSelectedColor] = useState<string>("");

  const [measurementNotes, setMeasurementNotes] = useState<string>("");
  const [assemblyNotes, setAssemblyNotes] = useState<string>("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [globalFixedCostRate, setGlobalFixedCostRate] = useState<number>(20);

  // ── PDF states ──────────────────────────────────────────────────────────
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);

  // Modo de edição: carrega os dados do orçamento já salvo assim que a tela
  // abre. Só roda uma vez por orçamento (guarda o id já carregado) — não
  // queremos sobrescrever o que a usuária está digitando a cada render.
  const loadedEditingQuoteId = React.useRef<string | null>(null);
  useEffect(() => {
    if (!editingQuote || loadedEditingQuoteId.current === editingQuote.id) return;
    loadedEditingQuoteId.current = editingQuote.id;

    setSelectedClientId(editingQuote.clientId || "");
    setItems(Array.isArray(editingQuote.items) ? editingQuote.items : []);
    setDate(String(editingQuote.date || "").slice(0, 10) || new Date().toISOString().split("T")[0]);
    setPaymentMethod(editingQuote.paymentMethod || "Cartão");
    setFreight(Number(editingQuote.freight || 0));
    setFreightInput(formatMoneyInputBR(Number(editingQuote.freight || 0)));
    setFreightItems(Array.isArray(editingQuote.freightItems) ? editingQuote.freightItems : []);
    setDissolveFreight(editingQuote.dissolveFreight !== false);
    setInstallation(Number(editingQuote.installation || 0));
    setInstallationInput(formatMoneyInputBR(Number(editingQuote.installation || 0)));
    setInstallationCostItems(
      (editingQuote.installationCostItems || []).map((item) => ({
        id: item.id,
        name: item.name,
        value: Number(item.value) || 0,
        valueInput: formatMoneyInputBR(Number(item.value) || 0),
      }))
    );
    setReferralCommissionRate(Number(editingQuote.referralCommissionRate || 0));
    setAssemblyNotes(editingQuote.assemblyNotes || "");

    // O desconto é salvo só como valor final em R$ (não guarda se foi
    // digitado em % ou R$ originalmente) — reabre sempre em modo R$ com
    // esse valor, preservando o efeito monetário real.
    const savedDiscount = Number(editingQuote.discount || 0);
    setDiscountMode("fixed");
    setDiscount(savedDiscount);
    setDiscountFixedInput(formatMoneyInputBR(savedDiscount));

    // Prazo/data de entrega ficam embutidos como texto no início das notas
    // de medição — extrai de volta pros campos, e limpa o texto solto.
    const notesText = String(editingQuote.measurementNotes || "");
    const dayMatch = notesText.match(/Prazo de entrega:\s*(\d+)/i);
    const dateMatch = notesText.match(/Data prevista de entrega:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dayMatch?.[1]) setDeliveryLeadDays(Number(dayMatch[1]));
    if (dateMatch) setDeliveryDate(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
    setMeasurementNotes(stripDeliveryMetaFromNotes(notesText));
  }, [editingQuote]);

  // Hide options — persisted in localStorage
  const [hidePrice, setHidePrice] = useState<boolean>(() =>
    localStorage.getItem("quotePDFHidePrice") === "true"
  );
  const [hideMeasures, setHideMeasures] = useState<boolean>(() =>
    localStorage.getItem("quotePDFHideMeasures") === "true"
  );
  const [hideDetailedDescription, setHideDetailedDescription] = useState<boolean>(() =>
    localStorage.getItem("quotePDFHideDetailedDesc") === "true"
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [settingsRes, fixedRes, empRes] = await Promise.all([
        supabase.from("billing_settings").select("monthly_revenue_target").order("updated_at", { ascending: false }).limit(1),
        supabase.from("fixed_expenses").select("value"),
        // v_custo_pessoal: view com o custo de pessoal agregado por setor.
        // Substitui a leitura direta de "employees", que passou a ser restrita
        // a Admin/Financeiro pelo RLS. Aqui só somamos o total, então o
        // resultado é idêntico ao de antes.
        supabase.from("v_custo_pessoal").select("total_monthly_cost"),
      ]);
      if (!active) return;
      const monthlyRevenue = Number(settingsRes.data?.[0]?.monthly_revenue_target || 0);
      const fixedTotal = (fixedRes.data || []).reduce((s: number, f: any) => s + Number(f.value || 0), 0);
      const empTotal = (empRes.data || []).reduce((s: number, e: any) => s + Number(e.total_monthly_cost || 0), 0);
      if (monthlyRevenue > 0) {
        setGlobalFixedCostRate(Number(((fixedTotal + empTotal) / monthlyRevenue * 100).toFixed(2)));
      }
    };
    load();
    return () => { active = false; };
  }, []);

  // Modal de novo cliente
  const [isClientModalOpen, setIsClientModalOpen] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>("");
  const [newClientPhone, setNewClientPhone] = useState<string>("");

  // Endereço separado em campos, mesmo padrão do painel de Clientes
  // (components/Clients.tsx) — rua/bairro/cidade obrigatórios.
  const [newClientEmail, setNewClientEmail] = useState<string>("");
  const [newClientStreet, setNewClientStreet] = useState<string>("");
  const [newClientNumber, setNewClientNumber] = useState<string>("");
  const [newClientNeighborhood, setNewClientNeighborhood] = useState<string>("");
  const [newClientCity, setNewClientCity] = useState<string>("");
  const [newClientNotes, setNewClientNotes] = useState<string>("");

  // Categoria ativa
  const [activeCategory, setActiveCategory] = useState<
    "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO" | "ACESSORIOS"
  >("GRANITO");

  // ALUMÍNIO
  const [alMaterialId, setAlMaterialId] = useState<string>("");
  const [alVariantName, setAlVariantName] = useState<string>("");
  const [alPieces, setAlPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [alDescription, setAlDescription] = useState<string>("");
  const [isAlGridVisible, setIsAlGridVisible] = useState<boolean>(true);
  const [alSelectedProductId, setAlSelectedProductId] = useState<string>("");
  const [alProductSearch, setAlProductSearch] = useState<string>("");
  const [alWidth, setAlWidth] = useState<number>(0);
  const [alHeight, setAlHeight] = useState<number>(0);
  const [alQuantity, setAlQuantity] = useState<number>(1);
  const [alExtraService, setAlExtraService] = useState<number>(0);
  const [alExtraServiceInput, setAlExtraServiceInput] = useState<string>(formatMoneyInputBR(0));

  // MÁRMORE (produtos do catálogo, categoria "MARMORE")
  const [mrSelectedProductId, setMrSelectedProductId] = useState<string>("");
  const [mrProductSearch, setMrProductSearch] = useState<string>("");
  // Várias medidas (ex.: pia em L = 2 retângulos) somam num único item do
  // orçamento — o cliente vê só o valor final, não uma linha por peça.
  const [mrPieces, setMrPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [mrExtraService, setMrExtraService] = useState<number>(0);
  const [mrExtraServiceInput, setMrExtraServiceInput] = useState<string>(formatMoneyInputBR(0));
  const [mrDescription, setMrDescription] = useState<string>("");
  const [mrSelectedMontagemId, setMrSelectedMontagemId] = useState<string>("");
  const [mrMontagens, setMrMontagens] = useState<QuoteItemMontagem[]>([]);

  // Acessório de Mármore (categoria "ACESSORIO DE MARMORE" — válvula,
  // mangote, sifão, cuba etc.): igual à Montagem, o valor entra dentro do
  // preço da peça e só aparece no detalhamento interno, nunca pro cliente.
  const [mrSelectedAccessoryId, setMrSelectedAccessoryId] = useState<string>("");
  const [mrAccessoryQty, setMrAccessoryQty] = useState<number>(1);
  const [mrAccessories, setMrAccessories] = useState<
    { id: string; productId: string; name: string; quantity: number; price: number; cost: number }[]
  >([]);

  // ACESSÓRIOS / PRODUTOS PRONTOS (categoria "ACESSORIO DE MOTOR" — produtos
  // soltos, sem fórmula de medida: controles, fechaduras, cremalheiras, etc.)
  const [acSelectedProductId, setAcSelectedProductId] = useState<string>("");
  const [acProductSearch, setAcProductSearch] = useState<string>("");
  const [acQuantity, setAcQuantity] = useState<number>(1);
  const [acExtraService, setAcExtraService] = useState<number>(0);
  const [acExtraServiceInput, setAcExtraServiceInput] = useState<string>(formatMoneyInputBR(0));

  // PORTÃO
  const [poMaterialId, setPoMaterialId] = useState<string>("");
  const [poVariantName, setPoVariantName] = useState<string>("");
  const [poPieces, setPoPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [poDescription, setPoDescription] = useState<string>("");
  const [isPoGridVisible, setIsPoGridVisible] = useState<boolean>(true);

  // VIDROS (builder)
  const [gwSelectedProduct, setGwSelectedProduct] = useState<string>("");
  const [gwGlassTypeId, setGwGlassTypeId] = useState<string>("");
  const [gwProductSearch, setGwProductSearch] = useState<string>("");
  const [gwWidth, setGwWidth] = useState<number>(0);
  const [gwHeight, setGwHeight] = useState<number>(0);
  const [gwTexture, setGwTexture] = useState<string>("Liso");
  const [gwHardwareColor, setGwHardwareColor] = useState<string>("Branco");
  const [gwExtraService, setGwExtraService] = useState<number>(0);
  const [gwExtraServiceInput, setGwExtraServiceInput] = useState<string>(formatMoneyInputBR(0));
  const [gwQuantity, setGwQuantity] = useState<number>(1);

  // ESTRUTURA DE ALUMÍNIO (subtopico dentro da aba Vidros — produtos do
  // catálogo com categoria "ESTRUTURA", mesmo padrão de busca+medidas do
  // vidro, mas sem tipo de vidro/textura/ferragem)
  const [esSelectedProduct, setEsSelectedProduct] = useState<string>("");
  const [esProductSearch, setEsProductSearch] = useState<string>("");
  const [esWidth, setEsWidth] = useState<number>(0);
  const [esHeight, setEsHeight] = useState<number>(0);
  const [esColor, setEsColor] = useState<string>("");
  const [esExtraService, setEsExtraService] = useState<number>(0);
  const [esExtraServiceInput, setEsExtraServiceInput] = useState<string>(formatMoneyInputBR(0));
  const [esQuantity, setEsQuantity] = useState<number>(1);

  // ACESSÓRIO VIDRO (subtopico dentro da aba Vidros, abaixo de Estrutura —
  // produtos do catálogo com categoria "ACESSORIO VIDRO", sem medida, igual
  // ao padrão de Produtos Prontos)
  const [avSelectedProduct, setAvSelectedProduct] = useState<string>("");
  const [avProductSearch, setAvProductSearch] = useState<string>("");
  const [avColor, setAvColor] = useState<string>("");
  const [avExtraService, setAvExtraService] = useState<number>(0);
  const [avExtraServiceInput, setAvExtraServiceInput] = useState<string>(formatMoneyInputBR(0));
  const [avQuantity, setAvQuantity] = useState<number>(1);

 // ---------------------------
  // CORES POR CATEGORIA (BOTÕES)
  // ---------------------------
  const mapCategoryToUsage = (cat: "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO" | "ACESSORIOS") => {
    switch (cat) {
      case "VIDROS":
        return "VIDRO";
      case "ALUMINIO":
        return "ALUMINIO";
      case "PORTAO":
        return "PORTAO";
      case "GRANITO":
        return "MARMORE"; // ou "GRANITO", depende do que você usa no seu cadastro
      case "ACESSORIOS":
        return "ACESSORIO DE MOTOR";
      default:
        return "OUTROS";
    }
  };

  const getColorsByCategory = (): string[] => {
    const usage = mapCategoryToUsage(activeCategory);

    const colors = rawMaterials
      .filter((m) => {
        const materialUsage = getMaterialUsageCategory(m);
        return materialUsage === usage || materialUsage.includes(usage);
      })
      .flatMap((m) => getMaterialVariants(m).map((cv) => getVariantName(cv)))
      .map((c) => (c || "").trim())
      .filter(Boolean);

 return Array.from(new Set(colors));
  };

  const availableColors = useMemo(() => getColorsByCategory(), [activeCategory, rawMaterials]);

  const marmoreAccessoryProducts = useMemo(() => {
    return products.filter((p) => normalizeText(p.category || "").includes("ACESSORIO DE MARMORE"));
  }, [products]);

  const glassProducts = useMemo(() => {
    const norm = (v: string) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();

    // Exclui "ACESSORIO VIDRO" e "ESTRUTURA" daqui — cada um tem seu próprio
    // subtópico logo abaixo, senão o mesmo produto apareceria duplicado.
    return products.filter((p) => {
      const cat = norm(p.category || "");
      return cat.includes("VIDRO") && !cat.includes("ACESSORIO") && !cat.includes("ESTRUTURA");
    });
  }, [products]);

  const filteredGlassProducts = useMemo(() => {
    const search = gwProductSearch.trim().toLowerCase();
    if (!search) return glassProducts;
    return glassProducts.filter((p) => p.name.toLowerCase().includes(search));
  }, [glassProducts, gwProductSearch]);

  const estruturaProducts = useMemo(() => {
    const norm = (v: string) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();

    return products.filter((p) => norm(p.category || "").includes("ESTRUTURA"));
  }, [products]);

  const filteredEstruturaProducts = useMemo(() => {
    const search = esProductSearch.trim().toLowerCase();
    if (!search) return estruturaProducts;
    return estruturaProducts.filter((p) => p.name.toLowerCase().includes(search));
  }, [estruturaProducts, esProductSearch]);

  // Cores disponíveis pro produto de estrutura selecionado — vem direto da
  // composição do produto (mesma lógica usada ao editar um item já
  // adicionado), já que essa categoria não usa o mapCategoryToUsage (que é
  // por aba, e a estrutura fica dentro da aba Vidros).
  const esColorOptions = useMemo(() => {
    const product = products.find((p) => p.id === esSelectedProduct);
    if (!product) return [];
    return Array.from(
      new Set(
        product.composition.flatMap((c) => {
          const material = rawMaterials.find((m) => m.id === c.materialId);
          return getMaterialVariants(material).map((cv) => getVariantName(cv));
        })
      )
    ).filter(Boolean) as string[];
  }, [esSelectedProduct, products, rawMaterials]);

  useEffect(() => {
    setEsColor(esColorOptions.length > 0 ? esColorOptions[0] : "");
  }, [esSelectedProduct, esColorOptions]);

  const acessorioVidroProducts = useMemo(() => {
    return products.filter((p) => {
      const norm = normalizeText(p.category || "");
      return norm.includes("ACESSORIO") && norm.includes("VIDRO");
    });
  }, [products]);

  const filteredAcessorioVidroProducts = useMemo(() => {
    const search = avProductSearch.trim().toLowerCase();
    if (!search) return acessorioVidroProducts;
    return acessorioVidroProducts.filter((p) => p.name.toLowerCase().includes(search));
  }, [acessorioVidroProducts, avProductSearch]);

  const avColorOptions = useMemo(() => {
    const product = products.find((p) => p.id === avSelectedProduct);
    if (!product) return [];
    return Array.from(
      new Set(
        product.composition.flatMap((c) => {
          const material = rawMaterials.find((m) => m.id === c.materialId);
          return getMaterialVariants(material).map((cv) => getVariantName(cv));
        })
      )
    ).filter(Boolean) as string[];
  }, [avSelectedProduct, products, rawMaterials]);

  useEffect(() => {
    setAvColor(avColorOptions.length > 0 ? avColorOptions[0] : "");
  }, [avSelectedProduct, avColorOptions]);

  const aluminumProducts = useMemo(() => {
    return products.filter((product) => normalizeText(product.category || "").includes("ALUMINIO"));
  }, [products]);

  const filteredAluminumProducts = useMemo(() => {
    const search = alProductSearch.trim().toLowerCase();
    if (!search) return aluminumProducts;
    return aluminumProducts.filter((product) => product.name.toLowerCase().includes(search));
  }, [alProductSearch, aluminumProducts]);

  // Produtos cadastrados em Produtos com categoria "MARMORE" (ex.: Pia de
  // Cozinha) — é o que aparece pra escolher na aba Mármore do orçamento.
  const marmoreProducts = useMemo(() => {
    return products.filter((product) => normalizeText(product.category || "").includes("MARMORE"));
  }, [products]);

  const filteredMarmoreProducts = useMemo(() => {
    const search = mrProductSearch.trim().toLowerCase();
    if (!search) return marmoreProducts;
    return marmoreProducts.filter((product) => product.name.toLowerCase().includes(search));
  }, [mrProductSearch, marmoreProducts]);

  // Produtos "prontos" (categoria "ACESSORIO DE MOTOR") — controles,
  // fechaduras, cremalheiras, etc. Não têm fórmula por medida, só preço/qtd.
  const accessoryProducts = useMemo(() => {
    return products.filter((product) => normalizeText(product.category || "").includes("ACESSORIO DE MOTOR"));
  }, [products]);

  const filteredAccessoryProducts = useMemo(() => {
    const search = acProductSearch.trim().toLowerCase();
    if (!search) return accessoryProducts;
    return accessoryProducts.filter((product) => product.name.toLowerCase().includes(search));
  }, [acProductSearch, accessoryProducts]);

  const glassTypeOptions = useMemo(() => {
    const uniqueById = new Map<string, InventoryItem>();

    rawMaterials.forEach((material) => {
      if (!isGlassMaterial(material)) return;

      const id = String(material?.id || "");
      if (!id) return;

      if (!uniqueById.has(id)) {
        uniqueById.set(id, material);
      }
    });

    return Array.from(uniqueById.values());
  }, [rawMaterials]);

  const selectedGlassType = useMemo(
    () => glassTypeOptions.find((material) => String(material.id) === gwGlassTypeId),
    [glassTypeOptions, gwGlassTypeId]
  );

  const glassTypeColorOptions = useMemo(() => {
    if (!selectedGlassType) return [];

    const colors = getMaterialVariants(selectedGlassType)
      .map((variant) => getVariantName(variant))
      .filter(Boolean);

    return Array.from(new Set(colors));
  }, [selectedGlassType]);

  const textureOptions = ["Padrão", "Jateado"];

  const getProductColorOptions = (productId: string): string[] => {
    const product = products.find((item) => item.id === productId);
    if (!product) return [];

    const colors = product.composition
      .flatMap((compItem) => {
        const material = rawMaterials.find((materialItem) => materialItem.id === compItem.materialId);
        return getMaterialVariants(material).map((variant) => getVariantName(variant));
      })
      .map((color) => color.trim())
      .filter(Boolean);

    return Array.from(new Set(colors));
  };

  const alColorOptions = useMemo(() => {
    if (!alSelectedProductId) return availableColors;

    const productColors = getProductColorOptions(alSelectedProductId);
    if (productColors.length > 0) return productColors;

    return availableColors;
  }, [alSelectedProductId, availableColors, products, rawMaterials]);

  const mrColorOptions = useMemo(() => {
    if (!mrSelectedProductId) return availableColors;

    const productColors = getProductColorOptions(mrSelectedProductId);
    if (productColors.length > 0) return productColors;

    return availableColors;
  }, [mrSelectedProductId, availableColors, products, rawMaterials]);

  const acColorOptions = useMemo(() => {
    if (!acSelectedProductId) return availableColors;

    const productColors = getProductColorOptions(acSelectedProductId);
    if (productColors.length > 0) return productColors;

    return availableColors;
  }, [acSelectedProductId, availableColors, products, rawMaterials]);

  useEffect(() => {
    if (glassTypeOptions.length === 0) {
      setGwGlassTypeId("");
      return;
    }

    setGwGlassTypeId((prev) =>
      prev && glassTypeOptions.some((material) => String(material.id) === prev)
        ? prev
        : String(glassTypeOptions[0].id)
    );
  }, [glassTypeOptions]);

  useEffect(() => {
    if (aluminumProducts.length === 0) {
      setAlSelectedProductId("");
      return;
    }

    setAlSelectedProductId((prev) =>
      prev && aluminumProducts.some((product) => product.id === prev)
        ? prev
        : aluminumProducts[0].id
    );
  }, [aluminumProducts]);

  useEffect(() => {
    if (marmoreProducts.length === 0) {
      setMrSelectedProductId("");
      return;
    }

    setMrSelectedProductId((prev) =>
      prev && marmoreProducts.some((product) => product.id === prev)
        ? prev
        : marmoreProducts[0].id
    );
  }, [marmoreProducts]);

  useEffect(() => {
    if (accessoryProducts.length === 0) {
      setAcSelectedProductId("");
      return;
    }

    setAcSelectedProductId((prev) =>
      prev && accessoryProducts.some((product) => product.id === prev)
        ? prev
        : accessoryProducts[0].id
    );
  }, [accessoryProducts]);

  useEffect(() => {
    if (
      activeCategory === "VIDROS" ||
      activeCategory === "ALUMINIO" ||
      activeCategory === "GRANITO" ||
      activeCategory === "ACESSORIOS"
    )
      return;

    if (availableColors.length === 0) {
      setSelectedColor("");
      return;
    }

  setSelectedColor((prev) => (prev && availableColors.includes(prev) ? prev : availableColors[0]));
  }, [activeCategory, availableColors]);

  useEffect(() => {
    if (activeCategory !== "VIDROS") return;

    if (glassTypeColorOptions.length === 0) {
      setSelectedColor("");
      return;
    }

    setSelectedColor((prev) =>
      prev && glassTypeColorOptions.includes(prev) ? prev : glassTypeColorOptions[0]
    );
  }, [activeCategory, glassTypeColorOptions]);

  useEffect(() => {
    if (activeCategory !== "ALUMINIO") return;

    if (alColorOptions.length === 0) {
      setSelectedColor("");
      return;
    }

    setSelectedColor((prev) => (prev && alColorOptions.includes(prev) ? prev : alColorOptions[0]));
  }, [activeCategory, alColorOptions]);

  useEffect(() => {
    if (activeCategory !== "GRANITO") return;

    if (mrColorOptions.length === 0) {
      setSelectedColor("");
      return;
    }

    setSelectedColor((prev) => (prev && mrColorOptions.includes(prev) ? prev : mrColorOptions[0]));
  }, [activeCategory, mrColorOptions]);

  useEffect(() => {
    if (activeCategory !== "ACESSORIOS") return;

    if (acColorOptions.length === 0) {
      setSelectedColor("");
      return;
    }

    setSelectedColor((prev) => (prev && acColorOptions.includes(prev) ? prev : acColorOptions[0]));
  }, [activeCategory, acColorOptions]);

  useEffect(() => {
    if (isDeliveryDateManual) return;
    setDeliveryDate(calculateDeliveryDate(date, deliveryLeadDays));
  }, [date, deliveryLeadDays, isDeliveryDateManual]);

  const ensureColorSelected = () => {
    if (!selectedColor) {
      alert("Selecione uma cor antes de adicionar o item.");
      return false;
    }
    return true;
  };
  // ============================
  //       CUSTOS VARIÁVEIS
  // ============================
  const totalVariablePercent = useMemo(() => {
    const safe = Array.isArray(variableExpenses) ? variableExpenses : [];
    return safe
      .filter((e) => e?.type === "percent")
      .reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
  }, [variableExpenses]);

  // Helper para campos de dinheiro
  const handleCurrencyChange =
    (setter: React.Dispatch<React.SetStateAction<number>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/\D/g, "");
      const numberValue = Number(rawValue) / 100;
      setter(numberValue);
    };

  // ============================
  //    CÁLCULO DE PRODUTO PADRÃO
  // ============================
  const calculateItemPrice = (
    productId: string,
    width: number,
    height: number,
    quantity: number,
    color: string,
    glassTypeId?: string,
    hardwareColor?: string
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return { price: 0, cost: 0, materialCost: 0, laborCost: 0 };

    const effectiveWidth = width + (product.widthIncrement || 0);
    const effectiveHeight = height + (product.heightIncrement || 0);

    let rawMaterialCost = 0;
    const materialBreakdown: QuoteItemMaterialLine[] = [];

    product.composition.forEach((compItem) => {
      const material = rawMaterials.find((m) => m.id === compItem.materialId);
      if (!material) return;

      const isGlass = isGlassMaterial(material);
      const costMaterial =
        glassTypeId && isGlass
          ? rawMaterials.find((m) => String(m.id) === glassTypeId) || material
          : material;

      const variants = getMaterialVariants(costMaterial);

      // Vidro usa a cor do vidro; ferragens/acessórios do box usam a cor das
      // ferragens (ex.: Preto) escolhida no assistente. Sem essa separação,
      // a cor do vidro (ex.: Incolor) nunca batia com as variantes de
      // ferragem (Branco/Preto/...) e o cálculo sempre caía na primeira
      // variante cadastrada (Branco), ignorando a cor de ferragem escolhida.
      const colorToMatch = !isGlass && hardwareColor ? hardwareColor : color;

      const colorVariant =
        variants.find((cv) => normalizeText(getVariantName(cv)) === normalizeText(colorToMatch)) ||
        variants[0];

      if (!colorVariant) return;

      const effectiveVariantCost = getEffectiveMaterialUnitCost(
        costMaterial,
        getVariantCost(colorVariant)
      );

      const lineBreakdown = getCompositionLineBreakdown(
        compItem,
        costMaterial,
        effectiveVariantCost,
        effectiveWidth,
        effectiveHeight
      );

      rawMaterialCost += lineBreakdown.totalCost;

      materialBreakdown.push({
        name: costMaterial.name,
        color: getVariantName(colorVariant),
        unit: lineBreakdown.calculationUnit,
        quantity: lineBreakdown.requiredQuantity,
        unitCost: effectiveVariantCost,
        totalCost: lineBreakdown.totalCost,
      });
    });

    const laborBreakdown: QuoteItemLaborLine[] = [];
    const pushLabor = (role: string, count: number, hours: number, rate: number) => {
      if (count > 0 && hours > 0 && rate > 0) {
        laborBreakdown.push({ role, count, hours, rate, total: count * hours * rate });
      }
    };
    pushLabor("Profissional (produção)", Number(product.professionalCount || 0), Number(product.professionalHours || 0), Number(product.professionalRate || 0));
    pushLabor("Ajudante (produção)", Number(product.helperCount || 0), Number(product.helperHours || 0), Number(product.helperRate || 0));
    pushLabor("Profissional (instalação)", Number(product.instProfCount || 0), Number(product.instProfInstHours || 0), Number(product.instProfRate || 0));
    pushLabor("Ajudante (instalação)", Number(product.instHelpCount || 0), Number(product.instHelpInstHours || 0), Number(product.instHelpRate || 0));

    const laborCostUnit = (product.laborCost || 0);
    const totalCostOfGoods = rawMaterialCost + laborCostUnit;

    // Margem por cor: se o produto tiver uma margem específica para a cor
    // escolhida (ex.: inox/madeirado mais barata para compensar o custo do
    // material), usa ela; senão cai na margem geral do produto.
    const colorMarginEntry = product.marginByColor
      ? Object.entries(product.marginByColor).find(
          ([key]) => normalizeText(key) === normalizeText(color)
        )
      : undefined;
    const effectiveMargin = colorMarginEntry ? colorMarginEntry[1] : product.desiredProfitMargin;

    const profitMargin = effectiveMargin / 100;
    const variableCostMargin = totalVariablePercent / 100;
    const fixedRate = Math.min((Number(product.fixedCostRate) > 0 ? Number(product.fixedCostRate) : globalFixedCostRate) / 100, 0.99);
    // Passo 1: absorve custo fixo na base (método planilha Excel)
    const costWithFixed = fixedRate > 0 ? totalCostOfGoods / (1 - fixedRate) : totalCostOfGoods;
    const fixedCostUnit = costWithFixed - totalCostOfGoods;

    // Preço por m² (definido manualmente por cor): pra produtos que variam
    // por área (ex.: chapas de mármore), onde a usuária sabe o preço de
    // venda por metro quadrado daquela cor e quer que o total multiplique
    // pela área da peça, em vez de um valor fixo travado.
    const pricePerSqmEntry = product.pricePerSqmByColor
      ? Object.entries(product.pricePerSqmByColor).find(
          ([key]) => normalizeText(key) === normalizeText(color)
        )
      : undefined;
    const pricePerSqm = Number(pricePerSqmEntry?.[1] ?? 0);

    // Preço final fixo (definido manualmente no cadastro do produto, por
    // cor): quando configurado, substitui todo o cálculo por % + piso de
    // lucro mínimo. Útil para acessórios (ex.: roldana) onde a usuária
    // quer cobrar um valor redondo em vez do resultado quebrado da margem
    // percentual. "fixedSalePrice" (sem cor) é o campo antigo, mantido só
    // como fallback pra produtos que ainda não foram migrados por cor.
    const fixedPriceByColorEntry = product.fixedSalePriceByColor
      ? Object.entries(product.fixedSalePriceByColor).find(
          ([key]) => normalizeText(key) === normalizeText(color)
        )
      : undefined;
    const fixedSalePrice = Number(fixedPriceByColorEntry?.[1] ?? product.fixedSalePrice ?? 0);
    let unitPrice: number;
    if (pricePerSqm > 0) {
      const areaM2 = (effectiveWidth / 1000) * (effectiveHeight / 1000);
      unitPrice = pricePerSqm * areaM2;
    } else if (fixedSalePrice > 0) {
      unitPrice = fixedSalePrice;
    } else {
      // Passo 2: aplica variáveis + lucro sobre o custo absorvido
      const variableAndProfitDivisor = 1 - variableCostMargin - profitMargin;
      unitPrice =
        variableAndProfitDivisor > 0 ? costWithFixed / variableAndProfitDivisor : costWithFixed * 2;

      // Piso de lucro mínimo em R$ por unidade (ex.: portões pequenos onde a
      // % normal gera pouco lucro em reais). Só entra em ação quando o lucro
      // calculado pela margem percentual fica abaixo do mínimo configurado.
      const minProfitValue = Number(product.minProfitValue || 0);
      if (minProfitValue > 0) {
        const profitPerUnit = unitPrice * profitMargin;
        if (profitPerUnit < minProfitValue) {
          const variableDivisor = 1 - variableCostMargin;
          unitPrice =
            variableDivisor > 0 ? (costWithFixed + minProfitValue) / variableDivisor : costWithFixed + minProfitValue;
        }
      }
    }

    return {
      price: unitPrice * quantity,
      cost: totalCostOfGoods * quantity,
      materialCost: rawMaterialCost * quantity,
      laborCost: laborCostUnit * quantity,
      fixedCostValue: fixedCostUnit * quantity,
      materialBreakdown: materialBreakdown.map((line) => ({
        ...line,
        quantity: line.quantity * quantity,
        totalCost: line.totalCost * quantity,
      })),
      laborBreakdown: laborBreakdown.map((line) => ({
        ...line,
        total: line.total * quantity,
      })),
    };
  };

  // Soma o preço de cada medida (peça) lançada para o produto de mármore
  // escolhido — uma pia em L, por exemplo, vira 2 (ou mais) retângulos que
  // são calculados separadamente e somados num único total.
  const getMarmoreCalculations = () => {
    if (!mrSelectedProductId) return null;

    const validPieces = mrPieces.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);
    if (validPieces.length === 0) return null;

    let totalPrice = 0;
    let totalCost = 0;
    let totalMaterialCost = 0;
    let totalLaborCost = 0;
    let totalFixedCostValue = 0;
    let totalAreaM2 = 0;
    const materialMap = new Map<string, QuoteItemMaterialLine>();
    const laborMap = new Map<string, QuoteItemLaborLine>();

    validPieces.forEach((piece) => {
      // piece.length/piece.width já vêm em milímetros.
      const { price, cost, materialCost, laborCost, fixedCostValue, materialBreakdown, laborBreakdown } =
        calculateItemPrice(mrSelectedProductId, piece.width, piece.length, piece.quantity, selectedColor);

      totalPrice += price;
      totalCost += cost;
      totalMaterialCost += materialCost;
      totalLaborCost += laborCost;
      totalFixedCostValue += fixedCostValue;
      totalAreaM2 += (piece.length / 1000) * (piece.width / 1000) * piece.quantity;

      materialBreakdown.forEach((line) => {
        const key = `${line.name}|${line.color}|${line.unit}`;
        const existing = materialMap.get(key);
        if (existing) {
          existing.quantity += line.quantity;
          existing.totalCost += line.totalCost;
        } else {
          materialMap.set(key, { ...line });
        }
      });

      laborBreakdown.forEach((line) => {
        const existing = laborMap.get(line.role);
        if (existing) {
          // Soma a quantidade de pessoas junto com o total — senão o total
          // ficava somado de todas as peças, mas "horas" mostrava só da
          // primeira peça, e pessoas × horas × valor/hora não batia com o
          // total exibido.
          existing.count += line.count;
          existing.total += line.total;
        } else {
          laborMap.set(line.role, { ...line });
        }
      });
    });

    return {
      totalPrice,
      totalCost,
      totalMaterialCost,
      totalLaborCost,
      totalFixedCostValue,
      totalAreaM2,
      materialBreakdown: Array.from(materialMap.values()),
      laborBreakdown: Array.from(laborMap.values()),
    };
  };

  // Valor estimado em tempo real, conforme o usuário digita as medidas —
  // sem isso, só dava pra saber o preço depois de clicar em "Adicionar".
  const mrMontagemTotal = mrMontagens.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const mrAccessoryTotal = mrAccessories.reduce((s, a) => s + (Number(a.price) || 0), 0);

  const mrLivePrice = useMemo(() => {
    const calc = getMarmoreCalculations();
    if (!calc) return null;
    return calc.totalPrice + (Number(mrExtraService) || 0) + mrMontagemTotal + mrAccessoryTotal;
  }, [mrSelectedProductId, mrPieces, selectedColor, mrExtraService, products, rawMaterials, mrMontagemTotal, mrAccessoryTotal]);

  // ============================
const categories = [
  {
    id: "GRANITO" as const,
    label: "Mármore",
    description: "Bancadas, soleiras e degraus em pedra.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </Icon>
    ),
  },
  {
    id: "VIDROS" as const,
    label: "Vidros",
    description: "Sacadas, boxes e esquadrias especiais.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </Icon>
    ),
  },
  {
    id: "ALUMINIO" as const,
    label: "Alumínio",
    description: "Portas, janelas e estruturas em alumínio.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 7h10v10H7z" />
      </Icon>
    ),
  },
  {
    id: "PORTAO" as const,
    label: "Portão",
    description: "Portões de correr, basculantes e especiais.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14" />
        <path d="M17 5v14" />
      </Icon>
    ),
  },
  {
    id: "ACESSORIOS" as const,
    label: "Produtos Prontos",
    description: "Controles, fechaduras, cremalheiras e itens sem medida.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </Icon>
    ),
  }, // <- pode deixar essa vírgula ou remover (tanto faz)
] as const;


  // ============================
  //   FUNÇÕES DE PEÇAS GENÉRICAS
  // ============================
  const addPiece = (setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
    setter([...currentPieces, { id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
  };

  const removePiece = (index: number, setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
    if (currentPieces.length > 1) {
      const newPieces = [...currentPieces];
      newPieces.splice(index, 1);
      setter(newPieces);
    }
  };

  const updatePiece = (
    index: number,
    field: string,
    value: number,
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    currentPieces: any[]
  ) => {
    const newPieces = [...currentPieces];
    newPieces[index][field] = value;
    setter(newPieces);
  };

  // Custo embutido no valor de Instalação (ex.: argamassa, cantoneiras, mão
  // de obra) — sem isso, todo o valor de Instalação era tratado como lucro.
  const addInstallationCostItem = () => {
    setInstallationCostItems((prev) => [
      ...prev,
      { id: Date.now().toString(), name: "", value: 0, valueInput: formatMoneyInputBR(0) },
    ]);
  };

  const removeInstallationCostItem = (id: string) => {
    setInstallationCostItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateInstallationCostItemName = (id: string, name: string) => {
    setInstallationCostItems((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const updateInstallationCostItemValue = (id: string, rawValue: string) => {
    const sanitized = sanitizeMoneyInputBR(rawValue);
    setInstallationCostItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, valueInput: sanitized, value: parseMoneyInputBR(sanitized) } : item
      )
    );
  };

  const applyFreightTotal = (list: typeof freightItems) => {
    const total = list.reduce((sum, item) => sum + item.value, 0);
    setFreight(total);
    setFreightInput(formatMoneyInputBR(total));
  };

  const addFreightItem = () => {
    const rate = freightRates.find((r) => r.id === freightCityId);
    if (!rate) return;
    const commissionRate =
      variableExpenses.find((e) => normalizeText(e.name).includes(normalizeText("comissão")))?.value || 0;
    const taxRate =
      variableExpenses.find(
        (e) =>
          normalizeText(e.name).includes(normalizeText("imposto")) ||
          normalizeText(e.name).includes(normalizeText("simples"))
      )?.value || 0;
    const dvvFrac = (commissionRate + taxRate) / 100;
    const kmRate = freightVehicle === "Moto" ? freightConfig.kmRateMoto : freightConfig.kmRateCar;
    const base = rate.km * kmRate * (1 + freightConfig.markup / 100);
    const saleValue = dvvFrac >= 1 ? base : base / (1 - dvvFrac);

    const newItem = {
      id: Date.now().toString(),
      cityName: rate.city,
      vehicle: freightVehicle,
      km: rate.km,
      value: saleValue,
    };
    const newList = [...freightItems, newItem];
    setFreightItems(newList);
    applyFreightTotal(newList);
  };

  const removeFreightItem = (id: string) => {
    const newList = freightItems.filter((item) => item.id !== id);
    setFreightItems(newList);
    applyFreightTotal(newList);
  };

  const blurInstallationCostItemValue = (id: string) => {
    setInstallationCostItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, valueInput: formatMoneyInputBR(item.value) } : item))
    );
  };

  // Montagem (Mármore): valor fixo somado ao preço da peça, sem o nome
  // aparecer pro cliente — só o insumo (custo) fica visível pro Admin.
  const addMrMontagem = () => {
    if (!mrSelectedMontagemId) return;
    const montagem = montagens.find((m) => m.id === mrSelectedMontagemId);
    if (!montagem) return;
    setMrMontagens((prev) => [
      ...prev,
      { id: `mrm-${Date.now()}`, montagemId: montagem.id, name: montagem.name, price: montagem.price },
    ]);
    setMrSelectedMontagemId("");
  };

  const removeMrMontagem = (id: string) => {
    setMrMontagens((prev) => prev.filter((m) => m.id !== id));
  };

  // Acessório de Mármore: mesmo padrão da Montagem (valor entra no preço da
  // peça, não vira linha separada pro cliente), mas calculado a partir de um
  // produto de verdade (categoria "ACESSORIO DE MARMORE"), não de um valor
  // fixo de catálogo.
  const addMrAccessory = () => {
    if (!mrSelectedAccessoryId) return;
    const product = products.find((p) => p.id === mrSelectedAccessoryId);
    if (!product) return;
    const qty = Math.max(1, Number(mrAccessoryQty) || 1);
    const { price, cost } = calculateItemPrice(mrSelectedAccessoryId, 1, 1, qty, "Padrão");
    setMrAccessories((prev) => [
      ...prev,
      { id: `mra-${Date.now()}`, productId: product.id, name: product.name, quantity: qty, price, cost },
    ]);
    setMrSelectedAccessoryId("");
    setMrAccessoryQty(1);
  };

  const removeMrAccessory = (id: string) => {
    setMrAccessories((prev) => prev.filter((a) => a.id !== id));
  };

  // ============================
  //          GLASS WIZARD
  // ============================
  const handleAddAluminumItem = () => {
    if (!alSelectedProductId) return alert("Selecione um produto de alumínio.");
    if (!alWidth || !alHeight) return alert("Informe altura e largura em milímetros.");
    if (!ensureColorSelected()) return;

    const selectedProduct = products.find((product) => product.id === alSelectedProductId);
    if (!selectedProduct) return;

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, fixedCostValue: baseFixed, materialBreakdown, laborBreakdown } = calculateItemPrice(
      alSelectedProductId,
      alWidth,
      alHeight,
      alQuantity,
      selectedColor
    );

    const totalExtra = (Number(alExtraService) || 0) * alQuantity;
    const finalPrice = basePrice + totalExtra;
    const totalCost = baseCost + totalExtra;

    const description = [
      `Cor do alumínio: ${selectedColor || "Não informado"}`,
      `Acréscimo por serviço: R$ ${Number(alExtraService || 0).toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-aluminum-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor,
      description,
      width: alWidth,
      height: alHeight,
      quantity: alQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown,
      laborBreakdown,
    };

    setItems((prev) => [...prev, newItem]);
  };

  const handleAddMarmoreItem = () => {
    if (!mrSelectedProductId) return alert("Selecione um produto de mármore.");
    if (!ensureColorSelected()) return;

    const selectedProduct = products.find((product) => product.id === mrSelectedProductId);
    if (!selectedProduct) return;

    const calc = getMarmoreCalculations();
    if (!calc) return alert("Adicione medidas válidas.");

    const totalExtra = Number(mrExtraService) || 0;
    const montagemPriceTotal = mrMontagens.reduce((s, m) => s + (Number(m.price) || 0), 0);
    const assemblyBreakdown: QuoteItemAssemblyLine[] = mrMontagens.flatMap((m) => {
      const montagem = montagens.find((mm) => mm.id === m.montagemId);
      const insumoLines = (montagem?.insumos || []).map((insumo) => ({
        montagemName: m.name,
        insumoName: insumo.name,
        value: Number(insumo.value) || 0,
      }));
      const laborLines = (montagem?.labor || []).map((labor) => ({
        montagemName: m.name,
        insumoName: `Mão de obra (${labor.role})`,
        value: Number(labor.total) || 0,
      }));
      return [...insumoLines, ...laborLines];
    });
    const assemblyCost = assemblyBreakdown.reduce((s, l) => s + l.value, 0);
    const accessoryPriceTotal = mrAccessories.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const accessoryCostTotal = mrAccessories.reduce((s, a) => s + (Number(a.cost) || 0), 0);

    const finalPrice = calc.totalPrice + totalExtra + montagemPriceTotal + accessoryPriceTotal;
    const totalCost = calc.totalCost + totalExtra + assemblyCost + accessoryCostTotal;

    const validPieces = mrPieces.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);
    // Só pra equipe ver depois (dentro do sistema) o que foi medido peça a
    // peça — nunca aparece no PDF/impressão que vai pro cliente.
    const detalhamentoLines = validPieces.map(
      (p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length}mm x ${p.width}mm)`
    );
    if (totalExtra > 0) {
      detalhamentoLines.push(`Acréscimo por serviço: R$ ${totalExtra.toFixed(2)}`);
    }
    mrAccessories.forEach((a) => {
      detalhamentoLines.push(`Acessório: ${a.name} (${a.quantity}x) — R$ ${a.price.toFixed(2)}`);
    });
    if (mrDescription.trim()) {
      detalhamentoLines.push(mrDescription.trim());
    }
    const internalDetail = detalhamentoLines.join("\n");

    const description = [
      `Cor: ${selectedColor || "Não informado"}`,
      `Área total: ${calc.totalAreaM2.toFixed(2)} m²`,
      `Acréscimo por serviço: R$ ${totalExtra.toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-marmore-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor,
      description,
      internalDetail: internalDetail || undefined,
      width: 0,
      height: 0,
      quantity: 1,
      price: finalPrice,
      cost: totalCost,
      materialCost: calc.totalMaterialCost,
      laborCost: calc.totalLaborCost,
      fixedCostValue: calc.totalFixedCostValue,
      materialBreakdown: calc.materialBreakdown,
      laborBreakdown: calc.laborBreakdown,
      montagens: mrMontagens.length > 0 ? mrMontagens : undefined,
      assemblyCost: assemblyCost > 0 ? assemblyCost : undefined,
      assemblyBreakdown: assemblyBreakdown.length > 0 ? assemblyBreakdown : undefined,
    };

    setItems((prev) => [...prev, newItem]);
    setMrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
    setMrExtraService(0);
    setMrExtraServiceInput(formatMoneyInputBR(0));
    setMrDescription("");
    setMrMontagens([]);
    setMrSelectedMontagemId("");
    setMrAccessories([]);
    setMrSelectedAccessoryId("");
    setMrAccessoryQty(1);
  };

  // Produto pronto (categoria "ACESSORIO DE MOTOR"): sem medida, preço vem
  // direto da composição/valor fixo cadastrado no produto, só multiplica
  // pela quantidade.
  const handleAddAccessoryItem = () => {
    if (!acSelectedProductId) return alert("Selecione um produto.");
    if (!ensureColorSelected()) return;

    const selectedProduct = products.find((product) => product.id === acSelectedProductId);
    if (!selectedProduct) return;

    const {
      price: basePrice,
      cost: baseCost,
      materialCost: baseMat,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown,
      laborBreakdown,
    } = calculateItemPrice(acSelectedProductId, 1, 1, acQuantity, selectedColor);

    const totalExtra = Number(acExtraService) || 0;
    const finalPrice = basePrice + totalExtra;
    const totalCost = baseCost + totalExtra;

    const description = [
      `Cor: ${selectedColor || "Não informado"}`,
      `Acréscimo por serviço: R$ ${totalExtra.toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-acessorio-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor,
      description,
      width: 0,
      height: 0,
      quantity: acQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown,
      laborBreakdown,
    };

    setItems((prev) => [...prev, newItem]);
    setAcQuantity(1);
    setAcExtraService(0);
    setAcExtraServiceInput(formatMoneyInputBR(0));
  };

  const handleAddGlassItem = () => {
    if (!gwGlassTypeId) return alert("Selecione o tipo de vidro.");
    if (glassTypeColorOptions.length === 0) {
      return alert("O tipo de vidro selecionado não possui cores cadastradas.");
    }
    if (!ensureColorSelected()) return;
    if (!gwSelectedProduct) return alert("Selecione um produto.");
   if (!gwWidth || !gwHeight) return alert("Informe altura e largura em milímetros.");

     const selectedProduct = products.find((p) => p.id === gwSelectedProduct);
    if (!selectedProduct) return;

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, fixedCostValue: baseFixed, materialBreakdown, laborBreakdown } = calculateItemPrice(
      gwSelectedProduct,
      gwWidth,
      gwHeight,
      gwQuantity,
      selectedColor,
      gwGlassTypeId,
      gwHardwareColor
    );

    const areaM2 = (gwWidth * gwHeight) / 1_000_000;
    const jateadoPricePerM2 = Number((selectedGlassType as any)?.jateado_price ?? selectedGlassType?.jateadoPrice ?? 0);
    const isJateado = gwTexture === "Jateado";
    const jateadoCost = isJateado ? jateadoPricePerM2 * areaM2 : 0;
    const jateadoTotalCost = jateadoCost * gwQuantity;

    const extrasPerUnit = jateadoCost + (Number(gwExtraService) || 0);
    const totalExtras = extrasPerUnit * gwQuantity;
    const finalPrice = basePrice + totalExtras;
    const totalCost = baseCost + totalExtras;

    const fullMaterialBreakdown = [...materialBreakdown];
    if (isJateado && jateadoTotalCost > 0) {
      fullMaterialBreakdown.push({
        name: "Jateado",
        color: "Padrão",
        unit: "m²",
        quantity: areaM2 * gwQuantity,
        unitCost: jateadoPricePerM2,
        totalCost: jateadoTotalCost,
      });
    }

   const description = [
      `Tipo de vidro: ${selectedGlassType?.name || "Não informado"}`,
      `Cor do vidro: ${selectedColor || "Não informado"}`,
      `Textura: ${gwTexture || "Padrão"}`,
      `Ferragens: ${gwHardwareColor || "Padrão"}`,
      `Acréscimo por serviço: R$ ${Number(gwExtraService || 0).toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-glass-${Date.now()}`,
      productId: selectedProduct.id,
      productName: isJateado ? `${selectedProduct.name} (Jateado)` : selectedProduct.name,
      selectedColor,
      description,
      width: gwWidth,
      height: gwHeight,
      quantity: gwQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat + jateadoTotalCost,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown: fullMaterialBreakdown,
      laborBreakdown,
    };

    setItems((prev) => [...prev, newItem]);
  };

  const handleAddEstruturaItem = () => {
    if (!esSelectedProduct) return alert("Selecione um produto.");
    if (!esWidth || !esHeight) return alert("Informe altura e largura em milímetros.");
    if (esColorOptions.length > 0 && !esColor) return alert("Selecione a cor.");

    const selectedProduct = products.find((p) => p.id === esSelectedProduct);
    if (!selectedProduct) return;

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, fixedCostValue: baseFixed, materialBreakdown, laborBreakdown } = calculateItemPrice(
      esSelectedProduct,
      esWidth,
      esHeight,
      esQuantity,
      esColor
    );

    const totalExtras = (Number(esExtraService) || 0) * esQuantity;
    const finalPrice = basePrice + totalExtras;
    const totalCost = baseCost + totalExtras;

    const description = [
      `Cor: ${esColor || "Não informado"}`,
      `Acréscimo por serviço: R$ ${Number(esExtraService || 0).toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-estrutura-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor: esColor,
      description,
      width: esWidth,
      height: esHeight,
      quantity: esQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown,
      laborBreakdown,
    };

    setItems((prev) => [...prev, newItem]);
  };

  const handleAddAcessorioVidroItem = () => {
    if (!avSelectedProduct) return alert("Selecione um produto.");
    if (avColorOptions.length > 0 && !avColor) return alert("Selecione a cor.");

    const selectedProduct = products.find((p) => p.id === avSelectedProduct);
    if (!selectedProduct) return;

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, fixedCostValue: baseFixed, materialBreakdown, laborBreakdown } = calculateItemPrice(
      avSelectedProduct,
      1,
      1,
      avQuantity,
      avColor
    );

    const totalExtra = Number(avExtraService) || 0;
    const finalPrice = basePrice + totalExtra;
    const totalCost = baseCost + totalExtra;

    const description = [
      `Cor: ${avColor || "Não informado"}`,
      `Acréscimo por serviço: R$ ${totalExtra.toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-acessoriovidro-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor: avColor,
      description,
      width: 0,
      height: 0,
      quantity: avQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown,
      laborBreakdown,
    };

    setItems((prev) => [...prev, newItem]);
    setAvQuantity(1);
    setAvExtraService(0);
    setAvExtraServiceInput(formatMoneyInputBR(0));
  };

  // ============================
  //     ITENS E TOTAIS GERAIS
  // ============================
  const handleRemoveItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const getGlassTypeIdFromDescription = (description: string): string | undefined => {
    const glassTypeToken = description
      .split("|")
      .map((part) => part.trim())
      .find((part) => normalizeText(part).startsWith("TIPO DE VIDRO:"));

    if (!glassTypeToken) return undefined;

    const [, typeName = ""] = glassTypeToken.split(":");
    const normalizedTypeName = normalizeText(typeName);
    const material = glassTypeOptions.find(
      (glassType) => normalizeText(glassType.name) === normalizedTypeName
    );

    return material ? String(material.id) : undefined;
  };

  const getHardwareColorFromDescription = (description: string): string | undefined => {
    const hardwareToken = description
      .split("|")
      .map((part) => part.trim())
      .find((part) => normalizeText(part).startsWith("FERRAGENS:"));

    if (!hardwareToken) return undefined;

    const [, colorName = ""] = hardwareToken.split(":");
    return colorName.trim() || undefined;
  };

  const handleItemChange = (id: string, field: keyof QuoteItem, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id) return item;

        const updatedItem: QuoteItem = { ...item, [field]: value };

        if (
          field === "productId" ||
          field === "width" ||
          field === "height" ||
          field === "quantity" ||
          field === "selectedColor"
        ) {
          const product = products.find((p) => p.id === updatedItem.productId);
          if (product) {
            if (field === "productId") {
              updatedItem.productName = product.name;
              const availableColors = Array.from(
                new Set(
                  product.composition.flatMap((c) => {
                    const material = rawMaterials.find((m) => m.id === c.materialId);
                    return getMaterialVariants(material).map((cv) => getVariantName(cv));
                  })
                )
              );
              updatedItem.selectedColor = availableColors.length > 0 ? (availableColors[0] as string) : "Padrão";
            }

            const glassTypeId = getGlassTypeIdFromDescription(updatedItem.description);
            const hardwareColor = getHardwareColorFromDescription(updatedItem.description);

            const { price, cost, materialCost, laborCost, fixedCostValue, materialBreakdown, laborBreakdown } = calculateItemPrice(
              updatedItem.productId,
              updatedItem.width,
              updatedItem.height,
              updatedItem.quantity,
              updatedItem.selectedColor,
              glassTypeId,
              hardwareColor
            );
            updatedItem.price = price;
            updatedItem.cost = cost;
            updatedItem.materialCost = materialCost;
            updatedItem.laborCost = laborCost;
            updatedItem.fixedCostValue = fixedCostValue;
            updatedItem.materialBreakdown = materialBreakdown;
            updatedItem.laborBreakdown = laborBreakdown;

          }
        }

        return updatedItem;
      })
    );
  };

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Preço do item já com a fatia proporcional do frete embutida — mesma
  // conta usada no PDF (utils/generateQuotePDF.ts), só que também na tela
  // antes de salvar, pra usuária ver como vai ficar sem precisar imprimir.
  const getDisplayedItemPrice = (item: QuoteItem) => {
    if (!dissolveFreight || freight <= 0 || subtotal <= 0) return item.price;
    const share = item.price / subtotal;
    return item.price + share * freight;
  };

  const totalMaterialCost = items.reduce((sum, item) => sum + (item.materialCost ?? 0), 0);
  const totalLaborCost = items.reduce((sum, item) => sum + (item.laborCost ?? 0), 0);

  // Soma o detalhamento de matéria-prima e mão de obra de todos os itens do
  // orçamento, agrupando linhas repetidas (mesmo material/cor ou mesma função)
  const aggregatedMaterialBreakdown = useMemo(() => {
    const map = new Map<string, QuoteItemMaterialLine>();
    items.forEach((item) => {
      (item.materialBreakdown || []).forEach((line) => {
        const key = `${line.name}|${line.color}|${line.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += line.quantity;
          existing.totalCost += line.totalCost;
        } else {
          map.set(key, { ...line });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [items]);

  const aggregatedLaborBreakdown = useMemo(() => {
    const map = new Map<string, QuoteItemLaborLine>();
    items.forEach((item) => {
      (item.laborBreakdown || []).forEach((line) => {
        const existing = map.get(line.role);
        if (existing) {
          existing.total += line.total;
        } else {
          map.set(line.role, { ...line });
        }
      });
    });
    return Array.from(map.values());
  }, [items]);

  const aggregatedAssemblyBreakdown = useMemo(() => {
    const map = new Map<string, QuoteItemAssemblyLine>();
    items.forEach((item) => {
      (item.assemblyBreakdown || []).forEach((line) => {
        const key = `${line.montagemName}|${line.insumoName}`;
        const existing = map.get(key);
        if (existing) {
          existing.value += line.value;
        } else {
          map.set(key, { ...line });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [items]);

  const totalFixedCostValue = items.reduce(
    (sum, item) =>
      sum + (item.fixedCostValue ?? item.price * (globalFixedCostRate / 100)),
    0
  );

// Valor bruto antes do desconto
const grossTotal = subtotal + freight + installation;

// Desconto
const discountPercent = discountMode === "percent" ? Number(discountInput) || 0 : 0;
const discountFixed  = discountMode === "fixed"   ? discount : 0;

// Os dois modos reduzem o total que o cliente vê — % calcula em cima do
// valor bruto, R$ é abatido direto (limitado ao valor bruto, pra não gerar
// total negativo).
const discountValue  = discountMode === "percent"
  ? grossTotal * (discountPercent / 100)
  : Math.min(discountFixed, grossTotal);

// Base do orçamento (antes da comissão de indicação)
const baseTotal = grossTotal - discountValue;

// Comissão de indicação (% em cima do valor do orçamento)
const referralCommissionValue =
  referralCommissionRate > 0
    ? baseTotal * (referralCommissionRate / 100)
    : 0;

// TOTAL FINAL
const totalPrice = baseTotal + referralCommissionValue;

const totalCostOfGoods =
  items.reduce((sum, item) => sum + item.cost, 0);

// Custo dos insumos de montagem (cantoneira, argamassa etc.) já embutido
// em item.cost acima — aqui é só pra exibir a linha separada no
// detalhamento do Admin, sem descontar de novo.
const totalAssemblyCost = items.reduce((sum, item) => sum + (item.assemblyCost || 0), 0);

// Custo embutido no valor de Instalação (argamassa, cantoneiras, mão de
// obra etc.) — descontado do lucro para o valor de Instalação deixar de
// ser tratado como 100% lucro.
const installationCostTotal = installationCostItems.reduce(
  (sum, item) => sum + (Number(item.value) || 0),
  0
);

// normalizeText remove acentos antes de comparar, para não depender de o
// nome cadastrado no Financeiro ter sido digitado com/sem acentuação
// (ex.: "Comissao vendedoras" sem ç/~ não batia com a busca por "comissão").
const commissionRate =
  variableExpenses.find((e) =>
    normalizeText(e.name).includes(normalizeText("comissão"))
  )?.value || 0;

const taxRate =
  variableExpenses.find(
    (e) =>
      normalizeText(e.name).includes(normalizeText("imposto")) ||
      normalizeText(e.name).includes(normalizeText("simples"))
  )?.value || 0;

const cardRate =
  variableExpenses.find(
    (e) =>
      normalizeText(e.name).includes(normalizeText("maquininha")) ||
      normalizeText(e.name).includes(normalizeText("cartão"))
  )?.value || 0;

// Taxa de cartão reduzida pelo desconto (desconto sempre vem da taxa do cartão)
// % mode: taxa efetiva = cardRate - discountPercent
// R$ mode: valor bruto da taxa - desconto em R$
const effectiveCardRate = discountMode === "percent"
  ? Math.max(0, cardRate - discountPercent)
  : cardRate;

const commissionValue = totalPrice * (commissionRate / 100);
const taxValue = totalPrice * (taxRate / 100);
// Taxa de cartão sempre calculada (visível independente da forma de pagamento),
// sobre o total já com desconto aplicado.
const cardValue = totalPrice * (effectiveCardRate / 100);

// Custo fixo real embutido no preço de cada item (usa o % de custo fixo
// específico do produto, não um % global genérico, para a margem bater
// com a margem mostrada na tela de cadastro do produto)
const fixedCostValue = totalFixedCostValue;
const fixedCostEstimatePercent =
  totalPrice > 0 ? (fixedCostValue / totalPrice) * 100 : 0;

const netProfit =
  totalPrice -
  totalCostOfGoods -
  installationCostTotal -
  commissionValue -
  taxValue -
  cardValue -
  fixedCostValue;

const netProfitMargin =
  totalPrice > 0
    ? (netProfit / totalPrice) * 100
    : 0;

// Formatter shared by admin breakdown and PDF preview
const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── PDF preview computed values ──────────────────────────────────────────
const pdfExtraTotal =
  (savedQuote?.freight || 0) +
  (savedQuote?.installation || 0) +
  (savedQuote?.referralCommissionValue || 0);
const pdfSubtotal = savedQuote?.subtotal || 0;
const dissolvedPDFItems = (savedQuote?.items || []).map((item) => {
  const share = pdfSubtotal > 0 ? (item.price * item.quantity) / pdfSubtotal : 0;
  const extraPerUnit = item.quantity > 0 ? (share * pdfExtraTotal) / item.quantity : 0;
  return { ...item, displayedPrice: item.price + extraPerUnit };
});
const dissolvedSubtotalPDF = dissolvedPDFItems.reduce(
  (s, i) => s + i.displayedPrice * i.quantity,
  0
);
const cleanNotesForPDF = (q: Quote) =>
  [(q as any).measurementNotes || "", (q as any).assemblyNotes || ""]
    .join("\n")
    .split("\n")
    .filter((l) => {
      const u = l.toUpperCase().trim();
      return !u.startsWith("PRAZO DE ENTREGA:") && !u.startsWith("DATA PREVISTA");
    })
    .join("\n")
    .trim();
const cityPDF = cityFromAddress(companySettings.address || "");

  // ============================
  //          SALVAR
  // ============================
const handleSave = () => {
  if (!selectedClientId) return alert("Selecione um cliente.");
  if (items.length === 0) return alert("Adicione pelo menos um item.");
  if (!deliveryDate) return alert("Informe uma data de entrega válida.");
  setShowPDFOptions(true);
};

const buildQuoteObject = (): Quote => {
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const cleanMeasurementNotes = stripDeliveryMetaFromNotes(measurementNotes);
  const finalMeasurementNotes = [
    `Prazo de entrega: ${Math.max(0, Math.floor(Number(deliveryLeadDays) || 0))} dias`,
    `Data prevista de entrega: ${formatDateToBR(deliveryDate)}`,
    cleanMeasurementNotes,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: editingQuote?.id ?? `q${Date.now()}`,
    quoteNumber: editingQuote?.quoteNumber ?? nextQuoteNumber,
    clientId: selectedClientId,
    customerName: selectedClient ? selectedClient.name : "Cliente Desconhecido",
    items,
    subtotal,
    discount: discountValue,
    freight,
    freightItems: freightItems.length > 0 ? freightItems : undefined,
    dissolveFreight,
    installation,
    installationCostItems:
      installationCostItems.length > 0
        ? installationCostItems.map(({ id, name, value }) => ({ id, name, value }))
        : undefined,
    totalPrice,
    paymentMethod,
    assemblyNotes,
    measurementNotes: finalMeasurementNotes,
    date,
    status: editingQuote?.status ?? "Pendente",
    salesperson: editingQuote?.salesperson ?? currentUser.name,
    costOfGoods: totalCostOfGoods,
    fixedCosts: fixedCostValue,
    machineFee: cardValue,
    taxes: taxValue,
    referralCommissionRate,
    referralCommissionValue,
  };
};

const handleConfirmAndSave = async () => {
  localStorage.setItem("quotePDFHidePrice", String(hidePrice));
  localStorage.setItem("quotePDFHideMeasures", String(hideMeasures));
  localStorage.setItem("quotePDFHideDetailedDesc", String(hideDetailedDescription));

  const newQuote = buildQuoteObject();
  setIsSaving(true);
  if (editingQuote && onUpdateQuote) {
    await onUpdateQuote(newQuote);
  } else {
    await onAddQuote(newQuote);
  }
  setIsSaving(false);
  setSavedQuote(newQuote);
  setShowPDFOptions(false);
  setShowPDFPreview(true);
};

const handlePrint = () => {
  if (!window.confirm("As informações do orçamento estão corretas?")) return;
  const style = document.createElement("style");
  style.id = "__quote_print_style__";
  style.innerHTML = `
    @media print {
      body > * { visibility: hidden !important; }
      #quote-print-area, #quote-print-area * { visibility: visible !important; }
      #quote-print-area { position: fixed; left: 0; top: 0; width: 100%; z-index: 9999; }
    }
  `;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => {
    document.getElementById("__quote_print_style__")?.remove();
  }, 1500);
};

const handleSavePDF = async () => {
  if (!savedQuote) return;
  const pdfOptions: PDFOptions = { hidePrice, hideMeasures, hideDetailedDescription };
  const doc = await generateQuotePDF(savedQuote, companySettings, pdfOptions);
  const num = savedQuote.quoteNumber ?? savedQuote.id;
  doc.save(`Orcamento_${num}_${savedQuote.date ?? ""}.pdf`);
};



  const [isSavingClient, setIsSavingClient] = useState(false);

  const handleSaveNewClient = async () => {
    if (!newClientName.trim()) return alert("Nome do cliente é obrigatório.");
    if (!newClientStreet.trim()) return alert("Rua é obrigatória.");
    if (!newClientNeighborhood.trim()) return alert("Bairro é obrigatório.");
    if (!newClientCity.trim()) return alert("Cidade é obrigatória.");

    setIsSavingClient(true);

    // Mesmo padrão do cadastro completo de clientes (components/Clients.tsx):
    // rua/número/bairro/cidade em colunas separadas, mais um texto único
    // (endereço) montado a partir delas pras telas que ainda leem só isso.
    const streetLine = [newClientStreet, newClientNumber].filter((v) => v.trim()).join(", ");
    const locationLine = [newClientNeighborhood, newClientCity].filter((v) => v.trim()).join(" - ");
    const addressCombined = [streetLine, locationLine, newClientNotes ? `Obs: ${newClientNotes}` : ""]
      .filter((v) => v && v.trim())
      .join(" | ");

    const { data: saved, error: saveError } = await supabase
      .from("clients")
      .insert({
        name: newClientName,
        phone: newClientPhone || null,
        email: newClientEmail || null,
        street: newClientStreet,
        number: newClientNumber || null,
        neighborhood: newClientNeighborhood,
        city: newClientCity,
        address: addressCombined || null,
      })
      .select("id")
      .maybeSingle();

    if (saveError) console.error("Erro ao salvar novo cliente:", saveError);

    setIsSavingClient(false);

    // Se o salvamento falhar, o orçamento ainda é gerado com um ID local.
    const clientId = saved ? String((saved as any).id) : `local_${Date.now()}`;
    const newClient: any = {
      id: clientId,
      name: newClientName,
      phone: newClientPhone || undefined,
      email: newClientEmail || undefined,
      notes: newClientNotes || undefined,
      street: newClientStreet,
      number: newClientNumber || undefined,
      neighborhood: newClientNeighborhood,
      city: newClientCity,
      address: addressCombined || undefined,
    };

    onAddNewClient(newClient);
    setSelectedClientId(clientId);

    setIsClientModalOpen(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientEmail("");
    setNewClientStreet("");
    setNewClientNumber("");
    setNewClientNeighborhood("");
    setNewClientCity("");
    setNewClientNotes("");
  };

  // ============================
  //            JSX
  // ============================
  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            {editingQuote ? `Editar Orçamento #${editingQuote.quoteNumber ?? editingQuote.id}` : "Novo Orçamento"}
          </h2>
          <p className="text-sm text-gray-500">
            {editingQuote
              ? "Adicione ou remova itens e salve para atualizar o orçamento."
              : "Preencha os dados do cliente, adicione os itens e salve para gerar o orçamento."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <Icon className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </Icon>
            Voltar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold shadow-md hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Icon className="w-4 h-4">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </Icon>
            {editingQuote ? "Atualizar Orçamento" : "Salvar Orçamento"}
          </button>
        </div>
      </div>

      {/* DADOS DO CLIENTE */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Dados do Cliente e Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Cliente</label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-grow">
                <div className="flex items-center border border-gray-300 rounded-md shadow-sm bg-white px-3 py-2 gap-2">
                  <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setClientDropdownOpen(true);
                      if (!e.target.value) setSelectedClientId("");
                    }}
                    onFocus={() => setClientDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setClientDropdownOpen(false), 150)}
                    className="flex-grow text-sm text-gray-900 outline-none bg-transparent"
                  />
                  {selectedClientId && (
                    <button
                      type="button"
                      onClick={() => { setSelectedClientId(""); setClientSearch(""); }}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {clientDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {clients
                      .filter((c) =>
                        !clientSearch ||
                        normalizeText(c.name).includes(normalizeText(clientSearch))
                      )
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedClientId(c.id);
                            setClientSearch(c.name);
                            setClientDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${
                            c.id === selectedClientId ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-800"
                          }`}
                        >
                          {c.name}
                          {c.phone && <span className="ml-2 text-xs text-gray-400">{c.phone}</span>}
                        </button>
                      ))}
                    {clients.filter((c) =>
                      !clientSearch ||
                      normalizeText(c.name).includes(normalizeText(clientSearch))
                    ).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">Nenhum cliente encontrado</div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsClientModalOpen(true)}
                className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                title="Novo Cliente"
              >
                <Icon className="w-5 h-5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </Icon>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Data da venda</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Prazo de entrega (dias)</label>
            <input
              type="number"
              min={0}
              value={deliveryLeadDays}
              onChange={(e) => {
                setDeliveryLeadDays(Math.max(0, Number(e.target.value) || 0));
                setIsDeliveryDateManual(false);
              }}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Data de entrega</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => {
                setDeliveryDate(e.target.value);
                setIsDeliveryDateManual(true);
              }}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
            {isDeliveryDateManual && (
              <button
                type="button"
                onClick={() => {
                  setIsDeliveryDateManual(false);
                  setDeliveryDate(calculateDeliveryDate(date, deliveryLeadDays));
                }}
                className="mt-1 text-xs text-primary-600 hover:underline"
              >
                Voltar para cálculo automático
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide font-semibold text-blue-700 mb-2">
            Previsão automática de entrega
          </p>
          <p className="text-sm text-gray-700">
            Venda em <b>{formatDateToBR(date)}</b> com prazo de <b>{Math.max(0, deliveryLeadDays)} dias</b>.
          </p>
          <p className="text-base font-semibold text-blue-800 mt-1">
            Entrega prevista para: {formatDateToBR(deliveryDate)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Se cair no fim de semana, o sistema ajusta para o próximo dia útil.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Frete (R$)</label>

            {freightRates.length > 0 && (
              <div className="space-y-1 mb-2">
                <select
                  value={freightCityId}
                  onChange={(e) => setFreightCityId(e.target.value)}
                  className="w-full h-10 px-2 border rounded-md text-sm text-gray-900"
                >
                  <option value="">Local cadastrado...</option>
                  {freightRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.city} ({r.km} km)
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    value={freightVehicle}
                    onChange={(e) => setFreightVehicle(e.target.value as "Carro" | "Moto")}
                    className="flex-1 h-10 px-2 border rounded-md text-sm text-gray-900"
                  >
                    <option value="Carro">Carro</option>
                    <option value="Moto">Moto</option>
                  </select>
                  <button
                    type="button"
                    disabled={!freightCityId}
                    onClick={addFreightItem}
                    className="px-4 h-10 shrink-0 bg-primary-600 text-white text-xs font-bold rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            )}

            {freightItems.length > 0 && (
              <div className="mb-2 space-y-1">
                {freightItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <span className="text-gray-700">
                      {item.cityName} · {item.vehicle} ({item.km} km)
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-gray-800">
                        {item.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFreightItem(item.id)}
                        className="text-gray-400 hover:text-red-600"
                        title="Remover"
                      >
                        <Icon className="w-3.5 h-3.5">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </Icon>
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500">
                  Pode adicionar mais de um (ex.: carro num dia + moto noutro).
                </p>
              </div>
            )}

            <input
              type="text"
              inputMode="decimal"
              value={freightInput}
              onChange={(e) => {
                const rawValue = sanitizeMoneyInputBR(e.target.value);
                setFreightInput(rawValue);
                setFreight(parseMoneyInputBR(rawValue));
              }}
              onBlur={() => setFreightInput(formatMoneyInputBR(freight))}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
            {freight > 0 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={dissolveFreight}
                  onChange={(e) => setDissolveFreight(e.target.checked)}
                />
                Diluir o frete no valor dos produtos (o cliente não vê o frete separado)
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Instalação (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={installationInput}
              onChange={(e) => {
                const rawValue = sanitizeMoneyInputBR(e.target.value);
                setInstallationInput(rawValue);
                setInstallation(parseMoneyInputBR(rawValue));
              }}
              onBlur={() => setInstallationInput(formatMoneyInputBR(installation))}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Comissão de Indicação (%)</label>
            <input
              type="number"
              value={referralCommissionRate}
              onChange={(e) => setReferralCommissionRate(Number(e.target.value) || 0)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
              min={0}
              step="0.01"
              placeholder="Ex: 5"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => {
              setShowAdicionaisSaved(true);
              setTimeout(() => setShowAdicionaisSaved(false), 2500);
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg flex items-center gap-2"
          >
            <Icon className="w-4 h-4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </Icon>
            Salvar Frete / Instalação / Comissão
          </button>
          {showAdicionaisSaved && (
            <span className="text-sm text-green-700 font-semibold">
              Salvo — já vai junto com os produtos no orçamento.
            </span>
          )}
        </div>

        {installation > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-600 uppercase">
                Custo da instalação (opcional)
              </span>
              <button
                type="button"
                onClick={addInstallationCostItem}
                className="text-xs font-semibold text-primary-700 hover:underline"
              >
                + adicionar item
              </button>
            </div>

            {installationCostItems.length === 0 && (
              <p className="text-xs text-gray-400">
                Ex.: argamassa, cantoneiras, mão de obra — para não contar o valor de
                Instalação inteiro como lucro.
              </p>
            )}

            {installationCostItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateInstallationCostItemName(item.id, e.target.value)}
                  placeholder="Ex: Argamassa"
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 text-sm"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.valueInput}
                  onChange={(e) => updateInstallationCostItemValue(item.id, e.target.value)}
                  onBlur={() => blurInstallationCostItemValue(item.id)}
                  className="w-28 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 text-sm text-right"
                />
                <button
                  type="button"
                  onClick={() => removeInstallationCostItem(item.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Remover"
                >
                  <Icon className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </Icon>
                </button>
              </div>
            ))}

            {installationCostItems.length > 0 && (
              <div className="flex justify-between text-xs font-bold text-gray-600 pt-1 border-t border-gray-200">
                <span>Custo total da instalação:</span>
                <span>
                  R${" "}
                  {installationCostTotal.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRODUCT BUILDER + CATEGORIAS EM CARDS */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Selecione o tipo de orçamento</h3>
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Categorias</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  group text-left rounded-xl border px-3 py-3 transition-all
                  flex flex-col gap-1 h-full
                  ${
                    activeCategory === cat.id
                      ? "border-primary-500 bg-primary-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-primary-300 hover:bg-gray-50"
                  }
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`
                        rounded-full p-2 flex items-center justify-center
                        ${
                          activeCategory === cat.id
                            ? "bg-primary-600 text-white"
                            : "bg-gray-100 text-gray-500 group-hover:bg-primary-100 group-hover:text-primary-700"
                        }
                      `}
                    >
                      {cat.icon}
                    </div>
                    <span
                      className={`
                        text-sm font-bold
                        ${activeCategory === cat.id ? "text-primary-700" : "text-gray-800"}
                      `}
                    >
                      {cat.label}
                    </span>
                  </div>

                  {activeCategory === cat.id && (
                    <span className="text-[10px] font-semibold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full">
                      ATIVO
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 mt-1 leading-snug">{cat.description}</p>
              </button>
            ))}
          </div>
        </div>

        {activeCategory === "GRANITO" && (
          <div className="mt-6 space-y-5 border border-blue-100 rounded-xl p-4 bg-blue-50/40">
            {/* 1. PRODUTO — a receita/composição depende de qual produto é */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">
                1. Produto
              </label>
              <input
                type="text"
                value={mrProductSearch}
                onChange={(e) => setMrProductSearch(e.target.value)}
                placeholder="Buscar produto de mármore"
                className="w-full h-11 px-3 border rounded-lg text-gray-900 mb-3"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1">
                {filteredMarmoreProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setMrSelectedProductId(product.id)}
                    className={`p-3 border rounded-lg text-left flex gap-3 items-center ${
                      mrSelectedProductId === product.id
                        ? "border-green-700 bg-green-100"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Sem foto</span>
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${mrSelectedProductId === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                      <p className={`text-xs ${mrSelectedProductId === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Mármore"}</p>
                    </div>
                  </button>
                ))}
              </div>

              {filteredMarmoreProducts.length === 0 && (
                <div className="mt-3 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
                  Nenhum produto de mármore encontrado. Cadastre em Produtos, categoria "Mármore".
                </div>
              )}
            </div>

            {/* 2. COR — define qual chapa/material (e seu custo) será usado */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">2. Cor</label>
              <select
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                disabled={mrColorOptions.length === 0}
                className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
              >
                {mrColorOptions.length === 0 && <option value="">Sem cores cadastradas</option>}
                {mrColorOptions.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. MEDIDA — várias peças somam num único item (ex.: pia em L) */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">3. Medida</label>

              <div className="grid grid-cols-12 gap-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                <div className="col-span-3">Altura (mm)</div>
                <div className="col-span-3">Largura (mm)</div>
                <div className="col-span-2">Qtd</div>
                <div className="col-span-2">M²</div>
                <div className="col-span-2">Valor</div>
              </div>

              {mrPieces.map((piece, index) => {
                const pieceM2 = (piece.length / 1000) * (piece.width / 1000) * piece.quantity;
                const pieceValue =
                  mrSelectedProductId && piece.length > 0 && piece.width > 0
                    ? calculateItemPrice(
                        mrSelectedProductId,
                        piece.width,
                        piece.length,
                        piece.quantity,
                        selectedColor
                      ).price
                    : 0;

                return (
                  <div key={piece.id} className="grid grid-cols-12 gap-2 items-center relative group mb-2">
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={piece.length || ""}
                        onChange={(e) =>
                          updatePiece(index, "length", parseFloat(e.target.value), setMrPieces, mrPieces)
                        }
                        className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                        placeholder="0000"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={piece.width || ""}
                        onChange={(e) =>
                          updatePiece(index, "width", parseFloat(e.target.value), setMrPieces, mrPieces)
                        }
                        className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                        placeholder="0000"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={piece.quantity}
                        onChange={(e) =>
                          updatePiece(index, "quantity", parseInt(e.target.value), setMrPieces, mrPieces)
                        }
                        className="w-full h-10 px-1 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                        min={1}
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="w-full h-10 flex items-center justify-center border rounded-lg bg-primary-600 text-white font-bold border-primary-500 shadow-inner">
                        {pieceM2.toFixed(2)}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="h-10 flex items-center justify-end px-2 rounded-lg bg-primary-700 text-white border border-primary-600 font-bold text-xs sm:text-sm shadow-inner">
                        {pieceValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {mrPieces.length > 1 && (
                      <button
                        onClick={() => removePiece(index, setMrPieces, mrPieces)}
                        className="absolute -right-8 top-2 text-red-500 hover:text-red-700 transition-colors"
                        title="Remover medida"
                      >
                        <Icon className="w-5 h-5">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </Icon>
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end mb-4">
                <button
                  onClick={() => addPiece(setMrPieces, mrPieces)}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-md"
                >
                  + ADICIONAR MEDIDA
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 max-w-xs">
                <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                  Acréscimo (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={mrExtraServiceInput}
                  onChange={(e) => {
                    const rawValue = sanitizeMoneyInputBR(e.target.value);
                    setMrExtraServiceInput(rawValue);
                    setMrExtraService(parseMoneyInputBR(rawValue));
                  }}
                  onBlur={() => setMrExtraServiceInput(formatMoneyInputBR(mrExtraService))}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">4. Montagem</label>
              <div className="flex gap-2">
                <select
                  value={mrSelectedMontagemId}
                  onChange={(e) => setMrSelectedMontagemId(e.target.value)}
                  className="flex-1 h-11 px-3 border rounded-lg text-gray-900"
                >
                  <option value="">Selecione uma montagem (opcional)</option>
                  {montagens.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — R$ {m.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addMrMontagem}
                  disabled={!mrSelectedMontagemId}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  + Adicionar
                </button>
              </div>

              {mrMontagens.length > 0 && (
                <div className="mt-2 space-y-1">
                  {mrMontagens.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-gray-700">{m.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          R$ {m.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMrMontagem(m.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Remover"
                        >
                          <Icon className="w-4 h-4">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </Icon>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold text-gray-500 pt-1">
                    <span>Total montagem (soma no valor da peça):</span>
                    <span>
                      R${" "}
                      {mrMontagemTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                O valor da montagem entra dentro do valor da peça — o cliente não vê esse nome.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">5. Acessório de Mármore</label>
              <div className="flex gap-2">
                <select
                  value={mrSelectedAccessoryId}
                  onChange={(e) => setMrSelectedAccessoryId(e.target.value)}
                  className="flex-1 h-11 px-3 border rounded-lg text-gray-900"
                >
                  <option value="">Selecione um acessório (opcional)</option>
                  {marmoreAccessoryProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={mrAccessoryQty}
                  onChange={(e) => setMrAccessoryQty(Number(e.target.value) || 1)}
                  className="w-20 h-11 px-3 border rounded-lg text-gray-900"
                />
                <button
                  type="button"
                  onClick={addMrAccessory}
                  disabled={!mrSelectedAccessoryId}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  + Adicionar
                </button>
              </div>

              {marmoreAccessoryProducts.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Nenhum produto cadastrado com a categoria "Acessório de Mármore" ainda. Cadastre em Produtos.
                </p>
              )}

              {mrAccessories.length > 0 && (
                <div className="mt-2 space-y-1">
                  {mrAccessories.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-gray-700">{a.name} ({a.quantity}x)</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          R$ {a.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMrAccessory(a.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Remover"
                        >
                          <Icon className="w-4 h-4">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </Icon>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold text-gray-500 pt-1">
                    <span>Total acessórios (soma no valor da peça):</span>
                    <span>
                      R${" "}
                      {mrAccessoryTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                O valor do acessório entra dentro do valor da peça — aparece só no detalhamento interno, o cliente não vê separado.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Descrição</label>
              <textarea
                value={mrDescription}
                onChange={(e) => setMrDescription(e.target.value)}
                placeholder="Observações sobre a peça (opcional)"
                rows={3}
                className="w-full px-3 py-2 border rounded-lg text-gray-900"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-white px-4 py-3">
              <span className="text-sm font-semibold text-gray-600 uppercase">Valor estimado (total)</span>
              <span className="text-xl font-bold text-primary-700">
                {mrLivePrice !== null
                  ? `R$ ${mrLivePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "Informe as medidas"}
              </span>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddMarmoreItem}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                Adicionar produto de mármore
              </button>
            </div>
          </div>
        )}

        {activeCategory === "ACESSORIOS" && (
          <div className="mt-6 space-y-5 border border-blue-100 rounded-xl p-4 bg-blue-50/40">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">
                Buscar produto
              </label>
              <input
                type="text"
                value={acProductSearch}
                onChange={(e) => setAcProductSearch(e.target.value)}
                placeholder="Digite o nome do produto (controle, fechadura, cremalheira...)"
                className="w-full h-11 px-3 border rounded-lg text-gray-900 mb-3"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1">
                {filteredAccessoryProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setAcSelectedProductId(product.id)}
                    className={`p-3 border rounded-lg text-left flex gap-3 items-center ${
                      acSelectedProductId === product.id
                        ? "border-green-700 bg-green-100"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Sem foto</span>
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${acSelectedProductId === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                      <p className={`text-xs ${acSelectedProductId === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Produto pronto"}</p>
                    </div>
                  </button>
                ))}
              </div>

              {filteredAccessoryProducts.length === 0 && (
                <div className="mt-3 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
                  Nenhum produto encontrado. Cadastre em Produtos, categoria "Acessório de Motor".
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor</label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  disabled={acColorOptions.length === 0}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {acColorOptions.length === 0 && <option value="">Sem cores cadastradas</option>}
                  {acColorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  value={acQuantity}
                  onChange={(e) => setAcQuantity(Number(e.target.value) || 1)}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Acréscimo (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={acExtraServiceInput}
                  onChange={(e) => {
                    const rawValue = sanitizeMoneyInputBR(e.target.value);
                    setAcExtraServiceInput(rawValue);
                    setAcExtraService(parseMoneyInputBR(rawValue));
                  }}
                  onBlur={() => setAcExtraServiceInput(formatMoneyInputBR(acExtraService))}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddAccessoryItem}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                Adicionar produto
              </button>
            </div>
          </div>
        )}

        {activeCategory === "ALUMINIO" && (
          <div className="mt-6 space-y-5 border border-blue-100 rounded-xl p-4 bg-blue-50/40">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Buscar Produto</label>
                <input
                  type="text"
                  value={alProductSearch}
                  onChange={(e) => setAlProductSearch(e.target.value)}
                  placeholder="Digite o nome do produto de alumínio"
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Altura (mm)</label>
                  <input
                    type="number"
                    value={alHeight || ""}
                    placeholder="0000"
                    onChange={(e) => setAlHeight(Number(e.target.value) || 0)}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Largura (mm)</label>
                  <input
                    type="number"
                    value={alWidth || ""}
                    placeholder="0000"
                    onChange={(e) => setAlWidth(Number(e.target.value) || 0)}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1">
              {filteredAluminumProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setAlSelectedProductId(product.id)}
                  className={`p-3 border rounded-lg text-left flex gap-3 items-center ${
                    alSelectedProductId === product.id
                      ? "border-green-700 bg-green-100"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">Sem foto</span>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${alSelectedProductId === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                    <p className={`text-xs ${alSelectedProductId === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Alumínio"}</p>
                  </div>
                </button>
              ))}
            </div>

            {filteredAluminumProducts.length === 0 && (
              <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
                Nenhum produto de alumínio encontrado.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor do Produto</label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  disabled={alColorOptions.length === 0}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {alColorOptions.length === 0 && <option value="">Sem cores cadastradas</option>}
                  {alColorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  value={alQuantity}
                  onChange={(e) => setAlQuantity(Number(e.target.value) || 1)}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Acréscimo (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={alExtraServiceInput}
                  onChange={(e) => {
                    const rawValue = sanitizeMoneyInputBR(e.target.value);
                    setAlExtraServiceInput(rawValue);
                    setAlExtraService(parseMoneyInputBR(rawValue));
                  }}
                  onBlur={() => setAlExtraServiceInput(formatMoneyInputBR(alExtraService))}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddAluminumItem}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                Adicionar produto de alumínio
              </button>
            </div>
          </div>
        )}

{activeCategory === "PORTAO" && (
  <div className="mt-6">
    <label className="block text-xs font-bold text-gray-600 mb-2 uppercase">
      Escolha a Cor *
    </label>

    <div className="flex flex-wrap gap-2">
      {availableColors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => setSelectedColor(color)}
          className={`
            px-4 py-2 rounded-lg border text-sm font-semibold transition-all
            ${
              selectedColor === color
                ? "bg-primary-600 text-white border-primary-600 shadow-md scale-105"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
            }
          `}
        >
          {color}
        </button>
      ))}
    </div>

    {!selectedColor && (
      <p className="text-xs text-red-500 mt-2">
        A cor é obrigatória.
      </p>
    )}
  </div>
)}

 {activeCategory === "VIDROS" && (
          <div className="mt-6 space-y-5 border border-blue-100 rounded-xl p-4 bg-blue-50/40">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Buscar Produto</label>
                <input
                  type="text"
                  value={gwProductSearch}
                  onChange={(e) => setGwProductSearch(e.target.value)}
                  placeholder="Digite o nome do produto"
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Altura (mm)</label>
                  <input type="number" value={gwHeight || ""} placeholder="0000" onChange={(e) => setGwHeight(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Largura (mm)</label>
                  <input type="number" value={gwWidth || ""} placeholder="0000" onChange={(e) => setGwWidth(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1">
              {filteredGlassProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setGwSelectedProduct(product.id)}
                  className={`p-3 border rounded-lg text-left flex gap-3 items-center ${gwSelectedProduct === product.id ? "border-green-700 bg-green-100" : "border-gray-200 bg-white"}`}
                >
                  <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">Sem foto</span>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${gwSelectedProduct === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                    <p className={`text-xs ${gwSelectedProduct === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Vidros"}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Tipo de Vidro</label>
                <select
                  value={gwGlassTypeId}
                  onChange={(e) => setGwGlassTypeId(e.target.value)}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                >
                  <option value="">Selecione</option>
                  {glassTypeOptions.map((glassType) => (
                    <option key={glassType.id} value={String(glassType.id)}>
                      {glassType.name}
                    </option>
                  ))}
                </select>
                {glassTypeOptions.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Cadastre tipos de vidro na matéria-prima para liberar este campo.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor do Vidro</label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  disabled={!gwGlassTypeId || glassTypeColorOptions.length === 0}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {!gwGlassTypeId && <option value="">Selecione o tipo primeiro</option>}
                  {glassTypeColorOptions.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                {gwGlassTypeId && glassTypeColorOptions.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Este tipo de vidro não tem cores cadastradas.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Textura</label>
                <select value={gwTexture} onChange={(e) => setGwTexture(e.target.value)} className="w-full h-11 px-3 border rounded-lg text-gray-900">
                  {textureOptions.map((texture) => (
                    <option key={texture} value={texture}>{texture}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor das Ferragens</label>
                <select value={gwHardwareColor} onChange={(e) => setGwHardwareColor(e.target.value)} className="w-full h-11 px-3 border rounded-lg text-gray-900">
                  {HARDWARE_COLORS.map((h) => (
                    <option key={h.id} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Acréscimo (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={gwExtraServiceInput}
                  onChange={(e) => {
                    const rawValue = sanitizeMoneyInputBR(e.target.value);
                    setGwExtraServiceInput(rawValue);
                    setGwExtraService(parseMoneyInputBR(rawValue));
                  }}
                  onBlur={() => setGwExtraServiceInput(formatMoneyInputBR(gwExtraService))}
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Quantidade</label>
                <input type="number" min={1} value={gwQuantity} onChange={(e) => setGwQuantity(Number(e.target.value) || 1)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddGlassItem}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                Adicionar produto de vidro
              </button>
            </div>

            <div className="pt-5 border-t border-blue-100">
              <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">Estrutura de Alumínio</h4>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Buscar Produto</label>
                  <input
                    type="text"
                    value={esProductSearch}
                    onChange={(e) => setEsProductSearch(e.target.value)}
                    placeholder="Digite o nome do produto"
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Altura (mm)</label>
                    <input type="number" value={esHeight || ""} placeholder="0000" onChange={(e) => setEsHeight(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Largura (mm)</label>
                    <input type="number" value={esWidth || ""} placeholder="0000" onChange={(e) => setEsWidth(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                  </div>
                </div>
              </div>

              {estruturaProducts.length === 0 ? (
                <p className="text-xs text-gray-500 mt-3">
                  Nenhum produto cadastrado com a categoria "Estrutura" ainda. Cadastre em Produtos.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1 mt-3">
                  {filteredEstruturaProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setEsSelectedProduct(product.id)}
                      className={`p-3 border rounded-lg text-left flex gap-3 items-center ${esSelectedProduct === product.id ? "border-green-700 bg-green-100" : "border-gray-200 bg-white"}`}
                    >
                      <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-400">Sem foto</span>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${esSelectedProduct === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                        <p className={`text-xs ${esSelectedProduct === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Estrutura"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor</label>
                  <select
                    value={esColor}
                    onChange={(e) => setEsColor(e.target.value)}
                    disabled={esColorOptions.length === 0}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {esColorOptions.length === 0 && <option value="">Sem cor cadastrada</option>}
                    {esColorOptions.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Acréscimo (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={esExtraServiceInput}
                    onChange={(e) => {
                      const rawValue = sanitizeMoneyInputBR(e.target.value);
                      setEsExtraServiceInput(rawValue);
                      setEsExtraService(parseMoneyInputBR(rawValue));
                    }}
                    onBlur={() => setEsExtraServiceInput(formatMoneyInputBR(esExtraService))}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Quantidade</label>
                  <input type="number" min={1} value={esQuantity} onChange={(e) => setEsQuantity(Number(e.target.value) || 1)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={handleAddEstruturaItem}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
                >
                  Adicionar estrutura de alumínio
                </button>
              </div>
            </div>

            <div className="pt-5 border-t border-blue-100">
              <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">Acessório Vidro</h4>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Buscar Produto</label>
                <input
                  type="text"
                  value={avProductSearch}
                  onChange={(e) => setAvProductSearch(e.target.value)}
                  placeholder="Digite o nome do produto"
                  className="w-full h-11 px-3 border rounded-lg text-gray-900"
                />
              </div>

              {acessorioVidroProducts.length === 0 ? (
                <p className="text-xs text-gray-500 mt-3">
                  Nenhum produto cadastrado com a categoria "Acessório Vidro" ainda. Cadastre em Produtos.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1 mt-3">
                  {filteredAcessorioVidroProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setAvSelectedProduct(product.id)}
                      className={`p-3 border rounded-lg text-left flex gap-3 items-center ${avSelectedProduct === product.id ? "border-green-700 bg-green-100" : "border-gray-200 bg-white"}`}
                    >
                      <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-400">Sem foto</span>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${avSelectedProduct === product.id ? "text-blue-900" : "text-gray-800"}`}>{product.name}</p>
                        <p className={`text-xs ${avSelectedProduct === product.id ? "text-blue-700" : "text-gray-500"}`}>{product.category || "Acessório Vidro"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Cor</label>
                  <select
                    value={avColor}
                    onChange={(e) => setAvColor(e.target.value)}
                    disabled={avColorOptions.length === 0}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {avColorOptions.length === 0 && <option value="">Sem cor cadastrada</option>}
                    {avColorOptions.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Acréscimo (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={avExtraServiceInput}
                    onChange={(e) => {
                      const rawValue = sanitizeMoneyInputBR(e.target.value);
                      setAvExtraServiceInput(rawValue);
                      setAvExtraService(parseMoneyInputBR(rawValue));
                    }}
                    onBlur={() => setAvExtraServiceInput(formatMoneyInputBR(avExtraService))}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Quantidade</label>
                  <input type="number" min={1} value={avQuantity} onChange={(e) => setAvQuantity(Number(e.target.value) || 1)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={handleAddAcessorioVidroItem}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
                >
                  Adicionar acessório vidro
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
        
      {/* Lista de itens adicionados */}
      {items.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Itens do Orçamento</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">Cor</th>
                  <th className="px-3 py-2 text-center">Alt. (mm)</th>
                  <th className="px-3 py-2 text-center">Larg. (mm)</th>
                  <th className="px-3 py-2 text-center">Qtd</th>
                  <th className="px-3 py-2 text-right">
                    Valor
                    {dissolveFreight && freight > 0 && (
                      <span className="block normal-case font-normal text-[10px] text-gray-400">com frete</span>
                    )}
                  </th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) =>
                  editingItemId === item.id ? (
                    <tr key={item.id} className="border-t bg-blue-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{item.productName}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.selectedColor}
                          onChange={(e) => handleItemChange(item.id, "selectedColor", e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-sm text-gray-900"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.height}
                          onChange={(e) => handleItemChange(item.id, "height", Number(e.target.value) || 0)}
                          className="w-20 border rounded px-2 py-1 text-sm text-gray-900 text-center"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.width}
                          onChange={(e) => handleItemChange(item.id, "width", Number(e.target.value) || 0)}
                          className="w-20 border rounded px-2 py-1 text-sm text-gray-900 text-center"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value) || 1)}
                          className="w-16 border rounded px-2 py-1 text-sm text-gray-900 text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        R$ {getDisplayedItemPrice(item).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setEditingItemId(null)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700"
                        >
                          OK
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{item.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{item.selectedColor || "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.height || "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.width || "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        R$ {getDisplayedItemPrice(item).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingItemId(item.id)}
                          className="px-2 py-1 border border-blue-200 text-blue-700 rounded text-xs hover:bg-blue-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="px-2 py-1 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3 border-t pt-3 text-sm text-gray-700 font-semibold">
            Subtotal: R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* Totais e forma de pagamento */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        {/* Resumo de adicionais — visível para todos */}
        {(freight > 0 || installation > 0 || referralCommissionRate > 0) && (
          <div className="mb-4 space-y-1 text-sm text-gray-700 border-b pb-4">
            {freight > 0 && (
              <div className="flex justify-between">
                <span>Subtotal itens:</span>
                <span>R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {freight > 0 && (
              <div className="flex justify-between">
                <span>Frete:</span>
                <span>R$ {freight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {installation > 0 && (
              <div className="flex justify-between">
                <span>Instalação:</span>
                <span>R$ {installation.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {referralCommissionRate > 0 && (
              <div className="flex justify-between">
                <span>Comissão de Indicação ({referralCommissionRate}%):</span>
                <span>R$ {referralCommissionValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <div className="w-full max-w-xs space-y-2">
            {/* Subtotal bruto */}
            {discountValue > 0 && (
              <div className="flex justify-between text-gray-600 text-sm">
                <span>Subtotal:</span>
                <span>R$ {grossTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}

            {/* Campo de desconto */}
            <div className="border border-gray-200 rounded-lg p-3 mt-2 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Desconto</span>
                <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
                  <button
                    type="button"
                    onClick={() => { setDiscountMode("percent"); setDiscountInput("0"); setDiscount(0); setDiscountFixedInput(formatMoneyInputBR(0)); }}
                    className={`px-3 py-1 font-semibold ${discountMode === "percent" ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDiscountMode("fixed"); setDiscountInput("0"); setDiscount(0); setDiscountFixedInput(formatMoneyInputBR(0)); }}
                    className={`px-3 py-1 font-semibold ${discountMode === "fixed" ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                  >
                    R$
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {discountMode === "percent" ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
                      placeholder="Ex: 5"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountFixedInput}
                      onChange={(e) => {
                        const raw = sanitizeMoneyInputBR(e.target.value);
                        setDiscountFixedInput(raw);
                        setDiscount(parseMoneyInputBR(raw));
                      }}
                      onBlur={() => setDiscountFixedInput(formatMoneyInputBR(discount))}
                      className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
                      placeholder="Ex: 300,00"
                    />
                    <span className="text-sm text-gray-500">R$</span>
                  </>
                )}
                {discountValue > 0 && (
                  <span className="text-sm text-green-700 font-medium ml-auto">
                    - R$ {discountValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              {discountMode === "percent" && discountPercent > 0 && (
                <p className="text-xs text-gray-500">
                  Taxa de cartão: {cardRate}% − {discountPercent}% desc. = {effectiveCardRate.toFixed(2)}% efetivo
                </p>
              )}
            </div>

            {/* Linha do total */}
            <div className={`flex justify-between font-bold text-lg border-t pt-2 ${discountValue > 0 ? "text-green-700" : "text-gray-900"}`}>
              <span>{discountValue > 0 ? "TOTAL COM DESCONTO" : "TOTAL"}</span>
              <span>
                R$ {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="text-xs text-gray-500 mt-1">
              Forma de Pagamento:
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Quote["paymentMethod"])}
                className="ml-1 p-1 border rounded bg-primary-600 text-white border-primary-500"
              >
                <option value="A Definir" className="bg-white text-gray-900">
                  A Definir
                </option>
                <option value="PIX" className="bg-white text-gray-900">
                  PIX
                </option>
                <option value="Cartão" className="bg-white text-gray-900">
                  Cartão
                </option>
                <option value="Dinheiro" className="bg-white text-gray-900">
                  Dinheiro
                </option>
              </select>
            </div>
          </div>
        </div>

        {currentUser.role === "Admin" && items.length > 0 && (() => {
          const variableCosts = commissionValue + taxValue + cardValue + referralCommissionValue;
          const contribuicao = totalPrice - totalCostOfGoods - installationCostTotal - variableCosts;
          const contribuicaoPct = totalPrice > 0 ? (contribuicao / totalPrice) * 100 : 0;

          // Descobre a categoria de um item pelo produto do catálogo (mesma
          // lógica usada em Entregas por setor); itens de chapa cortada direto
          // da matéria-prima (sem productId de catálogo) caem no fallback pelo
          // prefixo do id, que já indica de qual aba do orçamento vieram.
          const getItemCategoryKey = (item: QuoteItem): "MARMORE" | "VIDRO" | "ALUMINIO" | "ACESSORIOS" | null => {
            const product = products.find((p) => p.id === item.productId);
            const cat = normalizeText(product?.category || "");
            if (cat.includes("MARMORE")) return "MARMORE";
            if (cat.includes("VIDRO")) return "VIDRO";
            if (cat.includes("ALUMINIO")) return "ALUMINIO";
            if (cat.includes("ACESSORIO DE MOTOR") || cat.includes("MOTOR RESIDENCIAL")) return "ACESSORIOS";

            if (item.id.startsWith("qi-granito-") || item.id.startsWith("qi-marmore-")) return "MARMORE";
            if (item.id.startsWith("qi-glass-")) return "VIDRO";
            if (item.id.startsWith("qi-aluminum-") || item.id.startsWith("qi-portao-")) return "ALUMINIO";
            if (item.id.startsWith("qi-acessorio-")) return "ACESSORIOS";
            return null;
          };

          const CATEGORY_LABELS = {
            MARMORE: "Mármore",
            VIDRO: "Vidro",
            ALUMINIO: "Alumínio",
            ACESSORIOS: "Acessórios",
          } as const;

          // Agrupa os itens por categoria e recalcula a mesma cascata
          // (matéria-prima -> CMV -> impostos/comissão/taxa -> lucro) só com a
          // fatia daquela categoria. Custos proporcionais ao preço (impostos,
          // comissão, taxa de cartão, desconto, comissão de indicação) são
          // rateados pela participação da categoria no subtotal do orçamento.
          const buckets: Record<string, QuoteItem[]> = {};
          items.forEach((item) => {
            const key = getItemCategoryKey(item);
            if (!key) return;
            (buckets[key] = buckets[key] || []).push(item);
          });

          const categoryBreakdowns = (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[])
            .filter((key) => (buckets[key]?.length || 0) > 0)
            .map((key) => {
              const catItems = buckets[key];
              const categoryPrice = catItems.reduce((s, i) => s + i.price, 0);
              const share = subtotal > 0 ? categoryPrice / subtotal : 0;

              const materialCost = catItems.reduce((s, i) => s + (i.materialCost ?? 0), 0);
              const laborCost = catItems.reduce((s, i) => s + (i.laborCost ?? 0), 0);
              const costOfGoods = catItems.reduce((s, i) => s + i.cost, 0);
              const assemblyCost = catItems.reduce((s, i) => s + (i.assemblyCost ?? 0), 0);
              const fixedCostValue = catItems.reduce(
                (s, i) => s + (i.fixedCostValue ?? i.price * (globalFixedCostRate / 100)),
                0
              );

              const catTotalPrice = share * totalPrice;
              const catCommissionValue = share * commissionValue;
              const catTaxValue = share * taxValue;
              const catCardValue = share * cardValue;
              const catDiscountValue = share * discountValue;
              const catReferralCommissionValue = share * referralCommissionValue;

              const catNetProfit =
                catTotalPrice - costOfGoods - catCommissionValue - catTaxValue - catCardValue - fixedCostValue;
              const catNetProfitMargin = catTotalPrice > 0 ? (catNetProfit / catTotalPrice) * 100 : 0;

              const catVariableCosts = catCommissionValue + catTaxValue + catCardValue + catReferralCommissionValue;
              const catContribuicao = catTotalPrice - costOfGoods - catVariableCosts;
              const catContribuicaoPct = catTotalPrice > 0 ? (catContribuicao / catTotalPrice) * 100 : 0;

              return {
                key,
                label: CATEGORY_LABELS[key],
                materialCost,
                laborCost,
                costOfGoods,
                installationCost: 0,
                assemblyCost,
                taxValue: catTaxValue,
                commissionValue: catCommissionValue,
                discountValue: catDiscountValue,
                cardValue: catCardValue,
                fixedCostValue,
                fixedCostPercent: catTotalPrice > 0 ? (fixedCostValue / catTotalPrice) * 100 : 0,
                referralCommissionValue: catReferralCommissionValue,
                totalPrice: catTotalPrice,
                netProfit: catNetProfit,
                netProfitMargin: catNetProfitMargin,
                contribuicao: catContribuicao,
                contribuicaoPct: catContribuicaoPct,
              };
            });

          type PanelData = {
            materialCost: number;
            laborCost: number;
            costOfGoods: number;
            installationCost: number;
            assemblyCost: number;
            taxValue: number;
            commissionValue: number;
            discountValue: number;
            cardValue: number;
            fixedCostValue: number;
            fixedCostPercent: number;
            referralCommissionValue: number;
            totalPrice: number;
            netProfit: number;
            netProfitMargin: number;
            contribuicao: number;
            contribuicaoPct: number;
          };

          const renderPanel = (title: string, data: PanelData, withDetailLinks: boolean) => (
            <div
              key={title}
              className="flex-1 min-w-[280px] border-l-4 border-yellow-400 bg-yellow-50 p-5 rounded-r-lg shadow-sm"
            >
              <h4 className="text-md font-semibold text-yellow-800 mb-4">{title}</h4>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span className="flex items-center gap-2">
                    Custo matéria-prima:
                    {withDetailLinks && aggregatedMaterialBreakdown.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowMaterialDetail(true)}
                        className="text-xs text-primary-700 underline hover:text-primary-900"
                      >
                        ver detalhamento
                      </button>
                    )}
                  </span>
                  <span className="font-medium">R$ {fmt(data.materialCost)}</span>
                </div>
                {data.laborCost > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span className="flex items-center gap-2">
                      Mão de obra:
                      {withDetailLinks && aggregatedLaborBreakdown.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowLaborDetail(true)}
                          className="text-xs text-primary-700 underline hover:text-primary-900"
                        >
                          ver detalhamento
                        </button>
                      )}
                    </span>
                    <span className="font-medium">R$ {fmt(data.laborCost)}</span>
                  </div>
                )}
                {data.assemblyCost > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span className="flex items-center gap-2">
                      Custo de montagem:
                      {withDetailLinks && aggregatedAssemblyBreakdown.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAssemblyDetail(true)}
                          className="text-xs text-primary-700 underline hover:text-primary-900"
                        >
                          ver detalhamento
                        </button>
                      )}
                    </span>
                    <span className="font-medium">R$ {fmt(data.assemblyCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-800 font-semibold border-t border-yellow-300 pt-1 mt-1">
                  <span>CMV total:</span>
                  <span>R$ {fmt(data.costOfGoods)}</span>
                </div>

                <div className="pt-1 space-y-1">
                  {data.installationCost > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Custo da instalação:</span>
                      <span className="font-medium">R$ {fmt(data.installationCost)}</span>
                    </div>
                  )}
                  {data.taxValue > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Impostos:</span>
                      <span className="font-medium">R$ {fmt(data.taxValue)}</span>
                    </div>
                  )}
                  {data.commissionValue > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Comissão vendedora:</span>
                      <span className="font-medium">R$ {fmt(data.commissionValue)}</span>
                    </div>
                  )}
                  {data.discountValue > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Desconto:</span>
                      <span className="font-medium">- R$ {fmt(data.discountValue)}</span>
                    </div>
                  )}
                  {data.cardValue > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Taxa de cartão:</span>
                      <span className="font-medium">R$ {fmt(data.cardValue)}</span>
                    </div>
                  )}
                  {data.fixedCostValue > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Custos fixos ({data.fixedCostPercent.toFixed(2)}%):</span>
                      <span className="font-medium">R$ {fmt(data.fixedCostValue)}</span>
                    </div>
                  )}
                  {data.referralCommissionValue > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Comissão de indicação:</span>
                      <span className="font-medium">R$ {fmt(data.referralCommissionValue)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-blue-700 bg-blue-50 rounded px-2 py-1 font-bold border border-blue-200 mt-2">
                  <span>Preço total:</span>
                  <span>R$ {fmt(data.totalPrice)}</span>
                </div>

                <div className={`flex justify-between font-bold border-t border-yellow-300 pt-2 mt-2 ${data.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  <span>Lucro líquido estimado:</span>
                  <span>R$ {fmt(data.netProfit)}</span>
                </div>
                <div className={`flex justify-between text-sm font-semibold ${data.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  <span>Margem de lucro:</span>
                  <span>{data.netProfitMargin.toFixed(2)}%</span>
                </div>

                <div className="flex justify-between text-gray-800 font-semibold pt-1">
                  <span>Margem de contribuição:</span>
                  <span>R$ {fmt(data.contribuicao)} <span className="text-xs font-normal text-gray-500">({data.contribuicaoPct.toFixed(2)}%)</span></span>
                </div>
              </div>
            </div>
          );

          return (
            <div className="mt-6 flex flex-wrap gap-4 items-start">
              {renderPanel(
                "Total do Orçamento (Admin)",
                {
                  materialCost: totalMaterialCost,
                  laborCost: totalLaborCost,
                  costOfGoods: totalCostOfGoods,
                  installationCost: installationCostTotal,
                  assemblyCost: totalAssemblyCost,
                  taxValue,
                  commissionValue,
                  discountValue,
                  cardValue,
                  fixedCostValue,
                  fixedCostPercent: fixedCostEstimatePercent,
                  referralCommissionValue,
                  totalPrice,
                  netProfit,
                  netProfitMargin,
                  contribuicao,
                  contribuicaoPct,
                },
                true
              )}

              {categoryBreakdowns.length > 1 &&
                categoryBreakdowns.map((cat) => renderPanel(cat.label, cat, false))}
            </div>
          );
        })()}
      </div>

      {/* Observações */}
      <div className="bg-white p-6 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Medidas</label>
          <textarea
            value={measurementNotes}
            onChange={(e) => setMeasurementNotes(e.target.value)}
            rows={3}
            className="w-full p-2 border rounded text-gray-900"
            placeholder="Ex: Medidas exatas confirmadas no local."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Montagem</label>
          <textarea
            value={assemblyNotes}
            onChange={(e) => setAssemblyNotes(e.target.value)}
            rows={3}
            className="w-full p-2 border rounded text-gray-900"
            placeholder="Ex: Levar escada grande."
          />
        </div>
      </div>

      {/* ── MODAL: OPÇÕES DE PDF ── */}
      {showPDFOptions && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Gerar Orçamento</h3>
            <p className="text-sm text-gray-500 mb-5">
              Escolha o que deseja ocultar na versão entregue ao cliente:
            </p>

            <div className="space-y-4">
              {[
                { state: hidePrice, setter: setHidePrice, label: "Ocultar valores / preços" },
                { state: hideMeasures, setter: setHideMeasures, label: "Ocultar medidas" },
                { state: hideDetailedDescription, setter: setHideDetailedDescription, label: "Ocultar descrição detalhada" },
              ].map(({ state, setter, label }) => (
                <label key={label} className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={state}
                    onChange={(e) => setter(e.target.checked)}
                    className="w-4 h-4 accent-primary-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-4">
              As opções marcadas serão lembradas no próximo orçamento.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPDFOptions(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAndSave}
                disabled={isSaving}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold text-sm disabled:opacity-60 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                    </svg>
                    Salvando...
                  </>
                ) : (
                  "Salvar e Ver Orçamento"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF PREVIEW ── */}
      {showPDFPreview && savedQuote && (() => {
        // savedQuote.date pode vir como "YYYY-MM-DD" ou timestamp completo do
        // Supabase ("YYYY-MM-DDTHH:mm:ss+00:00"); pega só os 10 primeiros chars
        // antes de anexar "T12:00:00", senão new Date(...) fica "Invalid Date".
        const rawSavedDate = (savedQuote.date || "").slice(0, 10);
        const savedQuoteDate = rawSavedDate
          ? new Date(rawSavedDate + "T12:00:00")
          : new Date();
        const todayPreviewStr = new Date().toLocaleDateString("pt-BR");
        return (
        <div className="fixed inset-0 z-50 overflow-auto bg-[#e8eaf0] dark:bg-[#0b0d16]">
          {/* Action bar */}
          <div className="sticky top-0 z-10 no-print" style={{ background: "#1e2130", borderBottom: "1px solid #2d3148" }}>
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 3, height: 20, borderRadius: 2, background: "#6c8ef5" }} />
                <span className="font-semibold text-white text-sm tracking-wide">
                  Orçamento N° {savedQuote.quoteNumber}
                </span>
                <span style={{ color: "#8892b0", fontSize: 13 }}>— {savedQuote.customerName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                  style={{ background: "#2d3148", color: "#c8d0e7", border: "1px solid #3d4166" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#3d4166")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#2d3148")}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir
                </button>
                <button
                  onClick={handleSavePDF}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-all"
                  style={{ background: "#6c8ef5", color: "#fff", border: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#5a7ce8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#6c8ef5")}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Salvar PDF
                </button>
                <button
                  onClick={() => { setShowPDFPreview(false); onCancel(); }}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all"
                  style={{ background: "transparent", color: "#8892b0", border: "1px solid #3d4166" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#2d3148")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Fechar
                </button>
              </div>
            </div>
          </div>

          {/* Quote document */}
          <div id="quote-print-area" className="max-w-3xl mx-auto my-8 bg-white print:shadow-none print:my-0" style={{ borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden" }}>

            {/* Top accent bar */}
            <div style={{ height: 5, background: "linear-gradient(90deg, #3d4166, #6c8ef5, #8faff7)" }} />

            {/* Header */}
            <div className="px-10 pt-8 pb-6" style={{ borderBottom: "1px solid #f0f2f7" }}>
              <div className="flex items-start gap-5">
                {companySettings.logo && (
                  <img
                    src={companySettings.logo}
                    alt="Logo"
                    style={{ height: 64, width: "auto", objectFit: "contain", flexShrink: 0, borderRadius: 6 }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1f36", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
                        {companySettings.name}
                      </div>
                      {companySettings.legalName && (
                        <div style={{ fontSize: 12, color: "#8892b0", marginTop: 2 }}>{companySettings.legalName}</div>
                      )}
                    </div>
                    {companySettings.cnpj && (
                      <div style={{ fontSize: 11, color: "#8892b0", textAlign: "right", flexShrink: 0, background: "#f7f8fc", padding: "4px 10px", borderRadius: 6 }}>
                        CNPJ: {companySettings.cnpj}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                    {companySettings.address && (
                      <div style={{ fontSize: 12, color: "#636b85", display: "flex", alignItems: "flex-start", gap: 5 }}>
                        <svg width="12" height="12" fill="none" stroke="#8892b0" strokeWidth="1.8" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {companySettings.address}
                      </div>
                    )}
                    {(companySettings.phone || companySettings.email) && (
                      <div style={{ fontSize: 12, color: "#636b85", display: "flex", gap: 12 }}>
                        {companySettings.phone && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <svg width="11" height="11" fill="none" stroke="#8892b0" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            {companySettings.phone}
                          </span>
                        )}
                        {companySettings.email && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <svg width="11" height="11" fill="none" stroke="#8892b0" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            {companySettings.email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quote title band */}
            <div className="px-10 py-4 flex justify-between items-center" style={{ background: "#f7f8fc", borderBottom: "1px solid #eef0f7" }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Orçamento</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1f36", marginTop: 1 }}>
                  N° {savedQuote.quoteNumber ?? "—"}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "#8892b0", marginLeft: 6 }}>
                    / {savedQuoteDate.getFullYear()}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Data</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#3d4166", marginTop: 1 }}>
                  {savedQuoteDate.toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>

            {/* Client band */}
            <div className="px-10 py-4 flex justify-between items-start" style={{ background: "#fff", borderBottom: "1px solid #eef0f7" }}>
              <div>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Cliente</span>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1f36", marginTop: 2 }}>{savedQuote.customerName || "—"}</div>
              </div>
              {savedQuote.salesperson && (
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Vendedor(a)</span>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1f36", marginTop: 2 }}>{savedQuote.salesperson}</div>
                </div>
              )}
            </div>

            {/* Products section */}
            <div className="px-10 pt-7 pb-2">
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600, marginBottom: 10 }}>Produtos</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#1e2130" }}>
                    <th style={{ textAlign: "left", padding: "9px 12px", color: "#c8d0e7", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: "6px 0 0 6px" }}>Descrição</th>
                    {!hidePrice && <th style={{ textAlign: "right", padding: "9px 12px", color: "#c8d0e7", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Preço Unit.</th>}
                    <th style={{ textAlign: "center", padding: "9px 12px", color: "#c8d0e7", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Unid.</th>
                    <th style={{ textAlign: "center", padding: "9px 12px", color: "#c8d0e7", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Qtd.</th>
                    {!hidePrice && <th style={{ textAlign: "right", padding: "9px 12px", color: "#c8d0e7", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: "0 6px 6px 0" }}>Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {dissolvedPDFItems.map((item, idx) => {
                    const wDisp = item.width >= 1000
                      ? `${(item.width / 1000).toFixed(2).replace(".", ",")}m`
                      : `${item.width}mm`;
                    const hDisp = item.height >= 1000
                      ? `${(item.height / 1000).toFixed(2).replace(".", ",")}m`
                      : `${item.height}mm`;
                    return (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f0f2f7" }}>
                        <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 600, color: "#1a1f36" }}>{item.productName}</div>
                          {!hideMeasures && (item.width > 0 || item.height > 0) && (
                            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{hDisp} × {wDisp}</div>
                          )}
                          {!hideDetailedDescription && item.description && (
                            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 1 }}>
                              {item.description.split(" | ").filter((p) => !p.toLowerCase().startsWith("acréscimo por serviço")).join(" | ")}
                            </div>
                          )}
                          {item.selectedColor && item.selectedColor !== "Padrão" && (
                            <div style={{ fontSize: 11, color: "#6c8ef5", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#6c8ef5" }} />
                              {item.selectedColor}
                            </div>
                          )}
                        </td>
                        {!hidePrice && (
                          <td style={{ textAlign: "right", padding: "10px 12px", color: "#3d4166", fontWeight: 500, whiteSpace: "nowrap" }}>
                            R$ {fmt(item.displayedPrice)}
                          </td>
                        )}
                        <td style={{ textAlign: "center", padding: "10px 12px", color: "#8892b0", fontSize: 12 }}>und</td>
                        <td style={{ textAlign: "center", padding: "10px 12px", color: "#1a1f36", fontWeight: 600 }}>{item.quantity}</td>
                        {!hidePrice && (
                          <td style={{ textAlign: "right", padding: "10px 12px", color: "#1a1f36", fontWeight: 700, whiteSpace: "nowrap" }}>
                            R$ {fmt(item.displayedPrice * item.quantity)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            {!hidePrice && (
              <div className="px-10 py-6">
                <div className="flex justify-end">
                  <div style={{ width: 280 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "#636b85", borderBottom: "1px solid #eef0f7" }}>
                      <span>Subtotal</span>
                      <span>R$ {fmt(dissolvedSubtotalPDF)}</span>
                    </div>
                    {(savedQuote.discount || 0) > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "#22c55e", borderBottom: "1px solid #eef0f7" }}>
                        <span>Desconto</span>
                        <span>-R$ {fmt(savedQuote.discount || 0)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "11px 14px", background: "#1e2130", borderRadius: 8, color: "#fff" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Total</span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: "#8faff7" }}>R$ {fmt(savedQuote.totalPrice || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "#eef0f7", margin: "0 40px" }} />

            {/* Payment + Notes */}
            <div className="px-10 py-6" style={{ display: "flex", gap: 32 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600, marginBottom: 6 }}>Forma de pagamento</div>
                <div style={{ fontSize: 13, color: "#1a1f36", fontWeight: 500, background: "#f7f8fc", padding: "8px 12px", borderRadius: 6, border: "1px solid #eef0f7" }}>
                  {savedQuote.paymentMethod || "A Definir"}
                </div>
              </div>
              {cleanNotesForPDF(savedQuote) && (
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600, marginBottom: 6 }}>Informações adicionais</div>
                  <div style={{ fontSize: 12, color: "#636b85", whiteSpace: "pre-wrap", background: "#f7f8fc", padding: "8px 12px", borderRadius: 6, border: "1px solid #eef0f7", lineHeight: 1.6 }}>
                    {cleanNotesForPDF(savedQuote)}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ background: "#f7f8fc", borderTop: "1px solid #eef0f7", padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 12, color: "#8892b0" }}>
                  {cityPDF},{" "}
                  {todayPreviewStr}
                </div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                {companySettings.logo && (
                  <img
                    src={companySettings.logo}
                    alt="Logo"
                    style={{ height: 40, width: "auto", objectFit: "contain", margin: "0 auto" }}
                  />
                )}
              </div>
              <div style={{ flex: 1 }} />
            </div>

            {/* Bottom accent */}
            <div style={{ height: 4, background: "linear-gradient(90deg, #6c8ef5, #3d4166, #1e2130)" }} />
          </div>
        </div>
        );
      })()}

      {/* Modal cliente rápido */}
      {isClientModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Adicionar Novo Cliente Rápido</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome *</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full mt-1 p-2 border rounded text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Celular</label>
                  <input
                    type="text"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full mt-1 p-2 border rounded text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Rua *</label>
                <input
                  type="text"
                  value={newClientStreet}
                  onChange={(e) => setNewClientStreet(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Nome da rua"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Número</label>
                  <input
                    type="text"
                    value={newClientNumber}
                    onChange={(e) => setNewClientNumber(e.target.value)}
                    className="w-full mt-1 p-2 border rounded text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bairro *</label>
                  <input
                    type="text"
                    value={newClientNeighborhood}
                    onChange={(e) => setNewClientNeighborhood(e.target.value)}
                    className="w-full mt-1 p-2 border rounded text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Cidade *</label>
                <input
                  type="text"
                  value={newClientCity}
                  onChange={(e) => setNewClientCity(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Observação</label>
                <textarea
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  rows={3}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Informações adicionais sobre o cliente"
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveNewClient}
                  disabled={isSavingClient}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
                >
                  {isSavingClient ? "Salvando..." : "Salvar Cliente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMaterialDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Detalhamento da matéria-prima</h3>
              <button
                type="button"
                onClick={() => setShowMaterialDetail(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Apenas visualização — somatório de todos os itens deste orçamento.</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Material</th>
                  <th className="px-3 py-2 text-left">Cor</th>
                  <th className="px-3 py-2 text-right">Metragem/Qtd</th>
                  <th className="px-3 py-2 text-right">Valor unit.</th>
                  <th className="px-3 py-2 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedMaterialBreakdown.map((line, idx) => (
                  <tr key={`${line.name}-${line.color}-${idx}`} className="border-t">
                    <td className="px-3 py-2 font-medium text-gray-800">{line.name}</td>
                    <td className="px-3 py-2 text-gray-600">{line.color || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {line.quantity.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {line.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      R$ {line.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                      R$ {line.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-700">Total:</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">
                    R$ {totalMaterialCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {showLaborDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Detalhamento da mão de obra</h3>
              <button
                type="button"
                onClick={() => setShowLaborDetail(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Apenas visualização — somatório de todos os itens deste orçamento.</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Função</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Horas</th>
                  <th className="px-3 py-2 text-right">Valor/h</th>
                  <th className="px-3 py-2 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedLaborBreakdown.map((line) => (
                  <tr key={line.role} className="border-t">
                    <td className="px-3 py-2 font-medium text-gray-800">{line.role}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{line.count}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{line.hours}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      R$ {line.rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                      R$ {line.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-700">Total:</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">
                    R$ {totalLaborCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {showAssemblyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Detalhamento da montagem</h3>
              <button
                type="button"
                onClick={() => setShowAssemblyDetail(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Insumos internos das montagens escolhidas neste orçamento — o cliente não vê isso.
            </p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Montagem</th>
                  <th className="px-3 py-2 text-left">Insumo</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedAssemblyBreakdown.map((line, idx) => (
                  <tr key={`${line.montagemName}-${line.insumoName}-${idx}`} className="border-t">
                    <td className="px-3 py-2 text-gray-600">{line.montagemName}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{line.insumoName}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                      R$ {line.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={2} className="px-3 py-2 text-right font-semibold text-gray-700">Total:</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">
                    R${" "}
                    {totalAssemblyCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewQuote;
