import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";
import { getCashFlow } from "../services/cashFlowServices";
import { CashFlowEntry } from "../types";

// ─── Types ───────────────────────────────────────────────────────────────────
interface QuoteRow {
  id: string;
  quoteNumber?: number;
  customerName?: string;
  customer_name?: string;
  totalPrice?: number;
  total_price?: number;
  paymentMethod?: string;
  payment_method?: string;
  date?: string;
  deliveryDate?: string;
  delivery_date?: string;
  measurementNotes?: string;
  measurement_notes?: string;
  status?: string;
}


interface ReceivableRow {
  id: string;
  osNumber: string;
  customerName: string;
  totalPrice: number;
  totalPaid: number;
  remaining: number;
  paymentMethod: string;
  deliveryDate: string;
  saleDate: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseDateFlex(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim().slice(0, 10);
  if (!raw) return null;
  const d = new Date(raw + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatBR(value: string): string {
  if (!value) return "—";
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

function extractDeliveryDate(notes: string, saleDate: string): string {
  const text = String(notes || "");
  // 1. explicit date in notes
  const dateMatch = text.match(/Data prevista de entrega:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (dateMatch?.[1]) {
    const d = parseDateFlex(dateMatch[1].includes("/") ? dateMatch[1].split("/").reverse().join("-") : dateMatch[1]);
    if (d) return toISO(d);
  }
  // 2. lead days in notes
  const daysMatch = text.match(/Prazo de entrega:\s*(\d+)/i);
  const base = parseDateFlex(saleDate);
  if (base) {
    const lead = daysMatch?.[1] ? Number(daysMatch[1]) : 20;
    return toISO(addBusinessDays(base, lead));
  }
  return "";
}

function normalizeCustomer(name: unknown): string {
  return String(name ?? "").trim().toLowerCase();
}

// ─── Component ───────────────────────────────────────────────────────────────
const Receivables: React.FC = () => {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Use the proven getCashFlow service (handles column mapping and auth correctly)
      const [quotesRes, cashResult] = await Promise.all([
        supabase.from("quotes").select("*").eq("status", "Aprovado"),
        getCashFlow(),
      ]);

      const allCashEntries: CashFlowEntry[] = cashResult.ok ? (cashResult.data ?? []) : [];

      // "Entrada" is already normalized by mapRowToEntry in cashFlowServices
      const incomeRows = allCashEntries.filter(
        (e) => e.type === "Entrada" || (e.type as any) === "income"
      );

      const quotes: QuoteRow[] = Array.isArray(quotesRes.data) ? (quotesRes.data as QuoteRow[]) : [];

      const mapped: ReceivableRow[] = quotes
        .map((q) => {
          const customer = String(q.customerName ?? q.customer_name ?? "").trim();
          const customerNorm = normalizeCustomer(customer);
          const totalPrice = Number(q.totalPrice ?? q.total_price ?? 0);
          const saleDate = String(q.date ?? "");
          const notes = String(q.measurementNotes ?? q.measurement_notes ?? "");
          const deliveryDateRaw = String(q.deliveryDate ?? q.delivery_date ?? "");
          const deliveryDate = deliveryDateRaw || extractDeliveryDate(notes, saleDate);
          const osNumber = q.quoteNumber != null ? String(q.quoteNumber) : String(q.id).slice(-6).toUpperCase();
          const paymentMethod = String(q.paymentMethod ?? q.payment_method ?? "A Definir");

          // 1. Primary: subcategory tag "quote:{id}" — set by QuoteDetail on save
          // 2. Fallback: customer name in description (covers manual cashflow entries)
          const quoteTag = `quote:${q.id}`;
          const quoteNumStr = q.quoteNumber != null ? String(q.quoteNumber) : "";

          const totalPaid = incomeRows
            .filter((e) => {
              // primary: exact subcategory tag match
              if (e.subcategory === quoteTag) return true;
              // fallback: customer name appears in description
              if (!customerNorm) return false;
              const desc = (e.description ?? "").toLowerCase();
              const nameMatch = desc.includes(customerNorm);
              // if we also have a quote number, use it to narrow the match
              const numMatch = quoteNumStr ? desc.includes(quoteNumStr) : true;
              return nameMatch && numMatch;
            })
            // getCashFlow() already maps DB "value" column → e.amount
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);

          const remaining = Math.max(totalPrice - totalPaid, 0);

          return {
            id: String(q.id),
            osNumber,
            customerName: customer || "Cliente não identificado",
            totalPrice,
            totalPaid: Math.min(totalPaid, totalPrice),
            remaining,
            paymentMethod,
            deliveryDate,
            saleDate,
          };
        })
        .filter((r) => r.remaining > 0.01);

      // sort by delivery date ascending
      mapped.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

      setRows(mapped);
      setLoading(false);
    };

    load();
  }, []);

  // ─── Filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dateFrom && r.saleDate < dateFrom) return false;
      if (dateTo && r.saleDate > dateTo) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo]);

  const totalReceivable = useMemo(
    () => filtered.reduce((sum, r) => sum + r.remaining, 0),
    [filtered]
  );

  const totalPaidAll = useMemo(
    () => filtered.reduce((sum, r) => sum + r.totalPaid, 0),
    [filtered]
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-2xl font-bold text-gray-800">Contas a Receber</h3>
        <p className="text-sm text-gray-500 mt-1">
          Vendas aprovadas com saldo pendente de recebimento.
        </p>
      </div>

      {/* TOTAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Total a Receber</p>
          <p className="text-2xl font-bold text-red-600">{money(totalReceivable)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Já Recebido</p>
          <p className="text-2xl font-bold text-green-600">{money(totalPaidAll)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Qtd. de Contas</p>
          <p className="text-2xl font-bold text-gray-800">{filtered.length}</p>
        </div>
      </div>

      {/* FILTRO DE DATA */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Filtrar por data da venda</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">De</label>
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
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {/* LISTA */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400">
          Nenhuma conta a receber encontrada para o período selecionado.
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
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor Total</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Recebido</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Restante</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Pagamento</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Prev. Entrega</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Data Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const pct = row.totalPrice > 0 ? (row.totalPaid / row.totalPrice) * 100 : 0;
                  const today = toISO(new Date());
                  const isOverdue = row.deliveryDate && row.deliveryDate < today;
                  const isSoon =
                    row.deliveryDate &&
                    row.deliveryDate >= today &&
                    row.deliveryDate <= toISO(addBusinessDays(new Date(), 3));

                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary-700 font-semibold">
                        #{row.osNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.customerName}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{money(row.totalPrice)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{money(row.totalPaid)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-red-600">{money(row.remaining)}</span>
                        <div className="mt-1 h-1.5 w-20 bg-gray-200 rounded-full overflow-hidden ml-auto">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
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
                          {formatBR(row.deliveryDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatBR(row.saleDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">
                    Total ({filtered.length} contas)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 text-sm">
                    {money(totalReceivable)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* CARDS — mobile */}
          <div className="md:hidden space-y-3">
            {filtered.map((row) => {
              const pct = row.totalPrice > 0 ? (row.totalPaid / row.totalPrice) * 100 : 0;
              const today = toISO(new Date());
              const isOverdue = row.deliveryDate && row.deliveryDate < today;

              return (
                <div key={row.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-primary-700 font-semibold">OS #{row.osNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isOverdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      Entrega: {formatBR(row.deliveryDate)}
                    </span>
                  </div>
                  <p className="font-bold text-gray-800">{row.customerName}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="font-semibold text-gray-700">{money(row.totalPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Restante</p>
                      <p className="font-bold text-red-600">{money(row.remaining)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500">{row.paymentMethod} • Venda: {formatBR(row.saleDate)}</p>
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
