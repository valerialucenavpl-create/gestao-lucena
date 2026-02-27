// components/Sales.tsx
import React, { useMemo, useState, useEffect } from "react";
import { Sale, Quote, Client, CashFlowEntry } from "../types";
import { Icon } from "./icons/Icon";
import { supabase } from "../services/supabase";

/* =========================
   TIPOS
========================= */
type SaleStatusFilter =
  | "Todos"
  | "Aprovado"
  | "Concluído"
  | "Pendente"
  | "Cancelado";

type Seller = {
  id: number;
  name: string;
};

/* =========================
   PROPS
========================= */
interface SalesProps {
  sales?: Sale[] | null;
  quotes?: Quote[] | null;
  clients?: Client[] | null;
  cashFlow?: CashFlowEntry[] | null;
}

/* =========================
   HELPERS DATA
========================= */
function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateBR(value: any): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function getYear(value: any): string {
  const d = toDate(value);
  return d ? String(d.getFullYear()) : "—";
}

/* =========================
   COMPONENTE
========================= */
const Sales: React.FC<SalesProps> = (props) => {
  const sales = Array.isArray(props.sales) ? props.sales : [];
  const quotes = Array.isArray(props.quotes) ? props.quotes : [];
  const clients = Array.isArray(props.clients) ? props.clients : [];
  const cashFlow = Array.isArray(props.cashFlow) ? props.cashFlow : [];

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "financial">("details");
  const [filterStatus, setFilterStatus] =
    useState<SaleStatusFilter>("Todos");

  const [sellers, setSellers] = useState<Seller[]>([]);

  /* =========================
     LOAD SELLERS
  ========================= */
  useEffect(() => {
    const loadSellers = async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (!error) setSellers((data as Seller[]) ?? []);
    };

    loadSellers();
  }, []);

  const getSellerName = (sellerId?: number | null) => {
    if (!sellerId) return "—";
    return sellers.find((s) => s.id === sellerId)?.name || "—";
  };

  /* =========================
     HELPERS EXISTENTES
  ========================= */
  const getQuote = (quoteId: string) =>
    quotes.find((q) => (q as any).id === quoteId);

  const getClientById = (clientId: string) =>
    clients.find((c) => (c as any).id === clientId);

  const getClientByName = (name: string) =>
    clients.find(
      (c) =>
        (c.name || "").toLowerCase().trim() ===
        name.toLowerCase().trim()
    );

  const getFinancialInfo = (sale: Sale) => {
    const saleDate = toDate((sale as any).saleDate);
    const saleDateMs = saleDate ? saleDate.getTime() : null;

    const payments = cashFlow.filter((entry) => {
      if ((entry as any).type !== "income") return false;

      const desc = ((entry as any).description || "").toLowerCase();
      const customer = ((sale as any).customerName || "").toLowerCase();
      if (!desc.includes(customer)) return false;

      const entryDate = toDate((entry as any).date);
      if (!entryDate) return false;

      if (saleDateMs === null) return true;
      return entryDate.getTime() >= saleDateMs;
    });

    const totalPaidRaw = payments.reduce(
      (sum, p) => sum + ((p as any).amount || 0),
      0
    );
    const saleAmount = Number((sale as any).amount || 0);

    const totalPaid = Math.min(totalPaidRaw, saleAmount);
    const remaining = Math.max(saleAmount - totalPaid, 0);
    const percentage =
      saleAmount > 0 ? (totalPaid / saleAmount) * 100 : 0;

    return { payments, totalPaid, remaining, percentage };
  };

  const getSaleStatus = (sale: Sale): SaleStatusFilter => {
    const quote = getQuote((sale as any).quoteId);

    if (quote && (quote as any).status === "Recusado")
      return "Cancelado";
    if (quote && (quote as any).status === "Pendente")
      return "Pendente";

    const { percentage } = getFinancialInfo(sale);
    if (percentage >= 99.9) return "Concluído";
    return "Aprovado";
  };

  /* =========================
     FILTROS
  ========================= */
  const filteredSales = useMemo(() => {
    if (filterStatus === "Todos") return sales;
    return sales.filter((s) => getSaleStatus(s) === filterStatus);
  }, [sales, filterStatus]);

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold">Painel de Vendas</h3>

      {filteredSales.map((sale) => (
        <div
          key={(sale as any).id}
          className="bg-white p-4 rounded-lg shadow border-l-4 border-primary-500"
        >
          <div className="flex justify-between">
            <div>
              <h4 className="font-bold">
                Pedido nº{" "}
                {((sale as any).quoteId || "").replace(/\D/g, "")} -{" "}
                {getYear((sale as any).saleDate)}
              </h4>

              <p className="text-sm text-gray-500">
                {formatDateBR((sale as any).saleDate)} •{" "}
                {(sale as any).customerName}
              </p>

              <p className="text-xs uppercase font-semibold text-gray-400">
                Vendedora: {getSellerName((sale as any).seller_id)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-green-600 font-bold text-lg">
                R{" "}
                {Number((sale as any).amount || 0).toLocaleString(
                  "pt-BR",
                  { minimumFractionDigits: 2 }
                )}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Sales;
