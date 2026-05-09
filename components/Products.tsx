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
  });

  const PRODUCTS_BAD_COLS_KEY = "products_bad_columns_v2";

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
        "referenceWidthMm",
        "reference_width_mm",
        "referenceHeightMm",
        "reference_height_mm",
        "widthIncrement",
        "heightIncrement",
      ].includes(column)
    );

    if (criticalColumns.length === 0) return;

    alert(
      `O Supabase salvou o produto, mas ignorou estes campos porque a tabela products ainda não tem essas colunas: ${criticalColumns.join(", ")}. Por isso foto, composição e medidas podem sumir ao recarregar.`
    );
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">
          Catálogo de Produtos
        </h3>

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
            {products.map(product => (
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
                    onClick={() => handleDeleteProduct(product.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
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
    </div>
  );
};
// build-2026-02-11

export default Products;
