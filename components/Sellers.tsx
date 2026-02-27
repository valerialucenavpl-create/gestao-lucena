import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase"; // ajuste se o seu caminho for outro

type Seller = {
  id: number;
  name: string;
  role: string | null;
  commission: number | null;
  monthly_target: number | null;
  active: boolean;
  created_at?: string | null;
};

const inputCls =
  "w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300";
const labelCls = "block text-sm font-medium text-gray-700";

const Sellers: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [editing, setEditing] = useState<Seller | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [commission, setCommission] = useState<string>("0");
  const [monthlyTarget, setMonthlyTarget] = useState<string>("0");
  const [active, setActive] = useState(true);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setRole("");
    setCommission("0");
    setMonthlyTarget("0");
    setActive(true);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sellers")
      .select("id,name,role,commission,monthly_target,active,created_at")
      .order("name");

    if (error) {
      console.error("Erro ao carregar sellers:", error);
      alert(`Erro ao carregar vendedoras: ${error.message}`);
      setSellers([]);
      setLoading(false);
      return;
    }

    setSellers((data as Seller[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totalAtivas = useMemo(
    () => sellers.filter((s) => s.active).length,
    [sellers]
  );

  const startEdit = (s: Seller) => {
    setEditing(s);
    setName(s.name ?? "");
    setRole(s.role ?? "");
    setCommission(String(Number(s.commission ?? 0)));
    setMonthlyTarget(String(Number(s.monthly_target ?? 0)));
    setActive(Boolean(s.active));
  };

  const toggleActive = async (s: Seller) => {
    const next = !s.active;
    const { error } = await supabase
      .from("sellers")
      .update({ active: next })
      .eq("id", s.id);

    if (error) {
      console.error("Erro ao atualizar active:", error);
      alert(`Erro: ${error.message}`);
      return;
    }

    setSellers((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)));
  };

  const removeSeller = async (s: Seller) => {
    if (!window.confirm(`Excluir a vendedora "${s.name}"?`)) return;

    const { error } = await supabase.from("sellers").delete().eq("id", s.id);
    if (error) {
      console.error("Erro ao excluir seller:", error);
      alert(`Erro: ${error.message}`);
      return;
    }

    setSellers((prev) => prev.filter((x) => x.id !== s.id));
    if (editing?.id === s.id) resetForm();
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return alert("Nome é obrigatório.");

    setSaving(true);
    const payload = {
      name: name.trim(),
      role: role.trim() || null,
      commission: Number(commission || 0),
      monthly_target: Number(monthlyTarget || 0),
      active,
    };

    try {
      if (editing?.id) {
        const { error } = await supabase
          .from("sellers")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;

        resetForm();
        await load();
        return;
      }

      const { error } = await supabase.from("sellers").insert(payload);
      if (error) throw error;

      resetForm();
      await load();
    } catch (err: any) {
      console.error("Erro ao salvar seller:", err);
      alert(`Erro ao salvar: ${err.message || "Erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Carregando vendedoras...</p>;

  return (
    <div className="space-y-6">
      {/* TOPO */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vendedoras</h2>
          <p className="text-sm text-gray-600">
            Total: <b>{sellers.length}</b> • Ativas: <b>{totalAtivas}</b>
          </p>
        </div>

        {editing && (
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            Cancelar edição
          </button>
        )}
      </div>

      {/* FORM */}
      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <h3 className="text-lg font-semibold">
          {editing ? "Editar vendedora" : "Nova vendedora"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Maria"
            />
          </div>

          <div>
            <label className={labelCls}>Cargo</label>
            <input
              className={inputCls}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex: Vendedora"
            />
          </div>

          <div>
            <label className={labelCls}>Comissão (%)</label>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="Ex: 5"
            />
          </div>

          <div>
            <label className={labelCls}>Meta mensal (R$)</label>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
              placeholder="Ex: 50000"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-3">
            <input
              id="activeSeller"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="activeSeller" className="text-sm text-gray-700">
              Vendedora ativa
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-6 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Salvando..." : editing ? "Atualizar" : "Salvar"}
          </button>
        </div>
      </div>

      {/* LISTA */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-3">Lista</h3>

        {sellers.length === 0 ? (
          <p className="text-gray-500">Nenhuma vendedora cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-700">
              <thead className="text-xs uppercase bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2 text-right">Comissão</th>
                  <th className="px-3 py-2 text-right">Meta mensal</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">{s.role || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(s.commission || 0).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(s.monthly_target || 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={
                          "inline-flex px-2 py-1 rounded-full text-xs font-semibold " +
                          (s.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600")
                        }
                      >
                        {s.active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="text-primary-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        className="text-gray-700 hover:underline"
                      >
                        {s.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSeller(s)}
                        className="text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
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

export default Sellers;
