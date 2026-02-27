import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

type VariableExpense = {
  id: number;
  name: string;
  type: "Percentual" | "Fixo";
  value: number;
};

const VariableExpensesCards: React.FC = () => {
  const [items, setItems] = useState<VariableExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* =====================
     LOAD
  ===================== */
  const loadExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("variable_expenses")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error(error);
      setError("Erro ao carregar despesas variáveis");
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  /* =====================
     EDITAR
  ===================== */
  const handleEdit = async (item: VariableExpense) => {
    const newName = prompt("Nome da despesa:", item.name);
    if (!newName) return;

    const newValue = prompt(
      `Novo valor (${item.type === "Percentual" ? "%" : "R$"}):`,
      String(item.value)
    );
    if (!newValue) return;

    const valueNum = Number(newValue.replace(",", "."));
    if (isNaN(valueNum)) {
      alert("Valor inválido");
      return;
    }

    const { error } = await supabase
      .from("variable_expenses")
      .update({
        name: newName,
        value: valueNum,
      })
      .eq("id", item.id);

    if (error) {
      console.error(error);
      alert("Erro ao editar despesa");
      return;
    }

    loadExpenses();
  };

  /* =====================
     EXCLUIR
  ===================== */
  const handleDelete = async (id: number) => {
    if (!window.confirm("Deseja excluir esta despesa?")) return;

    const { error } = await supabase
      .from("variable_expenses")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao excluir despesa");
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  /* =====================
     UI
  ===================== */
  if (loading) return <p>Carregando...</p>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white p-4 rounded-lg shadow border space-y-2"
          >
            <div>
              <h3 className="font-semibold text-lg">{item.name}</h3>
              <p className="text-sm text-gray-500">{item.type}</p>
            </div>

            <div className="text-xl font-bold">
              {item.type === "Percentual"
                ? `${item.value}%`
                : item.value.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => handleEdit(item)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Editar
              </button>

              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VariableExpensesCards;
