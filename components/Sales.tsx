import React, { useEffect, useMemo, useState } from "react";
import { CashFlowEntry, Client, Quote, Sale, User } from "../types";
import { deleteSale } from "../services/salesServices";
import { updateQuote } from "../services/quotesServices";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";

// Key for localStorage: stores IDs of virtual sales (from quotes) that were deleted
const DELETED_VIRTUAL_KEY = "deleted_virtual_sales";

function getDeletedVirtualIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_VIRTUAL_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedVirtualId(id: string) {
  try {
    const set = getDeletedVirtualIds();
    set.add(id);
    localStorage.setItem(DELETED_VIRTUAL_KEY, JSON.stringify([...set]));
  } catch {}
}

interface SalesProps {
  currentUser?: User | null;
  sales?: Sale[] | null;
  quotes?: Quote[] | null;
  clients?: Client[] | null;
  cashFlow?: CashFlowEntry[] | null;
  onOpenQuote?: (quoteId: string) => void;
  onDeleteSale?: (saleId: string) => void;
}
type FastStatus =
  | "Todos"
  | "Aguardando"
  | "Pendente em aprovação"
  | "Cancelado"
  | "Aprovado"
  | "Concluindo";

type SaleWithComputed = Sale & {
  computedStatus: Exclude<FastStatus, "Todos">;
};

const statusOrder: FastStatus[] = [
  "Todos",
  "Aguardando",
  "Pendente em aprovação",
  "Cancelado",
  "Aprovado",
  "Concluindo",
];

const statusStyles: Record<Exclude<FastStatus, "Todos">, string> = {
  Aguardando: "bg-amber-50 text-amber-700 border-amber-200",
  "Pendente em aprovação": "bg-sky-50 text-sky-700 border-sky-200",
  Cancelado: "bg-rose-50 text-rose-700 border-rose-200",
  Aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Concluindo: "bg-violet-50 text-violet-700 border-violet-200",
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
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function getOSNumber(sale: Sale): string {
  const raw = toSafeText((sale as any).quoteId || (sale as any).id);
  const onlyDigits = raw.replace(/\D/g, "");
  return onlyDigits || raw;
}

function mapFastStatusToSaleStatus(status: Exclude<FastStatus, "Todos">): string {
  if (status === "Pendente em aprovação") return "Pendente";
  if (status === "Concluindo") return "Concluído";
  return status;
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
const Sales: React.FC<SalesProps> = ({ currentUser, sales, quotes, cashFlow, onOpenQuote, onDeleteSale }) => {
  const isAdmin = currentUser?.role === "Admin";
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeCashFlow = Array.isArray(cashFlow) ? cashFlow : [];

  const [filterStatus, setFilterStatus] = useState<FastStatus>("Todos");
  const [localSales, setLocalSales] = useState<Sale[]>(safeSales);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<SaleWithComputed | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editAmountInput, setEditAmountInput] = useState<string>(formatMoneyInputBR(0));
  const [editDate, setEditDate] = useState<string>("");
  const [editStatus, setEditStatus] = useState<Exclude<FastStatus, "Todos">>("Aguardando");

  useEffect(() => {
    const deletedIds = getDeletedVirtualIds();
    // Always use DB sales — filter out locally-deleted IDs for this session
    setLocalSales(
      safeSales.filter((s) => !deletedIds.has(String((s as any).id)))
    );
  }, [safeSales]);

  const getQuote = (quoteId: string) => safeQuotes.find((q: any) => String(q.id) === String(quoteId));
  const getFinancialInfo = (sale: Sale) => {
     const saleDate = toDate(getSaleDate(sale));
    const saleDateMs = saleDate ? saleDate.getTime() : null;

    const payments = safeCashFlow.filter((entry: any) => {
      if (entry.type !== "Entrada") return false;

       const desc = toSafeText(entry.description).toLowerCase();
      const quote = getQuote(getSaleQuoteId(sale));
      const customer = getSaleCustomerName(sale, quote).toLowerCase();
      if (customer && !desc.includes(customer)) return false;

      const entryDate = toDate(entry.date);
      if (!entryDate) return false;
      if (saleDateMs === null) return true;
      return entryDate.getTime() >= saleDateMs;
    });

    const totalPaidRaw = payments.reduce((sum, p: any) => sum + (Number(p.amount) || 0), 0);
    const saleAmount = getSaleAmount(sale);

    const totalPaid = Math.min(totalPaidRaw, saleAmount);
    const percentage = saleAmount > 0 ? (totalPaid / saleAmount) * 100 : 0;

   return { totalPaid, percentage };
  };

const getComputedStatus = (sale: Sale): Exclude<FastStatus, "Todos"> => {
    const explicitStatus = toSafeText((sale as any).status);
    if (explicitStatus === "Cancelado") return "Cancelado";
    if (explicitStatus === "Pendente") return "Pendente em aprovação";


     const quote = getQuote(getSaleQuoteId(sale));
    if (quote?.status === "Recusado") return "Cancelado";
    if (quote?.status === "Pendente") return "Pendente em aprovação";

    const { percentage } = getFinancialInfo(sale);
    if (percentage >= 99.9) return "Concluindo";
    if (percentage > 0) return "Aprovado";
    return "Aguardando";
  };

  const computedSales = useMemo<SaleWithComputed[]>(
    () =>
      localSales.map((sale) => ({
        ...sale,
        computedStatus: getComputedStatus(sale),
      })),
    [localSales, safeQuotes, safeCashFlow]
  );

  const statusCount = useMemo(() => {
    const base: Record<FastStatus, number> = {
      Todos: computedSales.length,
      Aguardando: 0,
      "Pendente em aprovação": 0,
      Cancelado: 0,
      Aprovado: 0,
      Concluindo: 0,
    };

    computedSales.forEach((sale) => {
      base[sale.computedStatus] += 1;
    });

    return base;
  }, [computedSales]);
  const filteredSales = useMemo(() => {
     if (filterStatus === "Todos") return computedSales;
    return computedSales.filter((sale) => sale.computedStatus === filterStatus);
  }, [computedSales, filterStatus]);

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

  const saveEdit = () => {
    if (!editingSale) return;

    setLocalSales((prev) => {
      const next = prev.map((sale) => {
        if ((sale as any).id !== (editingSale as any).id) return sale;
        return {
          ...sale,
          amount: Number(editAmount) || 0,
          saleDate: editDate ? (new Date(`${editDate}T00:00:00`) as any) : sale.saleDate,
          status: mapFastStatusToSaleStatus(editStatus) as any,
        } as Sale;
      });

      // Persiste os status no localStorage
      try {
        const statuses: Record<string, string> = {};
        next.forEach((s: any) => { if (s.id && s.status) statuses[s.id] = s.status; });
        localStorage.setItem("local_sales_statuses", JSON.stringify(statuses));
      } catch {}

      return next;
    });

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
      const result = await updateQuote(quoteId, { status: "Recusado" });
      if (!result.ok) {
        alert(`Não foi possível excluir: ${(result.error as any)?.message ?? "ver console"}`);
        return;
      }
    }

    if (isVirtual) {
      // Virtual sale (generated from quote) — persist deletion in localStorage
      addDeletedVirtualId(saleId);
    } else {
      // Real DB sale — delete from Supabase
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

      <div className="space-y-3">
        {filteredSales.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Nenhuma venda encontrada para este filtro.
          </div>
        ) : (
          filteredSales.map((sale) => (
            <div
              key={(sale as any).id}
              className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              style={{ zIndex: menuOpenId === (sale as any).id ? 20 : undefined }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div
                  className={onOpenQuote && resolveQuoteUUID(sale, safeQuotes) ? "cursor-pointer" : ""}
                  onClick={() => { const uid = resolveQuoteUUID(sale, safeQuotes); if (onOpenQuote && uid) onOpenQuote(uid); }}
                >
                  <p className="text-sm font-semibold text-primary-700">OS #{getOSNumber(sale)}</p>
                  <p className="text-sm text-gray-500">Data da compra: {formatDateBR(getSaleDate(sale))}</p>
                  <h4 className="text-lg font-bold text-gray-800 hover:text-primary-700 transition-colors">
                    {getSaleCustomerName(sale, getQuote(resolveQuoteUUID(sale, safeQuotes))) || "Cliente não identificado"}
                  </h4>
                  <p className="text-xs text-gray-400">
                    Vendedora: {getSaleSalesperson(sale, getQuote(resolveQuoteUUID(sale, safeQuotes))) || "—"}
                  </p>
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

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpenId((prev) => (prev === (sale as any).id ? null : (sale as any).id))}
                      className="h-9 w-9 rounded-full border border-gray-300 font-bold text-gray-600 hover:bg-gray-50"
                      title="Ações"
                    >
                      ⋮
                    </button>

                    {menuOpenId === (sale as any).id && (
                      <div className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg">
                        {onOpenQuote && resolveQuoteUUID(sale, safeQuotes) && (
                          <button
                            type="button"
                            onClick={() => { onOpenQuote(resolveQuoteUUID(sale, safeQuotes)); setMenuOpenId(null); }}
                            className="w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
                          >
                            Ver detalhes
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
          ))
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
    </div>
  );
};

export default Sales;
