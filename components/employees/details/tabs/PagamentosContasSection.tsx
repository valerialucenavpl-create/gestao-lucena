import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../services/supabase";
import { PayableInstallment } from "../../../../types";

// Baixas dadas em Contas a Pagar nas contas vinculadas a este funcionário.
// Não tem tabela própria: lê direto de payables, então o que for pago lá
// aparece aqui na hora, sem lançamento duplicado.

type PagamentoRow = {
  key: string;
  conta: string;
  parcela: string;
  vencimento: string;
  pagoEm: string;
  forma: string;
  valor: number;
};

const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("T")[0].split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PagamentosContasSection: React.FC<{ funcionarioId: number }> = ({ funcionarioId }) => {
  const [rows, setRows] = useState<PagamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("payables")
        .select("id, name, amount, due_date, installments, status, paid_date, payment_method")
        .eq("employee_id", funcionarioId)
        .is("deleted_at", null);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const out: PagamentoRow[] = [];
      for (const p of data || []) {
        const insts: PayableInstallment[] = Array.isArray(p.installments) ? p.installments : [];
        if (insts.length === 0) {
          if (p.status === "paid") {
            out.push({
              key: String(p.id),
              conta: p.name || "-",
              parcela: "À vista",
              vencimento: p.due_date || "",
              pagoEm: p.paid_date || "",
              forma: p.payment_method || "-",
              valor: Number(p.amount || 0),
            });
          }
          continue;
        }
        insts.forEach((i, idx) => {
          if (!i.paid) return;
          out.push({
            key: `${p.id}-${i.id}`,
            conta: p.name || "-",
            parcela: `${idx + 1}/${insts.length}`,
            vencimento: i.dueDate || p.due_date || "",
            pagoEm: i.paidDate || "",
            forma: i.paymentMethod || "-",
            valor: Number(i.amount || 0) || Number(p.amount || 0) / insts.length,
          });
        });
      }
      out.sort((a, b) => (b.pagoEm || b.vencimento).localeCompare(a.pagoEm || a.vencimento));
      setRows(out);
      setLoading(false);
    })();
  }, [funcionarioId]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.valor, 0), [rows]);

  if (loading) return <p className="text-sm text-gray-400">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">Não foi possível carregar os pagamentos: {error}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        Nenhum pagamento registrado ainda. Vincule a conta a este funcionário em Contas a Pagar e dê baixa por lá.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Pago em</th>
            <th className="p-2 text-left">Conta</th>
            <th className="p-2 text-center">Parcela</th>
            <th className="p-2 text-center">Vencimento</th>
            <th className="p-2 text-left">Forma</th>
            <th className="p-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="p-2">{formatBR(r.pagoEm)}</td>
              <td className="p-2">{r.conta}</td>
              <td className="p-2 text-center text-gray-500">{r.parcela}</td>
              <td className="p-2 text-center text-gray-500">{formatBR(r.vencimento)}</td>
              <td className="p-2 text-gray-600">{r.forma}</td>
              <td className="p-2 text-right font-semibold">{money(r.valor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-gray-50">
            <td colSpan={5} className="p-2 text-right font-semibold">Total pago</td>
            <td className="p-2 text-right font-bold text-green-700">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default PagamentosContasSection;
