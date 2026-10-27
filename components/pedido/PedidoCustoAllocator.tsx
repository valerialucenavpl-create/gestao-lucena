import React, { useMemo, useState } from "react";
import { PedidoCustoAllocation } from "../../services/pedidoCustosServices";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../../utils/money";

export type PedidoOption = { id: string; quoteNumber?: number | string; customerName: string; approvedAt?: string };

const money = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const pedidoLabel = (p?: PedidoOption) => (p ? `Nº ${p.quoteNumber ?? p.id} — ${p.customerName || "sem nome"}` : "Pedido não encontrado");

type Props = {
  totalAmount: number;
  allocations: PedidoCustoAllocation[];
  onChange: (next: PedidoCustoAllocation[]) => void;
  pedidos: PedidoOption[];
};

// Divide uma saída do Caixa entre pedidos; o que não for distribuído é
// "Estoque geral".
const PedidoCustoAllocator: React.FC<Props> = ({ totalAmount, allocations, onChange, pedidos }) => {
  const [search, setSearch] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const byId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos]);
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  const remaining = totalAmount - allocated;

  const matches = useMemo(() => {
    const term = norm(search);
    if (!term) return [];
    const used = new Set(allocations.map((a) => a.quoteId));
    return pedidos
      .filter((p) => !used.has(p.id))
      .filter((p) => String(p.quoteNumber ?? "") === term.replace(/^n[ºo°]?\s*/, "") || norm(p.customerName).includes(term))
      .slice(0, 8);
  }, [search, pedidos, allocations]);

  const add = (p: PedidoOption) => {
    // Primeiro pedido leva o valor todo; os seguintes, o que ainda sobra.
    const value = Math.max(0, Number(remaining.toFixed(2)));
    onChange([...allocations, { quoteId: p.id, amount: value }]);
    setInputs((prev) => ({ ...prev, [p.id]: formatMoneyInputBR(value) }));
    setSearch("");
  };

  const setAmount = (quoteId: string, raw: string) => {
    const clean = sanitizeMoneyInputBR(raw);
    setInputs((prev) => ({ ...prev, [quoteId]: clean }));
    onChange(allocations.map((a) => (a.quoteId === quoteId ? { ...a, amount: parseMoneyInputBR(clean) } : a)));
  };

  return (
    <div className="space-y-2">
      <input
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar pedido por nº ou nome do cliente..."
      />
      {matches.length > 0 && (
        <div className="border rounded-lg divide-y bg-white max-h-56 overflow-y-auto">
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50">
              {pedidoLabel(p)}
            </button>
          ))}
        </div>
      )}
      {search.trim() && matches.length === 0 && <p className="text-xs text-gray-400">Nenhum pedido aprovado encontrado.</p>}

      {allocations.length > 0 && (
        <div className="space-y-1.5">
          {allocations.map((a) => (
            <div key={a.quoteId} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-700 truncate">{pedidoLabel(byId.get(a.quoteId))}</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-32 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right"
                value={inputs[a.quoteId] ?? formatMoneyInputBR(a.amount)}
                onChange={(e) => setAmount(a.quoteId, e.target.value)}
                onBlur={() => setInputs((prev) => ({ ...prev, [a.quoteId]: formatMoneyInputBR(a.amount) }))}
              />
              <button
                type="button"
                onClick={() => onChange(allocations.filter((x) => x.quoteId !== a.quoteId))}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`flex justify-between text-sm px-1 ${remaining < -0.005 ? "text-red-600 font-semibold" : "text-gray-600"}`}>
        <span>{remaining < -0.005 ? "Distribuído acima do valor da saída" : "Estoque geral (restante)"}</span>
        <span>{money(remaining)}</span>
      </div>
    </div>
  );
};

export default PedidoCustoAllocator;
