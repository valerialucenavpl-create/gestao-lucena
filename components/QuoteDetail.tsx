// components/QuoteDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Quote,
  QuoteItem,
  QuoteItemMaterialLine,
  QuoteItemLaborLine,
  QuoteInternalStatus,
  InventoryItem,
  Product,
  VariableExpense,
  CompanySettings,
  Client,
  CashFlowEntry,
  User,
  BankAccount,
} from "../types";
import { calculateQuoteCompositionLineCost } from "../utils/materialFormulas";
import { createCashFlowEntry } from "../services/cashFlowServices";
import { getBankAccounts } from "../services/bankAccountsServices";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import { supabase } from "../services/supabase";
import { getQuoteHistory, QuoteHistoryRow, createQuoteHistoryEntry } from "../services/quoteHistoryServices";
import { LOST_REASONS } from "../utils/salesReport";
import { getPedidoCustos, PedidoCusto } from "../services/pedidoCustosServices";
import {
  CreditoFornecedor,
  PedidoAlteracao,
  createCreditoFornecedor,
  createPedidoAlteracao,
  getComprovanteUrl,
  getCreditosFornecedor,
  getPedidoAlteracoes,
  marcarCreditoRecebido,
  uploadComprovante,
} from "../services/pedidoAjustesServices";
import {
  AlteracaoFormData,
  AlteracaoModal,
  AlteracoesViewModal,
  CreditoFornecedorModal,
  DevolucaoFormData,
  DevolucaoModal,
} from "./pedido/PedidoAjustes";
import { generateQuotePDF } from "../utils/generateQuotePDF";
import { generateReceiptPDF, findCpfCnpj } from "../utils/generateReceiptPDF";
import { normalizeText, getClientAddressLabel } from "../utils/deliveryEntries";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import {
  SALE_PAYMENT_METHODS,
  SALE_RECEIPT_CATEGORY,
  SaleCardType,
  SalePaymentMethod,
  buildPaymentMethodLabel,
  saleReceiptSubcategory,
} from "../utils/paymentMethods";

interface QuoteDetailProps {
  quote: Quote;
  currentUser: User;
  clients?: Client[];
  rawMaterials: InventoryItem[];
  products: Product[];
  variableExpenses?: VariableExpense[];
  companySettings: CompanySettings;
  cashFlow?: CashFlowEntry[];
  onUpdateQuote: (quote: Quote) => Promise<void>;
  onCashFlowAdded?: (entry: CashFlowEntry) => void;
  onBack: () => void;
  backLabel?: string;
  onGoToSales?: () => void;
  onEditQuote?: () => void;
  onGenerateSale?: (quote: Quote, overrideDate?: string) => Promise<void>;
  hasSale?: boolean;
  /** Data da venda (YYYY-MM-DD) da linha em "sales", quando o pedido já virou venda. */
  saleDate?: string;
  onChangeSaleDate?: (ymd: string) => Promise<boolean>;
}

// Cor do selo de cada tipo de evento no "Ver histórico do pedido".
const HISTORY_EVENT_COLORS: Record<string, string> = {
  cancel: "#ef4444",
  alteracao: "#8fa8ff",
  devolucao: "#f59e0b",
  credito_fornecedor: "#38bdf8",
};

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (value: string | undefined | null): string => {
  if (!value) return "—";
  // Sempre usa só a parte "dia" (YYYY-MM-DD) e força meio-dia — a data que
  // vem do banco (timestamptz) já tem hora (meia-noite UTC), e usar essa
  // hora direto com toLocaleDateString (fuso local) fazia a data aparecer
  // um dia antes pra quem está no Brasil (UTC-3).
  const str = value.slice(0, 10) + "T12:00:00";
  const d = new Date(str);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isoToInput = (v: string | undefined | null): string => {
  if (!v) return "";
  return v.includes("T") ? v.slice(0, 10) : v.slice(0, 10);
};

// ─── Status configs ──────────────────────────────────────────────────────────
const CLIENT_STATUS_OPTIONS: Quote["status"][] = ["Pendente", "Aprovado", "Recusado"];
const CLIENT_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Pendente:  { bg: "#f59e0b22", color: "#f59e0b" },
  Aprovado:  { bg: "#22c55e22", color: "#22c55e" },
  Recusado:  { bg: "#ef444422", color: "#ef4444" },
};

const INTERNAL_STATUS_OPTIONS: QuoteInternalStatus[] = [
  "Pedido",
  "Na Produção",
  "Aguardando Material",
  "Falta Entregar",
  "Entregue",
];
const INTERNAL_STATUS_STYLE: Record<QuoteInternalStatus, { bg: string; color: string }> = {
  Pedido:                { bg: "#6366f122", color: "#6366f1" },
  "Na Produção":         { bg: "#f59e0b22", color: "#f59e0b" },
  "Aguardando Material": { bg: "#ef444422", color: "#ef4444" },
  "Falta Entregar":      { bg: "#ec489922", color: "#ec4899" },
  Entregue:              { bg: "#22c55e22", color: "#22c55e" },
};

const PAYMENT_OPTIONS = ["A Definir", "PIX", "Cartão", "Dinheiro", "Transferência", "Boleto"];

// ─── Main component ──────────────────────────────────────────────────────────
const QuoteDetail: React.FC<QuoteDetailProps> = ({
  quote,
  currentUser,
  clients = [],
  rawMaterials,
  products,
  variableExpenses = [],
  companySettings,
  cashFlow = [],
  onUpdateQuote,
  onCashFlowAdded,
  onBack,
  backLabel = "Voltar para Orçamentos",
  onEditQuote,
  onGenerateSale,
  hasSale = false,
  saleDate,
  onChangeSaleDate,
}) => {
  const [localQuote, setLocalQuote] = useState<Quote>(() => structuredClone(quote));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingSale, setGeneratingSale] = useState(false);
  const [showFinances, setShowFinances] = useState(false);
  const [showFreightDetail, setShowFreightDetail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [refuseDetail, setRefuseDetail] = useState("");
  const [historyEntries, setHistoryEntries] = useState<QuoteHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [generatingHistoryPdfId, setGeneratingHistoryPdfId] = useState<number | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"receitas" | "despesas">("receitas");
  const [detailModal, setDetailModal] = useState<
    | { type: "material"; title: string; lines: QuoteItemMaterialLine[] }
    | { type: "labor"; title: string; lines: QuoteItemLaborLine[] }
    | null
  >(null);

  // Payment form
  const [payAmount, setPayAmount] = useState(0);
  const [payAmountInput, setPayAmountInput] = useState(formatMoneyInputBR(0));
  const [payDate, setPayDate] = useState(todayISO());
  const [payReceived, setPayReceived] = useState(true);
  const [payReceivedDate, setPayReceivedDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<SalePaymentMethod>("PIX");
  // Só usado quando payMethod === "Cartão" — pede o tipo antes de liberar
  // salvar, e o nº de parcelas quando for parcelado.
  const [payCardType, setPayCardType] = useState<SaleCardType | "">("");
  const [payInstallments, setPayInstallments] = useState(2);
  const [payReference, setPayReference] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [payAccounts, setPayAccounts] = useState<BankAccount[]>([]);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDefaultDinheiro, setPayDefaultDinheiro] = useState("");
  const [payDefaultPix, setPayDefaultPix] = useState("");

  // Edição da vendedora — só Admin, pra corrigir pedido lançado com o nome
  // errado sem precisar mexer direto no banco.
  const [editingSalesperson, setEditingSalesperson] = useState(false);
  const [sellersList, setSellersList] = useState<{ id: string; name: string }[]>([]);
  const [savingSalesperson, setSavingSalesperson] = useState(false);

  useEffect(() => {
    if (currentUser?.role !== "Admin") return;
    supabase
      .from("sellers")
      .select("id,name")
      .eq("active", true)
      .order("name", { ascending: true })
      .then(({ data }) => setSellersList(data ?? []));
  }, [currentUser?.role]);

  const handleChangeSalesperson = async (newName: string) => {
    if (!newName || newName === localQuote.salesperson) {
      setEditingSalesperson(false);
      return;
    }
    setSavingSalesperson(true);
    const previous = localQuote;
    try {
      const updated = { ...localQuote, salesperson: newName };
      setLocalQuote(updated);
      // Antes o retorno era ignorado: se o banco recusasse, a tela mostrava a
      // vendedora nova mas o pedido continuava salvo com a antiga, sem aviso.
      const result: any = await onUpdateQuote(updated);
      if (result && result.ok === false) {
        setLocalQuote(previous);
        alert(`Não foi possível trocar a vendedora: ${result.error?.message ?? "erro desconhecido (ver console)"}`);
        return;
      }
      createQuoteHistoryEntry(String(localQuote.id), updated, "vendedora", "Vendedora", {
        description: `Vendedora trocada de ${previous.salesperson || "—"} para ${newName}`,
        userName: currentUser?.name || "",
      }).catch(() => {});
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      setEditingSalesperson(false);
    } finally {
      setSavingSalesperson(false);
    }
  };

  useEffect(() => {
    const loadPaymentConfig = async () => {
      const [accRes, setRes] = await Promise.all([getBankAccounts(), getCashFlowSettings()]);
      if (accRes.ok) setPayAccounts((accRes.data ?? []).filter((a) => a.active));
      if (setRes.ok) {
        setPayDefaultDinheiro(setRes.data.defaultAccountDinheiro || "");
        setPayDefaultPix(setRes.data.defaultAccountPix || "");
      }
    };
    loadPaymentConfig();
  }, []);

  // Pré-preenche a conta pelo padrão configurado quando muda a forma de
  // pagamento — Cartão nunca tem padrão fixo, sempre pergunta a maquininha.
  useEffect(() => {
    if (payMethod === "Dinheiro") setPayAccountId(payDefaultDinheiro);
    else if (payMethod === "PIX") setPayAccountId(payDefaultPix);
    else if (payMethod === "Cartão") setPayAccountId("");
  }, [payMethod, payDefaultDinheiro, payDefaultPix]);

  // Rastreia qual orçamento estava sendo visto antes, pra saber se um
  // "quote" novo chegou por causa de navegação (troca de orçamento — sempre
  // recarrega) ou de uma atualização em tempo real do MESMO orçamento
  // (só recarrega se não tiver edição local pendente, senão apagaria o que
  // a usuária ainda não salvou).
  const prevQuoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewQuote = prevQuoteIdRef.current !== quote.id;
    prevQuoteIdRef.current = quote.id;

    if (!isNewQuote) {
      const hasUnsavedChanges = JSON.stringify(localQuote) !== JSON.stringify(quote);
      if (hasUnsavedChanges) return;
    }

    const cloned = structuredClone(quote) as Quote;

    // Auto-preenche deliveryDate a partir das notas do orçamento se ainda não estiver definida
    if (!cloned.deliveryDate) {
      const notes = String((cloned as any).measurementNotes || "");
      const dateMatch = notes.match(/Data prevista de entrega:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
      const daysMatch = notes.match(/Prazo de entrega:\s*(\d+)/i);

      if (dateMatch?.[1]) {
        const raw = dateMatch[1];
        if (raw.includes("/")) {
          const [dd, mm, yyyy] = raw.split("/");
          cloned.deliveryDate = `${yyyy}-${mm}-${dd}`;
        } else {
          cloned.deliveryDate = raw.slice(0, 10);
        }
      } else if (daysMatch?.[1]) {
        const base = cloned.date ? new Date(cloned.date.slice(0, 10) + "T12:00:00") : new Date();
        base.setDate(base.getDate() + Number(daysMatch[1]));
        cloned.deliveryDate = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      }
    }

    setLocalQuote(cloned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  const isDirty = JSON.stringify(localQuote) !== JSON.stringify(quote);

  // ── Auto-salva status imediatamente ao mudar (sem precisar clicar "Salvar") ──
  const handleStatusChange = async (field: "status" | "internalStatus", value: string, extra?: Partial<Quote>) => {
    if (field === "status" && value === "Aprovado" && !localQuote.deliveryDate) {
      alert("Antes de aprovar, informe o \"Prazo de entrega prometido\" — é obrigatório pra aprovar um orçamento.");
      return;
    }
    // Recusar pede o motivo antes (obrigatório) — o modal chama de novo com extra.
    if (field === "status" && value === "Recusado" && !extra) {
      setRefuseReason("");
      setRefuseDetail("");
      setShowRefuseModal(true);
      return;
    }
    const updated = { ...localQuote, ...extra, [field]: value } as Quote;
    setLocalQuote(updated);
    setSaving(true);
    setSavedOk(false);
    const result: any = await onUpdateQuote(updated);
    setSaving(false);
    if (result && result.ok === false) {
      alert(`Não foi possível salvar: ${result.error?.message ?? "ver console"}`);
      setLocalQuote(localQuote); // desfaz a troca otimista, já que não gravou de verdade
      return;
    }
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
  };
  const handleGenerateSale = async () => {
    if (!onGenerateSale || hasSale || generatingSale) return;
    // Gerar venda = cliente aprovou. Mesma regra do seletor de status: sem
    // prazo de entrega prometido não dá pra aprovar.
    if (localQuote.status !== "Aprovado" && !localQuote.deliveryDate) {
      alert("Antes de gerar a venda, informe o \"Prazo de entrega prometido\" — é obrigatório pra aprovar um orçamento.");
      return;
    }
    // O orçamento pode ter sido feito num dia e fechado (virado venda) só
    // depois — pergunta antes se a data da venda deve ser a de hoje em vez
    // da data salva no orçamento, pra não distorcer o mês em que a venda
    // aparece no painel de Vendas.
    const useToday = window.confirm(
      `Este orçamento foi feito em ${fmtDate(localQuote.date)}. Usar a data de HOJE (${fmtDate(todayISO())}) como data da venda?\n\nOK = usar hoje\nCancelar = manter ${fmtDate(localQuote.date)}`
    );
    // Venda de balcão/retirada, sem montagem/entrega a fazer depois — se já
    // saiu com o cliente na hora, conclui junto pra não ficar "pendurada"
    // como pedido em aberto na DRE.
    let alreadyDelivered = window.confirm(
      "Venda já entregue? (balcão / retirada pelo cliente)\n\nOK = sim, já foi entregue\nCancelar = não, ainda vai ser produzida/entregue"
    );
    // Duas perguntas seguidas com OK = "sim" — fácil confirmar a entrega sem
    // querer. Pede uma confirmação explícita antes de concluir a venda.
    if (alreadyDelivered) {
      alreadyDelivered = window.confirm(
        `Confirma que a venda Nº ${localQuote.quoteNumber ?? ""} JÁ FOI ENTREGUE ao cliente?\n\nEla vai direto para "Concluído".`
      );
    }
    setGeneratingSale(true);
    try {
      // Antes a venda era criada e o orçamento ficava "Pendente" — continuava
      // na lista de Orçamentos e a venda aparecia como "Pendente em
      // aprovação" mesmo já com pagamento (caso da OS 325). Aprova junto, com
      // a data da venda como data de aprovação (é ela que a DRE usa).
      let approvedQuote = localQuote;
      if (localQuote.status !== "Aprovado") {
        const saleDay = useToday ? todayISO() : String(localQuote.date || "").slice(0, 10) || todayISO();
        approvedQuote = { ...localQuote, status: "Aprovado", approvedAt: saleDay } as Quote;
        const r: any = await onUpdateQuote(approvedQuote);
        if (r && r.ok === false) {
          alert(`Não foi possível aprovar o orçamento, a venda não foi gerada: ${r.error?.message ?? "ver console"}`);
          return;
        }
        setLocalQuote(approvedQuote);
      }
      await onGenerateSale(approvedQuote, useToday ? todayISO() : undefined);
      if (alreadyDelivered) {
        await onUpdateQuote({ ...approvedQuote, saleCompleted: true });
      }
      createQuoteHistoryEntry(String(localQuote.id), localQuote, "venda_gerada", "Venda gerada", {
        description: `Venda gerada${alreadyDelivered ? " e marcada como JÁ ENTREGUE (balcão/retirada)" : " — a produzir/entregar"}`,
        userName: currentUser?.name || "",
      }).catch(() => {});
    } finally {
      setGeneratingSale(false);
    }
  };

  const clientInfo = clients.find((c) => String(c.id) === String(localQuote.clientId));
  const safeItems = Array.isArray(localQuote.items) ? localQuote.items : [];

  // ── Detalhamento financeiro (Admin) — mesma lógica/descrição de custos do
  // orçamento (utils/../NewQuote.tsx), só que a partir dos valores já salvos
  // no pedido em vez de recalcular tudo do zero.
  const adminBreakdown = useMemo(() => {
    if (currentUser?.role !== "Admin") return null;

    const totalPrice = Number(localQuote.totalPrice || 0);
    const totalCostOfGoods = Number(localQuote.costOfGoods || 0);
    const taxValue = Number(localQuote.taxes || 0);
    const cardValue = Number(localQuote.machineFee || 0);
    const fixedCostValue = Number(localQuote.fixedCosts || 0);
    const discountValue = Number(localQuote.discount || 0);
    const referralCommissionValue = Number(localQuote.referralCommissionValue || 0);
    const subtotal = Number(localQuote.subtotal || 0);

    const commissionRate =
      (variableExpenses ?? []).find((e) => normalizeText(e.name).includes(normalizeText("comissão")))?.value || 0;
    const commissionValue = totalPrice * (commissionRate / 100);

    const totalMaterialCost = safeItems.reduce((s, i) => s + (i.materialCost ?? 0), 0);
    const totalLaborCost = safeItems.reduce((s, i) => s + (i.laborCost ?? 0), 0);
    const totalAssemblyCost = safeItems.reduce((s, i) => s + (i.assemblyCost ?? 0), 0);
    const installationCostTotal = (localQuote.installationCostItems || []).reduce(
      (s, i) => s + (Number(i.value) || 0),
      0
    );

    const netProfit =
      totalPrice - totalCostOfGoods - installationCostTotal - commissionValue - taxValue - cardValue - fixedCostValue;
    const netProfitMargin = totalPrice > 0 ? (netProfit / totalPrice) * 100 : 0;

    const variableCosts = commissionValue + taxValue + cardValue + referralCommissionValue;
    const contribuicao = totalPrice - totalCostOfGoods - installationCostTotal - variableCosts;
    const contribuicaoPct = totalPrice > 0 ? (contribuicao / totalPrice) * 100 : 0;

    const total = {
      label: "Total do Orçamento",
      materialCost: totalMaterialCost,
      laborCost: totalLaborCost,
      materialLines: safeItems.flatMap((i) => i.materialBreakdown || []),
      laborLines: safeItems.flatMap((i) => i.laborBreakdown || []),
      costOfGoods: totalCostOfGoods,
      installationCost: installationCostTotal,
      assemblyCost: totalAssemblyCost,
      taxValue,
      commissionValue,
      discountValue,
      cardValue,
      fixedCostValue,
      referralCommissionValue,
      totalPrice,
      netProfit,
      netProfitMargin,
      contribuicao,
      contribuicaoPct,
    };

    // Categoria de cada item pelo produto do catálogo (mesma lógica de
    // Entregas por setor); itens de chapa cortada direto da matéria-prima
    // (sem productId de catálogo) caem no fallback pelo prefixo do id.
    const getItemCategoryKey = (item: QuoteItem): "MARMORE" | "VIDRO" | "ALUMINIO" | "ACESSORIOS" | null => {
      const product = products.find((p) => p.id === item.productId);
      const cat = normalizeText(product?.category || "");
      if (cat.includes("MARMORE")) return "MARMORE";
      if (cat.includes("VIDRO")) return "VIDRO";
      if (cat.includes("ALUMINIO")) return "ALUMINIO";
      if (cat.includes("ACESSORIO DE MOTOR") || cat.includes("MOTOR RESIDENCIAL")) return "ACESSORIOS";

      if (item.id.startsWith("qi-granito-") || item.id.startsWith("qi-marmore-")) return "MARMORE";
      if (item.id.startsWith("qi-glass-")) return "VIDRO";
      if (item.id.startsWith("qi-aluminum-") || item.id.startsWith("qi-portao-")) return "ALUMINIO";
      if (item.id.startsWith("qi-acessorio-")) return "ACESSORIOS";
      return null;
    };

    const CATEGORY_LABELS = {
      MARMORE: "Mármore",
      VIDRO: "Vidro",
      ALUMINIO: "Alumínio",
      ACESSORIOS: "Acessórios",
    } as const;

    const buckets: Record<string, QuoteItem[]> = {};
    safeItems.forEach((item) => {
      const key = getItemCategoryKey(item);
      if (!key) return;
      (buckets[key] = buckets[key] || []).push(item);
    });

    const categories = (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[])
      .filter((key) => (buckets[key]?.length || 0) > 0)
      .map((key) => {
        const catItems = buckets[key];
        const categoryPrice = catItems.reduce((s, i) => s + i.price, 0);
        const share = subtotal > 0 ? categoryPrice / subtotal : 0;

        const materialCost = catItems.reduce((s, i) => s + (i.materialCost ?? 0), 0);
        const laborCost = catItems.reduce((s, i) => s + (i.laborCost ?? 0), 0);
        const costOfGoods = catItems.reduce((s, i) => s + i.cost, 0);
        const assemblyCost = catItems.reduce((s, i) => s + (i.assemblyCost ?? 0), 0);
        const catFixedCostValue = catItems.reduce((s, i) => s + (i.fixedCostValue ?? 0), 0);

        const catTotalPrice = share * totalPrice;
        const catCommissionValue = share * commissionValue;
        const catTaxValue = share * taxValue;
        const catCardValue = share * cardValue;
        const catDiscountValue = share * discountValue;
        const catReferralCommissionValue = share * referralCommissionValue;

        const catNetProfit =
          catTotalPrice - costOfGoods - catCommissionValue - catTaxValue - catCardValue - catFixedCostValue;
        const catNetProfitMargin = catTotalPrice > 0 ? (catNetProfit / catTotalPrice) * 100 : 0;

        const catVariableCosts = catCommissionValue + catTaxValue + catCardValue + catReferralCommissionValue;
        const catContribuicao = catTotalPrice - costOfGoods - catVariableCosts;
        const catContribuicaoPct = catTotalPrice > 0 ? (catContribuicao / catTotalPrice) * 100 : 0;

        return {
          label: CATEGORY_LABELS[key],
          materialCost,
          laborCost,
          materialLines: catItems.flatMap((i) => i.materialBreakdown || []),
          laborLines: catItems.flatMap((i) => i.laborBreakdown || []),
          costOfGoods,
          installationCost: 0,
          assemblyCost,
          taxValue: catTaxValue,
          commissionValue: catCommissionValue,
          discountValue: catDiscountValue,
          cardValue: catCardValue,
          fixedCostValue: catFixedCostValue,
          referralCommissionValue: catReferralCommissionValue,
          totalPrice: catTotalPrice,
          netProfit: catNetProfit,
          netProfitMargin: catNetProfitMargin,
          contribuicao: catContribuicao,
          contribuicaoPct: catContribuicaoPct,
        };
      });

    return { total, categories };
  }, [currentUser?.role, localQuote, safeItems, products, variableExpenses]);

  const totalVariablePercent = useMemo(
    () => (variableExpenses ?? []).filter((e) => e?.type === "percent").reduce((s, e) => s + (Number(e?.value) || 0), 0),
    [variableExpenses]
  );

  // ── Payments linked to this quote ──
  // Só pelo vínculo direto (subcategory "quote:<id>") — o fallback por nome
  // do cliente + número do pedido que existia aqui misturava pagamentos de
  // OUTRO pedido do mesmo cliente (cliente com várias OS acumulava o valor
  // recebido de todas juntas). O vínculo direto já é criado certinho toda
  // vez que o pagamento é lançado por "Nova Receita" aqui dentro do pedido.
  const quotePayments = useMemo(() => {
    // orcamentoId é o vínculo estruturado novo; subcategory "quote:<id>" é
    // o formato antigo (embutido em texto) — mantido como fallback até os
    // lançamentos antigos serem migrados.
    return cashFlow.filter(
      (e) =>
        String((e as any).orcamentoId ?? "") === String(localQuote.id) ||
        (e as any).subcategory === `quote:${localQuote.id}`
    );
  }, [cashFlow, localQuote.id]);

  const totalReceived = useMemo(
    () => quotePayments.filter((e) => (e.type as any) === "Entrada" || e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0),
    [quotePayments]
  );
  // Devoluções ao cliente: Saída no Caixa marcada como "devolucao".
  const quoteRefunds = useMemo(() => quotePayments.filter((e) => e.movementKind === "devolucao"), [quotePayments]);
  const totalRefunded = useMemo(() => quoteRefunds.reduce((s, e) => s + Number(e.amount || 0), 0), [quoteRefunds]);

  // saldo = valor do pedido − recebido + devolvido
  //   > 0 → falta receber | < 0 → crédito do cliente (a devolver) | 0 → quitado
  // Antes era max(0, pedido − recebido), então quando o cliente pagava a mais
  // (ex.: item trocado por um mais barato) o crédito dele sumia da tela.
  const saldo = Number(((localQuote.totalPrice || 0) - totalReceived + totalRefunded).toFixed(2));
  // Diferença abaixo de R$ 0,10 é arredondamento (valor do pedido com fração
  // de centavo) — conta como quitado, não como pendente/crédito.
  const SALDO_TOLERANCIA = 0.1;
  const totalPending = saldo > SALDO_TOLERANCIA ? saldo : 0;
  const customerCredit = saldo < -SALDO_TOLERANCIA ? -saldo : 0;
  const saldoInfo =
    saldo > SALDO_TOLERANCIA
      ? { label: "Pendente", value: saldo, color: "#ef4444" }
      : saldo < -SALDO_TOLERANCIA
      ? { label: "Crédito do cliente / A devolver", value: -saldo, color: "#f59e0b" }
      : { label: "Quitado", value: 0, color: "#22c55e" };
  const netReceived = totalReceived - totalRefunded;
  const receivedPct = localQuote.totalPrice > 0 ? Math.min(100, Math.max(0, (netReceived / localQuote.totalPrice) * 100)) : 0;

  // ── Alterações / devoluções / crédito com fornecedor ──
  const isManager = currentUser?.role === "Admin" || currentUser?.role === "Finance";

  // ── Custos do Caixa vinculados a este pedido (Etapa 7) ──
  const [pedidoCustos, setPedidoCustos] = useState<PedidoCusto[]>([]);
  useEffect(() => {
    if (!showFinances || !isManager) return;
    getPedidoCustos({ quoteId: String(localQuote.id) }).then((r) => { if (r.ok) setPedidoCustos(r.data); });
  }, [showFinances, isManager, localQuote.id]);
  // Só lançamentos que ainda existem no Caixa (excluídos somem daqui).
  const linkedCosts = useMemo(() => {
    const byId = new Map(cashFlow.map((e) => [String(e.id), e]));
    return pedidoCustos
      .map((c) => ({ ...c, entry: byId.get(c.cashflowId) }))
      .filter((c) => c.entry)
      .sort((a, b) => String(b.entry!.date).localeCompare(String(a.entry!.date)));
  }, [pedidoCustos, cashFlow]);
  const totalLinkedCosts = linkedCosts.reduce((s, c) => s + c.amount, 0);
  const [alteracoes, setAlteracoes] = useState<PedidoAlteracao[]>([]);
  const [creditosFornecedor, setCreditosFornecedor] = useState<CreditoFornecedor[]>([]);
  const [showAlteracaoForm, setShowAlteracaoForm] = useState(false);
  const [savingAlteracao, setSavingAlteracao] = useState(false);
  const [viewAlteracoesItemId, setViewAlteracoesItemId] = useState<string | null>(null);
  const [showDevolucaoForm, setShowDevolucaoForm] = useState(false);
  const [savingDevolucao, setSavingDevolucao] = useState(false);
  const [showCreditoForm, setShowCreditoForm] = useState(false);
  const [savingCredito, setSavingCredito] = useState(false);

  useEffect(() => {
    if (!localQuote.id) return;
    getPedidoAlteracoes(String(localQuote.id)).then((r) => r.ok && setAlteracoes(r.data));
    getCreditosFornecedor(String(localQuote.id)).then((r) => r.ok && setCreditosFornecedor(r.data));
  }, [localQuote.id]);

  const pendingSupplierCredits = creditosFornecedor.filter((c) => c.status === "Pendente");
  const totalPendingSupplierCredit = pendingSupplierCredits.reduce((s, c) => s + c.valor, 0);

  const userName = currentUser?.name || "";
  const quoteNum = String(localQuote.quoteNumber ?? localQuote.id);

  // Registra o evento no "Ver histórico do pedido" (com snapshot do pedido).
  const logHistory = (snapshot: Quote, type: string, label: string, description: string) => {
    createQuoteHistoryEntry(String(localQuote.id), snapshot, type, label, { description, userName }).then((r) => {
      if (r.ok && r.data) setHistoryEntries((prev) => [r.data as QuoteHistoryRow, ...prev]);
    });
  };

  const handleSaveAlteracao = async (d: AlteracaoFormData) => {
    if (!d.itemId) return alert("Selecione o item.");
    if (!d.descricaoDepois) return alert("Informe a descrição nova.");
    if (d.descricaoDepois === d.descricaoAntes && Math.abs(d.valorDepois - d.valorAntes) < 0.005) {
      return alert("Nada mudou — altere a descrição ou o valor.");
    }
    setSavingAlteracao(true);
    try {
      const diff = Number((d.valorDepois - d.valorAntes).toFixed(2));
      const r = await createPedidoAlteracao({
        pedidoId: String(localQuote.id),
        itemId: d.itemId,
        antes: { descricao: d.descricaoAntes, valor: d.valorAntes },
        depois: { descricao: d.descricaoDepois, valor: d.valorDepois },
        motivo: d.motivo,
        observacao: d.observacao,
        usuarioNome: userName,
      });
      if (!r.ok) {
        alert(`Não foi possível registrar a alteração: ${(r.error as any)?.message ?? "verifique se o SQL de 2026-10-05 foi rodado"}`);
        return;
      }

      const updated: Quote = {
        ...localQuote,
        items: safeItems.map((i) => (i.id === d.itemId ? { ...i, productName: d.descricaoDepois, price: d.valorDepois } : i)),
        totalPrice: Number(((localQuote.totalPrice || 0) + diff).toFixed(2)),
        subtotal: Number(((localQuote.subtotal || 0) + diff).toFixed(2)),
      };
      const res: any = await onUpdateQuote(updated);
      if (res && res.ok === false) {
        alert(`A alteração foi registrada, mas o pedido não foi atualizado: ${res.error?.message ?? "ver console"}`);
        return;
      }
      setLocalQuote(updated);
      setAlteracoes((prev) => [r.data, ...prev]);
      logHistory(
        updated,
        "alteracao",
        "Alteração",
        `${d.descricaoAntes} (${fmt(d.valorAntes)}) → ${d.descricaoDepois} (${fmt(d.valorDepois)}) · diferença ${fmt(diff)} · ${d.motivo}${d.observacao ? ` · ${d.observacao}` : ""}`
      );
      setShowAlteracaoForm(false);
    } finally {
      setSavingAlteracao(false);
    }
  };

  const handleSaveDevolucao = async (d: DevolucaoFormData) => {
    if (d.valor <= 0) return alert("Informe o valor da devolução.");
    if (!d.data) return alert("Informe a data.");
    if (!d.accountId) return alert("Selecione de qual conta o dinheiro saiu.");
    setSavingDevolucao(true);
    try {
      let attachmentPath: string | undefined;
      if (d.arquivo) {
        try {
          attachmentPath = await uploadComprovante(d.arquivo, String(localQuote.id));
        } catch (err: any) {
          alert(`Não foi possível enviar o comprovante: ${err?.message ?? err}`);
          return;
        }
      }
      const methodMap: Record<string, string> = { Pix: "PIX", Dinheiro: "Dinheiro", Transferência: "Transferência bancária" };
      const r = await createCashFlowEntry({
        type: "Saída",
        amount: d.valor,
        category: "DEDUÇÕES",
        // Ligada a uma alteração: a alteração já reduziu o pedido (e a receita
        // da DRE) — aqui só sai o dinheiro, sem deduzir de novo.
        subcategory: d.alteracaoId ? "devolução de diferença de pedido" : "devoluções de vendas",
        description: `Devolução - Nº ${quoteNum} - ${localQuote.customerName} (${d.forma})${d.observacao ? ` - ${d.observacao}` : ""}`,
        date: d.data,
        orcamentoId: localQuote.id,
        paymentMethod: (methodMap[d.forma] as any) || undefined,
        accountId: d.accountId,
        movementKind: "devolucao",
        attachmentPath,
        pedidoAlteracaoId: d.alteracaoId || undefined,
      });
      if (!r.ok || !r.data) {
        alert(`Não foi possível registrar a devolução: ${(r.error as any)?.message ?? "erro desconhecido"}`);
        return;
      }
      onCashFlowAdded?.(r.data as CashFlowEntry);
      logHistory(
        localQuote,
        "devolucao",
        "Devolução",
        `${fmt(d.valor)} devolvido ao cliente via ${d.forma} em ${fmtDate(d.data)}${d.observacao ? ` · ${d.observacao}` : ""}`
      );
      setShowDevolucaoForm(false);
    } finally {
      setSavingDevolucao(false);
    }
  };

  const handleOpenComprovante = async (path: string) => {
    try {
      window.open(await getComprovanteUrl(path), "_blank");
    } catch (err: any) {
      alert(err?.message ?? "Não foi possível abrir o comprovante.");
    }
  };

  const handleSaveCredito = async (d: { fornecedor: string; valor: number; motivo: string }) => {
    if (!d.fornecedor.trim()) return alert("Informe o fornecedor.");
    if (d.valor <= 0) return alert("Informe o valor.");
    setSavingCredito(true);
    try {
      const r = await createCreditoFornecedor({ pedidoId: String(localQuote.id), ...d, usuarioNome: userName });
      if (!r.ok) {
        alert(`Não foi possível salvar o crédito: ${(r.error as any)?.message ?? "verifique se o SQL de 2026-10-05 foi rodado"}`);
        return;
      }
      setCreditosFornecedor((prev) => [r.data, ...prev]);
      logHistory(localQuote, "credito_fornecedor", "Crédito fornecedor", `${fmt(d.valor)} a receber de ${d.fornecedor}${d.motivo ? ` · ${d.motivo}` : ""}`);
      setShowCreditoForm(false);
    } finally {
      setSavingCredito(false);
    }
  };

  const handleToggleCreditoRecebido = async (c: CreditoFornecedor) => {
    const date = c.status === "Pendente" ? window.prompt("Data do recebimento (AAAA-MM-DD):", todayISO()) : null;
    if (c.status === "Pendente" && !date) return;
    const r = await marcarCreditoRecebido(c.id, c.status === "Pendente" ? date : null);
    if (!r.ok) return alert(`Não foi possível atualizar: ${(r.error as any)?.message ?? ""}`);
    setCreditosFornecedor((prev) => prev.map((x) => (x.id === c.id ? r.data : x)));
    logHistory(
      localQuote,
      "credito_fornecedor",
      "Crédito fornecedor",
      r.data.status === "Recebido"
        ? `${fmt(c.valor)} de ${c.fornecedor} recebido em ${fmtDate(r.data.dataRecebimento)}`
        : `${fmt(c.valor)} de ${c.fornecedor} voltou para pendente`
    );
  };

  // ── Data da venda (linha em "sales") e previsão de entrega ──
  const [savingSaleDate, setSavingSaleDate] = useState(false);
  const handleChangeSaleDate = async (ymd: string) => {
    if (!onChangeSaleDate || ymd === saleDate) return;
    setSavingSaleDate(true);
    try {
      const ok = await onChangeSaleDate(ymd);
      if (!ok) return alert("Não foi possível alterar a data da venda.");
      createQuoteHistoryEntry(String(localQuote.id), localQuote, "data_venda", "Data da venda", {
        description: `Data da venda alterada de ${fmtDate(saleDate)} para ${fmtDate(ymd)}`,
        userName: currentUser?.name || "",
      }).catch(() => {});
    } finally {
      setSavingSaleDate(false);
    }
  };

  // Prazo de entrega (em dias) vem gravado nas observações ("Prazo de
  // entrega: 20 dias"); a previsão sugerida conta a partir da data da VENDA
  // (ou do orçamento, se ainda não virou venda), pulando fim de semana.
  const leadDays = Number(String(localQuote.measurementNotes || "").match(/Prazo de entrega:\s*(\d+)/i)?.[1] || 0);
  const suggestedDeliveryDate = (() => {
    const base = (hasSale && saleDate) || String(localQuote.date || "").slice(0, 10);
    if (!leadDays || !base) return "";
    const d = new Date(base + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + leadDays);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // ── Recibo de pagamento ──
  const [selectedPayment, setSelectedPayment] = useState<CashFlowEntry | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  // Forma de pagamento: campo estruturado, ou o que vem entre parênteses no
  // fim da descrição ("Recebimento - Nº 336 - Fulano (PIX)") em lançamentos antigos.
  const paymentMethodOf = (e: CashFlowEntry): string => {
    if (e.paymentMethod) return String(e.paymentMethod) + (e.installments ? ` ${e.installments}x` : "");
    const m = String(e.description || "").match(/\(([^()]+)\)\s*$/);
    return m ? m[1].trim() : "";
  };

  const handleGenerateReceipt = async (e: CashFlowEntry) => {
    setGeneratingReceipt(true);
    try {
      const doc = await generateReceiptPDF({
        company: companySettings,
        customerName: localQuote.customerName || clientInfo?.name || "",
        customerDocument: findCpfCnpj(clientInfo?.notes),
        orderNumber: String(localQuote.quoteNumber ?? localQuote.id),
        items: Array.isArray(localQuote.items) ? localQuote.items : [],
        amount: Number(e.amount || 0),
        paymentDate: String(e.date || "").slice(0, 10),
        paymentMethod: paymentMethodOf(e) || String(localQuote.paymentMethod || ""),
        orderTotal: Number(localQuote.totalPrice || 0),
        totalReceived,
      });
      window.open(doc.output("bloburl").toString(), "_blank");
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar o recibo.");
    } finally {
      setGeneratingReceipt(false);
    }
  };

  // ── Save quote ──
  const handleSave = async () => {
    setSaving(true);
    await onUpdateQuote(localQuote);
    setSaving(false);
  };

  // ── Visualizar / Imprimir PDF do orçamento ──
  const handleViewPdf = async () => {
    setGeneratingPdf(true);
    try {
      const doc = await generateQuotePDF(localQuote, companySettings, {
        hidePrice: false,
        hideMeasures: false,
        // Cliente não deve ver o detalhamento interno de cálculo (cor, área,
        // etc.) que a descrição do item guarda — só o nome do produto e o
        // valor. Mesmo padrão do preview em NewQuote.tsx.
        hideDetailedDescription: true,
        isServiceOrder: hasSale,
      });
      const url = doc.output("bloburl");
      window.open(url.toString(), "_blank");
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar o PDF do orçamento.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ── Histórico de alterações ──
  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    // Recarrega sempre ao abrir — eventos novos (alteração/devolução) já
    // entram na lista local, mas sem os mais antigos se ainda não tinha aberto.
    if (next) {
      setLoadingHistory(true);
      const r = await getQuoteHistory(String(localQuote.id));
      if (r.ok) setHistoryEntries(r.data);
      setLoadingHistory(false);
    }
  };

  const handleViewHistoryPdf = async (entry: QuoteHistoryRow) => {
    setGeneratingHistoryPdfId(entry.id);
    try {
      const doc = await generateQuotePDF(entry.snapshot, companySettings, {
        hidePrice: false,
        hideMeasures: false,
        hideDetailedDescription: true,
        // Versão salva depois de fechada (aprovada, com venda) sai como OS.
        isServiceOrder: hasSale && entry.snapshot?.status === "Aprovado",
      });
      const url = doc.output("bloburl");
      window.open(url.toString(), "_blank");
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar o PDF dessa versão.");
    } finally {
      setGeneratingHistoryPdfId(null);
    }
  };

  // ── Save payment ──
  const handleSavePayment = async () => {
    if (payAmount <= 0) return alert("Informe um valor válido.");
    if (payMethod === "Cartão" && !payCardType) {
      return alert("Selecione o tipo do cartão (débito, crédito à vista ou parcelado).");
    }
    if (payMethod === "Cartão" && !payAccountId) {
      return alert("Selecione qual maquininha recebeu o pagamento.");
    }
    setSavingPayment(true);
    const quoteNum = localQuote.quoteNumber ?? localQuote.id;
    const methodLabel = buildPaymentMethodLabel(payMethod, payCardType || undefined);
    const isParcelado = payMethod === "Cartão" && payCardType === "credito_parcelado";
    const methodText = isParcelado ? `${methodLabel} ${payInstallments}x` : methodLabel;
    const entry: Omit<CashFlowEntry, "id"> = {
      type: "Entrada" as any,
      amount: payAmount,
      category: SALE_RECEIPT_CATEGORY,
      subcategory: saleReceiptSubcategory(methodLabel),
      description: `Recebimento - Nº ${quoteNum} - ${localQuote.customerName}${payReference ? ` - ${payReference}` : ""} (${methodText})`,
      date: payReceived ? payReceivedDate : payDate,
      orcamentoId: localQuote.id,
      paymentMethod: methodLabel as any,
      installments: isParcelado ? payInstallments : undefined,
      accountId: payAccountId || undefined,
    };
    const r = await createCashFlowEntry(entry);
    setSavingPayment(false);
    if (r.ok && r.data) {
      onCashFlowAdded?.(r.data as CashFlowEntry);

      // Conclusão automática: se essa venda estava "Entregue – a receber"
      // (já tem data de entrega, ainda não concluída) e esse pagamento
      // recebido fecha o saldo em 100%, conclui sozinha com a data do
      // pagamento — sem exigir passo manual.
      if (payReceived && localQuote.deliveredAt && !localQuote.saleCompleted) {
        const novoTotal = totalReceived + payAmount;
        if (novoTotal >= Number(localQuote.totalPrice || 0) - 0.005) {
          await onUpdateQuote({ ...localQuote, saleCompleted: true, concludedAt: payReceivedDate });
        }
      }

      setShowAddPayment(false);
      setPayAmount(0);
      setPayAmountInput(formatMoneyInputBR(0));
      setPayDate(todayISO());
      setPayReceivedDate(todayISO());
      setPayReference("");
      setPayCardType("");
      setPayInstallments(2);
      setPayAccountId("");
    } else {
      alert("Erro ao salvar pagamento. Tente novamente.");
    }
  };

  // ── Address ──
  // O cadastro de Clientes salva o endereço como texto único (string), não
  // como objeto {street, number, ...} — getClientAddressLabel já lida com
  // os dois formatos (cadastros antigos podem ter vindo como objeto).
  const addrLabel = clientInfo ? getClientAddressLabel(clientInfo) : "";
  const addrParts = addrLabel && addrLabel !== "Endereço não informado" ? addrLabel : null;

  // Observações de medidas vêm salvas junto com "Prazo de entrega:"/"Data
  // prevista de entrega:" embutidos em texto (ver NewQuote.tsx) — tira essas
  // linhas de meta antes de mostrar, senão duplica a info que já aparece em
  // "Previsão de entrega" acima.
  const displayMeasurementNotes = String(localQuote.measurementNotes || "")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toUpperCase();
      return !normalized.startsWith("PRAZO DE ENTREGA:") && !normalized.startsWith("DATA PREVISTA DE ENTREGA:");
    })
    .join("\n")
    .trim();

  const internalStyle = INTERNAL_STATUS_STYLE[(localQuote.internalStatus as QuoteInternalStatus) ?? "Pedido"] ?? INTERNAL_STATUS_STYLE["Pedido"];
  const clientStyle = CLIENT_STATUS_STYLE[localQuote.status] ?? CLIENT_STATUS_STYLE["Pendente"];

  // ── Group payments by date ──
  const groupedPayments = useMemo(() => {
    const groups: Record<string, CashFlowEntry[]> = {};
    // Recebimentos + devoluções (outras saídas ligadas ao pedido não são receita).
    quotePayments.filter((p) => p.type === "Entrada" || p.movementKind === "devolucao").forEach((p) => {
      const key = p.date || "sem data";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [quotePayments]);

  const formatGroupDate = (ymd: string) => {
    if (ymd === "sem data") return "Sem data";
    const d = new Date(ymd + "T12:00:00");
    if (isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  // ── Render ──
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 60px" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, color: "#a9b8dc", fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          {backLabel}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Venda já feita (registro de venda ou orçamento Aprovado, que já
              aparece no painel de Vendas): some o botão. */}
          {onGenerateSale && !hasSale && localQuote.status !== "Aprovado" && (
            <button
              onClick={handleGenerateSale}
              disabled={hasSale || generatingSale}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: hasSale ? "#16305F" : "#22c55e",
                border: hasSale ? "1px solid #4a68a8" : "1px solid #22c55e",
                borderRadius: 8,
                padding: "8px 18px",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: hasSale || generatingSale ? "default" : "pointer",
                opacity: generatingSale ? 0.7 : 1,
                boxShadow: hasSale ? "none" : "0 0 0 3px rgba(34,197,94,0.25)",
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              {hasSale ? "Venda gerada ✓" : generatingSale ? "Gerando…" : "Gerar Venda"}
            </button>
          )}
          {onEditQuote && (
            <button
              onClick={onEditQuote}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#16305F", border: "1px solid #4a68a8", borderRadius: 8, padding: "8px 16px", color: "#dde4f5", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              {hasSale ? "Editar Venda" : "Editar Orçamento"}
            </button>
          )}
          <button
            onClick={handleViewPdf}
            disabled={generatingPdf}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, padding: "8px 16px", color: "#dde4f5", fontWeight: 600, fontSize: 14, cursor: generatingPdf ? "default" : "pointer", opacity: generatingPdf ? 0.7 : 1 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            {generatingPdf ? "Gerando…" : "Imprimir / PDF"}
          </button>
          {saving ? (
            <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Salvando…</span>
          ) : savedOk ? (
            <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>✓ Salvo</span>
          ) : isDirty ? (
            <button onClick={handleSave} disabled={saving} style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Salvar alterações
            </button>
          ) : null}
        </div>
      </div>

      {/* ── ALERTAS: crédito do cliente / crédito com fornecedor ── */}
      {customerCredit > 0.005 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#f59e0b1f", border: "1px solid #f59e0b88", borderRadius: 14, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ color: "#f59e0b", fontSize: 14 }}>
            ⚠️ Cliente tem <strong>{fmt(customerCredit)}</strong> de crédito a devolver neste pedido.
          </div>
          {isManager && (
            <button
              onClick={() => { setShowFinances(true); setPaymentTab("receitas"); setShowDevolucaoForm(true); }}
              style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Registrar devolução
            </button>
          )}
        </div>
      )}
      {totalPendingSupplierCredit > 0.005 && (
        <div style={{ background: "#8fa8ff1f", border: "1px solid #8fa8ff88", borderRadius: 14, padding: "12px 16px", marginBottom: 12, color: "#c8d4f0", fontSize: 14 }}>
          🏭 Crédito a receber de fornecedor: <strong style={{ color: "#8fa8ff" }}>{fmt(totalPendingSupplierCredit)}</strong>
          {" "}({pendingSupplierCredits.map((c) => c.fornecedor).join(", ")})
        </div>
      )}

      {/* ── CARD PRINCIPAL ── */}
      <div style={{ background: "#1E3D7A", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>

        {/* ── CABEÇALHO ── */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #3a5590" }}>
          <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Orçamento</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f5f6fa" }}>
            N° {localQuote.quoteNumber ?? "—"}
            <span style={{ fontSize: 14, fontWeight: 400, color: "#a9b8dc", marginLeft: 10 }}>
              / {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
            </span>
          </div>

          {/* Status row */}
          <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Status do cliente</div>
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={localQuote.status}
                  onChange={(e) => handleStatusChange("status", e.target.value)}
                  style={{ background: clientStyle.bg, color: clientStyle.color, border: `1px solid ${clientStyle.color}55`, borderRadius: 20, padding: "7px 30px 7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", outline: "none", appearance: "none" }}
                >
                  {CLIENT_STATUS_OPTIONS.map((s) => <option key={s} value={s} style={{ background: "#1E3D7A" }}>{s}</option>)}
                </select>
                <svg width="10" height="10" fill="none" stroke={clientStyle.color} strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Status interno (produção)</div>
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={localQuote.internalStatus ?? "Pedido"}
                  onChange={(e) => handleStatusChange("internalStatus", e.target.value)}
                  style={{ background: internalStyle.bg, color: internalStyle.color, border: `1px solid ${internalStyle.color}55`, borderRadius: 20, padding: "7px 30px 7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", outline: "none", appearance: "none" }}
                >
                  {INTERNAL_STATUS_OPTIONS.map((s) => <option key={s} value={s} style={{ background: "#1E3D7A" }}>{s}</option>)}
                </select>
                <svg width="10" height="10" fill="none" stroke={internalStyle.color} strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            {(localQuote.salesperson || currentUser?.role === "Admin") && (
              <div>
                <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Vendedora</div>
                {currentUser?.role === "Admin" && editingSalesperson ? (
                  <select
                    autoFocus
                    disabled={savingSalesperson}
                    defaultValue={localQuote.salesperson || ""}
                    onChange={(e) => handleChangeSalesperson(e.target.value)}
                    onBlur={() => setEditingSalesperson(false)}
                    style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 20, padding: "7px 14px", fontWeight: 700, fontSize: 12, color: "#dde4f5" }}
                  >
                    <option value="" disabled>Selecione...</option>
                    {sellersList.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <div
                    onClick={() => currentUser?.role === "Admin" && setEditingSalesperson(true)}
                    style={{
                      background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 20, padding: "7px 14px",
                      fontWeight: 700, fontSize: 12, color: "#dde4f5", display: "inline-block",
                      cursor: currentUser?.role === "Admin" ? "pointer" : "default",
                    }}
                    title={currentUser?.role === "Admin" ? "Clique para trocar a vendedora" : undefined}
                  >
                    {localQuote.salesperson || "Sem vendedora"}
                    {currentUser?.role === "Admin" && " ✎"}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Datas */}
          <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            {hasSale && saleDate ? (
              <>
                {/* Pedido que virou venda: "Data da venda" é a da VENDA (a mesma
                    da lista de Vendas/Comissões), não a de criação do orçamento
                    — antes este campo mostrava a do orçamento com o nome errado. */}
                <div>
                  <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Data da venda</div>
                  <input
                    type="date"
                    value={saleDate}
                    disabled={savingSaleDate || !onChangeSaleDate}
                    onChange={(e) => e.target.value && handleChangeSaleDate(e.target.value)}
                    style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#dde4f5", fontSize: 13, padding: "7px 10px", outline: "none", opacity: savingSaleDate ? 0.6 : 1 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Data do orçamento</div>
                  <div style={{ fontSize: 13, color: "#a9b8dc", padding: "8px 2px" }}>{fmtDate(localQuote.date)}</div>
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Data do orçamento</div>
                <input
                  type="date"
                  value={isoToInput(localQuote.date)}
                  onChange={(e) => setLocalQuote((p) => ({ ...p, date: e.target.value }))}
                  style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#dde4f5", fontSize: 13, padding: "7px 10px", outline: "none" }}
                />
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Previsão de entrega</div>
              <input
                type="date"
                value={isoToInput(localQuote.deliveryDate)}
                onChange={(e) => setLocalQuote((p) => ({ ...p, deliveryDate: e.target.value }))}
                style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#dde4f5", fontSize: 13, padding: "7px 10px", outline: "none" }}
              />
              {suggestedDeliveryDate && suggestedDeliveryDate !== isoToInput(localQuote.deliveryDate) && (
                <button
                  type="button"
                  onClick={() => setLocalQuote((p) => ({ ...p, deliveryDate: suggestedDeliveryDate }))}
                  title={`Prazo de ${leadDays} dias contado a partir da data da venda`}
                  style={{ display: "block", marginTop: 5, background: "none", border: "none", color: "#8fa8ff", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  ↻ Usar {fmtDate(suggestedDeliveryDate)} ({leadDays} dias após a venda)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── CLIENTE ── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #3a5590" }}>
          <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Cliente</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f5f6fa", marginBottom: 6 }}>
            {localQuote.customerName || "—"}
          </div>
          {clientInfo?.phone && (
            <div style={{ fontSize: 13, color: "#b8c4e0", display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {clientInfo.phone}
            </div>
          )}
          {clientInfo?.email && (
            <div style={{ fontSize: 13, color: "#b8c4e0", display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {clientInfo.email}
            </div>
          )}
          {addrParts && (
            <div style={{ fontSize: 13, color: "#b8c4e0", display: "flex", alignItems: "flex-start", gap: 7, marginTop: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{addrParts}{clientInfo?.address?.referencePoint && <span style={{ color: "#a9b8dc" }}> — Ref: {clientInfo.address.referencePoint}</span>}</span>
            </div>
          )}
        </div>

        {/* ── OBSERVAÇÕES ── */}
        {(displayMeasurementNotes || localQuote.assemblyNotes) && (
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #3a5590", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {displayMeasurementNotes && (
              <div>
                <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Observações de Medidas</div>
                <div style={{ fontSize: 13, color: "#dde4f5", whiteSpace: "pre-wrap" }}>{displayMeasurementNotes}</div>
              </div>
            )}
            {localQuote.assemblyNotes && (
              <div>
                <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Observações de Montagem</div>
                <div style={{ fontSize: 13, color: "#dde4f5", whiteSpace: "pre-wrap" }}>{localQuote.assemblyNotes}</div>
              </div>
            )}
          </div>
        )}

        {/* ── PRODUTOS ── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #3a5590" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Produtos ({safeItems.length})
            </div>
            {isManager && safeItems.length > 0 && (
              <button
                onClick={() => setShowAlteracaoForm(true)}
                style={{ background: "#16305F", border: "1px solid #4a68a8", borderRadius: 8, padding: "6px 12px", color: "#dde4f5", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
              >
                ✏️ Registrar alteração
              </button>
            )}
          </div>
          {safeItems.length === 0 ? (
            <div style={{ color: "#a9b8dc", fontSize: 13 }}>Nenhum produto neste orçamento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {safeItems.map((item) => {
                const wDisp = item.width >= 1000 ? `${(item.width / 1000).toFixed(2).replace(".", ",")}m` : item.width > 0 ? `${item.width}mm` : null;
                const hDisp = item.height >= 1000 ? `${(item.height / 1000).toFixed(2).replace(".", ",")}m` : item.height > 0 ? `${item.height}mm` : null;
                const cleanDesc = (item.description || "").split(" | ").filter((p) => !p.toLowerCase().startsWith("acréscimo por serviço")).join(" | ");
                return (
                  <div key={item.id} style={{ background: "#2C53A0", borderRadius: 12, padding: "14px 16px", border: "1px solid #4a68a8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#f5f6fa", fontSize: 15, marginBottom: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {item.productName}
                          {alteracoes.some((a) => a.itemId === item.id) && (
                            <button
                              onClick={() => setViewAlteracoesItemId(item.id)}
                              title="Ver antes/depois"
                              style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b88", borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}
                            >
                              Alterado
                            </button>
                          )}
                        </div>
                        {(wDisp || hDisp) && (
                          <div style={{ fontSize: 12, color: "#b8c4e0", marginBottom: 3 }}>
                            📐 {[hDisp, wDisp].filter(Boolean).join(" × ")}
                          </div>
                        )}
                        {item.selectedColor && item.selectedColor !== "Padrão" && (
                          <div style={{ fontSize: 12, color: "#8fa8ff", display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8fa8ff", display: "inline-block" }} />
                            {item.selectedColor}
                          </div>
                        )}
                        {cleanDesc && (
                          <div style={{ fontSize: 12, color: "#a9b8dc", marginTop: 3 }}>{cleanDesc}</div>
                        )}
                        <div style={{ fontSize: 11, color: "#a9b8dc", marginTop: 4 }}>Qtd: {item.quantity}</div>
                        {(item.internalDetail || (item.montagens && item.montagens.length > 0)) && (
                          <div
                            style={{
                              marginTop: 6,
                              padding: "6px 10px",
                              background: "#1e2f5c",
                              border: "1px dashed #4a68a8",
                              borderRadius: 8,
                              fontSize: 11,
                              color: "#c8d4f0",
                              whiteSpace: "pre-line",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "#8fa8ff" }}>
                              🔒 Detalhamento interno (não aparece no PDF do cliente)
                            </span>
                            {item.montagens && item.montagens.length > 0 && (
                              <>
                                {"\n"}
                                {item.montagens
                                  .map((m) => `🔧 Montagem: ${m.name}${m.price > 0 ? ` — ${fmt(m.price)}` : ""}`)
                                  .join("\n")}
                              </>
                            )}
                            {item.internalDetail && (
                              <>
                                {"\n"}
                                {item.internalDetail}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{fmt(item.price)}</div>
                        {item.quantity > 1 && (
                          <div style={{ fontSize: 11, color: "#a9b8dc" }}>
                            {fmt(item.price / item.quantity)} / un
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── TOTAIS ── */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #3a5590" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#a9b8dc", fontSize: 13 }}>Subtotal (produtos)</span>
            <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(localQuote.subtotal)}</span>
          </div>

          {(localQuote.freight > 0 ||
            localQuote.installation > 0 ||
            (localQuote.feedingCost || 0) > 0 ||
            (localQuote.referralCommissionValue || 0) > 0 ||
            (localQuote.priceDifference || 0) !== 0 ||
            localQuote.discount > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px dashed #3a5590" }}>
              <span style={{ color: "#8fa8ff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Itens adicionais
              </span>
              {localQuote.freight > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#a9b8dc", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                    Frete
                    {(localQuote.freightItems?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowFreightDetail(true)}
                        style={{ background: "transparent", border: "none", color: "#8fa8ff", fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                      >
                        Ver detalhamento
                      </button>
                    )}
                  </span>
                  <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(localQuote.freight)}</span>
                </div>
              )}
              {localQuote.installation > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#a9b8dc", fontSize: 13 }}>Instalação</span>
                  <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(localQuote.installation)}</span>
                </div>
              )}
              {(localQuote.feedingCost || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#a9b8dc", fontSize: 13 }}>Alimentação</span>
                  <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(localQuote.feedingCost || 0)}</span>
                </div>
              )}
              {(localQuote.referralCommissionValue || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#a9b8dc", fontSize: 13 }}>Comissão de indicação</span>
                  <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(localQuote.referralCommissionValue || 0)}</span>
                </div>
              )}
              {(localQuote.priceDifference || 0) !== 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#a9b8dc", fontSize: 13 }}>Ajuste de preço</span>
                  <span style={{ color: (localQuote.priceDifference || 0) < 0 ? "#ef4444" : "#dde4f5", fontSize: 13 }}>
                    {(localQuote.priceDifference || 0) < 0 ? "-" : ""}{fmt(Math.abs(localQuote.priceDifference || 0))}
                  </span>
                </div>
              )}
            </div>
          )}

          {(() => {
            const totalComAdicionais =
              localQuote.subtotal +
              localQuote.freight +
              localQuote.installation +
              (localQuote.feedingCost || 0) +
              (localQuote.referralCommissionValue || 0) +
              (localQuote.priceDifference || 0);
            const hasAdicionais = totalComAdicionais !== localQuote.subtotal;
            return (
              <>
                {hasAdicionais && (
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 10, borderTop: "1px dashed #3a5590" }}>
                    <span style={{ color: "#a9b8dc", fontSize: 13 }}>Total com adicionais</span>
                    <span style={{ color: "#dde4f5", fontSize: 13 }}>{fmt(totalComAdicionais)}</span>
                  </div>
                )}
                {localQuote.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ color: "#a9b8dc", fontSize: 13 }}>Desconto</span>
                    <span style={{ color: "#ef4444", fontSize: 13 }}>-{fmt(localQuote.discount)}</span>
                  </div>
                )}
              </>
            );
          })()}

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, marginTop: 8, borderTop: "1px solid #3a5590" }}>
            <span style={{ color: "#f5f6fa", fontSize: 16, fontWeight: 700 }}>Total</span>
            <span style={{ color: "#22c55e", fontSize: 20, fontWeight: 800 }}>{fmt(localQuote.totalPrice)}</span>
          </div>
        </div>

        {/* ── FORMA DE PAGAMENTO ── */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #3a5590", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="15" height="15" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            <span style={{ fontSize: 12, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forma de pagamento</span>
          </div>
          <select
            value={localQuote.paymentMethod}
            onChange={(e) => setLocalQuote((p) => ({ ...p, paymentMethod: e.target.value as any }))}
            style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#dde4f5", fontSize: 13, padding: "7px 10px", outline: "none" }}
          >
            {PAYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* ── RESUMO FINANCEIRO ── */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Resumo financeiro do pedido</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 2 }}>Valor do pedido</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#dde4f5" }}>{fmt(localQuote.totalPrice)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 2 }}>Recebido</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#22c55e" }}>{fmt(totalReceived)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 2 }}>Devolvido</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: totalRefunded > 0 ? "#f59e0b" : "#a9b8dc" }}>{fmt(totalRefunded)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 2 }}>{saldoInfo.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: saldoInfo.color }}>{fmt(saldoInfo.value)}</div>
            </div>
          </div>
          <div style={{ height: 8, background: "#3a5590", borderRadius: 4, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ height: "100%", width: `${receivedPct}%`, background: receivedPct >= 100 ? "#22c55e" : "#8fa8ff", borderRadius: 4, transition: "width 0.4s" }} />
          </div>
          <button
            onClick={() => setShowFinances(true)}
            style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 12, padding: "14px 18px", color: "#dde4f5", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#8fa8ff")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#4a68a8")}
          >
            Ver finanças do pedido
            <svg width="16" height="16" fill="none" stroke="#8fa8ff" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>

          <button
            onClick={toggleHistory}
            style={{ width: "100%", marginTop: 10, background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 12, padding: "14px 18px", color: "#dde4f5", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#8fa8ff")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#4a68a8")}
          >
            Ver histórico do pedido
            <svg width="16" height="16" fill="none" stroke="#8fa8ff" strokeWidth="2.5" viewBox="0 0 24 24" style={{ transform: showHistory ? "rotate(90deg)" : undefined, transition: "transform 0.2s" }}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>

          {showHistory && (
            <div style={{ marginTop: 10, background: "#16305F", border: "1px solid #3a5590", borderRadius: 12, padding: 14 }}>
              {loadingHistory ? (
                <p style={{ color: "#a9b8dc", fontSize: 13 }}>Carregando…</p>
              ) : historyEntries.length === 0 ? (
                <p style={{ color: "#a9b8dc", fontSize: 13 }}>
                  Nenhuma alteração registrada ainda — o histórico começa a partir da próxima vez que este orçamento for editado e salvo.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f2549", borderRadius: 10, padding: "10px 14px", gap: 10 }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {entry.event_label && (
                          <span
                            style={{
                              alignSelf: "flex-start",
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: (HISTORY_EVENT_COLORS[entry.event_type ?? ""] ?? "#22c55e") + "22",
                              color: HISTORY_EVENT_COLORS[entry.event_type ?? ""] ?? "#22c55e",
                            }}
                          >
                            {entry.event_label}
                          </span>
                        )}
                        {entry.event_description && (
                          <span style={{ color: "#f5f6fa", fontSize: 13 }}>{entry.event_description}</span>
                        )}
                        <span style={{ color: entry.event_description ? "#a9b8dc" : "#dde4f5", fontSize: entry.event_description ? 11 : 13 }}>
                          {new Date(entry.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          {entry.created_by_name ? ` · ${entry.created_by_name}` : ""}
                        </span>
                      </div>
                      <button
                        onClick={() => handleViewHistoryPdf(entry)}
                        disabled={generatingHistoryPdfId === entry.id}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #4a68a8", borderRadius: 8, padding: "6px 12px", color: "#8fa8ff", fontSize: 12, fontWeight: 600, cursor: generatingHistoryPdfId === entry.id ? "default" : "pointer", whiteSpace: "nowrap" }}
                      >
                        {generatingHistoryPdfId === entry.id ? "Gerando…" : "Abrir PDF desta versão"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DETALHAMENTO FINANCEIRO (ADMIN) ── */}
      {adminBreakdown && (() => {
        const row = (label: string, value: number, color = "#dde4f5") => (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#a9b8dc", fontSize: 13 }}>{label}</span>
            <span style={{ color, fontSize: 13, fontWeight: 600 }}>{fmt(value)}</span>
          </div>
        );

        const rowWithDetail = (
          label: string,
          value: number,
          onOpenDetail: () => void,
          hasLines: boolean,
          color = "#dde4f5"
        ) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#a9b8dc", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {label}
              {hasLines && (
                <button
                  type="button"
                  onClick={onOpenDetail}
                  title="Ver detalhamento"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#8fa8ff",
                    background: "#1e2f5c",
                    border: "1px solid #3a5590",
                    borderRadius: 999,
                    padding: "1px 8px",
                    cursor: "pointer",
                  }}
                >
                  ver detalhamento
                </button>
              )}
            </span>
            <span style={{ color, fontSize: 13, fontWeight: 600 }}>{fmt(value)}</span>
          </div>
        );

        const renderPanel = (title: string, d: (typeof adminBreakdown)["total"]) => (
          <div
            key={title}
            style={{
              flex: "1 1 260px",
              minWidth: 260,
              background: "#16305F",
              border: "1px solid #f59e0b55",
              borderLeft: "4px solid #f59e0b",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 12 }}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rowWithDetail(
                "Custo matéria-prima",
                d.materialCost,
                () => setDetailModal({ type: "material", title: `Matéria-prima — ${title}`, lines: d.materialLines }),
                d.materialLines.length > 0
              )}
              {d.laborCost > 0 &&
                rowWithDetail(
                  "Mão de obra",
                  d.laborCost,
                  () => setDetailModal({ type: "labor", title: `Mão de obra — ${title}`, lines: d.laborLines }),
                  d.laborLines.length > 0
                )}
              <div style={{ borderTop: "1px solid #3a5590", paddingTop: 6, marginTop: 2 }}>
                {row("CMV total", d.costOfGoods, "#f5f6fa")}
              </div>
              {d.installationCost > 0 && row("Custo da instalação", d.installationCost)}
              {d.assemblyCost > 0 && row("Custo de montagem", d.assemblyCost)}
              {d.taxValue > 0 && row("Impostos", d.taxValue)}
              {d.commissionValue > 0 && row("Comissão vendedora", d.commissionValue)}
              {d.discountValue > 0 && row("Desconto", -d.discountValue, "#22c55e")}
              {d.cardValue > 0 && row("Taxa de cartão", d.cardValue, "#ef4444")}
              {d.fixedCostValue > 0 && row("Custos fixos", d.fixedCostValue)}
              {d.referralCommissionValue > 0 && row("Comissão de indicação", d.referralCommissionValue)}

              <div style={{ display: "flex", justifyContent: "space-between", background: "#2C53A0", borderRadius: 8, padding: "6px 10px", marginTop: 6 }}>
                <span style={{ color: "#dde4f5", fontSize: 13, fontWeight: 700 }}>Preço total</span>
                <span style={{ color: "#8fa8ff", fontSize: 13, fontWeight: 800 }}>{fmt(d.totalPrice)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #3a5590", paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: d.netProfit >= 0 ? "#22c55e" : "#ef4444", fontSize: 13, fontWeight: 700 }}>Lucro líquido estimado</span>
                <span style={{ color: d.netProfit >= 0 ? "#22c55e" : "#ef4444", fontSize: 13, fontWeight: 800 }}>{fmt(d.netProfit)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: d.netProfit >= 0 ? "#22c55e" : "#ef4444", fontSize: 12, fontWeight: 600 }}>Margem de lucro</span>
                <span style={{ color: d.netProfit >= 0 ? "#22c55e" : "#ef4444", fontSize: 12, fontWeight: 600 }}>{d.netProfitMargin.toFixed(2)}%</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
                <span style={{ color: "#dde4f5", fontSize: 12, fontWeight: 600 }}>Margem de contribuição</span>
                <span style={{ color: "#dde4f5", fontSize: 12, fontWeight: 600 }}>
                  {fmt(d.contribuicao)} <span style={{ color: "#a9b8dc", fontWeight: 400 }}>({d.contribuicaoPct.toFixed(2)}%)</span>
                </span>
              </div>
            </div>
          </div>
        );

        return (
          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 16 }}>
            {renderPanel("Total do Orçamento (Admin)", adminBreakdown.total)}
            {adminBreakdown.categories.length > 1 &&
              adminBreakdown.categories.map((cat) => renderPanel(cat.label, cat))}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DRAWER — FINANÇAS DO PEDIDO                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showFinances && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} onClick={() => { setShowFinances(false); setShowAddPayment(false); }} />

          <div style={{ position: "relative", width: "100%", maxWidth: 480, background: "#16305F", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>

            {/* drawer header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #3a5590", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, background: "#16305F", zIndex: 2 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f6fa" }}>Finanças do Pedido</div>
                <div style={{ fontSize: 12, color: "#a9b8dc", marginTop: 2 }}>
                  N° {localQuote.quoteNumber ?? "—"} - {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowAddPayment(true)}
                  style={{ background: "#22c55e", border: "none", borderRadius: 8, width: 36, height: 36, color: "#fff", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                  title="Novo recebimento"
                >+</button>
                <button onClick={() => { setShowFinances(false); setShowAddPayment(false); }} style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, width: 36, height: 36, color: "#b8c4e0", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            </div>

            {/* tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #3a5590", flexShrink: 0 }}>
              {(["receitas", "despesas"] as const).map((tab) => (
                <button key={tab} onClick={() => setPaymentTab(tab)}
                  style={{ flex: 1, padding: "13px", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: paymentTab === tab ? "#8fa8ff" : "#a9b8dc", borderBottom: paymentTab === tab ? "2px solid #8fa8ff" : "2px solid transparent", textTransform: "capitalize" }}>
                  {tab === "receitas" ? "Receitas" : "Despesas"}
                </button>
              ))}
            </div>

            {/* receitas */}
            {paymentTab === "receitas" && (
              <div style={{ padding: "16px 20px", flex: 1 }}>

                {/* Resumo valor pedido */}
                <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #3a5590" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dde4f5", marginBottom: 12 }}>Resumo do valor do pedido</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#a9b8dc" }}>Valor do pedido</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{fmt(localQuote.totalPrice)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#a9b8dc" }}>{saldoInfo.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: saldoInfo.color }}>{fmt(saldoInfo.value)}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: "#3a5590", borderRadius: 3, overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${receivedPct}%`, background: "#8fa8ff", borderRadius: 3 }} />
                  </div>
                </div>

                {/* Receitas do pedido */}
                <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: "1px solid #3a5590" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dde4f5", marginBottom: 12 }}>Receitas do pedido</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#a9b8dc" }}>Total de receitas</span>
                    <span style={{ fontSize: 13, color: "#dde4f5", fontWeight: 600 }}>{fmt(totalReceived)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#a9b8dc" }}>Recebido</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{fmt(totalReceived)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#a9b8dc" }}>Devolvido</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: totalRefunded > 0 ? "#f59e0b" : "#a9b8dc" }}>{fmt(totalRefunded)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#a9b8dc" }}>{saldoInfo.label === "Pendente" ? "A receber" : saldoInfo.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: saldoInfo.color }}>{fmt(saldoInfo.value)}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: "#3a5590", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${receivedPct}%`, background: "#22c55e", borderRadius: 3 }} />
                  </div>
                </div>

                {isManager && (
                  <button
                    onClick={() => setShowDevolucaoForm(true)}
                    style={{ width: "100%", marginBottom: 16, background: customerCredit > 0.005 ? "#f59e0b" : "#2C53A0", border: customerCredit > 0.005 ? "none" : "1px solid #4a68a8", borderRadius: 10, padding: "10px 14px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    ↩ Registrar devolução{customerCredit > 0.005 ? ` (${fmt(customerCredit)})` : ""}
                  </button>
                )}

                {/* Histórico de pagamentos */}
                {groupedPayments.length === 0 ? (
                  <div style={{ color: "#a9b8dc", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
                    Nenhum pagamento registrado ainda.<br />
                    <span style={{ fontSize: 12 }}>Clique em + para adicionar o primeiro recebimento.</span>
                  </div>
                ) : (
                  groupedPayments.map(([date, entries]) => (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#8fa8ff", fontWeight: 600, marginBottom: 8, textTransform: "capitalize" }}>{formatGroupDate(date)}</div>
                      {entries.map((e) => e.movementKind === "devolucao" ? (
                        <div
                          key={e.id}
                          style={{ background: "#1E3D7A", borderRadius: 10, padding: "12px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #3a5590", borderLeft: "3px solid #f59e0b" }}
                        >
                          <div>
                            <div style={{ fontSize: 13, color: "#f5f6fa", fontWeight: 600 }}>Devolução ao cliente</div>
                            <div style={{ fontSize: 11, color: "#a9b8dc", marginTop: 2 }}>
                              {fmtDate(e.date)}
                              {e.attachmentPath && (
                                <button
                                  onClick={() => handleOpenComprovante(e.attachmentPath!)}
                                  style={{ marginLeft: 8, background: "none", border: "none", color: "#8fa8ff", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                                >
                                  📎 comprovante
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>-{fmt(e.amount)}</div>
                            <div style={{ fontSize: 10, background: "#f59e0b22", color: "#f59e0b", borderRadius: 10, padding: "2px 8px", marginTop: 3, display: "inline-block" }}>Devolvida</div>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={e.id}
                          role="button"
                          title="Ver detalhes / gerar recibo"
                          onClick={() => setSelectedPayment(e)}
                          style={{ background: "#1E3D7A", borderRadius: 10, padding: "12px 14px", marginBottom: 6, borderLeft: "3px solid #22c55e", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #3a5590", borderLeftColor: "#22c55e", cursor: "pointer" }}
                        >
                          <div>
                            <div style={{ fontSize: 13, color: "#f5f6fa", fontWeight: 600 }}>{localQuote.customerName}</div>
                            <div style={{ fontSize: 11, color: "#a9b8dc", marginTop: 2 }}>{fmtDate(e.date)}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{fmt(e.amount)}</div>
                            <div style={{ fontSize: 10, background: "#22c55e22", color: "#22c55e", borderRadius: 10, padding: "2px 8px", marginTop: 3, display: "inline-block" }}>Recebida</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}

            {paymentTab === "despesas" && (
              <div style={{ padding: "16px 20px", flex: 1 }}>
                {isManager && (
                  <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #3a5590" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#dde4f5" }}>Custos vinculados (Caixa)</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: totalLinkedCosts > 0 ? "#f87171" : "#a9b8dc" }}>{fmt(totalLinkedCosts)}</div>
                    </div>
                    {linkedCosts.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#a9b8dc" }}>
                        Nenhuma saída do Caixa vinculada. Vincule pelo Caixa (botão "Pedidos" na compra).
                      </div>
                    ) : (
                      linkedCosts.map((c) => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #3a5590" }}>
                          <div>
                            <div style={{ fontSize: 12, color: "#f5f6fa", fontWeight: 600 }}>{c.entry!.subcategory}</div>
                            <div style={{ fontSize: 11, color: "#a9b8dc" }}>
                              {fmtDate(c.entry!.date)}{c.entry!.description ? ` · ${c.entry!.description}` : ""}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>{fmt(c.amount)}</div>
                            {Math.abs(c.amount - Number(c.entry!.amount || 0)) > 0.005 && (
                              <div style={{ fontSize: 10, color: "#a9b8dc" }}>de {fmt(Number(c.entry!.amount || 0))}</div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #3a5590" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dde4f5", marginBottom: 8 }}>Crédito a receber do fornecedor</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#a9b8dc" }}>Pendente</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: totalPendingSupplierCredit > 0 ? "#38bdf8" : "#a9b8dc" }}>{fmt(totalPendingSupplierCredit)}</span>
                  </div>
                </div>

                {isManager && (
                  <button
                    onClick={() => setShowCreditoForm(true)}
                    style={{ width: "100%", marginBottom: 16, background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 10, padding: "10px 14px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    + Crédito a receber do fornecedor
                  </button>
                )}

                {creditosFornecedor.length === 0 ? (
                  <div style={{ color: "#a9b8dc", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                    Nenhum crédito de fornecedor vinculado a este pedido.
                  </div>
                ) : (
                  creditosFornecedor.map((c) => (
                    <div key={c.id} style={{ background: "#1E3D7A", borderRadius: 10, padding: "12px 14px", marginBottom: 6, border: "1px solid #3a5590", borderLeft: `3px solid ${c.status === "Recebido" ? "#22c55e" : "#38bdf8"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, color: "#f5f6fa", fontWeight: 600 }}>{c.fornecedor}</div>
                          {c.motivo && <div style={{ fontSize: 11, color: "#c8d4f0", marginTop: 2 }}>{c.motivo}</div>}
                          <div style={{ fontSize: 11, color: "#a9b8dc", marginTop: 2 }}>
                            Lançado em {fmtDate(c.createdAt)}
                            {c.status === "Recebido" && c.dataRecebimento ? ` · recebido em ${fmtDate(c.dataRecebimento)}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: c.status === "Recebido" ? "#22c55e" : "#38bdf8" }}>{fmt(c.valor)}</div>
                          <button
                            disabled={!isManager}
                            onClick={() => handleToggleCreditoRecebido(c)}
                            title={isManager ? (c.status === "Pendente" ? "Marcar como recebido" : "Voltar para pendente") : undefined}
                            style={{ fontSize: 10, border: "none", borderRadius: 10, padding: "2px 8px", marginTop: 3, cursor: isManager ? "pointer" : "default", background: c.status === "Recebido" ? "#22c55e22" : "#38bdf822", color: c.status === "Recebido" ? "#22c55e" : "#38bdf8" }}
                          >
                            {c.status}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETALHE DO PAGAMENTO + GERAR RECIBO                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {selectedPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setSelectedPayment(null)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 420, background: "#16305F", borderRadius: 16, padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", border: "1px solid #3a5590", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e", border: "1px solid #22c55e", borderRadius: 8, padding: "5px 12px" }}>Recebida</span>
              <button onClick={() => setSelectedPayment(null)} style={{ background: "none", border: "none", color: "#b8c4e0", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ background: "#1E3D7A", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#dde4f5" }}>
                <span>Valor do pedido</span>
                <span style={{ color: "#8fa8ff" }}>{fmt(localQuote.totalPrice)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                <span style={{ fontSize: 16, color: "#f5f6fa", fontWeight: 600 }}>Valor recebido</span>
                <span style={{ fontSize: 18, color: "#22c55e", fontWeight: 700 }}>{fmt(Number(selectedPayment.amount || 0))}</span>
              </div>
            </div>

            {[
              { icon: "📅", label: "Data do recebimento", value: fmtDate(selectedPayment.date) },
              { icon: "💳", label: "Forma de pagamento", value: paymentMethodOf(selectedPayment) || localQuote.paymentMethod || "—" },
              { icon: "✅", label: "Status de pagamento", value: "Recebida" },
              { icon: "📋", label: "Pedido", value: `n° ${localQuote.quoteNumber ?? "—"} - ${localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}` },
              { icon: "👤", label: "Cliente", value: (localQuote.customerName || "—").toUpperCase() },
            ].map((row) => (
              <div key={row.label} style={{ background: "#1E3D7A", borderRadius: 10, padding: "10px 14px", marginBottom: 8, border: "1px solid #3a5590", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{row.icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: "#a9b8dc" }}>{row.label}</div>
                  <div style={{ fontSize: 14, color: "#f5f6fa", fontWeight: 600 }}>{row.value}</div>
                </div>
              </div>
            ))}

            <button
              onClick={() => handleGenerateReceipt(selectedPayment)}
              disabled={generatingReceipt}
              style={{ width: "100%", marginTop: 8, background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: generatingReceipt ? 0.6 : 1 }}
            >
              {generatingReceipt ? "Gerando recibo..." : "🧾 Gerar recibo"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BOTTOM SHEET — NOVA RECEITA                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showAddPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setShowAddPayment(false)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 480, background: "#16305F", borderRadius: "18px 18px 0 0", padding: "20px 20px 32px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "92vh", overflowY: "auto" }}>

            {/* header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f6fa" }}>Nova receita</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleSavePayment} disabled={savingPayment}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {savingPayment ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={() => setShowAddPayment(false)}
                  style={{ background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, padding: "9px 14px", color: "#b8c4e0", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
            </div>

            {/* Valor destaque */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Valor da receita</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: payAmount > 0 ? "#22c55e" : "#a9b8dc" }}>
                {payAmount > 0 ? fmt(payAmount) : "R$ 0,00"}
              </div>
            </div>

            {/* Valor + Vencimento */}
            <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 5 }}>Subtotal</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={payAmountInput}
                    onChange={(e) => {
                      const raw = sanitizeMoneyInputBR(e.target.value);
                      setPayAmountInput(raw);
                      setPayAmount(parseMoneyInputBR(raw));
                    }}
                    onBlur={() => setPayAmountInput(formatMoneyInputBR(payAmount))}
                    placeholder="0,00"
                    style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 14, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 5 }}>Vencimento</div>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>

            {/* Já foi recebida */}
            <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <svg width="15" height="15" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span style={{ fontSize: 14, color: "#dde4f5" }}>Já foi recebida</span>
                </div>
                <button onClick={() => setPayReceived((v) => !v)}
                  style={{ width: 46, height: 26, borderRadius: 13, background: payReceived ? "#22c55e" : "#3a5590", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: payReceived ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </button>
              </div>
              {payReceived && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 5 }}>Data do recebimento</div>
                  <input
                    type="date"
                    value={payReceivedDate}
                    onChange={(e) => setPayReceivedDate(e.target.value)}
                    style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>

            {/* Forma de pagamento */}
            <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <svg width="15" height="15" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span style={{ fontSize: 14, color: "#dde4f5" }}>Forma de pagamento</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SALE_PAYMENT_METHODS.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setPayMethod(o);
                      if (o !== "Cartão") setPayCardType("");
                    }}
                    style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", background: payMethod === o ? "#8fa8ff" : "#2C53A0", color: payMethod === o ? "#fff" : "#b8c4e0", borderColor: payMethod === o ? "#8fa8ff" : "#4a68a8" }}>
                    {o}
                  </button>
                ))}
              </div>

              {payMethod === "Cartão" && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #3a5590" }}>
                  <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 6 }}>Tipo do cartão</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(["debito", "credito_vista", "credito_parcelado"] as SaleCardType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setPayCardType(t)}
                        style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", background: payCardType === t ? "#8fa8ff" : "#2C53A0", color: payCardType === t ? "#fff" : "#b8c4e0", borderColor: payCardType === t ? "#8fa8ff" : "#4a68a8" }}
                      >
                        {t === "debito" ? "Débito" : t === "credito_vista" ? "Crédito à vista" : "Crédito parcelado"}
                      </button>
                    ))}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Qual maquininha</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {payAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => setPayAccountId(acc.id)}
                          style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", background: payAccountId === acc.id ? "#8fa8ff" : "#2C53A0", color: payAccountId === acc.id ? "#fff" : "#b8c4e0", borderColor: payAccountId === acc.id ? "#8fa8ff" : "#4a68a8" }}
                        >
                          {acc.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {payCardType === "credito_parcelado" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 4 }}>Número de parcelas</div>
                      <input
                        type="number"
                        min={2}
                        max={24}
                        value={payInstallments}
                        onChange={(e) => setPayInstallments(Math.max(2, Number(e.target.value) || 2))}
                        style={{ width: 100, background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 13, padding: "9px 10px", outline: "none" }}
                      />
                    </div>
                  )}
                </div>
              )}

              {payMethod !== "Cartão" && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #3a5590" }}>
                  <div style={{ fontSize: 11, color: "#a9b8dc", textTransform: "uppercase", marginBottom: 6 }}>Conta</div>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  >
                    <option value="">Selecione...</option>
                    {payAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Referência */}
            <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <svg width="15" height="15" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span style={{ fontSize: 14, color: "#dde4f5" }}>Referência (opcional)</span>
              </div>
              <input
                type="text"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Ex: entrada, parcela 1/3, saldo final…"
                style={{ width: "100%", background: "#2C53A0", border: "1px solid #4a68a8", borderRadius: 8, color: "#f5f6fa", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Pedido + Cliente (leitura) */}
            <div style={{ background: "#1E3D7A", borderRadius: 12, padding: "14px 16px", border: "1px solid #3a5590" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid #3a5590" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ fontSize: 12, color: "#a9b8dc" }}>Pedido</span>
                </div>
                <span style={{ fontSize: 13, color: "#dde4f5", fontWeight: 600 }}>
                  n° {localQuote.quoteNumber ?? "—"} - {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" fill="none" stroke="#8fa8ff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span style={{ fontSize: 12, color: "#a9b8dc" }}>Cliente</span>
                </div>
                <span style={{ fontSize: 13, color: "#dde4f5", fontWeight: 600 }}>{localQuote.customerName}</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETALHAMENTO DO FRETE                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showFreightDetail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setShowFreightDetail(false)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 420, background: "#16305F", borderRadius: 16, padding: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f6fa" }}>Detalhamento do frete</div>
              <button
                type="button"
                onClick={() => setShowFreightDetail(false)}
                style={{ background: "transparent", border: "none", color: "#a9b8dc", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(localQuote.freightItems || []).map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f2549", borderRadius: 10, padding: "10px 14px" }}>
                  <div>
                    <div style={{ color: "#dde4f5", fontSize: 13, fontWeight: 600 }}>{item.cityName}</div>
                    <div style={{ color: "#a9b8dc", fontSize: 12 }}>{item.vehicle} · {item.km} km</div>
                  </div>
                  <div style={{ color: "#dde4f5", fontSize: 13, fontWeight: 700 }}>{fmt(Number(item.value) || 0)}</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #3a5590", marginTop: 4 }}>
                <span style={{ color: "#f5f6fa", fontSize: 13, fontWeight: 700 }}>Total</span>
                <span style={{ color: "#f5f6fa", fontSize: 13, fontWeight: 700 }}>
                  {fmt((localQuote.freightItems || []).reduce((s, i) => s + (Number(i.value) || 0), 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETALHAMENTO DE MATÉRIA-PRIMA / MÃO DE OBRA (ADMIN)            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── Alteração / devolução / crédito com fornecedor ── */}
      {showAlteracaoForm && (
        <AlteracaoModal
          items={safeItems}
          saving={savingAlteracao}
          onClose={() => setShowAlteracaoForm(false)}
          onSave={handleSaveAlteracao}
        />
      )}
      {viewAlteracoesItemId && (
        <AlteracoesViewModal
          alteracoes={alteracoes.filter((a) => a.itemId === viewAlteracoesItemId)}
          onClose={() => setViewAlteracoesItemId(null)}
        />
      )}
      {showDevolucaoForm && (
        <DevolucaoModal
          creditoCliente={customerCredit}
          accounts={payAccounts}
          defaultAccountPix={payDefaultPix}
          defaultAccountDinheiro={payDefaultDinheiro}
          alteracoes={alteracoes}
          saving={savingDevolucao}
          onClose={() => setShowDevolucaoForm(false)}
          onSave={handleSaveDevolucao}
        />
      )}
      {showCreditoForm && (
        <CreditoFornecedorModal
          saving={savingCredito}
          onClose={() => setShowCreditoForm(false)}
          onSave={handleSaveCredito}
        />
      )}

      {showRefuseModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setShowRefuseModal(false)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 420, background: "#16305F", borderRadius: 16, padding: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f6fa", marginBottom: 4 }}>Motivo da recusa</div>
            <div style={{ fontSize: 12, color: "#a9b8dc", marginBottom: 14 }}>
              Obrigatório — entra no ranking de motivos de perda em Relatórios → Vendas.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LOST_REASONS.map((r) => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#f5f6fa", cursor: "pointer", background: refuseReason === r ? "#2A4C8F" : "#1E3D7A", border: "1px solid #3a5590", borderRadius: 10, padding: "9px 12px" }}>
                  <input type="radio" name="refuse-reason" checked={refuseReason === r} onChange={() => setRefuseReason(r)} />
                  {r}
                </label>
              ))}
              {refuseReason === "Outro" && (
                <input
                  type="text"
                  autoFocus
                  value={refuseDetail}
                  onChange={(e) => setRefuseDetail(e.target.value)}
                  placeholder="Descreva o motivo"
                  style={{ background: "#0F2347", color: "#f5f6fa", border: "1px solid #3a5590", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none" }}
                />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowRefuseModal(false)}
                style={{ background: "transparent", border: "1px solid #3a5590", color: "#a9b8dc", borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!refuseReason || (refuseReason === "Outro" && !refuseDetail.trim())}
                onClick={() => {
                  setShowRefuseModal(false);
                  handleStatusChange("status", "Recusado", {
                    lostReason: refuseReason,
                    lostReasonDetail: refuseReason === "Outro" ? refuseDetail.trim() : "",
                  });
                }}
                style={{ background: "#dc2626", border: "none", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !refuseReason || (refuseReason === "Outro" && !refuseDetail.trim()) ? 0.5 : 1 }}
              >
                Marcar como recusado
              </button>
            </div>
          </div>
        </div>
      )}

      {detailModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setDetailModal(null)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", background: "#16305F", borderRadius: 16, padding: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f6fa" }}>{detailModal.title}</div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                style={{ background: "transparent", border: "none", color: "#a9b8dc", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {detailModal.lines.length === 0 ? (
              <div style={{ color: "#a9b8dc", fontSize: 13 }}>Sem itens detalhados.</div>
            ) : detailModal.type === "material" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detailModal.lines.map((line, idx) => (
                  <div key={idx} style={{ background: "#1E3D7A", borderRadius: 10, padding: "10px 12px", border: "1px solid #3a5590" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f6fa" }}>{line.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa8ff" }}>{fmt(line.totalCost)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#a9b8dc", marginTop: 3 }}>
                      {line.color && line.color !== "Padrão" ? `Cor: ${line.color} · ` : ""}
                      {line.quantity.toFixed(2)} {line.unit} × {fmt(line.unitCost)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detailModal.lines.map((line, idx) => (
                  <div key={idx} style={{ background: "#1E3D7A", borderRadius: 10, padding: "10px 12px", border: "1px solid #3a5590" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f6fa" }}>{line.role}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#8fa8ff" }}>{fmt(line.total)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#a9b8dc", marginTop: 3 }}>
                      {line.count} pessoa(s) × {line.hours}h × {fmt(line.rate)}/h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDetail;
