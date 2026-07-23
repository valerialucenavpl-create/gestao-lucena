const MATERIAL_PURCHASE_LENGTH_CACHE_KEY = "inventory-material-purchase-length-v1";

type MaterialPurchaseLengthCache = Record<string, number>;

const readMaterialPurchaseLengthCache = (): MaterialPurchaseLengthCache => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(MATERIAL_PURCHASE_LENGTH_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeMaterialPurchaseLengthCache = (cache: MaterialPurchaseLengthCache) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MATERIAL_PURCHASE_LENGTH_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch {
    // Ignora falhas de armazenamento local.
  }
};

const parsePositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parsePurchaseLengthFromText = (value: unknown) => {
  const text = String(value ?? "")
    .replace(",", ".")
    .trim()
    .toLowerCase();

  if (!text) return 0;

  const directNumber = parsePositiveNumber(text);
  if (directNumber > 0) return directNumber;

  const meterMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?:etro|etros)?\b/);
  if (meterMatch?.[1]) {
    return parsePositiveNumber(meterMatch[1]);
  }

  const genericMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (genericMatch?.[1]) {
    return parsePositiveNumber(genericMatch[1]);
  }

  return 0;
};

export const getMaterialPurchaseLengthCacheEntry = (
  inventoryId: string | number
) => {
  if (inventoryId === null || inventoryId === undefined) return 0;
  const cache = readMaterialPurchaseLengthCache();
  return parsePositiveNumber(cache[String(inventoryId)]);
};

export const saveMaterialPurchaseLengthCacheEntry = (
  inventoryId: string | number,
  purchaseLengthMeters: number
) => {
  if (inventoryId === null || inventoryId === undefined) return;

  const cache = readMaterialPurchaseLengthCache();
  const safeValue = parsePositiveNumber(purchaseLengthMeters);
  const cacheKey = String(inventoryId);

  if (safeValue > 0) {
    cache[cacheKey] = safeValue;
  } else {
    delete cache[cacheKey];
  }

  writeMaterialPurchaseLengthCache(cache);
};

export const resolveMaterialPurchaseLengthMeters = (
  material?: Record<string, unknown> | null
) => {
  const directValue = parsePositiveNumber(
    material?.purchaseLengthMeters ??
      material?.purchase_length_meters ??
      material?.purchase_length ??
      material?.buy_length_meters ??
      material?.length_meters ??
      material?.standard_size ??
      material?.standardSize
  );

  if (directValue > 0) return directValue;

  const textValue = parsePurchaseLengthFromText(
    material?.purchaseLengthMeters ??
      material?.purchase_length_meters ??
      material?.purchase_length ??
      material?.buy_length_meters ??
      material?.length_meters ??
      material?.standard_size ??
      material?.standardSize
  );

  if (textValue > 0) return textValue;

  const materialId = material?.id;
  if (materialId === null || materialId === undefined || String(materialId).trim() === "") {
    return 0;
  }

  return getMaterialPurchaseLengthCacheEntry(String(materialId));
};
