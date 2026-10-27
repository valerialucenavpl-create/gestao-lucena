import React, { useEffect, useMemo, useState } from "react";
import { CashFlowEntry, Client, Quote, Sale, User } from "../types";
import { createSale, deleteSale, updateSale } from "../services/salesServices";
import { updateQuote } from "../services/quotesServices";
import { createQuoteHistoryEntry } from "../services/quoteHistoryServices";
import { updateReceivableDueDate } from "../services/receivablesServices";
import { getSaleStatus } from "../utils/saleStatus";
import DateInputModal from "./common/DateInputModal";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";

interface SalesProps {
  currentUser?: User | null;
  sales?: Sale[] | null;
  quotes?: Quote[] | null;
  clients?: Client[] | null;
  cashFlow?: CashFlowEntry[] | null;
  onOpenQuote?: (quoteId: string) => void;
  onDeleteSale?: (saleId: string) => void;
  onUpdateQuote?: (u: any) => void | Promise<void>;
  // Filtros de mês/período/status/busca levantados pro App.tsx — assim a
  // tela mantém a posição de onde a usuária estava quando ela abre o
  // detalhamento de uma venda e clica em "Voltar", em vez de sempre voltar
  // pro mês atual.
  monthCursor: Date;
  setMonthCursor: React.Dispatch<React.SetStateAction<Date>>;
  dateRangeStart: string;
  setDateRangeStart: React.Dispatch<React.SetStateAction<string>>;
  dateRangeEnd: string;
  setDateRangeEnd: React.Dispatch<React.SetStateAction<string>>;
  filterStatus: FastStatus;
  setFilterStatus: React.Dispatch<React.SetStateAction<FastStatus>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
}
type FastStatus =
  | "Todos"
  | "Aguardando"
  | "Pendente em aprovação"
  | "Entregue – a receber"
  | "Cancelado"
  | "Concluído";

type SaleWithComputed = Sale & {
  computedStatus: Exclude<FastStatus, "Todos">;
};

const statusOrder: FastStatus[] = [
  "Todos",
  "Aguardando",
  "Pendente em aprovação",
  "Entregue – a receber",
  "Cancelado",
  "Concluído",
];

const statusStyles: Record<Exclude<FastStatus, "Todos">, string> = {
  Aguardando: "bg-amber-50 text-amber-700 border-amber-200",
  "Pendente em aprovação": "bg-sky-50 text-sky-700 border-sky-200",
  "Entregue – a receber": "bg-orange-50 text-orange-700 border-orange-200",
  Cancelado: "bg-rose-50 text-rose-700 border-rose-200",
  Concluído: "bg-green-50 text-green-700 border-green-200",
};

// Borda fina do card inteiro seguindo a mesma cor do status, pra diferenciar
// de relance (verde = concluído, laranja = entregue mas ainda a receber).
const cardBorderStyles: Record<Exclude<FastStatus, "Todos">, string> = {
  Aguardando: "border-amber-200",
  "Pendente em aprovação": "border-sky-200",
  "Entregue – a receber": "border-orange-300",
  Cancelado: "border-rose-200",
  Concluído: "border-green-300",
};

function toDate(value: unknown): Date | null {

  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toSafeText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? ""))
      .join(" ")
      .trim();
  }

  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDateBR(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  // Datas de venda/orçamento são salvas como meia-noite UTC (dia "puro",
  // sem hora) — usar toLocaleDateString (hora local) volta um dia em fusos
  // atrás de UTC (Brasil inteiro), fazendo uma venda do dia 1 aparecer como
  // dia 31 do mês anterior. getUTC* lê o dia exatamente como foi salvo.
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

// Nº da OS = número do orçamento (quoteNumber) — NÃO o id interno do banco.
// Antes mostrava sale.quoteId (id da linha em quotes), que só coincidia com o
// número nos pedidos mais antigos; ex.: o pedido de id 102 (Aqcua Lavanderia)
// aparecia como "OS #102", sendo que a OS 102 de verdade é outro pedido.
function getOSNumber(sale: Sale, quote?: Quote): string {
  if (quote?.quoteNumber != null) return String(quote.quoteNumber);
  const raw = toSafeText((sale as any).quoteId || (sale as any).id);
  const onlyDigits = raw.replace(/\D/g, "");
  return onlyDigits || raw;
}

function getSaleQuoteId(sale: any): string {
  return toSafeText(sale?.quoteId ?? sale?.quote_id);
}

/** Encontra o UUID real do orçamento, mesmo quando o sale vem do banco com quote_id numérico */
function resolveQuoteUUID(sale: any, quotes: Quote[]): string {
  // 1. quoteId direto — comparado como texto (id de venda virtual vem como
  // number vindo do banco, e comparação estrita number !== string sempre
  // falhava aqui, mesmo quando era exatamente o mesmo orçamento)
  const directId = toSafeText(sale?.quoteId);
  if (directId) {
    // devolve o id no formato ORIGINAL do orçamento (não força texto) —
    // o resto do app (ex.: App.tsx ao abrir o orçamento) compara esse id
    // com "===" contra quotes.id, que pode ser number (bigint) ou string
    const byId = quotes.find((q) => toSafeText(q.id) === directId);
    if (byId) return byId.id;
  }

  // 2. quote_id numérico → tenta bater com quoteNumber
  const qNum = sale?.quote_id;
  if (qNum != null) {
    const byNum = quotes.find((q) => Number(q.quoteNumber) === Number(qNum));
    if (byNum) return byNum.id;
  }

  // 3. fallback: bate pelo nome do cliente — usa toSafeText (com trim) dos
  // dois lados, senão um espaço a mais digitado no cadastro do orçamento
  // já quebra a comparação
  const customer = toSafeText(sale?.customerName ?? sale?.customer_name).toLowerCase();
  if (customer) {
    const byName = quotes.find((q) => toSafeText(q.customerName).toLowerCase() === customer);
    if (byName) return byName.id;
  }

  return "";
}

  function getSaleDate(sale: any): unknown {
  return sale?.saleDate ?? sale?.date;
}

function getSaleAmount(sale: any): number {
  return Number(sale?.amount ?? sale?.total ?? 0) || 0;
}

  function getSaleCustomerName(sale: any, quote?: Quote): string {
  return toSafeText(sale?.customerName) || toSafeText(quote?.customerName);
}

function getSaleSalesperson(sale: any, quote?: Quote): string {
  return toSafeText(sale?.salesperson) || toSafeText(quote?.salesperson);
}
const Sales: React.FC<SalesProps> = ({
  currentUser,
  sales,
  quotes,
  clients,
  cashFlow,
  onOpenQuote,
  onDeleteSale,
  onUpdateQuote,
  monthCursor,
  setMonthCursor,
  dateRangeStart,
  setDateRangeStart,
  dateRangeEnd,
  setDateRangeEnd,
  filterStatus,
  setFilterStatus,
  searchTerm,
  setSearchTerm,
}) => {
  const isAdmin = currentUser?.role === "Admin";
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeCashFlow = Array.isArray(cashFlow) ? cashFlow : [];

  const [localSales, setLocalSales] = useState<Sale[]>(safeSales);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<SaleWithComputed | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editAmountInput, setEditAmountInput] = useState<string>(formatMoneyInputBR(0));
  const [editDate, setEditDate] = useState<string>("");
  const [editStatus, setEditStatus] = useState<Exclude<FastStatus, "Todos">>("Aguardando");

  useEffect(() => {
    setLocalSales(safeSales);
  }, [safeSales]);

  const getQuote = (quoteId: string) => safeQuotes.find((q: any) => String(q.id) === String(quoteId));

const getComputedStatus = (sale: Sale): Exclude<FastStatus, "Todos"> => {
    const explicitStatus = toSafeText((sale as any).status);
    if (explicitStatus === "Cancelado") return "Cancelado";
    if (explicitStatus === "Pendente") return "Pendente em aprovação";

    const quote = getQuote(getSaleQuoteId(sale));
    return getSaleStatus(quote);
  };

  // Ordem de cadastro — usada como desempate quando duas vendas caem no
  // mesmo dia (o id do orçamento é sequencial, então o último cadastrado
  // fica em cima entre os empates).
  const getRegistrationKey = (sale: any): number => {
    const quoteId = Number(sale?.quoteId);
    if (Number.isFinite(quoteId) && quoteId > 0) return quoteId;
    const digits = String(sale?.id ?? "").replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  };

  // Ordena pela data da compra (mais recente primeiro) — uma venda lançada
  // hoje precisa aparecer no topo mesmo que o orçamento dela tenha um número
  // mais antigo que outras já cadastradas. Sem data válida, cai pro fim.
  const getDateKey = (sale: any): number => {
    const d = toDate(getSaleDate(sale));
    return d ? d.getTime() : -Infinity;
  };

  const computedSales = useMemo<SaleWithComputed[]>(
    () =>
      localSales
        .map((sale) => ({
          ...sale,
          computedStatus: getComputedStatus(sale),
        }))
        .sort((a, b) => getDateKey(b) - getDateKey(a) || getRegistrationKey(b) - getRegistrationKey(a)),
    [localSales, safeQuotes, safeCashFlow]
  );

  // Filtro por data específica (De/Até) tem prioridade sobre o mês em
  // exibição — se algum dos dois campos estiver preenchido, ignora o
  // monthCursor e usa o intervalo digitado (aberto de um dos lados se só um
  // campo tiver valor).
  const periodFilteredSales = useMemo(() => {
    const hasDateRange = Boolean(dateRangeStart || dateRangeEnd);
    // Datas de venda são salvas como meia-noite UTC (dia "puro", sem hora) —
    // ler com getMonth()/getFullYear() (hora local) volta um dia em fusos
    // atrás de UTC (Brasil inteiro), fazendo uma venda do dia 1 "escorregar"
    // pro mês anterior. getUTC* lê o dia exatamente como foi salvo. O filtro
    // De/Até usa o mesmo raciocínio, comparando só a parte UTC da data.
    const rangeStart = dateRangeStart ? `${dateRangeStart}` : null;
    const rangeEnd = dateRangeEnd ? `${dateRangeEnd}` : null;

    return computedSales.filter((sale) => {
      const d = toDate(getSaleDate(sale));
      if (!d) return false;
      const isoDay = d.toISOString().slice(0, 10);
      if (hasDateRange) {
        if (rangeStart && isoDay < rangeStart) return false;
        if (rangeEnd && isoDay > rangeEnd) return false;
        return true;
      }
      return d.getUTCFullYear() === monthCursor.getFullYear() && d.getUTCMonth() === monthCursor.getMonth();
    });
  }, [computedSales, monthCursor, dateRangeStart, dateRangeEnd]);

  const statusCount = useMemo(() => {
    const base: Record<FastStatus, number> = {
      Todos: periodFilteredSales.length,
      Aguardando: 0,
      "Pendente em aprovação": 0,
      "Entregue – a receber": 0,
      Cancelado: 0,
      Concluído: 0,
    };

    periodFilteredSales.forEach((sale) => {
      base[sale.computedStatus] += 1;
    });

    return base;
  }, [periodFilteredSales]);

  const statusFilteredSales = useMemo(() => {
     if (filterStatus === "Todos") return periodFilteredSales;
    return periodFilteredSales.filter((sale) => sale.computedStatus === filterStatus);
  }, [periodFilteredSales, filterStatus]);

  // Busca por nome do cliente ou número da OS — ignora acentos/caixa e
  // não depende do filtro por período/status (busca dentro do que já está
  // filtrado, pra ficar coerente com os cards de contagem acima).
  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return statusFilteredSales;
    return statusFilteredSales.filter((sale) => {
      const quote = getQuote(getSaleQuoteId(sale));
      const customerName = getSaleCustomerName(sale, quote).toLowerCase();
      const osNumber = getOSNumber(sale, quote).toLowerCase();
      return customerName.includes(term) || osNumber.includes(term);
    });
  }, [statusFilteredSales, searchTerm, safeQuotes]);

  const monthLabel = monthCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const goToPrevMonth = () =>
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const clearDateRange = () => {
    setDateRangeStart("");
    setDateRangeEnd("");
  };

  const openEdit = (sale: SaleWithComputed) => {
    setEditingSale(sale);
    const saleAmount = getSaleAmount(sale);
    setEditAmount(saleAmount);
    setEditAmountInput(formatMoneyInputBR(saleAmount));
    const date = toDate(getSaleDate(sale));
    setEditDate(date ? date.toISOString().slice(0, 10) : "");
    setEditStatus(sale.computedStatus);
    setMenuOpenId(null);
  };

  // Status não tem coluna própria em "sales" — quem manda de verdade é o
  // orçamento de origem (quote.status/saleCompleted). Antes essa edição só
  // gravava em localStorage, então "cancelar" uma venda só escondia ela no
  // navegador de quem clicou, e continuava aparecendo como Aprovado pra
  // qualquer outro login/dispositivo.
  // Registra no "Ver histórico do pedido" quem mudou a entrega/status da venda
  // — o banco só guarda a DATA da entrega, não quem marcou.
  const logSaleEvent = (quoteId: string, type: string, label: string, description: string) => {
    const quote = getQuote(quoteId);
    if (!quote) return;
    createQuoteHistoryEntry(quoteId, quote, type, label, {
      description,
      userName: currentUser?.name || "",
    }).catch((err) => console.error("Erro ao registrar histórico:", err));
  };

  const persistStatusToQuote = async (status: Exclude<FastStatus, "Todos">) => {
    if (!editingSale || !onUpdateQuote) {
      alert("Não foi possível localizar o orçamento de origem dessa venda. Nada foi alterado.");
      return false;
    }
    const quoteId = resolveQuoteUUID(editingSale, safeQuotes);
    if (!quoteId) {
      alert("Não foi possível localizar o orçamento de origem dessa venda. Nada foi alterado.");
      return false;
    }

    const updates: Record<string, unknown> = { id: quoteId };
    if (status === "Cancelado") {
      updates.status = "Recusado";
    } else if (status === "Pendente em aprovação") {
      updates.status = "Pendente";
    } else if (status === "Aguardando") {
      updates.status = "Aprovado";
      updates.saleCompleted = false;
      updates.deliveredAt = null;
    } else if (status === "Entregue – a receber") {
      const quote = getQuote(getSaleQuoteId(editingSale));
      updates.status = "Aprovado";
      updates.saleCompleted = false;
      updates.deliveredAt = quote?.deliveredAt || new Date().toISOString().slice(0, 10);
    } else {
      // "Concluído"
      const quote = getQuote(getSaleQuoteId(editingSale));
      updates.status = "Aprovado";
      updates.saleCompleted = true;
      updates.deliveredAt = quote?.deliveredAt || new Date().toISOString().slice(0, 10);
    }
    const result: any = await onUpdateQuote(updates);
    if (result && result.ok === false) {
      alert(`Não foi possível salvar: ${result.error?.message ?? "ver console"}`);
      return false;
    }
    logSaleEvent(quoteId, "status_venda", "Status da venda", `Status da venda alterado para "${status}"`);
    return true;
  };

  // "Cancelado" é status da VENDA, não do orçamento — cancelar não deve
  // "devolver" a venda pro orçamento (mudando pra Recusado); o orçamento
  // continua exatamente como estava, só a venda fica marcada Cancelada e
  // continua aparecendo na lista de Vendas. Usado tanto pelo botão direto
  // "Cancelar venda" no menu de 3 pontinhos quanto pelo modal de editar.
  const cancelSale = async (sale: any, amountOverride?: number, dateOverride?: string) => {
    const rawId = sale.id;
    const isRealSale = !String(rawId).startsWith("quote-");
    let saleId = rawId;

    if (!isRealSale) {
      // Venda ainda "virtual" (nunca gerada de verdade) — precisa existir
      // uma linha real pra gravar o cancelamento nela.
      const quoteId = resolveQuoteUUID(sale, safeQuotes);
      if (!quoteId) {
        alert("Não foi possível localizar o orçamento de origem dessa venda. Nada foi alterado.");
        return false;
      }
      // Preserva a data original da venda — sem isso, createSale() caía no
      // padrão "hoje" e a venda cancelada sumia da tela porque pulava pro
      // mês atual em vez de continuar no mês em que ela realmente foi feita.
      const existingDate = toDate(getSaleDate(sale));
      const created = await createSale({
        quote_id: Number(quoteId),
        total: amountOverride || getSaleAmount(sale),
        date: dateOverride
          ? new Date(`${dateOverride}T00:00:00`).toISOString()
          : existingDate?.toISOString(),
      });
      if (!created.ok || !created.data) {
        alert("Não foi possível cancelar a venda: " + (created.error?.message ?? "erro desconhecido"));
        return false;
      }
      saleId = String((created.data as any).id);
    }

    const r = await updateSale(Number(saleId), { status: "Cancelado" });
    if (!r.ok) {
      alert("Não foi possível cancelar a venda: " + (r.error?.message ?? "erro desconhecido"));
      return false;
    }

    // Registra o cancelamento no "Ver histórico do pedido" da própria
    // venda/orçamento — não trava o cancelamento se isso falhar (ex.:
    // tabela de histórico ainda não criada), só avisa no console.
    const quoteId = getSaleQuoteId(sale) || resolveQuoteUUID(sale, safeQuotes);
    const quote = getQuote(quoteId);
    if (quoteId && quote) {
      createQuoteHistoryEntry(quoteId, quote, "cancel", "Venda cancelada").catch((err) =>
        console.error("Erro ao registrar histórico de cancelamento:", err)
      );
    }

    setLocalSales((prev) => {
      const withoutOld = prev.filter((s) => (s as any).id !== rawId);
      const newSale: Sale = {
        id: saleId,
        quoteId: getSaleQuoteId(sale) || resolveQuoteUUID(sale, safeQuotes),
        customerName: sale.customerName || "",
        salesperson: sale.salesperson || "",
        saleDate: dateOverride ? (new Date(`${dateOverride}T00:00:00`) as any) : sale.saleDate,
        amount: amountOverride || getSaleAmount(sale),
        status: "Cancelado" as any,
      };
      return [...withoutOld, newSale];
    });
    return true;
  };

  const handleCancelSale = async (sale: SaleWithComputed) => {
    if (
      !window.confirm(
        "Cancelar esta venda? O orçamento de origem NÃO é alterado (continua Aprovado) — só a venda fica marcada como Cancelada e continua aparecendo na lista."
      )
    ) {
      return;
    }
    setMenuOpenId(null);
    await cancelSale(sale);
  };

  // "Voltar para orçamento" — desfaz a venda: o orçamento de origem volta pra
  // Pendente (reaparece em Orçamentos pra ser editado e aprovado de novo) e a
  // linha real em "sales", se existir, é apagada. O recebível pendente é
  // cancelado pelo gatilho do banco quando o orçamento deixa de ser Aprovado.
  // Pagamentos já lançados no Caixa NÃO são mexidos — só avisa.
  const handleReturnToQuote = async (sale: SaleWithComputed) => {
    if (!isAdmin) {
      alert("Somente o Admin pode voltar uma venda para orçamento.");
      return;
    }
    const quoteId = resolveQuoteUUID(sale, safeQuotes);
    const quote = quoteId ? getQuote(quoteId) : undefined;
    if (!quoteId || !quote || !onUpdateQuote) {
      alert("Não foi possível localizar o orçamento de origem dessa venda. Nada foi alterado.");
      return;
    }

    const recebido = safeCashFlow
      .filter((e) => e.type === "Entrada" && !e.isTransfer && String(e.orcamentoId) === String(quote.id))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const avisoPagamento =
      recebido > 0
        ? `\n\nATENÇÃO: já existem R$ ${recebido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} recebidos no Caixa para este pedido. Esses lançamentos NÃO serão apagados — ajuste no Caixa se precisar.`
        : "";
    if (
      !window.confirm(
        `Cancelar esta venda e voltar para orçamento?\n\nA venda sai da lista de Vendas e o orçamento Nº ${quote.quoteNumber ?? ""} volta para "Pendente" em Orçamentos, podendo ser editado e aprovado de novo.${avisoPagamento}`
      )
    ) {
      return;
    }
    setMenuOpenId(null);

    const result: any = await onUpdateQuote({
      id: quoteId,
      status: "Pendente",
      saleCompleted: false,
      deliveredAt: null,
    });
    if (result && result.ok === false) {
      alert(`Não foi possível voltar para orçamento: ${result.error?.message ?? "ver console"}`);
      return;
    }

    const rawId = String((sale as any).id);
    if (!rawId.startsWith("quote-")) {
      const numericId = Number(rawId);
      if (!isNaN(numericId)) {
        const r = await deleteSale(numericId);
        if (!r.ok) {
          alert("O orçamento voltou para Pendente, mas não foi possível apagar o registro da venda. Exclua a venda manualmente.");
        }
      }
    }

    logSaleEvent(quoteId, "status_venda", "Voltou para orçamento", "Venda cancelada e orçamento voltou para Pendente");

    setLocalSales((prev) => prev.filter((s: any) => String(s.id) !== rawId));
    onDeleteSale?.(rawId);
    onOpenQuote?.(quoteId);
  };

  // "Marcar como entregue" — pede a data real (aceita retroativa); se o
  // pagamento já estiver 100%, conclui direto; se sobrar saldo, só ajusta o
  // vencimento do título que já existe em Contas a Receber (não cria outro).
  const [markingDeliveredId, setMarkingDeliveredId] = useState<string | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkDeliveredDate, setBulkDeliveredDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [applyingBulkDelivered, setApplyingBulkDelivered] = useState(false);

  const handleApplyBulkDelivered = async () => {
    if (bulkSelected.size === 0) return;
    if (!window.confirm(`Marcar ${bulkSelected.size} venda(s) como entregue em ${new Date(bulkDeliveredDate + "T00:00:00").toLocaleDateString("pt-BR")}?`)) return;
    setApplyingBulkDelivered(true);
    try {
      const targets = computedSales.filter((s) => bulkSelected.has(String((s as any).id)));
      for (const sale of targets) {
        await handleMarkDelivered(sale, bulkDeliveredDate, true);
      }
      setBulkSelected(new Set());
      setBulkSelectMode(false);
    } finally {
      setApplyingBulkDelivered(false);
    }
  };
  const [pendingDeliverySale, setPendingDeliverySale] = useState<any | null>(null);
  const [pendingDueDate, setPendingDueDate] = useState<{ quoteId: string; defaultDate: string; saldo: number } | null>(null);

  const handleMarkDelivered = async (sale: any, deliveryDate: string, skipDueDatePrompt?: boolean) => {
    if (!onUpdateQuote) return;
    const uid = resolveQuoteUUID(sale, safeQuotes);
    const quote = getQuote(uid);
    if (!uid || !quote) {
      alert("Não foi possível localizar o orçamento de origem dessa venda.");
      return;
    }

    const recebido = safeCashFlow
      .filter((e) => e.type === "Entrada" && !e.isTransfer && String(e.orcamentoId) === String(quote.id))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalPago100 = recebido >= Number(quote.totalPrice || 0) - 0.005;

    setMarkingDeliveredId(String(sale.id));
    try {
      const updates: any = { id: uid, deliveredAt: deliveryDate };
      if (totalPago100) {
        updates.saleCompleted = true;
        updates.concludedAt = deliveryDate;
      }
      const result: any = await onUpdateQuote(updates);
      if (result && result.ok === false) {
        alert(`Não foi possível marcar como entregue: ${result.error?.message ?? "ver console"}`);
        return;
      }
      logSaleEvent(
        uid,
        "entrega",
        "Entregue",
        `Marcada como entregue em ${formatDateBR(deliveryDate + "T00:00:00Z")}${totalPago100 ? " (pagamento 100% → concluída)" : ""}`
      );

      if (!totalPago100 && !skipDueDatePrompt) {
        const saldo = Math.max(0, Number(quote.totalPrice || 0) - recebido);
        setPendingDueDate({ quoteId: uid, defaultDate: deliveryDate, saldo });
      }
    } finally {
      setMarkingDeliveredId(null);
      setMenuOpenId(null);
    }
  };

  const saveEdit = async () => {
    if (!editingSale) return;

    const rawId = (editingSale as any).id;
    const isRealSale = !String(rawId).startsWith("quote-");

    if (editStatus === "Cancelado") {
      const ok = await cancelSale(editingSale, editAmount, editDate);
      if (ok) setEditingSale(null);
      return;
    }

    // Qualquer outro status continua batendo no orçamento, como antes.
    const ok = await persistStatusToQuote(editStatus);
    if (!ok) return;

    // Data/valor só existem de verdade numa linha real da tabela "sales"
    // (id numérico) — uma venda "virtual" (derivada do orçamento aprovado,
    // id "quote-<id>") ainda não tem registro próprio pra gravar. Antes
    // essa edição só mudava a tela na hora e sumia ao recarregar, mesmo
    // pra vendas reais, porque nunca chamava updateSale de verdade.
    if (isRealSale) {
      const r = await updateSale(Number(rawId), {
        date: editDate ? new Date(`${editDate}T00:00:00`).toISOString() : undefined,
        total: Number(editAmount) || undefined,
        // Limpa um cancelamento anterior, caso a venda estivesse Cancelada
        // e a usuária tenha trocado pra outro status agora.
        status: null,
      });
      if (!r.ok) {
        alert("Não foi possível salvar a data/valor da venda: " + (r.error?.message ?? "erro desconhecido"));
        return;
      }
    } else if (editDate) {
      alert(
        "Essa venda ainda não tem um registro próprio (foi aprovado no orçamento, mas ninguém clicou em \"Gerar Venda\"). O status foi salvo, mas a data não pode ser alterada até a venda ser gerada de verdade."
      );
    }

    setLocalSales((prev) =>
      prev.map((sale) => {
        if ((sale as any).id !== rawId) return sale;
        return {
          ...sale,
          amount: Number(editAmount) || 0,
          saleDate: editDate ? (new Date(`${editDate}T00:00:00`) as any) : sale.saleDate,
          status: "" as any,
        } as Sale;
      })
    );

    setEditingSale(null);
  };

  const handleDelete = async (saleId: string) => {
    // Excluir venda é ação exclusiva de Admin — vendedoras podem excluir
    // orçamentos livremente (inclusive testes), mas não vendas já aprovadas.
    if (!isAdmin) {
      alert("Somente o Admin pode excluir uma venda.");
      return;
    }

    const ok = window.confirm("Deseja realmente excluir esta venda? O orçamento de origem será marcado como Recusado, e a conta a receber pendente correspondente será cancelada automaticamente.");
    if (!ok) return;

    setMenuOpenId(null);

    const isVirtual = saleId.startsWith("quote-");

    // Marca o orçamento de origem como Recusado — é o que faz a exclusão
    // valer de verdade no banco (não só sumir da tela) e o que cancela
    // automaticamente a conta a receber pendente (gatilho já existente).
    // Usa resolveQuoteUUID (mais robusto que getSaleQuoteId sozinho — cobre
    // quote_id numérico e fallback por nome do cliente) porque uma venda
    // "virtual" que não conseguisse achar o orçamento ficava invisível na
    // tela (removida daqui) mas continuava Aprovada no banco pra sempre.
    const sale = localSales.find((s: any) => String(s.id) === saleId);
    const quoteId = sale ? resolveQuoteUUID(sale, safeQuotes) : "";
    const quote = quoteId ? getQuote(quoteId) : undefined;

    if (isVirtual && !quote) {
      alert(
        "Não foi possível encontrar o orçamento de origem dessa venda pra marcar como Recusado. " +
          "Nada foi alterado — abra o orçamento correspondente em Orçamentos e recuse por lá."
      );
      return;
    }

    if (quote && quote.status === "Aprovado") {
      // Usa onUpdateQuote (não a função updateQuote importada direto) pra
      // também atualizar o estado "quotes" guardado no App — senão o app
      // continua achando esse orçamento Aprovado na memória e a venda
      // "virtual" (derivada de orçamentos aprovados) volta a aparecer na
      // tela assim que qualquer outra ação disparar um recálculo da lista.
      if (onUpdateQuote) {
        const result: any = await onUpdateQuote({ id: quoteId, status: "Recusado" });
        if (result && result.ok === false) {
          alert(`Não foi possível excluir: ${result.error?.message ?? "ver console"}`);
          return;
        }
      } else {
        const result = await updateQuote(quoteId, { status: "Recusado" });
        if (!result.ok) {
          alert(`Não foi possível excluir: ${(result.error as any)?.message ?? "ver console"}`);
          return;
        }
      }
    }

    if (!isVirtual) {
      // Real DB sale — delete from Supabase (venda virtual já foi resolvida
      // marcando o orçamento como Recusado acima, o que a esconde pra
      // qualquer pessoa/dispositivo assim que recarregar — sem depender de
      // localStorage, que só escondia no navegador de quem clicou).
      const numericId = Number(saleId);
      if (!isNaN(numericId)) {
        const result = await deleteSale(numericId);
        if (!result.ok) {
          alert("Erro ao excluir venda. Tente novamente.");
          return;
        }
      }
    }

    // Remove from local state immediately
    setLocalSales((prev) => prev.filter((sale: any) => String(sale.id) !== saleId));
    // Notify parent to update its sales list
    onDeleteSale?.(saleId);
  };


  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-3xl font-bold text-gray-800">Painel de Vendas</h3>
          <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            Layout novo ativo
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">Acompanhe vendas por status e gerencie rapidamente.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex justify-center">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do cliente ou N° da OS..."
            className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div />

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={goToPrevMonth}
              disabled={Boolean(dateRangeStart || dateRangeEnd)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Mês anterior"
            >
              ‹
            </button>
            <div className="px-6 py-2 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 font-semibold capitalize min-w-[180px] text-center">
              {monthLabel}
            </div>
            <button
              type="button"
              onClick={goToNextMonth}
              disabled={Boolean(dateRangeStart || dateRangeEnd)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Próximo mês"
            >
              ›
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-start md:justify-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">De</label>
              <input
                type="date"
                value={dateRangeStart}
                onChange={(e) => setDateRangeStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Até</label>
              <input
                type="date"
                value={dateRangeEnd}
                onChange={(e) => setDateRangeEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800"
              />
            </div>
            {(dateRangeStart || dateRangeEnd) && (
              <button
                type="button"
                onClick={clearDateRange}
                className="px-3 py-1.5 text-sm font-semibold text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50"
              >
                Limpar e voltar pro mês
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statusOrder.map((status) => {
          const active = filterStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                active
                  ? "border-primary-600 bg-primary-600 text-white shadow"
                  : "border-gray-200 bg-white hover:border-primary-300"
              }`}
            >
              <p className={`text-xs font-semibold uppercase ${active ? "text-blue-100" : "text-gray-500"}`}>{status}</p>
              <p className={`text-2xl font-bold ${active ? "text-white" : "text-gray-800"}`}>{statusCount[status]}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!bulkSelectMode ? (
          <button
            type="button"
            onClick={() => setBulkSelectMode(true)}
            className="px-3 py-1.5 text-sm bg-gray-100 border rounded-lg hover:bg-gray-200"
          >
            Marcar várias como entregues
          </button>
        ) : (
          <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
            <span className="text-sm font-semibold">{bulkSelected.size} selecionada(s)</span>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data de entrega</label>
              <input type="date" value={bulkDeliveredDate} onChange={(e) => setBulkDeliveredDate(e.target.value)} className="border rounded-lg px-2 py-1 text-sm" />
            </div>
            <button
              type="button"
              onClick={handleApplyBulkDelivered}
              disabled={applyingBulkDelivered || bulkSelected.size === 0}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
            >
              {applyingBulkDelivered ? "Aplicando..." : "Marcar selecionadas como entregues"}
            </button>
            <button type="button" onClick={() => { setBulkSelectMode(false); setBulkSelected(new Set()); }} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {filteredSales.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Nenhuma venda encontrada para este filtro.
          </div>
        ) : (
          filteredSales.map((sale) => {
            const uid = resolveQuoteUUID(sale, safeQuotes);
            const quote = getQuote(uid);
            return (
            <div
              key={(sale as any).id}
              role={onOpenQuote && uid ? "button" : undefined}
              tabIndex={onOpenQuote && uid ? 0 : undefined}
              onClick={() => { if (onOpenQuote && uid) onOpenQuote(uid); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                if (onOpenQuote && uid) { e.preventDefault(); onOpenQuote(uid); }
              }}
              className={`relative rounded-xl border bg-white p-4 shadow-sm ${cardBorderStyles[sale.computedStatus]} ${
                onOpenQuote && uid ? "cursor-pointer hover:shadow-md transition-shadow" : ""
              }`}
              style={{ zIndex: menuOpenId === (sale as any).id ? 20 : undefined }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex items-start gap-2">
                  {bulkSelectMode && sale.computedStatus === "Aguardando" && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                      checked={bulkSelected.has(String((sale as any).id))}
                      onChange={(e) => {
                        setBulkSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(String((sale as any).id));
                          else next.delete(String((sale as any).id));
                          return next;
                        });
                      }}
                    />
                  )}
                  <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-700">OS #{getOSNumber(sale, quote)}</p>
                  <p className="text-sm text-gray-500">Data da compra: {formatDateBR(getSaleDate(sale))}</p>
                  <h4 className="text-lg font-bold text-gray-800 hover:text-primary-700 transition-colors">
                    {getSaleCustomerName(sale, quote) || "Cliente não identificado"}
                  </h4>
                  <p className="text-xs text-gray-400">
                    Vendedora: {getSaleSalesperson(sale, quote) || "—"}
                  </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs uppercase text-gray-500">Valor</p>
                    <p className="text-xl font-bold text-green-600">
                      {getSaleAmount(sale).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[sale.computedStatus]}`}>
                    {sale.computedStatus}
                  </span>

                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setMenuOpenId((prev) => (prev === (sale as any).id ? null : (sale as any).id))}
                      className="h-9 w-9 rounded-full border border-gray-300 font-bold text-gray-600 hover:bg-gray-50"
                      title="Ações"
                    >
                      ⋮
                    </button>

                    {menuOpenId === (sale as any).id && (
                      <div className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-gray-200 bg-white shadow-lg">
                        {onOpenQuote && resolveQuoteUUID(sale, safeQuotes) && (
                          <button
                            type="button"
                            onClick={() => { onOpenQuote(resolveQuoteUUID(sale, safeQuotes)); setMenuOpenId(null); }}
                            className="w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
                          >
                            Ver detalhes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(sale)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Editar venda
                        </button>
                        {sale.computedStatus !== "Cancelado" && (
                          <button
                            type="button"
                            onClick={() => handleCancelSale(sale)}
                            className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                          >
                            Cancelar venda
                          </button>
                        )}
                        {isAdmin && resolveQuoteUUID(sale, safeQuotes) && (
                          <button
                            type="button"
                            onClick={() => handleReturnToQuote(sale)}
                            className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                          >
                            Cancelar e voltar p/ orçamento
                          </button>
                        )}
                        {isAdmin && resolveQuoteUUID(sale, safeQuotes) && sale.computedStatus === "Aguardando" && (
                          <button
                            type="button"
                            onClick={() => setPendingDeliverySale(sale)}
                            disabled={markingDeliveredId === String(sale.id)}
                            className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            {markingDeliveredId === String(sale.id) ? "Marcando..." : "Marcar como entregue"}
                          </button>
                        )}
                        {isAdmin && resolveQuoteUUID(sale, safeQuotes) && (sale.computedStatus === "Entregue – a receber" || sale.computedStatus === "Concluído") && (
                          <button
                            type="button"
                            onClick={async () => {
                              const uid = resolveQuoteUUID(sale, safeQuotes);
                              if (onUpdateQuote) {
                                const r: any = await onUpdateQuote({ id: uid, saleCompleted: false, deliveredAt: null });
                                if (!(r && r.ok === false)) logSaleEvent(uid, "entrega", "Entrega desfeita", "Entrega desfeita — venda voltou para em aberto");
                              }
                              setMenuOpenId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Desfazer entrega
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete((sale as any).id)}
                            className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );})
        )}
      </div>

      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <h4 className="text-lg font-bold text-gray-800">Editar venda</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700">Data</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Valor</label>
              <input
                type="text"
                inputMode="decimal"
                value={editAmountInput}
                onChange={(e) => {
                  const rawValue = sanitizeMoneyInputBR(e.target.value);
                  setEditAmountInput(rawValue);
                  setEditAmount(parseMoneyInputBR(rawValue));
                }}
                onBlur={() => setEditAmountInput(formatMoneyInputBR(editAmount))}
                className="mt-1 w-full rounded border p-2"
              />
            </div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as Exclude<FastStatus, "Todos">)}
                className="mt-1 w-full rounded border p-2"
              >
                {statusOrder
                  .filter((status) => status !== "Todos")
                  .map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
              </select>   
               <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="rounded border border-gray-300 px-4 py-2 text-gray-700"
              >
                Cancelar
              </button>
              <button type="button" onClick={saveEdit} className="rounded bg-primary-600 px-4 py-2 text-white">
                Salvar
              </button>
              </div>
          </div>
        </div>
      )}

      {pendingDeliverySale && (
        <DateInputModal
          title="Marcar como entregue"
          message="Data real da entrega/retirada:"
          defaultValue={new Date().toISOString().slice(0, 10)}
          confirmLabel="Marcar entregue"
          onConfirm={(date) => {
            const sale = pendingDeliverySale;
            setPendingDeliverySale(null);
            handleMarkDelivered(sale, date);
          }}
          onCancel={() => setPendingDeliverySale(null)}
        />
      )}

      {pendingDueDate && (
        <DateInputModal
          title="Vencimento do título"
          message={`Venda ficou "Entregue – a receber" (saldo de ${pendingDueDate.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Confirme ou ajuste o vencimento em Contas a Receber:`}
          defaultValue={pendingDueDate.defaultDate}
          confirmLabel="Salvar vencimento"
          onConfirm={async (date) => {
            const info = pendingDueDate;
            setPendingDueDate(null);
            if (!info) return;
            const r = await updateReceivableDueDate(info.quoteId, date);
            if (!r.ok) console.error("Erro ao ajustar vencimento do título:", r.error);
          }}
          onCancel={() => setPendingDueDate(null)}
        />
      )}
    </div>
  );
};

export default Sales;
