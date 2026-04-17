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
} from "../types";
import { generateQuotePDF, PDFOptions, cityFromAddress } from "../utils/generateQuotePDF";
import { Icon } from "./icons/Icon";

import { HARDWARE_COLORS, HANDLES } from "../constants";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { resolveMaterialPurchaseLengthMeters } from "../utils/materialPurchaseLength";
import { calculateQuoteCompositionLineCost } from "../utils/productComposition";
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

const isGlassMaterial = (material: InventoryItem) =>
  getMaterialUsageCategory(material).includes("VIDRO") || normalizeText(material?.name).includes("VIDRO");

interface NewQuoteProps {
  currentUser: User;
  clients: Client[];
  rawMaterials: InventoryItem[];
  products: Product[];
  variableExpenses: VariableExpense[];
  companySettings: CompanySettings;
  nextQuoteNumber: number;
  onAddQuote: (quote: Quote) => Promise<void>;
  onAddNewClient: (client: Client) => void;
  onCancel: () => void;
}

const NewQuote: React.FC<NewQuoteProps> = ({
  currentUser,
  clients,
  rawMaterials,
  products,
  variableExpenses,
  companySettings,
  nextQuoteNumber,
  onAddQuote,
  onAddNewClient,
  onCancel,
}) => {
  // ============================
  //           STATES
  // ============================
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
  const [installation, setInstallation] = useState<number>(0);
  const [installationInput, setInstallationInput] = useState<string>(formatMoneyInputBR(0));
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
        supabase.from("employees").select("total_monthly_cost"),
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

  // ✅ novos campos do modal
  const [newClientAddress, setNewClientAddress] = useState<string>("");
  const [newClientReferencePoint, setNewClientReferencePoint] = useState<string>("");
  const [newClientNotes, setNewClientNotes] = useState<string>("");

  // Categoria ativa
  const [activeCategory, setActiveCategory] = useState<
    "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO"
  >("GRANITO");

  // GRANITO
  const [grMaterialId, setGrMaterialId] = useState<string>("");
  const [grVariantName, setGrVariantName] = useState<string>("");
  const [grPieces, setGrPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [grDescription, setGrDescription] = useState<string>("");

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
  const [alWidth, setAlWidth] = useState<number>(1200);
  const [alHeight, setAlHeight] = useState<number>(1000);
  const [alQuantity, setAlQuantity] = useState<number>(1);
  const [alExtraService, setAlExtraService] = useState<number>(0);
  const [alExtraServiceInput, setAlExtraServiceInput] = useState<string>(formatMoneyInputBR(0));

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
  const [gwWidth, setGwWidth] = useState<number>(1200);
  const [gwHeight, setGwHeight] = useState<number>(1000);
  const [gwTexture, setGwTexture] = useState<string>("Liso");
  const [gwLockType, setGwLockType] = useState<string>("");
  const [gwHandle, setGwHandle] = useState<string>("");
  const [gwHardwareColor, setGwHardwareColor] = useState<string>("Branco");
  const [gwExtraService, setGwExtraService] = useState<number>(0);
  const [gwExtraServiceInput, setGwExtraServiceInput] = useState<string>(formatMoneyInputBR(0));
  const [gwQuantity, setGwQuantity] = useState<number>(1);

 // ---------------------------
  // CORES POR CATEGORIA (BOTÕES)
  // ---------------------------
  const mapCategoryToUsage = (cat: "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO") => {
    switch (cat) {
      case "VIDROS":
        return "VIDRO";
      case "ALUMINIO":
        return "ALUMINIO";
      case "PORTAO":
        return "PORTAO";
      case "GRANITO":
        return "MARMORE"; // ou "GRANITO", depende do que você usa no seu cadastro
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

  const glassProducts = useMemo(() => {
    const norm = (v: string) =>
      String(v || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();

    return products.filter((p) => norm(p.category || "").includes("VIDRO"));
  }, [products]);

  const filteredGlassProducts = useMemo(() => {
    const search = gwProductSearch.trim().toLowerCase();
    if (!search) return glassProducts;
    return glassProducts.filter((p) => p.name.toLowerCase().includes(search));
  }, [glassProducts, gwProductSearch]);

  const aluminumProducts = useMemo(() => {
    return products.filter((product) => normalizeText(product.category || "").includes("ALUMINIO"));
  }, [products]);

  const filteredAluminumProducts = useMemo(() => {
    const search = alProductSearch.trim().toLowerCase();
    if (!search) return aluminumProducts;
    return aluminumProducts.filter((product) => product.name.toLowerCase().includes(search));
  }, [alProductSearch, aluminumProducts]);

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

  const lockOptions = useMemo(() => {
    const fromInventory = rawMaterials
      .filter((m) => normalizeText(m.name).includes("FECHADURA"))
      .map((m) => m.name);
    return Array.from(new Set(fromInventory));
  }, [rawMaterials]);

  const handleOptions = useMemo(() => {
    const fromInventory = rawMaterials
      .filter((m) => normalizeText(m.name).includes("PUXADOR"))
      .map((m) => m.name);
    const fromConstants = HANDLES.map((h) => h.name);
    return Array.from(new Set([...fromConstants, ...fromInventory]));
  }, [rawMaterials]);

  const textureOptions = ["Liso", "Canelado", "Jateado", "Reflecta", "Serigrafado"];

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
    if (activeCategory === "VIDROS" || activeCategory === "ALUMINIO") return;

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
    glassTypeId?: string
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return { price: 0, cost: 0, materialCost: 0, laborCost: 0, absorptionCost: 0 };

    let rawMaterialCost = 0;

    product.composition.forEach((compItem) => {
      const material = rawMaterials.find((m) => m.id === compItem.materialId);
      if (!material) return;

      const costMaterial =
        glassTypeId && isGlassMaterial(material)
          ? rawMaterials.find((m) => String(m.id) === glassTypeId) || material
          : material;

      const variants = getMaterialVariants(costMaterial);

      const colorVariant =
        variants.find((cv) => normalizeText(getVariantName(cv)) === normalizeText(color)) ||
        variants[0];

      if (!colorVariant) return;

      const effectiveVariantCost = getEffectiveMaterialUnitCost(
        costMaterial,
        getVariantCost(colorVariant)
      );

      rawMaterialCost += calculateQuoteCompositionLineCost(
        compItem,
        costMaterial,
        effectiveVariantCost,
        width,
        height
      );
    });

    const laborCostUnit = (product.laborCost || 0);
    const absorptionRate = Number(product.absorptionRate || 0) / 100;
    const absorptionCostUnit = rawMaterialCost * absorptionRate;
    const totalCostOfGoods = rawMaterialCost + laborCostUnit + absorptionCostUnit;

    const profitMargin = product.desiredProfitMargin / 100;
    const variableCostMargin = totalVariablePercent / 100;
    const fixedCostRate = (Number(product.fixedCostRate) > 0 ? Number(product.fixedCostRate) : globalFixedCostRate) / 100;
    const markupDivisor = 1 - variableCostMargin - fixedCostRate - profitMargin;

    const unitPrice =
      markupDivisor > 0 ? totalCostOfGoods / markupDivisor : totalCostOfGoods * 2;

    return {
      price: unitPrice * quantity,
      cost: totalCostOfGoods * quantity,
      materialCost: rawMaterialCost * quantity,
      laborCost: laborCostUnit * quantity,
      absorptionCost: absorptionCostUnit * quantity,
    };
  };


  // ============================
const categories = [
  {
    id: "GRANITO" as const,
    label: "Granito",
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

  const getCalculations = (materialId: string, variantName: string, pieces: any[]) => {
    if (!materialId) {
      return { totalArea: 0, totalPrice: 0, totalCost: 0, productName: "", variantLabel: "" };
    }

    const material = rawMaterials.find((m) => m.id === materialId);
    const product = products.find((p) => p.id === materialId);

    let unitPrice = 0;
    let unitCost = 0;
    let productName = "";
    let variantLabel = variantName;

    if (material) {
      const variants = getMaterialVariants(material);
      const variant =
        variants.find((v) => normalizeText(getVariantName(v)) === normalizeText(variantName)) ||
        variants[0];
      unitPrice = getVariantSalePrice(variant);
      unitCost = getVariantCost(variant);
      productName = material.name;
      variantLabel = getVariantName(variant) || "Padrão";
    } else if (product) {
      const { price, cost } = calculateItemPrice(product.id, 1000, 1000, 1, "Padrão");
      unitPrice = price;
      unitCost = cost;
      productName = product.name;
      variantLabel = "Padrão";
    }

    let totalArea = 0;
    pieces.forEach((piece) => {
      totalArea += piece.length * piece.width * piece.quantity;
    });

    const totalPrice = totalArea * unitPrice;
    const totalCost = totalArea * unitCost;

    return { totalArea, totalPrice, totalCost, productName, variantLabel };
  };

  const handleAddPieceItem = (
    category: string,
    materialId: string,
    variantName: string,
    pieces: any[],
    description: string,
    reset: () => void
  ) => {
if (!ensureColorSelected()) return;

    if (!materialId) return alert("Selecione um produto/material.");

    const { totalArea, totalPrice, totalCost, productName, variantLabel } = getCalculations(
      materialId,
      variantName,
      pieces
    );

    if (totalArea === 0) return alert("Adicione medidas válidas.");

    const piecesDesc = pieces
      .map((p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length.toFixed(2)}m x ${p.width.toFixed(2)}m)`)
      .join("\n");

    const baseDesc = `${productName} ${variantLabel !== "Padrão" ? "- " + variantLabel : ""}`;

    const fullDescription = description.trim()
      ? `${description}\n\n[Detalhamento]\n${piecesDesc}`
      : `${baseDesc}\n\n[Detalhamento]\n${piecesDesc}`;

    const newItem: QuoteItem = {
      id: `qi-${category.toLowerCase()}-${Date.now()}`,
      productId: materialId,
      productName,
      selectedColor: variantLabel,
      description: fullDescription,
      width: 0,
      height: 0,
      quantity: 1,
      price: totalPrice,
      cost: totalCost,
    };

    setItems((prev) => [...prev, newItem]);
    reset();
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

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, absorptionCost: baseAbs } = calculateItemPrice(
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
      absorptionCost: baseAbs,
    };

    setItems((prev) => [...prev, newItem]);
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

    const lockVariant = getMaterialVariants(rawMaterials.find((m) => m.name === gwLockType))[0];
    const lockCost = lockOptions.includes(gwLockType)
      ? Number(getVariantCost(lockVariant) || getVariantSalePrice(lockVariant) || 0)
      : 0;

    const handleFromConstant = HANDLES.find((h) => h.name === gwHandle);
    const handleFromInventory = rawMaterials.find((m) => m.name === gwHandle);
    const handleVariant = getMaterialVariants(handleFromInventory)[0];
    const handleCost =
      Number(handleFromConstant?.cost || 0) ||
      Number(getVariantCost(handleVariant) || getVariantSalePrice(handleVariant) || 0);

    const { price: basePrice, cost: baseCost, materialCost: baseMat, laborCost: baseLab, absorptionCost: baseAbs } = calculateItemPrice(
      gwSelectedProduct,
      gwWidth,
      gwHeight,
      gwQuantity,
      selectedColor,
      gwGlassTypeId
    );
    const extrasPerUnit = lockCost + handleCost + (Number(gwExtraService) || 0);
    const totalExtras = extrasPerUnit * gwQuantity;
    const finalPrice = basePrice + totalExtras;
    const totalCost = baseCost + totalExtras;

   const description = [
      `Tipo de vidro: ${selectedGlassType?.name || "Não informado"}`,
      `Cor do vidro: ${selectedColor || "Não informado"}`,
      `Textura: ${gwTexture || "Padrão"}`,
      `Fechadura: ${gwLockType || "Não informado"}`,
      `Puxador: ${gwHandle || "Não informado"}`,
      `Ferragens: ${gwHardwareColor || "Padrão"}`,
      `Acréscimo por serviço: R$ ${Number(gwExtraService || 0).toFixed(2)}`,
    ].join(" | ");

    const newItem: QuoteItem = {
      id: `qi-glass-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      selectedColor,
      description,
      width: gwWidth,
      height: gwHeight,
      quantity: gwQuantity,
      price: finalPrice,
      cost: totalCost,
      materialCost: baseMat,
      laborCost: baseLab,
      absorptionCost: baseAbs,
    };

    setItems((prev) => [...prev, newItem]);
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

            const { price, cost, materialCost, laborCost, absorptionCost } = calculateItemPrice(
              updatedItem.productId,
              updatedItem.width,
              updatedItem.height,
              updatedItem.quantity,
              updatedItem.selectedColor,
              glassTypeId
            );
            updatedItem.price = price;
            updatedItem.cost = cost;
            updatedItem.materialCost = materialCost;
            updatedItem.laborCost = laborCost;
            updatedItem.absorptionCost = absorptionCost;
          }
        }

        return updatedItem;
      })
    );
  };

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const totalMaterialCost = items.reduce((sum, item) => sum + (item.materialCost ?? 0), 0);
  const totalLaborCost = items.reduce((sum, item) => sum + (item.laborCost ?? 0), 0);
  const totalAbsorptionCost = items.reduce((sum, item) => sum + (item.absorptionCost ?? 0), 0);

// Valor bruto antes do desconto
const grossTotal = subtotal + freight + installation;

// Desconto
const discountPercent = discountMode === "percent" ? Number(discountInput) || 0 : 0;
const discountFixed  = discountMode === "fixed"   ? discount : 0;

// No modo R$: o desconto sai da taxa da maquininha, então o preço ao cliente não muda
// No modo %: desconto reduz o total e a diferença sai da taxa do cartão
const discountValue  = discountMode === "percent"
  ? grossTotal * (discountPercent / 100)
  : 0; // R$: preço final não muda, desconto é absorvido pela taxa do cartão

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

const commissionRate =
  variableExpenses.find((e) =>
    e.name.toLowerCase().includes("comissão")
  )?.value || 0;

const taxRate =
  variableExpenses.find(
    (e) =>
      e.name.toLowerCase().includes("imposto") ||
      e.name.toLowerCase().includes("simples")
  )?.value || 0;

const cardRate =
  variableExpenses.find(
    (e) =>
      e.name.toLowerCase().includes("maquininha") ||
      e.name.toLowerCase().includes("cartão")
  )?.value || 0;

// Taxa de cartão reduzida pelo desconto (desconto sempre vem da taxa do cartão)
// % mode: taxa efetiva = cardRate - discountPercent
// R$ mode: valor bruto da taxa - desconto em R$
const effectiveCardRate = discountMode === "percent"
  ? Math.max(0, cardRate - discountPercent)
  : cardRate;

const commissionValue = totalPrice * (commissionRate / 100);
const taxValue = totalPrice * (taxRate / 100);
// Taxa de cartão sempre calculada (visível independente da forma de pagamento)
// No modo R$: desconto subtrai diretamente do valor da taxa
const cardValue = discountMode === "fixed" && discountFixed > 0
  ? Math.max(0, grossTotal * (cardRate / 100) - discountFixed)
  : totalPrice * (effectiveCardRate / 100);

const fixedCostEstimatePercent = globalFixedCostRate;
const fixedCostValue =
  totalPrice * (fixedCostEstimatePercent / 100);

const netProfit =
  totalPrice -
  totalCostOfGoods -
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
    id: `q${Date.now()}`,
    quoteNumber: nextQuoteNumber,
    clientId: selectedClientId,
    customerName: selectedClient ? selectedClient.name : "Cliente Desconhecido",
    items,
    subtotal,
    discount: discountValue,
    freight,
    installation,
    totalPrice,
    paymentMethod,
    assemblyNotes,
    measurementNotes: finalMeasurementNotes,
    date,
    status: "Pendente",
    salesperson: currentUser.name,
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
  await onAddQuote(newQuote);
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

    setIsSavingClient(true);

    // Tenta salvar no Supabase (várias tabelas/colunas como fallback)
    // Se falhar, prossegue com ID local — o orçamento ainda será gerado
    const TABLE_CANDIDATES = ["clients", "clientes"];
    const COLUMN_SETS = [
      { name: newClientName, phone: newClientPhone || null, notes: newClientNotes || null, street: newClientAddress || null, complement: newClientReferencePoint || null },
      { name: newClientName, phone: newClientPhone || null, notes: newClientNotes || null },
      { name: newClientName, phone: newClientPhone || null },
      { name: newClientName },
    ];

    let savedId: string | null = null;

    outer: for (const tbl of TABLE_CANDIDATES) {
      for (const cols of COLUMN_SETS) {
        const { error } = await supabase.from(tbl as any).insert(cols);
        if (!error) {
          // Busca ID real
          const { data: found } = await supabase
            .from(tbl as any)
            .select("id")
            .eq("name", newClientName)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (found) savedId = String((found as any).id);
          break outer;
        }
        const msg = String(error.message || "").toLowerCase();
        // Se for erro de tabela, tenta próxima tabela
        if (msg.includes("could not find the table") || msg.includes("schema cache")) break;
        // Se for erro de coluna, tenta próximo conjunto de colunas
        if (!msg.includes("column")) break; // outro erro — abandona
      }
    }

    setIsSavingClient(false);

    const clientId = savedId ?? `local_${Date.now()}`;
    const newClient: Client = {
      id: clientId,
      name: newClientName,
      phone: newClientPhone || undefined,
      notes: newClientNotes || undefined,
      address: {
        street: newClientAddress || undefined,
        referencePoint: newClientReferencePoint || undefined,
      },
    };

    onAddNewClient(newClient);
    setSelectedClientId(clientId);

    setIsClientModalOpen(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientAddress("");
    setNewClientReferencePoint("");
    setNewClientNotes("");
  };

  // ============================
  //  COMPONENTE REUTILIZÁVEL DE PEÇAS
  // ============================
  const renderMultiPieceCalculator = ({
    materialId,
    setMaterialId,
    variantName,
    setVariantName,
    pieces,
    setPieces,
    description,
    setDescription,
    onAdd,
    categoryFilter,
    showProductGrid = false,
    isGridVisible = true,
    setIsGridVisible = (_v: boolean) => {},
  }: any) => {
    const calculations = getCalculations(materialId, variantName, pieces);

    const availableItems =
      categoryFilter === "GRANITO"
        ? rawMaterials.filter((m) => m.usageCategory === "Chapa/Placa")
        : products.filter((p) =>
            (p.category || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase()
              .includes(
                categoryFilter
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()
              )
          );

           return (
      <div className="space-y-4">
        {showProductGrid && !isGridVisible && (
          <button
            onClick={() => setIsGridVisible(true)}
            className="mb-4 flex items-center gap-2 text-primary-600 font-medium hover:underline"
          >
            <Icon className="w-4 h-4">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </Icon>
            Mostrar Catálogo de Produtos
          </button>
        )}

        {(!showProductGrid || isGridVisible) && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">
                  Produto / Material
                </label>
                <select
                  value={materialId}
                  onChange={(e) => {
                    setMaterialId(e.target.value);
                    const mat = rawMaterials.find((m) => m.id === e.target.value);
                    const firstVariantName = getVariantName(getMaterialVariants(mat)[0]);
                    if (mat && firstVariantName) setVariantName(firstVariantName);
                    if (!mat || !firstVariantName) setVariantName("Padrão");
                  }}
                  className="w-full h-12 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-medium shadow-sm focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                >
                  <option value="" className="bg-white text-gray-900">
                    Selecione o Item
                  </option>
                  {availableItems.map((item: any) => (
                    <option key={item.id} value={item.id} className="bg-white text-gray-900">
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Comprimento</div>
              <div className="col-span-3">Largura</div>
              <div className="col-span-2">Qtd</div>
              <div className="col-span-2">M²</div>
              <div className="col-span-2">Valor</div>
            </div>

            {pieces.map((piece: any, index: number) => {
              const pieceM2 = piece.length * piece.width * piece.quantity;
              const unitPrice =
                calculations.totalArea > 0 ? calculations.totalPrice / calculations.totalArea : 0;
              const pieceValue = pieceM2 * unitPrice;

              return (
                <div key={piece.id} className="grid grid-cols-12 gap-2 items-center relative group">
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={piece.length || ""}
                      onChange={(e) =>
                        updatePiece(index, "length", parseFloat(e.target.value), setPieces, pieces)
                      }
                      className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={piece.width || ""}
                      onChange={(e) =>
                        updatePiece(index, "width", parseFloat(e.target.value), setPieces, pieces)
                      }
                      className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={piece.quantity}
                      onChange={(e) =>
                        updatePiece(index, "quantity", parseInt(e.target.value), setPieces, pieces)
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
                      {pieceValue.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {pieces.length > 1 && (
                    <button
                      onClick={() => removePiece(index, setPieces, pieces)}
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

            <div className="flex justify-end">
              <button
                onClick={() => addPiece(setPieces, pieces)}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-md"
              >
                + ADICIONAR MEDIDA
              </button>
            </div>

            <div className="w-full">
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 h-24 border rounded-lg bg-primary-600 text-white border-primary-500 placeholder-blue-200 focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 resize-none"
                placeholder="Descreva os detalhes do produto..."
              />
            </div>

            <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4 border-t border-gray-200">
              <div className="text-right">
                <span className="block text-xs text-gray-500 uppercase font-bold mb-1">TOTAL GERAL</span>
                <div className="px-4 py-2 bg-primary-900 text-white rounded-lg text-2xl font-bold shadow-md">
                  R{" "}
                  {calculations.totalPrice.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>

              <button
                onClick={onAdd}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95 uppercase text-sm flex items-center gap-2 h-full"
              >
                <Icon className="w-5 h-5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </Icon>
                Adicionar ao Orçamento
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ============================
  //            JSX
  // ============================
  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Novo Orçamento</h2>
          <p className="text-sm text-gray-500">
            Preencha os dados do cliente, adicione os itens e salve para gerar o orçamento.
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
            Salvar Orçamento
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
      </div>

      {/* PRODUCT BUILDER + CATEGORIAS EM CARDS */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Selecione o tipo de orçamento</h3>
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Categorias</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

        {activeCategory === "GRANITO" &&
          renderMultiPieceCalculator({
            materialId: grMaterialId,
            setMaterialId: setGrMaterialId,
            variantName: grVariantName,
            setVariantName: setGrVariantName,
            pieces: grPieces,
            setPieces: setGrPieces,
            description: grDescription,
            setDescription: setGrDescription,
            onAdd: () =>
              handleAddPieceItem("GRANITO", grMaterialId, grVariantName, grPieces, grDescription, () => {
                setGrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
                setGrDescription("");
              }),
            categoryFilter: "GRANITO",
          })}
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
                    value={alHeight}
                    onChange={(e) => setAlHeight(Number(e.target.value) || 0)}
                    className="w-full h-11 px-3 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Largura (mm)</label>
                  <input
                    type="number"
                    value={alWidth}
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
                      ? "border-primary-600 bg-primary-50"
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
                    <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.category || "Alumínio"}</p>
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

{(activeCategory === "GRANITO" || activeCategory === "PORTAO") && (
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
                  <input type="number" value={gwHeight} onChange={(e) => setGwHeight(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Largura (mm)</label>
                  <input type="number" value={gwWidth} onChange={(e) => setGwWidth(Number(e.target.value) || 0)} className="w-full h-11 px-3 border rounded-lg text-gray-900" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-auto pr-1">
              {filteredGlassProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setGwSelectedProduct(product.id)}
                  className={`p-3 border rounded-lg text-left flex gap-3 items-center ${gwSelectedProduct === product.id ? "border-primary-600 bg-primary-50" : "border-gray-200 bg-white"}`}
                >
                  <div className="w-14 h-14 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">Sem foto</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.category || "Vidros"}</p>
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
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Tipo de Fechadura</label>
                <select value={gwLockType} onChange={(e) => setGwLockType(e.target.value)} className="w-full h-11 px-3 border rounded-lg text-gray-900">
                  <option value="">Selecione</option>
                  {lockOptions.map((lock) => (
                    <option key={lock} value={lock}>{lock}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Modelo de Puxador</label>
                <select value={gwHandle} onChange={(e) => setGwHandle(e.target.value)} className="w-full h-11 px-3 border rounded-lg text-gray-900">
                  <option value="">Selecione</option>
                  {handleOptions.map((handle) => (
                    <option key={handle} value={handle}>{handle}</option>
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
                  <th className="px-3 py-2 text-center">Larg. (mm)</th>
                  <th className="px-3 py-2 text-center">Alt. (mm)</th>
                  <th className="px-3 py-2 text-center">Qtd</th>
                  <th className="px-3 py-2 text-right">Valor</th>
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
                          value={item.width}
                          onChange={(e) => handleItemChange(item.id, "width", Number(e.target.value) || 0)}
                          className="w-20 border rounded px-2 py-1 text-sm text-gray-900 text-center"
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
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value) || 1)}
                          className="w-16 border rounded px-2 py-1 text-sm text-gray-900 text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      <td className="px-3 py-2 text-center text-gray-600">{item.width || "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.height || "—"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">
                        R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {discountMode === "fixed" && discountFixed > 0 && (
                <p className="text-xs text-gray-500">
                  Desconto de R$ {discountFixed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} absorvido pela taxa da maquininha
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
          const contribuicao = totalPrice - totalCostOfGoods - variableCosts;
          const contribuicaoPct = totalPrice > 0 ? (contribuicao / totalPrice) * 100 : 0;
          return (
            <div className="mt-6 border-l-4 border-yellow-400 bg-yellow-50 p-5 rounded-r-lg shadow-sm">
              <h4 className="text-md font-semibold text-yellow-800 mb-4">
                Detalhamento Financeiro do Orçamento (Admin)
              </h4>

              <div className="space-y-1 text-sm max-w-lg">
                {/* Custos de produção */}
                <div className="flex justify-between text-gray-700">
                  <span>Custo matéria-prima:</span>
                  <span className="font-medium">R$ {fmt(totalMaterialCost)}</span>
                </div>
                {totalLaborCost > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Mão de obra:</span>
                    <span className="font-medium">R$ {fmt(totalLaborCost)}</span>
                  </div>
                )}
                {totalAbsorptionCost > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Rateio por absorção:</span>
                    <span className="font-medium">R$ {fmt(totalAbsorptionCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-800 font-semibold border-t border-yellow-300 pt-1 mt-1">
                  <span>CMV total:</span>
                  <span>R$ {fmt(totalCostOfGoods)}</span>
                </div>

                {/* Custos percentuais */}
                <div className="pt-1 space-y-1">
                  {taxRate > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Impostos ({taxRate}%):</span>
                      <span className="font-medium">R$ {fmt(taxValue)}</span>
                    </div>
                  )}
                  {commissionRate > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Comissão vendedora ({commissionRate}%):</span>
                      <span className="font-medium">R$ {fmt(commissionValue)}</span>
                    </div>
                  )}
                  {discountValue > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Desconto{discountMode === "percent" ? ` (${discountPercent}%)` : ""}:</span>
                      <span className="font-medium">- R$ {fmt(discountValue)}</span>
                    </div>
                  )}
                  {cardRate > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>
                        Taxa de cartão ({discountMode === "percent" && discountPercent > 0
                          ? `${cardRate}% − ${discountPercent}% = ${effectiveCardRate.toFixed(2)}%`
                          : discountMode === "fixed" && discountFixed > 0
                            ? `${cardRate}% − R$ ${fmt(discountFixed)}`
                            : `${cardRate}%`}):
                      </span>
                      <span className="font-medium">R$ {fmt(cardValue)}</span>
                    </div>
                  )}
                  {fixedCostEstimatePercent > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Custos fixos ({fixedCostEstimatePercent}%):</span>
                      <span className="font-medium">R$ {fmt(fixedCostValue)}</span>
                    </div>
                  )}
                  {referralCommissionRate > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Comissão de indicação ({referralCommissionRate}%):</span>
                      <span className="font-medium">R$ {fmt(referralCommissionValue)}</span>
                    </div>
                  )}
                  {freight > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Frete:</span>
                      <span className="font-medium">R$ {fmt(freight)}</span>
                    </div>
                  )}
                  {installation > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Instalação:</span>
                      <span className="font-medium">R$ {fmt(installation)}</span>
                    </div>
                  )}
                </div>

                {/* Preço total */}
                <div className="flex justify-between text-blue-700 bg-blue-50 rounded px-2 py-1 font-bold border border-blue-200 mt-2">
                  <span>Preço total do orçamento:</span>
                  <span>R$ {fmt(totalPrice)}</span>
                </div>

                {/* Lucro líquido */}
                <div className={`flex justify-between font-bold border-t border-yellow-300 pt-2 mt-2 ${netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  <span>Lucro líquido estimado:</span>
                  <span>R$ {fmt(netProfit)}</span>
                </div>
                <div className={`flex justify-between text-sm font-semibold ${netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  <span>Margem de lucro:</span>
                  <span>{netProfitMargin.toFixed(2)}%</span>
                </div>

                {/* Margem de contribuição */}
                <div className="flex justify-between text-gray-800 font-semibold pt-1">
                  <span>Margem de contribuição:</span>
                  <span>R$ {fmt(contribuicao)} <span className="text-xs font-normal text-gray-500">({contribuicaoPct.toFixed(2)}%)</span></span>
                </div>
              </div>
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
      {showPDFPreview && savedQuote && (
        <div className="fixed inset-0 z-50 overflow-auto" style={{ background: "#e8eaf0" }}>
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
                    / {new Date((savedQuote.date || "") + "T12:00:00").getFullYear()}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Data</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#3d4166", marginTop: 1 }}>
                  {new Date((savedQuote.date || "") + "T12:00:00").toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>

            {/* Client band */}
            <div className="px-10 py-4" style={{ background: "#fff", borderBottom: "1px solid #eef0f7" }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8892b0", fontWeight: 600 }}>Cliente</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1f36", marginTop: 2 }}>{savedQuote.customerName || "—"}</div>
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
                            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{wDisp} × {hDisp}</div>
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
                  {new Date((savedQuote.date || "") + "T12:00:00").toLocaleDateString("pt-BR")}
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
      )}

      {/* Modal cliente rápido */}
      {isClientModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Adicionar Novo Cliente Rápido</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>
              {/* ✅ NOVOS CAMPOS */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Endereço</label>
                <input
                  type="text"
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Rua, número, bairro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Ponto de Referência</label>
                <input
                  type="text"
                  value={newClientReferencePoint}
                  onChange={(e) => setNewClientReferencePoint(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Ex: Próximo ao mercado"
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
    </div>
  );
};

export default NewQuote;
