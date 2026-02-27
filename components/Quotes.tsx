import React, { useMemo } from "react";
import { Icon } from "./icons/Icon";
import { Quote, View } from "../types";

interface QuotesProps {
  quotes?: Quote[]; // <- pode vir undefined em runtime
  setActiveView: (view: View, id?: string) => void;
}

const Quotes: React.FC<QuotesProps> = ({ quotes, setActiveView }) => {
  // garante sempre array
  const safeQuotes = useMemo(() => (Array.isArray(quotes) ? quotes : []), [quotes]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Orçamentos</h1>

        <button
          onClick={() => setActiveView("newQuote")}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Icon className="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Novo Orçamento
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-gray-700">
          <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {safeQuotes.map((q) => (
              <tr key={q.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{q.id}</td>
                <td className="px-4 py-3">{q.customerName}</td>
                <td className="px-4 py-3">{q.salesperson}</td>
                <td className="px-4 py-3">{q.status}</td>
                <td className="px-4 py-3">
                  R$ {Number(q.totalPrice ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setActiveView("quoteDetail", q.id)}
                    className="text-blue-600 hover:underline"
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}

            {safeQuotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Nenhum orçamento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Quotes;
