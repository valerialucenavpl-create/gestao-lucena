import React, { useState, ChangeEvent, useMemo } from 'react';
import {
  Product,
  ProductCompositionItem,
  InventoryItem,
  User,
  CalculationRule,
  VariableExpense
} from '../types';
import { Icon } from './icons/Icon';
import ProductModal from "./ProductModal";
import ProductReportModal from "./ProductReportModal";
import { supabase } from "../services/supabase";

interface ProductsProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  rawMaterials: InventoryItem[];
  variableExpenses: VariableExpense[];
  currentUser: User;
}

const Products: React.FC<ProductsProps> = ({
  products,
  setProducts,
  rawMaterials,
  variableExpenses,
  currentUser
}) => {
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

  const normalizeMarginByColor = (value: unknown): Record<string, number> | undefined => {
    let parsed: unknown = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const result: Record<string, number> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, val]) => {
      const num = Number(val);
      if (key && Number.isFinite(num)) result[key] = num;
    });
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const normalizeProductRow = (row: Record<string, unknown>): Product => ({
    ...(row as unknown as Product),
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    category: String(row?.category || (row as any)?.productCategory || (row as any)?.productcategory || row?.product_category || ""),
    productCategory: String(row?.productCategory ?? (row as any)?.productcategory ?? row?.product_category ?? ""),
    productType: String(row?.productType ?? (row as any)?.producttype ?? row?.product_type ?? ""),
    productSubCategory1: String(
      row?.productSubCategory1 ?? (row as any)?.productsubcategory1 ?? row?.product_sub_category_1 ?? ""
    ),
    productSubCategory2: String(
      row?.productSubCategory2 ?? (row as any)?.productsubcategory2 ?? row?.product_sub_category_2 ?? ""
    ),
    image: String(row?.image ?? (row as any)?.photo_url ?? ""),
    composition: normalizeComposition(row?.composition),
    desiredProfitMargin: Number(
      row?.desiredProfitMargin ?? (row as any)?.desiredprofitmargin ?? row?.desired_profit_margin ?? 0
    ),
    marginByColor: normalizeMarginByColor(
      (row as any)?.marginByColor ?? (row as any)?.marginbycolor ?? (row as any)?.margin_by_color
    ),
    minProfitValue: Number(
      row?.minProfitValue ?? (row as any)?.minprofitvalue ?? row?.min_profit_value ?? 0
    ),
    fixedSalePrice: Number(
      row?.fixedSalePrice ?? (row as any)?.fixedsaleprice ?? row?.fixed_sale_price ?? 0
    ),
    fixedSalePriceByColor: normalizeMarginByColor(
      (row as any)?.fixedSalePriceByColor ?? (row as any)?.fixedsalepricebycolor ?? (row as any)?.fixed_sale_price_by_color
    ),
    pricePerSqmByColor: normalizeMarginByColor(
      (row as any)?.pricePerSqmByColor ?? (row as any)?.pricepersqmbycolor ?? (row as any)?.price_per_sqm_by_color
    ),
    laborCost: Number(row?.laborCost ?? (row as any)?.laborcost ?? row?.labor_cost ?? 0),
    productionHours: Number(row?.productionHours ?? (row as any)?.productionhours ?? row?.production_hours ?? 0),
    assemblyHours: Number(row?.assemblyHours ?? (row as any)?.assemblyhours ?? row?.assembly_hours ?? 0),
    hourlyRate: Number(row?.hourlyRate ?? (row as any)?.hourlyrate ?? row?.hourly_rate ?? 0),
    fixedCostRate: Number(row?.fixedCostRate ?? (row as any)?.fixedcostrate ?? row?.fixed_cost_rate ?? 0),
    quantityReference: Number(row?.quantityReference ?? (row as any)?.quantityreference ?? row?.quantity_reference ?? 1),
    selectedCategoryColor: String(
      row?.selectedCategoryColor ?? (row as any)?.selectedcategorycolor ?? row?.selected_category_color ?? ""
    ),
    referenceWidthMm: Number(row?.referenceWidthMm ?? (row as any)?.referencewidthmm ?? row?.reference_width_mm ?? 0),
    referenceHeightMm: Number(row?.referenceHeightMm ?? (row as any)?.referenceheightmm ?? row?.reference_height_mm ?? 0),
    widthIncrement: Number(row?.widthIncrement ?? (row as any)?.widthincrement ?? row?.width_increment ?? 0),
    heightIncrement: Number(row?.heightIncrement ?? (row as any)?.heightincrement ?? row?.height_increment ?? 0),
    professionalCount: Number(row?.professionalCount ?? (row as any)?.professionalcount ?? 0),
    professionalHours: Number(row?.professionalHours ?? (row as any)?.professionalhours ?? 0),
    professionalRate: Number(row?.professionalRate ?? (row as any)?.professionalrate ?? 0),
    helperCount: Number(row?.helperCount ?? (row as any)?.helpercount ?? 0),
    helperHours: Number(row?.helperHours ?? (row as any)?.helperhours ?? 0),
    helperRate: Number(row?.helperRate ?? (row as any)?.helperrate ?? 0),
    instProfCount: Number(row?.instProfCount ?? (row as any)?.instprofcount ?? 0),
    instProfInstHours: Number(row?.instProfInstHours ?? (row as any)?.instprofinsthours ?? 0),
    instProfRate: Number(row?.instProfRate ?? (row as any)?.instprofrate ?? 0),
    instHelpCount: Number(row?.instHelpCount ?? (row as any)?.insthelpcount ?? 0),
    instHelpInstHours: Number(row?.instHelpInstHours ?? (row as any)?.insthelpinsthours ?? 0),
    instHelpRate: Number(row?.instHelpRate ?? (row as any)?.insthelprate ?? 0),
    laborSector: String(row?.laborSector ?? (row as any)?.laborsector ?? ""),
  } as Product);

  const PRODUCTS_BAD_COLS_KEY = "products_bad_columns_v4";

  const getCachedBadColumns = (): Set<string> => {
    try {
      const raw = sessionStorage.getItem(PRODUCTS_BAD_COLS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  };

  const cacheBadColumns = (cols: Set<string>) => {
    try { sessionStorage.setItem(PRODUCTS_BAD_COLS_KEY, JSON.stringify(Array.from(cols))); } catch {}
  };

  const saveProductWithFallback = async (
    mode: "insert" | "update",
    payload: Record<string, unknown>,
    productId?: string
  ) => {
    const removedColumns = new Set<string>(getCachedBadColumns());
    let safePayload = { ...payload };
    removedColumns.forEach((col) => delete safePayload[col]);

    for (let attempt = 0; attempt < 25; attempt++) {
      const result =
        mode === "update"
          ? await supabase
              .from("products")
              .update(safePayload)
              .eq("id", productId as any)
              .select()
              .single()
          : await supabase.from("products").insert(safePayload).select().single();

      if (!result.error) {
        cacheBadColumns(removedColumns);
        return {
          ok: true as const,
          data: (result as any).data,
          removedColumns: Array.from(removedColumns),
        };
      }

      const message = String(result.error.message || "");
      const unknownColumnMatch =
        message.match(/Could not find the '([^']+)' column/i) ||
        message.match(/column "([^"]+)" does not exist/i);

      if (unknownColumnMatch?.[1]) {
        const invalidColumn = String(unknownColumnMatch[1]);
        removedColumns.add(invalidColumn);
        delete safePayload[invalidColumn];
        continue;
      }

      return {
        ok: false as const,
        error: result.error,
        removedColumns: Array.from(removedColumns),
      };
    }

    return {
      ok: false as const,
      error: { message: "Não foi possível salvar o produto após várias tentativas." },
      removedColumns: Array.from(removedColumns),
    };
  };

  const showProductPersistenceWarning = (removedColumns: string[]) => {
    const criticalColumns = removedColumns.filter((column) =>
      [
        "composition",
        "image",
        "productCategory",
        "product_category",
        "productType",
        "product_type",
        "productSubCategory1",
        "product_sub_category_1",
        "productSubCategory2",
        "product_sub_category_2",
        "desiredProfitMargin",
        "desired_profit_margin",
        "marginByColor",
        "margin_by_color",
        "minProfitValue",
        "min_profit_value",
        "fixedSalePrice",
        "fixed_sale_price",
        "fixedSalePriceByColor",
        "fixed_sale_price_by_color",
        "pricePerSqmByColor",
        "price_per_sqm_by_color",
        "referenceWidthMm",
        "reference_width_mm",
        "referenceHeightMm",
        "reference_height_mm",
        "widthIncrement",
        "heightIncrement",
        "professionalCount",
        "professionalHours",
        "professionalRate",
        "helperCount",
        "helperHours",
        "helperRate",
        "instProfCount",
        "instProfInstHours",
        "instProfRate",
        "instHelpCount",
        "instHelpInstHours",
        "instHelpRate",
        "laborSector",
      ].includes(column)
    );

    if (criticalColumns.length === 0) return;

    alert(
      `O Supabase salvou o produto, mas ignorou estes campos porque a tabela products ainda não tem essas colunas: ${criticalColumns.join(", ")}. Por isso foto, composição e medidas podem sumir ao recarregar.`
    );
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleOpenModal = (product: Product | null = null) => {
    setEditingProduct(product ? JSON.parse(JSON.stringify(product)) : null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setIsModalOpen(false);
  };

  const handleSaveProduct = async (productData: Omit<Product, 'id'>) => {
    const payload: Record<string, unknown> = {
      name: productData.name,
      category: productData.category || "",
      productCategory: productData.productCategory || "",
      productType: productData.productType || "",
      productSubCategory1: productData.productSubCategory1 || "",
      productSubCategory2: productData.productSubCategory2 || "",
      composition: productData.composition || [],
      image: productData.image || "",
      desiredProfitMargin: Number(productData.desiredProfitMargin || 0),
      marginByColor: productData.marginByColor && Object.keys(productData.marginByColor).length > 0
        ? productData.marginByColor
        : null,
      minProfitValue: Number(productData.minProfitValue || 0),
      fixedSalePrice: Number(productData.fixedSalePrice || 0),
      fixedSalePriceByColor: productData.fixedSalePriceByColor && Object.keys(productData.fixedSalePriceByColor).length > 0
        ? productData.fixedSalePriceByColor
        : null,
      pricePerSqmByColor: productData.pricePerSqmByColor && Object.keys(productData.pricePerSqmByColor).length > 0
        ? productData.pricePerSqmByColor
        : null,
      laborCost: Number(productData.laborCost || 0),
      productionHours: Number(productData.productionHours || 0),
      assemblyHours: Number(productData.assemblyHours || 0),
      hourlyRate: Number(productData.hourlyRate || 0),
      professionalCount: Number((productData as any).professionalCount || 0),
      professionalHours: Number((productData as any).professionalHours || 0),
      professionalRate: Number((productData as any).professionalRate || 0),
      helperCount: Number((productData as any).helperCount || 0),
      helperHours: Number((productData as any).helperHours || 0),
      helperRate: Number((productData as any).helperRate || 0),
      instProfCount: Number((productData as any).instProfCount || 0),
      instProfInstHours: Number((productData as any).instProfInstHours || 0),
      instProfRate: Number((productData as any).instProfRate || 0),
      instHelpCount: Number((productData as any).instHelpCount || 0),
      instHelpInstHours: Number((productData as any).instHelpInstHours || 0),
      instHelpRate: Number((productData as any).instHelpRate || 0),
      laborSector: String((productData as any).laborSector || ""),
      fixedCostRate: Number(productData.fixedCostRate || 0),
      quantityReference: Number(productData.quantityReference || 1),
      selectedCategoryColor: productData.selectedCategoryColor || "",
      referenceWidthMm: Number(productData.referenceWidthMm || 0),
      referenceHeightMm: Number(productData.referenceHeightMm || 0),
      widthIncrement: Number((productData as any).widthIncrement || 0),
      heightIncrement: Number((productData as any).heightIncrement || 0),
    };

    if (editingProduct) {
      // Atualização otimista: fecha modal e atualiza estado imediatamente
      const optimisticProduct = normalizeProductRow({
        id: editingProduct.id,
        ...productData,
      } as Record<string, unknown>);
      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? optimisticProduct : p))
      );
      handleCloseModal();

      // Salva em segundo plano
      const updateResult = await saveProductWithFallback(
        "update",
        payload,
        editingProduct.id
      );

      if (!updateResult.ok) {
        alert(
          `Erro ao atualizar produto: ${(updateResult.error as any)?.message || "Erro desconhecido"}`
        );
        return;
      }

      showProductPersistenceWarning(updateResult.removedColumns || []);

      // Substitui pelo dado real do servidor se disponível
      if (updateResult.data) {
        const serverProduct = normalizeProductRow(
          updateResult.data as Record<string, unknown>
        );
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? serverProduct : p))
        );
      }
    } else {
      // Novo produto: fecha modal imediatamente com ID temporário
      const tempId = `temp-${Date.now()}`;
      const optimisticProduct = normalizeProductRow({
        id: tempId,
        ...productData,
      } as Record<string, unknown>);
      setProducts((prev) => [optimisticProduct, ...prev]);
      handleCloseModal();

      // Salva em segundo plano
      const insertResult = await saveProductWithFallback("insert", payload);

      if (!insertResult.ok) {
        // Remove produto temporário em caso de erro
        setProducts((prev) => prev.filter((p) => p.id !== tempId));
        alert(
          `Erro ao salvar produto: ${(insertResult.error as any)?.message || "Erro desconhecido"}`
        );
        return;
      }

      showProductPersistenceWarning(insertResult.removedColumns || []);

      // Substitui ID temporário pelo ID real do servidor
      const newProduct = normalizeProductRow(
        ((insertResult.data as Record<string, unknown> | null) || { id: tempId, ...productData }) as Record<string, unknown>
      );
      setProducts((prev) =>
        prev.map((p) => (p.id === tempId ? newProduct : p))
      );
    }
  };

  const handleDuplicateProduct = async (product: Product) => {
    const payload: Record<string, unknown> = {
      name: `${product.name} (Cópia)`,
      category: product.category || "",
      productCategory: product.productCategory || "",
      productType: product.productType || "",
      productSubCategory1: product.productSubCategory1 || "",
      productSubCategory2: product.productSubCategory2 || "",
      composition: product.composition || [],
      image: product.image || "",
      desiredProfitMargin: Number(product.desiredProfitMargin || 0),
      minProfitValue: Number((product as any).minProfitValue || 0),
      fixedSalePrice: Number((product as any).fixedSalePrice || 0),
      laborCost: Number(product.laborCost || 0),
      productionHours: Number(product.productionHours || 0),
      assemblyHours: Number(product.assemblyHours || 0),
      hourlyRate: Number(product.hourlyRate || 0),
      professionalCount: Number((product as any).professionalCount || 0),
      professionalHours: Number((product as any).professionalHours || 0),
      professionalRate: Number((product as any).professionalRate || 0),
      helperCount: Number((product as any).helperCount || 0),
      helperHours: Number((product as any).helperHours || 0),
      helperRate: Number((product as any).helperRate || 0),
      instProfCount: Number((product as any).instProfCount || 0),
      instProfInstHours: Number((product as any).instProfInstHours || 0),
      instProfRate: Number((product as any).instProfRate || 0),
      instHelpCount: Number((product as any).instHelpCount || 0),
      instHelpInstHours: Number((product as any).instHelpInstHours || 0),
      instHelpRate: Number((product as any).instHelpRate || 0),
      laborSector: String((product as any).laborSector || ""),
      fixedCostRate: Number(product.fixedCostRate || 0),
      quantityReference: Number(product.quantityReference || 1),
      selectedCategoryColor: product.selectedCategoryColor || "",
      referenceWidthMm: Number(product.referenceWidthMm || 0),
      referenceHeightMm: Number(product.referenceHeightMm || 0),
      widthIncrement: Number((product as any).widthIncrement || 0),
      heightIncrement: Number((product as any).heightIncrement || 0),
    };

    const insertResult = await saveProductWithFallback("insert", payload);

    if (!insertResult.ok) {
      alert(
        `Erro ao duplicar produto: ${(insertResult.error as any)?.message || "Erro desconhecido"}`
      );
      return;
    }

    showProductPersistenceWarning(insertResult.removedColumns || []);

    // Garante um ID real do banco (bigint), mesmo que o insert não tenha
    // retornado a linha (ex.: RLS impedindo o select de retorno).
    let row = insertResult.data as Record<string, unknown> | null;
    if (!row || row.id === undefined || row.id === null) {
      const { data: latest } = await supabase
        .from("products")
        .select("*")
        .order("id", { ascending: false })
        .limit(1)
        .single();
      row = (latest as Record<string, unknown>) || null;
    }

    const newProduct = normalizeProductRow(row || { id: `temp-${Date.now()}`, ...payload });
    setProducts((prev) => [newProduct, ...prev]);
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este produto?')) {
      const { data: deletedRows, error } = await supabase
        .from("products")
        .delete()
        .eq("id", id as any)
        .select("id");

      if (error) {
        alert(`Erro ao excluir produto: ${error.message}`);
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        alert("Não foi possível excluir este produto no Supabase.");
        return;
      }

      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" })
      ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sortedProducts;
    return sortedProducts.filter((product) =>
      (product.name || "").toLowerCase().includes(term) ||
      (product.category || "").toLowerCase().includes(term)
    );
  }, [sortedProducts, searchTerm]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">
          Catálogo de Produtos
        </h3>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-50"
          >
            <Icon className="w-4 h-4">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </Icon>
            Relatório
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
          >
            <Icon className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </Icon>
            Adicionar Produto
          </button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
          <Icon className="w-4 h-4">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </Icon>
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome ou categoria..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Foto</th>
              <th className="px-6 py-3">Nome do Produto</th>
              <th className="px-6 py-3">Categoria</th>
              <th className="px-6 py-3">Componentes</th>
              <th className="px-6 py-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map(product => (
              <tr
                key={product.id}
                className="bg-white border-b hover:bg-gray-50"
              >
                <td className="px-6 py-4">
                  <div className="h-10 w-10 rounded bg-white flex items-center justify-center overflow-hidden border border-gray-200 p-0.5">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Icon className="text-gray-400 w-5 h-5">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </Icon>
                    )}
                  </div>
                </td>

                <td className="px-6 py-4 font-medium text-gray-900">
                  {product.name}
                </td>

                <td className="px-6 py-4">
                  {product.category}
                </td>

                <td className="px-6 py-4">
                 {Array.isArray((product as any).composition) ? (product as any).composition.length : 0}
                </td>

                <td className="px-6 py-4 text-center space-x-2">
                  <button
                    onClick={() => handleOpenModal(product)}
                    className="text-primary-600 hover:text-primary-800"
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => handleDuplicateProduct(product)}
                    className="text-blue-500 hover:text-blue-700"
                    title="Duplicar produto"
                  >
                    📋
                  </button>

                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}

            {filteredProducts.length === 0 && searchTerm.trim() !== '' && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-gray-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <ProductModal
          product={editingProduct}
          onClose={handleCloseModal}
          onSave={handleSaveProduct}
          rawMaterials={rawMaterials}
          variableExpenses={variableExpenses}
          currentUser={currentUser}
        />
      )}

      {isReportOpen && (
        <ProductReportModal
          products={products}
          rawMaterials={rawMaterials}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
};
// build-2026-02-11

export default Products;
