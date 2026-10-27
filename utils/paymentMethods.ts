// Mapeamento único forma de pagamento -> subcategoria de recebimento de
// venda no Caixa. Usado tanto no formulário de "Registrar Pagamento"
// (QuoteDetail.tsx) quanto no script de migração dos lançamentos antigos —
// mesma fonte de verdade nos dois lugares, pra nunca desalinhar.

export type SaleCardType = "debito" | "credito_vista" | "credito_parcelado";

export const SALE_PAYMENT_METHODS = [
  "Dinheiro",
  "PIX",
  "Cartão",
  "Link de pagamento",
  "Transferência bancária",
  "Boleto",
] as const;

export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

export const CARD_TYPE_LABELS: Record<SaleCardType, string> = {
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

// Nome estruturado salvo em cashflow.payment_method — já vem pronto pro
// texto da descrição também (ex.: "PIX", "Cartão crédito parcelado").
export function buildPaymentMethodLabel(method: SalePaymentMethod, cardType?: SaleCardType): string {
  if (method === "Cartão") {
    if (cardType === "debito") return "Cartão débito";
    if (cardType === "credito_parcelado") return "Cartão crédito parcelado";
    return "Cartão crédito à vista";
  }
  return method;
}

// categoria + subcategoria de recebimento de venda no Caixa, a partir da
// forma de pagamento já "achatada" (ex.: "Cartão crédito parcelado", vinda
// de buildPaymentMethodLabel ou já lida assim de um registro antigo).
export const SALE_RECEIPT_CATEGORY = "RECEITAS OPERACIONAIS";

export function saleReceiptSubcategory(paymentMethodLabel: string): string {
  const key = paymentMethodLabel.trim().toLowerCase();
  switch (key) {
    case "dinheiro":
      return "venda dinheiro";
    case "pix":
      return "venda pix";
    case "cartão débito":
    case "cartao debito":
      return "venda cartão débito";
    case "cartão crédito à vista":
    case "cartao credito a vista":
    case "cartão": // registro antigo sem detalhe -> assume à vista
    case "cartao":
      return "venda cartão crédito à vista";
    case "cartão crédito parcelado":
    case "cartao credito parcelado":
      return "venda cartão crédito parcelado";
    case "link de pagamento":
    case "link":
      return "venda link de pagamento";
    case "transferência bancária":
    case "transferencia bancaria":
    case "transferência":
    case "transferencia":
      return "venda transferência bancária";
    case "boleto":
      return "venda boleto";
    default:
      return "venda outros";
  }
}
