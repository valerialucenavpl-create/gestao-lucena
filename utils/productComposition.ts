import {
  InventoryItem,
  ProductCompositionAxis,
  ProductCompositionItem,
} from "../types";

type UnitFamily = "length" | "area" | "count" | "mass" | "unknown";

export interface CompositionLineBreakdown {
  calculationUnit: InventoryItem["unit"];
  calculationUnitCost: number;
  baseUnit: InventoryItem["unit"];
  baseUnitCost: number;
  requiredQuantity: number;
  totalCost: number;
  pieceCount: number;
  pieceSizeMm: number;
  formulaLabel: string;
}

const UNIT_FAMILIES: Record<string, UnitFamily> = {
  kg: "mass",
  g: "mass",
  m: "length",
  cm: "length",
  mm: "length",
  "m²": "area",
  un: "count",
};

const LENGTH_UNIT_TO_MM: Record<string, number> = {
  m: 1000,
  cm: 10,
  mm: 1,
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const normalizeUnit = (value: unknown) => String(value ?? "").trim() || "un";

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPositive = (value: number, fallback = 0) => {
  if (!Number.isFinite(value)) return fallback;
  return value >= 0 ? value : fallback;
};

const round = (value: number, digits = 4) =>
  Number(Number.isFinite(value) ? value.toFixed(digits) : 0);

const resolveAxisLabel = (axis: ProductCompositionAxis) =>
  axis === "height" ? "Altura do vao" :
  (axis as string) === "area" ? "M² do vao" :
  "Largura do vao";

const resolveUnitFamily = (unit: string): UnitFamily =>
  UNIT_FAMILIES[normalizeUnit(unit)] || "unknown";

const resolveDimensionMm = (
  axis: ProductCompositionAxis,
  widthMm: number,
  heightMm: number
) => (axis === "height" ? clampPositive(heightMm) : clampPositive(widthMm));

const inferLegacyAxis = (item: ProductCompositionItem): ProductCompositionAxis => {
  if (item.rule === "area_multiplier") return "area";
  if (item.rule === "height_multiplier") return "height";
  return "width";
};

const isCustomCompositionItem = (item: ProductCompositionItem) =>
  Boolean(
    item.applyOn ||
      item.quantityMode ||
      item.measureFormula?.target ||
      item.measureFormula?.intervalMm ||
      item.adjustmentType ||
      item.adjustmentMm ||
      item.divideBy ||
      item.multiplyBy
  );

const applyMeasurementModifiers = (
  baseMm: number,
  item: ProductCompositionItem
) => {
  const adjustmentType = item.adjustmentType || "none";
  const adjustmentMm = clampPositive(toNumber(item.adjustmentMm));
  const divideBy = clampPositive(toNumber(item.divideBy, 1), 1) || 1;
  const multiplyBy = clampPositive(toNumber(item.multiplyBy, 1), 1) || 1;

  let currentMm = clampPositive(baseMm);

  if (adjustmentType === "add") currentMm += adjustmentMm;
  if (adjustmentType === "subtract") currentMm = Math.max(0, currentMm - adjustmentMm);

  currentMm /= divideBy;
  currentMm *= multiplyBy;

  return currentMm;
};

const buildModifierLabel = (item: ProductCompositionItem) => {
  const axis = item.applyOn || inferLegacyAxis(item);
  const adjustmentType = item.adjustmentType || "none";
  const adjustmentMm = clampPositive(toNumber(item.adjustmentMm));
  const divideBy = clampPositive(toNumber(item.divideBy, 1), 1) || 1;
  const multiplyBy = clampPositive(toNumber(item.multiplyBy, 1), 1) || 1;

  let label = resolveAxisLabel(axis);
  if (adjustmentType === "add" && adjustmentMm > 0) label += ` + ${adjustmentMm} mm`;
  if (adjustmentType === "subtract" && adjustmentMm > 0) label += ` - ${adjustmentMm} mm`;
  if (divideBy !== 1) label += ` / ${divideBy}`;
  if (multiplyBy !== 1) label += ` x ${multiplyBy}`;
  return label;
};

const convertLengthMmToMaterialUnit = (lengthMm: number, unit: string) => {
  const normalizedUnit = normalizeUnit(unit);
  const factor = LENGTH_UNIT_TO_MM[normalizedUnit] || 1;
  return factor > 0 ? lengthMm / factor : lengthMm;
};

const getMeasureFormulaTarget = (item: ProductCompositionItem): ProductCompositionAxis => {
  if (item.measureFormula?.target) return item.measureFormula.target;
  return (item.applyOn || inferLegacyAxis(item)) === "height" ? "width" : "height";
};

const getMeasureFormulaInterval = (
  item: ProductCompositionItem,
  material?: InventoryItem | null
) => {
  const explicit = clampPositive(toNumber(item.measureFormula?.intervalMm));
  if (explicit > 0) return explicit;

  const legacyFactor = clampPositive(toNumber(item.factor));
  if (legacyFactor > 0) return legacyFactor;

  if (isLambrilMaterialName((material as any)?.name)) return 120;
  return 0;
};

// Percentual do vão (0-100) que essa peça ocupa antes de dividir pelo
// intervalMm. Permite, por exemplo, dois lambris diferentes dividindo
// 50%/50% da altura do vão, cada um com seu próprio intervalo.
const getMeasureFormulaSpanPercent = (item: ProductCompositionItem) => {
  const raw = toNumber(item.measureFormula?.spanPercent, 100);
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  return Math.min(100, raw);
};

const buildCustomFormulaLabel = (
  item: ProductCompositionItem,
  pieceCount: number,
  material?: InventoryItem | null
) => {
  const modifierLabel = buildModifierLabel(item);
  if (item.quantityMode === "made_to_measure") {
    const target = getMeasureFormulaTarget(item);
    const intervalMm = getMeasureFormulaInterval(item, material);
    const spanPercent = getMeasureFormulaSpanPercent(item);
    const spanLabel =
      spanPercent < 100
        ? `${spanPercent}% da ${resolveAxisLabel(target)}`
        : resolveAxisLabel(target);
    if (intervalMm > 0) {
      return `${modifierLabel} | 1 item a cada ${intervalMm} mm em ${spanLabel} (${pieceCount})`;
    }
  }

  const quantity = clampPositive(toNumber(item.quantity, 1), 1) || 1;
  const qtyLabel = Number.isInteger(quantity) ? String(quantity) : String(quantity).replace(".", ",");
  return `${modifierLabel} | Qtd ${qtyLabel}`;
};

const buildLegacyFormulaLabel = (item: ProductCompositionItem, material?: InventoryItem | null) => {
  switch (item.rule) {
    case "perimeter":
      return "Perimetro do vao";
    case "height_multiplier":
      return `Altura do vao x ${clampPositive(toNumber(item.multiplier, 1), 1) || 1}`;
    case "width_multiplier":
      return `Largura do vao x ${clampPositive(toNumber(item.multiplier, 1), 1) || 1}`;
    case "area_multiplier":
      return `Area do vao x ${clampPositive(toNumber(item.multiplier, 1), 1) || 1}`;
    case "fill": {
      const intervalMm = getMeasureFormulaInterval(item, material);
      if (intervalMm > 0) {
        return `Largura do vao x 1 item a cada ${intervalMm} mm na Altura do vao`;
      }
      return "Preenchimento";
    }
    case "fixed_quantity":
    default: {
      const qty = clampPositive(toNumber(item.quantity, 1), 1) || 1;
      const qLbl = Number.isInteger(qty) ? String(qty) : String(qty).replace(".", ",");
      return `Qtd ${qLbl}`;
    }
  }
};

const buildLengthBreakdown = (
  material: InventoryItem,
  unitCost: number,
  item: ProductCompositionItem,
  widthMm: number,
  heightMm: number
) => {
  const quantityMode = item.quantityMode || "normal";
  const axis = item.applyOn || inferLegacyAxis(item);
  const pieceSizeMm = applyMeasurementModifiers(resolveDimensionMm(axis, widthMm, heightMm), item);

  let pieceCount = clampPositive(toNumber(item.quantity, 1), 1) || 1;

  if (quantityMode === "made_to_measure") {
    const target = getMeasureFormulaTarget(item);
    const intervalMm = getMeasureFormulaInterval(item, material);
    const spanPercent = getMeasureFormulaSpanPercent(item);
    const spanMm = resolveDimensionMm(target, widthMm, heightMm) * (spanPercent / 100);
    pieceCount = intervalMm > 0 ? Math.max(1, Math.ceil(spanMm / intervalMm)) : 1;
  }

  const requiredQuantity = round(
    convertLengthMmToMaterialUnit(pieceSizeMm, material.unit) * pieceCount
  );

  return {
    calculationUnit: material.unit,
    calculationUnitCost: round(unitCost),
    baseUnit: material.unit,
    baseUnitCost: round(unitCost),
    requiredQuantity,
    totalCost: round(requiredQuantity * unitCost),
    pieceCount,
    pieceSizeMm: round(pieceSizeMm),
    formulaLabel: buildCustomFormulaLabel(item, pieceCount, material),
  } satisfies CompositionLineBreakdown;
};

const buildAreaBreakdown = (
  material: InventoryItem,
  unitCost: number,
  item: ProductCompositionItem,
  widthMm: number,
  heightMm: number
) => {
  // Modo M² explícito: largura × altura do vão ÷ 1.000.000 × quantidade
  if ((item.applyOn as string) === "area") {
    const qty = clampPositive(toNumber(item.quantity, 1), 1) || 1;
    const areaM2 = round((clampPositive(widthMm) * clampPositive(heightMm)) / 1_000_000);
    const requiredQuantity = round(areaM2 * qty);
    const qtyLabel = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
    return {
      calculationUnit: material.unit,
      calculationUnitCost: round(unitCost),
      baseUnit: material.unit,
      baseUnitCost: round(unitCost),
      requiredQuantity,
      totalCost: round(requiredQuantity * unitCost),
      pieceCount: qty,
      pieceSizeMm: 0,
      formulaLabel: qty === 1 ? "M² do vão" : `M² do vão | Qtd ${qtyLabel}`,
    } satisfies CompositionLineBreakdown;
  }

  if (isCustomCompositionItem(item)) {
    const axis = item.applyOn || "width";
    const adjustedMm = applyMeasurementModifiers(resolveDimensionMm(axis, widthMm, heightMm), item);
    const otherAxis = axis === "height" ? "width" : "height";
    const otherMm = resolveDimensionMm(otherAxis, widthMm, heightMm);
    const quantityMode = item.quantityMode || "normal";

    let pieceCount = 1;
    if (quantityMode === "made_to_measure") {
      const target = getMeasureFormulaTarget(item);
      const intervalMm = getMeasureFormulaInterval(item, material);
      const spanPercent = getMeasureFormulaSpanPercent(item);
      const spanMm = resolveDimensionMm(target, widthMm, heightMm) * (spanPercent / 100);
      pieceCount = intervalMm > 0 ? Math.max(1, Math.ceil(spanMm / intervalMm)) : 1;
    } else {
      pieceCount = clampPositive(toNumber(item.quantity, 1), 1) || 1;
    }

    const requiredQuantity = round(((adjustedMm * otherMm) / 1_000_000) * pieceCount);

    return {
      calculationUnit: material.unit,
      calculationUnitCost: round(unitCost),
      baseUnit: material.unit,
      baseUnitCost: round(unitCost),
      requiredQuantity,
      totalCost: round(requiredQuantity * unitCost),
      pieceCount,
      pieceSizeMm: round(adjustedMm),
      formulaLabel: buildCustomFormulaLabel(item, pieceCount, material),
    } satisfies CompositionLineBreakdown;
  }

  const areaMultiplier = clampPositive(toNumber(item.multiplier, 1), 1) || 1;
  const requiredQuantity = round(((clampPositive(widthMm) * clampPositive(heightMm)) / 1_000_000) * areaMultiplier);

  return {
    calculationUnit: material.unit,
    calculationUnitCost: round(unitCost),
    baseUnit: material.unit,
    baseUnitCost: round(unitCost),
    requiredQuantity,
    totalCost: round(requiredQuantity * unitCost),
    pieceCount: areaMultiplier,
    pieceSizeMm: 0,
    formulaLabel: buildLegacyFormulaLabel(item, material),
  } satisfies CompositionLineBreakdown;
};

const buildCountOrMassBreakdown = (
  material: InventoryItem,
  unitCost: number,
  item: ProductCompositionItem
) => {
  const quantityMode = item.quantityMode || "normal";
  const perPieceQuantity = clampPositive(toNumber(item.quantity, 1), 1) || 1;

  let pieceCount = perPieceQuantity;
  if (quantityMode === "made_to_measure") {
    const intervalMm = getMeasureFormulaInterval(item, material);
    const target = getMeasureFormulaTarget(item);
    const spanPercent = getMeasureFormulaSpanPercent(item);
    const spanMm = resolveDimensionMm(target, 1000, 1000) * (spanPercent / 100);
    pieceCount = intervalMm > 0 ? Math.max(1, Math.ceil(spanMm / intervalMm)) : 1;
  }

  const requiredQuantity =
    quantityMode === "made_to_measure" ? round(pieceCount * perPieceQuantity) : perPieceQuantity;

  return {
    calculationUnit: material.unit,
    calculationUnitCost: round(unitCost),
    baseUnit: material.unit,
    baseUnitCost: round(unitCost),
    requiredQuantity,
    totalCost: round(requiredQuantity * unitCost),
    pieceCount: round(pieceCount),
    pieceSizeMm: 0,
    formulaLabel:
      quantityMode === "made_to_measure"
        ? buildCustomFormulaLabel(item, round(pieceCount), material)
        : buildLegacyFormulaLabel(item, material),
  } satisfies CompositionLineBreakdown;
};

const buildLegacyBreakdown = (
  item: ProductCompositionItem,
  material: InventoryItem,
  unitCost: number,
  widthMm: number,
  heightMm: number
) => {
  const unitFamily = resolveUnitFamily(material.unit);

  switch (item.rule) {
    case "perimeter": {
      const totalLengthMm = clampPositive(widthMm) * 2 + clampPositive(heightMm) * 2;
      const requiredQuantity = round(
        convertLengthMmToMaterialUnit(totalLengthMm, material.unit)
      );

      return {
        calculationUnit: material.unit,
        calculationUnitCost: round(unitCost),
        baseUnit: material.unit,
        baseUnitCost: round(unitCost),
        requiredQuantity,
        totalCost: round(requiredQuantity * unitCost),
        pieceCount: 1,
        pieceSizeMm: round(totalLengthMm),
        formulaLabel: buildLegacyFormulaLabel(item, material),
      } satisfies CompositionLineBreakdown;
    }
    case "height_multiplier": {
      const multiplier = clampPositive(toNumber(item.multiplier, 1), 1) || 1;
      const requiredQuantity = round(
        convertLengthMmToMaterialUnit(clampPositive(heightMm), material.unit) * multiplier
      );

      return {
        calculationUnit: material.unit,
        calculationUnitCost: round(unitCost),
        baseUnit: material.unit,
        baseUnitCost: round(unitCost),
        requiredQuantity,
        totalCost: round(requiredQuantity * unitCost),
        pieceCount: multiplier,
        pieceSizeMm: round(clampPositive(heightMm)),
        formulaLabel: buildLegacyFormulaLabel(item, material),
      } satisfies CompositionLineBreakdown;
    }
    case "width_multiplier": {
      const multiplier = clampPositive(toNumber(item.multiplier, 1), 1) || 1;
      const requiredQuantity = round(
        convertLengthMmToMaterialUnit(clampPositive(widthMm), material.unit) * multiplier
      );

      return {
        calculationUnit: material.unit,
        calculationUnitCost: round(unitCost),
        baseUnit: material.unit,
        baseUnitCost: round(unitCost),
        requiredQuantity,
        totalCost: round(requiredQuantity * unitCost),
        pieceCount: multiplier,
        pieceSizeMm: round(clampPositive(widthMm)),
        formulaLabel: buildLegacyFormulaLabel(item, material),
      } satisfies CompositionLineBreakdown;
    }
    case "area_multiplier":
      return buildAreaBreakdown(material, unitCost, item, widthMm, heightMm);
    case "fill": {
      if (unitFamily === "length") {
        const intervalMm = getMeasureFormulaInterval(item, material) || 120;
        const pieceCount = Math.max(1, Math.ceil(clampPositive(heightMm) / intervalMm));
        const requiredQuantity = round(
          convertLengthMmToMaterialUnit(clampPositive(widthMm), material.unit) * pieceCount
        );

        return {
          calculationUnit: material.unit,
          calculationUnitCost: round(unitCost),
          baseUnit: material.unit,
          baseUnitCost: round(unitCost),
          requiredQuantity,
          totalCost: round(requiredQuantity * unitCost),
          pieceCount,
          pieceSizeMm: round(clampPositive(widthMm)),
          formulaLabel: buildLegacyFormulaLabel(item, material),
        } satisfies CompositionLineBreakdown;
      }

      return buildAreaBreakdown(material, unitCost, item, widthMm, heightMm);
    }
    case "fixed_quantity":
    default:
      return buildCountOrMassBreakdown(material, unitCost, item);
  }
};

export const isLambrilMaterialName = (value: unknown) => {
  const normalized = normalizeText(value);
  return normalized.includes("LAMBRIL") || normalized.includes("LB 030");
};

export const getCompositionLineBreakdown = (
  item: ProductCompositionItem,
  material: InventoryItem,
  unitCost: number,
  widthMm: number,
  heightMm: number
): CompositionLineBreakdown => {
  const safeUnitCost = clampPositive(toNumber(unitCost));
  const unitFamily = resolveUnitFamily(material.unit);

  if (!material) {
    return {
      calculationUnit: "un",
      calculationUnitCost: 0,
      baseUnit: "un",
      baseUnitCost: 0,
      requiredQuantity: 0,
      totalCost: 0,
      pieceCount: 0,
      pieceSizeMm: 0,
      formulaLabel: "",
    };
  }

  // Modo M²: largura × altura ÷ 1.000.000 × quantidade
  if ((item.applyOn as string) === "area") {
    return buildAreaBreakdown(material, safeUnitCost, item, widthMm, heightMm);
  }

  // Modo Acessório: usa apenas quantidade fixa, sem depender de medidas
  if ((item.applyOn as string) === "accessory") {
    const qty = Math.max(0.001, toNumber(item.quantity, 1));
    const totalCost = round(qty * safeUnitCost);
    const qtyLabel = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
    return {
      calculationUnit: material.unit,
      calculationUnitCost: round(safeUnitCost),
      baseUnit: material.unit,
      baseUnitCost: round(safeUnitCost),
      requiredQuantity: qty,
      totalCost,
      pieceCount: qty,
      pieceSizeMm: 0,
      formulaLabel: `Acessório | Qtd ${qtyLabel}`,
    };
  }

  if (isCustomCompositionItem(item)) {
    if (unitFamily === "length") {
      return buildLengthBreakdown(material, safeUnitCost, item, widthMm, heightMm);
    }

    if (unitFamily === "area") {
      return buildAreaBreakdown(material, safeUnitCost, item, widthMm, heightMm);
    }

    return buildCountOrMassBreakdown(material, safeUnitCost, item);
  }

  return buildLegacyBreakdown(item, material, safeUnitCost, widthMm, heightMm);
};

export const buildCompositionFormulaPreview = (
  item: ProductCompositionItem,
  material: InventoryItem,
  widthMm: number,
  heightMm: number
) => getCompositionLineBreakdown(item, material, 0, widthMm, heightMm).formulaLabel;

export const calculateProductModalLineCost = (
  item: ProductCompositionItem,
  material: InventoryItem,
  unitCost: number,
  widthMm: number,
  heightMm: number
) => getCompositionLineBreakdown(item, material, unitCost, widthMm, heightMm).totalCost;

export const calculateQuoteCompositionLineCost = (
  item: ProductCompositionItem,
  material: InventoryItem,
  unitCost: number,
  widthMm: number,
  heightMm: number
) => getCompositionLineBreakdown(item, material, unitCost, widthMm, heightMm).totalCost;
