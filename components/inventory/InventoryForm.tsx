import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

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
  color_name: string;
  cost_price: number;
}

export default function InventoryForm({ id, onClose }: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [minStock, setMinStock] = useState(0);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [availableColors, setAvailableColors] = useState<CategoryColor[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (categoryId) fetchColors(categoryId);
  }, [categoryId]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("material_categories")
      .select("*")
      .order("name");

    setCategories(data || []);
  };

  const fetchColors = async (catId: number) => {
    const { data } = await supabase
      .from("category_colors")
      .select("*")
      .eq("category_id", catId);

    setAvailableColors(data || []);
  };

  const handleAddVariant = (color: string) => {
    if (!variants.find((v) => v.color_name === color)) {
      setVariants([...variants, { color_name: color, cost_price: 0 }]);
    }
  };

  const handleSave = async () => {
    if (!categoryId) return;

    let inventoryId = id;

    if (!id) {
      const { data } = await supabase
        .from("inventory")
        .insert({
          name,
          unit,
          min_stock: minStock,
          category_id: categoryId,
        })
        .select()
        .single();

      inventoryId = data?.id;
    }

    if (inventoryId) {
      for (const variant of variants) {
        await supabase.from("inventory_variants").insert({
          inventory_id: inventoryId,
          color_name: variant.color_name,
          cost_price: variant.cost_price,
        });
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
      <div className="bg-white p-6 w-[600px] rounded shadow">
        <h3 className="text-xl font-bold mb-4">
          {id ? "Editar Material" : "Novo Material"}
        </h3>

        <div className="space-y-3">
          <input
            className="w-full border p-2"
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <select
            className="w-full border p-2"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="un">Unidade</option>
            <option value="m">Metro Linear</option>
            <option value="m²">Metro Quadrado</option>
            <option value="g">Peso (gramas)</option>
          </select>

          <input
            type="number"
            className="w-full border p-2"
            placeholder="Estoque mínimo"
            value={minStock}
            onChange={(e) => setMinStock(Number(e.target.value))}
          />

          <select
            className="w-full border p-2"
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            <option value="">Selecione Categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {availableColors.length > 0 && (
            <div>
              <h4 className="font-semibold mt-4">Adicionar Cores</h4>
              <div className="flex flex-wrap gap-2">
                {availableColors.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => handleAddVariant(color.color_name)}
                    className="px-3 py-1 border rounded"
                  >
                    {color.color_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {variants.map((v, index) => (
            <div key={index} className="flex gap-2 mt-2">
              <span className="w-40">{v.color_name}</span>
              <input
                type="number"
                placeholder="Custo"
                className="border p-1"
                value={v.cost_price}
                onChange={(e) => {
                  const newVariants = [...variants];
                  newVariants[index].cost_price = Number(e.target.value);
                  setVariants(newVariants);
                }}
              />
            </div>
          ))}

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose}>Cancelar</button>
            <button
              onClick={handleSave}
              className="bg-primary-600 text-white px-4 py-2 rounded"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}