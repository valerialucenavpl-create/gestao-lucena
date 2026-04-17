// components/QuoteDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Quote,
  QuoteItem,
  QuoteInternalStatus,
  InventoryItem,
  Product,
  VariableExpense,
  CompanySettings,
  Client,
  CashFlowEntry,
} from "../types";
import { calculateQuoteCompositionLineCost } from "../utils/materialFormulas";
import { createCashFlowEntry } from "../services/cashFlowServices";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";

interface QuoteDetailProps {
  quote: Quote;
  clients?: Client[];
  rawMaterials: InventoryItem[];
  products: Product[];
  variableExpenses?: VariableExpense[];
  companySettings: CompanySettings;
  cashFlow?: CashFlowEntry[];
  onUpdateQuote: (quote: Quote) => Promise<void>;
  onCashFlowAdded?: (entry: CashFlowEntry) => void;
  onBack: () => void;
  onGoToSales?: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (value: string | undefined | null): string => {
  if (!value) return "—";
  const str = value.includes("T") ? value : value.slice(0, 10) + "T12:00:00";
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
  clients = [],
  rawMaterials,
  products,
  variableExpenses = [],
  cashFlow = [],
  onUpdateQuote,
  onCashFlowAdded,
  onBack,
}) => {
  const [localQuote, setLocalQuote] = useState<Quote>(() => structuredClone(quote));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [showFinances, setShowFinances] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"receitas" | "despesas">("receitas");

  // Payment form
  const [payAmount, setPayAmount] = useState(0);
  const [payAmountInput, setPayAmountInput] = useState(formatMoneyInputBR(0));
  const [payDate, setPayDate] = useState(todayISO());
  const [payReceived, setPayReceived] = useState(true);
  const [payReceivedDate, setPayReceivedDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState("PIX");
  const [payReference, setPayReference] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
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
  }, [quote.id]);

  const isDirty = JSON.stringify(localQuote) !== JSON.stringify(quote);

  // ── Auto-salva status imediatamente ao mudar (sem precisar clicar "Salvar") ──
  const handleStatusChange = async (field: "status" | "internalStatus", value: string) => {
    const updated = { ...localQuote, [field]: value } as Quote;
    setLocalQuote(updated);
    setSaving(true);
    setSavedOk(false);
    await onUpdateQuote(updated);
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
  };
  const clientInfo = clients.find((c) => c.id === localQuote.clientId);
  const safeItems = Array.isArray(localQuote.items) ? localQuote.items : [];

  const totalVariablePercent = useMemo(
    () => (variableExpenses ?? []).filter((e) => e?.type === "percent").reduce((s, e) => s + (Number(e?.value) || 0), 0),
    [variableExpenses]
  );

  // ── Payments linked to this quote ──
  const quotePayments = useMemo(() => {
    const byTag = cashFlow.filter((e) => (e as any).subcategory === `quote:${localQuote.id}`);
    if (byTag.length > 0) return byTag;
    const num = localQuote.quoteNumber;
    const name = (localQuote.customerName || "").toLowerCase();
    return cashFlow.filter((e) => {
      const desc = (e.description || "").toLowerCase();
      return (num ? desc.includes(String(num)) : false) && (name ? desc.includes(name) : false);
    });
  }, [cashFlow, localQuote.id, localQuote.quoteNumber, localQuote.customerName]);

  const totalReceived = useMemo(
    () => quotePayments.filter((e) => (e.type as any) === "Entrada" || e.type === "income").reduce((s, e) => s + Number(e.amount || 0), 0),
    [quotePayments]
  );
  const totalPending = Math.max(0, (localQuote.totalPrice || 0) - totalReceived);
  const receivedPct = localQuote.totalPrice > 0 ? Math.min(100, (totalReceived / localQuote.totalPrice) * 100) : 0;

  // ── Save quote ──
  const handleSave = async () => {
    setSaving(true);
    await onUpdateQuote(localQuote);
    setSaving(false);
  };

  // ── Save payment ──
  const handleSavePayment = async () => {
    if (payAmount <= 0) return alert("Informe um valor válido.");
    setSavingPayment(true);
    const quoteNum = localQuote.quoteNumber ?? localQuote.id;
    const entry: Omit<CashFlowEntry, "id"> = {
      type: "Entrada" as any,
      amount: payAmount,
      category: "Vendas",
      subcategory: `quote:${localQuote.id}`,
      description: `Recebimento - Nº ${quoteNum} - ${localQuote.customerName}${payReference ? ` - ${payReference}` : ""} (${payMethod})`,
      date: payReceived ? payReceivedDate : payDate,
    };
    const r = await createCashFlowEntry(entry);
    setSavingPayment(false);
    if (r.ok && r.data) {
      onCashFlowAdded?.(r.data as CashFlowEntry);
      setShowAddPayment(false);
      setPayAmount(0);
      setPayAmountInput(formatMoneyInputBR(0));
      setPayDate(todayISO());
      setPayReceivedDate(todayISO());
      setPayReference("");
    } else {
      alert("Erro ao salvar pagamento. Tente novamente.");
    }
  };

  // ── Address ──
  const addrParts = clientInfo?.address
    ? [clientInfo.address.street, clientInfo.address.number, clientInfo.address.neighborhood, clientInfo.address.city, clientInfo.address.state]
        .filter(Boolean).join(", ")
    : null;

  const internalStyle = INTERNAL_STATUS_STYLE[(localQuote.internalStatus as QuoteInternalStatus) ?? "Pedido"] ?? INTERNAL_STATUS_STYLE["Pedido"];
  const clientStyle = CLIENT_STATUS_STYLE[localQuote.status] ?? CLIENT_STATUS_STYLE["Pendente"];

  // ── Group payments by date ──
  const groupedPayments = useMemo(() => {
    const groups: Record<string, CashFlowEntry[]> = {};
    quotePayments.forEach((p) => {
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
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, color: "#636b85", fontSize: 14, background: "none", border: "none", cursor: "pointer" }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Voltar para Orçamentos
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

      {/* ── CARD PRINCIPAL ── */}
      <div style={{ background: "#1a1f36", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>

        {/* ── CABEÇALHO ── */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #2d3148" }}>
          <div style={{ fontSize: 11, color: "#636b85", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Orçamento</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#e8eaf0" }}>
            N° {localQuote.quoteNumber ?? "—"}
            <span style={{ fontSize: 14, fontWeight: 400, color: "#636b85", marginLeft: 10 }}>
              / {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
            </span>
          </div>

          {/* Status row */}
          <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: "#636b85", textTransform: "uppercase", marginBottom: 4 }}>Status do cliente</div>
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={localQuote.status}
                  onChange={(e) => handleStatusChange("status", e.target.value)}
                  style={{ background: clientStyle.bg, color: clientStyle.color, border: `1px solid ${clientStyle.color}55`, borderRadius: 20, padding: "7px 30px 7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", outline: "none", appearance: "none" }}
                >
                  {CLIENT_STATUS_OPTIONS.map((s) => <option key={s} value={s} style={{ background: "#1a1f36" }}>{s}</option>)}
                </select>
                <svg width="10" height="10" fill="none" stroke={clientStyle.color} strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#636b85", textTransform: "uppercase", marginBottom: 4 }}>Status interno (produção)</div>
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={localQuote.internalStatus ?? "Pedido"}
                  onChange={(e) => handleStatusChange("internalStatus", e.target.value)}
                  style={{ background: internalStyle.bg, color: internalStyle.color, border: `1px solid ${internalStyle.color}55`, borderRadius: 20, padding: "7px 30px 7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", outline: "none", appearance: "none" }}
                >
                  {INTERNAL_STATUS_OPTIONS.map((s) => <option key={s} value={s} style={{ background: "#1a1f36" }}>{s}</option>)}
                </select>
                <svg width="10" height="10" fill="none" stroke={internalStyle.color} strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          </div>

          {/* Datas */}
          <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: "#636b85", textTransform: "uppercase", marginBottom: 4 }}>Data da venda</div>
              <input
                type="date"
                value={isoToInput(localQuote.date)}
                onChange={(e) => setLocalQuote((p) => ({ ...p, date: e.target.value }))}
                style={{ background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#c8d0e7", fontSize: 13, padding: "7px 10px", outline: "none" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#636b85", textTransform: "uppercase", marginBottom: 4 }}>Previsão de entrega</div>
              <input
                type="date"
                value={isoToInput(localQuote.deliveryDate)}
                onChange={(e) => setLocalQuote((p) => ({ ...p, deliveryDate: e.target.value }))}
                style={{ background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#c8d0e7", fontSize: 13, padding: "7px 10px", outline: "none" }}
              />
            </div>
          </div>
        </div>

        {/* ── CLIENTE ── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #2d3148" }}>
          <div style={{ fontSize: 11, color: "#636b85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Cliente</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf0", marginBottom: 6 }}>
            {localQuote.customerName || "—"}
          </div>
          {clientInfo?.phone && (
            <div style={{ fontSize: 13, color: "#8892b0", display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.88-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {clientInfo.phone}
            </div>
          )}
          {clientInfo?.email && (
            <div style={{ fontSize: 13, color: "#8892b0", display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {clientInfo.email}
            </div>
          )}
          {addrParts && (
            <div style={{ fontSize: 13, color: "#8892b0", display: "flex", alignItems: "flex-start", gap: 7, marginTop: 4 }}>
              <svg width="13" height="13" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{addrParts}{clientInfo?.address?.referencePoint && <span style={{ color: "#636b85" }}> — Ref: {clientInfo.address.referencePoint}</span>}</span>
            </div>
          )}
        </div>

        {/* ── PRODUTOS ── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #2d3148" }}>
          <div style={{ fontSize: 11, color: "#636b85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Produtos ({safeItems.length})
          </div>
          {safeItems.length === 0 ? (
            <div style={{ color: "#636b85", fontSize: 13 }}>Nenhum produto neste orçamento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {safeItems.map((item) => {
                const wDisp = item.width >= 1000 ? `${(item.width / 1000).toFixed(2).replace(".", ",")}m` : item.width > 0 ? `${item.width}mm` : null;
                const hDisp = item.height >= 1000 ? `${(item.height / 1000).toFixed(2).replace(".", ",")}m` : item.height > 0 ? `${item.height}mm` : null;
                const cleanDesc = (item.description || "").split(" | ").filter((p) => !p.toLowerCase().startsWith("acréscimo por serviço")).join(" | ");
                return (
                  <div key={item.id} style={{ background: "#252b45", borderRadius: 12, padding: "14px 16px", border: "1px solid #3d4166" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#e8eaf0", fontSize: 15, marginBottom: 5 }}>{item.productName}</div>
                        {(wDisp || hDisp) && (
                          <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 3 }}>
                            📐 {[wDisp, hDisp].filter(Boolean).join(" × ")}
                          </div>
                        )}
                        {item.selectedColor && item.selectedColor !== "Padrão" && (
                          <div style={{ fontSize: 12, color: "#6c8ef5", display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6c8ef5", display: "inline-block" }} />
                            {item.selectedColor}
                          </div>
                        )}
                        {cleanDesc && (
                          <div style={{ fontSize: 12, color: "#636b85", marginTop: 3 }}>{cleanDesc}</div>
                        )}
                        <div style={{ fontSize: 11, color: "#636b85", marginTop: 4 }}>Qtd: {item.quantity}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{fmt(item.price)}</div>
                        {item.quantity > 1 && (
                          <div style={{ fontSize: 11, color: "#636b85" }}>
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
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #2d3148" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(localQuote.subtotal > 0 && localQuote.subtotal !== localQuote.totalPrice) && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#636b85", fontSize: 13 }}>Subtotal</span>
                <span style={{ color: "#c8d0e7", fontSize: 13 }}>{fmt(localQuote.subtotal)}</span>
              </div>
            )}
            {localQuote.freight > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#636b85", fontSize: 13 }}>Frete</span>
                <span style={{ color: "#c8d0e7", fontSize: 13 }}>{fmt(localQuote.freight)}</span>
              </div>
            )}
            {localQuote.installation > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#636b85", fontSize: 13 }}>Instalação</span>
                <span style={{ color: "#c8d0e7", fontSize: 13 }}>{fmt(localQuote.installation)}</span>
              </div>
            )}
            {localQuote.discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#636b85", fontSize: 13 }}>Desconto</span>
                <span style={{ color: "#ef4444", fontSize: 13 }}>-{fmt(localQuote.discount)}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, marginTop: 8, borderTop: "1px solid #2d3148" }}>
            <span style={{ color: "#e8eaf0", fontSize: 16, fontWeight: 700 }}>Total</span>
            <span style={{ color: "#22c55e", fontSize: 20, fontWeight: 800 }}>{fmt(localQuote.totalPrice)}</span>
          </div>
        </div>

        {/* ── FORMA DE PAGAMENTO ── */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #2d3148", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="15" height="15" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            <span style={{ fontSize: 12, color: "#636b85", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forma de pagamento</span>
          </div>
          <select
            value={localQuote.paymentMethod}
            onChange={(e) => setLocalQuote((p) => ({ ...p, paymentMethod: e.target.value as any }))}
            style={{ background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#c8d0e7", fontSize: 13, padding: "7px 10px", outline: "none" }}
          >
            {PAYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* ── RESUMO FINANCEIRO ── */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, color: "#636b85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Resumo financeiro do pedido</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#636b85", marginBottom: 2 }}>Recebido</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#22c55e" }}>{fmt(totalReceived)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#636b85", marginBottom: 2 }}>Pendente</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: totalPending > 0 ? "#ef4444" : "#22c55e" }}>{fmt(totalPending)}</div>
            </div>
          </div>
          <div style={{ height: 8, background: "#2d3148", borderRadius: 4, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ height: "100%", width: `${receivedPct}%`, background: receivedPct >= 100 ? "#22c55e" : "#6c8ef5", borderRadius: 4, transition: "width 0.4s" }} />
          </div>
          <button
            onClick={() => setShowFinances(true)}
            style={{ width: "100%", background: "#252b45", border: "1px solid #3d4166", borderRadius: 12, padding: "14px 18px", color: "#c8d0e7", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6c8ef5")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#3d4166")}
          >
            Ver finanças do pedido
            <svg width="16" height="16" fill="none" stroke="#6c8ef5" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DRAWER — FINANÇAS DO PEDIDO                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showFinances && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} onClick={() => { setShowFinances(false); setShowAddPayment(false); }} />

          <div style={{ position: "relative", width: "100%", maxWidth: 480, background: "#141827", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>

            {/* drawer header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #2d3148", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, background: "#141827", zIndex: 2 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf0" }}>Finanças do Pedido</div>
                <div style={{ fontSize: 12, color: "#636b85", marginTop: 2 }}>
                  N° {localQuote.quoteNumber ?? "—"} - {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowAddPayment(true)}
                  style={{ background: "#22c55e", border: "none", borderRadius: 8, width: 36, height: 36, color: "#fff", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                  title="Novo recebimento"
                >+</button>
                <button onClick={() => { setShowFinances(false); setShowAddPayment(false); }} style={{ background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, width: 36, height: 36, color: "#8892b0", fontSize: 16, cursor: "pointer" }}>✕</button>
              </div>
            </div>

            {/* tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #2d3148", flexShrink: 0 }}>
              {(["receitas", "despesas"] as const).map((tab) => (
                <button key={tab} onClick={() => setPaymentTab(tab)}
                  style={{ flex: 1, padding: "13px", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: paymentTab === tab ? "#6c8ef5" : "#636b85", borderBottom: paymentTab === tab ? "2px solid #6c8ef5" : "2px solid transparent", textTransform: "capitalize" }}>
                  {tab === "receitas" ? "Receitas" : "Despesas"}
                </button>
              ))}
            </div>

            {/* receitas */}
            {paymentTab === "receitas" && (
              <div style={{ padding: "16px 20px", flex: 1 }}>

                {/* Resumo valor pedido */}
                <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #2d3148" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#c8d0e7", marginBottom: 12 }}>Resumo do valor do pedido</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#636b85" }}>Valor do pedido</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{fmt(localQuote.totalPrice)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#636b85" }}>Pendente</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: totalPending > 0 ? "#ef4444" : "#22c55e" }}>{fmt(totalPending)}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: "#2d3148", borderRadius: 3, overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${receivedPct}%`, background: "#6c8ef5", borderRadius: 3 }} />
                  </div>
                </div>

                {/* Receitas do pedido */}
                <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: "1px solid #2d3148" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#c8d0e7", marginBottom: 12 }}>Receitas do pedido</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#636b85" }}>Total de receitas</span>
                    <span style={{ fontSize: 13, color: "#c8d0e7", fontWeight: 600 }}>{fmt(totalReceived)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#636b85" }}>Recebido</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{fmt(totalReceived)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#636b85" }}>A receber</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>{fmt(totalPending)}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: "#2d3148", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${receivedPct}%`, background: "#22c55e", borderRadius: 3 }} />
                  </div>
                </div>

                {/* Histórico de pagamentos */}
                {groupedPayments.length === 0 ? (
                  <div style={{ color: "#636b85", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
                    Nenhum pagamento registrado ainda.<br />
                    <span style={{ fontSize: 12 }}>Clique em + para adicionar o primeiro recebimento.</span>
                  </div>
                ) : (
                  groupedPayments.map(([date, entries]) => (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "#6c8ef5", fontWeight: 600, marginBottom: 8, textTransform: "capitalize" }}>{formatGroupDate(date)}</div>
                      {entries.map((e) => (
                        <div key={e.id} style={{ background: "#1a1f36", borderRadius: 10, padding: "12px 14px", marginBottom: 6, borderLeft: "3px solid #22c55e", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #2d3148", borderLeftColor: "#22c55e" }}>
                          <div>
                            <div style={{ fontSize: 13, color: "#e8eaf0", fontWeight: 600 }}>{localQuote.customerName}</div>
                            <div style={{ fontSize: 11, color: "#636b85", marginTop: 2 }}>{fmtDate(e.date)}</div>
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
              <div style={{ padding: "20px", color: "#636b85", fontSize: 13, textAlign: "center", paddingTop: 40 }}>
                Nenhuma despesa vinculada a este pedido.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BOTTOM SHEET — NOVA RECEITA                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showAddPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} onClick={() => setShowAddPayment(false)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 480, background: "#141827", borderRadius: "18px 18px 0 0", padding: "20px 20px 32px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "92vh", overflowY: "auto" }}>

            {/* header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf0" }}>Nova receita</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleSavePayment} disabled={savingPayment}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {savingPayment ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={() => setShowAddPayment(false)}
                  style={{ background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, padding: "9px 14px", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
            </div>

            {/* Valor destaque */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#636b85", textTransform: "uppercase", marginBottom: 4 }}>Valor da receita</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: payAmount > 0 ? "#22c55e" : "#636b85" }}>
                {payAmount > 0 ? fmt(payAmount) : "R$ 0,00"}
              </div>
            </div>

            {/* Valor + Vencimento */}
            <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #2d3148" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#636b85", marginBottom: 5 }}>Subtotal</div>
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
                    style={{ width: "100%", background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#e8eaf0", fontSize: 14, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#636b85", marginBottom: 5 }}>Vencimento</div>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    style={{ width: "100%", background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#e8eaf0", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>

            {/* Já foi recebida */}
            <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #2d3148" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <svg width="15" height="15" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span style={{ fontSize: 14, color: "#c8d0e7" }}>Já foi recebida</span>
                </div>
                <button onClick={() => setPayReceived((v) => !v)}
                  style={{ width: 46, height: 26, borderRadius: 13, background: payReceived ? "#22c55e" : "#2d3148", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: payReceived ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </button>
              </div>
              {payReceived && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "#636b85", marginBottom: 5 }}>Data do recebimento</div>
                  <input
                    type="date"
                    value={payReceivedDate}
                    onChange={(e) => setPayReceivedDate(e.target.value)}
                    style={{ width: "100%", background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#e8eaf0", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>

            {/* Forma de pagamento */}
            <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #2d3148" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <svg width="15" height="15" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span style={{ fontSize: 14, color: "#c8d0e7" }}>Forma de pagamento</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PAYMENT_OPTIONS.filter((o) => o !== "A Definir").map((o) => (
                  <button key={o} onClick={() => setPayMethod(o)}
                    style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", background: payMethod === o ? "#6c8ef5" : "#252b45", color: payMethod === o ? "#fff" : "#8892b0", borderColor: payMethod === o ? "#6c8ef5" : "#3d4166" }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Referência */}
            <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #2d3148" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <svg width="15" height="15" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span style={{ fontSize: 14, color: "#c8d0e7" }}>Referência (opcional)</span>
              </div>
              <input
                type="text"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Ex: entrada, parcela 1/3, saldo final…"
                style={{ width: "100%", background: "#252b45", border: "1px solid #3d4166", borderRadius: 8, color: "#e8eaf0", fontSize: 13, padding: "9px 10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Pedido + Cliente (leitura) */}
            <div style={{ background: "#1a1f36", borderRadius: 12, padding: "14px 16px", border: "1px solid #2d3148" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid #2d3148" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ fontSize: 12, color: "#636b85" }}>Pedido</span>
                </div>
                <span style={{ fontSize: 13, color: "#c8d0e7", fontWeight: 600 }}>
                  n° {localQuote.quoteNumber ?? "—"} - {localQuote.date ? new Date(localQuote.date.slice(0, 10) + "T12:00:00").getFullYear() : "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" fill="none" stroke="#6c8ef5" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span style={{ fontSize: 12, color: "#636b85" }}>Cliente</span>
                </div>
                <span style={{ fontSize: 13, color: "#c8d0e7", fontWeight: 600 }}>{localQuote.customerName}</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDetail;
