import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";
import InventoryForm from "./InventoryForm";

interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  min_stock: number;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const fetchInventory = async () => {
    const { data } = await supabase
      .from("inventory")
      .select("*")
      .order("name");

    setItems(data || []);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleEdit = (id: number) => {
    setEditId(id);
    setOpenForm(true);
  };

  const handleDelete = async (id: number) => {
    await supabase.from("inventory").delete().eq("id", id);
    fetchInventory();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">Matéria Prima</h2>
        <button
          onClick={() => {
            setEditId(null);
            setOpenForm(true);
          }}
          className="bg-primary-600 text-white px-4 py-2 rounded"
        >
          Novo Material
        </button>
      </div>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Nome</th>
            <th className="p-2">Unidade</th>
            <th className="p-2">Estoque Mínimo</th>
            <th className="p-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="p-2">{item.name}</td>
              <td className="p-2">{item.unit}</td>
              <td className="p-2">{item.min_stock}</td>
              <td className="p-2 flex gap-2">
                <button
                  onClick={() => handleEdit(item.id)}
                  className="text-blue-600"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-red-600"
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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