import React, { useEffect, useMemo, useState } from "react";
import { getReceivables } from "../services/receivablesServices";
import { getCashFlow } from "../services/cashFlowServices";
import { CashFlowEntry, Receivable } from "../types";

type ReceivableRow = Receivable & { quoteNumber?: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseDateFlex(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim().slice(0, 10);
  if (!raw) return null;
  const d = new Date(raw + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatBR(value: string): string {
  const d = parseDateFlex(value);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function money(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) added++;
  }
  return result;
}

type StatusFilter = "pending" | "received" | "all";

// ─── Component ───────────────────────────────────────────────────────────────
// Tela só de visualização — o status "recebido" não é mais guardado à parte
// aqui dentro; ele é calculado a partir do que realmente existe no Caixa. Um
// botão "Dar baixa" manual criava um segundo lugar pra marcar "pago",
// independente do Caixa, e os dois ficavam fora de sincronia (uma conta já
// paga no Caixa continuava "Pendente" aqui, ou o contrário quando alguém
// apagava o lançamento do Caixa). Sem esse botão, essa tela só reflete a
// realidade do Caixa — serve pra enxergar o que ainda falta entrar e montar
// a previsão de caixa, não pra registrar pagamento.
const Receivables: React.FC = () => {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    setLoading(true);
    const [receivablesRes, cashFlowRes] = await Promise.all([getReceivables(), getCashFlow()]);
    if (receivablesRes.ok) setRows(receivablesRes.data as ReceivableRow[]);
    if (cashFlowRes.ok) setCashFlow(cashFlowRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Mesmo critério de match usado em QuoteDetail (histórico financeiro do
  // pedido): primeiro tenta pela tag "quote:<id>", senão cai no fallback por
  // número do pedido + nome do cliente na descrição.
  const findPayment = (row: ReceivableRow): CashFlowEntry | undefined => {
    const byTag = cashFlow.find(
      (e) => e.type === "Entrada" && (e as any).subcategory === `quote:${row.quoteId}`
    );
    if (byTag) return byTag;

    const num = row.quoteNumber;
    const name = (row.customerName || "").toLowerCase();
    return cashFlow.find((e) => {
      if (e.type !== "Entrada") return false;
      const desc = (e.description || "").toLowerCase();
      return (num ? desc.includes(String(num)) : false) && (name ? desc.includes(name) : false);
    });
  };

  // Linhas com o status recalculado a partir do Caixa (ignora o campo
  // "status" gravado na tabela — ele só serve de estado inicial até o
  // primeiro lançamento de caixa aparecer).
  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const payment = findPayment(row);
      if (payment) {
        return { ...row, status: "received" as const, receivedAt: payment.date };
      }
      return { ...row, status: "pending" as const, receivedAt: undefined };
    });
  }, [rows, cashFlow]);

  // ─── Filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return computedRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (dateFrom && r.dueDate < dateFrom) return false;
      if (dateTo && r.dueDate > dateTo) return false;
      return true;
    });
  }, [computedRows, statusFilter, dateFrom, dateTo]);

  const totalPending = useMemo(
    () => computedRows.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.amount, 0),
    [computedRows]
  );

  const totalReceived = useMemo(
    () => computedRows.filter((r) => r.status === "received").reduce((sum, r) => sum + r.amount, 0),
    [computedRows]
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-2xl font-bold text-gray-800">Contas a Receber</h3>
        <p className="text-sm text-gray-500 mt-1">
          Gerado automaticamente quando um orçamento é aprovado. Prazo de recebimento segue a
          data de entrega (PIX/Dinheiro) ou o próximo dia útil da venda (Cartão). O status "Recebido"
          reflete direto o Caixa — só visualização, não dá pra dar baixa por aqui.
        </p>
      </div>

      {/* TOTAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Total a Receber</p>
          <p className="text-2xl font-bold text-red-600">{money(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Já Recebido</p>
          <p className="text-2xl font-bold text-green-600">{money(totalReceived)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Qtd. Pendentes</p>
          <p className="text-2xl font-bold text-gray-800">
            {computedRows.filter((r) => r.status === "pending").length}
          </p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex gap-2">
            {([
              { key: "pending", label: "Pendentes" },
              { key: "received", label: "Recebidos" },
              { key: "all", label: "Todos" },
            ] as { key: StatusFilter; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-2 text-sm rounded-lg border ${
                  statusFilter === opt.key
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prazo de</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LISTA */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400">
          Nenhuma conta a receber encontrada para o filtro selecionado.
        </div>
      ) : (
        <>
          {/* TABLE — desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">OS #</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Pagamento</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Prazo Receb.</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const today = toISO(new Date());
                  const isOverdue = row.status === "pending" && row.dueDate && row.dueDate < today;
                  const isSoon =
                    row.status === "pending" &&
                    row.dueDate &&
                    row.dueDate >= today &&
                    row.dueDate <= toISO(addBusinessDays(new Date(), 3));

                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary-700 font-semibold">
                        #{row.quoteNumber ?? row.quoteId.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.customerName}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700">{money(row.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{row.paymentMethod}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isOverdue
                              ? "bg-red-100 text-red-700"
                              : isSoon
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {formatBR(row.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "received" ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Recebido {row.receivedAt ? `em ${formatBR(row.receivedAt)}` : ""}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                            Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CARDS — mobile */}
          <div className="md:hidden space-y-3">
            {filtered.map((row) => {
              const today = toISO(new Date());
              const isOverdue = row.status === "pending" && row.dueDate && row.dueDate < today;

              return (
                <div key={row.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-primary-700 font-semibold">
                      OS #{row.quoteNumber ?? row.quoteId.slice(-6).toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isOverdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      Prazo: {formatBR(row.dueDate)}
                    </span>
                  </div>
                  <p className="font-bold text-gray-800">{row.customerName}</p>
                  <p className="text-lg font-bold text-gray-700">{money(row.amount)}</p>
                  <p className="text-xs text-gray-500">{row.paymentMethod}</p>
                  {row.status === "received" ? (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      Recebido {row.receivedAt ? `em ${formatBR(row.receivedAt)}` : ""}
                    </span>
                  ) : (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                      Pendente
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Receivables;
