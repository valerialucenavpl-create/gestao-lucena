import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import { createCashFlowEntry } from "../services/cashFlowServices";
import { Payable, PayableInstallment } from "../types";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";

// ─── Categorias fixas de Contas a Pagar ─────────────────────────────────────
const PAYABLE_CATEGORIES = [
  "MERCADORIA", "FUNCIONARIO", "IMPOSTO", "ALUGUEL", "JUROS",
  "SISTEMA", "PATROCINIO", "ENERGIA", "AGUA", "CONSORCIO",
  "CONTADOR", "INTERNET",
];

const EXTRA_SUBCATEGORIES = ["CUSTO FIXO", "CUSTO VARIAVEL"];

// ─── CashFlow Saída plan (duplicated from CashFlowForm) ───────────────────────
const SAIDA_PLAN: Record<string, { title: string; items: string[] }[]> = {
  "CUSTOS VARIÁVEIS": [
    { title: "mercadorias / produtos", items: ["compra de mercadorias", "frete de fornecedores", "embalagens", "taxas de importação"] },
    { title: "taxas de venda", items: ["taxa de cartão", "taxa de maquininha", "taxa de plataforma / marketplace", "taxa de link de pagamento"] },
    { title: "impostos sobre vendas", items: ["impostos sobre vendas", "comissões", "horas extras"] },
  ],
  "CUSTOS FIXOS": [
    { title: "estrutura", items: ["aluguel", "energia", "água", "internet", "telefonia", "sistema / software", "contador", "salários", "encargos sociais (inss / fgts)", "13º salário"] },
    { title: "benefícios", items: ["alimentação loja", "alimentação viagem"] },
    { title: "transporte", items: ["combustível", "ipva"] },
  ],
  "DESPESAS NÃO OPERACIONAIS": [
    { title: "financeiras", items: ["parcela de empréstimo"] },
    { title: "investimentos", items: ["aplicação / investimento", "aquisição de imobilizado"] },
    { title: "distribuições", items: ["distribuição de lucros"] },
    { title: "outras", items: ["outras saídas"] },
  ],
};

const PAYMENT_METHODS = ["PIX", "Dinheiro", "Cartão Débito", "Cartão Crédito", "Transferência Bancária", "Boleto", "Cheque"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getCurrentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonthLabel = (monthStr: string) => {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};

// Soma meses a uma data YYYY-MM-DD mantendo o dia; se o mês não tiver esse
// dia (ex.: 31 em fevereiro), usa o último dia do mês.
const addMonthsYMD = (ymd: string, months: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const normalizeRow = (row: any): Payable => ({
  id: String(row.id),
  name: row.name || "",
  amount: Number(row.amount || 0),
  supplier: row.supplier || "",
  payableCategory: row.payable_category || "",
  productCategory: row.product_category || "",
  dueDate: row.due_date ? String(row.due_date).split("T")[0] : "",
  installments: Array.isArray(row.installments) ? row.installments : [],
  notes: row.notes || "",
  status: (row.status || "pending") as Payable["status"],
  employeeId: row.employee_id != null ? Number(row.employee_id) : null,
  paidDate: row.paid_date ? String(row.paid_date).split("T")[0] : undefined,
  paymentMethod: row.payment_method || undefined,
  createdAt: row.created_at,
});

type EmployeeOption = { id: number; name: string; active: boolean };

type PayableRow = {
  key: string;
  payable: Payable;
  installment?: PayableInstallment;
  installmentLabel?: string;
  amount: number;
  dueDate: string;
  status: "overdue" | "pending" | "partial" | "paid";
};

// ─── Main Component ────────────────────────────────────────────────────────────
const Payables: React.FC = () => {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialCategories, setMaterialCategories] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payingPayable, setPayingPayable] = useState<Payable | null>(null);
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid">("all");
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthStr());
  const [showAllPeriods, setShowAllPeriods] = useState(false);

  useEffect(() => {
    loadPayables();
    loadCategories();
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, name, active").order("name");
    if (data) setEmployees(data.map((e: any) => ({ id: Number(e.id), name: e.name || "", active: e.active !== false })));
  };

  const loadPayables = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { if (showLoader) setLoading(false); return; }
    const { data } = await supabase
      .from("payables")
      .select("*")
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    if (data) setPayables(data.map(normalizeRow));
    if (showLoader) setLoading(false);
  };

  const loadCategories = async () => {
    const { data } = await supabase.from("material_categories").select("name").order("name");
    if (data) setMaterialCategories(data.map((c: any) => c.name));
  };

  const handleDelete = async (id: string) => {
    const hasInstallments = (payables.find((p) => p.id === id)?.installments.length ?? 0) > 0;
    const msg = hasInstallments
      ? "Excluir esta conta a pagar? Todas as parcelas dela serão excluídas."
      : "Excluir esta conta a pagar?";
    if (!window.confirm(msg)) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    // Exclusão reversível — marca deleted_at, não apaga a linha.
    // Só Admin consegue (trava no banco); outros papéis recebem erro aqui.
    // Importante: um UPDATE que a RLS barra não retorna erro nenhum, só
    // não afeta nenhuma linha — por isso confirmamos com .select() que a
    // linha realmente voltou, em vez de confiar só na ausência de erro.
    const { data, error } = await supabase
      .from("payables")
      .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user.id })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      alert(`Não foi possível excluir: ${error?.message ?? "nenhuma linha foi alterada (verifique permissão)"}`);
      return;
    }
    setPayables((prev) => prev.filter((p) => p.id !== id));
  };

  const today = todayISO();

  const getStatus = (p: Payable): "overdue" | "pending" | "partial" | "paid" => {
    if (p.status === "paid") return "paid";
    if (p.installments.length > 0) {
      if (p.installments.every((i) => i.paid)) return "paid";
      if (p.installments.some((i) => i.paid)) return "partial";
    }
    if (p.dueDate && p.dueDate < today) return "overdue";
    return "pending";
  };

  const statusBadge = (s: ReturnType<typeof getStatus>) => {
    if (s === "paid")    return { label: "Pago",     cls: "bg-green-100 text-green-700" };
    if (s === "partial") return { label: "Parcial",  cls: "bg-yellow-100 text-yellow-700" };
    if (s === "overdue") return { label: "Vencida",  cls: "bg-red-100 text-red-700" };
    return               { label: "A Vencer", cls: "bg-blue-100 text-blue-700" };
  };

  // Conta parcelada vira uma linha por parcela, cada uma no seu vencimento;
  // conta à vista continua sendo uma linha só.
  // Conta de funcionário desativado sai da lista (volta se ele for reativado).
  const inactiveEmployeeIds = useMemo(
    () => new Set(employees.filter((e) => !e.active).map((e) => e.id)),
    [employees]
  );

  const rows = useMemo<PayableRow[]>(() =>
    payables
      .filter((p) => p.employeeId == null || !inactiveEmployeeIds.has(p.employeeId))
      .flatMap((p): PayableRow[] => {
      if (p.installments.length === 0) {
        return [{ key: p.id, payable: p, amount: p.amount, dueDate: p.dueDate, status: getStatus(p) }];
      }
      const total = p.installments.length;
      return p.installments.map((inst, idx) => {
        const dueDate = inst.dueDate || p.dueDate;
        const paid = inst.paid || p.status === "paid";
        return {
          key: `${p.id}-${inst.id}`,
          payable: p,
          installment: inst,
          installmentLabel: `${idx + 1}/${total}`,
          amount: Number(inst.amount || 0) || p.amount / total,
          dueDate,
          status: paid ? "paid" : dueDate && dueDate < today ? "overdue" : "pending",
        };
      });
    }),
  [payables, inactiveEmployeeIds, today]);

  // Linhas sem data de vencimento não têm como ser classificadas num mês —
  // ficam sempre visíveis, em vez de simplesmente sumir do filtro.
  const monthFiltered = useMemo(() => {
    if (showAllPeriods) return rows;
    return rows.filter((r) => !r.dueDate || r.dueDate.startsWith(filterMonth));
  }, [rows, filterMonth, showAllPeriods]);

  const filtered = useMemo(() => {
    const base = monthFiltered.filter((r) => {
      if (filterStatus === "pending") return r.status !== "paid";
      if (filterStatus === "paid")    return r.status === "paid";
      return true;
    });

    // Vencidas/a vencer primeiro (por ordem de vencimento); pagas vão pro final.
    return [...base].sort((a, b) => {
      const aPaid = a.status === "paid";
      const bPaid = b.status === "paid";
      if (aPaid !== bPaid) return aPaid ? 1 : -1;
      return (a.dueDate || "").localeCompare(b.dueDate || "");
    });
  }, [monthFiltered, filterStatus]);

  // Os totais acompanham o período selecionado (mês atual por padrão);
  // só refletem tudo quando "Ver todo o período" está marcado.
  const stats = useMemo(() => ({
    pending: monthFiltered.filter((r) => r.status !== "paid").reduce((s, r) => s + r.amount, 0),
    overdue: monthFiltered.filter((r) => r.status === "overdue").reduce((s, r) => s + r.amount, 0),
    paid:    monthFiltered.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0),
  }), [monthFiltered]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Contas a Pagar</h2>
          <p className="text-gray-500 text-sm">
            Gerencie contas e dê baixa automática no Caixa •{" "}
            <span className="font-semibold capitalize">
              {showAllPeriods ? "todo o período" : formatMonthLabel(filterMonth)}
            </span>
          </p>
        </div>
        <button
          onClick={() => { setEditingPayable(null); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          + Nova Conta
        </button>
      </div>

      {/* Filtro de mês */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mês</label>
          <input
            type="month"
            disabled={showAllPeriods}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value || getCurrentMonthStr())}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:bg-gray-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2.5">
          <input
            type="checkbox"
            checked={showAllPeriods}
            onChange={(e) => setShowAllPeriods(e.target.checked)}
          />
          Ver todo o período
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">TOTAL A PAGAR</p>
          <p className="text-2xl font-bold text-blue-600">{money(stats.pending)}</p>
        </div>
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">CONTAS VENCIDAS</p>
          <p className="text-2xl font-bold text-red-600">{money(stats.overdue)}</p>
        </div>
        <div className="border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">TOTAL PAGO</p>
          <p className="text-2xl font-bold text-green-600">{money(stats.paid)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "pending", "paid"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFilterStatus(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterStatus === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {v === "all" ? "Todas" : v === "pending" ? "Pendentes" : "Pagas"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-center text-gray-500 py-8">Carregando...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">Nome</th>
                <th className="p-3 text-left">Fornecedor</th>
                <th className="p-3 text-left">Categoria</th>
                <th className="p-3 text-right">Valor parcela</th>
                <th className="p-3 text-right">Valor total</th>
                <th className="p-3 text-center">Vencimento</th>
                <th className="p-3 text-center">Parcelas</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-gray-500">Nenhuma conta cadastrada.</td></tr>
              ) : filtered.map((r) => {
                const p = r.payable;
                const s = r.status;
                const { label, cls } = statusBadge(s);
                return (
                  <tr key={r.key} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-gray-600">{p.supplier || "-"}</td>
                    <td className="p-3 text-gray-600">{p.payableCategory || "-"}{p.productCategory ? ` / ${p.productCategory}` : ""}</td>
                    <td className="p-3 text-right font-semibold">{money(r.amount)}</td>
                    <td className="p-3 text-right text-gray-600">{money(p.amount)}</td>
                    <td className="p-3 text-center">{formatBR(r.dueDate)}</td>
                    <td className="p-3 text-center text-xs text-gray-500">
                      {r.installmentLabel ? `Parcela ${r.installmentLabel}` : "À vista"}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center flex-wrap">
                        <button
                          onClick={() => { setEditingPayable(p); setShowForm(true); }}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                        >Editar</button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >Excluir</button>
                        {s !== "paid" && (
                          <button
                            onClick={() => { setPayingPayable(p); setPayingInstallmentId(r.installment?.id ?? null); setShowPayment(true); }}
                            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 font-semibold"
                          >Pagar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PayableFormModal
          payable={editingPayable}
          materialCategories={materialCategories}
          employees={employees}
          existingPayables={payables}
          onClose={() => setShowForm(false)}
          onSave={(p, recurringCopies = []) => {
            setPayables((prev) => [
              ...recurringCopies,
              ...(editingPayable ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]),
            ]);
            setShowForm(false);
          }}
        />
      )}

      {showPayment && payingPayable && (
        <PaymentModal
          payable={payingPayable}
          initialInstallmentId={payingInstallmentId}
          onClose={() => setShowPayment(false)}
          onPaid={(updated) => {
            setPayables((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setShowPayment(false);
            loadPayables(false);
          }}
        />
      )}
    </div>
  );
};

// ─── PayableFormModal ──────────────────────────────────────────────────────────
const PayableFormModal: React.FC<{
  payable: Payable | null;
  materialCategories: string[];
  employees: EmployeeOption[];
  existingPayables: Payable[];
  onClose: () => void;
  onSave: (p: Payable, recurringCopies?: Payable[]) => void;
}> = ({ payable, materialCategories, employees, existingPayables, onClose, onSave }) => {
  const [employeeId, setEmployeeId] = useState<number | null>(payable?.employeeId ?? null);
  const [name, setName] = useState(payable?.name || "");
  const [supplier, setSupplier] = useState(payable?.supplier || "");
  const [amount, setAmount] = useState(payable?.amount || 0);
  const [amountInput, setAmountInput] = useState(formatMoneyInputBR(payable?.amount || 0));
  const [payableCategory, setPayableCategory] = useState(payable?.payableCategory || "");
  const [productCategory, setProductCategory] = useState(payable?.productCategory || "");
  const [dueDate, setDueDate] = useState(payable?.dueDate || "");
  const [notes, setNotes] = useState(payable?.notes || "");
  const [installments, setInstallments] = useState<PayableInstallment[]>(payable?.installments || []);
  const [saving, setSaving] = useState(false);
  // Conta recorrente (gasto fixo): além desta, cria uma cópia independente
  // em cada um dos meses seguintes — cada mês é pago/ajustado separado.
  const [recurring, setRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);

  const subcategoryOptions = useMemo(
    () => [...materialCategories, ...EXTRA_SUBCATEGORIES],
    [materialCategories]
  );

  const cls = "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const addInstallment = () =>
    setInstallments((prev) => [...prev, { id: `i-${Date.now()}`, dueDate: "", amount: 0, paid: false }]);

  const removeInstallment = (id: string) =>
    setInstallments((prev) => prev.filter((i) => i.id !== id));

  const updateInstallment = (id: string, field: keyof PayableInstallment, value: any) =>
    setInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSubmit = async () => {
    if (!name.trim()) return alert("Nome é obrigatório.");
    if (amount <= 0) return alert("Valor precisa ser maior que 0.");
    if (recurring && !dueDate) return alert("Conta recorrente precisa da Data de Vencimento.");
    if (recurring && installments.length > 0) return alert("Conta recorrente não pode ter parcelas — cada mês já vira uma conta.");
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const payload = {
        user_id: authData.user.id,
        name: name.trim(),
        supplier: supplier.trim(),
        amount: Number(amount),
        payable_category: payableCategory,
        product_category: productCategory,
        due_date: dueDate || null,
        installments,
        notes: notes.trim(),
        status: payable?.status || "pending",
        employee_id: employeeId,
      };
      let saved: Payable;
      if (payable) {
        const { data, error } = await supabase.from("payables").update(payload).eq("id", payable.id).select().single();
        if (error) { alert(`Erro: ${error.message}`); return; }
        saved = normalizeRow(data);
      } else {
        const { data, error } = await supabase.from("payables").insert(payload).select().single();
        if (error) { alert(`Erro: ${error.message}`); return; }
        saved = normalizeRow(data);
      }

      let copies: Payable[] = [];
      if (recurring && dueDate) {
        // Pula meses que já têm conta com o mesmo nome — marcar "recorrente"
        // de novo numa conta já repetida não duplica nada.
        const sameName = (n: string) => n.trim().toLowerCase() === name.trim().toLowerCase();
        const takenMonths = new Set(
          existingPayables.filter((p) => sameName(p.name) && p.dueDate).map((p) => p.dueDate.slice(0, 7))
        );
        const copyRows = Array.from({ length: Math.max(0, recurringMonths - 1) }, (_, i) =>
          addMonthsYMD(dueDate, i + 1)
        )
          .filter((d) => !takenMonths.has(d.slice(0, 7)))
          .map((d) => ({ ...payload, due_date: d, installments: [], status: "pending" }));
        if (copyRows.length > 0) {
          const { data, error } = await supabase.from("payables").insert(copyRows).select();
          if (error) alert(`Conta salva, mas não foi possível criar os meses seguintes: ${error.message}`);
          else copies = (data || []).map(normalizeRow);
        }
      }
      onSave(saved, copies);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-bold">{payable ? "Editar Conta" : "Nova Conta a Pagar"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">×</button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Nome da Conta *</label>
            <input className={cls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Compra de alumínio — Fornecedor X" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Funcionário (opcional)</label>
            <select
              className={cls}
              value={employeeId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setEmployeeId(id);
                const emp = employees.find((x) => x.id === id);
                if (emp) {
                  if (!supplier.trim()) setSupplier(emp.name.split(/\s+/)[0].toUpperCase());
                  if (!payableCategory) setPayableCategory("FUNCIONARIO");
                }
              }}
            >
              <option value="">Nenhum — não é conta de funcionário</option>
              {employees
                .filter((e) => e.active || e.id === employeeId)
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.active ? "" : " (desativado)"}</option>
                ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Vinculada a um funcionário, cada baixa aparece em "Pagamentos" no painel dele.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Fornecedor</label>
            <input className={cls} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Valor Total *</label>
            <input
              className={cls}
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                const raw = sanitizeMoneyInputBR(e.target.value);
                setAmountInput(raw);
                setAmount(parseMoneyInputBR(raw));
              }}
              onBlur={() => setAmountInput(formatMoneyInputBR(amount))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Categoria</label>
            <select className={cls} value={payableCategory} onChange={(e) => setPayableCategory(e.target.value)}>
              <option value="">Selecione</option>
              {PAYABLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subcategoria</label>
            <select className={cls} value={productCategory} onChange={(e) => setProductCategory(e.target.value)}>
              <option value="">Selecione</option>
              {subcategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Data de Vencimento</label>
            <input type="date" className={cls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Observação</label>
            <textarea className={cls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionais..." />
          </div>

          {/* Conta recorrente */}
          <div className={`md:col-span-2 rounded-lg border p-3 ${recurring ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="w-4 h-4 shrink-0"
              />
              <span>🔁 Conta recorrente (gasto fixo todo mês)</span>
            </label>
            {recurring && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <span>Repetir por</span>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={recurringMonths}
                  onChange={(e) => setRecurringMonths(Math.min(60, Math.max(2, Number(e.target.value) || 2)))}
                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg bg-white"
                />
                <span>meses</span>
                <p className="w-full text-xs text-gray-500">
                  {dueDate
                    ? `Cria uma conta por mês, de ${formatBR(dueDate)} até ${formatBR(addMonthsYMD(dueDate, recurringMonths - 1))}, sempre no mesmo dia. Cada mês é pago separado e pode ter o valor ajustado. Meses que já têm conta com esse nome são pulados.`
                    : "Preencha a Data de Vencimento do primeiro mês."}
                </p>
              </div>
            )}
          </div>

          {/* Parcelas */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Parcelas</label>
              <button
                type="button"
                onClick={addInstallment}
                className="text-sm px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                + Adicionar Parcela
              </button>
            </div>
            {installments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sem parcelas — conta à vista</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {installments.map((inst, idx) => (
                  <div key={inst.id} className="border rounded-lg p-2 bg-gray-50 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">Parcela {idx + 1}</span>
                      {inst.paid
                        ? <span className="text-xs text-green-600 font-bold">✓ Pago</span>
                        : <button type="button" onClick={() => removeInstallment(inst.id)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                      }
                    </div>
                    <input
                      type="date"
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      value={inst.dueDate}
                      onChange={(e) => updateInstallment(inst.id, "dueDate", e.target.value)}
                    />
                    <input
                      type="number"
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      placeholder="Valor (R$)"
                      value={inst.amount || ""}
                      onChange={(e) => updateInstallment(inst.id, "amount", Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── PaymentModal ──────────────────────────────────────────────────────────────
const PaymentModal: React.FC<{
  payable: Payable;
  initialInstallmentId?: string | null;
  onClose: () => void;
  onPaid: (updated: Payable) => void;
}> = ({ payable, initialInstallmentId, onClose, onPaid }) => {
  const pendingInst = payable.installments.filter((i) => !i.paid);
  const [selectedInst, setSelectedInst] = useState<string>(
    pendingInst.find((i) => i.id === initialInstallmentId)?.id ??
      (pendingInst.length > 0 ? pendingInst[0].id : "full")
  );
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [cfCategory, setCfCategory] = useState(Object.keys(SAIDA_PLAN)[0]);
  const [cfSubcategory, setCfSubcategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [description, setDescription] = useState(
    `Pagamento: ${payable.name}${payable.supplier ? ` — ${payable.supplier}` : ""}`
  );
  const [saving, setSaving] = useState(false);

  const subcategoryOptions = useMemo(
    () => (SAIDA_PLAN[cfCategory] || []).flatMap((g) => g.items),
    [cfCategory]
  );

  useEffect(() => {
    setCfSubcategory(subcategoryOptions[0] || "");
  }, [subcategoryOptions]);

  const paymentAmount = useMemo(() => {
    if (selectedInst === "full") return payable.amount;
    return payable.installments.find((i) => i.id === selectedInst)?.amount || 0;
  }, [selectedInst, payable]);

  const cls = "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500";

  const handleConfirm = async () => {
    if (!paymentDate) return alert("Data de pagamento é obrigatória.");
    if (!cfSubcategory) return alert("Selecione a subcategoria.");
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      // 1. Lança no caixa
      const cfResult = await createCashFlowEntry({
        type: "Saída",
        amount: paymentAmount,
        category: cfCategory.trim().toUpperCase(),
        subcategory: cfSubcategory.trim().toLowerCase(),
        description: `${description} | ${paymentMethod}`.trim(),
        date: paymentDate,
      });
      if (!cfResult.ok) {
        alert(`Erro ao lançar no Caixa: ${(cfResult.error as any)?.message}`);
        return;
      }

      // 2. Atualiza a conta
      const updated: Payable = { ...payable };
      if (selectedInst === "full" || payable.installments.length === 0) {
        updated.status = "paid";
        updated.paidDate = paymentDate;
        updated.paymentMethod = paymentMethod;
        // marca as parcelas ainda em aberto como pagas também
        if (payable.installments.length > 0) {
          updated.installments = payable.installments.map((i) =>
            i.paid ? i : { ...i, paid: true, paidDate: paymentDate, paymentMethod }
          );
        }
      } else {
        updated.installments = payable.installments.map((i) =>
          i.id === selectedInst ? { ...i, paid: true, paidDate: paymentDate, paymentMethod } : i
        );
        updated.status = updated.installments.every((i) => i.paid) ? "paid" : "partial";
      }

      const { data: updatedRows, error } = await supabase
        .from("payables")
        .update({
          status: updated.status,
          installments: updated.installments,
          ...(updated.paidDate ? { paid_date: updated.paidDate, payment_method: updated.paymentMethod } : {}),
        })
        .eq("id", payable.id)
        .select();

      if (error) { alert(`Erro ao atualizar conta: ${error.message}`); return; }

      if (!updatedRows || updatedRows.length === 0) {
        // Tenta sem filtro de ID para detectar problema de permissão
        const { data: check } = await supabase
          .from("payables")
          .select("id, status")
          .eq("id", payable.id)
          .single();
        const msg = check
          ? `A conta existe mas o update não foi salvo (status atual: ${check.status}). Verifique as permissões RLS no Supabase.`
          : `Conta não encontrada no banco (id: ${payable.id}). Recarregue a página e tente novamente.`;
        alert(`Aviso: ${msg}`);
        return;
      }

      alert("Pagamento registrado e lançado no Caixa automaticamente ✅");
      onPaid(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-bold text-green-700">Dar Baixa — Pagamento</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">×</button>
        </div>

        {/* Resumo da conta */}
        <div className="mx-6 mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="font-bold text-blue-800 text-base">{payable.name}</p>
          {payable.supplier && <p className="text-sm text-blue-600 mt-1">Fornecedor: {payable.supplier}</p>}
          {payable.payableCategory && <p className="text-sm text-blue-600">Categoria: {payable.payableCategory}{payable.productCategory ? ` / ${payable.productCategory}` : ""}</p>}
          <p className="text-sm text-blue-600">Valor total: <strong>{money(payable.amount)}</strong></p>
          {payable.dueDate && <p className="text-sm text-blue-600">Vencimento: {formatBR(payable.dueDate)}</p>}
          {payable.notes && <p className="text-xs text-blue-500 mt-2 italic">{payable.notes}</p>}
        </div>

        <div className="p-6 space-y-4">
          {/* Parcelas */}
          {pendingInst.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Qual parcela pagar?</label>
              <select className={cls} value={selectedInst} onChange={(e) => setSelectedInst(e.target.value)}>
                <option value="full">Conta inteira — {money(payable.amount)}</option>
                {pendingInst.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    Parcela {payable.installments.indexOf(inst) + 1} — {formatBR(inst.dueDate)} — {money(inst.amount)}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">
                Valor a pagar: <strong className="text-gray-800">{money(paymentAmount)}</strong>
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Data do Pagamento</label>
            <input type="date" className={cls} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Forma de Pagamento</label>
            <select className={cls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Categoria no Caixa</label>
            <select className={`${cls} uppercase`} value={cfCategory} onChange={(e) => setCfCategory(e.target.value)}>
              {Object.keys(SAIDA_PLAN).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subcategoria no Caixa</label>
            <select className={cls} value={cfSubcategory} onChange={(e) => setCfSubcategory(e.target.value)}>
              {subcategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição no Caixa</label>
            <input className={cls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Ao confirmar, será criado automaticamente um lançamento de <strong>Saída de {money(paymentAmount)}</strong> no Caixa.
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-bold"
          >
            {saving ? "Registrando..." : "✓ Confirmar Pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Payables;
