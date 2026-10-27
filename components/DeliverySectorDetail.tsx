import React, { useMemo } from "react";
import { Icon } from "./icons/Icon";
import { View, QuoteInternalStatus, Quote, Client, Product } from "../types";
import {
  DeliverySector,
  SECTOR_LABELS,
  SECTOR_DOT_COLORS,
  buildDeliveryEntriesBySector,
  formatDateShort,
} from "../utils/deliveryEntries";
import { formatMoneyInputBR } from "../utils/money";

interface DeliverySectorDetailProps {
  sector: DeliverySector;
  setActiveView: (view: View) => void;
  onOpenQuote?: (quoteId: string) => void;
  // Usa os dados já carregados no App (mesma fonte da Sales/Quotes) em vez
  // de buscar tudo de novo no Supabase a cada clique num setor — a busca
  // própria daqui era o motivo da demora pra abrir a página.
  quotes: Quote[];
  clients: Client[];
  products: Product[];
}

const STATUS_STYLE: Record<QuoteInternalStatus, string> = {
  Pedido: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  "Na Produção": "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "Aguardando Material": "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  "Falta Entregar": "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  Entregue: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
};

const DeliverySectorDetail: React.FC<DeliverySectorDetailProps> = ({
  sector,
  setActiveView,
  onOpenQuote,
  quotes,
  clients,
  products,
}) => {
  const entries = useMemo(() => {
    const buckets = buildDeliveryEntriesBySector(quotes, clients, products);
    return (buckets[sector] || []).filter((entry) => entry.isPending);
  }, [quotes, clients, products, sector]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${SECTOR_DOT_COLORS[sector]}`} />
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            Entregas pendentes — {SECTOR_LABELS[sector]}
          </h2>
        </div>

        <button
          onClick={() => setActiveView("dashboard")}
          className="flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline"
        >
          <Icon className="w-4 h-4">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </Icon>
          Voltar ao painel
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-md p-10 flex flex-col items-center justify-center text-center gap-2">
          <Icon className="w-10 h-10 text-gray-300 dark:text-gray-600">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 12l2 2 4-4" />
          </Icon>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
            Nenhuma entrega pendente
          </p>
          <p className="text-sm text-gray-400">
            Não há entregas pendentes para o setor {SECTOR_LABELS[sector]}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              role={onOpenQuote && entry.quoteId ? "button" : undefined}
              tabIndex={onOpenQuote && entry.quoteId ? 0 : undefined}
              onClick={() => {
                if (onOpenQuote && entry.quoteId) onOpenQuote(entry.quoteId);
              }}
              onKeyDown={(e) => {
                if (!onOpenQuote || !entry.quoteId) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenQuote(entry.quoteId);
                }
              }}
              className={`flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-800 ${
                onOpenQuote && entry.quoteId
                  ? "cursor-pointer hover:border-primary-300 hover:shadow-lg transition-all dark:hover:border-primary-600"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                  {entry.clientName}
                </p>
                <span
                  className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                    STATUS_STYLE[(entry.internalStatus as QuoteInternalStatus) || "Pedido"] || STATUS_STYLE.Pedido
                  }`}
                >
                  {entry.internalStatus || "Pedido"}
                </span>
              </div>

              {entry.clientPhone && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{entry.clientPhone}</p>
              )}
              {entry.productLabel && (
                <p className="text-xs text-gray-600 dark:text-gray-300">{entry.productLabel}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">{entry.clientAddress}</p>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                <div>
                  <p className="text-[11px] uppercase text-gray-400 dark:text-gray-500">Previsão</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {formatDateShort(entry.deliveryDate)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] uppercase text-gray-400 dark:text-gray-500">Valor</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">
                    R$ {formatMoneyInputBR(entry.totalPrice)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeliverySectorDetail;
