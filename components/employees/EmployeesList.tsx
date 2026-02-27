import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

type Props = {
  setActiveView: (view: any) => void;
};

type Employee = {
  id: number;
  name: string | null;
  role: string | null;
  base_salary: number | null;
};

const EmployeesList: React.FC<Props> = ({ setActiveView }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, base_salary")
      .order("id", { ascending: false });

    if (error) {
      console.error(error);
      setEmployees([]);
    } else {
      setEmployees((data as Employee[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Deseja excluir este funcionário?")) return;
    await supabase.from("employees").delete().eq("id", id);
    loadEmployees();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Funcionários</h2>

        <button
          type="button"
          onClick={() => setActiveView("employee-new")}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg"
        >
          + Novo Funcionário
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">Cargo</th>
              <th className="p-2 text-left">Salário Bruto</th>
              <th className="p-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  Nenhum funcionário cadastrado
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{e.name ?? "-"}</td>
                  <td className="p-2">{e.role ?? "-"}</td>
                  <td className="p-2">
                    {Number(e.base_salary || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="p-2 text-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setActiveView(`employee-edit-${e.id}`)}
                      className="text-blue-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EmployeesList;
