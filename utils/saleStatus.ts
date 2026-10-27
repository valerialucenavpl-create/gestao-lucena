// Fluxo de status da venda (Etapa 5.1) — fonte única de verdade, usada em
// Sales.tsx, Receivables.tsx, Dashboard.tsx, Dre.tsx e Dfc.tsx pra não
// duplicar (e desalinhar) essa regra em cada tela.
//
// Pendente em aprovação → Aguardando → Entregue – a receber → Concluído
// (+ Cancelado, que pode vir do orçamento recusado OU de cancelamento
// manual só da venda, sem mexer no orçamento de origem).
export type SaleStatus = "Pendente em aprovação" | "Aguardando" | "Entregue – a receber" | "Concluído" | "Cancelado";

export function getSaleStatus(quote: { status?: string; deliveredAt?: string; saleCompleted?: boolean } | null | undefined, explicitCancel?: boolean): SaleStatus {
  if (explicitCancel) return "Cancelado";
  if (!quote) return "Aguardando";
  if (quote.status === "Recusado") return "Cancelado";
  if (quote.status === "Pendente") return "Pendente em aprovação";
  if (quote.saleCompleted) return "Concluído";
  if (quote.deliveredAt) return "Entregue – a receber";
  return "Aguardando";
}
