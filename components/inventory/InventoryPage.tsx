import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";
import InventoryForm from "./InventoryForm";

interface InventoryItem {
  id: number | string;
  name: string;
  unit: string;
  min_stock: number;
  usage_category?: string;
  category?: string;
  category_name?: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const fetchInventory = async () => {
   setLoading(true);
    const { data, error } = await supabase.from("inventory").select("*").order("name");

    if (error) {
      console.error(error);
      alert(`Erro ao buscar materiais: ${error.message}`);
      setLoading(false);
      return;
    }

    setItems(data || []);
     setLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, []);
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      const cat = (item.usage_category || item.category || item.category_name || "").trim().toUpperCase();
      if (cat) seen.add(cat);
    }
    return Array.from(seen).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        !term ||
        String(item.name || "").toLowerCase().includes(term) ||
        String(item.unit || "").toLowerCase().includes(term);
      const cat = (item.usage_category || item.category || item.category_name || "").trim().toUpperCase();
      const matchCategory = !selectedCategory || cat === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [items, search, selectedCategory]);

  const handleEdit = (id: number | string) => {
    setEditId(Number(id));
    setOpenForm(true);
  };

  const handleDuplicate = async (id: number | string) => {
    // Busca o item completo com variações
    const { data: original, error: fetchError } = await supabase
      .from("inventory")
      .select("*, inventory_variants(*)")
      .eq("id", id as any)
      .single();

    if (fetchError || !original) {
      alert("Erro ao buscar material para duplicar.");
      return;
    }

    // Cria cópia do item principal (sem id, sem created_at)
    const { id: _id, created_at: _ca, inventory_variants, ...rest } = original as any;
    const copyPayload = { ...rest, name: `${rest.name} - Cópia` };

    const { data: inserted, error: insertError } = await supabase
      .from("inventory")
      .insert(copyPayload)
      .select()
      .single();

    if (insertError || !inserted) {
      alert(`Erro ao duplicar material: ${insertError?.message}`);
      return;
    }

    // Copia as variações vinculando ao novo ID
    if (Array.isArray(inventory_variants) && inventory_variants.length > 0) {
      const variantsCopy = inventory_variants.map(({ id: _vid, inventory_id: _iid, ...v }: any) => ({
        ...v,
        inventory_id: inserted.id,
      }));
      await supabase.from("inventory_variants").insert(variantsCopy);
    }

    fetchInventory();
  };

 const handleDelete = async (id: number | string) => {
    const confirmDelete = window.confirm("Tem certeza que deseja excluir este material?");
    if (!confirmDelete) return;

    const previousItems = items;
    setItems((prev) => prev.filter((item) => String(item.id) !== String(id)));

    const { error: variantsError } = await supabase
      .from("inventory_variants")
      .delete()
      .eq("inventory_id", id as any);

    if (variantsError) {
      console.error(variantsError);
      setItems(previousItems);
      alert(`Erro ao excluir variações do material: ${variantsError.message}`);
      return;
    }

    const { data: deletedRows, error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", id as any)
      .select("id");

    if (error) {
      console.error(error);
      setItems(previousItems);
      alert(`Erro ao excluir material: ${error.message}`);
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      setItems(previousItems);
      alert("Não foi possível excluir este material (sem permissão ou registro não encontrado).");
      return;
    }

    fetchInventory();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Matéria Prima</h2>
            <p className="text-sm text-gray-500">Gerencie materiais, estoque mínimo e ações rápidas.</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar material..."
              className="h-11 px-3 border border-gray-300 rounded-lg bg-white text-gray-900"
            />

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-11 px-3 border border-gray-300 rounded-lg bg-white text-gray-900"
            >
              <option value="">Todas as categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setOpenForm(true);
              }}
              className="h-11 px-5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700"
            >
              Novo Material
            </button>
          </div>
        </div>
      </div>

   <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-700 text-sm uppercase tracking-wide">
                <th className="p-3 font-semibold">Nome</th>
                <th className="p-3 font-semibold">Unidade</th>
                <th className="p-3 font-semibold">Estoque Mínimo</th>
                <th className="p-3 font-semibold">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => (
                <tr key={String(item.id)} className="border-t hover:bg-blue-50/30 transition-colors">
                  <td className="p-3 font-medium text-gray-800">{item.name}</td>
                  <td className="p-3 text-gray-700">{item.unit}</td>
                  <td className="p-3 text-gray-700">{item.min_stock}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(item.id)}
                        className="px-3 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicate(item.id)}
                        className="px-3 py-1.5 rounded-md border border-green-200 text-green-700 hover:bg-green-50 text-sm font-medium"
                      >
                        Duplicar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500">
                    Nenhum material encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openForm && (
        <InventoryForm
          id={editId}
          onClose={() => {
            setOpenForm(false);
            fetchInventory();
          }}
        />
      )}
    </div>
  );
}
