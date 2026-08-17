import React, { useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import { Icon } from "./icons/Icon";
import { FreightConfig, FreightRate, User, VariableExpense } from "../types";
import { normalizeText } from "../utils/deliveryEntries";

type Props = {
  freightRates: FreightRate[];
  setFreightRates: React.Dispatch<React.SetStateAction<FreightRate[]>>;
  freightConfig: FreightConfig;
  currentUser: User;
  variableExpenses: VariableExpense[];
};

const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normalizeRow = (row: any): FreightRate => ({
  id: String(row.id),
  city: row.city || "",
  km: Number(row.km || 0),
});

const Freight: React.FC<Props> = ({ freightRates, setFreightRates, freightConfig, currentUser, variableExpenses }) => {
  const isAdmin = currentUser?.role === "Admin";

  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [kmInput, setKmInput] = useState("");

  const km = Number(kmInput) || 0;

  // DVV = comissão + imposto — mesma taxa usada no resto do sistema
  // (Produtos, Montagens). O detalhamento fica só na tela de Configurações
  // (Financeiro); aqui mostra direto o valor final.
  const dvvRate = useMemo(() => {
    const commissionRate =
      variableExpenses.find((e) => normalizeText(e.name).includes(normalizeText("comissão")))?.value || 0;
    const taxRate =
      variableExpenses.find(
        (e) => normalizeText(e.name).includes(normalizeText("imposto")) || normalizeText(e.name).includes(normalizeText("simples"))
      )?.value || 0;
    return commissionRate + taxRate;
  }, [variableExpenses]);

  const calcValue = (distanceKm: number, kmRate: number) => {
    const dvvFrac = dvvRate / 100;
    const base = distanceKm * kmRate * (1 + freightConfig.markup / 100);
    return dvvFrac >= 1 ? base : base / (1 - dvvFrac);
  };

  const previewCar = calcValue(km, freightConfig.kmRateCar);
  const previewMoto = calcValue(km, freightConfig.kmRateMoto);

  const resetForm = () => {
    setEditingId(null);
    setCity("");
    setKmInput("");
  };

  const handleEdit = (r: FreightRate) => {
    setEditingId(r.id);
    setCity(r.city);
    setKmInput(String(r.km));
  };

  const handleSave = async () => {
    if (!city.trim()) return alert("Informe o nome do local.");
    setSaving(true);

    const payload = { city: city.trim(), km };

    const query = editingId
      ? supabase.from("freight_rates").update(payload).eq("id", editingId).select().single()
      : supabase.from("freight_rates").insert([payload]).select().single();

    const { data, error } = await query;
    setSaving(false);

    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }

    const saved = normalizeRow(data);
    setFreightRates((prev) =>
      editingId ? prev.map((r) => (r.id === editingId ? saved : r)) : [...prev, saved]
    );
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir esse local?")) return;
    const { error } = await supabase.from("freight_rates").delete().eq("id", id);
    if (error) {
      alert("Não foi possível excluir: " + error.message);
      return;
    }
    setFreightRates((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
  };

  const sortedRates = useMemo(
    () => [...freightRates].sort((a, b) => a.city.localeCompare(b.city, "pt-BR", { sensitivity: "base" })),
    [freightRates]
  );

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {editingId ? "Editar local" : "Novo local"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome do local</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Lago da Pedra"
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">KM</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={kmInput}
                onChange={(e) => setKmInput(e.target.value)}
                placeholder="0"
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800/60 px-4 py-3">
              <span className="block text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase">Carro</span>
              <span className="text-lg font-bold text-blue-900 dark:text-blue-200">{money(previewCar)}</span>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800/60 px-4 py-3">
              <span className="block text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase">Moto</span>
              <span className="text-lg font-bold text-purple-900 dark:text-purple-200">{money(previewMoto)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Locais cadastrados ({sortedRates.length})
        </h3>
        {sortedRates.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum local cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Local</th>
                  <th className="px-3 py-2 text-right">KM</th>
                  <th className="px-3 py-2 text-right">Carro</th>
                  <th className="px-3 py-2 text-right">Moto</th>
                  {isAdmin && <th className="px-3 py-2 text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedRates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white">{r.city}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{r.km}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white">
                      {money(calcValue(r.km, freightConfig.kmRateCar))}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white">
                      {money(calcValue(r.km, freightConfig.kmRateMoto))}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(r)}
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
                            onClick={() => handleDelete(r.id)}
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Freight;
