// src/components/CashFlowForm.tsx
import React, { useEffect, useMemo, useState } from "react";
import { BankAccount, CashFlowCategory, CashFlowEntry, CashFlowSettings } from "../types";
import { supabase } from "../services/supabase";
import {
  getCashFlow,
  createCashFlowEntry,
  deleteCashFlowEntry,
  createTransfer,
  updateCashFlowEntry,
} from "../services/cashFlowServices";
import { getBankAccounts } from "../services/bankAccountsServices";
import { getCashFlowCategories } from "../services/cashflowCategoriesServices";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import {
  PedidoCusto,
  PedidoCustoAllocation,
  canLinkCostToPedido,
  getPedidoCustos,
  setPedidoCustosForCashflow,
} from "../services/pedidoCustosServices";
import PedidoCustoAllocator, { PedidoOption, pedidoLabel } from "./pedido/PedidoCustoAllocator";
import { reliableStartOf } from "../utils/salesReport";
import AccountStatementModal from "./AccountStatementModal";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500";

type Props = {
  cashFlow: CashFlowEntry[];
  setCashFlow: React.Dispatch<React.SetStateAction<CashFlowEntry[]>>;
};

// Lançamentos antigos de venda ainda guardam o vínculo como texto embutido
// em subcategory ("quote:<id>"), de antes de existir a coluna orcamento_id
// — aqui só troca o que aparece NA TELA por algo legível, sem alterar o
// dado salvo (a migração de verdade dos registros antigos é separada).
const displaySubcategory = (x: CashFlowEntry): string => {
  const raw = x.subcategory || "";
  const match = raw.match(/^quote:(.+)$/i);
  if (match) return `Venda (Nº ${match[1]})`;
  return raw || "-";
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

const formatTimeBR = (isoCreatedAt?: string) => {
  if (!isoCreatedAt) return "—";
  const d = new Date(isoCreatedAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type CashPlanGroup = {
  title: string;
  items: string[];
};

// agrupa as categorias vindas do banco (cashflow_categories) no mesmo
// formato { categoria: [ { title: grupo, items: [subcategorias] } ] } que a
// tela já usava, mantendo a ordem de sort_order.
const buildPlanFromDb = (rows: CashFlowCategory[]): Record<"Entrada" | "Saída", Record<string, CashPlanGroup[]>> => {
  const plan: Record<"Entrada" | "Saída", Record<string, CashPlanGroup[]>> = { Entrada: {}, Saída: {} };
  for (const row of rows) {
    if (row.active === false) continue;
    const byCategory = plan[row.type] || (plan[row.type] = {});
    const groups = byCategory[row.category] || (byCategory[row.category] = []);
    let group = groups.find((g) => g.title === row.groupTitle);
    if (!group) {
      group = { title: row.groupTitle, items: [] };
      groups.push(group);
    }
    if (!group.items.includes(row.subcategory)) group.items.push(row.subcategory);
  }
  return plan;
};

const CashFlowForm: React.FC<Props> = ({ cashFlow, setCashFlow }) => {
  // -------- Form (Novo lançamento)
  const [entryMode, setEntryMode] = useState<"lancamento" | "transferencia">("lancamento");
  const [type, setType] = useState<CashFlowEntry["type"]>("Entrada");
  const [amount, setAmount] = useState<number>(0);
  const [amountInput, setAmountInput] = useState<string>(formatMoneyInputBR(0));
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [competenciaDate, setCompetenciaDate] = useState("");

  // -------- Transferência entre contas
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferAmountInput, setTransferAmountInput] = useState<string>(formatMoneyInputBR(0));
  const [transferDate, setTransferDate] = useState(todayISO());
  const [transferDescription, setTransferDescription] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);

  // -------- Plano de contas / contas bancárias (config vinda do banco)
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categoriesDb, setCategoriesDb] = useState<CashFlowCategory[]>([]);
  const [cashflowSettings, setCashflowSettings] = useState<CashFlowSettings>({});
  const [savingAccountForRowId, setSavingAccountForRowId] = useState<string | null>(null);
  // Conta cujo extrato mensal está aberto (clique no card de saldo).
  const [statementAccount, setStatementAccount] = useState<BankAccount | null>(null);

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
          <td style="padding:8px 10px">${displaySubcategory(e)}</td>
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

  const cashPlan = useMemo(() => buildPlanFromDb(categoriesDb), [categoriesDb]);

  const categoryOptions = useMemo(
    () => Object.keys(cashPlan[type] ?? {}),
    [cashPlan, type]
  );

  const subcategoryGroups = useMemo(
    () => (category ? cashPlan[type]?.[category] ?? [] : []),
    [cashPlan, type, category]
  );

  const activeAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);

  // saldo de cada conta = saldo inicial + soma dos lançamentos não excluídos
  // vinculados a ela (entrada soma, saída subtrai; transferência também move
  // saldo, já que cada perna é uma linha normal com is_transfer=true).
  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    const cutoffByAccount = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, Number(acc.initialBalance || 0));
      cutoffByAccount.set(acc.id, ymdToTime(acc.initialBalanceDate));
    }
    for (const e of cashFlow) {
      if (!e.accountId) continue;
      const current = map.get(e.accountId);
      if (current === undefined) continue;
      // O saldo inicial representa o saldo no FIM do dia da data de corte —
      // tudo até essa data (inclusive) já está embutido nele; só soma
      // lançamentos com data POSTERIOR à data de corte.
      const cutoff = cutoffByAccount.get(e.accountId);
      const entryTime = ymdToTime(e.date);
      if (!Number.isNaN(cutoff) && !Number.isNaN(entryTime) && entryTime <= (cutoff as number)) continue;
      const val = Number(e.amount || 0);
      map.set(e.accountId, current + (e.type === "Saída" ? -val : val));
    }
    return map;
  }, [accounts, cashFlow]);

  // Só conta lançamentos SEM conta que caem depois da data de corte de pelo
  // menos uma conta ativa — antes disso a conta não entra no saldo de
  // qualquer jeito (nem faria diferença preencher), então não vale alertar.
  const earliestActiveCutoffT = useMemo(() => {
    const times = accounts.filter((a) => a.active).map((a) => ymdToTime(a.initialBalanceDate)).filter((t) => !Number.isNaN(t));
    return times.length > 0 ? Math.min(...times) : NaN;
  }, [accounts]);

  const missingAccountCount = useMemo(
    () =>
      cashFlow.filter((e) => {
        if (e.isTransfer || e.accountId) return false;
        if (Number.isNaN(earliestActiveCutoffT)) return true;
        const t = ymdToTime(e.date);
        return !Number.isNaN(t) && t > earliestActiveCutoffT;
      }).length,
    [cashFlow, earliestActiveCutoffT]
  );

  const findAccountIdByName = (needle: string) =>
    accounts.find((a) => a.name.toLowerCase().includes(needle.toLowerCase()))?.id || "";

  useEffect(() => {
    const loadConfig = async () => {
      const [accRes, catRes, setRes] = await Promise.all([
        getBankAccounts(),
        getCashFlowCategories(),
        getCashFlowSettings(),
      ]);
      if (accRes.ok) setAccounts(accRes.data ?? []);
      if (catRes.ok) setCategoriesDb(catRes.data ?? []);
      if (setRes.ok) setCashflowSettings(setRes.data ?? {});
    };
    loadConfig();
  }, []);

  // -------- Vínculo de custo ao pedido (Etapa 7)
  const reliableStart = reliableStartOf(cashflowSettings);
  const [pedidoOptions, setPedidoOptions] = useState<PedidoOption[]>([]);
  const [pedidoCustos, setPedidoCustos] = useState<PedidoCusto[]>([]);
  const [newAllocations, setNewAllocations] = useState<PedidoCustoAllocation[]>([]);
  const [linkingEntry, setLinkingEntry] = useState<CashFlowEntry | null>(null);
  const [linkingAllocations, setLinkingAllocations] = useState<PedidoCustoAllocation[]>([]);
  const [savingLink, setSavingLink] = useState(false);

  const reloadPedidoCustos = async () => {
    const r = await getPedidoCustos();
    if (r.ok) setPedidoCustos(r.data);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, quote_number, customer_name, approved_at")
        .eq("status", "Aprovado")
        .is("deleted_at", null)
        .order("quote_number", { ascending: false });
      setPedidoOptions(
        (data ?? []).map((q: any) => ({
          id: String(q.id), quoteNumber: q.quote_number ?? undefined, customerName: q.customer_name || "", approvedAt: q.approved_at || undefined,
        }))
      );
    })();
    reloadPedidoCustos();
  }, []);

  const pedidoById = useMemo(() => new Map(pedidoOptions.map((p) => [p.id, p])), [pedidoOptions]);
  const custosByCashflow = useMemo(() => {
    const m = new Map<string, PedidoCusto[]>();
    pedidoCustos.forEach((c) => m.set(c.cashflowId, [...(m.get(c.cashflowId) || []), c]));
    return m;
  }, [pedidoCustos]);

  const newEntryCanLink = canLinkCostToPedido({ type, subcategory, date }, reliableStart);
  const allocatedTotal = (list: PedidoCustoAllocation[]) => list.reduce((s, a) => s + a.amount, 0);

  const openLinkModal = (entry: CashFlowEntry) => {
    setLinkingEntry(entry);
    setLinkingAllocations((custosByCashflow.get(entry.id) || []).map((c) => ({ quoteId: c.quoteId, amount: c.amount })));
  };

  const handleSaveLink = async () => {
    if (!linkingEntry) return;
    if (allocatedTotal(linkingAllocations) > Number(linkingEntry.amount || 0) + 0.005) {
      return alert("A soma dos pedidos passa do valor da saída.");
    }
    setSavingLink(true);
    const r = await setPedidoCustosForCashflow(linkingEntry.id, linkingAllocations);
    setSavingLink(false);
    if (!r.ok) return alert(`Não foi possível salvar o vínculo: ${(r.error as any)?.message ?? "ver console"}`);
    await reloadPedidoCustos();
    setLinkingEntry(null);
  };

  // pré-preenche a conta com o padrão configurado para a forma de pagamento
  // (dinheiro/pix) só em lançamentos manuais de Entrada — Cartão não tem
  // padrão fixo (cada maquininha manda o saldo pra um lugar diferente).
  useEffect(() => {
    if (accountId) return;
    if (type === "Entrada" && subcategory.includes("dinheiro") && cashflowSettings.defaultAccountDinheiro) {
      setAccountId(cashflowSettings.defaultAccountDinheiro);
    } else if (type === "Entrada" && subcategory.includes("pix") && cashflowSettings.defaultAccountPix) {
      setAccountId(cashflowSettings.defaultAccountPix);
    }
  }, [type, subcategory, cashflowSettings]);

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

  // Rede de segurança caso o Realtime do Supabase não esteja habilitado para
  // a tabela "cashflow": ao voltar para esta aba (ex.: depois de fechar uma
  // venda em outra aba) ou reconectar a internet, busca os dados de novo.
  useEffect(() => {
    const refetch = async () => {
      const res = await getCashFlow();
      if (res.ok) setCashFlow(res.data ?? []);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", refetch);
    window.addEventListener("online", refetch);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refetch);
      window.removeEventListener("online", refetch);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setCashFlow]);

  // Mantém o caixa sincronizado em tempo real: qualquer lançamento criado em
  // outra tela (venda fechada, conta paga) ou outra aba/sessão atualiza esta
  // tela automaticamente, em vez de deixar o saldo "preso" no que foi
  // carregado quando a tela abriu.
  useEffect(() => {
    const channel = supabase
      .channel("cashflow-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cashflow" },
        async () => {
          const res = await getCashFlow();
          if (res.ok) setCashFlow(res.data ?? []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setCashFlow]);

  // -------- Reclassificação em lote
  const GENERIC_SUBCATEGORIES = ["outras saídas", "outras receitas não operacionais", "outras receitas operacionais"];
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [genericOnly, setGenericOnly] = useState(false);
  const [bulkType, setBulkType] = useState<CashFlowEntry["type"]>("Saída");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startReviewGenerics = () => {
    setGenericOnly(true);
    setSelectionMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setGenericOnly(false);
    setSelectedIds(new Set());
  };

  const bulkCategoryOptions = useMemo(() => Object.keys(cashPlan[bulkType] ?? {}), [cashPlan, bulkType]);
  const bulkSubcategoryGroups = useMemo(
    () => (bulkCategory ? cashPlan[bulkType]?.[bulkCategory] ?? [] : []),
    [cashPlan, bulkType, bulkCategory]
  );

  const handleApplyBulkReclassify = async () => {
    if (selectedIds.size === 0) return alert("Selecione ao menos um lançamento.");
    if (!bulkCategory || !bulkSubcategory) return alert("Escolha a categoria e a subcategoria de destino.");
    if (!window.confirm(`Trocar a categoria/subcategoria de ${selectedIds.size} lançamento(s)?`)) return;

    const targets = cashFlow.filter((e) => selectedIds.has(e.id));
    if (targets.some((e) => e.type !== bulkType)) {
      return alert(`Os lançamentos selecionados precisam ser todos do tipo "${bulkType}" (a subcategoria de destino é desse tipo).`);
    }

    setApplyingBulk(true);
    try {
      for (const entry of targets) {
        const { id, ...rest } = entry;
        await updateCashFlowEntry(id, {
          ...rest,
          category: bulkCategory.trim().toUpperCase(),
          subcategory: bulkSubcategory.trim().toLowerCase(),
        });
      }
      const refresh = await getCashFlow();
      if (refresh.ok) setCashFlow(refresh.data ?? []);
      exitSelectionMode();
      setBulkCategory("");
      setBulkSubcategory("");
      alert("Reclassificação aplicada ✅");
    } finally {
      setApplyingBulk(false);
    }
  };

  // -------- Helpers de cálculo
  const filtered = useMemo(() => {
    const list = Array.isArray(cashFlow) ? cashFlow : [];
    const q = search.trim().toLowerCase();

    const fromT = fromDate ? ymdToTime(fromDate) : NaN;
    const toT = toDate ? ymdToTime(toDate) : NaN;

    return list.filter((e) => {
      // tipo
      if (filterType !== "Todos" && e.type !== filterType) return false;

      if (genericOnly && !GENERIC_SUBCATEGORIES.includes((e.subcategory || "").toLowerCase())) return false;

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
  }, [cashFlow, filterType, search, fromDate, toDate, genericOnly]);

  const totals = useMemo(() => {
    // Sem nenhum filtro aplicado (visão padrão da tela), o "Saldo" mostrado
    // aqui embaixo precisa bater com a soma dos cards de saldo por conta lá
    // em cima — que já parte do saldo inicial de cada conta, não só da soma
    // bruta de entradas/saídas de TODOS os lançamentos (isso incluía
    // lançamento antigo de antes da data de corte, inflando ou destoando o
    // valor). "Entradas"/"Saídas" aqui acompanham o mesmo recorte (só o que
    // é depois da data de corte de cada conta).
    const noCustomFilter = !fromDate && !toDate && filterType === "Todos" && !search.trim() && !genericOnly;
    if (noCustomFilter) {
      const saldo = Array.from(accountBalances.values()).reduce((s: number, v: number) => s + v, 0);
      let entradas = 0;
      let saidas = 0;
      for (const e of cashFlow) {
        if (e.isTransfer || !e.accountId) continue;
        const acc = accounts.find((a) => a.id === e.accountId);
        if (!acc) continue;
        const cutoff = ymdToTime(acc.initialBalanceDate);
        const t = ymdToTime(e.date);
        if (!Number.isNaN(cutoff) && !Number.isNaN(t) && t <= cutoff) continue;
        const val = Number(e.amount || 0);
        if (e.type === "Saída") saidas += val;
        else entradas += val;
      }
      return { entradas, saidas, saldo };
    }

    let entradas = 0;
    let saidas = 0;

    for (const e of filtered) {
      if (e.isTransfer) continue; // transferência não é receita/despesa, só move saldo entre contas
      const val = Number(e.amount || 0);
      if (e.type === "Saída") saidas += val;
      else entradas += val;
    }

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
    };
  }, [filtered, fromDate, toDate, filterType, search, genericOnly, accountBalances, cashFlow, accounts]);

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
    if (!accountId) return alert("Selecione a conta.");
    const allocationsToSave = newEntryCanLink ? newAllocations : [];
    if (allocatedTotal(allocationsToSave) > Number(amount) + 0.005) {
      return alert("A soma dos pedidos passa do valor da saída.");
    }

    setSaving(true);
    try {
      const payload: Omit<CashFlowEntry, "id"> = {
        type,
        amount: Number(amount),
        category: category.trim().toUpperCase(),
        subcategory: subcategory.trim().toLowerCase(),
        description: description.trim(),
        date, // YYYY-MM-DD
        accountId,
        competenciaDate: type === "Saída" ? competenciaDate || date : undefined,
      };

      const res = await createCashFlowEntry(payload);

      if (!res.ok) {
        console.error("Erro Supabase (caixa):", res.error);
        alert(
          `Erro ao salvar no Supabase: ${(res.error as any)?.message ?? "ver console"}`
        );
        return;
      }

      if (allocationsToSave.length > 0 && res.data) {
        const link = await setPedidoCustosForCashflow(String((res.data as CashFlowEntry).id), allocationsToSave);
        if (!link.ok) {
          alert(`Lançamento salvo, mas o vínculo com o(s) pedido(s) falhou: ${(link.error as any)?.message ?? "ver console"}. Use o botão "Pedidos" na lista para vincular de novo.`);
        }
        await reloadPedidoCustos();
      }
      setNewAllocations([]);

      // busca a lista completa e atualizada do banco (em vez de só somar ao que já
      // estava na memória) para refletir lançamentos feitos em outras abas/sessões
      const refresh = await getCashFlow();
      if (refresh.ok) {
        setCashFlow(refresh.data ?? []);
      } else {
        setCashFlow((prev) => [res.data as CashFlowEntry, ...(prev ?? [])]);
      }

      // limpa form
      setAmount(0);
      setAmountInput(formatMoneyInputBR(0));
      setDescription("");
      setDate(todayISO());
      setType("Entrada");
      setAccountId("");
      setCompetenciaDate("");

      alert("Lançamento salvo ✅");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTransfer = async () => {
    if (savingTransfer) return;
    if (!transferFrom || !transferTo) return alert("Selecione a conta de origem e destino.");
    if (transferFrom === transferTo) return alert("Origem e destino precisam ser contas diferentes.");
    if (!transferAmount || Number(transferAmount) <= 0) return alert("Valor precisa ser maior que 0.");
    if (!transferDate) return alert("Data é obrigatória.");

    setSavingTransfer(true);
    try {
      const res = await createTransfer({
        fromAccountId: transferFrom,
        toAccountId: transferTo,
        amount: Number(transferAmount),
        date: transferDate,
        description: transferDescription.trim(),
      });

      if (!res.ok) {
        console.error("Erro ao salvar transferência:", res.error);
        alert(`Erro ao salvar transferência: ${(res.error as any)?.message ?? "ver console"}`);
        return;
      }

      const refresh = await getCashFlow();
      if (refresh.ok) setCashFlow(refresh.data ?? []);

      setTransferFrom("");
      setTransferTo("");
      setTransferAmount(0);
      setTransferAmountInput(formatMoneyInputBR(0));
      setTransferDate(todayISO());
      setTransferDescription("");

      alert("Transferência registrada ✅");
    } finally {
      setSavingTransfer(false);
    }
  };

  const startQuickTransfer = (fromName: string, toName?: string) => {
    setEntryMode("transferencia");
    setTransferFrom(findAccountIdByName(fromName));
    if (toName) setTransferTo(findAccountIdByName(toName));
  };

  const handleSetRowAccount = async (entry: CashFlowEntry, newAccountId: string) => {
    setSavingAccountForRowId(entry.id);
    try {
      const { id, ...rest } = entry;
      const res = await updateCashFlowEntry(id, { ...rest, accountId: newAccountId });
      if (!res.ok) {
        console.error("Erro ao definir conta do lançamento:", res.error);
        alert(`Erro ao definir conta: ${(res.error as any)?.message ?? "ver console"}`);
        return;
      }
      const refresh = await getCashFlow();
      if (refresh.ok) setCashFlow(refresh.data ?? []);
    } finally {
      setSavingAccountForRowId(null);
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
      {statementAccount && (
        <AccountStatementModal
          account={statementAccount}
          cashFlow={cashFlow}
          onClose={() => setStatementAccount(null)}
        />
      )}
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Caixa</h2>
          <p className="text-gray-600 text-sm">
            Lançamento manual + histórico + filtro por período
          </p>
        </div>

        {entryMode === "lancamento" ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "+ Salvar lançamento"}
          </button>
        ) : (
          <button
            onClick={handleSaveTransfer}
            disabled={savingTransfer}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {savingTransfer ? "Salvando..." : "+ Salvar transferência"}
          </button>
        )}
      </div>

      {/* Saldo por conta */}
      {accounts.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                role="button"
                tabIndex={0}
                onClick={() => setStatementAccount(acc)}
                onKeyDown={(e) => { if (e.key === "Enter") setStatementAccount(acc); }}
                title="Ver extrato da conta"
                className={`border rounded-lg p-3 cursor-pointer hover:border-primary-400 hover:shadow-sm transition ${acc.active ? "" : "opacity-50"}`}
              >
                <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                  {acc.name}{!acc.active && " (inativa)"}
                  {acc.accountType === "reserva" && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase">Reserva</span>
                  )}
                </p>
                <p className="text-base font-bold">{money(accountBalances.get(acc.id) ?? 0)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => startQuickTransfer("Caixa físico", "Banco do Brasil")}
              className="px-3 py-1.5 text-sm bg-gray-100 border rounded-lg hover:bg-gray-200"
            >
              Depositar no BB
            </button>
            <button
              type="button"
              onClick={() => startQuickTransfer("Banco do Brasil")}
              className="px-3 py-1.5 text-sm bg-gray-100 border rounded-lg hover:bg-gray-200"
            >
              Enviar do BB
            </button>
            {accounts.some((a) => a.accountType === "reserva") && (
              <>
                <button
                  type="button"
                  onClick={() => startQuickTransfer("Mercado Pago – Reserva", "Mercado Pago")}
                  className="px-3 py-1.5 text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100"
                >
                  Resgatar da reserva
                </button>
                <button
                  type="button"
                  onClick={() => startQuickTransfer("Mercado Pago", "Mercado Pago – Reserva")}
                  className="px-3 py-1.5 text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100"
                >
                  Guardar na reserva
                </button>
              </>
            )}
            {missingAccountCount > 0 && (
              <span className="px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg">
                {missingAccountCount} lançamento(s) sem conta informada
              </span>
            )}
          </div>
        </div>
      )}

      {/* Alterna entre lançamento manual e transferência entre contas */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setEntryMode("lancamento")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${entryMode === "lancamento" ? "bg-primary-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
        >
          Lançamento
        </button>
        <button
          type="button"
          onClick={() => setEntryMode("transferencia")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${entryMode === "transferencia" ? "bg-primary-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
        >
          Transferência entre contas
        </button>
      </div>

      {/* Form */}
      {entryMode === "lancamento" ? (
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

        <div>
          <label className="block font-medium">Conta</label>
          <select
            className={inputClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {activeAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
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

        {type === "Saída" && (
          <div>
            <label className="block font-medium">Competência</label>
            <input
              type="date"
              className={inputClass}
              value={competenciaDate || date}
              onChange={(e) => setCompetenciaDate(e.target.value)}
            />
          </div>
        )}

        {newEntryCanLink && (
          <div className="md:col-span-4 border border-primary-200 bg-primary-50/40 rounded-xl p-4">
            <label className="block font-medium">Pedido (opcional)</label>
            <p className="text-xs text-gray-500 mb-2">
              Vincule esta saída a um ou mais pedidos, com o valor de cada um. O que não for distribuído fica como estoque geral.
            </p>
            <PedidoCustoAllocator totalAmount={Number(amount) || 0} allocations={newAllocations} onChange={setNewAllocations} pedidos={pedidoOptions} />
          </div>
        )}
      </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block font-medium">Origem</label>
          <select className={inputClass} value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
            <option value="">Selecione...</option>
            {activeAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Destino</label>
          <select className={inputClass} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Selecione...</option>
            {activeAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Valor</label>
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={transferAmountInput}
            onChange={(e) => {
              const rawValue = sanitizeMoneyInputBR(e.target.value);
              setTransferAmountInput(rawValue);
              setTransferAmount(parseMoneyInputBR(rawValue));
            }}
            onBlur={() => setTransferAmountInput(formatMoneyInputBR(transferAmount))}
          />
        </div>
        <div>
          <label className="block font-medium">Data</label>
          <input type="date" className={inputClass} value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block font-medium">Descrição (opcional)</label>
          <input
            className={inputClass}
            value={transferDescription}
            onChange={(e) => setTransferDescription(e.target.value)}
            placeholder="Ex: Depósito no BB"
          />
        </div>
      </div>
      )}

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

      {/* Reclassificação em lote */}
      <div className="flex flex-wrap gap-2 mt-3">
        {!selectionMode ? (
          <>
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="px-3 py-1.5 text-sm bg-gray-100 border rounded-lg hover:bg-gray-200"
            >
              Selecionar vários
            </button>
            <button
              type="button"
              onClick={startReviewGenerics}
              className="px-3 py-1.5 text-sm bg-amber-100 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-200"
            >
              Revisar genéricos
            </button>
          </>
        ) : (
          <div className="w-full bg-primary-50 border border-primary-200 rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-semibold">{selectedIds.size} selecionado(s)</span>
              <button type="button" onClick={exitSelectionMode} className="px-3 py-1 text-xs bg-gray-200 rounded-lg hover:bg-gray-300">
                Sair da seleção
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de destino</label>
                <select className={inputClass} value={bulkType} onChange={(e) => { setBulkType(e.target.value as any); setBulkCategory(""); setBulkSubcategory(""); }}>
                  <option value="Entrada">Entrada</option>
                  <option value="Saída">Saída</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nova categoria</label>
                <select className={inputClass} value={bulkCategory} onChange={(e) => { setBulkCategory(e.target.value); setBulkSubcategory(""); }}>
                  <option value="">Selecione...</option>
                  {bulkCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nova subcategoria</label>
                <select className={inputClass} value={bulkSubcategory} onChange={(e) => setBulkSubcategory(e.target.value)} disabled={bulkSubcategoryGroups.length === 0}>
                  <option value="">Selecione...</option>
                  {bulkSubcategoryGroups.map((group) => (
                    <optgroup key={group.title} label={group.title}>
                      {group.items.map((item) => <option key={item} value={item}>{item}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleApplyBulkReclassify}
                disabled={applyingBulk}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {applyingBulk ? "Aplicando..." : "Aplicar aos selecionados"}
              </button>
            </div>
          </div>
        )}
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
              {selectionMode && <th className="p-3 text-center w-10"></th>}
              <th className="p-3 text-left">Data</th>
              <th className="p-3 text-left">Horário</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Subcategoria</th>
              <th className="p-3 text-left">Descrição</th>
              <th className="p-3 text-left">Conta</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={selectionMode ? 10 : 9} className="p-6 text-center text-gray-500">
                  Nenhum lançamento ainda.
                </td>
              </tr>
            ) : (
              sorted.map((x) => (
                <tr key={x.id} className={`border-t ${selectionMode && selectedIds.has(x.id) ? "bg-primary-50" : ""}`}>
                  {selectionMode && (
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={selectedIds.has(x.id)} onChange={() => toggleSelected(x.id)} />
                    </td>
                  )}
                  <td className="p-3">{formatBR(x.date)}</td>
                  <td className="p-3 text-gray-500">{formatTimeBR(x.createdAt)}</td>
                  <td className="p-3">{x.type}</td>
                  <td className="p-3">{x.category || "-"}</td>
                  <td className="p-3">{displaySubcategory(x)}</td>
                  <td className="p-3">
                    {x.description || "-"}
                    {(custosByCashflow.get(x.id) || []).length > 0 && (
                      <span className="block text-xs text-primary-700 mt-0.5">
                        → {(custosByCashflow.get(x.id) || []).map((c) => `Nº ${pedidoById.get(c.quoteId)?.quoteNumber ?? c.quoteId} (${money(c.amount)})`).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {x.accountId ? (
                      accounts.find((a) => a.id === x.accountId)?.name || "-"
                    ) : (
                      <select
                        className="border border-amber-400 bg-amber-50 rounded px-2 py-1 text-xs"
                        value=""
                        disabled={savingAccountForRowId === x.id}
                        onChange={(e) => e.target.value && handleSetRowAccount(x, e.target.value)}
                      >
                        <option value="">Não informada</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {money(Number(x.amount || 0))}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {canLinkCostToPedido(x, reliableStart) && (
                      <button
                        onClick={() => openLinkModal(x)}
                        className="px-3 py-1 mr-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                        title="Vincular esta saída a pedido(s)"
                      >
                        Pedidos{(custosByCashflow.get(x.id) || []).length > 0 ? ` (${(custosByCashflow.get(x.id) || []).length})` : ""}
                      </button>
                    )}
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

      {linkingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLinkingEntry(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
            <h3 className="text-lg font-semibold">Vincular saída a pedido(s)</h3>
            <p className="text-sm text-gray-500 mb-3">
              {formatBR(linkingEntry.date)} · {linkingEntry.subcategory} · {linkingEntry.description || "-"} · <b>{money(Number(linkingEntry.amount || 0))}</b>
            </p>
            <PedidoCustoAllocator
              totalAmount={Number(linkingEntry.amount || 0)}
              allocations={linkingAllocations}
              onChange={setLinkingAllocations}
              pedidos={pedidoOptions}
            />
            {linkingAllocations.some((a) => !pedidoById.has(a.quoteId)) && (
              <p className="text-xs text-amber-700 mt-2">
                Há vínculo com pedido que não está mais aprovado: {linkingAllocations.filter((a) => !pedidoById.has(a.quoteId)).map((a) => pedidoLabel(pedidoById.get(a.quoteId))).join(", ")}.
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setLinkingEntry(null)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveLink}
                disabled={savingLink}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
              >
                {savingLink ? "Salvando..." : "Salvar vínculo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowForm;
