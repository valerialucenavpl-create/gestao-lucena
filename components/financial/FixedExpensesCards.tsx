import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";

type FixedExpense = {
  id: number;
  name: string;
  value: number;
  payment_date: string;
};

const FixedExpensesCards: React.FC = () => {
  const [items, setItems] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  // 👉 total automático dos funcionários (CUSTO TOTAL)
  const [employeesTotal, setEmployeesTotal] = useState(0);

  const load = async () => {
    setLoading(true);

    // 🔹 despesas fixas manuais
    const { data: fixedData } = await supabase
      .from("fixed_expenses")
      .select("*")
      .order("id", { ascending: false });

    setItems((fixedData as FixedExpense[]) ?? []);

    // 🔹 soma do custo total dos funcionários
    const { data: employees } = await supabase
      .from("employees")
      .select("total_monthly_cost");

    const totalEmployees = (employees ?? []).reduce(
      (sum, e) => sum + Number(e.total_monthly_cost || 0),
      0
    );

    setEmployeesTotal(totalEmployees);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!name || !value || !paymentDate) return;

    const payload = {
      name,
      value: Number(value.replace(",", ".")),
      payment_date: paymentDate,
    };

    if (editing) {
      await supabase
        .from("fixed_expenses")
        .update(payload)
        .eq("id", editing.id);
    } else {
      await supabase.from("fixed_expenses").insert([payload]);
    }

    reset();
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Excluir despesa fixa?")) return;
    await supabase.from("fixed_expenses").delete().eq("id", id);
    load();
  };

  const edit = (it: FixedExpense) => {
    setEditing(it);
    setName(it.name);
    setValue(String(it.value).replace(".", ","));
    setPaymentDate(it.payment_date);
  };

  const reset = () => {
    setEditing(null);
    setName("");
    setValue("");
    setPaymentDate("");
  };

  // 🔢 total das despesas fixas manuais
  const totalFixedManual = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.value || 0), 0),
    [items]
  );

  // 🔥 TOTAL GERAL DAS DESPESAS FIXAS
  const totalFixedGeneral = useMemo(
    () => totalFixedManual + employeesTotal,
    [totalFixedManual, employeesTotal]
  );

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      <h3 className="text-lg font-semibold">Despesas Fixas</h3>

      {/* FORM */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className="p-2 border rounded"
          placeholder="Descrição"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="p-2 border rounded"
          placeholder="Valor (R$)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <input
          type="date"
          className="p-2 border rounded"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />

        <button
          onClick={save}
          className="px-4 py-2 rounded bg-blue-600 text-white"
        >
          {editing ? "Salvar" : "Adicionar"}
        </button>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 🔥 TOTAL DESPESAS FIXAS */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <p className="font-semibold text-blue-800">
            Total de Despesas Fixas
          </p>

          <p className="text-xl font-bold text-blue-900">
            {totalFixedGeneral.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>

          <p className="text-xs text-blue-700">
            Funcionários + despesas fixas
          </p>
        </div>

        {/* 🔹 FUNCIONÁRIOS */}
        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="font-semibold">Funcionários</p>

          <p className="text-sm text-gray-600">
            {employeesTotal.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>

          <p className="text-xs text-gray-500">
            Valor automático (custo total)
          </p>
        </div>

        {/* 🔹 OUTRAS DESPESAS */}
        {items.map((it) => (
          <div key={it.id} className="p-4 rounded-lg bg-gray-50 border">
            <p className="font-semibold">{it.name}</p>

            <p className="text-sm text-gray-600">
              {it.value.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>

            <p className="text-xs text-gray-500">
              Pagamento:{" "}
              {new Date(it.payment_date).toLocaleDateString("pt-BR")}
            </p>

            <div className="flex gap-3 mt-3 text-sm">
              <button
                onClick={() => edit(it)}
                className="text-blue-600 hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() => remove(it.id)}
                className="text-red-600 hover:underline"
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

export default FixedExpensesCards;
