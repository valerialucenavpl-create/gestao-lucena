// src/components/CashFlowForm.tsx
import React, { useEffect, useMemo, useState } from "react";
import { CashFlowEntry } from "../types";
import {
  getCashFlow,
  createCashFlowEntry,
  deleteCashFlowEntry,
} from "../services/cashFlowServices";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";

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

type CashPlanGroup = {
  title: string;
  items: string[];
};

type CashPlanByType = Record<"Entrada" | "Saída", Record<string, CashPlanGroup[]>>;

const CASH_FLOW_ACCOUNT_PLAN: CashPlanByType = {
  Entrada: {
    "RECEITAS OPERACIONAIS": [
      {
        title: "vendas",
        items: [
          "venda dinheiro",
          "venda pix",
          "venda cartão débito",
          "venda cartão crédito à vista",
          "venda cartão crédito parcelado",
          "venda link de pagamento",
          "venda transferência bancária",
        ],
      },
      {
        title: "outras receitas operacionais",
        items: [
          "recebimento de crediário / fiado",
          "taxa de entrega",
          "outras receitas operacionais",
        ],
      },
    ],
    "RECEITAS NÃO OPERACIONAIS": [
      {
        title: "receitas financeiras",
        items: ["juros de aplicação financeira", "cashback"],
      },
      {
        title: "movimentações financeiras",
        items: ["entrada de empréstimo", "aporte da proprietária", "resgate de aplicação"],
      },
      {
        title: "outras receitas",
        items: ["outras receitas não operacionais"],
      },
    ],
  },
  Saída: {
    "CUSTOS VARIÁVEIS": [
      {
        title: "mercadorias / produtos",
        items: [
          "compra de mercadorias",
          "frete de fornecedores",
          "embalagens",
          "taxas de importação",
        ],
      },
      {
        title: "taxas de venda",
        items: [
          "taxa de cartão",
          "taxa de maquininha",
          "taxa de plataforma / marketplace",
          "taxa de link de pagamento",
        ],
      },
      {
        title: "impostos sobre vendas",
        items: ["impostos sobre vendas", "comissões", "horas extras"],
      },
    ],
    "CUSTOS FIXOS": [
      {
        title: "estrutura da loja",
        items: [
          "aluguel",
          "energia",
          "água",
          "internet",
          "telefonia",
          "sistema / software",
          "contador",
          "salários",
          "encargos sociais (inss / fgts)",
          "13º salário",
        ],
      },
      {
        title: "benefícios",
        items: ["alimentação loja", "alimentação viagem"],
      },
      {
        title: "transporte",
        items: ["combustível", "ipva"],
      },
    ],
    "DESPESAS NÃO OPERACIONAIS": [
      {
        title: "financeiras",
        items: ["parcela de empréstimo"],
      },
      {
        title: "investimentos",
        items: ["aplicação / investimento", "aquisição de imobilizado"],
      },
      {
        title: "distribuições",
        items: ["distribuição de lucros"],
      },
      {
        title: "outras",
        items: ["outras saídas"],
      },
    ],
  },
};

const CashFlowForm: React.FC<Props> = ({ cashFlow, setCashFlow }) => {
  // -------- Form (Novo lançamento)
  const [type, setType] = useState<CashFlowEntry["type"]>("Entrada");
  const [amount, setAmount] = useState<number>(0);
  const [amountInput, setAmountInput] = useState<string>(formatMoneyInputBR(0));
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

  // -------- Relatório PDF
  const [reportFrom, setReportFrom] = useState<string>("");
  const [reportTo, setReportTo] = useState<string>("");

  const handleGenerateReport = () => {
    if (!reportFrom || !reportTo) {
      alert("Selecione a data inicial e final do relatório.");
      return;
    }

    const fromT = ymdToTime(reportFrom);
    const toT = ymdToTime(reportTo);

    if (fromT > toT) {
      alert("A data inicial deve ser anterior à data final.");
      return;
    }

    const list = Array.isArray(cashFlow) ? cashFlow : [];

    // Lançamentos ANTES do período (saldo anterior)
    const beforePeriod = list.filter((e) => ymdToTime(e.date) < fromT);
    const prevEntradas = beforePeriod
      .filter((e) => e.type === "Entrada")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const prevSaidas = beforePeriod
      .filter((e) => e.type === "Saída")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const prevSaldo = prevEntradas - prevSaidas;

    // Lançamentos DO período
    const inPeriod = list
      .filter((e) => {
        const t = ymdToTime(e.date);
        return t >= fromT && t <= toT;
      })
      .sort((a, b) => {
        const ta = ymdToTime(a.date);
        const tb = ymdToTime(b.date);
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
      });

    const periodEntradas = inPeriod
      .filter((e) => e.type === "Entrada")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const periodSaidas = inPeriod
      .filter((e) => e.type === "Saída")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const periodSaldo = periodEntradas - periodSaidas;

    const saldoAtual = prevSaldo + periodSaldo;
    const saldoAtualEntradas = prevEntradas + periodEntradas;
    const saldoAtualSaidas = prevSaidas + periodSaidas;

    const fmt = (n: number) =>
      Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const colorSaldo = (n: number) =>
      n >= 0 ? "color:#16a34a;font-weight:bold" : "color:#dc2626;font-weight:bold";

    const rows = inPeriod
      .map(
        (e, i) => `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};border-bottom:1px solid #e5e7eb">
          <td style="padding:8px 10px;white-space:nowrap">${formatBR(e.date)}</td>
          <td style="padding:8px 10px;font-weight:600;${e.type === "Entrada" ? "color:#16a34a" : "color:#dc2626"}">${e.type}</td>
          <td style="padding:8px 10px">${e.category || "-"}</td>
          <td style="padding:8px 10px">${e.subcategory || "-"}</td>
          <td style="padding:8px 10px">${e.description || "-"}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:600;${e.type === "Entrada" ? "color:#16a34a" : "color:#dc2626"}">${fmt(Number(e.amount || 0))}</td>
        </tr>`
      )
      .join("");

    const noRows = `<tr><td colspan="6" style="padding:24px;text-align:center;color:#6b7280">Nenhum lançamento no período selecionado.</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Relatório de Caixa</title>
  <style>
    @page { margin: 20mm 15mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 4px; color: #1e3a5f; }
    .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    .summary-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; }
    .summary-box h3 { font-size: 13px; text-transform: uppercase; color: #6b7280; margin: 0 0 10px; letter-spacing: .5px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .summary-row span { font-weight: 600; }
    .summary-row.total { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px; font-size: 14px; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    @media print {
      button { display: none; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
    <div>
      <h1>Relatório de Caixa</h1>
      <div class="subtitle">Período: ${formatBR(reportFrom)} a ${formatBR(reportTo)}</div>
    </div>
    <div style="text-align:right;color:#6b7280;font-size:12px">
      <div style="font-weight:700;font-size:15px;color:#1e3a5f">Gestão PRO</div>
      <div>Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Tipo</th>
        <th>Categoria</th>
        <th>Subcategoria</th>
        <th>Descrição</th>
        <th style="text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${inPeriod.length > 0 ? rows : noRows}
    </tbody>
  </table>

  <div class="summary-grid">
    <div class="summary-box">
      <h3>Saldo Anterior ao Período</h3>
      <div class="summary-row"><span style="color:#6b7280">Entradas:</span><span style="color:#16a34a">${fmt(prevEntradas)}</span></div>
      <div class="summary-row"><span style="color:#6b7280">Saídas:</span><span style="color:#dc2626">${fmt(prevSaidas)}</span></div>
      <div class="summary-row total"><span>Saldo anterior:</span><span style="${colorSaldo(prevSaldo)}">${fmt(prevSaldo)}</span></div>
    </div>

    <div class="summary-box">
      <h3>Resumo do Período (${formatBR(reportFrom)} — ${formatBR(reportTo)})</h3>
      <div class="summary-row"><span style="color:#6b7280">Entradas:</span><span style="color:#16a34a">${fmt(periodEntradas)}</span></div>
      <div class="summary-row"><span style="color:#6b7280">Saídas:</span><span style="color:#dc2626">${fmt(periodSaidas)}</span></div>
      <div class="summary-row total"><span>Saldo do período:</span><span style="${colorSaldo(periodSaldo)}">${fmt(periodSaldo)}</span></div>
    </div>

    <div class="summary-box" style="background:#f0f9ff;border-color:#bae6fd">
      <h3 style="color:#0369a1">Saldo Atual (Acumulado)</h3>
      <div class="summary-row"><span style="color:#6b7280">Total entradas:</span><span style="color:#16a34a">${fmt(saldoAtualEntradas)}</span></div>
      <div class="summary-row"><span style="color:#6b7280">Total saídas:</span><span style="color:#dc2626">${fmt(saldoAtualSaidas)}</span></div>
      <div class="summary-row total"><span style="color:#0369a1">Saldo atual:</span><span style="${colorSaldo(saldoAtual)}">${fmt(saldoAtual)}</span></div>
    </div>
  </div>

  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Permita pop-ups para gerar o relatório.");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  const categoryOptions = useMemo(
    () => Object.keys(CASH_FLOW_ACCOUNT_PLAN[type] ?? {}),
    [type]
  );

  const subcategoryGroups = useMemo(
    () => (category ? CASH_FLOW_ACCOUNT_PLAN[type]?.[category] ?? [] : []),
    [type, category]
  );

  useEffect(() => {
    if (categoryOptions.length === 0) {
      setCategory("");
      setSubcategory("");
      return;
    }

    setCategory((prev) =>
      prev && categoryOptions.includes(prev) ? prev : categoryOptions[0]
    );
  }, [categoryOptions]);

  useEffect(() => {
    if (!category) {
      setSubcategory("");
      return;
    }

    const allItems = subcategoryGroups.flatMap((group) => group.items);
    if (allItems.length === 0) {
      setSubcategory("");
      return;
    }

    setSubcategory((prev) => (prev && allItems.includes(prev) ? prev : allItems[0]));
  }, [category, subcategoryGroups]);

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
      } ${e.date ?? ""}`.toLowerCase();
      if (hay.includes(q)) return true;
      // busca por valor: aceita tanto "150" quanto "150,00" ou "1.500,00"
      const amountStr = Number(e.amount || 0)
        .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (amountStr.includes(q.replace("r$", "").trim())) return true;
      return false;
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
    if (!category) return alert("Selecione a categoria.");
    if (!subcategory) return alert("Selecione a subcategoria.");

    setSaving(true);
    try {
      const payload: Omit<CashFlowEntry, "id"> = {
        type,
        amount: Number(amount),
        category: category.trim().toUpperCase(),
        subcategory: subcategory.trim().toLowerCase(),
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
      setAmountInput(formatMoneyInputBR(0));
      setDescription("");
      setDate(todayISO());
      setType("Entrada");

      const defaultCategory = Object.keys(CASH_FLOW_ACCOUNT_PLAN.Entrada)[0] ?? "";
      const defaultSubcategory =
        CASH_FLOW_ACCOUNT_PLAN.Entrada[defaultCategory]?.[0]?.items?.[0] ?? "";
      setCategory(defaultCategory);
      setSubcategory(defaultSubcategory);

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

      const refresh = await getCashFlow();
      if (!refresh.ok) {
        console.error("Erro ao recarregar caixa após exclusão:", refresh.error);
        setCashFlow((prev) => (prev ?? []).filter((x) => x.id !== id));
        return;
      }

      const updated = refresh.data ?? [];
      setCashFlow(updated);

      const stillExists = updated.some((x) => String(x.id) === String(id));
      if (stillExists) {
        alert("O lançamento não foi removido no banco. Verifique permissões de exclusão (RLS) no Supabase.");
      }
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
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={amountInput}
            onChange={(e) => {
              const rawValue = sanitizeMoneyInputBR(e.target.value);
              setAmountInput(rawValue);
              setAmount(parseMoneyInputBR(rawValue));
            }}
            onBlur={() => setAmountInput(formatMoneyInputBR(amount))}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium">Categoria</label>
          <select
            className={`${inputClass} uppercase`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block font-medium">Subcategoria</label>
          <select
            className={inputClass}
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            disabled={subcategoryGroups.length === 0}
          >
            {subcategoryGroups.map((group) => (
              <optgroup key={group.title} label={group.title.toLowerCase()}>
                {group.items.map((item) => (
                  <option key={`${group.title}-${item}`} value={item}>
                    {item.toLowerCase()}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
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

      {/* Relatório PDF */}
      <hr className="my-6" />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-blue-900 mb-1">Relatório de Caixa (PDF)</h3>
            <p className="text-xs text-blue-700 mb-3">Selecione o período e gere um relatório completo com saldo anterior, do período e atual.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">Data Inicial</label>
                <input
                  type="date"
                  className={inputClass}
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">Data Final</label>
                <input
                  type="date"
                  className={inputClass}
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerateReport}
            className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 shadow flex items-center gap-2 whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Gerar Relatório PDF
          </button>
        </div>
      </div>

      {/* Histórico / filtros */}
      <hr className="my-6" />

      {/* Barra de pesquisa destacada */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por descrição, categoria, subcategoria ou valor (ex: 150,00)..."
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

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
