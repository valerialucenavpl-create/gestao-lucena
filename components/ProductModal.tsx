import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  InventoryItem,
  Product,
  ProductCompositionAdjustmentMode,
  ProductCompositionAxis,
  ProductCompositionItem,
  ProductCompositionQuantityMode,
  User,
  VariableExpense,
} from "../types";
import { RAW_MATERIALS_DATA } from "../constants";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { enrichMaterialRowsWithPhotoUrls } from "../utils/materialPhoto";
import { resolveMaterialPurchaseLengthMeters } from "../utils/materialPurchaseLength";
import {
  CompositionLineBreakdown,
  buildCompositionFormulaPreview,
  getCompositionLineBreakdown,
  isLambrilMaterialName,
} from "../utils/productComposition";
import { supabase } from "../services/supabase";

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (productData: Omit<Product, "id">) => void;
  rawMaterials: InventoryItem[];
  variableExpenses: VariableExpense[];
  currentUser: User;
}

const categories = [
  "VIDRO",
  "ESTRUTURA",
  "ALUMINIO",
  "ACESSORIO VIDRO",
  "ACESSORIO DE ALUMINIO",
  "FERRO PORTAO AUTOMATICO",
  "ACESSORIOS PORTAO AUTOMATICO",
  "MOTOR RESIDENCIAL",
  "MOTOR PORTAO AUTOMATICO",
  "ACESSORIO DE MOTOR",
  "MARMORE",
  "ACESSORIO DE MARMORE",
];

const productStructureByCategory: Record<
  string,
  { products: string[]; subCategory1: string[]; subCategory2: string[]; subCategory3: string[] }
> = {
  ALUMINIO: {
    products: ["Portao", "Porta", "Grade", "Janela", "Acessorio"],
    subCategory1: ["2 Folhas", "3 Folhas", "Correr", "Basculante", "Abrir", "Fixo", "Vidro", "Portao", "Porta", "Aluminio", "Padrão"],
    subCategory2: ["Com Porta", "Sem Porta", "Fixa", "Padrão"],
    subCategory3: [],
  },
  VIDRO: {
    products: [
      "Porta",
      "Janela",
      "Box",
      "Pivotante",
      "Basculante",
      "Vidro Fixo",
      "Fachada",
      "Tampo de Mesa",
      "Kit Pia",
    ],
    subCategory1: ["Correr", "Basculante", "Pivotante", "Fixo", "Canto", "Frontal"],
    subCategory2: ["Com Bandeirola", "Sem Bandeirola", "Com Estrutura", "Sem Estrutura", "Fixo PU", "Fixo Ferragem"],
    subCategory3: ["PU", "Ferragem"],
  },
  MARMORE: {
    products: [
      "Pia",
      "Bancada",
      "Balcao",
      "Mesa",
      "Soleira",
      "Batente",
      "Nicho",
      "Divisoria",
    ],
    subCategory1: [],
    subCategory2: [],
    subCategory3: [],
  },
};

type MaterialVariant = {
  name?: string;
  color_name?: string;
  variant_name?: string;
  color?: string;
  cost?: number;
  cost_price?: number;
  price?: number;
  value?: number;
  salePrice?: number;
  sale_price?: number;
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const getVariantName = (variant?: MaterialVariant | null) =>
  String(
    variant?.name ??
      variant?.color_name ??
      variant?.variant_name ??
      variant?.color ??
      ""
  ).trim();

const getVariantCost = (variant?: MaterialVariant | null) =>
  Number(
    variant?.cost ??
      variant?.cost_price ??
      variant?.price ??
      variant?.value ??
      0
  );

const getMaterialVariants = (material?: InventoryItem | null) => {
  if (!material) return [];

  const variants =
    (material as any)?.colorVariants ??
    (material as any)?.color_variants ??
    (material as any)?.inventory_variants ??
    [];

  if (!Array.isArray(variants)) return [];

  return variants
    .map((variant: any) => {
      const name = getVariantName(variant);
      if (!name) return null;

      const cost = getVariantCost(variant);
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
        ...variant,
        name,
        cost: Number.isFinite(cost) ? cost : 0,
        salePrice: Number.isFinite(salePrice) ? salePrice : 0,
      };
    })
    .filter(Boolean);
};

const normalizeComposition = (value: unknown): ProductCompositionItem[] => {
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

const resolveProductFamily = (category: string) => {
  const normalized = normalizeText(category);
  if (normalized.includes("ALUMINIO")) return "ALUMINIO";
  if (normalized.includes("VIDRO")) return "VIDRO";
  if (normalized.includes("MARMORE")) return "MARMORE";
  return "";
};

const getMaterialLine = (material?: InventoryItem | null) =>
  String(
    (material as any)?.usageCategory ??
      (material as any)?.usage_category ??
      (material as any)?.category_name ??
      (material as any)?.category ??
      ""
  ).trim();

const getMaterialPhoto = (material?: InventoryItem | null) => {
  const directPhoto = String(
    (material as any)?.photo_url ??
      (material as any)?.image_url ??
      (material as any)?.photo ??
      (material as any)?.image ??
      ""
  ).trim();

  if (/^https?:\/\//i.test(directPhoto)) {
    return directPhoto;
  }

  return "";
};

const getMaterialBaseCost = (material?: InventoryItem | null) =>
  getEffectiveMaterialUnitCost(
    material,
    Number(
      (material as any)?.cost ??
        (material as any)?.cost_price ??
        (material as any)?.price ??
        (material as any)?.value ??
        0
    )
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

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatQuantity = (value: number, unit: string) =>
  `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} ${unit}`;

const getPositiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed >= 0 ? parsed : fallback;
};

const getPositiveInteger = (value: unknown, fallback = 1) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 0 ? parsed : fallback;
};

const buildDefaultDraft = (material?: InventoryItem | null): ProductCompositionItem => {
  const variants = getMaterialVariants(material);
  const firstVariantName = variants[0]?.name ? String(variants[0].name).trim() : "";
  const isLambril = isLambrilMaterialName(material?.name);

  return {
    id: `comp-${Date.now()}`,
    materialId: material?.id || "",
    rule: isLambril ? "fill" : "height_multiplier",
    variantName: firstVariantName,
    applyOn: isLambril ? "width" : "height",
    adjustmentType: "none",
    adjustmentMm: 0,
    divideBy: 1,
    multiplyBy: 1,
    quantityMode: isLambril ? "made_to_measure" : "normal",
    quantity: 1,
    measureFormula: {
      target: isLambril ? "height" : "width",
      intervalMm: 120,
      spanPercent: 100,
    },
  };
};

const hydrateCompositionItem = (
  item: ProductCompositionItem,
  material?: InventoryItem | null
): ProductCompositionItem => {
  const baseDraft = buildDefaultDraft(material);
  const inferredApplyOn: ProductCompositionAxis =
    item.applyOn ??
    (item.rule === "height_multiplier" ? "height" : "width");

  const inferredQuantityMode: ProductCompositionQuantityMode =
    item.quantityMode ?? (item.rule === "fill" ? "made_to_measure" : "normal");

  const inferredMeasureTarget: ProductCompositionAxis =
    item.measureFormula?.target ??
    (item.rule === "fill" ? "height" : inferredApplyOn === "height" ? "width" : "height");

  const inferredInterval =
    getPositiveNumber(item.measureFormula?.intervalMm) ||
    getPositiveNumber(item.factor) ||
    120;

  const inferredSpanPercent = Math.min(
    100,
    getPositiveNumber(item.measureFormula?.spanPercent, 100) || 100
  );

  return {
    ...baseDraft,
    ...item,
    materialId: item.materialId,
    variantName: item.variantName || baseDraft.variantName,
    applyOn: inferredApplyOn,
    adjustmentType:
      (item.adjustmentType as ProductCompositionAdjustmentMode) || "none",
    adjustmentMm: getPositiveNumber(item.adjustmentMm),
    divideBy: getPositiveNumber(item.divideBy, 1) || 1,
    multiplyBy: getPositiveNumber(item.multiplyBy, 1) || 1,
    quantityMode: inferredQuantityMode,
    quantity: getPositiveNumber(item.quantity, 1) || 1,
    measureFormula: {
      target: inferredMeasureTarget,
      intervalMm: inferredInterval,
      spanPercent: inferredSpanPercent,
    },
  };
};

const buildStoredCompositionItem = (
  item: ProductCompositionItem,
  material?: InventoryItem | null
): ProductCompositionItem => {
  const unit = String(material?.unit ?? "un").trim();
  const quantityMode = item.quantityMode || "normal";
  const applyOn = item.applyOn || "height";
  const quantity = getPositiveNumber(item.quantity, 1) || 1;
  const intervalMm = getPositiveInteger(item.measureFormula?.intervalMm, 120);
  const spanPercent = Math.min(100, getPositiveNumber(item.measureFormula?.spanPercent, 100) || 100);

  let rule: ProductCompositionItem["rule"] = "fixed_quantity";
  if (quantityMode === "made_to_measure") {
    rule = "fill";
  } else if ((applyOn as string) === "area") {
    rule = "area_multiplier";
  } else if (unit === "m" || unit === "cm" || unit === "mm") {
    rule = applyOn === "height" ? "height_multiplier" : "width_multiplier";
  } else if (unit === "m²") {
    rule = "area_multiplier";
  }

  return {
    ...item,
    rule,
    applyOn,
    adjustmentType: item.adjustmentType || "none",
    adjustmentMm: getPositiveNumber(item.adjustmentMm),
    divideBy: getPositiveNumber(item.divideBy, 1) || 1,
    multiplyBy: getPositiveNumber(item.multiplyBy, 1) || 1,
    quantityMode,
    quantity,
    factor: quantityMode === "made_to_measure" ? intervalMm : undefined,
    measureFormula: {
      target: item.measureFormula?.target || (applyOn === "height" ? "width" : "height"),
      intervalMm,
      spanPercent,
    },
    variantName: item.variantName || "",
  };
};

const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onSave,
  rawMaterials,
  variableExpenses,
  currentUser: _currentUser,
}) => {
  const initialHourlyRate = Number((product as any)?.hourlyRate ?? 0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setShowExitConfirm(true); }
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, []);

  const [name, setName] = useState(String((product as any)?.name || ""));
  const [category, setCategory] = useState(
    String((product as any)?.category || (product as any)?.productCategory || categories[0] || "")
  );
  const [image, setImage] = useState(String((product as any)?.image || ""));
  const [composition, setComposition] = useState<ProductCompositionItem[]>(
    normalizeComposition((product as any)?.composition)
  );
  const [desiredProfitMargin, setDesiredProfitMargin] = useState(
    Number((product as any)?.desiredProfitMargin ?? 20)
  );
  // input type="number" não aceita vírgula (padrão BR) como separador
  // decimal — o navegador rejeita a digitação. Por isso a margem usa o
  // mesmo padrão texto+sanitize já usado nos campos de dinheiro (R$).
  const [desiredProfitMarginInput, setDesiredProfitMarginInput] = useState(
    formatMoneyInputBR(Number((product as any)?.desiredProfitMargin ?? 20))
  );
  const [marginByColor, setMarginByColor] = useState<Record<string, number>>(
    { ...((product as any)?.marginByColor || {}) }
  );
  const [marginByColorInput, setMarginByColorInput] = useState<Record<string, string>>({});
  const [minProfitValue, setMinProfitValue] = useState(
    Number((product as any)?.minProfitValue ?? 0)
  );
  const [minProfitValueInput, setMinProfitValueInput] = useState(
    formatMoneyInputBR(Number((product as any)?.minProfitValue ?? 0))
  );
  // Preço final travado manualmente, agora por cor — cada cor pode ter seu
  // próprio valor fixo, em vez de um único preço pra o produto inteiro.
  const [fixedSalePriceByColor, setFixedSalePriceByColor] = useState<Record<string, number>>(
    { ...((product as any)?.fixedSalePriceByColor || {}) }
  );
  const [priceInputByColor, setPriceInputByColor] = useState<Record<string, string>>({});
  const [editingPriceColor, setEditingPriceColor] = useState<string | null>(null);
  // Preço de venda por m², por cor — pra produtos que variam por área (ex.:
  // chapas de mármore). Quando preenchido, tem prioridade sobre o preço
  // final fixo: o total passa a ser esse valor multiplicado pela área da
  // peça informada no orçamento, em vez de um valor travado.
  const [pricePerSqmByColor, setPricePerSqmByColor] = useState<Record<string, number>>(
    { ...((product as any)?.pricePerSqmByColor || {}) }
  );
  const [sqmPriceInputByColor, setSqmPriceInputByColor] = useState<Record<string, string>>({});
  const [productionHours, setProductionHours] = useState(
    Number((product as any)?.productionHours ?? 0)
  );
  const [assemblyHours, setAssemblyHours] = useState(
    Number((product as any)?.assemblyHours ?? 0)
  );
  const [hourlyRate, setHourlyRate] = useState(initialHourlyRate);
  const [hourlyRateInput, setHourlyRateInput] = useState(
    formatMoneyInputBR(initialHourlyRate)
  );

  // Mão de obra detalhada
  const [professionalCount, setProfessionalCount] = useState(Number((product as any)?.professionalCount ?? 1));
  const [professionalHours, setProfessionalHours] = useState(Number((product as any)?.professionalHours ?? 0));
  const [professionalRateInput, setProfessionalRateInput] = useState(formatMoneyInputBR(Number((product as any)?.professionalRate ?? 0)));
  const [professionalRate, setProfessionalRate] = useState(Number((product as any)?.professionalRate ?? 0));
  const [helperCount, setHelperCount] = useState(Number((product as any)?.helperCount ?? 1));
  const [helperHours, setHelperHours] = useState(Number((product as any)?.helperHours ?? 0));
  const [helperRateInput, setHelperRateInput] = useState(formatMoneyInputBR(Number((product as any)?.helperRate ?? 0)));
  const [helperRate, setHelperRate] = useState(Number((product as any)?.helperRate ?? 0));
  // Instalação — profissional
  const [instProfCount, setInstProfCount] = useState(Number((product as any)?.instProfCount ?? 1));
  const [instProfInstHours, setInstProfInstHours] = useState(Number((product as any)?.instProfInstHours ?? 0));
  const [instProfRateInput, setInstProfRateInput] = useState(formatMoneyInputBR(Number((product as any)?.instProfRate ?? 0)));
  const [instProfRate, setInstProfRate] = useState(Number((product as any)?.instProfRate ?? 0));
  // Instalação — ajudante
  const [instHelpCount, setInstHelpCount] = useState(Number((product as any)?.instHelpCount ?? 1));
  const [instHelpInstHours, setInstHelpInstHours] = useState(Number((product as any)?.instHelpInstHours ?? 0));
  const [instHelpRateInput, setInstHelpRateInput] = useState(formatMoneyInputBR(Number((product as any)?.instHelpRate ?? 0)));
  const [instHelpRate, setInstHelpRate] = useState(Number((product as any)?.instHelpRate ?? 0));
  const [fixedCostRate, setFixedCostRate] = useState(
    Number((product as any)?.fixedCostRate ?? 20)
  );
  const [avgMarmoreHourlyRate, setAvgMarmoreHourlyRate] = useState(0);
  const [avgVidroProfessionalHourlyRate, setAvgVidroProfessionalHourlyRate] = useState(0);
  const [avgHelperHourlyRate, setAvgHelperHourlyRate] = useState(0);
  const [laborSector, setLaborSector] = useState<string>(
    String((product as any)?.laborSector || resolveProductFamily(category) || "VIDRO")
  );
  const avgProfessionalHourlyRate = laborSector === "MARMORE" ? avgMarmoreHourlyRate : avgVidroProfessionalHourlyRate;
  const [quantity, setQuantity] = useState(
    Number((product as any)?.quantityReference ?? 1)
  );
  const [productCategory, setProductCategory] = useState(
    String((product as any)?.productCategory || "")
  );
  const [productType, setProductType] = useState(
    String((product as any)?.productType || "")
  );
  const [productSubCategory1, setProductSubCategory1] = useState(
    String((product as any)?.productSubCategory1 || "")
  );
  const [productSubCategory2, setProductSubCategory2] = useState(
    String((product as any)?.productSubCategory2 || "")
  );
  const [productSubCategory3, setProductSubCategory3] = useState(
    String((product as any)?.productSubCategory3 || "")
  );
  const [selectedCategoryColor] = useState(
    String((product as any)?.selectedCategoryColor || "")
  );
  const [referenceWidthMm, setReferenceWidthMm] = useState(
    Number((product as any)?.referenceWidthMm ?? 3000)
  );
  const [referenceHeightMm, setReferenceHeightMm] = useState(
    Number((product as any)?.referenceHeightMm ?? 2000)
  );
  const [widthIncrement, setWidthIncrement] = useState(
    Number((product as any)?.widthIncrement ?? 0)
  );
  const [heightIncrement, setHeightIncrement] = useState(
    Number((product as any)?.heightIncrement ?? 0)
  );
  const [dbRawMaterials, setDbRawMaterials] = useState<InventoryItem[]>([]);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [draftItem, setDraftItem] = useState<ProductCompositionItem | null>(null);
  const [draftQtyInput, setDraftQtyInput] = useState<string>("1");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const productImageInputId = "product-modal-image-upload";

  useEffect(() => {
    let active = true;

    const loadInventoryForProductModal = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*, inventory_variants(*)");

      if (error || !Array.isArray(data) || !active) return;

      const rowsWithPhotos = await enrichMaterialRowsWithPhotoUrls(
        data as Record<string, unknown>[]
      );
      if (!active) return;

      const normalized = rowsWithPhotos
        .map((item: any) => ({
          ...item,
          id: String(item?.id ?? ""),
          name: String(item?.name ?? item?.material_name ?? "").trim(),
          unit: String(item?.unit ?? "un") as InventoryItem["unit"],
          usageCategory: item?.usageCategory ?? item?.usage_category ?? "",
          purchaseLengthMeters: resolveMaterialPurchaseLengthMeters(
            item as Record<string, unknown>
          ),
          colorVariants: getMaterialVariants(item as InventoryItem),
        }))
        .filter((item) => item.name)
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
            sensitivity: "base",
          })
        );

      setDbRawMaterials(normalized as InventoryItem[]);
    };

    loadInventoryForProductModal();

    // Auto-load fixedCostRate e taxa média de produção
    const loadFixedCostRate = async () => {
      const [settingsRes, fixedRes, empRes] = await Promise.all([
        supabase.from("billing_settings").select("monthly_revenue_target, work_days, hours_per_day").order("updated_at", { ascending: false }).limit(1),
        supabase.from("fixed_expenses").select("value"),
        // v_custo_pessoal: view com o custo de pessoal agregado por setor+função.
        // Substitui a leitura direta de "employees" (restrita a Admin/Financeiro
        // pelo RLS). Cada linha representa VÁRIAS pessoas — por isso trazemos
        // "headcount", usado abaixo para calcular a média por pessoa.
        supabase.from("v_custo_pessoal").select("total_monthly_cost, department, monthly_hours, role, headcount"),
      ]);
      if (!active) return;

      const monthlyRevenue = Number(settingsRes.data?.[0]?.monthly_revenue_target || 0);
      const workDays = Number(settingsRes.data?.[0]?.work_days || 22);
      const hoursPerDay = Number(settingsRes.data?.[0]?.hours_per_day || 8);
      const monthlyProductiveHours = workDays * hoursPerDay;

      const fixedTotal = (fixedRes.data || []).reduce((s: number, f: any) => s + Number(f.value || 0), 0);

      const allEmployees = empRes.data || [];
      // Custo fixo: só ADM + Vendas (produção cobrada via MO por produto)
      const empTotal = allEmployees
        .filter((e: any) => e.department !== "Produção")
        .reduce((s: number, e: any) => s + Number(e.total_monthly_cost || 0), 0);

      if (monthlyRevenue > 0) {
        setFixedCostRate(Number(((fixedTotal + empTotal) / monthlyRevenue * 100).toFixed(2)));
      }

      // Taxa horária média por setor de mão de obra
      const MARMORE_ROLES = ["MARMORISTA DE PRODUÇÃO"].map(normalizeText);
      const VIDRO_PROFESSIONAL_ROLES = ["SERRALHEIRO DE PRODUÇÃO", "INSTALADOR"].map(normalizeText);
      const HELPER_ROLES = ["AUXILIAR DE PRODUÇÃO", "AUXILIAR DE INSTALAÇÃO"].map(normalizeText);

      const avgHourlyRateFor = (roles: string[]) => {
        const employeesInRoles = allEmployees.filter((e: any) =>
          roles.includes(normalizeText(e.role || ""))
        );
        if (employeesInRoles.length === 0) return 0;

        // Cada linha da view "v_custo_pessoal" agrupa várias pessoas da mesma
        // função. Dividir pelo número de LINHAS daria uma média errada — tem
        // que dividir pelo número de PESSOAS (headcount). O fallback "|| 1"
        // mantém o cálculo correto caso a origem volte a ser 1 linha = 1 pessoa.
        const totalPessoas = employeesInRoles.reduce(
          (s: number, e: any) => s + (Number(e.headcount) || 1),
          0
        );
        if (totalPessoas === 0) return 0;

        const custoTotal = employeesInRoles.reduce(
          (s: number, e: any) => s + Number(e.total_monthly_cost || 0),
          0
        );
        const avgMonthlyCost = custoTotal / totalPessoas;

        // monthly_hours na view já é a MÉDIA de horas por pessoa daquela função.
        const hoursRef = Number(employeesInRoles[0].monthly_hours || monthlyProductiveHours || 176);
        return Number((avgMonthlyCost / hoursRef).toFixed(2));
      };

      setAvgMarmoreHourlyRate(avgHourlyRateFor(MARMORE_ROLES));
      setAvgVidroProfessionalHourlyRate(avgHourlyRateFor(VIDRO_PROFESSIONAL_ROLES));
      setAvgHelperHourlyRate(avgHourlyRateFor(HELPER_ROLES));
    };
    loadFixedCostRate();

    return () => {
      active = false;
    };
  }, []);

  const materialCatalog = useMemo<InventoryItem[]>(() => {
    const normalizeCatalogItem = (item: any, fallbackPrefix: string) => ({
      ...item,
      id:
        String(item?.id ?? "").trim() ||
        `${fallbackPrefix}-${normalizeText(
          item?.name ?? item?.material_name ?? "item"
        ).replace(/\s+/g, "-")}-${normalizeText(item?.unit ?? "un")}`,
      name: String(item?.name ?? item?.material_name ?? "").trim(),
      unit: String(item?.unit ?? "un") as InventoryItem["unit"],
      usageCategory: item?.usageCategory ?? item?.usage_category ?? "",
      purchaseLengthMeters: resolveMaterialPurchaseLengthMeters(
        item as Record<string, unknown>
      ),
      colorVariants: getMaterialVariants(item as InventoryItem).sort(
        (a: any, b: any) =>
          getVariantName(a).localeCompare(getVariantName(b), "pt-BR", {
            sensitivity: "base",
          })
      ),
    });

    const mergeCatalogItems = (current: InventoryItem, incoming: InventoryItem) => {
      const incomingPhoto = getMaterialPhoto(incoming);
      const currentPhoto = getMaterialPhoto(current);
      const incomingVariants = getMaterialVariants(incoming);
      const currentVariants = getMaterialVariants(current);
      const incomingPurchaseLength = getMaterialPurchaseLengthMeters(incoming);
      const currentPurchaseLength = getMaterialPurchaseLengthMeters(current);

      return {
        ...current,
        ...incoming,
        usageCategory: getMaterialLine(incoming) || getMaterialLine(current),
        purchaseLengthMeters:
          incomingPurchaseLength > 0 ? incomingPurchaseLength : currentPurchaseLength,
        colorVariants:
          incomingVariants.length > 0 ? incomingVariants : currentVariants,
        photo_url: incomingPhoto || currentPhoto || "",
        image_url: incomingPhoto || currentPhoto || "",
        photo: incomingPhoto || currentPhoto || "",
        image: incomingPhoto || currentPhoto || "",
      } as InventoryItem;
    };

    const systemItemsById = new Map<string, InventoryItem>();

    [...rawMaterials, ...dbRawMaterials].forEach((item: any) => {
      const normalizedItem = normalizeCatalogItem(item, "mat");
      if (!normalizedItem.name) return;
      const itemId = String(normalizedItem.id);
      const existingItem = systemItemsById.get(itemId);
      systemItemsById.set(
        itemId,
        existingItem
          ? mergeCatalogItems(existingItem, normalizedItem as InventoryItem)
          : (normalizedItem as InventoryItem)
      );
    });

    const existingSystemSignatures = new Set(
      Array.from(systemItemsById.values()).map(
        (item) => `${normalizeText(item.name)}|${normalizeText(item.unit)}`
      )
    );

    const fallbackItems = RAW_MATERIALS_DATA.map((item) =>
      normalizeCatalogItem(item, "fallback")
    ).filter((item) => {
      if (!item.name) return false;
      const signature = `${normalizeText(item.name)}|${normalizeText(item.unit)}`;
      return !existingSystemSignatures.has(signature);
    });

    return [...Array.from(systemItemsById.values()), ...fallbackItems].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
        sensitivity: "base",
      })
    );
  }, [dbRawMaterials, rawMaterials]);

  const materialById = useMemo(
    () => new Map(materialCatalog.map((material) => [String(material.id), material])),
    [materialCatalog]
  );

  const autoHourlyRate = useMemo(() => {
    const salaryTotal = variableExpenses
      .filter(
        (expense) =>
          normalizeText(expense.name).includes("SALARIO") ||
          normalizeText(expense.name).includes("FOLHA") ||
          normalizeText(expense.name).includes("FUNCIONARIO")
      )
      .reduce((acc, item) => acc + (Number(item.value) || 0), 0);

    return salaryTotal > 0 ? salaryTotal / 220 : 0;
  }, [variableExpenses]);

  useEffect(() => {
    if (!hourlyRate && autoHourlyRate > 0) {
      const nextRate = Number(autoHourlyRate.toFixed(2));
      setHourlyRate(nextRate);
      setHourlyRateInput(formatMoneyInputBR(nextRate));
    }
  }, [autoHourlyRate, hourlyRate]);

  // Categorias sem família reconhecida (ex.: acessórios avulsos) não têm
  // classificação/subcategoria/medidas próprias — sem isso, a categoria
  // anterior (ex.: VIDRO) ficava "presa" no estado e a tela continuava
  // mostrando a classificação/subcategoria/simulação de fórmula de um
  // produto que não tem nada a ver com o acessório selecionado.
  const isSimpleAccessoryCategory = normalizeText(category) === "ACESSORIO DE MOTOR";

  useEffect(() => {
    const family = resolveProductFamily(category);
    setProductCategory(family || category);
    if (family === "VIDRO" || family === "MARMORE") {
      setLaborSector(family);
    }
  }, [category]);

  const classificationOptions = useMemo(() => {
    const family = resolveProductFamily(category) || normalizeText(productCategory);
    return productStructureByCategory[family]?.products || [];
  }, [category, productCategory]);

  const subCategory1Options = useMemo(() => {
    const family = resolveProductFamily(category) || normalizeText(productCategory);
    return productStructureByCategory[family]?.subCategory1 || [];
  }, [category, productCategory]);

  const subCategory3Options = useMemo(() => {
    const family = resolveProductFamily(category) || normalizeText(productCategory);
    return productStructureByCategory[family]?.subCategory3 || [];
  }, [category, productCategory]);

  const subCategory2Options = useMemo(() => {
    const family = resolveProductFamily(category) || normalizeText(productCategory);
    return productStructureByCategory[family]?.subCategory2 || [];
  }, [category, productCategory]);

  useEffect(() => {
    if (classificationOptions.length === 0) {
      // Acessório de motor não tem campo de classificação na tela (é um
      // produto simples), então precisa de um valor padrão aqui — senão a
      // validação do envio ("Informe a classificação do produto") bloqueia
      // o salvamento sem dar ao usuário como preenchê-la.
      setProductType(isSimpleAccessoryCategory ? "Acessorio" : "");
      return;
    }
    setProductType((prev) =>
      classificationOptions.includes(prev) ? prev : classificationOptions[0]
    );
  }, [classificationOptions, isSimpleAccessoryCategory]);

  useEffect(() => {
    if (subCategory1Options.length === 0) {
      setProductSubCategory1("");
      return;
    }

    setProductSubCategory1((prev) =>
      subCategory1Options.includes(prev) ? prev : subCategory1Options[0]
    );
  }, [subCategory1Options]);

  useEffect(() => {
    if (subCategory2Options.length === 0) {
      setProductSubCategory2("");
      return;
    }

    setProductSubCategory2((prev) =>
      subCategory2Options.includes(prev) ? prev : subCategory2Options[0]
    );
  }, [subCategory2Options]);

  const getMaterialCost = (materialId: string, variantName?: string) => {
    const material = materialById.get(materialId);
    if (!material) return 0;

    const variants = getMaterialVariants(material);
    const matchedVariant = variants.find(
      (variant: any) => normalizeText(variant?.name) === normalizeText(variantName)
    );

    const baseCost = getMaterialBaseCost(material);

    if (matchedVariant) {
      const variantCost = getVariantCost(matchedVariant);
      const effective = getEffectiveMaterialUnitCost(material, variantCost > 0 ? variantCost : Number((material as any)?.cost ?? (material as any)?.cost_price ?? 0));
      return getPositiveNumber(effective > 0 ? effective : baseCost);
    }
    if (variants.length > 0) {
      const variantCost = getVariantCost(variants[0]);
      const effective = getEffectiveMaterialUnitCost(material, variantCost > 0 ? variantCost : Number((material as any)?.cost ?? (material as any)?.cost_price ?? 0));
      return getPositiveNumber(effective > 0 ? effective : baseCost);
    }

    return getPositiveNumber(baseCost);
  };

  const compositionEntries = useMemo(
    () =>
      composition.map((item) => {
        const material = materialById.get(item.materialId);
        const hydratedItem = hydrateCompositionItem(item, material);
        const unitCost = getMaterialCost(hydratedItem.materialId, hydratedItem.variantName);
        const breakdown = material
          ? getCompositionLineBreakdown(
              hydratedItem,
              material,
              unitCost,
              getPositiveNumber(referenceWidthMm),
              getPositiveNumber(referenceHeightMm)
            )
          : null;

        return {
          item: hydratedItem,
          material: material || null,
          unitCost,
          breakdown,
        };
      }),
    [composition, getMaterialCost, materialById, referenceHeightMm, referenceWidthMm]
  );

  const materialCost = useMemo(
    () =>
      compositionEntries.reduce(
        (sum, entry) => sum + (entry.breakdown?.totalCost || 0),
        0
      ),
    [compositionEntries]
  );

  // Cores disponíveis para este produto: união das variantes de cor de
  // todos os materiais usados na composição (ex.: Branco, Bronze, Inox...)
  const productColorOptions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    compositionEntries.forEach((entry) => {
      if (!entry.material) return;
      getMaterialVariants(entry.material).forEach((variant: any) => {
        const name = getVariantName(variant);
        const key = normalizeText(name);
        if (name && !seen.has(key)) {
          seen.add(key);
          names.push(name);
        }
      });
    });
    return names.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [compositionEntries]);

  // Migração: produtos antigos tinham um único "fixedSalePrice" pra todas as
  // cores. Na primeira vez que as cores ficam disponíveis, se ainda não há
  // nenhum valor por cor salvo, usa o preço antigo como ponto de partida
  // pra todas as cores (a usuária ajusta cada uma depois, se precisar).
  useEffect(() => {
    const legacyPrice = Number((product as any)?.fixedSalePrice || 0);
    if (legacyPrice <= 0) return;
    if (Object.keys(fixedSalePriceByColor).length > 0) return;
    if (productColorOptions.length === 0) return;

    const seeded: Record<string, number> = {};
    productColorOptions.forEach((color) => { seeded[color] = legacyPrice; });
    setFixedSalePriceByColor(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productColorOptions]);

  const handleMarginByColorChange = (color: string, rawInput: string) => {
    const sanitized = sanitizeMoneyInputBR(rawInput);
    setMarginByColorInput((prev) => ({ ...prev, [color]: sanitized }));
    setMarginByColor((prev) => {
      const next = { ...prev };
      if (sanitized.trim() === "") {
        delete next[color];
      } else {
        next[color] = parseMoneyInputBR(sanitized);
      }
      return next;
    });
  };

  const handleMarginByColorBlur = (color: string) => {
    if (marginByColor[color] == null) {
      setMarginByColorInput((prev) => ({ ...prev, [color]: "" }));
      return;
    }
    setMarginByColorInput((prev) => ({ ...prev, [color]: formatMoneyInputBR(marginByColor[color]) }));
  };

  const laborHoursTotal = useMemo(
    () => getPositiveNumber(productionHours) + getPositiveNumber(assemblyHours),
    [assemblyHours, productionHours]
  );

  const professionalTotal = useMemo(() => {
    const hours = getPositiveNumber(professionalHours);
    const rate  = getPositiveNumber(professionalRate);
    // Se qtd for 0 mas há horas e valor, assume 1 pessoa
    const count = getPositiveNumber(professionalCount) || (hours > 0 && rate > 0 ? 1 : 0);
    return count * hours * rate;
  }, [professionalCount, professionalHours, professionalRate]);

  const helperTotal = useMemo(() => {
    const hours = getPositiveNumber(helperHours);
    const rate  = getPositiveNumber(helperRate);
    const count = getPositiveNumber(helperCount) || (hours > 0 && rate > 0 ? 1 : 0);
    return count * hours * rate;
  }, [helperCount, helperHours, helperRate]);

  const instProfTotal = useMemo(() => {
    const hours = getPositiveNumber(instProfInstHours);
    const rate  = getPositiveNumber(instProfRate);
    const count = getPositiveNumber(instProfCount) || (hours > 0 && rate > 0 ? 1 : 0);
    return count * hours * rate;
  }, [instProfCount, instProfInstHours, instProfRate]);

  const instHelpTotal = useMemo(() => {
    const hours = getPositiveNumber(instHelpInstHours);
    const rate  = getPositiveNumber(instHelpRate);
    const count = getPositiveNumber(instHelpCount) || (hours > 0 && rate > 0 ? 1 : 0);
    return count * hours * rate;
  }, [instHelpCount, instHelpInstHours, instHelpRate]);

  const laborCost = useMemo(
    () => {
      const detailed = professionalTotal + helperTotal + instProfTotal + instHelpTotal;
      if (detailed > 0) return detailed;
      return laborHoursTotal * getPositiveNumber(hourlyRate);
    },
    [professionalTotal, helperTotal, instProfTotal, instHelpTotal, laborHoursTotal, hourlyRate]
  );

  // Todas as despesas variáveis percentuais cadastradas no sistema
  const percentVariableExpenses = useMemo(
    () => variableExpenses.filter((e) => e.type === "percent" && Number(e.value) > 0),
    [variableExpenses]
  );

  const taxRate = useMemo(
    () =>
      percentVariableExpenses
        .filter((expense) => normalizeText(expense.name).includes("IMPOST"))
        .reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [percentVariableExpenses]
  );

  const commissionRate = useMemo(
    () =>
      percentVariableExpenses
        .filter((expense) => normalizeText(expense.name).includes("COMISSAO"))
        .reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [variableExpenses]
  );

  // Despesas variáveis que não são imposto nem comissão
  const otherVariableExpenses = useMemo(
    () => percentVariableExpenses.filter(
      (e) => !normalizeText(e.name).includes("IMPOST") && !normalizeText(e.name).includes("COMISSAO")
    ),
    [percentVariableExpenses]
  );
  const otherVariableRate = useMemo(
    () => otherVariableExpenses.reduce((sum, e) => sum + Number(e.value || 0), 0),
    [otherVariableExpenses]
  );

  // Passo 1: absorve custo fixo direto na base de custo (método planilha Excel)
  const fixedFrac = Math.min(getPositiveNumber(fixedCostRate) / 100, 0.99);

  // Custo de material usando a variante de UMA cor específica em vez da
  // configurada em cada linha da composição — é o que permite mostrar um
  // bloco de precificação completo por cor (a mão de obra continua igual
  // pra todas, só o material muda).
  const materialCostForColor = (color: string): number =>
    composition.reduce((sum, item) => {
      const material = materialById.get(item.materialId);
      if (!material) return sum;
      const hydratedItem = hydrateCompositionItem(item, material);
      const unitCost = getMaterialCost(hydratedItem.materialId, color || hydratedItem.variantName);
      const breakdown = getCompositionLineBreakdown(
        hydratedItem,
        material,
        unitCost,
        getPositiveNumber(referenceWidthMm),
        getPositiveNumber(referenceHeightMm)
      );
      return sum + (breakdown?.totalCost || 0);
    }, 0);

  // Lista de cores a exibir: uma por variante de cor usada na composição, ou
  // um único bloco "sem cor" pra produtos sem variação (ex.: acessórios).
  const colorsToShow = productColorOptions.length > 0 ? productColorOptions : [""];

  const computeColorPricing = (color: string) => {
    const colorMaterialCost = color ? materialCostForColor(color) : materialCost;
    const baseOperationalCost = colorMaterialCost + laborCost;
    const costWithFixed = fixedFrac > 0 ? baseOperationalCost / (1 - fixedFrac) : baseOperationalCost;
    const fixedCostValue = costWithFixed - baseOperationalCost;

    const marginPercent = (color && marginByColor[color] != null) ? marginByColor[color] : desiredProfitMargin;
    const variableAndProfitRate = (getPositiveNumber(marginPercent) + taxRate + commissionRate + otherVariableRate) / 100;
    const salePriceUnit =
      variableAndProfitRate < 0.99 ? costWithFixed / (1 - variableAndProfitRate) : costWithFixed;

    // Preço fixo definido manualmente PARA ESSA COR substitui o cálculo por
    // margem sempre que esse produto (nessa cor) for usado num orçamento.
    const fixedPrice = getPositiveNumber(fixedSalePriceByColor[color] || 0);
    // Preço por m²: tem prioridade sobre o fixo — multiplica pela área do
    // vão de referência aqui na simulação (no orçamento real, multiplica
    // pela área da peça informada).
    const pricePerSqm = getPositiveNumber(pricePerSqmByColor[color] || 0);
    const referenceAreaM2 = (getPositiveNumber(referenceWidthMm) / 1000) * (getPositiveNumber(referenceHeightMm) / 1000);
    const effectiveSalePriceUnit =
      pricePerSqm > 0 ? pricePerSqm * referenceAreaM2 : fixedPrice > 0 ? fixedPrice : salePriceUnit;

    const taxValue = effectiveSalePriceUnit * (taxRate / 100);
    const commissionValue = effectiveSalePriceUnit * (commissionRate / 100);
    const otherVariableValue = effectiveSalePriceUnit * (otherVariableRate / 100);
    const netMarginValue =
      effectiveSalePriceUnit - baseOperationalCost - taxValue - commissionValue - otherVariableValue - fixedCostValue;
    const netMarginRate = effectiveSalePriceUnit > 0 ? (netMarginValue / effectiveSalePriceUnit) * 100 : 0;
    const contributionValue =
      effectiveSalePriceUnit - colorMaterialCost - taxValue - commissionValue - otherVariableValue - fixedCostValue;
    const contributionRate = effectiveSalePriceUnit > 0 ? (contributionValue / effectiveSalePriceUnit) * 100 : 0;
    const effectiveFinalTotal = effectiveSalePriceUnit * getPositiveInteger(quantity, 1);

    return {
      colorMaterialCost, fixedCostValue, salePriceUnit, fixedPrice, pricePerSqm, effectiveSalePriceUnit,
      taxValue, commissionValue, otherVariableValue, netMarginValue, netMarginRate,
      contributionValue, contributionRate, effectiveFinalTotal,
    };
  };

  const lineOptions = useMemo(() => {
    const uniqueLines = Array.from(
      new Set(
        materialCatalog
          .map((material) => getMaterialLine(material))
          .filter(Boolean)
      )
    );

    return uniqueLines.sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" })
    );
  }, [materialCatalog]);

  const filteredMaterialCatalog = useMemo(() => {
    const normalizedLine = normalizeText(lineFilter);
    const normalizedName = normalizeText(nameFilter);

    return materialCatalog.filter((material) => {
      const lineMatch =
        !normalizedLine ||
        normalizeText(getMaterialLine(material)).includes(normalizedLine);
      const nameMatch =
        !normalizedName || normalizeText(material.name).includes(normalizedName);

      return lineMatch && nameMatch;
    });
  }, [lineFilter, materialCatalog, nameFilter]);

  const groupedPickerMaterials = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();

    filteredMaterialCatalog.forEach((material) => {
      const line = getMaterialLine(material) || "Sem linha";
      const currentGroup = groups.get(line) || [];
      currentGroup.push(material);
      groups.set(line, currentGroup);
    });

    return Array.from(groups.entries()).sort(([a], [b]) =>
      String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" })
    );
  }, [filteredMaterialCatalog]);

  const selectedDraftMaterial = useMemo(
    () => (draftItem ? materialById.get(draftItem.materialId) || null : null),
    [draftItem, materialById]
  );

  const draftBreakdown = useMemo<CompositionLineBreakdown | null>(() => {
    if (!draftItem || !selectedDraftMaterial) return null;

    const hydrated = hydrateCompositionItem(draftItem, selectedDraftMaterial);
    const unitCost = getMaterialCost(hydrated.materialId, hydrated.variantName);

    return getCompositionLineBreakdown(
      hydrated,
      selectedDraftMaterial,
      unitCost,
      getPositiveNumber(referenceWidthMm),
      getPositiveNumber(referenceHeightMm)
    );
  }, [
    draftItem,
    getMaterialCost,
    referenceHeightMm,
    referenceWidthMm,
    selectedDraftMaterial,
  ]);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleOpenImagePicker = () => {
    const input = document.getElementById(productImageInputId) as HTMLInputElement | null;
    input?.click();
  };

  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setDraftItem(null);
    setEditingItemId(null);
  };

  const openAddItemModal = () => {
    setLineFilter("");
    setNameFilter("");
    setDraftItem(null);
    setEditingItemId(null);
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: ProductCompositionItem) => {
    const material = materialById.get(item.materialId);
    const hydrated = hydrateCompositionItem(item, material);
    setDraftItem(hydrated);
    setDraftQtyInput(String(hydrated.quantity ?? 1).replace(".", ","));
    setEditingItemId(item.id);
    setIsItemModalOpen(true);
    setOpenItemMenuId(null);
  };

  const handleSelectMaterial = (material: InventoryItem) => {
    const draft = buildDefaultDraft(material);
    setDraftItem(draft);
    setDraftQtyInput(String(draft.quantity ?? 1).replace(".", ","));
  };

  const handleDraftChange = (
    field: keyof ProductCompositionItem,
    value: unknown
  ) => {
    setDraftItem((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleDraftMeasureFormulaChange = (
    field: "target" | "intervalMm" | "spanPercent",
    value: unknown
  ) => {
    setDraftItem((prev) =>
      prev
        ? {
            ...prev,
            measureFormula: {
              target: prev.measureFormula?.target || "height",
              intervalMm: getPositiveInteger(prev.measureFormula?.intervalMm, 120),
              spanPercent: Math.min(100, getPositiveNumber(prev.measureFormula?.spanPercent, 100) || 100),
              ...prev.measureFormula,
              [field]: value,
            },
          }
        : prev
    );
  };

  const handleSaveDraft = () => {
    if (!draftItem || !selectedDraftMaterial) {
      alert("Selecione um material para continuar.");
      return;
    }

    const hydrated = hydrateCompositionItem(draftItem, selectedDraftMaterial);

    if (hydrated.quantityMode === "made_to_measure") {
      const intervalMm = getPositiveInteger(hydrated.measureFormula?.intervalMm, 0);
      if (intervalMm <= 0) {
        alert("Informe o intervalo em milimetros para a formula sob medida.");
        return;
      }
    } else if ((getPositiveNumber(hydrated.quantity, 0) || 0) <= 0) {
      alert("Informe a quantidade do item.");
      return;
    }

    const storedItem = buildStoredCompositionItem(hydrated, selectedDraftMaterial);

    setComposition((prev) => {
      if (editingItemId) {
        return prev.map((item) => (item.id === editingItemId ? storedItem : item));
      }

      return [...prev, storedItem];
    });

    closeItemModal();
  };

  const handleRemoveItem = (itemId: string) => {
    setComposition((prev) => prev.filter((item) => item.id !== itemId));
    setOpenItemMenuId(null);
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      alert("Informe o nome do produto.");
      return;
    }

    if (!category.trim()) {
      alert("Selecione a categoria do produto.");
      return;
    }

    if (!productType.trim()) {
      alert("Informe a classificacao do produto.");
      return;
    }

    if (composition.length === 0) {
      alert("Adicione pelo menos um item na composicao do produto.");
      return;
    }

    setSubmitting(true);
    onSave({
      name: name.trim(),
      category,
      productCategory: resolveProductFamily(category) || productCategory,
      productType: productType.trim(),
      productSubCategory1: productSubCategory1.trim(),
      productSubCategory2: productSubCategory2.trim(),
      productSubCategory3: productSubCategory3.trim(),
      composition,
      image,
      desiredProfitMargin: getPositiveNumber(desiredProfitMargin),
      marginByColor: Object.keys(marginByColor).length > 0 ? marginByColor : undefined,
      minProfitValue: getPositiveNumber(minProfitValue),
      fixedSalePriceByColor: Object.keys(fixedSalePriceByColor).length > 0 ? fixedSalePriceByColor : undefined,
      pricePerSqmByColor: Object.keys(pricePerSqmByColor).length > 0 ? pricePerSqmByColor : undefined,
      laborCost,
      productionHours: getPositiveNumber(productionHours),
      assemblyHours: getPositiveNumber(assemblyHours),
      hourlyRate: getPositiveNumber(hourlyRate),
      professionalCount: getPositiveNumber(professionalCount),
      professionalHours: getPositiveNumber(professionalHours),
      professionalRate: getPositiveNumber(professionalRate),
      helperCount: getPositiveNumber(helperCount),
      helperHours: getPositiveNumber(helperHours),
      helperRate: getPositiveNumber(helperRate),
      instProfCount: getPositiveNumber(instProfCount),
      instProfInstHours: getPositiveNumber(instProfInstHours),
      instProfRate: getPositiveNumber(instProfRate),
      instHelpCount: getPositiveNumber(instHelpCount),
      instHelpInstHours: getPositiveNumber(instHelpInstHours),
      instHelpRate: getPositiveNumber(instHelpRate),
      fixedCostRate: getPositiveNumber(fixedCostRate),
      laborSector,
      quantityReference: getPositiveInteger(quantity, 1),
      selectedCategoryColor,
      referenceWidthMm: getPositiveInteger(referenceWidthMm, 1),
      referenceHeightMm: getPositiveInteger(referenceHeightMm, 1),
      widthIncrement: Number(widthIncrement) || 0,
      heightIncrement: Number(heightIncrement) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      {showExitConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 text-center">
            <p className="text-lg font-semibold text-gray-800 mb-1">Sair sem salvar?</p>
            <p className="text-sm text-gray-500 mb-5">As alterações feitas ainda não foram salvas.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-medium">Continuar editando</button>
              <button onClick={() => { setShowExitConfirm(false); handleSubmit(); }} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium">Salvar</button>
              <button onClick={() => { setShowExitConfirm(false); onClose(); }} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-medium">Sair</button>
            </div>
          </div>
        </div>
      )}
      <div className="max-h-[94vh] w-full max-w-7xl overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {product ? "Editar produto personalizado" : "Novo produto personalizado"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Monte a composicao por materia-prima e teste a formula com largura e altura
              de referencia.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[calc(94vh-88px)] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,1fr]">
              <div className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Foto do produto
                </label>
                <label className="block cursor-pointer overflow-hidden rounded-[20px] border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
                  {image ? (
                    <img
                      src={image}
                      alt="Preview do produto"
                      className="h-[280px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[280px] items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                      Clique para enviar a imagem de pre-visualizacao do cliente
                    </div>
                  )}
                  <input
                    id={productImageInputId}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={handleOpenImagePicker}
                    className="flex-1 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    Alterar foto
                  </button>
                  {image && (
                    <button
                      type="button"
                      onClick={() => setImage("")}
                      className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-5 rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Nome do produto
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-3 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                      placeholder="Ex.: Portao de correr LB 030"
                      required
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Esta pre-visualizacao fica disponivel para o cliente.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Categoria do produto
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categories.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setCategory(option)}
                          className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                            category === option
                              ? "border-primary-600 bg-primary-600 text-white"
                              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {isSimpleAccessoryCategory ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Acessorio de motor e um produto simples, sem classificacao,
                      subcategoria ou medidas — o preco nao depende de largura/altura.
                    </p>
                  </div>
                ) : (
                <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Classificacao do produto
                      </label>

                      {classificationOptions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {classificationOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setProductType(option)}
                              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                productType === option
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={productType}
                          onChange={(event) => setProductType(event.target.value)}
                          className="mt-3 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                          placeholder="Ex.: Portao"
                        />
                      )}
                    </div>

                    {subCategory1Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Subcategoria 1
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {subCategory1Options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setProductSubCategory1(option)}
                              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                productSubCategory1 === option
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {subCategory2Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Subcategoria 2
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {subCategory2Options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setProductSubCategory2(option)}
                              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                productSubCategory2 === option
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {subCategory3Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Subcategoria 3
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {subCategory3Options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setProductSubCategory3(option)}
                              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                productSubCategory3 === option
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {productSubCategory1 === "Correr" && (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                        Acréscimo automático (Correr)
                      </h3>
                      <p className="mt-1 text-xs text-orange-500">
                        Valor somado automaticamente à medida informada no orçamento.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-slate-700 dark:text-slate-200">
                          Acréscimo de Altura (mm)
                          <input
                            type="number"
                            min={0}
                            value={heightIncrement}
                            onChange={(e) => setHeightIncrement(Number(e.target.value) || 0)}
                            className="mt-2 w-full rounded-xl border border-orange-300 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                            placeholder="Ex: 40"
                          />
                        </label>
                        <label className="text-sm text-slate-700 dark:text-slate-200">
                          Acréscimo de Largura (mm)
                          <input
                            type="number"
                            min={0}
                            value={widthIncrement}
                            onChange={(e) => setWidthIncrement(Number(e.target.value) || 0)}
                            className="mt-2 w-full rounded-xl border border-orange-300 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                            placeholder="Ex: 40"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Simulacao da formula
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-700 dark:text-slate-200">
                        Altura do vao (mm)
                        <input
                          type="number"
                          min={1}
                          value={referenceHeightMm}
                          onChange={(event) =>
                            setReferenceHeightMm(Number(event.target.value) || 0)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                        />
                      </label>

                      <label className="text-sm text-slate-700 dark:text-slate-200">
                        Largura do vao (mm)
                        <input
                          type="number"
                          min={1}
                          value={referenceWidthMm}
                          onChange={(event) =>
                            setReferenceWidthMm(Number(event.target.value) || 0)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Esses valores servem para testar a formula antes de salvar o produto.
                    </p>
                  </div>
                </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-700 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Materia-prima e composicao do produto
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Cada card representa um item da composicao, com a formula que sera
                    usada no calculo do produto.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openAddItemModal}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Adicionar item
                </button>
              </div>

              <div className="p-6">
                {materialCatalog.length === 0 && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
                    Nenhuma materia-prima encontrada. Cadastre os materiais no estoque antes
                    de montar o produto.
                  </div>
                )}

                {materialCatalog.length > 0 && compositionEntries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Ainda nao existe item nesta composicao. Clique em <strong>Adicionar item</strong>
                    {" "}para escolher a materia-prima e configurar a formula.
                  </div>
                )}

                {compositionEntries.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {compositionEntries.map(({ item, material, unitCost, breakdown }) => (
                      <article
                        key={item.id}
                        className="relative overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenItemMenuId((prev) => (prev === item.id ? null : item.id))
                          }
                          className="absolute right-4 top-4 z-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          ...
                        </button>

                        {openItemMenuId === item.id && (
                          <div className="absolute right-4 top-14 z-20 min-w-[150px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl">
                            <button
                              type="button"
                              onClick={() => openEditItemModal(item)}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                              Editar item
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              Excluir item
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-[96px,1fr] gap-4 p-5">
                          <div className="h-24 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                            {getMaterialPhoto(material) ? (
                              <img
                                src={getMaterialPhoto(material)}
                                alt={material?.name || "Material"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                                Sem foto
                              </div>
                            )}
                          </div>

                          <div className="pr-8">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {getMaterialLine(material) || "Sem linha"}
                            </p>
                            <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {material?.name || "Material nao encontrado"}
                            </h4>
                            {item.variantName && (
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Variacao: {item.variantName}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              {material
                                ? buildCompositionFormulaPreview(
                                    item,
                                    material,
                                    getPositiveNumber(referenceWidthMm),
                                    getPositiveNumber(referenceHeightMm)
                                  )
                                : ""}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 sm:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Fator de multiplicacao
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                              x{getPositiveNumber(item.multiplyBy, 1).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Quantidade
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                              {breakdown?.pieceCount || 0} item(ns)
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Consumo total
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                              {breakdown
                                ? formatQuantity(
                                    breakdown.requiredQuantity,
                                    breakdown.calculationUnit
                                  )
                                : "--"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Custo estimado
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                              {formatCurrency(breakdown?.totalCost || 0)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatCurrency(unitCost)} / {material?.unit || "un"}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
              <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      Detalhamento financeiro do produto
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      A parte financeira foi mantida para testar se a formula esta chegando no
                      custo corretamente.
                    </p>
                  </div>

                  {/* Seletor de setor — define a taxa média do profissional */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Setor:</span>
                    <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setLaborSector("MARMORE")}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${laborSector === "MARMORE" ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      >
                        Mármore
                      </button>
                      <button
                        type="button"
                        onClick={() => setLaborSector("VIDRO")}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-slate-300 dark:border-slate-600 ${laborSector === "VIDRO" ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      >
                        Vidro
                      </button>
                    </div>
                  </div>

                  {/* helper inline para não repetir JSX dos dois cards */}
                  {(() => {
                    const makeColHeader = (hourLabel: string) => (
                      <div className="grid grid-cols-[76px_1fr_1fr_1fr_1fr] gap-x-1.5 mb-1">
                        <span />
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Qtd</span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{hourLabel}</span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Valor/h (R$)</span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Total</span>
                      </div>
                    );
                    const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm";
                    const readCls  = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100";
                    return (
                      <>
                        {/* CARD PRODUÇÃO */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Produção</p>
                          {makeColHeader("H. Produção")}
                          {/* Profissional */}
                          <div className="grid grid-cols-[76px_1fr_1fr_1fr_1fr] gap-x-1.5 items-center">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Profissional</span>
                            <input type="number" min={0} value={professionalCount} onFocus={(e)=>e.target.select()} onChange={(e)=>setProfessionalCount(Number(e.target.value)||0)} className={inputCls} />
                            <input type="number" min={0} value={professionalHours} onFocus={(e)=>e.target.select()} onChange={(e)=>setProfessionalHours(Number(e.target.value)||0)} className={inputCls} />
                            <div>
                              <input type="text" inputMode="decimal" value={professionalRateInput} onFocus={(e)=>e.target.select()}
                                onChange={(e)=>{const v=sanitizeMoneyInputBR(e.target.value);setProfessionalRateInput(v);setProfessionalRate(parseMoneyInputBR(v));}}
                                onBlur={()=>setProfessionalRateInput(formatMoneyInputBR(professionalRate))} className={inputCls} />
                              {avgProfessionalHourlyRate>0&&<button type="button" onClick={()=>{setProfessionalRate(avgProfessionalHourlyRate);setProfessionalRateInput(formatMoneyInputBR(avgProfessionalHourlyRate));}} className="text-[10px] text-blue-600 hover:underline">taxa média</button>}
                            </div>
                            <input readOnly value={professionalTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} className={readCls} />
                          </div>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          {/* Ajudante */}
                          <div className="grid grid-cols-[76px_1fr_1fr_1fr_1fr] gap-x-1.5 items-center">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Ajudante</span>
                            <input type="number" min={0} value={helperCount} onFocus={(e)=>e.target.select()} onChange={(e)=>setHelperCount(Number(e.target.value)||0)} className={inputCls} />
                            <input type="number" min={0} value={helperHours} onFocus={(e)=>e.target.select()} onChange={(e)=>setHelperHours(Number(e.target.value)||0)} className={inputCls} />
                            <div>
                              <input type="text" inputMode="decimal" value={helperRateInput} onFocus={(e)=>e.target.select()}
                                onChange={(e)=>{const v=sanitizeMoneyInputBR(e.target.value);setHelperRateInput(v);setHelperRate(parseMoneyInputBR(v));}}
                                onBlur={()=>setHelperRateInput(formatMoneyInputBR(helperRate))} className={inputCls} />
                              {avgHelperHourlyRate>0&&<button type="button" onClick={()=>{setHelperRate(avgHelperHourlyRate);setHelperRateInput(formatMoneyInputBR(avgHelperHourlyRate));}} className="text-[10px] text-blue-600 hover:underline">taxa média</button>}
                            </div>
                            <input readOnly value={helperTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} className={readCls} />
                          </div>
                        </div>

                        {/* CARD INSTALAÇÃO */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Instalação</p>
                          {makeColHeader("H. Instalação")}
                          {/* Profissional */}
                          <div className="grid grid-cols-[76px_1fr_1fr_1fr_1fr] gap-x-1.5 items-center">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Profissional</span>
                            <input type="number" min={0} value={instProfCount} onFocus={(e)=>e.target.select()} onChange={(e)=>setInstProfCount(Number(e.target.value)||0)} className={inputCls} />
                            <input type="number" min={0} value={instProfInstHours} onFocus={(e)=>e.target.select()} onChange={(e)=>setInstProfInstHours(Number(e.target.value)||0)} className={inputCls} />
                            <div>
                              <input type="text" inputMode="decimal" value={instProfRateInput} onFocus={(e)=>e.target.select()}
                                onChange={(e)=>{const v=sanitizeMoneyInputBR(e.target.value);setInstProfRateInput(v);setInstProfRate(parseMoneyInputBR(v));}}
                                onBlur={()=>setInstProfRateInput(formatMoneyInputBR(instProfRate))} className={inputCls} />
                              {avgProfessionalHourlyRate>0&&<button type="button" onClick={()=>{setInstProfRate(avgProfessionalHourlyRate);setInstProfRateInput(formatMoneyInputBR(avgProfessionalHourlyRate));}} className="text-[10px] text-blue-600 hover:underline">taxa média</button>}
                            </div>
                            <input readOnly value={instProfTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} className={readCls} />
                          </div>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          {/* Ajudante */}
                          <div className="grid grid-cols-[76px_1fr_1fr_1fr_1fr] gap-x-1.5 items-center">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Ajudante</span>
                            <input type="number" min={0} value={instHelpCount} onFocus={(e)=>e.target.select()} onChange={(e)=>setInstHelpCount(Number(e.target.value)||0)} className={inputCls} />
                            <input type="number" min={0} value={instHelpInstHours} onFocus={(e)=>e.target.select()} onChange={(e)=>setInstHelpInstHours(Number(e.target.value)||0)} className={inputCls} />
                            <div>
                              <input type="text" inputMode="decimal" value={instHelpRateInput} onFocus={(e)=>e.target.select()}
                                onChange={(e)=>{const v=sanitizeMoneyInputBR(e.target.value);setInstHelpRateInput(v);setInstHelpRate(parseMoneyInputBR(v));}}
                                onBlur={()=>setInstHelpRateInput(formatMoneyInputBR(instHelpRate))} className={inputCls} />
                              {avgHelperHourlyRate>0&&<button type="button" onClick={()=>{setInstHelpRate(avgHelperHourlyRate);setInstHelpRateInput(formatMoneyInputBR(avgHelperHourlyRate));}} className="text-[10px] text-blue-600 hover:underline">taxa média</button>}
                            </div>
                            <input readOnly value={instHelpTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} className={readCls} />
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* TOTAL MÃO DE OBRA */}
                  <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-3">
                    <span className="text-sm font-semibold text-primary-800">Total mão de obra</span>
                    <span className="text-base font-bold text-primary-700">
                      {laborCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Margem de lucro (%)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={desiredProfitMarginInput}
                        onFocus={(e) => e.target.select()}
                        onChange={(event) => {
                          const raw = sanitizeMoneyInputBR(event.target.value);
                          setDesiredProfitMarginInput(raw);
                          setDesiredProfitMargin(parseMoneyInputBR(raw));
                        }}
                        onBlur={() => setDesiredProfitMarginInput(formatMoneyInputBR(desiredProfitMargin))}
                        className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                      />
                    </label>

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Quantidade vendida
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(event) =>
                          setQuantity(Number(event.target.value) || 1)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                      />
                    </label>

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Lucro mínimo (R$)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={minProfitValueInput}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const v = sanitizeMoneyInputBR(e.target.value);
                          setMinProfitValueInput(v);
                          setMinProfitValue(parseMoneyInputBR(v));
                        }}
                        onBlur={() => setMinProfitValueInput(formatMoneyInputBR(minProfitValue))}
                        className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Garante esse lucro mínimo por unidade no orçamento, mesmo que a % acima resulte em menos (útil em peças pequenas, onde a margem percentual gera pouco lucro em reais). Deixe em R$ 0,00 para não aplicar piso.
                  </p>

                  {productColorOptions.length > 0 && (
                    <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Margem por cor (opcional)</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Deixe em branco para usar a margem geral ({getPositiveNumber(desiredProfitMargin)}%) nessa cor. Útil quando uma cor (ex.: inox, madeirado) tem matéria-prima mais cara e a margem padrão deixa o preço final muito alto.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {productColorOptions.map((color) => (
                          <label key={color} className="text-xs text-slate-600 dark:text-slate-300">
                            {color}
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={`${getPositiveNumber(desiredProfitMargin)}`}
                              value={marginByColorInput[color] ?? (marginByColor[color] != null ? formatMoneyInputBR(marginByColor[color]) : "")}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) => handleMarginByColorChange(color, event.target.value)}
                              onBlur={() => handleMarginByColorBlur(color)}
                              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Custos fixos:</span>{" "}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{fixedCostRate.toFixed(2)}%</span>
                    {percentVariableExpenses.length > 0 && (
                      <>
                        <span className="mx-2 text-slate-400 dark:text-slate-500">·</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Custos variáveis:</span>{" "}
                        {percentVariableExpenses.map((e) => (
                          <span key={e.id} className="mr-2">
                            {e.name} <span className="font-bold text-slate-900 dark:text-slate-100">{Number(e.value).toFixed(2)}%</span>
                          </span>
                        ))}
                      </>
                    )}
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(definidos no Financeiro)</span>
                  </div>
                </div>

                {colorsToShow.map((color) => {
                  const pricing = computeColorPricing(color);
                  const isEditingThis = editingPriceColor === color;
                  return (
                    <div key={color || "__default__"} className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
                      {color && (
                        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-primary-700">{color}</p>
                      )}
                      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Custo materia-prima</span>
                          <strong>{formatCurrency(pricing.colorMaterialCost)}</strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Mao de obra ({laborHoursTotal.toFixed(2)} h)</span>
                          <strong>{formatCurrency(laborCost)}</strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Impostos ({taxRate.toFixed(2)}%)</span>
                          <strong>{formatCurrency(pricing.taxValue)}</strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Comissao vendedora ({commissionRate.toFixed(2)}%)</span>
                          <strong>{formatCurrency(pricing.commissionValue)}</strong>
                        </div>
                        {otherVariableExpenses.map((expense) => {
                          const rate = Number(expense.value || 0);
                          const val = pricing.effectiveSalePriceUnit * (rate / 100);
                          return (
                            <div key={expense.id} className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                              <span>{expense.name} ({rate.toFixed(2)}%)</span>
                              <strong>{formatCurrency(val)}</strong>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Custos fixos ({fixedCostRate.toFixed(2)}%)</span>
                          <strong>{formatCurrency(pricing.fixedCostValue)}</strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3 text-blue-900">
                          <span>
                            Preco sugerido por unidade
                            {pricing.pricePerSqm > 0 ? (
                              <span className="block text-[11px] font-normal text-blue-700">
                                Preço real é {formatCurrency(pricing.pricePerSqm)}/m² — no vão de referência acima
                                isso dá {formatCurrency(pricing.effectiveSalePriceUnit)}; a margem abaixo já considera esse valor.
                              </span>
                            ) : pricing.fixedPrice > 0 && (
                              <span className="block text-[11px] font-normal text-blue-700">
                                Preço real (definido manualmente) é {formatCurrency(pricing.fixedPrice)} — a margem abaixo já considera esse valor.
                              </span>
                            )}
                          </span>
                          <strong>{formatCurrency(pricing.salePriceUnit)}</strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Margem liquida</span>
                          <strong>
                            {formatCurrency(pricing.netMarginValue)} ({pricing.netMarginRate.toFixed(2)}%)
                          </strong>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 px-4 py-3">
                          <span>Margem de contribuicao</span>
                          <strong>
                            {formatCurrency(pricing.contributionValue)} ({pricing.contributionRate.toFixed(2)}%)
                          </strong>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span className="text-xs font-semibold text-emerald-900">Preço/m² (opcional)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={sqmPriceInputByColor[color] ?? formatMoneyInputBR(pricePerSqmByColor[color] || 0)}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              setSqmPriceInputByColor((prev) => ({ ...prev, [color]: sanitizeMoneyInputBR(e.target.value) }))
                            }
                            onBlur={() => {
                              const val = parseMoneyInputBR(sqmPriceInputByColor[color] ?? "");
                              setPricePerSqmByColor((prev) => {
                                const next = { ...prev };
                                if (val > 0) next[color] = val;
                                else delete next[color];
                                return next;
                              });
                              setSqmPriceInputByColor((prev) => ({ ...prev, [color]: formatMoneyInputBR(val) }));
                            }}
                            style={{ width: 80, flexShrink: 0 }}
                            className="rounded-lg border border-emerald-300 bg-white dark:bg-slate-900 px-2 py-1 text-right text-xs font-semibold text-emerald-900"
                          />
                        </div>
                        <p className="mt-1 text-[10px] leading-tight text-emerald-700">
                          Multiplica pela área da peça; prioridade sobre o Preço Final fixo abaixo.
                        </p>
                      </div>

                      <div className="mt-3 rounded-[24px] bg-slate-900 px-5 py-4 text-white">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                            Preco final{color ? ` — ${color}` : ""}
                          </p>
                          {!isEditingThis && (
                            <button
                              type="button"
                              onClick={() => {
                                setPriceInputByColor((prev) => ({
                                  ...prev,
                                  [color]: formatMoneyInputBR(pricing.fixedPrice > 0 ? pricing.fixedPrice : pricing.salePriceUnit),
                                }));
                                setEditingPriceColor(color);
                              }}
                              className="text-xs font-semibold text-primary-300 underline hover:text-primary-200"
                            >
                              Editar
                            </button>
                          )}
                        </div>

                        {isEditingThis ? (
                          <div className="mt-2 space-y-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              autoFocus
                              value={priceInputByColor[color] ?? ""}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                setPriceInputByColor((prev) => ({ ...prev, [color]: sanitizeMoneyInputBR(e.target.value) }))
                              }
                              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-2xl font-semibold text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFixedSalePriceByColor((prev) => ({
                                    ...prev,
                                    [color]: parseMoneyInputBR(priceInputByColor[color] ?? "0"),
                                  }));
                                  setEditingPriceColor(null);
                                }}
                                className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold hover:bg-primary-500"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPriceColor(null)}
                                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-2 text-3xl font-semibold">
                              {formatCurrency(pricing.effectiveFinalTotal)}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              Considerando {getPositiveInteger(quantity, 1)} unidade(s) vendida(s).
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              Margem líquida real: {formatCurrency(pricing.netMarginValue)} ({pricing.netMarginRate.toFixed(2)}%)
                            </p>
                            {pricing.pricePerSqm > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                  Calculado por m² ({formatCurrency(pricing.pricePerSqm)}/m²)
                                </span>
                              </div>
                            )}
                            {pricing.pricePerSqm === 0 && pricing.fixedPrice > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                                  Ajustado manualmente
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFixedSalePriceByColor((prev) => {
                                      const next = { ...prev };
                                      delete next[color];
                                      return next;
                                    });
                                  }}
                                  className="text-[11px] font-semibold text-slate-300 underline hover:text-white"
                                >
                                  Usar cálculo automático
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                          Ao definir um valor aqui, ele substitui o cálculo automático por margem sempre que essa cor for usada num orçamento.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Salvando..." : "Salvar produto"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {isItemModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-6 py-5">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {draftItem ? "Configurar item" : "Selecionar materia-prima"}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {draftItem
                    ? "Defina a formula do item e salve para voltar a composicao do produto."
                    : "Escolha o item com foto para montar a composicao do produto."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeItemModal}
                className="rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>

            {!draftItem ? (
              <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Filtre a linha do item
                    <select
                      value={lineFilter}
                      onChange={(event) => setLineFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                    >
                      <option value="">Todas as linhas</option>
                      {lineOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Filtre o nome do item
                    <input
                      type="text"
                      value={nameFilter}
                      onChange={(event) => setNameFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                      placeholder="Ex.: Perfil"
                    />
                  </label>
                </div>

                <div className="mt-6 space-y-6">
                  {groupedPickerMaterials.map(([groupName, items]) => (
                    <section key={groupName}>
                      <h4 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {groupName || "Sem linha"}
                      </h4>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((material) => (
                          <button
                            key={material.id}
                            type="button"
                            onClick={() => handleSelectMaterial(material)}
                            className="grid grid-cols-[88px,1fr] items-center gap-4 rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white dark:hover:bg-slate-800"
                          >
                            <div className="h-24 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                              {getMaterialPhoto(material) ? (
                                <img
                                  src={getMaterialPhoto(material)}
                                  alt={material.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                                  Sem foto
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {getMaterialLine(material) || "Sem linha"}
                              </p>
                              <h5 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                                {material.name}
                              </h5>
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                Unidade: {material.unit}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}

                  {groupedPickerMaterials.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nenhum material encontrado com os filtros informados.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-6">
                <div className="grid gap-6 xl:grid-cols-[340px,1fr]">
                  <aside className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
                    <div className="overflow-hidden rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      {getMaterialPhoto(selectedDraftMaterial) ? (
                        <img
                          src={getMaterialPhoto(selectedDraftMaterial)}
                          alt={selectedDraftMaterial?.name || "Material"}
                          className="h-[220px] w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                          Sem foto cadastrada para este material
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Item selecionado
                      </p>
                      <h4 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {selectedDraftMaterial?.name}
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {getMaterialLine(selectedDraftMaterial) || "Sem linha"} - Unidade{" "}
                        {selectedDraftMaterial?.unit || "un"}
                      </p>
                    </div>

                    {getMaterialVariants(selectedDraftMaterial).length > 0 && (
                      <label className="mt-5 block text-sm text-slate-700 dark:text-slate-200">
                        Variacao do material
                        <select
                          value={draftItem.variantName || ""}
                          onChange={(event) =>
                            handleDraftChange("variantName", event.target.value)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3"
                        >
                          {getMaterialVariants(selectedDraftMaterial).map((variant: any) => (
                            <option key={variant.name} value={variant.name}>
                              {variant.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {draftBreakdown && (
                      <div className="mt-5 rounded-[24px] bg-slate-900 p-4 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                          Resultado da simulacao
                        </p>
                        <p className="mt-3 text-sm text-slate-200">
                          {draftBreakdown.formulaLabel}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Quantidade
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {draftBreakdown.pieceCount} item(ns)
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Consumo
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {formatQuantity(
                                draftBreakdown.requiredQuantity,
                                draftBreakdown.calculationUnit
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm font-medium text-white">
                          Custo estimado: {formatCurrency(draftBreakdown.totalCost)}
                        </p>
                      </div>
                    )}
                  </aside>
                  <div className="space-y-6 rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Onde aplicar o item?
                        </p>
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {([
                            { value: "height", label: "Altura do vao" },
                            { value: "width", label: "Largura do vao" },
                            { value: "area", label: "M² (Área)" },
                            { value: "accessory", label: "Acessório" },
                          ] as { value: ProductCompositionAxis; label: string }[]).map(
                            (option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  handleDraftChange("applyOn", option.value);
                                  // ao selecionar Acessório ou M², força modo Normal e limpa campos de medida
                                  if (option.value === "accessory" || option.value === "area") {
                                    handleDraftChange("quantityMode", "normal");
                                    handleDraftChange("adjustmentType", "none");
                                    handleDraftChange("adjustmentMm", 0);
                                    handleDraftChange("divideBy", 1);
                                    handleDraftChange("multiplyBy", 1);
                                    const currentQty = draftItem?.quantity ?? 1;
                                    setDraftQtyInput(String(currentQty).replace(".", ","));
                                  }
                                }}
                                className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                                  draftItem.applyOn === option.value
                                    ? option.value === "accessory"
                                      ? "bg-amber-500 text-white"
                                      : option.value === "area"
                                        ? "bg-teal-600 text-white"
                                        : "bg-primary-600 text-white"
                                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                }`}
                              >
                                {option.label}
                              </button>
                            )
                          )}
                        </div>
                        {draftItem.applyOn === "accessory" && (
                          <p className="mt-2 text-xs text-amber-600 font-medium">
                            Modo acessório: apenas a quantidade será usada no cálculo.
                          </p>
                        )}
                        {(draftItem.applyOn as string) === "area" && (
                          <p className="mt-2 text-xs text-teal-600 font-medium">
                            Modo M²: largura × altura do vão ÷ 1.000.000 × quantidade. Ideal para vidros e mármores.
                          </p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Adicionar desconto ou acrescimo?
                        </p>
                        <div className="mt-3 flex gap-2">
                          {([
                            { value: "none", label: "Nao aplicar" },
                            { value: "add", label: "Acrescimo" },
                            { value: "subtract", label: "Desconto" },
                          ] as {
                            value: ProductCompositionAdjustmentMode;
                            label: string;
                          }[]).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                handleDraftChange("adjustmentType", option.value)
                              }
                              className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                                (draftItem.adjustmentType || "none") === option.value
                                  ? "bg-primary-600 text-white"
                                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Campos de medida — desativados no modo Acessório e M² */}
                    <div className={`grid gap-4 md:grid-cols-3 transition-opacity ${draftItem.applyOn === "accessory" || (draftItem.applyOn as string) === "area" ? "opacity-40 pointer-events-none select-none" : ""}`}>
                      <label className="text-sm text-slate-700 dark:text-slate-200">
                        Tamanho em milimetros
                        <input
                          type="number"
                          min={0}
                          disabled={(draftItem.adjustmentType || "none") === "none" || draftItem.applyOn === "accessory"}
                          value={draftItem.adjustmentMm || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(event) =>
                            handleDraftChange(
                              "adjustmentMm",
                              Number(event.target.value) || 0
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 disabled:bg-slate-100 dark:bg-slate-700"
                        />
                      </label>

                      <label className="text-sm text-slate-700 dark:text-slate-200">
                        Dividir tamanho por
                        <input
                          type="number"
                          min={1}
                          disabled={draftItem.applyOn === "accessory"}
                          value={draftItem.divideBy || 1}
                          onFocus={(e) => e.target.select()}
                          onChange={(event) =>
                            handleDraftChange(
                              "divideBy",
                              Number(event.target.value) || 1
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 disabled:bg-slate-100 dark:bg-slate-700"
                        />
                      </label>

                      <label className="text-sm text-slate-700 dark:text-slate-200">
                        Multiplicar por
                        <input
                          type="number"
                          min={1}
                          disabled={draftItem.applyOn === "accessory"}
                          value={draftItem.multiplyBy || 1}
                          onFocus={(e) => e.target.select()}
                          onChange={(event) =>
                            handleDraftChange(
                              "multiplyBy",
                              Number(event.target.value) || 1
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 disabled:bg-slate-100 dark:bg-slate-700"
                        />
                      </label>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Quantidade de itens
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Escolha se a quantidade sera fixa ou calculada por sob medida.
                          </p>
                        </div>

                        <div className={`flex gap-2 ${draftItem.applyOn === "accessory" || (draftItem.applyOn as string) === "area" ? "opacity-40 pointer-events-none" : ""}`}>
                          {([
                            { value: "normal", label: "Normal" },
                            { value: "made_to_measure", label: "Sobre medida" },
                          ] as {
                            value: ProductCompositionQuantityMode;
                            label: string;
                          }[]).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              disabled={draftItem.applyOn === "accessory" || (draftItem.applyOn as string) === "area"}
                              onClick={() => handleDraftChange("quantityMode", option.value)}
                              className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                                (draftItem.quantityMode || "normal") === option.value
                                  ? "bg-primary-600 text-white"
                                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(draftItem.quantityMode || "normal") === "normal" ? (
                        <label className="mt-5 block text-sm text-slate-700 dark:text-slate-200">
                          Quantidade
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draftQtyInput}
                            onChange={(event) => {
                              // Permite dígitos, vírgula e ponto — bloqueia tudo mais
                              const raw = event.target.value.replace(/[^0-9.,]/g, "");
                              setDraftQtyInput(raw);
                              // Converte para número só se estiver completo (não termina em , ou .)
                              const normalized = raw.replace(",", ".");
                              const parsed = parseFloat(normalized);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                handleDraftChange("quantity", parsed);
                              }
                            }}
                            onFocus={(event) => event.target.select()}
                            onBlur={() => {
                              const normalized = draftQtyInput.replace(",", ".");
                              const parsed = parseFloat(normalized);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                handleDraftChange("quantity", parsed);
                                // mantém o que o usuário digitou (ex: "1,30" não vira "1,3")
                                // apenas limpa se terminar em separador solto (ex: "1,")
                                const clean = draftQtyInput.replace(/[,.]$/, "");
                                setDraftQtyInput(clean || "1");
                              } else {
                                handleDraftChange("quantity", 1);
                                setDraftQtyInput("1");
                              }
                            }}
                            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3"
                          />
                        </label>
                      ) : (
                        <div className="mt-5 space-y-4 rounded-[24px] border border-blue-100 bg-white dark:bg-slate-900 p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Tipo da formula
                              </p>
                              <div className="mt-3 flex gap-2">
                                {([
                                  { value: "height", label: "Altura do vao" },
                                  { value: "width", label: "Largura do vao" },
                                ] as {
                                  value: ProductCompositionAxis;
                                  label: string;
                                }[]).map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      handleDraftMeasureFormulaChange(
                                        "target",
                                        option.value
                                      )
                                    }
                                    className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                                      (draftItem.measureFormula?.target || "height") ===
                                      option.value
                                        ? "bg-primary-600 text-white"
                                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <label className="text-sm text-slate-700 dark:text-slate-200">
                              Adicionar um novo item a cada (mm)
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={draftItem.measureFormula?.intervalMm ?? 120}
                                onChange={(event) => {
                                  const nextInterval = Math.max(
                                    1,
                                    Number(event.target.value) || 1
                                  );
                                  handleDraftMeasureFormulaChange(
                                    "intervalMm",
                                    nextInterval
                                  );
                                  handleDraftChange("factor", nextInterval);
                                }}
                                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                              />
                            </label>

                            <label className="text-sm text-slate-700 dark:text-slate-200">
                              Porcentagem do vao usada por essa peca (%)
                              <input
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                value={draftItem.measureFormula?.spanPercent ?? 100}
                                onChange={(event) => {
                                  const nextPercent = Math.min(
                                    100,
                                    Math.max(1, Number(event.target.value) || 100)
                                  );
                                  handleDraftMeasureFormulaChange(
                                    "spanPercent",
                                    nextPercent
                                  );
                                }}
                                className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                              />
                              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                Use menos de 100% quando o vao for dividido entre 2 materiais
                                diferentes (ex: 2 lambris de tamanhos distintos).
                              </span>
                            </label>
                          </div>

                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-300">
                            {(() => {
                              const spanPercent = Math.min(
                                100,
                                getPositiveNumber(draftItem.measureFormula?.spanPercent, 100) || 100
                              );
                              const axisLabel =
                                (draftItem.measureFormula?.target || "height") === "height"
                                  ? "altura"
                                  : "largura";
                              return spanPercent < 100
                                ? `O sistema vai adicionar uma nova peca ate completar ${spanPercent}% da ${axisLabel} do vao.`
                                : `O sistema vai adicionar uma nova peca ate completar toda a ${axisLabel} do vao.`;
                            })()}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingItemId) {
                            closeItemModal();
                            return;
                          }
                          setDraftItem(null);
                        }}
                        className="rounded-xl border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        {editingItemId ? "Cancelar" : "Voltar"}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700"
                      >
                        Salvar item
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductModal;
