import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons/Icon";
import { View, QuoteInternalStatus } from "../types";
import { supabase } from "../services/supabase";
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
}

const STATUS_STYLE: Record<QuoteInternalStatus, string> = {
  Pedido: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  "Na Produção": "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "Aguardando Material": "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  "Falta Entregar": "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  Entregue: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
};

const DeliverySectorDetail: React.FC<DeliverySectorDetailProps> = ({ sector, setActiveView }) => {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);

      const [quotesRes, clientsRes, productsRes] = await Promise.all([
        supabase.from("quotes").select("*").is("deleted_at", null).order("date", { ascending: false }),
        supabase.from("clients").select("*").is("deleted_at", null),
        supabase.from("products").select("*"),
      ]);

      setQuotes(Array.isArray(quotesRes.data) ? quotesRes.data : []);
      setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setLoading(false);
    };

    loadAll();
  }, []);

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

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
          <p className="text-sm text-gray-400">Carregando entregas...</p>
        </div>
      ) : entries.length === 0 ? (
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
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-md divide-y divide-gray-100 dark:divide-gray-700">
          {entries.map((entry) => (
            <div key={entry.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                  {entry.clientName}
                </p>
                {entry.clientPhone && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{entry.clientPhone}</p>
                )}
                {entry.productLabel && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{entry.productLabel}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{entry.clientAddress}</p>
              </div>

              <div className="flex items-center gap-4 md:gap-6 shrink-0">
                <div className="text-right">
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

                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    STATUS_STYLE[(entry.internalStatus as QuoteInternalStatus) || "Pedido"] || STATUS_STYLE.Pedido
                  }`}
                >
                  {entry.internalStatus || "Pedido"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeliverySectorDetail;
