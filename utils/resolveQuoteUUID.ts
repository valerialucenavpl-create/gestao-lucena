import { Quote } from "../types";

const toSafeText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Encontra o id REAL do orçamento (no tipo original — number/bigint ou
// string, o que o banco devolver) a partir de uma venda, mesmo quando ela
// guarda o vínculo como quote_id numérico ou só pelo nome do cliente
// (cadastros antigos). Devolver o id no formato original é essencial: o
// resto do app compara esse valor com "===" contra quotes.id, que às vezes
// vem como number — uma comparação number !== string sempre falha, mesmo
// sendo o mesmo orçamento (mesmo bug já visto em Sales.tsx).
export function resolveQuoteUUID(sale: any, quotes: Quote[]): string {
  const directId = toSafeText(sale?.quoteId);
  if (directId) {
    const byId = quotes.find((q) => toSafeText(q.id) === directId);
    if (byId) return byId.id;
  }

  const qNum = sale?.quote_id;
  if (qNum != null) {
    const byNum = quotes.find((q) => Number(q.quoteNumber) === Number(qNum));
    if (byNum) return byNum.id;
  }

  const customer = toSafeText(sale?.customerName ?? sale?.customer_name).toLowerCase();
  if (customer) {
    const byName = quotes.find((q) => toSafeText(q.customerName).toLowerCase() === customer);
    if (byName) return byName.id;
  }

  return "";
}
