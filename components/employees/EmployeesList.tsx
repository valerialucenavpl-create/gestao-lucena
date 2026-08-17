import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";
import { Icon } from "../icons/Icon";

type Props = {
  setActiveView: (view: any) => void;
};

type Employee = {
  id: number;
  name: string | null;
  role: string | null;
  base_salary: number | null;
};

const initials = (name: string | null) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const money = (v: number | null) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const EmployeesList: React.FC<Props> = ({ setActiveView }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, base_salary")
      .order("name", { ascending: true });

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = !term
      ? employees
      : employees.filter(
          (e) => (e.name || "").toLowerCase().includes(term) || (e.role || "").toLowerCase().includes(term)
        );
    // Ordena aqui também (não só no banco) — nomes com espaço a mais no
    // início/fim ou variações de acentuação bagunçavam o ORDER BY do
    // Supabase; localeCompare em pt-BR garante A-Z de verdade na tela.
    return [...base].sort((a, b) =>
      (a.name || "").trim().localeCompare((b.name || "").trim(), "pt-BR", { sensitivity: "base" })
    );
  }, [employees, search]);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Funcionários</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {employees.length} cadastrado{employees.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveView("employee-new")}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-colors"
        >
          <Icon className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Novo Funcionário
        </button>
      </div>

      <div className="relative max-w-md">
        <Icon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </Icon>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou cargo..."
          className="w-full rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white pl-9 pr-4 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Cargo
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Salário Bruto
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">
                    {employees.length === 0 ? "Nenhum funcionário cadastrado" : "Nenhum resultado para essa busca"}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(e.name)}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{e.name ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                        {e.role ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white tabular-nums">
                      {money(e.base_salary)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveView(`employee-details-${e.id}`)}
                          title="Detalhar"
                          className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/50 transition-colors"
                        >
                          <Icon className="w-4 h-4">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </Icon>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView(`employee-edit-${e.id}`)}
                          title="Editar"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                        >
                          <Icon className="w-4 h-4">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </Icon>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          title="Excluir"
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        >
                          <Icon className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </Icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmployeesList;
