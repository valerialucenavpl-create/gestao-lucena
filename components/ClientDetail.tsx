import React, { useMemo } from "react";
import { Quote, Sale } from "../types";
import { getSaleStatus, SaleStatus } from "../utils/saleStatus";
import { resolveQuoteUUID } from "../utils/resolveQuoteUUID";

type ClientLite = { id: string; name: string; phone?: string | null; address?: string | null };

type Props = {
  client: ClientLite;
  quotes?: Quote[] | null;
  sales?: Sale[] | null;
  onOpenQuote: (quoteId: string) => void;
  onBack: () => void;
};

const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (value: unknown): string => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const STATUS_STYLES: Record<SaleStatus, string> = {
  Aguardando: "bg-amber-50 text-amber-700 border-amber-200",
  "Pendente em aprovação": "bg-sky-50 text-sky-700 border-sky-200",
  "Entregue – a receber": "bg-orange-50 text-orange-700 border-orange-200",
  Cancelado: "bg-rose-50 text-rose-700 border-rose-200",
  Concluído: "bg-green-50 text-green-700 border-green-200",
};

const ClientDetail: React.FC<Props> = ({ client, quotes, sales, onOpenQuote, onBack }) => {
  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  const getQuote = (quoteId: string) => safeQuotes.find((q) => String(q.id) === String(quoteId));

  // Vendas ligadas a esse cliente — por client_id do orçamento de origem
  // (fallback por nome, pra cadastros antigos sem o vínculo estruturado).
  const clientSales = useMemo(() => {
    const normalizedName = (client.name || "").toLowerCase().trim();
    return safeSales
      .map((sale) => {
        const quoteId = resolveQuoteUUID(sale, safeQuotes);
        const quote = getQuote(quoteId);
        const matchesById = quote && String(quote.clientId) === String(client.id);
        const matchesByName = !quote && (sale.customerName || "").toLowerCase().trim() === normalizedName;
        if (!matchesById && !matchesByName) return null;
        return {
          sale,
          quote,
          quoteId,
          status: getSaleStatus(quote),
          amount: Number((sale as any).amount ?? quote?.totalPrice ?? 0),
          date: (sale as any).saleDate ?? quote?.date,
          quoteNumber: quote?.quoteNumber,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      }) as {
        sale: Sale; quote?: Quote; quoteId: string; status: SaleStatus; amount: number; date: unknown; quoteNumber?: number;
      }[];
  }, [safeSales, safeQuotes, client.id, client.name]);

  const totalComprado = clientSales
    .filter((s) => s.status !== "Cancelado")
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <button onClick={onBack} className="text-primary-700 hover:underline text-sm mb-3 inline-block">
          ← Voltar para Clientes
        </button>
        <h2 className="text-2xl font-bold text-gray-800">{client.name}</h2>
        {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
        {client.address && <p className="text-sm text-gray-500">{client.address}</p>}
        <div className="grid grid-cols-2 gap-4 mt-4 max-w-sm">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-400">Vendas vinculadas</p>
            <p className="text-xl font-bold text-gray-800">{clientSales.length}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-400">Total comprado</p>
            <p className="text-xl font-bold text-green-600">{money(totalComprado)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {clientSales.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Nenhuma venda encontrada para esse cliente.
          </div>
        ) : (
          clientSales.map((row) => (
            <button
              key={String(row.sale.id)}
              type="button"
              onClick={() => row.quoteId && onOpenQuote(row.quoteId)}
              disabled={!row.quoteId}
              className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-primary-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-primary-700">
                    {row.quoteNumber ? `OS #${row.quoteNumber}` : "Venda"}
                  </p>
                  <p className="text-xs text-gray-500">{formatDateBR(row.date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-green-600">{money(row.amount)}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[row.status]}`}>
                    {row.status}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ClientDetail;
