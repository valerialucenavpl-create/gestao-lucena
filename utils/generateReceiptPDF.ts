import jsPDF from "jspdf";
import { CompanySettings, QuoteItem } from "../types";
import { formatCNPJ, gradientH, gradientRoundedH, loadImage } from "./generateQuotePDF";

// Recibo de pagamento de um recebimento do pedido — mesma identidade visual
// do PDF de orçamento (azul-marinho + laranja Lucena), com valor por
// extenso, produtos do pedido como "Referente a" e assinaturas.

type RGB = [number, number, number];

const NAVY: RGB = [30, 61, 122];
const NAVY_LIGHT: RGB = [44, 83, 160];
const ACCENT: RGB = [242, 107, 33];
const BLUE_TINT: RGB = [234, 241, 251];
const BLUE_TINT_BORDER: RGB = [214, 227, 247];
const BLUE_TINT2: RGB = [242, 247, 254];
const INK: RGB = [31, 41, 55];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const WHITE: RGB = [255, 255, 255];
const SIGN_RULE: RGB = [148, 163, 184];

const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const setTxt = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
const setStroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// ─── Valor por extenso ────────────────────────────────────────────────────────
const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** 0–999 por extenso ("" para 0). */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

/** Inteiro por extenso (até 999.999.999). */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const grupos: { texto: string; valor: number }[] = [];
  if (milhoes > 0) grupos.push({ texto: milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`, valor: milhoes });
  if (milhares > 0) grupos.push({ texto: milhares === 1 ? "mil" : `${ate999(milhares)} mil`, valor: milhares });
  if (resto > 0) grupos.push({ texto: ate999(resto), valor: resto });

  // Regra do "e" entre grupos: o último grupo leva "e" quando é menor que
  // 100 ou centena redonda (mil e duzentos, mil e cinquenta), senão só
  // espaço (mil duzentos e cinquenta).
  return grupos
    .map((g, i) => {
      if (i === 0) return g.texto;
      const ultimo = i === grupos.length - 1;
      const usaE = ultimo && (g.valor < 100 || g.valor % 100 === 0);
      return (usaE ? " e " : " ") + g.texto;
    })
    .join("");
}

export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(Number(valor || 0)) * 100);
  const reais = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;

  const partes: string[] = [];
  if (reais > 0) {
    const txt = inteiroPorExtenso(reais);
    // "um milhão de reais", "dois milhões de reais"
    const de = reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${txt}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDoc(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return formatCNPJ(d);
  return raw;
}

/** Procura um CPF/CNPJ num texto livre (ex.: observação do cliente). */
export function findCpfCnpj(text?: string | null): string {
  if (!text) return "";
  const m =
    text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || // CNPJ
    text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/); // CPF
  return m ? formatDoc(m[0]) : "";
}

/** "Lago da Pedra - MA" a partir do endereço da empresa. */
function cidadeUF(address: string): string {
  const parts = (address || "").split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*[-/]\s*([A-Za-z]{2})$/);
    if (m && !/\d/.test(m[1])) return `${m[1]} - ${m[2].toUpperCase()}`;
  }
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^[A-Za-z]{2}$/.test(parts[i + 1]) && !/\d/.test(parts[i])) return `${parts[i]} - ${parts[i + 1].toUpperCase()}`;
  }
  return "Lago da Pedra - MA";
}

function ymdToBR(ymd: string): string {
  const [y, m, d] = (ymd || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

/** Encaixa a forma de pagamento livre nas opções do recibo. */
function matchPaymentOption(method: string): { option: string; outro: string } {
  const m = (method || "").toLowerCase();
  if (m.includes("pix")) return { option: "PIX", outro: "" };
  if (m.includes("dinheiro")) return { option: "Dinheiro", outro: "" };
  if (m.includes("cart") || m.includes("maquin")) return { option: "Cartão", outro: "" };
  if (m.includes("transf")) return { option: "Transferência", outro: "" };
  return { option: "Outro", outro: method || "" };
}

export interface ReceiptData {
  company: CompanySettings;
  customerName: string;
  customerDocument?: string;
  orderNumber: string;
  items: QuoteItem[];
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: string; // ex.: "PIX", "Cartão crédito parcelado 3x"
  orderTotal?: number;
  totalReceived?: number; // total já recebido no pedido, incluindo este pagamento
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
export async function generateReceiptPDF(data: ReceiptData): Promise<jsPDF> {
  const { company } = data;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;

  const today = new Date();
  const todayBR = today.toLocaleDateString("pt-BR");
  const todayExtenso = `${today.getDate()} de ${MESES[today.getMonth()]} de ${today.getFullYear()}`;
  const customer = (data.customerName || "").trim() || "Cliente";
  const extenso = valorPorExtenso(data.amount);
  const isPartial = (data.orderTotal ?? 0) > 0 && data.amount < (data.orderTotal ?? 0) - 0.005;

  // ─── Filete no topo ─────────────────────────────────────────────────────
  gradientH(doc, 0, 0, pageW * 0.55, 2.2, NAVY, NAVY_LIGHT);
  setFill(doc, ACCENT);
  doc.rect(pageW * 0.55, 0, pageW * 0.45 + 0.5, 2.2, "F");

  // ─── Cabeçalho: logo + empresa ─────────────────────────────────────────
  let y = 12;
  let logo: { dataUrl: string; width: number; height: number } | null = null;
  if (company.logo) {
    try { logo = await loadImage(company.logo); } catch { logo = null; }
  }
  const logoH = logo && logo.height > 0 ? 24 : 0;
  const logoW = logo && logo.height > 0 ? Math.min(70, logoH * (logo.width / logo.height)) : 0;

  const lines: { text: string; bold?: boolean; size: number; color: RGB }[] = [];
  lines.push({ text: company.legalName || company.name || "", bold: true, size: 11, color: INK });
  if (company.legalName && company.name && company.name !== company.legalName) {
    lines.push({ text: company.name, size: 8.5, color: MUTED });
  }
  if (company.cnpj) lines.push({ text: `CNPJ: ${formatCNPJ(company.cnpj)}`, size: 8.5, color: MUTED });
  if (company.address) lines.push({ text: company.address, size: 8.5, color: MUTED });
  const contact = [company.phone, company.email].filter(Boolean).join("   ·   ");
  if (contact) lines.push({ text: contact, size: 8.5, color: MUTED });

  const maxTextW = contentW - (logoW ? logoW + 10 : 0);
  const wrapped = lines.map((l) => ({ l, w: doc.splitTextToSize(l.text, maxTextW) as string[] }));
  const blockH = wrapped.reduce((s, { l, w }) => s + w.length * l.size * 0.42 + (l.bold ? 1.5 : 1), 0);
  const textTop = y + 2;
  if (logo && logoH) doc.addImage(logo.dataUrl, "PNG", margin, textTop + (blockH - logoH) / 2, logoW, logoH);

  let cy = textTop;
  for (const { l, w } of wrapped) {
    doc.setFont("helvetica", l.bold ? "bold" : "normal");
    doc.setFontSize(l.size);
    setTxt(doc, l.color);
    doc.text(w, pageW - margin, cy, { align: "right" });
    cy += w.length * l.size * 0.42 + (l.bold ? 1.5 : 1);
  }
  y = Math.max(cy, logoH ? textTop + (blockH - logoH) / 2 + logoH : 0) + 4;
  setFill(doc, ACCENT);
  doc.rect(margin, y, contentW, 0.9, "F");
  y += 8;

  // ─── Faixa do título + valor ───────────────────────────────────────────
  const bandH = 24;
  gradientRoundedH(doc, margin, y, contentW, bandH, 3, NAVY, NAVY_LIGHT);
  setTxt(doc, WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("RECIBO DE PAGAMENTO", margin + 7, y + 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Pedido nº ${data.orderNumber}   ·   Pago em ${ymdToBR(data.paymentDate) || todayBR}`, margin + 7, y + 17.5);

  // "selo" do valor à direita
  const pillW = 58;
  const pillX = pageW - margin - pillW - 5;
  setFill(doc, WHITE);
  doc.roundedRect(pillX, y + 4.5, pillW, bandH - 9, 2.5, 2.5, "F");
  setTxt(doc, MUTED);
  doc.setFontSize(7.5);
  doc.text("VALOR RECEBIDO", pillX + pillW / 2, y + 9.5, { align: "center" });
  setTxt(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(money(data.amount), pillX + pillW / 2, y + 16.3, { align: "center" });
  y += bandH + 7;

  // ─── Quadro de dados (cliente, documento, data, pedido) ────────────────
  const gridH = 26;
  setFill(doc, BLUE_TINT2);
  setStroke(doc, BLUE_TINT_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, gridH, 2.5, 2.5, "FD");
  const colSplit = margin + contentW * 0.66;
  doc.line(colSplit, y + 3, colSplit, y + gridH - 3);
  doc.line(margin + 4, y + gridH / 2, pageW - margin - 4, y + gridH / 2);

  const field = (label: string, value: string, x: number, fy: number, maxW: number) => {
    setTxt(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x, fy);
    setTxt(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    const v = (doc.splitTextToSize(value || "—", maxW) as string[])[0];
    doc.text(v, x, fy + 5.2);
  };
  const leftW = colSplit - margin - 10;
  const rightW = pageW - margin - colSplit - 10;
  field("Cliente", customer.toUpperCase(), margin + 5, y + 5.5, leftW);
  field("Data", todayBR, colSplit + 5, y + 5.5, rightW);
  field("CPF/CNPJ", data.customerDocument || "", margin + 5, y + gridH / 2 + 5.5, leftW);
  field("Pedido nº", data.orderNumber, colSplit + 5, y + gridH / 2 + 5.5, rightW);
  y += gridH + 9;

  // ─── Declaração ─────────────────────────────────────────────────────────
  const declaracao =
    `Declaro que recebi de ${customer.toUpperCase()} a importância de ${money(data.amount)} ` +
    `(${extenso}), referente ao pagamento${isPartial ? " parcial" : ""} do pedido/serviço nº ${data.orderNumber}.`;
  setTxt(doc, INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const declLines = doc.splitTextToSize(declaracao, contentW) as string[];
  doc.text(declLines, margin, y, { lineHeightFactor: 1.5 });
  y += declLines.length * 11 * 0.3528 * 1.5 + 4;

  // Valor por extenso em destaque
  const extTxt = doc.splitTextToSize(extenso.charAt(0).toUpperCase() + extenso.slice(1), contentW - 14) as string[];
  const extH = extTxt.length * 5 + 7;
  setFill(doc, BLUE_TINT);
  doc.roundedRect(margin, y, contentW, extH, 2, 2, "F");
  setFill(doc, ACCENT);
  doc.rect(margin, y, 1.6, extH, "F");
  setTxt(doc, NAVY);
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(10.5);
  doc.text(extTxt, margin + 7, y + 6);
  y += extH + 9;

  // ─── Referente a (produtos do pedido) ──────────────────────────────────
  const sectionTitle = (t: string) => {
    setTxt(doc, NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(t.toUpperCase(), margin, y);
    setStroke(doc, LINE);
    doc.setLineWidth(0.25);
    doc.line(margin + doc.getTextWidth(t.toUpperCase()) + 3, y - 1.2, pageW - margin, y - 1.2);
    y += 6;
  };

  sectionTitle("Referente a");
  const MAX_ITEMS = 8;
  const items = (data.items || []).filter((i) => (i.productName || "").trim());
  doc.setFontSize(9.5);
  if (items.length === 0) {
    setTxt(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(`Pagamento do pedido/serviço nº ${data.orderNumber}.`, margin + 2, y);
    y += 6;
  } else {
    items.slice(0, MAX_ITEMS).forEach((it) => {
      const qty = Number(it.quantity || 0) || 1;
      const color = (it.selectedColor || "").trim();
      const text = `${it.productName.trim()}${color ? `  —  ${color}` : ""}`;
      const w = doc.splitTextToSize(text, contentW - 20) as string[];
      setFill(doc, ACCENT);
      doc.circle(margin + 2, y - 1.2, 0.8, "F");
      setTxt(doc, NAVY);
      doc.setFont("helvetica", "bold");
      doc.text(`${qty}x`, margin + 5, y);
      setTxt(doc, INK);
      doc.setFont("helvetica", "normal");
      doc.text(w, margin + 14, y);
      y += w.length * 4.4 + 1.6;
    });
    if (items.length > MAX_ITEMS) {
      setTxt(doc, MUTED);
      doc.setFont("helvetica", "italic");
      doc.text(`+ ${items.length - MAX_ITEMS} item(ns) do mesmo pedido`, margin + 14, y);
      y += 6;
    }
  }
  y += 4;

  // ─── Forma de pagamento ────────────────────────────────────────────────
  sectionTitle("Forma de pagamento");
  const { option, outro } = matchPaymentOption(data.paymentMethod);
  const options = ["PIX", "Dinheiro", "Cartão", "Transferência", "Outro"];
  y += 3;
  let px = margin;
  doc.setFontSize(9.5);
  options.forEach((o) => {
    const selected = o === option;
    const label = o === "Outro" && selected && outro ? `Outro: ${outro}` : o;
    doc.setFont("helvetica", selected ? "bold" : "normal");
    const w = doc.getTextWidth(label) + 13;
    if (selected) {
      setFill(doc, NAVY);
      doc.roundedRect(px, y - 5, w, 8, 4, 4, "F");
      // marcador "selecionado" (helvetica não tem o glifo ✓)
      setFill(doc, WHITE);
      doc.circle(px + 4.5, y - 1, 1.4, "F");
      setFill(doc, ACCENT);
      doc.circle(px + 4.5, y - 1, 0.8, "F");
      setTxt(doc, WHITE);
    } else {
      setStroke(doc, BLUE_TINT_BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(px, y - 5, w, 8, 4, 4, "D");
      setStroke(doc, SIGN_RULE);
      doc.circle(px + 4.5, y - 1, 1.4, "D");
      setTxt(doc, MUTED);
    }
    doc.text(label, px + 8, y);
    px += w + 3;
  });
  // Detalhe completo da forma (ex.: "Cartão crédito parcelado 3x")
  if (data.paymentMethod && option !== "Outro" && data.paymentMethod.trim().toLowerCase() !== option.toLowerCase()) {
    y += 7;
    setTxt(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Detalhe: ${data.paymentMethod}`, margin, y);
  }
  y += 9;

  // Pagamento parcial: situação do pedido
  if (isPartial && data.orderTotal) {
    const saldo = Math.max(0, data.orderTotal - (data.totalReceived ?? data.amount));
    setTxt(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(
      `Valor total do pedido: ${money(data.orderTotal)}   ·   Total recebido até agora: ${money(data.totalReceived ?? data.amount)}   ·   Saldo: ${money(saldo)}`,
      margin,
      y
    );
    y += 8;
  }

  // ─── Fecho + local/data ─────────────────────────────────────────────────
  y = Math.max(y + 2, pageH - 88);
  setTxt(doc, INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text("Por ser verdade, firmo o presente recibo para os devidos fins.", margin, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text(`${cidadeUF(company.address)}, ${todayExtenso}.`, pageW / 2, y, { align: "center" });

  // ─── Assinaturas ────────────────────────────────────────────────────────
  y += 28;
  const sigW = 72;
  const sigLeftX = margin + 4;
  const sigRightX = pageW - margin - 4 - sigW;
  setStroke(doc, SIGN_RULE);
  doc.setLineWidth(0.4);
  doc.line(sigLeftX, y, sigLeftX + sigW, y);
  doc.line(sigRightX, y, sigRightX + sigW, y);

  setTxt(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text((company.name || company.legalName || "EMPRESA").toUpperCase(), sigLeftX + sigW / 2, y + 5, { align: "center" });
  doc.text("CLIENTE", sigRightX + sigW / 2, y + 5, { align: "center" });
  setTxt(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const legal = company.legalName && company.legalName !== company.name ? company.legalName : company.cnpj ? `CNPJ ${formatCNPJ(company.cnpj)}` : "";
  if (legal) doc.text((doc.splitTextToSize(legal, sigW) as string[])[0], sigLeftX + sigW / 2, y + 9.5, { align: "center" });
  doc.text((doc.splitTextToSize(customer.toUpperCase(), sigW) as string[])[0], sigRightX + sigW / 2, y + 9.5, { align: "center" });

  // ─── Rodapé ─────────────────────────────────────────────────────────────
  setFill(doc, BLUE_TINT);
  doc.rect(0, pageH - 14, pageW, 14, "F");
  setFill(doc, ACCENT);
  doc.rect(0, pageH - 14, pageW, 0.8, "F");
  setTxt(doc, NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Obrigado pela preferência!", pageW / 2, pageH - 6, { align: "center" });

  return doc;
}
