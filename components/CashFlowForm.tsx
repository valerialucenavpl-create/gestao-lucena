// src/components/CashFlowForm.tsx
import React, { useEffect, useMemo, useState } from "react";
import { CashFlowEntry } from "../types";
import {
  getCashFlow,
  createCashFlowEntry,
  deleteCashFlowEntry,
} from "../services/cashFlowServices";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500";

type Props = {
  cashFlow: CashFlowEntry[];
  setCashFlow: React.Dispatch<React.SetStateAction<CashFlowEntry[]>>;
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const ymdToTime = (ymd?: string) => {
  if (!ymd) return NaN;
  // garante comparação correta (meia-noite local)
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CashFlowForm: React.FC<Props> = ({ cashFlow, setCashFlow }) => {
  // -------- Form (Novo lançamento)
  const [type, setType] = useState<CashFlowEntry["type"]>("Entrada");
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // -------- Filtros / Busca
  const [filterType, setFilterType] = useState<"Todos" | "Entrada" | "Saída">(
    "Todos"
  );
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>(""); // YYYY-MM-DD

  // carrega do banco ao abrir a tela
  useEffect(() => {
    const load = async () => {
      const res = await getCashFlow();
      if (res.ok) setCashFlow(res.data ?? []);
      else console.error("Erro ao carregar caixa:", res.error);
    };
    load();
  }, [setCashFlow]);

  // -------- Helpers de cálculo
  const filtered = useMemo(() => {
    const list = Array.isArray(cashFlow) ? cashFlow : [];
    const q = search.trim().toLowerCase();

    const fromT = fromDate ? ymdToTime(fromDate) : NaN;
    const toT = toDate ? ymdToTime(toDate) : NaN;

    return list.filter((e) => {
      // tipo
      if (filterType !== "Todos" && e.type !== filterType) return false;

      // período
      const t = ymdToTime(e.date);
      if (fromDate && !Number.isNaN(fromT) && !(t >= fromT)) return false;
      if (toDate && !Number.isNaN(toT) && !(t <= toT)) return false;

      // busca
      if (!q) return true;
      const hay = `${e.description ?? ""} ${e.category ?? ""} ${
        e.subcategory ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [cashFlow, filterType, search, fromDate, toDate]);

  const totals = useMemo(() => {
    let entradas = 0;
    let saidas = 0;

    for (const e of filtered) {
      const val = Number(e.amount || 0);
      if (e.type === "Saída") saidas += val;
      else entradas += val;
    }

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
    };
  }, [filtered]);

  // Ordena para mostrar mais recente primeiro
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = ymdToTime(a.date);
      const tb = ymdToTime(b.date);
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [filtered]);

  // -------- Actions
  const handleSave = async () => {
    if (saving) return;

    if (!date) return alert("Data é obrigatória.");
    if (!amount || Number(amount) <= 0) return alert("Valor precisa ser maior que 0.");

    setSaving(true);
    try {
      const payload: Omit<CashFlowEntry, "id"> = {
        type,
        amount: Number(amount),
        category: category.trim(),
        subcategory: subcategory.trim(),
        description: description.trim(),
        date, // YYYY-MM-DD
      };

      const res = await createCashFlowEntry(payload);

      if (!res.ok) {
        console.error("Erro Supabase (caixa):", res.error);
        alert(
          `Erro ao salvar no Supabase: ${(res.error as any)?.message ?? "ver console"}`
        );
        return;
      }

      setCashFlow((prev) => [res.data as CashFlowEntry, ...(prev ?? [])]);

      // limpa form
      setAmount(0);
      setCategory("");
      setSubcategory("");
      setDescription("");
      setDate(todayISO());
      setType("Entrada");

      alert("Lançamento salvo ✅");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este lançamento?")) return;

    setDeletingId(id);
    try {
      const res = await deleteCashFlowEntry(id);
      if (!res.ok) {
        console.error("Erro ao excluir caixa:", res.error);
        alert(`Erro ao excluir: ${(res.error as any)?.message ?? "ver console"}`);
        return;
      }
      setCashFlow((prev) => (prev ?? []).filter((x) => x.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const clearFilters = () => {
    setFilterType("Todos");
    setSearch("");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Caixa</h2>
          <p className="text-gray-600 text-sm">
            Lançamento manual + histórico + filtro por período
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "+ Salvar lançamento"}
        </button>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block font-medium">Tipo</label>
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="Entrada">Entrada</option>
            <option value="Saída">Saída</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Valor</label>
          <input
            type="number"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={0}
            step="0.01"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium">Categoria</label>
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex: Vendas, Aluguel, Insumos..."
          />
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium">Subcategoria</label>
          <input
            className={inputClass}
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium">Descrição</label>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Pagamento do cliente / Compra de material..."
          />
        </div>

        <div>
          <label className="block font-medium">Data</label>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Histórico / filtros */}
      <hr className="my-6" />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Histórico</h3>
          <p className="text-gray-500 text-sm">
            Mostrando <b>{sorted.length}</b> lançamento(s) no filtro atual
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <select
            className={inputClass}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="Todos">Todos</option>
            <option value="Entrada">Entradas</option>
            <option value="Saída">Saídas</option>
          </select>

          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição/categoria/subcategoria"
          />

          <div className="flex gap-2">
            <div className="w-full">
              <label className="block text-xs text-gray-500 mb-1">
                Início
              </label>
              <input
                type="date"
                className={inputClass}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="w-full">
              <label className="block text-xs text-gray-500 mb-1">
                Fim
              </label>
              <input
                type="date"
                className={inputClass}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 self-end"
              type="button"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">ENTRADAS (PERÍODO)</p>
          <p className="text-2xl font-bold text-green-600">{money(totals.entradas)}</p>
        </div>
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">SAÍDAS (PERÍODO)</p>
          <p className="text-2xl font-bold text-red-600">{money(totals.saidas)}</p>
        </div>
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">SALDO (PERÍODO)</p>
          <p className="text-2xl font-bold">{money(totals.saldo)}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Subcategoria</th>
              <th className="p-3 text-left">Descrição</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  Nenhum lançamento ainda.
                </td>
              </tr>
            ) : (
              sorted.map((x) => (
                <tr key={x.id} className="border-t">
                  <td className="p-3">{formatBR(x.date)}</td>
                  <td className="p-3">{x.type}</td>
                  <td className="p-3">{x.category || "-"}</td>
                  <td className="p-3">{x.subcategory || "-"}</td>
                  <td className="p-3">{x.description || "-"}</td>
                  <td className="p-3 text-right">
                    {money(Number(x.amount || 0))}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDelete(x.id)}
                      disabled={deletingId === x.id}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-60"
                    >
                      {deletingId === x.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CashFlowForm;
