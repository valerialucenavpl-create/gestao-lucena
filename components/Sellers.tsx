import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase"; // ajuste se o seu caminho for outro
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { normalizeText } from "../utils/deliveryEntries";
import { User } from "../types";

type Seller = {
  id: number;
  name: string;
  role: string | null;
  commission: number | null;
  monthly_target: number | null;
  active: boolean;
  created_at?: string | null;
};

type ApprovedQuoteRow = {
  id: string | number;
  quote_number: number | null;
  customer_name: string | null;
  salesperson: string | null;
  total_price: number | null;
  date: string | null;
};

type CommissionRow = {
  id: string;
  osNumber: string;
  customerName: string;
  salesperson: string;
  saleValue: number;
  commissionRate: number;
  commissionValue: number;
};

const inputCls =
  "w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300";
const labelCls = "block text-sm font-medium text-gray-700";

function money(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const nextMonth = new Date(y, m, 1); // mês em JS é 0-indexado, então isso já cai no dia 1 do mês seguinte
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

interface SellersProps {
  currentUser: User;
}

const Sellers: React.FC<SellersProps> = ({ currentUser }) => {
  const isManager = currentUser?.role === "Admin" || currentUser?.role === "Finance";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [editing, setEditing] = useState<Seller | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [commission, setCommission] = useState<string>("0");
  const [monthlyTarget, setMonthlyTarget] = useState<string>(formatMoneyInputBR(0));
  const [active, setActive] = useState(true);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setRole("");
    setCommission("0");
    setMonthlyTarget(formatMoneyInputBR(0));
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
    setMonthlyTarget(formatMoneyInputBR(Number(s.monthly_target ?? 0)));
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
      monthly_target: parseMoneyInputBR(monthlyTarget),
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

  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTA DE COMISSÕES — por mês, com busca por cliente/OS
  // Vendedora (Sales) só vê as próprias vendas; Admin/Financeiro veem todas
  // (ou filtram por uma vendedora específica).
  // ─────────────────────────────────────────────────────────────────────────
  const [commissionMonth, setCommissionMonth] = useState<string>(getCurrentMonthStr());
  const [commissionSearch, setCommissionSearch] = useState("");
  const [commissionSellerFilter, setCommissionSellerFilter] = useState<string>("all");
  const [commissionQuotes, setCommissionQuotes] = useState<ApprovedQuoteRow[]>([]);
  const [commissionLoading, setCommissionLoading] = useState(false);

  useEffect(() => {
    const loadCommissions = async () => {
      setCommissionLoading(true);
      const { start, end } = monthRange(commissionMonth);

      const { data, error } = await supabase
        .from("quotes")
        .select("id,quote_number,customer_name,salesperson,total_price,date")
        .eq("status", "Aprovado")
        .is("deleted_at", null)
        .gte("date", start)
        .lt("date", end);

      if (error) {
        console.error("Erro ao carregar vendas para comissão:", error);
        setCommissionQuotes([]);
        setCommissionLoading(false);
        return;
      }

      setCommissionQuotes((data as ApprovedQuoteRow[]) ?? []);
      setCommissionLoading(false);
    };

    loadCommissions();
  }, [commissionMonth]);

  const commissionRows = useMemo<CommissionRow[]>(() => {
    const rows: CommissionRow[] = commissionQuotes.map((q) => {
      const salesperson = String(q.salesperson || "");
      const matchedSeller = sellers.find(
        (s) => normalizeText(s.name) === normalizeText(salesperson)
      );
      const rate = Number(matchedSeller?.commission ?? 0);
      const saleValue = Number(q.total_price || 0);

      return {
        id: String(q.id),
        osNumber: q.quote_number != null ? String(q.quote_number) : String(q.id).slice(-6).toUpperCase(),
        customerName: q.customer_name || "Cliente não identificado",
        salesperson,
        saleValue,
        commissionRate: rate,
        commissionValue: saleValue * (rate / 100),
      };
    });

    const scoped = isManager
      ? rows
      : rows.filter((r) => normalizeText(r.salesperson) === normalizeText(currentUser?.name || ""));

    const bySeller =
      isManager && commissionSellerFilter !== "all"
        ? scoped.filter((r) => {
            const seller = sellers.find((s) => String(s.id) === commissionSellerFilter);
            return seller ? normalizeText(r.salesperson) === normalizeText(seller.name) : true;
          })
        : scoped;

    const term = normalizeText(commissionSearch);
    const searched = term
      ? bySeller.filter(
          (r) => normalizeText(r.customerName).includes(term) || normalizeText(r.osNumber).includes(term)
        )
      : bySeller;

    return searched.sort((a, b) => b.saleValue - a.saleValue);
  }, [commissionQuotes, sellers, isManager, commissionSellerFilter, commissionSearch, currentUser?.name]);

  const commissionTotal = useMemo(
    () => commissionRows.reduce((sum, r) => sum + r.commissionValue, 0),
    [commissionRows]
  );

  const salesTotal = useMemo(
    () => commissionRows.reduce((sum, r) => sum + r.saleValue, 0),
    [commissionRows]
  );

  const renderCommissionSection = () => (
    <div className="bg-white p-6 rounded-xl shadow space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Consultar Comissões</h3>
          <p className="text-sm text-gray-600 capitalize">{formatMonthLabel(commissionMonth)}</p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className={labelCls}>Mês</label>
            <input
              type="month"
              className={inputCls}
              value={commissionMonth}
              onChange={(e) => setCommissionMonth(e.target.value || getCurrentMonthStr())}
            />
          </div>

          {isManager && (
            <div>
              <label className={labelCls}>Vendedora</label>
              <select
                className={inputCls}
                value={commissionSellerFilter}
                onChange={(e) => setCommissionSellerFilter(e.target.value)}
              >
                <option value="all">Todas as vendedoras</option>
                {sellers.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Buscar cliente ou OS</label>
            <input
              type="text"
              className={inputCls}
              placeholder="Nome do cliente ou nº da OS"
              value={commissionSearch}
              onChange={(e) => setCommissionSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {commissionLoading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : commissionRows.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma venda aprovada encontrada para esse período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-700">
            <thead className="text-xs uppercase bg-gray-50">
              <tr>
                <th className="px-3 py-2">OS #</th>
                <th className="px-3 py-2">Cliente</th>
                {isManager && <th className="px-3 py-2">Vendedora</th>}
                <th className="px-3 py-2 text-right">Valor da Venda</th>
                <th className="px-3 py-2 text-right">Comissão</th>
                <th className="px-3 py-2 text-right">Valor da Comissão</th>
              </tr>
            </thead>
            <tbody>
              {commissionRows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs text-primary-700 font-semibold">#{r.osNumber}</td>
                  <td className="px-3 py-2 font-medium">{r.customerName}</td>
                  {isManager && <td className="px-3 py-2">{r.salesperson || "—"}</td>}
                  <td className="px-3 py-2 text-right">{money(r.saleValue)}</td>
                  <td className="px-3 py-2 text-right">{r.commissionRate.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{money(r.commissionValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={isManager ? 3 : 2} className="px-3 py-2 font-semibold">
                  Total ({commissionRows.length} {commissionRows.length === 1 ? "venda" : "vendas"})
                </td>
                <td className="px-3 py-2 text-right font-semibold">{money(salesTotal)}</td>
                <td />
                <td className="px-3 py-2 text-right font-bold text-green-700">{money(commissionTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) return <p>Carregando vendedoras...</p>;

  if (!isManager) {
    // Vendedora: só a consulta das próprias comissões, sem acesso ao
    // cadastro/edição de outras vendedoras.
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Minhas Comissões</h2>
          <p className="text-sm text-gray-600">Vendas aprovadas em seu nome e a comissão correspondente.</p>
        </div>
        {renderCommissionSection()}
      </div>
    );
  }

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
              type="text"
              inputMode="decimal"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(sanitizeMoneyInputBR(e.target.value))}
              onBlur={() =>
                setMonthlyTarget(formatMoneyInputBR(parseMoneyInputBR(monthlyTarget)))
              }
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

      {renderCommissionSection()}
    </div>
  );
};

export default Sellers;
