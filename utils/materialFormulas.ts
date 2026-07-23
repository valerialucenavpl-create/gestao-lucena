import { InventoryItem, ProductCompositionItem } from "../types";

const SIX_METER_BAR = 6;
const THREE_METER_GATE_LIMIT = 3;

const normalizeMaterialKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const materialMatches = (materialName: string, tokens: string[]) => {
  const normalizedName = normalizeMaterialKey(materialName);
  return tokens.some((token) => normalizedName.includes(token));
};

const LB_TOKENS = [
  "LB030",
  "LBLISO",
  "LBLISOCOMFRISO",
  "LB044RIPADO",
  "LB020DUPLADO",
  "LBY010",
  "LB004",
  "LB070",
  "LB005",
];

const DIRECT_BAR_TOKENS = ["25517", "TG004", "REGUADEPEDREIRO", "PT008"];
const PC027_TOKENS = ["PC027"];
const PU639_TOKENS = ["PU639"];
const CUNHA_CANTONEIRA_TOKENS = ["CUNHA", "CANTONEIRA"];
const SIX_METER_METER_BASED_TOKENS = [
  "TRILHO",
  "CLICK",
  "CABECOTE",
  "TAMPA",
  "PUDE8MM",
  "PU8MM",
  "PUDE10MM",
  "PU10MM",
];

const safePositiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const getInputAmount = (item: ProductCompositionItem, fallback = 0) => {
  if (item.rule === "fixed_quantity") return safePositiveNumber(item.quantity, fallback);
  if (item.rule === "fill") return safePositiveNumber(item.factor, fallback);
  return safePositiveNumber(item.multiplier, fallback);
};

const getRuleQuantity = (
  item: ProductCompositionItem,
  material: InventoryItem,
  widthMm: number,
  heightMm: number
) => {
  const widthM = Math.max(0, Number(widthMm) || 0) / 1000;
  const heightM = Math.max(0, Number(heightMm) || 0) / 1000;

  switch (item.rule) {
    case "perimeter":
      return widthM * 2 + heightM * 2;
    case "height_multiplier":
      return heightM * (safePositiveNumber(item.multiplier, 1) || 1);
    case "width_multiplier":
      return widthM * (safePositiveNumber(item.multiplier, 1) || 1);
    case "area_multiplier":
      return widthM * heightM * (safePositiveNumber(item.multiplier, 1) || 1);
    case "fill":
      if (material.unit === "m²") {
        return widthM * heightM;
      }
      const pieceWidthM = safePositiveNumber(item.factor, 0) / 1000;
      if (pieceWidthM <= 0) return 0;
      return Math.ceil(widthM / pieceWidthM) * heightM;
    case "fixed_quantity":
      return safePositiveNumber(item.quantity, 1);
    default:
      return 0;
  }
};

export const isLambrilMaterialName = (materialName: string) =>
  materialMatches(materialName, LB_TOKENS);

const isDirectBarInputMaterial = (materialName: string) =>
  materialMatches(materialName, DIRECT_BAR_TOKENS);

const isPc027Material = (materialName: string) =>
  materialMatches(materialName, PC027_TOKENS);

const isPu639Material = (materialName: string) =>
  materialMatches(materialName, PU639_TOKENS);

const isCunhaCantoneiraMaterial = (materialName: string) =>
  materialMatches(materialName, CUNHA_CANTONEIRA_TOKENS);

const isSixMeterMeterBasedMaterial = (materialName: string) =>
  materialMatches(materialName, SIX_METER_METER_BASED_TOKENS);

export const calculateQuoteCompositionLineCost = (
  item: ProductCompositionItem,
  material: InventoryItem,
  unitCost: number,
  widthMm: number,
  heightMm: number
) => {
  const safeUnitCost = safePositiveNumber(unitCost, 0);
  const materialName = String(material?.name ?? "");
  const widthM = Math.max(0, Number(widthMm) || 0) / 1000;
  const heightM = Math.max(0, Number(heightMm) || 0) / 1000;
  const defaultRuleQty = getRuleQuantity(item, material, widthMm, heightMm);

  if (isDirectBarInputMaterial(materialName)) {
    const bars = getInputAmount(item, 1);
    return bars * safeUnitCost;
  }

  if (isPc027Material(materialName)) {
    const pieceFactor = getInputAmount(item, 1);
    if (item.rule === "height_multiplier") {
      const barsPerPiece = heightM <= THREE_METER_GATE_LIMIT ? 0.5 : heightM / SIX_METER_BAR;
      return pieceFactor * barsPerPiece * safeUnitCost;
    }
    if (item.rule === "width_multiplier") {
      return pieceFactor * (widthM / SIX_METER_BAR) * safeUnitCost;
    }
    return defaultRuleQty * (safeUnitCost / SIX_METER_BAR);
  }

  if (isLambrilMaterialName(materialName)) {
    const lambrilWidthCm = safePositiveNumber(item.lambrilWidthCm, 0);
    if (lambrilWidthCm <= 0 || widthM <= 0 || heightM <= 0) return 0;

    const piecesByHeight = (heightM * 100) / lambrilWidthCm;
    const materialFactor = getInputAmount(item, 1);
    const barsPerPiece = widthM <= THREE_METER_GATE_LIMIT ? 0.5 : widthM / SIX_METER_BAR;
    return piecesByHeight * barsPerPiece * materialFactor * safeUnitCost;
  }

  if (isPu639Material(materialName)) {
    const materialFactor = getInputAmount(item, 1);
    const barsPerUse = widthM <= THREE_METER_GATE_LIMIT ? 1 : widthM / SIX_METER_BAR;
    return materialFactor * barsPerUse * safeUnitCost;
  }

  if (isCunhaCantoneiraMaterial(materialName)) {
    const pieces = getInputAmount(item, 1);
    return pieces * (safeUnitCost / 7);
  }

  if (isSixMeterMeterBasedMaterial(materialName)) {
    return defaultRuleQty * (safeUnitCost / SIX_METER_BAR);
  }

  return defaultRuleQty * safeUnitCost;
};

export const calculateProductModalLineCost = (
  item: ProductCompositionItem,
  material: InventoryItem | undefined,
  unitCost: number
) => {
  const safeUnitCost = safePositiveNumber(unitCost, 0);
  const materialName = String(material?.name ?? "");

  if (isCunhaCantoneiraMaterial(materialName)) {
    const pieces = getInputAmount(item, 1);
    return pieces * (safeUnitCost / 7);
  }

  if (item.rule === "fixed_quantity") return safePositiveNumber(item.quantity, 0) * safeUnitCost;
  if (item.rule === "fill") return safeUnitCost;

  const multiplier = safePositiveNumber(item.multiplier, 0);

  if (isPc027Material(materialName) && item.rule === "height_multiplier") {
    return multiplier * 0.5 * safeUnitCost;
  }

  if (isPc027Material(materialName) || isSixMeterMeterBasedMaterial(materialName)) {
    return multiplier * (safeUnitCost / SIX_METER_BAR);
  }

  return multiplier * safeUnitCost;
};
