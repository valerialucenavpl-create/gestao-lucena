import React, { useEffect, useMemo, useState } from "react";
import { getReceivables } from "../services/receivablesServices";
import { getCashFlow } from "../services/cashFlowServices";
import { getQuotes } from "../services/quotesServices";
import { getSales } from "../services/salesServices";
import { supabase } from "../services/supabase";
import { CashFlowEntry, Quote, Receivable } from "../types";
import { getSaleStatus } from "../utils/saleStatus";
import { CreditoFornecedor, getCreditosFornecedor } from "../services/pedidoAjustesServices";

type ReceivableRow = Receivable & { quoteNumber?: number; awaitingDelivery?: boolean };

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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplierCredits, setSupplierCredits] = useState<CreditoFornecedor[]>([]);
  const [cancelledQuoteIds, setCancelledQuoteIds] = useState<Set<string>>(new Set());

  // Repete a consulta enquanto vier vazia sem erro — um array vazio sem
  // erro é o sintoma clássico de RLS filtrando tudo porque o token de auth
  // ainda não tinha sido anexado no primeiro request logo após o login (o
  // mesmo problema já corrigido em App.tsx para produtos/matéria-prima).
  // Sem isso, cashFlow ficava vazio pra sempre nessa tela e TODA conta
  // aparecia como "Pendente", mesmo as que já tinham pagamento no Caixa.
  const fetchWithRetry = async <T,>(
    run: () => Promise<{ ok: boolean; data?: T[] | null }>,
    attempts = 4
  ): Promise<T[]> => {
    let lastData: T[] = [];
    for (let i = 0; i < attempts; i++) {
      const result = await run();
      if (result.ok && Array.isArray(result.data) && result.data.length > 0) return result.data;
      if (result.ok && Array.isArray(result.data)) lastData = result.data;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
    return lastData;
  };

  const load = async () => {
    setLoading(true);
    const [receivablesData, cashFlowData, quotesRes, salesRes] = await Promise.all([
      fetchWithRetry(() => getReceivables() as Promise<{ ok: boolean; data?: ReceivableRow[] | null }>),
      fetchWithRetry(() => getCashFlow() as Promise<{ ok: boolean; data?: CashFlowEntry[] | null }>),
      getQuotes(),
      getSales(),
    ]);
    // Cancelar uma venda só marca a VENDA (o pedido continua "Aprovado"), então
    // o título gerado na aprovação continuava aqui como pendente. Filtra na
    // tela (não apaga nada): se a venda for reativada, o título volta sozinho.
    setCancelledQuoteIds(
      new Set((salesRes.ok ? salesRes.data : []).filter((s) => s.status === "Cancelado").map((s) => String(s.quote_id)))
    );
    setRows(receivablesData);
    setCashFlow(cashFlowData);
    if ((quotesRes as any)?.ok) setQuotes((quotesRes as any).data ?? []);
    const creditsRes = await getCreditosFornecedor();
    setSupplierCredits(creditsRes.ok ? creditsRes.data.filter((c) => c.status === "Pendente") : []);
    setLoading(false);
  };

  useEffect(() => {
    load();

    // Atualiza sozinho quando um pagamento é registrado em outra tela (ex.:
    // "Finanças do Pedido" em Orçamentos/Vendas) — sem isso, quem já estava
    // com essa tela aberta só via a baixa depois de sair e voltar (ou dar
    // F5), mesmo com o pagamento já valendo no Caixa.
    const channel = supabase
      .channel(`realtime-receivables-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cashflow" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "receivables" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Só pelo vínculo direto (subcategory "quote:<id>") — o fallback por nome
  // do cliente + número do pedido que existia aqui misturava pagamentos de
  // OUTRO pedido do mesmo cliente (cliente com várias OS acumulava/marcava
  // como recebido com base no lançamento errado).
  //
  // Uma venda pode ter mais de um lançamento (sinal + restante), então soma
  // tudo que já entrou no Caixa em vez de considerar "recebido" assim que
  // aparece o primeiro pagamento — senão um sinal parcial escondia o
  // restante que ainda falta receber.
  const findPayments = (row: ReceivableRow): CashFlowEntry[] => {
    // orcamentoId é o vínculo estruturado novo; subcategory "quote:<id>" é
    // o formato antigo (embutido em texto) — mantido como fallback até os
    // lançamentos antigos serem migrados.
    return cashFlow.filter(
      (e) =>
        e.type === "Entrada" &&
        (String((e as any).orcamentoId ?? "") === String(row.quoteId) ||
          (e as any).subcategory === `quote:${row.quoteId}`)
    );
  };

  // Linhas com o status e o valor recalculados a partir do Caixa (ignora o
  // campo "status" gravado na tabela — ele só serve de estado inicial até o
  // primeiro lançamento de caixa aparecer). O valor exibido é sempre o que
  // ainda falta receber (total do orçamento - soma do que já caiu no Caixa).
  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const cancelled = cancelledQuoteIds.has(String(row.quoteId));
      const payments = findPayments(row);
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const remaining = Math.max(0, row.amount - totalPaid);
      const lastPaymentDate = payments.length
        ? payments.reduce((latest, p) => (p.date > latest ? p.date : latest), payments[0].date)
        : undefined;

      const quote = quotes.find((q) => String(q.id) === String(row.quoteId));
      // Enquanto a venda estiver "Aguardando" (aprovada, ainda não entregue),
      // o título é só uma previsão — não vence de verdade até a entrega.
      const saleStatus = getSaleStatus(quote);
      const awaitingDelivery = saleStatus === "Aguardando";
      // O nome gravado no título é uma cópia de quando o pedido foi aprovado
      // e não acompanha correções (ex.: pedidos salvos como "Cliente
      // Desconhecido" e depois corrigidos) — vale o nome atual do pedido.
      const customerName = quote?.customerName || row.customerName;

      if (remaining <= 0.005 && totalPaid > 0) {
        return { ...row, customerName, status: "received" as const, receivedAt: lastPaymentDate, awaitingDelivery };
      }
      // Venda cancelada: o que faltava receber não é mais devido.
      if (cancelled) return null;
      return { ...row, customerName, amount: remaining, status: "pending" as const, receivedAt: undefined, awaitingDelivery };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [rows, cashFlow, quotes, cancelledQuoteIds]);

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

  // ─── Vencidos / a vencer ───────────────────────────────────────────────────
  const overdueRows = useMemo(() => {
    const today = toISO(new Date());
    return computedRows.filter((r) => r.status === "pending" && !r.awaitingDelivery && r.dueDate && r.dueDate < today);
  }, [computedRows]);

  const totalOverdue = overdueRows.reduce((s, r) => s + r.amount, 0);

  // Recebimentos futuros: só as faixas de até 30 e 31–60 dias (o que passa
  // disso não é usado no dia a dia).
  const upcoming = useMemo(() => {
    const today = toISO(new Date());
    const todayT = new Date(today + "T00:00:00").getTime();
    let upTo30 = 0;
    let upTo60 = 0;
    computedRows.forEach((r) => {
      if (r.status !== "pending" || !r.dueDate || r.dueDate < today) return;
      const days = Math.round((new Date(r.dueDate + "T00:00:00").getTime() - todayT) / 86400000);
      if (days <= 30) upTo30 += r.amount;
      else if (days <= 60) upTo60 += r.amount;
    });
    return { upTo30, upTo60 };
  }, [computedRows]);

  const overdueByClient = useMemo(() => {
    const map = new Map<string, number>();
    overdueRows.forEach((r) => map.set(r.customerName, (map.get(r.customerName) || 0) + r.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [overdueRows]);

  const [showOverdueDetail, setShowOverdueDetail] = useState(false);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-2xl font-bold text-gray-800">Contas a Receber</h3>
        <p className="text-sm text-gray-500 mt-1">
          Gerado automaticamente quando um orçamento é aprovado. Prazo de recebimento segue a
          data de entrega (PIX/Dinheiro) ou o próximo dia útil da venda (Cartão). O valor e o status
          refletem direto o Caixa: se só uma parte já foi paga, aqui aparece o restante que ainda
          falta receber — não dá pra dar baixa por aqui.
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

      {/* CRÉDITOS COM FORNECEDOR (lançados em Finanças do Pedido → Despesas) */}
      {supplierCredits.length > 0 && (
        <div className="bg-white rounded-xl border border-sky-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-base font-bold text-gray-800">Créditos a receber de fornecedores</h4>
              <p className="text-xs text-gray-500">Pendentes — marque como recebido dentro do pedido (Finanças do Pedido → Despesas).</p>
            </div>
            <p className="text-lg font-bold text-sky-600">{money(supplierCredits.reduce((s, c) => s + c.valor, 0))}</p>
          </div>
          <div className="divide-y">
            {supplierCredits.map((c) => {
              const q = quotes.find((qq) => String(qq.id) === c.pedidoId);
              return (
                <div key={c.id} className="flex items-center justify-between py-2 text-sm gap-3">
                  <div>
                    <span className="text-xs font-mono text-primary-700 font-semibold mr-2">OS #{q?.quoteNumber ?? c.pedidoId}</span>
                    <span className="font-semibold text-gray-800">{c.fornecedor}</span>
                    {c.motivo && <span className="text-gray-500"> — {c.motivo}</span>}
                  </div>
                  <span className="font-bold text-sky-600 whitespace-nowrap">{money(c.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VENCIDOS / A VENCER */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-bold text-gray-800">Vencidos e a Vencer</h4>
          <button
            type="button"
            onClick={() => setShowOverdueDetail((v) => !v)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {showOverdueDetail ? "Ocultar vencidos por cliente" : "Ver vencidos por cliente"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg p-3 text-center border border-red-200 bg-red-50">
            <p className="text-xs font-semibold text-red-700">Total vencido</p>
            <p className="text-lg font-bold text-red-600">{money(totalOverdue)}</p>
          </div>
          <div className="rounded-lg p-3 text-center border border-green-200 bg-green-50">
            <p className="text-xs font-semibold text-green-700">A vencer — até 30 dias</p>
            <p className="text-lg font-bold text-green-600">{money(upcoming.upTo30)}</p>
          </div>
          <div className="rounded-lg p-3 text-center border border-green-200 bg-green-50">
            <p className="text-xs font-semibold text-green-700">A vencer — 31 a 60 dias</p>
            <p className="text-lg font-bold text-green-600">{money(upcoming.upTo60)}</p>
          </div>
        </div>
        {showOverdueDetail && (
          <div className="mt-4 border-t pt-3 space-y-1">
            {overdueByClient.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">Nenhuma conta vencida.</p>
            ) : (
              overdueByClient.map(([client, amount]) => (
                <div key={client} className="flex justify-between text-sm py-1">
                  <span className="text-gray-700">{client}</span>
                  <span className="font-semibold text-red-600">{money(amount)}</span>
                </div>
              ))
            )}
          </div>
        )}
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
                  const isOverdue = row.status === "pending" && !row.awaitingDelivery && row.dueDate && row.dueDate < today;
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
                        ) : row.awaitingDelivery ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                            A receber na entrega
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
              const isOverdue = row.status === "pending" && !row.awaitingDelivery && row.dueDate && row.dueDate < today;

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
                  ) : row.awaitingDelivery ? (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                      A receber na entrega
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
