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
  "ALUMINIO",
  "ACESSORIO VIDRO",
  "ACESSORIO DE ALUMINIO",
  "FERRO PORTAO AUTOMATICO",
  "ACESSORIOS PORTAO AUTOMATICO",
  "MOTOR RESIDENCIAL",
  "MOTOR PORTAO AUTOMATICO",
  "MARMORE",
  "ACESSORIO DE MARMORE",
];

const productStructureByCategory: Record<
  string,
  { products: string[]; subCategory1: string[]; subCategory2: string[]; subCategory3: string[] }
> = {
  ALUMINIO: {
    products: ["Portao", "Porta", "Grade", "Janela"],
    subCategory1: ["2 Folhas", "3 Folhas", "Correr", "Basculante", "Abrir", "Fixo"],
    subCategory2: ["Com Porta", "Sem Porta", "Fixa"],
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
  const [fixedCostRate, setFixedCostRate] = useState(
    Number((product as any)?.fixedCostRate ?? 20)
  );
  const [absorptionRate, setAbsorptionRate] = useState(
    Number((product as any)?.absorptionRate ?? 15)
  );
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

    // Auto-load fixedCostRate from billing settings (always reflects system settings)
    const loadFixedCostRate = async () => {
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
        setFixedCostRate(Number(((fixedTotal + empTotal) / monthlyRevenue * 100).toFixed(2)));
      }
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

  useEffect(() => {
    const family = resolveProductFamily(category);
    if (family) {
      setProductCategory(family);
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
    if (classificationOptions.length === 0) return;
    setProductType((prev) =>
      classificationOptions.includes(prev) ? prev : classificationOptions[0]
    );
  }, [classificationOptions]);

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

  const laborHoursTotal = useMemo(
    () => getPositiveNumber(productionHours) + getPositiveNumber(assemblyHours),
    [assemblyHours, productionHours]
  );

  const professionalTotal = useMemo(
    () => getPositiveNumber(professionalCount) * getPositiveNumber(professionalHours) * getPositiveNumber(professionalRate),
    [professionalCount, professionalHours, professionalRate]
  );

  const helperTotal = useMemo(
    () => getPositiveNumber(helperCount) * getPositiveNumber(helperHours) * getPositiveNumber(helperRate),
    [helperCount, helperHours, helperRate]
  );

  const laborCost = useMemo(
    () => {
      const detailed = professionalTotal + helperTotal;
      // Se usou os campos detalhados, usa o total deles; senão cai no legado
      if (detailed > 0) return detailed;
      return laborHoursTotal * getPositiveNumber(hourlyRate);
    },
    [professionalTotal, helperTotal, laborHoursTotal, hourlyRate]
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

  const baseOperationalCost = materialCost + laborCost;
  const absorptionCost = baseOperationalCost * (getPositiveNumber(absorptionRate) / 100);
  const totalCostBeforeMarkup = baseOperationalCost + absorptionCost;
  const markupRate =
    getPositiveNumber(desiredProfitMargin) +
    getPositiveNumber(fixedCostRate) +
    taxRate +
    commissionRate +
    otherVariableRate;
  const salePriceUnit =
    markupRate < 100
      ? totalCostBeforeMarkup / (1 - markupRate / 100)
      : totalCostBeforeMarkup;
  const taxValue = salePriceUnit * (taxRate / 100);
  const commissionValue = salePriceUnit * (commissionRate / 100);
  const otherVariableValue = salePriceUnit * (otherVariableRate / 100);
  const fixedCostValue = salePriceUnit * (getPositiveNumber(fixedCostRate) / 100);
  const netMarginValue =
    salePriceUnit -
    totalCostBeforeMarkup -
    taxValue -
    commissionValue -
    otherVariableValue -
    fixedCostValue;
  const netMarginRate = salePriceUnit > 0 ? (netMarginValue / salePriceUnit) * 100 : 0;
  const contributionValue =
    salePriceUnit - materialCost - taxValue - commissionValue - otherVariableValue - fixedCostValue;
  const contributionRate =
    salePriceUnit > 0 ? (contributionValue / salePriceUnit) * 100 : 0;
  const finalTotal = salePriceUnit * getPositiveInteger(quantity, 1);

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
    field: "target" | "intervalMm",
    value: unknown
  ) => {
    setDraftItem((prev) =>
      prev
        ? {
            ...prev,
            measureFormula: {
              target: prev.measureFormula?.target || "height",
              intervalMm: getPositiveInteger(prev.measureFormula?.intervalMm, 120),
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
      fixedCostRate: getPositiveNumber(fixedCostRate),
      absorptionRate: getPositiveNumber(absorptionRate),
      quantityReference: getPositiveInteger(quantity, 1),
      selectedCategoryColor,
      referenceWidthMm: getPositiveInteger(referenceWidthMm, 1),
      referenceHeightMm: getPositiveInteger(referenceHeightMm, 1),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-7xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {product ? "Editar produto personalizado" : "Novo produto personalizado"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Monte a composicao por materia-prima e teste a formula com largura e altura
              de referencia.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[calc(94vh-88px)] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,1fr]">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Foto do produto
                </label>
                <label className="block cursor-pointer overflow-hidden rounded-[20px] border border-dashed border-slate-300 bg-white">
                  {image ? (
                    <img
                      src={image}
                      alt="Preview do produto"
                      className="h-[280px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[280px] items-center justify-center px-6 text-center text-sm text-slate-400">
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

              <div className="space-y-5 rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nome do produto
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      placeholder="Ex.: Portao de correr LB 030"
                      required
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Esta pre-visualizacao fica disponivel para o cliente.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
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
                          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          placeholder="Ex.: Portao"
                        />
                      )}
                    </div>

                    {subCategory1Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {subCategory2Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {subCategory3Options.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Simulacao da formula
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-700">
                        Largura do vao (mm)
                        <input
                          type="number"
                          min={1}
                          value={referenceWidthMm}
                          onChange={(event) =>
                            setReferenceWidthMm(Number(event.target.value) || 0)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                        />
                      </label>

                      <label className="text-sm text-slate-700">
                        Altura do vao (mm)
                        <input
                          type="number"
                          min={1}
                          value={referenceHeightMm}
                          onChange={(event) =>
                            setReferenceHeightMm(Number(event.target.value) || 0)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Esses valores servem para testar a formula antes de salvar o produto.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Materia-prima e composicao do produto
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
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
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Ainda nao existe item nesta composicao. Clique em <strong>Adicionar item</strong>
                    {" "}para escolher a materia-prima e configurar a formula.
                  </div>
                )}

                {compositionEntries.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {compositionEntries.map(({ item, material, unitCost, breakdown }) => (
                      <article
                        key={item.id}
                        className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenItemMenuId((prev) => (prev === item.id ? null : item.id))
                          }
                          className="absolute right-4 top-4 z-10 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                        >
                          ...
                        </button>

                        {openItemMenuId === item.id && (
                          <div className="absolute right-4 top-14 z-20 min-w-[150px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <button
                              type="button"
                              onClick={() => openEditItemModal(item)}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
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
                          <div className="h-24 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {getMaterialPhoto(material) ? (
                              <img
                                src={getMaterialPhoto(material)}
                                alt={material?.name || "Material"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-400">
                                Sem foto
                              </div>
                            )}
                          </div>

                          <div className="pr-8">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {getMaterialLine(material) || "Sem linha"}
                            </p>
                            <h4 className="mt-1 text-lg font-semibold text-slate-900">
                              {material?.name || "Material nao encontrado"}
                            </h4>
                            {item.variantName && (
                              <p className="mt-1 text-sm text-slate-500">
                                Variacao: {item.variantName}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-slate-600">
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

                        <div className="grid gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Fator de multiplicacao
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900">
                              x{getPositiveNumber(item.multiplyBy, 1).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Quantidade
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900">
                              {breakdown?.pieceCount || 0} item(ns)
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Consumo total
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900">
                              {breakdown
                                ? formatQuantity(
                                    breakdown.requiredQuantity,
                                    breakdown.calculationUnit
                                  )
                                : "--"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Custo estimado
                            </p>
                            <p className="mt-1 text-base font-semibold text-slate-900">
                              {formatCurrency(breakdown?.totalCost || 0)}
                            </p>
                            <p className="text-xs text-slate-500">
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

            <section className="rounded-[24px] border border-slate-200 bg-white p-6">
              <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">
                      Detalhamento financeiro do produto
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      A parte financeira foi mantida para testar se a formula esta chegando no
                      custo corretamente.
                    </p>
                  </div>

                  {/* PROFISSIONAL */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Profissional</p>
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-sm text-slate-700">
                        Qtd pessoas
                        <input type="number" min={0} value={professionalCount}
                          onChange={(e) => setProfessionalCount(Number(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Horas trabalhadas
                        <input type="number" min={0} value={professionalHours}
                          onChange={(e) => setProfessionalHours(Number(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Valor hora (R$)
                        <input type="text" inputMode="decimal" value={professionalRateInput}
                          onChange={(e) => { const v = sanitizeMoneyInputBR(e.target.value); setProfessionalRateInput(v); setProfessionalRate(parseMoneyInputBR(v)); }}
                          onBlur={() => setProfessionalRateInput(formatMoneyInputBR(professionalRate))}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Total profissional
                        <input readOnly value={professionalTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800" />
                      </label>
                    </div>
                  </div>

                  {/* AJUDANTE */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Ajudante</p>
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-sm text-slate-700">
                        Qtd pessoas
                        <input type="number" min={0} value={helperCount}
                          onChange={(e) => setHelperCount(Number(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Horas trabalhadas
                        <input type="number" min={0} value={helperHours}
                          onChange={(e) => setHelperHours(Number(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Valor hora (R$)
                        <input type="text" inputMode="decimal" value={helperRateInput}
                          onChange={(e) => { const v = sanitizeMoneyInputBR(e.target.value); setHelperRateInput(v); setHelperRate(parseMoneyInputBR(v)); }}
                          onBlur={() => setHelperRateInput(formatMoneyInputBR(helperRate))}
                          onFocus={(e) => e.target.select()}
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
                      </label>
                      <label className="text-sm text-slate-700">
                        Total ajudante
                        <input readOnly value={helperTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800" />
                      </label>
                    </div>
                  </div>

                  {/* TOTAL MÃO DE OBRA */}
                  <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-3">
                    <span className="text-sm font-semibold text-primary-800">Total mão de obra</span>
                    <span className="text-base font-bold text-primary-700">
                      {laborCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm text-slate-700">
                      Margem de lucro (%)
                      <input
                        type="number"
                        min={0}
                        value={desiredProfitMargin}
                        onChange={(event) =>
                          setDesiredProfitMargin(Number(event.target.value) || 0)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                      />
                    </label>

                    <label className="text-sm text-slate-700">
                      Rateio por absorcao (%)
                      <input
                        type="number"
                        min={0}
                        value={absorptionRate}
                        onChange={(event) =>
                          setAbsorptionRate(Number(event.target.value) || 0)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                      />
                    </label>

                    <label className="text-sm text-slate-700">
                      Quantidade vendida
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(event) =>
                          setQuantity(Number(event.target.value) || 1)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                      />
                    </label>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <span className="font-semibold text-slate-700">Custos fixos:</span>{" "}
                    <span className="font-bold text-slate-900">{fixedCostRate.toFixed(2)}%</span>
                    {percentVariableExpenses.length > 0 && (
                      <>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="font-semibold text-slate-700">Custos variáveis:</span>{" "}
                        {percentVariableExpenses.map((e) => (
                          <span key={e.id} className="mr-2">
                            {e.name} <span className="font-bold text-slate-900">{Number(e.value).toFixed(2)}%</span>
                          </span>
                        ))}
                      </>
                    )}
                    <span className="ml-2 text-xs text-slate-400">(definidos no Financeiro)</span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <div className="space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Custo materia-prima</span>
                      <strong>{formatCurrency(materialCost)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Mao de obra ({laborHoursTotal.toFixed(2)} h)</span>
                      <strong>{formatCurrency(laborCost)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Rateio por absorcao ({absorptionRate.toFixed(2)}%)</span>
                      <strong>{formatCurrency(absorptionCost)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Impostos ({taxRate.toFixed(2)}%)</span>
                      <strong>{formatCurrency(taxValue)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Comissao vendedora ({commissionRate.toFixed(2)}%)</span>
                      <strong>{formatCurrency(commissionValue)}</strong>
                    </div>
                    {otherVariableExpenses.map((expense) => {
                      const rate = Number(expense.value || 0);
                      const val = salePriceUnit * (rate / 100);
                      return (
                        <div key={expense.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                          <span>{expense.name} ({rate.toFixed(2)}%)</span>
                          <strong>{formatCurrency(val)}</strong>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Custos fixos ({fixedCostRate.toFixed(2)}%)</span>
                      <strong>{formatCurrency(fixedCostValue)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3 text-blue-900">
                      <span>Preco sugerido por unidade</span>
                      <strong>{formatCurrency(salePriceUnit)}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Margem liquida</span>
                      <strong>
                        {formatCurrency(netMarginValue)} ({netMarginRate.toFixed(2)}%)
                      </strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                      <span>Margem de contribuicao</span>
                      <strong>
                        {formatCurrency(contributionValue)} ({contributionRate.toFixed(2)}%)
                      </strong>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] bg-slate-900 px-5 py-4 text-white">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                      Preco final
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                      {formatCurrency(finalTotal)}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Considerando {getPositiveInteger(quantity, 1)} unidade(s) vendida(s).
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
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
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900">
                  {draftItem ? "Configurar item" : "Selecionar materia-prima"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {draftItem
                    ? "Defina a formula do item e salve para voltar a composicao do produto."
                    : "Escolha o item com foto para montar a composicao do produto."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeItemModal}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>

            {!draftItem ? (
              <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    Filtre a linha do item
                    <select
                      value={lineFilter}
                      onChange={(event) => setLineFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                    >
                      <option value="">Todas as linhas</option>
                      {lineOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-slate-700">
                    Filtre o nome do item
                    <input
                      type="text"
                      value={nameFilter}
                      onChange={(event) => setNameFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                      placeholder="Ex.: Perfil"
                    />
                  </label>
                </div>

                <div className="mt-6 space-y-6">
                  {groupedPickerMaterials.map(([groupName, items]) => (
                    <section key={groupName}>
                      <h4 className="mb-3 text-lg font-semibold text-slate-900">
                        {groupName || "Sem linha"}
                      </h4>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((material) => (
                          <button
                            key={material.id}
                            type="button"
                            onClick={() => handleSelectMaterial(material)}
                            className="grid grid-cols-[88px,1fr] items-center gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white"
                          >
                            <div className="h-24 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                              {getMaterialPhoto(material) ? (
                                <img
                                  src={getMaterialPhoto(material)}
                                  alt={material.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-400">
                                  Sem foto
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {getMaterialLine(material) || "Sem linha"}
                              </p>
                              <h5 className="mt-1 text-base font-semibold text-slate-900">
                                {material.name}
                              </h5>
                              <p className="mt-2 text-sm text-slate-500">
                                Unidade: {material.unit}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}

                  {groupedPickerMaterials.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      Nenhum material encontrado com os filtros informados.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-6">
                <div className="grid gap-6 xl:grid-cols-[340px,1fr]">
                  <aside className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
                      {getMaterialPhoto(selectedDraftMaterial) ? (
                        <img
                          src={getMaterialPhoto(selectedDraftMaterial)}
                          alt={selectedDraftMaterial?.name || "Material"}
                          className="h-[220px] w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-slate-400">
                          Sem foto cadastrada para este material
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Item selecionado
                      </p>
                      <h4 className="text-xl font-semibold text-slate-900">
                        {selectedDraftMaterial?.name}
                      </h4>
                      <p className="text-sm text-slate-500">
                        {getMaterialLine(selectedDraftMaterial) || "Sem linha"} - Unidade{" "}
                        {selectedDraftMaterial?.unit || "un"}
                      </p>
                    </div>

                    {getMaterialVariants(selectedDraftMaterial).length > 0 && (
                      <label className="mt-5 block text-sm text-slate-700">
                        Variacao do material
                        <select
                          value={draftItem.variantName || ""}
                          onChange={(event) =>
                            handleDraftChange("variantName", event.target.value)
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
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
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
                              Quantidade
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {draftBreakdown.pieceCount} item(ns)
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
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
                  <div className="space-y-6 rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">
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
                                    : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
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

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">
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
                                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
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
                      <label className="text-sm text-slate-700">
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
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 disabled:bg-slate-100"
                        />
                      </label>

                      <label className="text-sm text-slate-700">
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
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 disabled:bg-slate-100"
                        />
                      </label>

                      <label className="text-sm text-slate-700">
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
                          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 disabled:bg-slate-100"
                        />
                      </label>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            Quantidade de itens
                          </p>
                          <p className="text-xs text-slate-500">
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
                                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(draftItem.quantityMode || "normal") === "normal" ? (
                        <label className="mt-5 block text-sm text-slate-700">
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
                            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                          />
                        </label>
                      ) : (
                        <div className="mt-5 space-y-4 rounded-[24px] border border-blue-100 bg-white p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-700">
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
                                        : "bg-slate-50 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <label className="text-sm text-slate-700">
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
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                              />
                            </label>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                            O sistema vai adicionar uma nova peca ate completar toda a{" "}
                            {(draftItem.measureFormula?.target || "height") === "height"
                              ? "altura"
                              : "largura"}{" "}
                            do vao.
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingItemId) {
                            closeItemModal();
                            return;
                          }
                          setDraftItem(null);
                        }}
                        className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
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
