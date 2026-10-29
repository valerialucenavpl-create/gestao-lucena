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
  CashFlowEntry,
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
import { createQuoteHistoryEntry } from "../services/quoteHistoryServices";
import { getCashFlow, updateCashFlowEntry } from "../services/cashFlowServices";

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

// Tira as cores que o produto marcou como "não tenho" (Produto → Cores
// disponíveis). Se sobrar nenhuma, devolve a lista original.
const filterProductAvailableColors = (product: Product | undefined, colors: string[]): string[] => {
  const off = new Set((product?.unavailableColors || []).map((c) => normalizeText(c).trim()));
  if (off.size === 0) return colors;
  const kept = colors.filter((c) => !off.has(normalizeText(c).trim()));
  return kept.length > 0 ? kept : colors;
};

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
  onAddQuote: (quote: Quote) => Promise<Quote | void>;
  // Quando presente, a tela abre em modo de edição: carrega os itens/dados
  // desse orçamento já salvo, e o botão final atualiza em vez de criar novo.
  editingQuote?: Quote | null;
  // Orçamento em edição já virou venda — o PDF sai como "Ordem de Serviço".
  hasSale?: boolean;
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
  hasSale = false,
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
  const [originLegacy, setOriginLegacy] = useState(false);
  const [legacyAlreadyDelivered, setLegacyAlreadyDelivered] = useState(false);
  const [legacyConcludedAt, setLegacyConcludedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [legacyLinkCandidates, setLegacyLinkCandidates] = useState<CashFlowEntry[] | null>(null);
  const [legacyLinkQuoteId, setLegacyLinkQuoteId] = useState<string | null>(null);
  const [legacyLinkSelected, setLegacyLinkSelected] = useState<Set<string>>(new Set());
  const [linkingLegacyPayments, setLinkingLegacyPayments] = useState(false);
  // "Salvar e Fechar" com pagamentos antigos a vincular: fecha só depois
  // que o usuário decidir no modal de vínculo.
  const [closeAfterLegacyLink, setCloseAfterLegacyLink] = useState(false);
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
  // "auto": cada item recebe uma fatia do frete proporcional ao seu preço
  // (comportamento de sempre). "manual": a usuária define quanto de frete
  // vai pra cada item — útil quando a distância/dificuldade de entrega varia
  // muito entre os produtos do mesmo orçamento (ex.: um item mais longe).
  const [freightSplitMode, setFreightSplitMode] = useState<"auto" | "manual">("auto");
  const [freightManualByItem, setFreightManualByItem] = useState<Record<string, number>>({});
  const [freightManualInputByItem, setFreightManualInputByItem] = useState<Record<string, string>>({});
  const [freightCityId, setFreightCityId] = useState<string>("");
  const [freightVehicle, setFreightVehicle] = useState<"Carro" | "Moto">("Carro");
  // Cada "Aplicar" vira um item aqui em vez de sobrescrever o frete — permite
  // somar mais de um frete no mesmo orçamento (ex.: carro num dia + moto
  // noutro, pra mesma cidade ou cidades diferentes).
  const [freightItems, setFreightItems] = useState<
    { id: string; cityName: string; vehicle: "Carro" | "Moto"; km: number; value: number }[]
  >([]);
  const [showAdicionaisSaved, setShowAdicionaisSaved] = useState(false);
  const [savingAdicionais, setSavingAdicionais] = useState(false);
  const [installation, setInstallation] = useState<number>(0);
  const [installationInput, setInstallationInput] = useState<string>(formatMoneyInputBR(0));
  const [feedingCost, setFeedingCost] = useState<number>(0);
  const [feedingCostInput, setFeedingCostInput] = useState<string>(formatMoneyInputBR(0));
  // Diferença do orçamento em nível de pedido (não por produto) — geralmente
  // só dá pra calcular depois que os produtos já foram lançados e o valor
  // final apareceu, então precisa poder ser adicionada a qualquer momento,
  // igual Frete/Instalação/Alimentação, e não só durante a composição de um
  // item de mármore. Soma no preço final como lucro (não mexe no custo).
  const [priceDifference, setPriceDifference] = useState<number>(0);
  const [priceDifferenceInput, setPriceDifferenceInput] = useState<string>(formatMoneyInputBR(0));
  const [installationCostItems, setInstallationCostItems] = useState<
    { id: string; name: string; value: number; valueInput: string }[]
  >([]);
  const [referralCommissionRate, setReferralCommissionRate] = useState<number>(0); // % (ex: 5)
  const [selectedColor, setSelectedColor] = useState<string>("");

  const [measurementNotes, setMeasurementNotes] = useState<string>("");
  const [assemblyNotes, setAssemblyNotes] = useState<string>("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Item reaberto no formulário de cima (botão "Editar"): o próximo
  // "Adicionar produto" substitui esse item em vez de criar outro.
  const [formEditItemId, setFormEditItemId] = useState<string | null>(null);
  const itemFormRef = React.useRef<HTMLDivElement | null>(null);
  // Peças (comprimento x largura x qtd) sendo editadas do item de mármore
  // aberto em editingItemId — cópia de trabalho, só grava no item ao clicar OK.
  const [editingMarmorePieces, setEditingMarmorePieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([]);
  const [globalFixedCostRate, setGlobalFixedCostRate] = useState<number>(20);

  // ── PDF states ──────────────────────────────────────────────────────────
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [missingItemsConfirm, setMissingItemsConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
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

    // Preenche também o TEXTO do campo "Cliente" — antes só o id era
    // carregado e o campo aparecia em branco na edição. Pedido antigo sem
    // client_id: tenta achar o cadastro pelo nome que está no pedido.
    const editClientId =
      editingQuote.clientId ||
      clients.find((c) => normalizeText(c.name) === normalizeText(editingQuote.customerName || ""))?.id ||
      "";
    setSelectedClientId(editClientId ? String(editClientId) : "");
    setClientSearch(
      clients.find((c) => String(c.id) === String(editClientId))?.name || editingQuote.customerName || ""
    );
    setItems(Array.isArray(editingQuote.items) ? editingQuote.items : []);
    setDate(String(editingQuote.date || "").slice(0, 10) || new Date().toISOString().split("T")[0]);
    setPaymentMethod(editingQuote.paymentMethod || "Cartão");
    setFreight(Number(editingQuote.freight || 0));
    setFreightInput(formatMoneyInputBR(Number(editingQuote.freight || 0)));
    setFreightItems(Array.isArray(editingQuote.freightItems) ? editingQuote.freightItems : []);
    setDissolveFreight(editingQuote.dissolveFreight !== false);
    const loadedFreightManual = editingQuote.freightManualByItem || {};
    setFreightManualByItem(loadedFreightManual);
    setFreightSplitMode(Object.keys(loadedFreightManual).length > 0 ? "manual" : "auto");
    setInstallation(Number(editingQuote.installation || 0));
    setInstallationInput(formatMoneyInputBR(Number(editingQuote.installation || 0)));
    setFeedingCost(Number(editingQuote.feedingCost || 0));
    setFeedingCostInput(formatMoneyInputBR(Number(editingQuote.feedingCost || 0)));
    setPriceDifference(Number(editingQuote.priceDifference || 0));
    setPriceDifferenceInput(formatMoneyInputBR(Number(editingQuote.priceDifference || 0)));
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
    localStorage.getItem("quotePDFHideDetailedDesc_v2") !== "false"
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

  // Cubas (categoria "CUBAS"): mesmo padrão da Montagem/Acessório de
  // Mármore — o valor entra dentro do preço da peça e só aparece no
  // detalhamento interno, nunca pro cliente.
  const [mrSelectedCubaId, setMrSelectedCubaId] = useState<string>("");
  const [mrCubaQty, setMrCubaQty] = useState<number>(1);
  const [mrCubas, setMrCubas] = useState<
    { id: string; productId: string; name: string; quantity: number; price: number; cost: number }[]
  >([]);

  // Acessório de Mármore (categoria "ACESSORIO DE MARMORE" — válvula,
  // mangote, sifão etc.): igual à Montagem, o valor entra dentro do
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
  // Montagem (Produtos Prontos): mesmo padrão da Montagem de Mármore — soma
  // no valor do item, o nome nunca aparece pro cliente. Categoria
  // "ProdutosProntos" filtra a lista.
  const [acSelectedMontagemId, setAcSelectedMontagemId] = useState<string>("");
  const [acMontagens, setAcMontagens] = useState<QuoteItemMontagem[]>([]);

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
  // Último tipo de vidro usado numa peça já adicionada a este orçamento —
  // o campo "Tipo de vidro" não se limpa entre uma peça e outra (proposital,
  // agiliza quando várias peças usam o mesmo vidro), mas isso deixou passar
  // uma peça com o tipo errado sem ninguém perceber (ficou uma peça em 8mm
  // no meio de um pedido todo em 10mm). Usado só pra avisar quando o tipo
  // muda no meio do orçamento, não pra travar nada.
  const [lastGwGlassTypeId, setLastGwGlassTypeId] = useState<string>("");
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

  // Composição do vidro: Estrutura de Alumínio e Acessório Vidro não viram
  // itens separados no orçamento — mesmo padrão de Cuba/Montagem/Acessório
  // de Mármore, entram somados no preço do vidro quando "Adicionar produto
  // de vidro" é clicado.
  const [gwEstruturas, setGwEstruturas] = useState<
    { id: string; productId: string; name: string; width: number; height: number; color: string; quantity: number; price: number; cost: number }[]
  >([]);
  const [gwAcessoriosVidro, setGwAcessoriosVidro] = useState<
    { id: string; productId: string; name: string; color: string; quantity: number; price: number; cost: number }[]
  >([]);

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

  const marmoreCubaProducts = useMemo(() => {
    return products.filter((p) => normalizeText(p.category || "") === normalizeText("CUBAS"));
  }, [products]);

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
    return filterProductAvailableColors(product, Array.from(
      new Set(
        product.composition.flatMap((c) => {
          const material = rawMaterials.find((m) => m.id === c.materialId);
          return getMaterialVariants(material).map((cv) => getVariantName(cv));
        })
      )
    ).filter(Boolean) as string[]);
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
    return filterProductAvailableColors(product, Array.from(
      new Set(
        product.composition.flatMap((c) => {
          const material = rawMaterials.find((m) => m.id === c.materialId);
          return getMaterialVariants(material).map((cv) => getVariantName(cv));
        })
      )
    ).filter(Boolean) as string[]);
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
    // Exato, não .includes("MARMORE") — senão "ACESSORIO DE MARMORE" também
    // entrava aqui (acessórios têm sua própria lista, ver linha ~634).
    return products.filter((product) => normalizeText(product.category || "") === "MARMORE");
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

    return filterProductAvailableColors(product, Array.from(new Set(colors)));
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

    // Não pré-seleciona o primeiro produto: sem produto marcado, a montagem
    // pode entrar sozinha como item (ex.: só montagem de porta).
    setAcSelectedProductId((prev) =>
      prev && accessoryProducts.some((product) => product.id === prev) ? prev : ""
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

    // Mão de obra = pessoas × horas × valor da hora. No setor Mármore as horas
    // do produto são POR m² — multiplicadas pela área da peça, então pedra
    // menor custa menos e maior custa mais, proporcional à medida (ex.: 1
    // pessoa, 1 h/m², R$ 10/h, peça de 0,50 m² → R$ 5,00). Vidro e demais
    // setores: horas fixas por peça.
    // O custo sai da MESMA conta do detalhamento (laborCostUnit abaixo) —
    // antes o custo usava o valor cheio do cadastro por peça, sem a área, e
    // "ver detalhamento" nunca batia (ex.: nicho em 5 peças cobrava 5× a
    // hora cheia).
    const effectiveWidth_m = effectiveWidth / 1000;
    const effectiveHeight_m = effectiveHeight / 1000;
    const pieceAreaM2 = effectiveWidth_m * effectiveHeight_m;
    const laborHoursMultiplier =
      product.laborSector === "MARMORE" && pieceAreaM2 > 0 ? pieceAreaM2 : 1;

    const laborBreakdown: QuoteItemLaborLine[] = [];
    const pushLabor = (role: string, rawCount: number, rawHours: number, rate: number) => {
      // Igual ao cadastro do produto: quantidade de pessoas em branco conta como 1.
      const count = rawCount > 0 ? rawCount : 1;
      const hours = rawHours * laborHoursMultiplier;
      if (hours > 0 && rate > 0) {
        laborBreakdown.push({ role, count, hours, rate, total: count * hours * rate });
      }
    };
    pushLabor("Profissional (produção)", Number(product.professionalCount || 0), Number(product.professionalHours || 0), Number(product.professionalRate || 0));
    pushLabor("Ajudante (produção)", Number(product.helperCount || 0), Number(product.helperHours || 0), Number(product.helperRate || 0));
    pushLabor("Profissional (instalação)", Number(product.instProfCount || 0), Number(product.instProfInstHours || 0), Number(product.instProfRate || 0));
    pushLabor("Ajudante (instalação)", Number(product.instHelpCount || 0), Number(product.instHelpInstHours || 0), Number(product.instHelpRate || 0));
    // Produto cadastrado só com horas totais × valor/hora (sem detalhar
    // profissional/ajudante) — vira uma linha única.
    if (laborBreakdown.length === 0) {
      const totalHours = Number(product.productionHours || 0) + Number(product.assemblyHours || 0);
      pushLabor("Mão de obra", 1, totalHours, Number(product.hourlyRate || 0));
    }

    const breakdownLaborCost = laborBreakdown.reduce((s, l) => s + l.total, 0);
    const laborCostUnit =
      breakdownLaborCost > 0 ? breakdownLaborCost : (product.laborCost || 0) * laborHoursMultiplier;
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
      // Horas × quantidade, pra pessoas × horas × valor/hora fechar com o total.
      laborBreakdown: laborBreakdown.map((line) => ({
        ...line,
        hours: line.hours * quantity,
        total: line.total * quantity,
      })),
    };
  };

  // Soma o preço de cada medida (peça) — uma pia em L, por exemplo, vira 2
  // (ou mais) retângulos que são calculados separadamente e somados num
  // único total. Função pura (não depende do estado do formulário) pra dar
  // pra recalcular também ao reeditar as peças de um item já adicionado.
  const computeMarmorePieces = (
    productId: string,
    color: string,
    pieces: { length: number; width: number; quantity: number }[]
  ) => {
    const validPieces = pieces.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);
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
        calculateItemPrice(productId, piece.width, piece.length, piece.quantity, color);

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
          // Soma as horas de cada peça junto com o total (mesma equipe, mais
          // horas) — assim pessoas × horas × valor/hora fecha com o total.
          existing.hours += line.hours;
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

  const getMarmoreCalculations = () => {
    if (!mrSelectedProductId) return null;
    return computeMarmorePieces(mrSelectedProductId, selectedColor, mrPieces);
  };

  // Valor estimado em tempo real, conforme o usuário digita as medidas —
  // sem isso, só dava pra saber o preço depois de clicar em "Adicionar".
  const mrMontagemTotal = mrMontagens.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const mrCubaTotal = mrCubas.reduce((s, c) => s + (Number(c.price) || 0), 0);
  const gwEstruturaTotal = gwEstruturas.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const gwAcessorioVidroTotal = gwAcessoriosVidro.reduce((s, a) => s + (Number(a.price) || 0), 0);
  const acMontagemTotal = acMontagens.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const mrAccessoryTotal = mrAccessories.reduce((s, a) => s + (Number(a.price) || 0), 0);

  const mrLivePrice = useMemo(() => {
    const calc = getMarmoreCalculations();
    if (!calc) return null;
    return calc.totalPrice + mrMontagemTotal + mrCubaTotal + mrAccessoryTotal;
  }, [mrSelectedProductId, mrPieces, selectedColor, products, rawMaterials, mrMontagemTotal, mrCubaTotal, mrAccessoryTotal]);

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

  // Montagem como item próprio do orçamento (sem produto/peça junto).
  // Insumo vira "Custo matéria-prima" e mão de obra vira "Mão de obra"
  // no detalhamento (Admin) — antes os dois entravam juntos só como
  // laborCost, inflando "Mão de obra" com o valor do insumo E sem gerar
  // nenhuma linha no "ver detalhamento" (que lê laborBreakdown, não
  // existia aqui), fazendo o total não bater com a soma das linhas.
  const addStandaloneMontagemItem = (montagem: (typeof montagens)[number]) => {
    const materialBreakdown: QuoteItemMaterialLine[] = (montagem.insumos || []).map((insumo) => ({
      name: insumo.name,
      color: "Padrão",
      unit: "un",
      quantity: insumo.quantity ?? 1,
      unitCost: insumo.unitValue ?? insumo.value,
      totalCost: Number(insumo.value) || 0,
    }));
    const laborBreakdown: QuoteItemLaborLine[] = (montagem.labor || []).map((labor) => ({
      role: labor.role,
      count: labor.count,
      hours: labor.hours,
      rate: labor.rate,
      total: Number(labor.total) || 0,
    }));
    const materialCost = materialBreakdown.reduce((s, l) => s + l.totalCost, 0);
    const laborCost = laborBreakdown.reduce((s, l) => s + l.total, 0);
    const newItem: QuoteItem = {
      id: `qi-montagem-${Date.now()}`,
      productId: montagem.id,
      productName: montagem.name,
      selectedColor: "",
      description: "",
      width: 0,
      height: 0,
      quantity: 1,
      price: montagem.price,
      cost: materialCost + laborCost,
      materialCost,
      materialBreakdown: materialBreakdown.length > 0 ? materialBreakdown : undefined,
      laborCost,
      laborBreakdown: laborBreakdown.length > 0 ? laborBreakdown : undefined,
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Montagem (Mármore): valor fixo somado ao preço da peça, sem o nome
  // aparecer pro cliente — só o insumo (custo) fica visível pro Admin.
  // Se não tem peça de mármore em andamento (ex.: só instalação de pia
  // avulsa), vira item próprio no orçamento em vez de ficar preso esperando
  // uma peça que nunca vai ser adicionada.
  const addMrMontagem = () => {
    if (!mrSelectedMontagemId) return;
    const montagem = montagens.find((m) => m.id === mrSelectedMontagemId);
    if (!montagem) return;

    if (!getMarmoreCalculations()) {
      addStandaloneMontagemItem(montagem);
      setMrSelectedMontagemId("");
      return;
    }

    setMrMontagens((prev) => [
      ...prev,
      { id: `mrm-${Date.now()}`, montagemId: montagem.id, name: montagem.name, price: montagem.price },
    ]);
    setMrSelectedMontagemId("");
  };

  const removeMrMontagem = (id: string) => {
    setMrMontagens((prev) => prev.filter((m) => m.id !== id));
  };

  // Cubas: mesmo padrão do Acessório de Mármore, categoria "CUBAS" separada
  // pra ficar mais fácil de achar na lista.
  const addMrCuba = () => {
    if (!mrSelectedCubaId) return;
    const product = products.find((p) => p.id === mrSelectedCubaId);
    if (!product) return;
    const qty = Math.max(1, Number(mrCubaQty) || 1);
    const { price, cost } = calculateItemPrice(mrSelectedCubaId, 1, 1, qty, "Padrão");

    if (!getMarmoreCalculations()) {
      const newItem: QuoteItem = {
        id: `qi-cuba-${Date.now()}`,
        productId: product.id,
        productName: product.name,
        selectedColor: "",
        description: "",
        width: 0,
        height: 0,
        quantity: qty,
        price,
        cost,
        materialCost: cost,
      };
      setItems((prev) => [...prev, newItem]);
      setMrSelectedCubaId("");
      setMrCubaQty(1);
      return;
    }

    setMrCubas((prev) => [
      ...prev,
      { id: `mrc-${Date.now()}`, productId: product.id, name: product.name, quantity: qty, price, cost },
    ]);
    setMrSelectedCubaId("");
    setMrCubaQty(1);
  };

  const removeMrCuba = (id: string) => {
    setMrCubas((prev) => prev.filter((c) => c.id !== id));
  };

  // Diferença do orçamento: soma direto no campo "Diferença (R$)" do
  // orçamento (mesmo lugar de Frete/Instalação/Alimentação, mais abaixo na
  // tela) — assim conta no total na hora, mesmo que o produto já tenha sido
  // adicionado antes. Antes ficava presa numa lista local que só entrava no
  // preço se o produto de mármore ainda fosse adicionado depois.
  const addMrDiferenca = () => {
    const value = Number(mrExtraService) || 0;
    if (value <= 0) return;
    setPriceDifference((prev) => {
      const next = prev + value;
      setPriceDifferenceInput(formatMoneyInputBR(next));
      return next;
    });
    setMrExtraService(0);
    setMrExtraServiceInput(formatMoneyInputBR(0));
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

    if (!getMarmoreCalculations()) {
      const newItem: QuoteItem = {
        id: `qi-acessorio-${Date.now()}`,
        productId: product.id,
        productName: product.name,
        selectedColor: "",
        description: "",
        width: 0,
        height: 0,
        quantity: qty,
        price,
        cost,
        materialCost: cost,
      };
      setItems((prev) => [...prev, newItem]);
      setMrSelectedAccessoryId("");
      setMrAccessoryQty(1);
      return;
    }

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
      composition: { category: "ALUMINIO", extraService: Number(alExtraService) || 0 },
    };

    commitItem(newItem);
  };

  const handleAddMarmoreItem = () => {
    if (!mrSelectedProductId) return alert("Selecione um produto de mármore.");
    if (!ensureColorSelected()) return;

    const selectedProduct = products.find((product) => product.id === mrSelectedProductId);
    if (!selectedProduct) return;

    const calc = getMarmoreCalculations();
    if (!calc) return alert("Adicione medidas válidas.");

    const missingMr: string[] = [];
    if (mrMontagens.length === 0) missingMr.push("Montagem");
    if (mrCubas.length === 0) missingMr.push("Cuba");
    if (mrAccessories.length === 0) missingMr.push("Acessório de Mármore");
    if (missingMr.length > 0) {
      setMissingItemsConfirm({
        message: `Esta peça está sem: ${missingMr.join(", ")}.\nDeseja adicionar mesmo assim, sem esse(s) item(ns)?`,
        onConfirm: () => addMarmoreItemCore(selectedProduct, calc),
      });
      return;
    }

    addMarmoreItemCore(selectedProduct, calc);
  };

  const addMarmoreItemCore = (
    selectedProduct: Product,
    calc: NonNullable<ReturnType<typeof getMarmoreCalculations>>
  ) => {
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
    const cubaPriceTotal = mrCubas.reduce((s, c) => s + (Number(c.price) || 0), 0);
    const cubaCostTotal = mrCubas.reduce((s, c) => s + (Number(c.cost) || 0), 0);
    const accessoryPriceTotal = mrAccessories.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const accessoryCostTotal = mrAccessories.reduce((s, a) => s + (Number(a.cost) || 0), 0);

    const finalPrice = calc.totalPrice + montagemPriceTotal + cubaPriceTotal + accessoryPriceTotal;
    const totalCost = calc.totalCost + assemblyCost + cubaCostTotal + accessoryCostTotal;

    // Cuba e Acessório de Mármore entram como linhas de "matéria-prima" no
    // detalhamento (painel Admin) — antes só somavam no CMV total sem
    // aparecer em lugar nenhum do "ver detalhamento", como se o custo
    // tivesse vindo do nada.
    const cubaMaterialLines: QuoteItemMaterialLine[] = mrCubas.map((c) => ({
      name: c.name,
      color: "Padrão",
      unit: "un",
      quantity: c.quantity,
      unitCost: c.quantity > 0 ? c.cost / c.quantity : c.cost,
      totalCost: c.cost,
    }));
    const accessoryMaterialLines: QuoteItemMaterialLine[] = mrAccessories.map((a) => ({
      name: a.name,
      color: "Padrão",
      unit: "un",
      quantity: a.quantity,
      unitCost: a.quantity > 0 ? a.cost / a.quantity : a.cost,
      totalCost: a.cost,
    }));
    const fullMaterialBreakdown = [...calc.materialBreakdown, ...cubaMaterialLines, ...accessoryMaterialLines];

    const validPieces = mrPieces.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);
    // Só pra equipe ver depois (dentro do sistema) o que foi medido peça a
    // peça — nunca aparece no PDF/impressão que vai pro cliente.
    const detalhamentoLines = validPieces.map(
      (p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length}mm x ${p.width}mm)`
    );
    mrCubas.forEach((c) => {
      detalhamentoLines.push(`Cuba: ${c.name} (${c.quantity}x) — R$ ${c.price.toFixed(2)}`);
    });
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
      materialCost: calc.totalMaterialCost + cubaCostTotal + accessoryCostTotal,
      laborCost: calc.totalLaborCost,
      fixedCostValue: calc.totalFixedCostValue,
      materialBreakdown: fullMaterialBreakdown,
      laborBreakdown: calc.laborBreakdown,
      montagens: mrMontagens.length > 0 ? mrMontagens : undefined,
      assemblyCost: assemblyCost > 0 ? assemblyCost : undefined,
      assemblyBreakdown: assemblyBreakdown.length > 0 ? assemblyBreakdown : undefined,
      piecesBreakdown: validPieces,
      extrasPriceTotal: montagemPriceTotal + cubaPriceTotal + accessoryPriceTotal,
      extrasCostTotal: assemblyCost + cubaCostTotal + accessoryCostTotal,
      composition: {
        category: "GRANITO",
        cubas: mrCubas,
        accessories: mrAccessories,
        notes: mrDescription.trim() || undefined,
      },
    };

    commitItem(newItem);
    setMrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
    setMrExtraService(0);
    setMrExtraServiceInput(formatMoneyInputBR(0));
    setMrDescription("");
    setMrMontagens([]);
    setMrSelectedMontagemId("");
    setMrCubas([]);
    setMrSelectedCubaId("");
    setMrCubaQty(1);
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
    const assemblyBreakdown: QuoteItemAssemblyLine[] = acMontagens.flatMap((m) => {
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
    const finalPrice = basePrice + totalExtra + acMontagemTotal;
    const totalCost = baseCost + totalExtra + assemblyCost;

    const description = [
      `Cor: ${selectedColor || "Não informado"}`,
      `Acréscimo por serviço: R$ ${totalExtra.toFixed(2)}`,
    ].join(" | ");

    const detalhamentoLines: string[] = [];
    acMontagens.forEach((m) => {
      detalhamentoLines.push(`Montagem: ${m.name} — R$ ${m.price.toFixed(2)}`);
    });
    const internalDetail = detalhamentoLines.join("\n");

    const newItem: QuoteItem = {
      id: `qi-acessorio-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor,
      description,
      internalDetail: internalDetail || undefined,
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
      montagens: acMontagens.length > 0 ? acMontagens : undefined,
      assemblyCost: assemblyCost > 0 ? assemblyCost : undefined,
      assemblyBreakdown: assemblyBreakdown.length > 0 ? assemblyBreakdown : undefined,
      composition: { category: "ACESSORIOS", extraService: totalExtra },
    };

    commitItem(newItem);
    setAcQuantity(1);
    setAcExtraService(0);
    setAcExtraServiceInput(formatMoneyInputBR(0));
    setAcMontagens([]);
  };

  // Montagem (Produtos Prontos): mesmo padrão da Montagem de Mármore — não
  // vira item separado, fica numa lista de composição até "Adicionar
  // produto" somar tudo num único item.
  const addAcMontagem = () => {
    if (!acSelectedMontagemId) return;
    const montagem = montagens.find((m) => m.id === acSelectedMontagemId);
    if (!montagem) return;

    // Sem produto marcado: a montagem vira item próprio no orçamento.
    if (!acSelectedProductId) {
      addStandaloneMontagemItem(montagem);
      setAcSelectedMontagemId("");
      return;
    }

    setAcMontagens((prev) => [
      ...prev,
      { id: `acm-${Date.now()}`, montagemId: montagem.id, name: montagem.name, price: montagem.price },
    ]);
    setAcSelectedMontagemId("");
  };

  const removeAcMontagem = (id: string) => {
    setAcMontagens((prev) => prev.filter((m) => m.id !== id));
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

    if (lastGwGlassTypeId && lastGwGlassTypeId !== gwGlassTypeId) {
      const lastName = glassTypeOptions.find((m) => String(m.id) === lastGwGlassTypeId)?.name || "outro tipo";
      const currentName = selectedGlassType?.name || "este tipo";
      setMissingItemsConfirm({
        message: `A última peça deste orçamento usou "${lastName}", e esta está com "${currentName}".\nOs tipos de vidro são diferentes — confirma que é isso mesmo?`,
        onConfirm: () => proceedAddGlassItem(selectedProduct),
      });
      return;
    }

    proceedAddGlassItem(selectedProduct);
  };

  const proceedAddGlassItem = (selectedProduct: Product) => {
    const missingGw: string[] = [];
    if (gwEstruturas.length === 0) missingGw.push("Estrutura de Alumínio");
    if (gwAcessoriosVidro.length === 0) missingGw.push("Acessório Vidro");
    if (missingGw.length > 0) {
      setMissingItemsConfirm({
        message: `Este produto está sem: ${missingGw.join(", ")}.\nDeseja adicionar mesmo assim, sem esse(s) item(ns)?`,
        onConfirm: () => addGlassItemCore(selectedProduct),
      });
      return;
    }

    addGlassItemCore(selectedProduct);
  };

  const addGlassItemCore = (selectedProduct: Product) => {
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
    const estruturaCostTotal = gwEstruturas.reduce((s, e) => s + (Number(e.cost) || 0), 0);
    const acessorioVidroCostTotal = gwAcessoriosVidro.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const finalPrice = basePrice + totalExtras + gwEstruturaTotal + gwAcessorioVidroTotal;
    const totalCost = baseCost + totalExtras + estruturaCostTotal + acessorioVidroCostTotal;

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
    // Estrutura de Alumínio e Acessório Vidro entram como linhas de
    // "matéria-prima" no detalhamento (painel Admin) — mesmo ajuste feito
    // pra Cuba/Acessório de Mármore, senão o custo delas some no CMV total
    // sem aparecer em lugar nenhum do "ver detalhamento".
    gwEstruturas.forEach((e) => {
      fullMaterialBreakdown.push({
        name: e.name,
        color: e.color || "Padrão",
        unit: "un",
        quantity: e.quantity,
        unitCost: e.quantity > 0 ? e.cost / e.quantity : e.cost,
        totalCost: e.cost,
      });
    });
    gwAcessoriosVidro.forEach((a) => {
      fullMaterialBreakdown.push({
        name: a.name,
        color: a.color || "Padrão",
        unit: "un",
        quantity: a.quantity,
        unitCost: a.quantity > 0 ? a.cost / a.quantity : a.cost,
        totalCost: a.cost,
      });
    });

   const description = [
      `Tipo de vidro: ${selectedGlassType?.name || "Não informado"}`,
      `Cor do vidro: ${selectedColor || "Não informado"}`,
      `Textura: ${gwTexture || "Padrão"}`,
      `Ferragens: ${gwHardwareColor || "Padrão"}`,
      `Acréscimo por serviço: R$ ${Number(gwExtraService || 0).toFixed(2)}`,
    ].join(" | ");

    // Detalhamento interno da composição — só a equipe vê, nunca vai pro
    // PDF/impressão do cliente (mesmo padrão do internalDetail do Mármore).
    const detalhamentoLines: string[] = [];
    gwEstruturas.forEach((e) => {
      detalhamentoLines.push(
        `Estrutura: ${e.name} (${e.width}mm x ${e.height}mm, ${e.quantity}x) — R$ ${e.price.toFixed(2)}`
      );
    });
    gwAcessoriosVidro.forEach((a) => {
      detalhamentoLines.push(`Acessório: ${a.name} (${a.quantity}x) — R$ ${a.price.toFixed(2)}`);
    });
    const internalDetail = detalhamentoLines.join("\n");

    const newItem: QuoteItem = {
      id: `qi-glass-${Date.now()}`,
      productId: selectedProduct.id,
      productName: isJateado ? `${selectedProduct.name} (Jateado)` : selectedProduct.name,
      selectedColor,
      description,
      internalDetail: internalDetail || undefined,
      width: gwWidth,
      height: gwHeight,
      quantity: gwQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat + jateadoTotalCost + estruturaCostTotal + acessorioVidroCostTotal,
      laborCost: baseLab,
      fixedCostValue: baseFixed,
      materialBreakdown: fullMaterialBreakdown,
      laborBreakdown,
      composition: {
        category: "VIDROS",
        estruturas: gwEstruturas,
        acessoriosVidro: gwAcessoriosVidro,
        extraService: Number(gwExtraService) || 0,
        glassTypeId: gwGlassTypeId,
        texture: gwTexture,
        hardwareColor: gwHardwareColor,
      },
    };

    commitItem(newItem);
    setGwEstruturas([]);
    setGwAcessoriosVidro([]);
    setLastGwGlassTypeId(gwGlassTypeId);
  };

  // Estrutura de Alumínio dentro do vidro: mesmo padrão de Cuba/Montagem no
  // Mármore — não vira item separado, fica numa lista de composição até o
  // "Adicionar produto de vidro" somar tudo num único item.
  const addGwEstrutura = () => {
    if (!esSelectedProduct) return alert("Selecione um produto.");
    if (!esWidth || !esHeight) return alert("Informe altura e largura em milímetros.");
    if (esColorOptions.length > 0 && !esColor) return alert("Selecione a cor.");

    const selectedProduct = products.find((p) => p.id === esSelectedProduct);
    if (!selectedProduct) return;

    const { price, cost } = calculateItemPrice(esSelectedProduct, esWidth, esHeight, esQuantity, esColor);
    const totalExtras = (Number(esExtraService) || 0) * esQuantity;

    setGwEstruturas((prev) => [
      ...prev,
      {
        id: `gwe-${Date.now()}`,
        productId: selectedProduct.id,
        name: selectedProduct.name,
        width: esWidth,
        height: esHeight,
        color: esColor,
        quantity: esQuantity,
        price: price + totalExtras,
        cost: cost + totalExtras,
      },
    ]);

    setEsSelectedProduct("");
    setEsWidth(0);
    setEsHeight(0);
    setEsColor("");
    setEsExtraService(0);
    setEsExtraServiceInput(formatMoneyInputBR(0));
    setEsQuantity(1);
  };

  const removeGwEstrutura = (id: string) => {
    setGwEstruturas((prev) => prev.filter((e) => e.id !== id));
  };

  // Acessório Vidro: mesmo padrão de Acessório de Mármore — soma no preço
  // do vidro, não vira item separado.
  const addGwAcessorioVidro = () => {
    if (!avSelectedProduct) return alert("Selecione um produto.");
    if (avColorOptions.length > 0 && !avColor) return alert("Selecione a cor.");

    const selectedProduct = products.find((p) => p.id === avSelectedProduct);
    if (!selectedProduct) return;

    const { price, cost } = calculateItemPrice(avSelectedProduct, 1, 1, avQuantity, avColor);
    const totalExtra = Number(avExtraService) || 0;

    setGwAcessoriosVidro((prev) => [
      ...prev,
      {
        id: `gwa-${Date.now()}`,
        productId: selectedProduct.id,
        name: selectedProduct.name,
        color: avColor,
        quantity: avQuantity,
        price: price + totalExtra,
        cost: cost + totalExtra,
      },
    ]);

    setAvSelectedProduct("");
    setAvColor("");
    setAvQuantity(1);
    setAvExtraService(0);
    setAvExtraServiceInput(formatMoneyInputBR(0));
  };

  const removeGwAcessorioVidro = (id: string) => {
    setGwAcessoriosVidro((prev) => prev.filter((a) => a.id !== id));
  };

  // ============================
  //     ITENS E TOTAIS GERAIS
  // ============================
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (formEditItemId === id) setFormEditItemId(null);
  };

  // Adiciona o item novo ou, se um item foi reaberto no formulário pelo
  // "Editar", substitui ele no mesmo lugar da lista (mantém o id).
  const commitItem = (newItem: QuoteItem) => {
    if (formEditItemId && items.some((i) => i.id === formEditItemId)) {
      const targetId = formEditItemId;
      setItems((prev) => prev.map((i) => (i.id === targetId ? { ...newItem, id: targetId } : i)));
      setFormEditItemId(null);
      return;
    }
    setFormEditItemId(null);
    setItems((prev) => [...prev, newItem]);
  };

  // ── Reabrir item no formulário ──────────────────────────────────────────
  // Itens antigos (sem `composition`) têm cuba/acessório/estrutura só no
  // texto do detalhamento interno — reconstrói a partir dele; o custo vem
  // da linha de mesmo nome no detalhamento de matéria-prima.
  const parseDetailComponents = (item: QuoteItem, label: "Cuba" | "Acessório") => {
    const re = new RegExp(`^${label}: (.+) \\((\\d+)x\\) — R\\$ ([\\d.]+)$`);
    return String(item.internalDetail || "")
      .split("\n")
      .map((line) => line.trim().match(re))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m, idx) => {
        const name = m[1];
        const line = (item.materialBreakdown || []).find((l) => l.name === name);
        return {
          id: `re-${label}-${Date.now()}-${idx}`,
          productId: products.find((p) => p.name === name)?.id || "",
          name,
          quantity: Number(m[2]) || 1,
          price: Number(m[3]) || 0,
          cost: Number(line?.totalCost) || 0,
        };
      });
  };

  const parseDetailEstruturas = (item: QuoteItem) =>
    String(item.internalDetail || "")
      .split("\n")
      .map((line) => line.trim().match(/^Estrutura: (.+) \((\d+)mm x (\d+)mm, (\d+)x\) — R\$ ([\d.]+)$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m, idx) => {
        const name = m[1];
        const line = (item.materialBreakdown || []).find((l) => l.name === name);
        return {
          id: `re-est-${Date.now()}-${idx}`,
          productId: products.find((p) => p.name === name)?.id || "",
          name,
          width: Number(m[2]) || 0,
          height: Number(m[3]) || 0,
          color: line?.color && line.color !== "Padrão" ? line.color : "",
          quantity: Number(m[4]) || 1,
          price: Number(m[5]) || 0,
          cost: Number(line?.totalCost) || 0,
        };
      });

  const parseExtraService = (item: QuoteItem) => {
    const m = String(item.description || "").match(/Acréscimo por serviço: R\$ ([\d.]+)/);
    return m ? Number(m[1]) || 0 : 0;
  };

  const getDescriptionField = (item: QuoteItem, label: string) => {
    const part = String(item.description || "")
      .split("|")
      .map((p) => p.trim())
      .find((p) => normalizeText(p).startsWith(normalizeText(label) + ":"));
    return part ? part.slice(part.indexOf(":") + 1).trim() : undefined;
  };

  const getItemFormCategory = (item: QuoteItem): "GRANITO" | "VIDROS" | "ALUMINIO" | "ACESSORIOS" | null => {
    if (item.composition?.category) return item.composition.category;
    if (item.piecesBreakdown || marmoreProducts.some((p) => p.id === item.productId)) return "GRANITO";
    if (glassProducts.some((p) => p.id === item.productId)) return "VIDROS";
    if (aluminumProducts.some((p) => p.id === item.productId)) return "ALUMINIO";
    if (accessoryProducts.some((p) => p.id === item.productId)) return "ACESSORIOS";
    return null;
  };

  const loadItemIntoForm = (item: QuoteItem): boolean => {
    const category = getItemFormCategory(item);
    if (!category) return false;
    const comp = item.composition;

    setActiveCategory(category);
    setSelectedColor(item.selectedColor || "");

    if (category === "GRANITO") {
      setMrProductSearch("");
      setMrSelectedProductId(item.productId);
      setMrPieces(
        item.piecesBreakdown && item.piecesBreakdown.length > 0
          ? item.piecesBreakdown.map((p) => ({ ...p }))
          : [{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]
      );
      setMrMontagens((item.montagens || []).map((m) => ({ ...m })));
      setMrCubas(comp?.cubas ? comp.cubas.map((c) => ({ ...c })) : parseDetailComponents(item, "Cuba"));
      setMrAccessories(
        comp?.accessories ? comp.accessories.map((a) => ({ ...a })) : parseDetailComponents(item, "Acessório")
      );
      setMrDescription(
        comp
          ? comp.notes || ""
          : String(item.internalDetail || "")
              .split("\n")
              .filter((l) => l.trim() && !/^(Peça \d+|Cuba|Acessório|Montagem):/.test(l.trim()))
              .join("\n")
      );
      setMrSelectedMontagemId("");
      setMrSelectedCubaId("");
      setMrSelectedAccessoryId("");
    } else if (category === "ACESSORIOS") {
      const extra = comp?.extraService ?? parseExtraService(item);
      setAcProductSearch("");
      setAcSelectedProductId(item.productId);
      setAcQuantity(item.quantity || 1);
      setAcExtraService(extra);
      setAcExtraServiceInput(formatMoneyInputBR(extra));
      setAcMontagens((item.montagens || []).map((m) => ({ ...m })));
      setAcSelectedMontagemId("");
    } else if (category === "ALUMINIO") {
      const extra = comp?.extraService ?? parseExtraService(item);
      setAlProductSearch("");
      setAlSelectedProductId(item.productId);
      setAlWidth(item.width || 0);
      setAlHeight(item.height || 0);
      setAlQuantity(item.quantity || 1);
      setAlExtraService(extra);
      setAlExtraServiceInput(formatMoneyInputBR(extra));
    } else if (category === "VIDROS") {
      const extra = comp?.extraService ?? parseExtraService(item);
      setGwProductSearch("");
      setGwSelectedProduct(item.productId);
      setGwGlassTypeId(comp?.glassTypeId || getGlassTypeIdFromDescription(item.description || "") || "");
      setGwTexture(comp?.texture || getDescriptionField(item, "Textura") || "Liso");
      setGwHardwareColor(comp?.hardwareColor || getHardwareColorFromDescription(item.description || "") || "Branco");
      setGwWidth(item.width || 0);
      setGwHeight(item.height || 0);
      setGwQuantity(item.quantity || 1);
      setGwExtraService(extra);
      setGwExtraServiceInput(formatMoneyInputBR(extra));
      setGwEstruturas(
        comp?.estruturas
          ? comp.estruturas.map((e) => ({ ...e, color: e.color || "" }))
          : parseDetailEstruturas(item)
      );
      setGwAcessoriosVidro(
        comp?.acessoriosVidro
          ? comp.acessoriosVidro.map((a) => ({ ...a, color: a.color || "" }))
          : parseDetailComponents(item, "Acessório").map((a) => ({ ...a, color: "" }))
      );
    }

    setEditingItemId(null);
    setFormEditItemId(item.id);
    setTimeout(() => itemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return true;
  };

  const cancelFormEdit = () => {
    setFormEditItemId(null);
    setMrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
    setMrMontagens([]);
    setMrCubas([]);
    setMrAccessories([]);
    setMrDescription("");
    setAcQuantity(1);
    setAcExtraService(0);
    setAcExtraServiceInput(formatMoneyInputBR(0));
    setAcMontagens([]);
    setGwEstruturas([]);
    setGwAcessoriosVidro([]);
  };

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
              const availableColors = filterProductAvailableColors(product, Array.from(
                new Set(
                  product.composition.flatMap((c) => {
                    const material = rawMaterials.find((m) => m.id === c.materialId);
                    return getMaterialVariants(material).map((cv) => getVariantName(cv));
                  })
                )
              ) as string[]);
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

  const addEditingPiece = () => {
    setEditingMarmorePieces((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, length: 0, width: 0, quantity: 1 },
    ]);
  };

  const removeEditingPiece = (id: string) => {
    setEditingMarmorePieces((prev) => prev.filter((p) => p.id !== id));
  };

  const updateEditingPiece = (id: string, field: "length" | "width" | "quantity", value: number) => {
    setEditingMarmorePieces((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  // Recalcula o preço do item de mármore a partir das peças editadas,
  // preservando o que já estava embutido de montagem/cuba/acessório/diferença
  // (extrasPriceTotal/extrasCostTotal, guardados na criação do item).
  const handleSaveMarmorePiecesEdit = (item: QuoteItem) => {
    const calc = computeMarmorePieces(item.productId, item.selectedColor, editingMarmorePieces);
    if (!calc) return alert("Adicione ao menos uma peça com medidas válidas.");

    const extrasPrice = item.extrasPriceTotal || 0;
    const extrasCost = item.extrasCostTotal || 0;
    const validPieces = editingMarmorePieces.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);

    // Refaz os textos que mostram as medidas — antes só preço/peças mudavam e
    // o "Detalhamento interno" (Peça 1, Peça 2…) e a "Área total" da descrição
    // continuavam com as medidas antigas, parecendo que a edição não salvou.
    // Mantém as demais linhas (cuba, acessório, observação) como estavam.
    const pieceLines = validPieces.map(
      (p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length}mm x ${p.width}mm)`
    );
    const otherDetailLines = String(item.internalDetail || "")
      .split("\n")
      .filter((line) => line.trim() && !/^Peça \d+:/.test(line.trim()));
    const internalDetail = [...pieceLines, ...otherDetailLines].join("\n");

    const areaText = `Área total: ${calc.totalAreaM2.toFixed(2)} m²`;
    const description = /Área total: [\d.,]+ m²/.test(item.description || "")
      ? String(item.description).replace(/Área total: [\d.,]+ m²/, areaText)
      : [item.description, areaText].filter(Boolean).join(" | ");

    setItems((prev) =>
      prev.map((it) =>
        it.id !== item.id
          ? it
          : {
              ...it,
              price: calc.totalPrice + extrasPrice,
              cost: calc.totalCost + extrasCost,
              // extrasCost já inclui cuba/montagem/acessório — soma aqui pra
              // "Custo matéria-prima" continuar batendo com o CMV total
              // depois de reeditar as peças (o detalhamento por linha de
              // cuba/acessório específico não sobrevive à reedição).
              materialCost: calc.totalMaterialCost + extrasCost,
              laborCost: calc.totalLaborCost,
              fixedCostValue: calc.totalFixedCostValue,
              materialBreakdown: calc.materialBreakdown,
              laborBreakdown: calc.laborBreakdown,
              piecesBreakdown: validPieces,
              description,
              internalDetail: internalDetail || undefined,
            }
      )
    );
    setEditingItemId(null);
  };

  // Cada item é somado já arredondado em centavos — o preço calculado pode
  // ter casas escondidas (ex.: 130,9749 aparece como 130,98) e, sem isso, o
  // desconto em R$ era abatido do valor "cheio" e o total saía 1 centavo a
  // menos do que a conta feita em cima do que está na tela.
  const roundCents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const subtotal = roundCents(items.reduce((sum, item) => sum + roundCents(item.price), 0));

  // Preço do item já com a fatia proporcional do frete embutida — mesma
  // conta usada no PDF (utils/generateQuotePDF.ts), só que também na tela
  // antes de salvar, pra usuária ver como vai ficar sem precisar imprimir.
  const getDisplayedItemPrice = (item: QuoteItem) => {
    if (!dissolveFreight || freight <= 0 || subtotal <= 0) return item.price;
    const itemFreight = freightSplitMode === "manual"
      ? Number(freightManualByItem[item.id] || 0)
      : (item.price / subtotal) * freight;
    return item.price + itemFreight;
  };

  // Soma do frete já distribuído manualmente — usado pra mostrar quanto
  // ainda falta encaixar (ou se passou do total) enquanto a usuária digita.
  const freightManualTotal = Object.keys(freightManualByItem).reduce(
    (s, id) => s + (Number(freightManualByItem[id]) || 0),
    0
  );
  const freightManualRemaining = freight - freightManualTotal;

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

// Valor bruto antes do desconto — priceDifference soma direto como lucro
// (não tem custo associado, então já entra puro na margem).
const grossTotal = roundCents(subtotal + freight + installation + feedingCost + priceDifference);

// Desconto
const discountPercent = discountMode === "percent" ? Number(discountInput) || 0 : 0;
const discountFixed  = discountMode === "fixed"   ? discount : 0;

// Os dois modos reduzem o total que o cliente vê — % calcula em cima do
// valor bruto, R$ é abatido direto (limitado ao valor bruto, pra não gerar
// total negativo).
const discountValue  = roundCents(discountMode === "percent"
  ? grossTotal * (discountPercent / 100)
  : Math.min(discountFixed, grossTotal));

// Comissão de indicação (% em cima do valor bruto, antes do desconto) — se
// calculada em cima do total já descontado, o desconto digitado (ex.:
// R$96,32) acabava reduzindo o total em menos do que o valor digitado
// (porque a comissão também caía junto), confundindo quem estava tentando
// fechar num valor redondo específico.
const referralCommissionValue =
  referralCommissionRate > 0
    ? grossTotal * (referralCommissionRate / 100)
    : 0;

// TOTAL FINAL — desconto abatido por último, sempre reduz o total exatamente
// pelo valor digitado.
const totalPrice = roundCents(grossTotal + referralCommissionValue - discountValue);

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
const effectiveCardRate = discountMode === "percent"
  ? Math.max(0, cardRate - discountPercent)
  : cardRate;

const commissionValue = totalPrice * (commissionRate / 100);
const taxValue = totalPrice * (taxRate / 100);
// Taxa de cartão sempre calculada (visível independente da forma de pagamento).
// % mode: já reduzida pelo effectiveCardRate acima, sobre o total com desconto.
// R$ mode: o comentário original já dizia "valor bruto da taxa - desconto em R$",
// mas isso nunca tinha sido implementado — o desconto fixo só encolhia
// proporcionalmente com o total (mesma taxa %), sem tirar nada da taxa de
// cartão de fato, então ele saía inteiro do lucro em vez de vir da maquininha.
const cardValue = discountMode === "percent"
  ? totalPrice * (effectiveCardRate / 100)
  : Math.max(0, grossTotal * (cardRate / 100) - discountValue);

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
  feedingCost -
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
// Tudo que não é o preço "puro" do produto (frete, instalação, alimentação,
// diferença, comissão de indicação, desconto) precisa ser diluído nos itens
// — senão a soma das linhas da tabela não bate com o Total mostrado embaixo.
// pdfExtraTotal = totalPrice - subtotal em vez de somar campo por campo:
// somar campo por campo esquecia a Alimentação e o Desconto (mesmo bug já
// corrigido em utils/generateQuotePDF.ts) — esse cálculo cobre qualquer
// campo que afete o total, existente ou futuro, sem precisar listar todos.
const pdfSubtotal = savedQuote?.subtotal || 0;
// Rateio manual de frete por item (quando a usuária optou por definir na
// mão em vez do proporcional automático) — some do pdfExtraTotal genérico
// e é aplicado à parte por item, igual em utils/generateQuotePDF.ts.
const pdfFreightManualByItem = savedQuote?.freightManualByItem || {};
const pdfHasManualFreight = Object.keys(pdfFreightManualByItem).length > 0;
// O desconto NÃO é diluído nos itens: cada produto mostra o valor cheio e o
// desconto aparece separado embaixo (Subtotal → Desconto → Total). Antes ele
// era diluído E mostrado na linha "Desconto", parecendo descontado duas vezes.
const pdfDiscount = savedQuote?.discount || 0;
const pdfExtraTotal =
  (savedQuote?.totalPrice || 0) + pdfDiscount - pdfSubtotal - (pdfHasManualFreight ? (savedQuote?.freight || 0) : 0);
// item.price já é o TOTAL da linha (preço unitário × quantidade) — não um
// valor por unidade. Multiplicar por item.quantity de novo aqui (e outra
// vez na hora de exibir displayedPrice * quantity) inflava o total exibido
// no PDF (ex.: 2un a R$75 cada = R$150 virava R$150 "por unidade" e
// R$300 de total). Mesmo ajuste já feito em utils/generateQuotePDF.ts.
const dissolvedPDFItems = (savedQuote?.items || []).map((item) => {
  const share = pdfSubtotal > 0 ? item.price / pdfSubtotal : 0;
  const itemFreight = pdfHasManualFreight ? Number(pdfFreightManualByItem[item.id] || 0) : 0;
  const extraShareForLine = itemFreight + share * pdfExtraTotal;
  const displayedTotal = item.price + extraShareForLine;
  const displayedUnitPrice = item.quantity > 0 ? displayedTotal / item.quantity : displayedTotal;
  return { ...item, displayedTotal, displayedUnitPrice };
});
const dissolvedSubtotalPDF = dissolvedPDFItems.reduce(
  (s, i) => s + i.displayedTotal,
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
// Cliente escolhido — compara como TEXTO dos dois lados: o cliente criado
// pelo "+ Novo cliente" daqui fica com id "123" (texto), e quando a lista é
// recarregada do banco o mesmo cliente volta com id 123 (número). Com "==="
// direto os dois nunca batiam e o pedido era salvo como "Cliente
// Desconhecido" — sumindo da busca pelo nome (caso do orçamento nº 387 da Sônia).
const findSelectedClient = () => clients.find((c) => String(c.id) === String(selectedClientId));

// Nome do cliente pra gravar no pedido: o do cadastro; se o cadastro não
// estiver na lista carregada, mantém o nome que o pedido JÁ tinha (edição do
// mesmo cliente) — nunca troca por "Cliente Desconhecido".
const resolveCustomerName = (): string | null => {
  const c = findSelectedClient();
  if (c?.name) return c.name;
  if (editingQuote && String(editingQuote.clientId ?? "") === String(selectedClientId) && editingQuote.customerName) {
    return editingQuote.customerName;
  }
  return null;
};

const handleSave = () => {
  if (!selectedClientId) return alert("Selecione um cliente.");
  if (!resolveCustomerName()) {
    return alert(
      "O cliente selecionado não foi encontrado na lista de clientes (pode ter sido recém-cadastrado ou a lista ainda está carregando).\n\n" +
      "Selecione o cliente de novo antes de salvar — assim o pedido não fica sem nome."
    );
  }
  if (items.length === 0) return alert("Adicione pelo menos um item.");
  if (!deliveryDate) return alert("Informe uma data de entrega válida.");

  const missingTotals: string[] = [];
  if (!freight) missingTotals.push("Frete");
  if (!installation) missingTotals.push("Instalação");
  if (!feedingCost) missingTotals.push("Alimentação");
  if (!referralCommissionValue) missingTotals.push("Comissão de Indicação");
  if (missingTotals.length > 0) {
    setMissingItemsConfirm({
      message: `Este orçamento está sem: ${missingTotals.join(", ")}.\nDeseja salvar mesmo assim, sem esse(s) item(ns)?`,
      onConfirm: () => setShowPDFOptions(true),
    });
    return;
  }

  setShowPDFOptions(true);
};

const buildQuoteObject = (): Quote => {
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
    // handleSave já bloqueia o salvamento quando não há nome — o fallback
    // aqui só existe por segurança e nunca deve ser usado.
    customerName: resolveCustomerName() ?? editingQuote?.customerName ?? "Cliente Desconhecido",
    items,
    subtotal,
    discount: discountValue,
    freight,
    freightItems: freightItems.length > 0 ? freightItems : undefined,
    dissolveFreight,
    // Manda {} (não undefined) quando volta pra automático — undefined some
    // do payload de update e deixaria um rateio manual antigo "grudado" no
    // banco mesmo depois de a usuária trocar de volta pra automático.
    freightManualByItem: freightSplitMode === "manual" ? freightManualByItem : {},
    installation,
    installationCostItems:
      installationCostItems.length > 0
        ? installationCostItems.map(({ id, name, value }) => ({ id, name, value }))
        : undefined,
    feedingCost,
    priceDifference,
    totalPrice,
    paymentMethod,
    assemblyNotes,
    measurementNotes: finalMeasurementNotes,
    date,
    status: originLegacy && legacyAlreadyDelivered ? "Aprovado" : editingQuote?.status ?? "Pendente",
    salesperson: editingQuote?.salesperson ?? currentUser.name,
    costOfGoods: totalCostOfGoods,
    fixedCosts: fixedCostValue,
    machineFee: cardValue,
    taxes: taxValue,
    referralCommissionRate,
    referralCommissionValue,
    originLegacy: originLegacy || undefined,
    saleCompleted: originLegacy && legacyAlreadyDelivered ? true : (editingQuote?.saleCompleted ?? false),
    concludedAt: originLegacy && legacyAlreadyDelivered ? legacyConcludedAt : editingQuote?.concludedAt,
    approvedAt: originLegacy && legacyAlreadyDelivered ? date : editingQuote?.approvedAt,
  };
};

const handleConfirmAndSave = async (openPreview = true) => {
  localStorage.setItem("quotePDFHidePrice", String(hidePrice));
  localStorage.setItem("quotePDFHideMeasures", String(hideMeasures));
  localStorage.setItem("quotePDFHideDetailedDesc_v2", String(hideDetailedDescription));

  const newQuote = buildQuoteObject();
  setIsSaving(true);
  let savedRealQuote: Quote | void | undefined;
  if (editingQuote && onUpdateQuote) {
    await onUpdateQuote(newQuote);
    // Snapshot da venda/orçamento nesse exato momento — só aqui, no salvar
    // do formulário completo de edição (não nos salvamentos rápidos de
    // status/frete/etc.), pra não poluir o histórico com toda mudancinha.
    createQuoteHistoryEntry(String(newQuote.id), newQuote).catch((err) =>
      console.error("Erro ao registrar histórico:", err)
    );
  } else {
    savedRealQuote = await onAddQuote(newQuote);
    // Venda do sistema antigo já entregue nasce "Concluída" — registra quem fez.
    if (savedRealQuote && originLegacy && legacyAlreadyDelivered) {
      createQuoteHistoryEntry(String((savedRealQuote as Quote).id), savedRealQuote as Quote, "venda_gerada", "Venda gerada", {
        description: "Lançada como venda do sistema antigo JÁ ENTREGUE (concluída)",
        userName: currentUser?.name || "",
      }).catch(() => {});
    }
  }
  setIsSaving(false);
  // O número definitivo da OS é o que o banco gravou (o gatilho pula números
  // de orçamentos excluídos), não o previsto na tela — o PDF usa esse.
  const savedNumber = (savedRealQuote as Quote | undefined)?.quoteNumber;
  setSavedQuote(savedNumber != null ? { ...newQuote, quoteNumber: savedNumber } : newQuote);
  setShowPDFOptions(false);
  if (openPreview) setShowPDFPreview(true);

  let hasLegacyCandidates = false;
  // Venda do sistema antigo: procura no Caixa pagamentos desse mesmo
  // cliente que ainda não têm orcamento_id, pra oferecer vincular.
  if (originLegacy && savedRealQuote && !editingQuote) {
    const realId = String((savedRealQuote as Quote).id);
    const clientName = newQuote.customerName.trim().toLowerCase();
    const res = await getCashFlow();
    if (res.ok) {
      const candidates = (res.data ?? []).filter(
        (e) =>
          e.type === "Entrada" &&
          !e.orcamentoId &&
          !e.isTransfer &&
          clientName &&
          (e.description || "").toLowerCase().includes(clientName)
      );
      if (candidates.length > 0) {
        setLegacyLinkCandidates(candidates);
        setLegacyLinkQuoteId(realId);
        setLegacyLinkSelected(new Set(candidates.map((c) => c.id)));
        hasLegacyCandidates = true;
      }
    }
  }

  if (!openPreview) {
    if (hasLegacyCandidates) setCloseAfterLegacyLink(true);
    else onCancel();
  }
};

const handleConfirmLegacyLink = async () => {
  if (!legacyLinkQuoteId || !legacyLinkCandidates) return;
  setLinkingLegacyPayments(true);
  try {
    const toLink = legacyLinkCandidates.filter((c) => legacyLinkSelected.has(c.id));
    for (const entry of toLink) {
      const { id, ...rest } = entry;
      await updateCashFlowEntry(id, { ...rest, orcamentoId: legacyLinkQuoteId });
    }
    setLegacyLinkCandidates(null);
    setLegacyLinkQuoteId(null);
    alert(`${toLink.length} pagamento(s) vinculado(s) a esta venda ✅`);
    if (closeAfterLegacyLink) onCancel();
  } finally {
    setLinkingLegacyPayments(false);
  }
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
  // Venda já gerada (ou lançada direto como venda do sistema antigo) → OS.
  const isServiceOrder = hasSale || (originLegacy && !editingQuote);
  const pdfOptions: PDFOptions = { hidePrice, hideMeasures, hideDetailedDescription, isServiceOrder };
  const doc = await generateQuotePDF(savedQuote, companySettings, pdfOptions);
  const num = savedQuote.quoteNumber ?? savedQuote.id;
  doc.save(`${isServiceOrder ? "OrdemServico" : "Orcamento"}_${num}_${savedQuote.date ?? ""}.pdf`);
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
    setClientSearch(newClientName);

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
                            String(c.id) === String(selectedClientId) ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-800"
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

        {!editingQuote && (
          // Discreto enquanto desmarcado (raramente usado); ganha destaque
          // âmbar só quando marcado, pra deixar claro que é cadastro retroativo.
          <div className={originLegacy ? "mt-5 bg-amber-50 border border-amber-200 rounded-lg p-4" : "mt-3"}>
            <label
              className={`inline-flex items-center gap-2 cursor-pointer select-none ${
                originLegacy ? "text-sm font-semibold text-amber-800" : "text-xs text-gray-400 hover:text-gray-600"
              }`}
            >
              <input
                type="checkbox"
                checked={originLegacy}
                onChange={(e) => setOriginLegacy(e.target.checked)}
                className="w-3.5 h-3.5 shrink-0"
              />
              <span>Venda vinda do sistema antigo (cadastro retroativo)</span>
            </label>
            {originLegacy && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-amber-800">
                  <input
                    type="checkbox"
                    checked={legacyAlreadyDelivered}
                    onChange={(e) => setLegacyAlreadyDelivered(e.target.checked)}
                  />
                  Já foi entregue
                </label>
                {legacyAlreadyDelivered && (
                  <div>
                    <label className="block text-xs font-medium text-amber-700">Data real da entrega</label>
                    <input
                      type="date"
                      value={legacyConcludedAt}
                      onChange={(e) => setLegacyConcludedAt(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-white border border-amber-300 rounded-md shadow-sm text-gray-900"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
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
            <label className="block text-sm font-medium text-gray-700">Alimentação (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={feedingCostInput}
              onChange={(e) => {
                const rawValue = sanitizeMoneyInputBR(e.target.value);
                setFeedingCostInput(rawValue);
                setFeedingCost(parseMoneyInputBR(rawValue));
              }}
              onBlur={() => setFeedingCostInput(formatMoneyInputBR(feedingCost))}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Diferença (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={priceDifferenceInput}
              onChange={(e) => {
                const rawValue = sanitizeMoneyInputBR(e.target.value);
                setPriceDifferenceInput(rawValue);
                setPriceDifference(parseMoneyInputBR(rawValue));
              }}
              onBlur={() => setPriceDifferenceInput(formatMoneyInputBR(priceDifference))}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Ajuste do orçamento — soma no total como lucro. Pode ser lançado a qualquer momento, mesmo depois dos produtos.
            </p>
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

        {dissolveFreight && freight > 0 && items.length > 0 && (
          <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-700">Como distribuir o frete entre os produtos?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFreightSplitMode("auto");
                    setFreightManualByItem({});
                    setFreightManualInputByItem({});
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                    freightSplitMode === "auto"
                      ? "bg-primary-600 text-white border-primary-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  Diluir automático (proporcional)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFreightSplitMode("manual");
                    setFreightManualByItem((prev) => {
                      if (Object.keys(prev).length > 0) return prev;
                      const initial: Record<string, number> = {};
                      items.forEach((item) => {
                        initial[item.id] =
                          subtotal > 0 ? Number(((item.price / subtotal) * freight).toFixed(2)) : 0;
                      });
                      setFreightManualInputByItem(
                        Object.fromEntries(
                          Object.entries(initial).map(([id, v]) => [id, formatMoneyInputBR(v)])
                        )
                      );
                      return initial;
                    });
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                    freightSplitMode === "manual"
                      ? "bg-primary-600 text-white border-primary-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  Definir valor por produto
                </button>
              </div>
            </div>

            {freightSplitMode === "manual" && (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-3 py-2"
                  >
                    <span className="text-sm text-gray-700 truncate">{item.productName}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        freightManualInputByItem[item.id] ??
                        formatMoneyInputBR(freightManualByItem[item.id] || 0)
                      }
                      onChange={(e) => {
                        const raw = sanitizeMoneyInputBR(e.target.value);
                        setFreightManualInputByItem((prev) => ({ ...prev, [item.id]: raw }));
                        setFreightManualByItem((prev) => ({ ...prev, [item.id]: parseMoneyInputBR(raw) }));
                      }}
                      onBlur={() =>
                        setFreightManualInputByItem((prev) => ({
                          ...prev,
                          [item.id]: formatMoneyInputBR(freightManualByItem[item.id] || 0),
                        }))
                      }
                      className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-right text-gray-900"
                    />
                  </div>
                ))}
                <div
                  className={`text-xs font-semibold mt-1 ${
                    Math.abs(freightManualRemaining) < 0.01 ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {Math.abs(freightManualRemaining) < 0.01
                    ? "Valores batem com o frete total."
                    : freightManualRemaining > 0
                    ? `Falta distribuir R$ ${freightManualRemaining.toFixed(2).replace(".", ",")}`
                    : `Passou do total em R$ ${Math.abs(freightManualRemaining).toFixed(2).replace(".", ",")}`}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            disabled={savingAdicionais}
            onClick={async () => {
              // Num orçamento já existente esses valores (frete, instalação,
              // alimentação, comissão) ficavam só no estado local até o
              // usuário passar pelo fluxo inteiro de "Salvar" (que exige
              // reabrir a tela de PDF) — então o botão mostrava "Salvo" mas
              // nada ia pro banco, e mudanças feitas só nessa seção se
              // perdiam. Agora, se já existe um orçamento salvo, persiste
              // direto no Supabase.
              if (editingQuote && onUpdateQuote) {
                setSavingAdicionais(true);
                try {
                  const result: any = await onUpdateQuote(buildQuoteObject());
                  if (result && result.ok === false) {
                    alert(
                      "Não foi possível salvar no banco: " +
                        (result.error?.message || "erro desconhecido") +
                        "\n\nOs valores ficaram só nesta tela — tente novamente."
                    );
                    return;
                  }
                  setShowAdicionaisSaved(true);
                  setTimeout(() => setShowAdicionaisSaved(false), 2500);
                } finally {
                  setSavingAdicionais(false);
                }
              } else {
                setShowAdicionaisSaved(true);
                setTimeout(() => setShowAdicionaisSaved(false), 2500);
              }
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 disabled:opacity-60"
          >
            <Icon className="w-4 h-4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </Icon>
            {savingAdicionais ? "Salvando..." : "Salvar"}
          </button>
          {showAdicionaisSaved && (
            <span className="text-sm text-green-700 font-semibold">
              {editingQuote ? "Salvo no orçamento." : "Salvo — já vai junto com os produtos no orçamento."}
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
      <div ref={itemFormRef} className="bg-white p-6 rounded-xl shadow-md scroll-mt-4">
        {formEditItemId && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              ✏️ Editando <b>{items.find((i) => i.id === formEditItemId)?.productName || "item"}</b> — altere o que
              precisar (medidas, cubas, montagens, acessórios) e clique em <b>Salvar alteração</b>.
            </p>
            <button
              type="button"
              onClick={cancelFormEdit}
              className="px-3 py-1.5 text-xs font-semibold border border-amber-400 text-amber-800 rounded-lg hover:bg-amber-100"
            >
              Cancelar edição
            </button>
          </div>
        )}
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
                <div className="flex gap-2">
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
                  <button
                    type="button"
                    onClick={addMrDiferenca}
                    disabled={!(Number(mrExtraService) > 0)}
                    className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0"
                  >
                    + Adicionar
                  </button>
                </div>

                <p className="text-[11px] text-gray-400 mt-1">
                  Soma direto no campo "Diferença (R$)" do orçamento (mais abaixo, junto do Frete)
                  — conta no total na hora, mesmo que o produto já tenha sido adicionado.
                  {priceDifference > 0 && (
                    <span className="block font-semibold text-gray-600 mt-1">
                      Diferença atual do orçamento: R${" "}
                      {priceDifference.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">4. Cubas</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 64px auto" }}>
                <select
                  value={mrSelectedCubaId}
                  onChange={(e) => setMrSelectedCubaId(e.target.value)}
                  className="h-11 px-3 border rounded-lg text-gray-900 w-full min-w-0"
                >
                  <option value="">Selecione uma cuba (opcional)</option>
                  {marmoreCubaProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={mrCubaQty}
                  onChange={(e) => setMrCubaQty(Number(e.target.value) || 1)}
                  className="h-11 px-2 border rounded-lg text-gray-900 w-full min-w-0 text-center"
                />
                <button
                  type="button"
                  onClick={addMrCuba}
                  disabled={!mrSelectedCubaId}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0"
                >
                  + Adicionar
                </button>
              </div>

              {marmoreCubaProducts.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Nenhum produto cadastrado com a categoria "Cubas" ainda. Cadastre em Produtos.
                </p>
              )}

              {mrCubas.length > 0 && (
                <div className="mt-2 space-y-1">
                  {mrCubas.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-gray-700">{c.name} ({c.quantity}x)</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          R$ {c.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMrCuba(c.id)}
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
                    <span>Total cubas (soma no valor da peça):</span>
                    <span>
                      R${" "}
                      {mrCubaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                {getMarmoreCalculations()
                  ? "O valor da cuba entra dentro do valor da peça — aparece só no detalhamento interno, o cliente não vê separado."
                  : "Sem uma peça de mármore selecionada acima, a cuba entra como item avulso no orçamento (nome e valor próprios)."}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">5. Montagem</label>
              <div className="flex gap-2">
                <select
                  value={mrSelectedMontagemId}
                  onChange={(e) => setMrSelectedMontagemId(e.target.value)}
                  className="flex-1 h-11 px-3 border rounded-lg text-gray-900"
                >
                  <option value="">Selecione uma montagem (opcional)</option>
                  {montagens
                    .filter((m) => m.categoria === "Marmore")
                    .map((m) => (
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
                {getMarmoreCalculations()
                  ? "O valor da montagem entra dentro do valor da peça — o cliente não vê esse nome."
                  : "Sem uma peça de mármore selecionada acima, a montagem entra como item avulso no orçamento (ex.: só a instalação de uma pia)."}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">6. Acessório de Mármore</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 64px auto" }}>
                <select
                  value={mrSelectedAccessoryId}
                  onChange={(e) => setMrSelectedAccessoryId(e.target.value)}
                  className="h-11 px-3 border rounded-lg text-gray-900 w-full min-w-0"
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
                  className="h-11 px-2 border rounded-lg text-gray-900 w-full min-w-0 text-center"
                />
                <button
                  type="button"
                  onClick={addMrAccessory}
                  disabled={!mrSelectedAccessoryId}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0"
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
                {formEditItemId ? "Salvar alteração" : "Adicionar produto de mármore"}
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
                    onClick={() => setAcSelectedProductId((prev) => (prev === product.id ? "" : product.id))}
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

            <div className="pt-5 border-t border-blue-100">
              <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">Montagem</h4>
              <div className="flex gap-2">
                <select
                  value={acSelectedMontagemId}
                  onChange={(e) => setAcSelectedMontagemId(e.target.value)}
                  className="flex-1 h-11 px-3 border rounded-lg text-gray-900"
                >
                  <option value="">Selecione uma montagem (opcional)</option>
                  {montagens
                    .filter((m) => m.categoria === "ProdutosProntos")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — R$ {m.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={addAcMontagem}
                  disabled={!acSelectedMontagemId}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  + Adicionar
                </button>
              </div>

              {acMontagens.length > 0 && (
                <div className="mt-2 space-y-1">
                  {acMontagens.map((m) => (
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
                          onClick={() => removeAcMontagem(m.id)}
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
                    <span>Total montagem (soma no valor do item):</span>
                    <span>
                      R${" "}
                      {acMontagemTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                {acSelectedProductId
                  ? "O valor da montagem entra dentro do valor do produto selecionado — o cliente não vê separado."
                  : "Nenhum produto marcado: a montagem entra direto como item próprio no orçamento."}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddAccessoryItem}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
              >
                {formEditItemId ? "Salvar alteração" : "Adicionar produto"}
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
                {formEditItemId ? "Salvar alteração" : "Adicionar produto de alumínio"}
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
                {formEditItemId ? "Salvar alteração" : "Adicionar produto de vidro"}
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
                  onClick={addGwEstrutura}
                  disabled={!esSelectedProduct}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  + Adicionar
                </button>
              </div>

              {gwEstruturas.length > 0 && (
                <div className="mt-2 space-y-1">
                  {gwEstruturas.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-gray-700">
                        {e.name} ({e.width}mm x {e.height}mm, {e.quantity}x)
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          R$ {e.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGwEstrutura(e.id)}
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
                    <span>Total estrutura (soma no valor da peça):</span>
                    <span>
                      R${" "}
                      {gwEstruturaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                O valor da estrutura entra dentro do valor da peça — aparece só no detalhamento interno, o cliente não vê separado.
              </p>
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
                  onClick={addGwAcessorioVidro}
                  disabled={!avSelectedProduct}
                  className="px-4 h-11 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  + Adicionar
                </button>
              </div>

              {gwAcessoriosVidro.length > 0 && (
                <div className="mt-2 space-y-1">
                  {gwAcessoriosVidro.map((a) => (
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
                          onClick={() => removeGwAcessorioVidro(a.id)}
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
                    <span>Total acessório (soma no valor da peça):</span>
                    <span>
                      R${" "}
                      {gwAcessorioVidroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                O valor do acessório entra dentro do valor da peça — aparece só no detalhamento interno, o cliente não vê separado.
              </p>
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
                    item.piecesBreakdown ? (
                      <tr key={item.id} className="border-t bg-blue-50">
                        <td colSpan={7} className="px-3 py-3">
                          <p className="text-xs font-bold text-gray-600 uppercase mb-2">
                            {item.productName} — Peças (comprimento x largura x qtd)
                          </p>
                          <div className="space-y-2">
                            {editingMarmorePieces.map((piece) => (
                              <div key={piece.id} className="flex items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="Compr. (mm)"
                                  value={piece.length || ""}
                                  onChange={(e) => updateEditingPiece(piece.id, "length", Number(e.target.value) || 0)}
                                  className="w-28 border rounded px-2 py-1 text-sm text-gray-900"
                                />
                                <span className="text-gray-400">x</span>
                                <input
                                  type="number"
                                  placeholder="Larg. (mm)"
                                  value={piece.width || ""}
                                  onChange={(e) => updateEditingPiece(piece.id, "width", Number(e.target.value) || 0)}
                                  className="w-28 border rounded px-2 py-1 text-sm text-gray-900"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="Qtd"
                                  value={piece.quantity}
                                  onChange={(e) => updateEditingPiece(piece.id, "quantity", Number(e.target.value) || 1)}
                                  className="w-16 border rounded px-2 py-1 text-sm text-gray-900 text-center"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeEditingPiece(piece.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Remover peça"
                                >
                                  <Icon className="w-4 h-4">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </Icon>
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <button
                              type="button"
                              onClick={addEditingPiece}
                              className="px-3 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700"
                            >
                              + Adicionar peça
                            </button>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setEditingItemId(null)}
                                className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs font-semibold hover:bg-gray-50"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveMarmorePiecesEdit(item)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700"
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
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
                    )
                  ) : (
                    <tr
                      key={item.id}
                      className={`border-t ${formEditItemId === item.id ? "bg-amber-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {item.productName}
                        {formEditItemId === item.id && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">em edição ↑</span>
                        )}
                      </td>
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
                          onClick={() => {
                            // Produto de catálogo: sobe pro formulário com tudo
                            // carregado. Itens avulsos (montagem/cuba soltas)
                            // continuam com a edição aqui na linha.
                            if (loadItemIntoForm(item)) return;
                            setEditingItemId(item.id);
                            setEditingMarmorePieces(
                              item.piecesBreakdown
                                ? item.piecesBreakdown.map((p) => ({ ...p }))
                                : []
                            );
                          }}
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
        {(freight > 0 || installation > 0 || feedingCost > 0 || priceDifference > 0 || referralCommissionRate > 0) && (
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
            {feedingCost > 0 && (
              <div className="flex justify-between">
                <span>Alimentação:</span>
                <span>R$ {feedingCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {priceDifference > 0 && (
              <div className="flex justify-between">
                <span>Diferença:</span>
                <span>R$ {priceDifference.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
          const contribuicao = totalPrice - totalCostOfGoods - installationCostTotal - feedingCost - variableCosts;
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

      {/* ── MODAL: CONFIRMAÇÃO DE ITEM FALTANTE ── */}
      {missingItemsConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Confirmar item incompleto</h3>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{missingItemsConfirm.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setMissingItemsConfirm(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  // Fecha ANTES de chamar onConfirm — se onConfirm() abrir um
                  // segundo aviso encadeado (ex.: tipo de vidro diferente →
                  // depois Estrutura/Acessório faltando), fechar depois
                  // apagava esse segundo aviso assim que ele aparecia, e o
                  // item nunca chegava a ser adicionado de fato.
                  const confirm = missingItemsConfirm.onConfirm;
                  setMissingItemsConfirm(null);
                  confirm();
                }}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold text-sm"
              >
                Continuar assim mesmo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VINCULAR PAGAMENTOS ANTIGOS ── */}
      {legacyLinkCandidates && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Vincular pagamentos a esta venda?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Encontrei {legacyLinkCandidates.length} lançamento(s) no Caixa desse cliente sem vínculo com nenhum pedido. Marque os que são dessa venda:
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-5">
              {legacyLinkCandidates.map((c) => (
                <label key={c.id} className="flex items-center gap-3 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={legacyLinkSelected.has(c.id)}
                    onChange={(e) =>
                      setLegacyLinkSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                  <div className="flex-1 text-sm">
                    <p className="text-gray-800">{c.description || "-"}</p>
                    <p className="text-xs text-gray-400">{c.date}</p>
                  </div>
                  <span className="font-semibold text-sm text-gray-700">
                    {Number(c.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setLegacyLinkCandidates(null);
                  setLegacyLinkQuoteId(null);
                  if (closeAfterLegacyLink) onCancel();
                }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Não vincular
              </button>
              <button
                type="button"
                onClick={handleConfirmLegacyLink}
                disabled={linkingLegacyPayments || legacyLinkSelected.size === 0}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {linkingLegacyPayments ? "Vinculando..." : `Vincular ${legacyLinkSelected.size} selecionado(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => handleConfirmAndSave(false)}
                disabled={isSaving}
                className="px-4 py-2 text-primary-700 border border-primary-600 rounded-lg hover:bg-primary-50 font-semibold text-sm disabled:opacity-60"
              >
                Salvar e Fechar
              </button>
              <button
                onClick={() => handleConfirmAndSave(true)}
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
                            R$ {fmt(item.displayedUnitPrice)}
                          </td>
                        )}
                        <td style={{ textAlign: "center", padding: "10px 12px", color: "#8892b0", fontSize: 12 }}>und</td>
                        <td style={{ textAlign: "center", padding: "10px 12px", color: "#1a1f36", fontWeight: 600 }}>{item.quantity}</td>
                        {!hidePrice && (
                          <td style={{ textAlign: "right", padding: "10px 12px", color: "#1a1f36", fontWeight: 700, whiteSpace: "nowrap" }}>
                            R$ {fmt(item.displayedTotal)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals — mostrado mesmo com "ocultar preço" marcado: essa opção
                esconde o preço POR ITEM na tabela, não o total do orçamento. */}
            <div className="px-10 py-6">
              <div className="flex justify-end">
                <div style={{ width: 280 }}>
                  {/* Frete/Instalação/Alimentação/Diferença/Comissão não aparecem
                      aqui — só dentro do sistema (tela de detalhe do orçamento).
                      No PDF eles continuam diluídos dentro do preço de cada
                      produto na tabela acima, então a soma ainda bate com o Total.
                      Subtotal só aparece quando há desconto (senão é igual ao Total). */}
                  {(savedQuote.discount || 0) > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "#6b7280", borderBottom: "1px solid #eef0f7" }}>
                        <span>Subtotal (produtos)</span>
                        <span>R$ {fmt(dissolvedSubtotalPDF)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, color: "#22c55e", borderBottom: "1px solid #eef0f7" }}>
                        <span>Desconto</span>
                        <span>-R$ {fmt(savedQuote.discount || 0)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "11px 14px", background: "#1e2130", borderRadius: 8, color: "#fff" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Total</span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: "#8faff7" }}>R$ {fmt(savedQuote.totalPrice || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

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
