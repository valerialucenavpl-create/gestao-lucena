import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { Icon } from "./icons/Icon";
import { Montagem, MontagemInsumo, User } from "../types";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../utils/money";

type Props = {
  montagens: Montagem[];
  setMontagens: React.Dispatch<React.SetStateAction<Montagem[]>>;
  currentUser: User;
};

const money = (v: number) => `R$ ${formatMoneyInputBR(v)}`;

const emptyInsumo = (): MontagemInsumo & { valueInput: string } => ({
  id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  value: 0,
  valueInput: formatMoneyInputBR(0),
});

const normalizeRow = (row: any): Montagem => ({
  id: String(row.id),
  name: row.name || "",
  price: Number(row.price || 0),
  insumos: Array.isArray(row.insumos) ? row.insumos : [],
});

const Montagens: React.FC<Props> = ({ montagens, setMontagens, currentUser }) => {
  const isAdmin = currentUser?.role === "Admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceInput, setPriceInput] = useState(formatMoneyInputBR(0));
  const [price, setPrice] = useState(0);
  const [insumos, setInsumos] = useState<(MontagemInsumo & { valueInput: string })[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("montagens").select("*").order("name", { ascending: true });
    if (error) {
      console.error(error);
    } else {
      setMontagens((data || []).map(normalizeRow));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrice(0);
    setPriceInput(formatMoneyInputBR(0));
    setInsumos([]);
  };

  const handleEdit = (m: Montagem) => {
    setEditingId(m.id);
    setName(m.name);
    setPrice(m.price);
    setPriceInput(formatMoneyInputBR(m.price));
    setInsumos(
      (m.insumos || []).map((i) => ({ ...i, valueInput: formatMoneyInputBR(Number(i.value) || 0) }))
    );
  };

  const addInsumo = () => setInsumos((prev) => [...prev, emptyInsumo()]);
  const removeInsumo = (id: string) => setInsumos((prev) => prev.filter((i) => i.id !== id));
  const updateInsumoName = (id: string, value: string) =>
    setInsumos((prev) => prev.map((i) => (i.id === id ? { ...i, name: value } : i)));
  const updateInsumoValue = (id: string, raw: string) => {
    const sanitized = sanitizeMoneyInputBR(raw);
    setInsumos((prev) =>
      prev.map((i) => (i.id === id ? { ...i, valueInput: sanitized, value: parseMoneyInputBR(sanitized) } : i))
    );
  };
  const blurInsumoValue = (id: string) =>
    setInsumos((prev) => prev.map((i) => (i.id === id ? { ...i, valueInput: formatMoneyInputBR(i.value) } : i)));

  const insumosTotal = insumos.reduce((s, i) => s + (Number(i.value) || 0), 0);

  const handleSave = async () => {
    if (!name.trim()) return alert("Informe o nome da montagem.");
    setSaving(true);

    const payload = {
      name: name.trim(),
      price,
      insumos: insumos.map(({ id, name: n, value }) => ({ id, name: n, value })),
    };

    const query = editingId
      ? supabase.from("montagens").update(payload).eq("id", editingId).select().single()
      : supabase.from("montagens").insert([payload]).select().single();

    const { data, error } = await query;
    setSaving(false);

    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }

    const saved = normalizeRow(data);
    setMontagens((prev) =>
      editingId ? prev.map((m) => (m.id === editingId ? saved : m)) : [...prev, saved]
    );
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir esta montagem?")) return;
    const { error } = await supabase.from("montagens").delete().eq("id", id);
    if (error) {
      alert("Não foi possível excluir: " + error.message);
      return;
    }
    setMontagens((prev) => prev.filter((m) => m.id !== id));
    if (editingId === id) resetForm();
  };

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Só o Admin gerencia o catálogo de montagens.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {editingId ? "Editar montagem" : "Nova montagem"}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          O valor fixo é o que soma no preço da peça no orçamento (o cliente não vê o nome da
          montagem). Os insumos são o custo interno — só o Admin vê, no detalhamento financeiro.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Montagem Pia Padrão"
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Valor fixo (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => {
                const sanitized = sanitizeMoneyInputBR(e.target.value);
                setPriceInput(sanitized);
                setPrice(parseMoneyInputBR(sanitized));
              }}
              onBlur={() => setPriceInput(formatMoneyInputBR(price))}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Insumos (custo interno)
            </label>
            <button
              type="button"
              onClick={addInsumo}
              className="text-xs font-semibold text-primary-700 hover:underline"
            >
              + adicionar insumo
            </button>
          </div>

          {insumos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum insumo adicionado.</p>
          ) : (
            <div className="space-y-2">
              {insumos.map((i) => (
                <div key={i.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={i.name}
                    onChange={(e) => updateInsumoName(i.id, e.target.value)}
                    placeholder="Ex: Argamassa"
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={i.valueInput}
                    onChange={(e) => updateInsumoValue(i.id, e.target.value)}
                    onBlur={() => blurInsumoValue(i.id)}
                    className="w-28 px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md text-sm text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeInsumo(i.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Remover"
                  >
                    <Icon className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </Icon>
                  </button>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400 pt-1">
                <span>Custo total dos insumos:</span>
                <span>{money(insumosTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar montagem"}
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

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Montagens cadastradas
        </h3>
        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : montagens.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma montagem cadastrada ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {montagens.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{m.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {money(m.price)}
                    {(m.insumos || []).length > 0 && ` · ${m.insumos!.length} insumo${m.insumos!.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(m)}
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
                    onClick={() => handleDelete(m.id)}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Montagens;
