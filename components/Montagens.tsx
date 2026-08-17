import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import { Icon } from "./icons/Icon";
import { InventoryItem, Montagem, MontagemInsumo, MontagemLaborLine, User, VariableExpense } from "../types";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../utils/money";
import { normalizeText } from "../utils/deliveryEntries";

type Props = {
  montagens: Montagem[];
  setMontagens: React.Dispatch<React.SetStateAction<Montagem[]>>;
  currentUser: User;
  rawMaterials: InventoryItem[];
  variableExpenses: VariableExpense[];
};

const money = (v: number) => `R$ ${formatMoneyInputBR(v)}`;

// Mesma lógica usada em NewQuote.tsx pra ler custo de matéria-prima a
// partir das variantes/cores cadastradas (aqui só pega a 1ª variante —
// insumo de montagem tipo cantoneira/argamassa normalmente não tem cor).
const getMaterialVariants = (material?: InventoryItem | null): any[] => {
  if (!material) return [];
  const variants = (material as any)?.colorVariants ?? (material as any)?.color_variants ?? [];
  return Array.isArray(variants) ? variants : [];
};
const getVariantCost = (variant?: any) => Number(variant?.cost ?? variant?.cost_price ?? 0);

type InsumoRowState = {
  id: string;
  materialId: string;
  name: string;
  quantity: number;
  quantityInput: string;
  unitValue: number;
  unitValueInput: string;
};

type LaborRowState = {
  id: string;
  role: string;
  count: number;
  hours: number;
  hoursInput: string;
  hourlyRate: number;
  hourlyRateInput: string;
};

const emptyInsumoRow = (): InsumoRowState => ({
  id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  materialId: "",
  name: "",
  quantity: 1,
  quantityInput: "1",
  unitValue: 0,
  unitValueInput: formatMoneyInputBR(0),
});

const emptyLaborRow = (): LaborRowState => ({
  id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role: "",
  count: 1,
  hours: 1,
  hoursInput: "1",
  hourlyRate: 0,
  hourlyRateInput: formatMoneyInputBR(0),
});

const normalizeRow = (row: any): Montagem => ({
  id: String(row.id),
  name: row.name || "",
  price: Number(row.price || 0),
  insumos: Array.isArray(row.insumos) ? row.insumos : [],
  labor: Array.isArray(row.labor) ? row.labor : [],
});

const Montagens: React.FC<Props> = ({ montagens, setMontagens, currentUser, rawMaterials, variableExpenses }) => {
  const isAdmin = currentUser?.role === "Admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceInput, setPriceInput] = useState(formatMoneyInputBR(0));
  const [price, setPrice] = useState(0);
  const [insumoRows, setInsumoRows] = useState<InsumoRowState[]>([]);
  const [laborRows, setLaborRows] = useState<LaborRowState[]>([]);

  // Taxa de custo fixo real (mesma fórmula usada no cadastro de Produtos):
  // (despesas fixas + custo mensal de quem não é produção) / meta de
  // faturamento mensal — pra o detalhamento bater com o resto do sistema.
  const [fixedCostRatePercent, setFixedCostRatePercent] = useState(0);
  const [roleHourlyRates, setRoleHourlyRates] = useState<Record<string, number>>({});
  const [employeeRoles, setEmployeeRoles] = useState<string[]>([]);

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

    (async () => {
      const [fixedRes, empRes, billingRes] = await Promise.all([
        supabase.from("fixed_expenses").select("value"),
        supabase.from("employees").select("role, hour_value, department, total_monthly_cost"),
        supabase
          .from("billing_settings")
          .select("monthly_revenue_target")
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);

      const fixedTotal = (fixedRes.data || []).reduce((s: number, f: any) => s + Number(f.value || 0), 0);
      const allEmployees = empRes.data || [];
      const empTotal = allEmployees
        .filter((e: any) => e.department !== "Produção")
        .reduce((s: number, e: any) => s + Number(e.total_monthly_cost || 0), 0);
      const monthlyRevenue = Number(billingRes.data?.[0]?.monthly_revenue_target || 0);
      if (monthlyRevenue > 0) {
        setFixedCostRatePercent(Number((((fixedTotal + empTotal) / monthlyRevenue) * 100).toFixed(2)));
      }

      const rateMap: Record<string, { total: number; count: number }> = {};
      allEmployees.forEach((e: any) => {
        const role = (e.role || "").trim();
        if (!role) return;
        if (!rateMap[role]) rateMap[role] = { total: 0, count: 0 };
        rateMap[role].total += Number(e.hour_value || 0);
        rateMap[role].count += 1;
      });
      const avgRates: Record<string, number> = {};
      Object.entries(rateMap).forEach(([role, { total, count }]) => {
        avgRates[role] = count > 0 ? Number((total / count).toFixed(2)) : 0;
      });
      setRoleHourlyRates(avgRates);
      setEmployeeRoles(Object.keys(avgRates).sort((a, b) => a.localeCompare(b, "pt-BR")));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materialOptions = useMemo(
    () => [...rawMaterials].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR")),
    [rawMaterials]
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrice(0);
    setPriceInput(formatMoneyInputBR(0));
    setInsumoRows([]);
    setLaborRows([]);
  };

  const handleEdit = (m: Montagem) => {
    setEditingId(m.id);
    setName(m.name);
    setPrice(m.price);
    setPriceInput(formatMoneyInputBR(m.price));
    setInsumoRows(
      (m.insumos || []).map((i) => ({
        id: i.id,
        materialId: i.materialId || "",
        name: i.name,
        quantity: i.quantity ?? 1,
        quantityInput: String(i.quantity ?? 1),
        unitValue: i.unitValue ?? i.value,
        unitValueInput: formatMoneyInputBR(i.unitValue ?? i.value),
      }))
    );
    setLaborRows(
      (m.labor || []).map((l) => ({
        id: l.id,
        role: l.role,
        count: l.count,
        hours: l.hours,
        hoursInput: String(l.hours),
        hourlyRate: l.rate,
        hourlyRateInput: formatMoneyInputBR(l.rate),
      }))
    );
  };

  // ── Insumos (matéria-prima) ──────────────────────────────────────────
  const addInsumoRow = () => setInsumoRows((prev) => [...prev, emptyInsumoRow()]);
  const removeInsumoRow = (id: string) => setInsumoRows((prev) => prev.filter((r) => r.id !== id));

  const updateInsumoMaterial = (id: string, materialId: string) => {
    const material = rawMaterials.find((m) => m.id === materialId);
    const cost = getVariantCost(getMaterialVariants(material)[0]);
    setInsumoRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              materialId,
              name: material?.name || "",
              unitValue: cost,
              unitValueInput: formatMoneyInputBR(cost),
            }
          : r
      )
    );
  };

  const updateInsumoQuantity = (id: string, raw: string) => {
    const qty = Number(raw) || 0;
    setInsumoRows((prev) => prev.map((r) => (r.id === id ? { ...r, quantity: qty, quantityInput: raw } : r)));
  };

  const updateInsumoUnitValue = (id: string, raw: string) => {
    const sanitized = sanitizeMoneyInputBR(raw);
    setInsumoRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, unitValueInput: sanitized, unitValue: parseMoneyInputBR(sanitized) } : r
      )
    );
  };
  const blurInsumoUnitValue = (id: string) =>
    setInsumoRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, unitValueInput: formatMoneyInputBR(r.unitValue) } : r))
    );

  const insumosTotal = insumoRows.reduce((s, r) => s + r.quantity * r.unitValue, 0);

  // ── Mão de obra ───────────────────────────────────────────────────────
  const addLaborRow = () => setLaborRows((prev) => [...prev, emptyLaborRow()]);
  const removeLaborRow = (id: string) => setLaborRows((prev) => prev.filter((r) => r.id !== id));

  const updateLaborRole = (id: string, role: string) => {
    const rate = roleHourlyRates[role] || 0;
    setLaborRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, role, hourlyRate: rate, hourlyRateInput: formatMoneyInputBR(rate) } : r))
    );
  };
  const updateLaborCount = (id: string, raw: string) => {
    const count = Number(raw) || 0;
    setLaborRows((prev) => prev.map((r) => (r.id === id ? { ...r, count } : r)));
  };
  const updateLaborHours = (id: string, raw: string) => {
    const hours = Number(raw) || 0;
    setLaborRows((prev) => prev.map((r) => (r.id === id ? { ...r, hours, hoursInput: raw } : r)));
  };
  const updateLaborRate = (id: string, raw: string) => {
    const sanitized = sanitizeMoneyInputBR(raw);
    setLaborRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, hourlyRateInput: sanitized, hourlyRate: parseMoneyInputBR(sanitized) } : r
      )
    );
  };
  const blurLaborRate = (id: string) =>
    setLaborRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, hourlyRateInput: formatMoneyInputBR(r.hourlyRate) } : r))
    );

  const laborTotal = laborRows.reduce((s, r) => s + r.count * r.hours * r.hourlyRate, 0);

  // ── Detalhamento de custos (mesma régua do resto do sistema) ────────────
  const internalCost = insumosTotal + laborTotal;

  const commissionRate =
    variableExpenses.find((e) => normalizeText(e.name).includes(normalizeText("comissão")))?.value || 0;
  const taxRate =
    variableExpenses.find(
      (e) => normalizeText(e.name).includes(normalizeText("imposto")) || normalizeText(e.name).includes(normalizeText("simples"))
    )?.value || 0;
  const cardRate =
    variableExpenses.find(
      (e) => normalizeText(e.name).includes(normalizeText("maquininha")) || normalizeText(e.name).includes(normalizeText("cartão"))
    )?.value || 0;

  const commissionValue = price * (commissionRate / 100);
  const taxValue = price * (taxRate / 100);
  const cardValue = price * (cardRate / 100);
  const fixedCostValue = price * (fixedCostRatePercent / 100);

  const netProfit = price - internalCost - commissionValue - taxValue - cardValue - fixedCostValue;
  const netMargin = price > 0 ? (netProfit / price) * 100 : 0;

  const handleSave = async () => {
    if (!name.trim()) return alert("Informe o nome da montagem.");
    setSaving(true);

    const insumosPayload: MontagemInsumo[] = insumoRows
      .filter((r) => r.materialId)
      .map((r) => ({
        id: r.id,
        materialId: r.materialId,
        name: r.name,
        quantity: r.quantity,
        unitValue: r.unitValue,
        value: r.quantity * r.unitValue,
      }));

    const laborPayload: MontagemLaborLine[] = laborRows
      .filter((r) => r.role)
      .map((r) => ({
        id: r.id,
        role: r.role,
        count: r.count,
        hours: r.hours,
        rate: r.hourlyRate,
        total: r.count * r.hours * r.hourlyRate,
      }));

    const payload = {
      name: name.trim(),
      price,
      insumos: insumosPayload,
      labor: laborPayload,
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
    setMontagens((prev) => (editingId ? prev.map((m) => (m.id === editingId ? saved : m)) : [...prev, saved]));
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

  const rowInputCls =
    "px-2 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md text-sm";

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {editingId ? "Editar montagem" : "Nova montagem"}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Monte o custo real (insumos + mão de obra) e só depois defina o valor fixo cobrado do
            cliente — o nome da montagem nunca aparece pra ele.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Montagem Pia Padrão"
            className="mt-1 block w-full max-w-md px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
          />
        </div>

        {/* INSUMOS (matéria-prima) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Insumos (matéria-prima)
            </label>
            <button type="button" onClick={addInsumoRow} className="text-xs font-semibold text-primary-700 hover:underline">
              + adicionar item
            </button>
          </div>

          {insumoRows.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum insumo adicionado.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase px-1">
                <span className="col-span-5">Matéria-prima</span>
                <span className="col-span-2">Qtd</span>
                <span className="col-span-2">Valor unit.</span>
                <span className="col-span-2">Valor total</span>
              </div>
              {insumoRows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={r.materialId}
                    onChange={(e) => updateInsumoMaterial(r.id, e.target.value)}
                    className={`col-span-5 ${rowInputCls}`}
                  >
                    <option value="">Selecione a matéria-prima</option>
                    {materialOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={r.quantityInput}
                    onChange={(e) => updateInsumoQuantity(r.id, e.target.value)}
                    className={`col-span-2 text-right ${rowInputCls}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.unitValueInput}
                    onChange={(e) => updateInsumoUnitValue(r.id, e.target.value)}
                    onBlur={() => blurInsumoUnitValue(r.id)}
                    className={`col-span-2 text-right ${rowInputCls}`}
                  />
                  <div className="col-span-2 px-2 py-2 text-sm text-right font-semibold text-gray-700 dark:text-gray-200">
                    {money(r.quantity * r.unitValue)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInsumoRow(r.id)}
                    className="col-span-1 text-red-500 hover:text-red-700 justify-self-center"
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

        {/* MÃO DE OBRA */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mão de obra</label>
            <button type="button" onClick={addLaborRow} className="text-xs font-semibold text-primary-700 hover:underline">
              + adicionar item
            </button>
          </div>

          {laborRows.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma mão de obra adicionada.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase px-1">
                <span className="col-span-4">Função</span>
                <span className="col-span-2">Qtd. funcionários</span>
                <span className="col-span-2">Horas</span>
                <span className="col-span-2">Valor/hora</span>
                <span className="col-span-1">Total</span>
              </div>
              {laborRows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={r.role}
                    onChange={(e) => updateLaborRole(r.id, e.target.value)}
                    className={`col-span-4 ${rowInputCls}`}
                  >
                    <option value="">Selecione a função</option>
                    {employeeRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={r.count}
                    onChange={(e) => updateLaborCount(r.id, e.target.value)}
                    className={`col-span-2 text-right ${rowInputCls}`}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={r.hoursInput}
                    onChange={(e) => updateLaborHours(r.id, e.target.value)}
                    className={`col-span-2 text-right ${rowInputCls}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.hourlyRateInput}
                    onChange={(e) => updateLaborRate(r.id, e.target.value)}
                    onBlur={() => blurLaborRate(r.id)}
                    className={`col-span-2 text-right ${rowInputCls}`}
                  />
                  <div className="col-span-1 px-1 py-2 text-sm text-right font-semibold text-gray-700 dark:text-gray-200">
                    {money(r.count * r.hours * r.hourlyRate)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLaborRow(r.id)}
                    className="col-span-1 text-red-500 hover:text-red-700 justify-self-center"
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
                <span>Custo total da mão de obra:</span>
                <span>{money(laborTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* VALOR FIXO — no final, depois de montar o custo real */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Valor fixo cobrado do cliente (R$)
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
            className="mt-1 block w-full max-w-xs px-3 py-2 bg-white dark:bg-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm"
          />
        </div>

        {/* DETALHAMENTO DE CUSTOS */}
        {price > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-4 space-y-1 text-sm">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase mb-2">
              Detalhamento de custos
            </h4>
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>Custo insumos:</span>
              <span className="font-medium">{money(insumosTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>Custo mão de obra:</span>
              <span className="font-medium">{money(laborTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-800 dark:text-gray-100 font-semibold border-t border-amber-300 dark:border-amber-800 pt-1 mt-1">
              <span>Custo total (CMV):</span>
              <span>{money(internalCost)}</span>
            </div>
            {fixedCostValue > 0 && (
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Custos fixos ({fixedCostRatePercent.toFixed(2)}%):</span>
                <span className="font-medium">{money(fixedCostValue)}</span>
              </div>
            )}
            {commissionValue > 0 && (
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Comissão ({commissionRate}%):</span>
                <span className="font-medium">{money(commissionValue)}</span>
              </div>
            )}
            {cardValue > 0 && (
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Taxa de maquininha ({cardRate}%):</span>
                <span className="font-medium">{money(cardValue)}</span>
              </div>
            )}
            {taxValue > 0 && (
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Impostos ({taxRate}%):</span>
                <span className="font-medium">{money(taxValue)}</span>
              </div>
            )}
            <div
              className={`flex justify-between font-bold border-t border-amber-300 dark:border-amber-800 pt-2 mt-2 ${
                netProfit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              <span>Lucro líquido estimado:</span>
              <span>{money(netProfit)}</span>
            </div>
            <div
              className={`flex justify-between text-xs font-semibold ${
                netProfit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              <span>Margem de lucro:</span>
              <span>{netMargin.toFixed(2)}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Montagens cadastradas</h3>
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
                    {(m.labor || []).length > 0 && ` · ${m.labor!.length} mão de obra`}
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
