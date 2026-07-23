import { supabase } from "../services/supabase";

export const MATERIAL_PHOTO_BUCKETS = [
  import.meta.env.VITE_SUPABASE_MATERIALS_BUCKET,
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET,
  "company-logos",
  "company-assets",
  "inventory-images",
  "materials",
].filter(
  (bucket, index, all): bucket is string =>
    Boolean(bucket) && all.indexOf(bucket) === index
);

const MATERIAL_PHOTO_CACHE_KEY = "inventory-material-photo-cache-v1";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

interface MaterialPhotoCacheEntry {
  url: string;
  bucket?: string;
  path?: string;
  updatedAt: number;
}

const getTrimmedString = (...values: unknown[]) => {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }

  return "";
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || "").trim());

export const extractMaterialStorageInfoFromUrl = (value: string) => {
  const safeValue = String(value || "").trim();
  if (!isHttpUrl(safeValue)) return null;

  try {
    const parsedUrl = new URL(safeValue);
    const match = parsedUrl.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
    );
    if (!match?.[1] || !match?.[2]) return null;

    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
};

const readMaterialPhotoCache = (): Record<string, MaterialPhotoCacheEntry> => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(MATERIAL_PHOTO_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeMaterialPhotoCache = (cache: Record<string, MaterialPhotoCacheEntry>) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MATERIAL_PHOTO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignora falhas de armazenamento local.
  }
};

export const saveMaterialPhotoCacheEntry = (
  inventoryId: number | string,
  payload: { url: string; bucket?: string; path?: string }
) => {
  const cache = readMaterialPhotoCache();
  cache[String(inventoryId)] = {
    url: payload.url,
    bucket: payload.bucket,
    path: payload.path,
    updatedAt: Date.now(),
  };
  writeMaterialPhotoCache(cache);
};

export const getMaterialPhotoCacheEntry = (inventoryId: number | string) => {
  const cache = readMaterialPhotoCache();
  return cache[String(inventoryId)];
};

const createStorageUrl = async (bucket: string, path: string) => {
  const safeBucket = String(bucket || "").trim();
  const safePath = String(path || "").trim();
  if (!safeBucket || !safePath) return "";

  const { data: signedData, error: signedError } = await supabase.storage
    .from(safeBucket)
    .createSignedUrl(safePath, SIGNED_URL_TTL_SECONDS);
  const signedUrl = String(signedData?.signedUrl || "").trim();
  if (!signedError && signedUrl) {
    return signedUrl;
  }

  const { data } = supabase.storage.from(safeBucket).getPublicUrl(safePath);
  return String(data?.publicUrl || "").trim();
};

export const resolveMaterialPhotoUrl = async (
  material?: Record<string, unknown> | null
) => {
  const directUrl = getTrimmedString(
    material?.photo_url,
    material?.image_url,
    material?.photo,
    material?.image
  );
  const storageInfoFromDirectUrl = extractMaterialStorageInfoFromUrl(directUrl);

  const materialId = getTrimmedString(material?.id);
  const cachedPhoto = materialId ? getMaterialPhotoCacheEntry(materialId) : undefined;

  const pathCandidates = [
    getTrimmedString(storageInfoFromDirectUrl?.path),
    directUrl,
    getTrimmedString(material?.photo_path),
    getTrimmedString(material?.image_path),
    getTrimmedString(material?.path),
    getTrimmedString(cachedPhoto?.path),
  ].filter(Boolean);

  const bucketCandidates = Array.from(
    new Set(
      [
        getTrimmedString(storageInfoFromDirectUrl?.bucket),
        getTrimmedString(material?.photo_bucket),
        getTrimmedString(material?.image_bucket),
        getTrimmedString(material?.storage_bucket),
        getTrimmedString(material?.bucket),
        getTrimmedString(cachedPhoto?.bucket),
        ...MATERIAL_PHOTO_BUCKETS,
      ].filter(Boolean)
    )
  );

  for (const path of pathCandidates) {
    for (const bucket of bucketCandidates) {
      const resolvedUrl = await createStorageUrl(bucket, path);
      if (resolvedUrl) {
        if (materialId) {
          saveMaterialPhotoCacheEntry(materialId, { url: resolvedUrl, bucket, path });
        }
        return resolvedUrl;
      }
    }
  }

  if (isHttpUrl(directUrl)) {
    if (materialId) {
      saveMaterialPhotoCacheEntry(materialId, {
        url: directUrl,
        bucket: storageInfoFromDirectUrl?.bucket,
        path: storageInfoFromDirectUrl?.path,
      });
    }
    return directUrl;
  }

  if (cachedPhoto?.url) {
    return String(cachedPhoto.url).trim();
  }

  return "";
};

export const enrichMaterialRowsWithPhotoUrls = async <T extends Record<string, unknown>>(
  rows: T[]
) => {
  return Promise.all(
    rows.map(async (row) => {
      const resolvedPhotoUrl = await resolveMaterialPhotoUrl(row);
      if (!resolvedPhotoUrl) return row;

      return {
        ...row,
        photo_url: resolvedPhotoUrl,
        image_url: resolvedPhotoUrl,
        photo: resolvedPhotoUrl,
        image: resolvedPhotoUrl,
      } as T;
    })
  );
};
