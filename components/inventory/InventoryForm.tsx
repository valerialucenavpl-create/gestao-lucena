import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "../../services/supabase";
import {
  MATERIAL_PHOTO_BUCKETS,
  extractMaterialStorageInfoFromUrl,
  getMaterialPhotoCacheEntry,
  resolveMaterialPhotoUrl,
  saveMaterialPhotoCacheEntry,
} from "../../utils/materialPhoto";
import {
  getMaterialPurchaseLengthCacheEntry,
  saveMaterialPurchaseLengthCacheEntry,
} from "../../utils/materialPurchaseLength";

interface Props {
  id: number | null;
  onClose: () => void;
}

interface Category {
  id: number;
  name: string;
}

interface CategoryColor {
  id: number;
  color_name: string;
}

interface Variant {
  id?: number;
  color_name: string;
  cost_price: number;
  cost_input?: string;
}
type VariantRow = Record<string, unknown>;
const UNIT_LABELS: Record<string, string> = {
  un: "unidades",
  m: "metros lineares",
  "m²": "metros quadrados",
  g: "gramas",
};

const formatCurrencyInput = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sanitizeCurrencyInput = (value: string) => {
  const onlyNumbersAndComma = value.replace(/[^\d,]/g, "");
  const commaIndex = onlyNumbersAndComma.indexOf(",");
  if (commaIndex < 0) return onlyNumbersAndComma;

  const integerPart = onlyNumbersAndComma.slice(0, commaIndex + 1);
  const decimalPart = onlyNumbersAndComma.slice(commaIndex + 1).replace(/,/g, "");
  return `${integerPart}${decimalPart}`;
};

const parseCurrencyInput = (value: string) => {
  const cleaned = sanitizeCurrencyInput(value);
  if (!cleaned) return 0;
  const asNumber = Number(cleaned.replace(",", "."));
  return Number.isFinite(asNumber) ? asNumber : 0;
};

export default function InventoryForm({ id, onClose }: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [minStock, setMinStock] = useState(0);
  const [purchaseLengthMeters, setPurchaseLengthMeters] = useState(0);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [availableColors, setAvailableColors] = useState<CategoryColor[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoStorageMeta, setPhotoStorageMeta] = useState<{
    bucket: string;
    path: string;
  }>({ bucket: "", path: "" });

  useEffect(() => {
    fetchCategories();
  }, []);

   useEffect(() => {
      if (id && categories.length > 0) {
      loadInventoryForEdit(id);
    }
  }, [id, categories]);

  useEffect(() => {
    if (categoryId) {
      fetchColors(categoryId);
      return;
    }

    setAvailableColors([]);
    if (!id) {
      setVariants([]);
    }
  }, [categoryId, id]);

 useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

const stockHelperText = useMemo(() => {
    return `Informe o estoque em ${UNIT_LABELS[unit] ?? "unidades"}.`;
  }, [unit]);

  const getInventoryValue = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      if (key in row && row[key] !== null && row[key] !== undefined && row[key] !== "") {
        return row[key];
      }
    }
    return undefined;
  };

  const getCategoryNameById = (catId: number | null) => {
    if (!catId) return "";
    return categories.find((cat) => cat.id === catId)?.name ?? "";
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase.from("material_categories").select("*").order("name");
    if (error) {
      console.error(error);
      return;
    }
    setCategories(data || []);
  };

  const fetchColors = async (catId: number) => {
const { data, error } = await supabase.from("category_colors").select("*").eq("category_id", catId);
    if (error) {
      console.error(error);
      return;
    }
    setAvailableColors(data || []);
  };

  const loadInventoryForEdit = async (inventoryId: number) => {
    setLoading(true);

    const { data: inventoryData, error: inventoryError } = await supabase
      .from("inventory")
   
.select("*")
 .eq("id", inventoryId)
      .single();
  if (inventoryError) {
      console.error(inventoryError);
      alert("Não foi possível carregar o material para edição.");
      setLoading(false);
      return;
    }

    const row = (inventoryData || {}) as Record<string, unknown>;
    setName(String(getInventoryValue(row, ["name"]) || ""));
    setUnit(String(getInventoryValue(row, ["unit"]) || "un"));

    const stockRaw = getInventoryValue(row, [
      "min_stock",
      "stock",
      "initial_stock",
      "stock_min",
      "quantity",
    ]);
    setMinStock(Number(stockRaw) || 0);

    const purchaseLengthRaw = getInventoryValue(row, [
      "purchase_length_meters",
      "purchase_length",
      "buy_length_meters",
      "length_meters",
      "standard_size",
      "standardSize",
    ]);
    setPurchaseLengthMeters(
      Number(purchaseLengthRaw) || getMaterialPurchaseLengthCacheEntry(inventoryId) || 0
    );

    const inventoryCategoryId = Number(
      getInventoryValue(row, ["category_id", "material_category_id", "categoryId"])
    ) || null;
    const inventoryCategoryName = String(
      getInventoryValue(row, ["usage_category", "category_name", "category"]) || ""
    )
      .trim()
      .toUpperCase();

    if (inventoryCategoryId) {
      setCategoryId(inventoryCategoryId);
    } else if (inventoryCategoryName) {
      const matchedCategory = categories.find(
        (cat) => cat.name.trim().toUpperCase() === inventoryCategoryName
      );
      setCategoryId(matchedCategory?.id ?? null);
    } else {
      setCategoryId(null);
    }

    const cachedPhoto = getMaterialPhotoCacheEntry(inventoryId);

    const existingPhotoUrl = String(
      getInventoryValue(row, [
        "photo_url",
        "image_url",
        "photo",
        "image",
        "photo_path",
        "image_path",
      ]) || ""
    ).trim();

    let resolvedPhotoUrl = existingPhotoUrl;
    if (!resolvedPhotoUrl) {
      resolvedPhotoUrl =
        (await resolveMaterialPhotoUrl({ ...row, id: inventoryId })) ||
        String(cachedPhoto?.url || "").trim();
    }

    const resolvedStorageInfo = extractMaterialStorageInfoFromUrl(resolvedPhotoUrl);
    const initialPhotoBucket = String(
      getInventoryValue(row, ["photo_bucket", "image_bucket", "storage_bucket", "bucket"]) ||
        cachedPhoto?.bucket ||
        resolvedStorageInfo?.bucket ||
        ""
    ).trim();
    const initialPhotoPath = String(
      getInventoryValue(row, ["photo_path", "image_path", "path"]) ||
        cachedPhoto?.path ||
        resolvedStorageInfo?.path ||
        ""
    ).trim();

    setPhotoFile(null);
    setPhotoUrl(resolvedPhotoUrl);
    setPhotoPreview(resolvedPhotoUrl);
    setPhotoStorageMeta({
      bucket: initialPhotoBucket,
      path: initialPhotoPath,
    });
    if (resolvedPhotoUrl) {
      saveMaterialPhotoCacheEntry(inventoryId, {
        url: resolvedPhotoUrl,
        bucket: initialPhotoBucket,
        path: initialPhotoPath,
      });
    }

    const { data: variantsData, error: variantsError } = await supabase
      .from("inventory_variants")
      .select("*")
      .eq("inventory_id", inventoryId);

    if (variantsError) {
      console.error(variantsError);
    } else {
      setVariants(normalizeVariantRows((variantsData as VariantRow[]) || []));
    }

    setLoading(false);
  };
  const handleAddVariant = (color: string) => {
    if (!variants.find((v) => v.color_name === color)) {
      setVariants([
        ...variants,
        { color_name: color, cost_price: 0, cost_input: formatCurrencyInput(0) },
      ]);
    }
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isAllowedType = ["image/jpeg", "image/png"].includes(file.type);
    if (!isAllowedType) {
      alert("Envie apenas imagem JPG/JPEG ou PNG.");
      e.target.value = "";
      return;
    }

    if (photoPreview && photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoFile(file);
    setPhotoUrl("");
    setPhotoPreview(URL.createObjectURL(file));
  };

  const getVariantValue = (row: VariantRow, keys: string[]) => {
    for (const key of keys) {
      if (key in row && row[key] !== null && row[key] !== undefined) {
        return row[key];
      }
    }
    return undefined;
  };

  const normalizeVariantRows = (rows: VariantRow[]): Variant[] => {
    return rows
      .map((row) => {
        const color = String(
          getVariantValue(row, ["color_name", "name", "variant_name", "color"]) || ""
        ).trim();

        const costRaw = getVariantValue(row, ["cost_price", "cost", "price", "value"]);
        const cost = Number(costRaw || 0);

        return {
          id: Number((row as any)?.id) || undefined,
          color_name: color,
          cost_price: Number.isFinite(cost) ? cost : 0,
          cost_input: formatCurrencyInput(Number.isFinite(cost) ? cost : 0),
        };
      })
      .filter((variant) => variant.color_name);
  };

  const saveVariantsWithFallback = async (inventoryId: number, currentVariants: Variant[]) => {
    const validVariants = currentVariants.filter((v) => String(v.color_name || "").trim());
    if (validVariants.length === 0) return { ok: true as const };

    const strategies: Array<{ colorColumn: string; costColumn?: string }> = [
      { colorColumn: "color_name", costColumn: "cost_price" },
      { colorColumn: "name", costColumn: "cost_price" },
      { colorColumn: "variant_name", costColumn: "cost_price" },
      { colorColumn: "color", costColumn: "cost_price" },
      { colorColumn: "color_name", costColumn: "cost" },
      { colorColumn: "name", costColumn: "cost" },
      { colorColumn: "variant_name", costColumn: "cost" },
      { colorColumn: "color", costColumn: "cost" },
      { colorColumn: "color_name" },
      { colorColumn: "name" },
      { colorColumn: "variant_name" },
      { colorColumn: "color" },
    ];

    let lastError: any = null;

    for (const strategy of strategies) {
      const payload = validVariants.map((variant) => {
        const row: Record<string, unknown> = {
          inventory_id: inventoryId,
          [strategy.colorColumn]: variant.color_name,
        };

        if (strategy.costColumn) {
          row[strategy.costColumn] = Number(variant.cost_price) || 0;
        }

        return row;
      });

      const { error } = await supabase.from("inventory_variants").insert(payload);
      if (!error) {
        return { ok: true as const };
      }

      lastError = error;
      const message = String(error.message || "").toLowerCase();

      if (!message.includes("column") && !message.includes("schema cache")) {
        break;
      }
    }

    return { ok: false as const, error: lastError };
  };

  const uploadMaterialPhoto = async (file: File) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || "public";
    const path = `${userId}/inventory/${Date.now()}-${safeName}`;

    let lastError: any = null;
    const attempts: string[] = [];

    for (const bucket of MATERIAL_PHOTO_BUCKETS) {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        lastError = uploadError;
        attempts.push(`${bucket}: ${uploadError.message || "falha no upload"}`);
        continue;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = String(data?.publicUrl || "").trim();
      if (publicUrl) return { ok: true as const, url: publicUrl, bucket, path };

      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      const signedUrl = String(signedData?.signedUrl || "").trim();
      if (!signedError && signedUrl) return { ok: true as const, url: signedUrl, bucket, path };

      attempts.push(`${bucket}: URL pública não gerada`);
    }

    const lowerMessage = String((lastError as any)?.message || "").toLowerCase();
    if (lowerMessage.includes("bucket not found")) {
      return {
        ok: false as const,
        error: {
          message:
            `Bucket de armazenamento não encontrado. Configure VITE_SUPABASE_MATERIALS_BUCKET no .env ou use um bucket existente (${MATERIAL_PHOTO_BUCKETS.join(", ")}).`,
        },
      };
    }

    return {
      ok: false as const,
      error: {
        message: attempts.length
          ? `Falha no upload. Tentativas: ${attempts.join(" | ")}`
          : "Falha no upload.",
      },
    };
  };

  const saveInventoryWithFallback = async (
    mode: "insert" | "update",
    payload: Record<string, unknown>,
    inventoryId?: number | null
  ) => {
    let safePayload = { ...payload };
    const removedColumns = new Set<string>();

    for (let attempt = 0; attempt < 40; attempt++) {
      const result =
        mode === "update"
          ? await supabase
              .from("inventory")
              .update(safePayload)
              .eq("id", inventoryId as any)
              .select()
              .single()
          : await supabase.from("inventory").insert(safePayload).select().single();

      if (!result.error) {
        return {
          ok: true as const,
          data: (result as any).data,
          removedColumns: Array.from(removedColumns),
        };
      }

      const message = result.error.message || "";
      const unknownColumnMatch =
        message.match(/Could not find the '([^']+)' column/i) ||
        message.match(/column "([^"]+)" does not exist/i);
      if (unknownColumnMatch?.[1]) {
        const invalidColumn = String(unknownColumnMatch[1]);
        removedColumns.add(invalidColumn);
        delete safePayload[invalidColumn];
        continue;
      }

      return { ok: false as const, error: result.error, removedColumns: Array.from(removedColumns) };
    }

    return {
      ok: false as const,
      error: { message: "Não foi possível salvar o material após várias tentativas." },
      removedColumns: Array.from(removedColumns),
    };
  };

  const handleSave = async () => {
    if (!categoryId) {
      alert("Selecione a categoria.");
      return;
    }

    setLoading(true);

    let inventoryId = id;
    const usageCategory = getCategoryNameById(categoryId);
    let finalPhotoUrl = photoUrl;
    let uploadedPhotoMeta: { bucket: string; path: string } | null = null;
    const effectivePhotoMeta = {
      bucket: uploadedPhotoMeta?.bucket || photoStorageMeta.bucket || "",
      path: uploadedPhotoMeta?.path || photoStorageMeta.path || "",
    };

    if (photoFile) {
      const uploadResult = await uploadMaterialPhoto(photoFile);
      if (!uploadResult.ok) {
        setLoading(false);
        alert(
          `Erro ao enviar foto: ${(uploadResult.error as any)?.message || "Falha no upload"}`
        );
        return;
      }
      finalPhotoUrl = uploadResult.url;
      uploadedPhotoMeta = { bucket: uploadResult.bucket, path: uploadResult.path };
      effectivePhotoMeta.bucket = uploadResult.bucket;
      effectivePhotoMeta.path = uploadResult.path;
      setPhotoUrl(finalPhotoUrl);
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoPreview(finalPhotoUrl);
    }

    const basePayload = {
      name,
      unit,
      min_stock: minStock,
      stock: minStock,
      initial_stock: minStock,
      quantity: minStock,
      purchase_length_meters: purchaseLengthMeters || null,
      purchase_length: purchaseLengthMeters || null,
      buy_length_meters: purchaseLengthMeters || null,
      length_meters: purchaseLengthMeters || null,
      standard_size: purchaseLengthMeters || null,
      category_id: categoryId,
      material_category_id: categoryId,
      usage_category: usageCategory,
      category: usageCategory,
      category_name: usageCategory,
      photo_url: finalPhotoUrl || null,
      image_url: finalPhotoUrl || null,
      photo: finalPhotoUrl || null,
      image: finalPhotoUrl || null,
      photo_bucket: effectivePhotoMeta.bucket || null,
      image_bucket: effectivePhotoMeta.bucket || null,
      storage_bucket: effectivePhotoMeta.bucket || null,
      photo_path: effectivePhotoMeta.path || null,
      image_path: effectivePhotoMeta.path || null,
      path: effectivePhotoMeta.path || null,
    } as Record<string, unknown>;

    const showPersistenceWarning = (removedColumns: string[]) => {
      const criticalColumns = removedColumns.filter((column) =>
        [
          "purchase_length_meters",
          "purchase_length",
          "buy_length_meters",
          "length_meters",
          "standard_size",
          "standardSize",
          "photo_url",
          "image_url",
          "photo",
          "image",
          "photo_bucket",
          "image_bucket",
          "storage_bucket",
          "photo_path",
          "image_path",
          "path",
        ].includes(column)
      );

      if (criticalColumns.length === 0) return;

      alert(
        `O Supabase salvou o material, mas ignorou estes campos porque a tabela inventory ainda não tem essas colunas: ${criticalColumns.join(", ")}. Enquanto isso, metragem e foto podem sumir depois de recarregar a página.`
      );
    };

    if (id) {
      const updateResult = await saveInventoryWithFallback("update", basePayload, id);

      if (!updateResult.ok) {
        setLoading(false);
        alert(`Erro ao atualizar material: ${(updateResult.error as any)?.message || "Erro desconhecido"}`);
        return;
      }
      showPersistenceWarning(updateResult.removedColumns || []);
    } else {
      const insertResult = await saveInventoryWithFallback("insert", basePayload);

      if (!insertResult.ok) {
        setLoading(false);
        alert(`Erro ao salvar material: ${(insertResult.error as any)?.message || "Erro desconhecido"}`);
        return;
      }

      inventoryId = (insertResult.data as any)?.id;
      showPersistenceWarning(insertResult.removedColumns || []);
    }

    if (inventoryId && finalPhotoUrl) {
      saveMaterialPhotoCacheEntry(inventoryId, {
        url: finalPhotoUrl,
        bucket: effectivePhotoMeta.bucket || undefined,
        path: effectivePhotoMeta.path || undefined,
      });
    }
    if (inventoryId) {
      saveMaterialPurchaseLengthCacheEntry(inventoryId, purchaseLengthMeters);
    }
if (inventoryId) {
    const { error: deleteVariantsError } = await supabase
      .from("inventory_variants")
      .delete()
      .eq("inventory_id", inventoryId);

      if (deleteVariantsError) {
        setLoading(false);
        alert(`Erro ao limpar variações antigas: ${deleteVariantsError.message}`);
        return;
      }

      if (variants.length > 0) {
        const variantsResult = await saveVariantsWithFallback(Number(inventoryId), variants);
        if (!variantsResult.ok) {
          setLoading(false);
          alert(
            `Erro ao salvar variações: ${(variantsResult.error as any)?.message || "Erro desconhecido"}`
          );
          return;
        }
      }
    }

    setLoading(false);
    onClose();
  };

  const canAddCategoryColors = Boolean(categoryId);
  const shouldShowVariants = canAddCategoryColors || variants.length > 0;

  return (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-8 py-6 text-white">
          <h3 className="text-3xl font-bold">{id ? "Editar Material" : "Novo Material"}</h3>
          <p className="mt-1 text-sm text-blue-100">
            Cadastre os dados do material, selecione a categoria e configure as variações de cor.
          </p>
        </div>

        <div className="grid max-h-[75vh] grid-cols-1 gap-8 overflow-y-auto p-8 lg:grid-cols-2">
          <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-primary-700">Dados do material</h4>
<div>
  <label className="mb-1 block text-sm font-semibold text-slate-700">Nome do material</label>
              <input
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="Ex.: PC 027"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Unidade de medida</label>
              <select
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                <option value="un">Unidade (un)</option>
                <option value="m">Metro Linear (m)</option>
                <option value="m²">Metro Quadrado (m²)</option>
                <option value="g">Gramas (g)</option>
              </select>
              </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Estoque inicial (opcional)</label>
              <input
                type="number"
                  className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="0"
                value={minStock}
                onChange={(e) => setMinStock(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-500">{stockHelperText}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Metragem de compra (em metros lineares)
              </label>
              <input
                type="number"
                min={0}
                step="0.001"
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="Ex.: 6"
                value={purchaseLengthMeters || ""}
                onChange={(e) => setPurchaseLengthMeters(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-slate-500">
                O sistema divide o valor do material por essa metragem para encontrar o custo proporcional do perfil.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Categoria</label>
              <select
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              >
                <option value="">Selecione a categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Foto do material (JPG/PNG)</label>
              <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-4 transition hover:bg-blue-50">
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <span className="text-sm font-medium text-primary-700">
                  {photoFile || photoUrl ? "Trocar imagem" : "Selecionar imagem"}
                </span>
              </label>

              {photoPreview && (
                <div className="mt-3">
                  <img
                    src={photoPreview}
                    alt="Prévia do material"
                    className="h-44 w-full rounded-lg border object-cover"
                  />
                </div>
              )}
            </div>
              </section>

            <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-primary-700">Variações de cores</h4>

            {!shouldShowVariants ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Selecione uma categoria para habilitar as cores.
              </div>
            ) : (
              <>
                {canAddCategoryColors ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Adicionar cores da categoria
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableColors.map((color) => (
                        <button
                          key={color.id}
                          type="button"
                          onClick={() => handleAddVariant(color.color_name)}
                          className="rounded-full border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-blue-50"
                        >
                          + {color.color_name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    Categoria não encontrada neste registro. Você ainda pode editar os custos já
                    cadastrados abaixo.
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Custos por cor</label>
                  {variants.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                      Clique em uma cor acima para adicioná-la à lista de custos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {variants.map((variant, index) => (
                        <div key={`${variant.color_name}-${index}`} className="grid grid-cols-12 items-center gap-2">
                          <span className="col-span-4 text-sm font-semibold text-slate-700">{variant.color_name}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Custo"
                            className="col-span-8 rounded-lg border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                            value={variant.cost_input ?? formatCurrencyInput(variant.cost_price)}
                            onChange={(e) => {
                              const newVariants = [...variants];
                              const rawValue = sanitizeCurrencyInput(e.target.value);
                              newVariants[index].cost_input = rawValue;
                              newVariants[index].cost_price = parseCurrencyInput(rawValue);
                              setVariants(newVariants);
                            }}
                            onBlur={() => {
                              const newVariants = [...variants];
                              const numericValue = Number(newVariants[index]?.cost_price || 0);
                              newVariants[index].cost_input = formatCurrencyInput(numericValue);
                              setVariants(newVariants);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
