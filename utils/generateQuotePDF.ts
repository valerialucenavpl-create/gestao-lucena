import jsPDF from "jspdf";
import { Quote, CompanySettings } from "../types";

export interface PDFOptions {
  hidePrice: boolean;
  hideMeasures: boolean;
  hideDetailedDescription: boolean;
}

type RGB = [number, number, number];

// ─── PALETA DE CORES (identidade visual Lucena) ──────────────────────────
const NAVY: RGB = [30, 61, 122]; // #1E3D7A
const NAVY_LIGHT: RGB = [44, 83, 160]; // #2C53A0
const NAVY_DEEP: RGB = [22, 48, 95]; // #16305F
const ACCENT: RGB = [242, 107, 33]; // #F26B21
const BLUE_TINT: RGB = [234, 241, 251]; // #EAF1FB
const BLUE_TINT_BORDER: RGB = [214, 227, 247]; // #D6E3F7
const BLUE_TINT2: RGB = [242, 247, 254]; // #F2F7FE
const INK: RGB = [31, 41, 55]; // #1F2937
const MUTED: RGB = [100, 116, 139]; // #64748B
const LINE: RGB = [226, 232, 240]; // #E2E8F0
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [34, 197, 94];
const SIGN_RULE: RGB = [148, 163, 184];

const fmtBR = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const setTxt = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
const setStroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
}

// Gradiente horizontal feito com várias faixas verticais finas (jsPDF não
// tem fill de gradiente nativo).
function gradientH(doc: jsPDF, x: number, y: number, w: number, h: number, c1: RGB, c2: RGB, steps = 48) {
  const stepW = w / steps;
  for (let i = 0; i < steps; i++) {
    setFill(doc, mix(c1, c2, steps === 1 ? 0 : i / (steps - 1)));
    doc.rect(x + i * stepW, y, stepW + 0.25, h, "F");
  }
}

// Mesmo gradiente, recortado num retângulo de cantos arredondados.
function gradientRoundedH(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, c1: RGB, c2: RGB) {
  doc.saveGraphicsState();
  doc.roundedRect(x, y, w, h, r, r, null);
  doc.clip();
  doc.discardPath();
  gradientH(doc, x, y, w, h, c1, c2);
  doc.restoreGraphicsState();
}

function formatCNPJ(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length !== 14) return raw || "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (url.startsWith("data:")) {
        resolve({ dataUrl: url, width: img.naturalWidth, height: img.naturalHeight });
        return;
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function cityFromAddress(address: string): string {
  // Pattern: "..., Cidade, UF, ..."
  const m = address.match(/,\s*([^,]+),\s*[A-Z]{2}[,\s]/i);
  if (m) return m[1].trim();
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  return parts[0] || "Lago da Pedra";
}

export async function generateQuotePDF(
  quote: Quote,
  companySettings: CompanySettings,
  options: PDFOptions
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(); // 210mm
  const pageH = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 15;
  const contentW = pageW - margin * 2;
  const FOOTER_RESERVE = 16;

  // ─── DATAS ──────────────────────────────────────────────────────────────
  // quote.date pode vir como "YYYY-MM-DD" ou timestamp completo do Supabase
  // ("YYYY-MM-DDTHH:mm:ss+00:00"); pega só os 10 primeiros chars antes de
  // anexar "T12:00:00", senão new Date(...) fica "Invalid Date".
  const rawQuoteDate = (quote.date || "").slice(0, 10);
  const quoteDateObj = rawQuoteDate ? new Date(rawQuoteDate + "T12:00:00") : new Date();
  const quoteYear = quoteDateObj.getFullYear();
  const dateStr = quoteDateObj.toLocaleDateString("pt-BR");
  const todayStr = new Date().toLocaleDateString("pt-BR");

  // ─── FILETE DE DESTAQUE NO TOPO (azul → laranja) ────────────────────────
  const drawTopAccent = () => {
    const barH = 2.2;
    gradientH(doc, 0, 0, pageW * 0.55, barH, NAVY, NAVY_LIGHT);
    setFill(doc, ACCENT);
    doc.rect(pageW * 0.55, 0, pageW * 0.45 + 0.5, barH, "F");
  };
  drawTopAccent();

  let y = margin - 1;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - FOOTER_RESERVE) {
      doc.addPage();
      drawTopAccent();
      y = margin;
    }
  };

  // ─── CABEÇALHO: LOGO + DADOS DA EMPRESA ──────────────────────────────────
  let logoInfo: { dataUrl: string; width: number; height: number } | null = null;
  if (companySettings.logo) {
    try {
      logoInfo = await loadImage(companySettings.logo);
    } catch {
      logoInfo = null;
    }
  }

  const headerTop = y + 4;
  let logoW = 0;
  let logoH = 0;
  if (logoInfo && logoInfo.height > 0) {
    logoH = 39; // ~3x do tamanho anterior
    logoW = Math.min(100, logoH * (logoInfo.width / logoInfo.height));
  }

  type CompanyLine = { text: string; bold?: boolean; color: RGB; size: number };
  const companyLines: CompanyLine[] = [];
  companyLines.push({ text: companySettings.legalName || companySettings.name || "", bold: true, color: INK, size: 11 });
  if (companySettings.cnpj) companyLines.push({ text: `CNPJ: ${formatCNPJ(companySettings.cnpj)}`, color: MUTED, size: 8.5 });
  if (companySettings.address) companyLines.push({ text: companySettings.address, color: MUTED, size: 8.5 });
  const contact = [companySettings.phone, companySettings.email].filter(Boolean).join("   ·   ");
  if (contact) companyLines.push({ text: contact, color: MUTED, size: 8.5 });

  const rightX = pageW - margin;
  const maxTextW = contentW - (logoInfo ? logoW + 10 : 0);

  // Pré-calcula a altura do bloco de texto para centralizar a logo verticalmente em relação a ele.
  const wrappedLines = companyLines.map((line) => ({
    line,
    wrapped: doc.splitTextToSize(line.text, maxTextW) as string[],
  }));
  let textBlockH = 0;
  for (const { line, wrapped } of wrappedLines) {
    textBlockH += wrapped.length * (line.size * 0.42) + (line.bold ? 1.5 : 1);
  }

  const textTop = headerTop + 2;
  if (logoInfo && logoH > 0) {
    const logoY = textTop + (textBlockH - logoH) / 2;
    doc.addImage(logoInfo.dataUrl, "PNG", margin, logoY, logoW, logoH);
  }

  let cy = textTop;
  for (const { line, wrapped } of wrappedLines) {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(line.size);
    setTxt(doc, line.color);
    doc.text(wrapped, rightX, cy, { align: "right" });
    cy += wrapped.length * (line.size * 0.42) + (line.bold ? 1.5 : 1);
  }

  const logoBottom = logoInfo && logoH > 0 ? textTop + (textBlockH - logoH) / 2 + logoH : 0;
  y = Math.max(logoBottom, cy) + 4;

  setStroke(doc, LINE);
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ─── FAIXA DO TÍTULO "ORÇAMENTO" ─────────────────────────────────────────
  ensureSpace(28);
  const bandH = 20;
  gradientRoundedH(doc, margin, y, contentW, bandH, 3, NAVY, NAVY_LIGHT);

  setTxt(doc, WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("ORÇAMENTO", margin + 8, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setTxt(doc, mix(WHITE, NAVY, 0.15));
  doc.text("Proposta comercial", margin + 8, y + 16);

  // badge com número do orçamento e data de emissão
  const badgeW = 52;
  const badgeH = 14;
  const badgeX = margin + contentW - 8 - badgeW;
  const badgeY = y + (bandH - badgeH) / 2;
  setFill(doc, mix(NAVY, WHITE, 0.15));
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5, 2.5, "F");
  setStroke(doc, mix(NAVY, WHITE, 0.35));
  doc.setLineWidth(0.25);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5, 2.5, "S");

  setTxt(doc, WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`N° ${quote.quoteNumber ?? "—"}/${quoteYear}`, badgeX + badgeW - 4, badgeY + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setTxt(doc, mix(WHITE, NAVY, 0.1));
  doc.text(`Emitido em ${dateStr}`, badgeX + badgeW - 4, badgeY + 11, { align: "right" });

  y += bandH + 8;

  // ─── CARD DO CLIENTE ──────────────────────────────────────────────────────
  ensureSpace(20);
  const clientCardH = 17;
  setFill(doc, BLUE_TINT);
  doc.roundedRect(margin, y, contentW, clientCardH, 2.5, 2.5, "F");
  setStroke(doc, BLUE_TINT_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, y, contentW, clientCardH, 2.5, 2.5, "S");

  const clientFields: { label: string; value: string }[] = [
    { label: "CLIENTE", value: quote.customerName || "—" },
  ];
  if (quote.salesperson) clientFields.push({ label: "VENDEDOR(A)", value: quote.salesperson });
  // Validade padrão da proposta (período comercial fixo da empresa).
  clientFields.push({ label: "VALIDADE DA PROPOSTA", value: "15 dias" });

  // Larguras desiguais (cliente ganha mais espaço) em vez de dividir o
  // card em partes iguais — um nome de cliente longo (ex.: "ANTONIO DE
  // PAULO DE LIMA VIEIRA") estourava a coluna e ficava escrito por cima
  // do campo "VENDEDOR(A)" ao lado.
  const fieldWidths =
    clientFields.length === 3
      ? [contentW * 0.44, contentW * 0.28, contentW * 0.28]
      : clientFields.map(() => contentW / clientFields.length);

  let fieldX = margin + 8;
  clientFields.forEach((f, i) => {
    const fx = fieldX;
    const maxWidth = fieldWidths[i] - 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setTxt(doc, NAVY);
    doc.text(f.label, fx, y + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setTxt(doc, INK);
    let displayValue = f.value;
    while (displayValue.length > 3 && doc.getTextWidth(displayValue) > maxWidth) {
      displayValue = displayValue.slice(0, -1);
    }
    if (displayValue !== f.value) displayValue = `${displayValue.trimEnd()}…`;
    doc.text(displayValue, fx, y + 12.5);

    fieldX += fieldWidths[i];
  });

  y += clientCardH + 8;

  // ─── TABELA DE PRODUTOS ───────────────────────────────────────────────────
  const extraTotal = (quote.freight || 0) + (quote.installation || 0) + (quote.referralCommissionValue || 0);
  const subtotal = quote.subtotal || 0;
  // item.price já é o TOTAL da linha (preço unitário × quantidade, calculado
  // no orçamento) — não um valor por unidade. O bug anterior multiplicava
  // por item.quantity de novo tanto aqui quanto na tabela abaixo, inflando
  // o total exibido no PDF (ex.: 3 unidades por R$709,97 virava R$2.129,90
  // na coluna de preço unitário, e a coluna TOTAL multiplicava isso por 3
  // outra vez, dando R$6.389,71 em vez de R$2.129,90).
  const dissolvedItems = (quote.items || []).map((item) => {
    const share = subtotal > 0 ? item.price / subtotal : 0;
    const extraShareForLine = share * extraTotal;
    const displayedTotal = item.price + extraShareForLine;
    const displayedUnitPrice = item.quantity > 0 ? displayedTotal / item.quantity : displayedTotal;
    return { ...item, displayedTotal, displayedUnitPrice };
  });

  const headCols = options.hidePrice ? ["Descrição", "Un.", "Qtd."] : ["Descrição", "Preço Unit.", "Un.", "Qtd.", "Total"];
  const colWidths = options.hidePrice ? [144, 18, 18] : [90, 30, 16, 14, 30];
  const colX: number[] = [];
  {
    let acc = margin;
    for (const w of colWidths) {
      colX.push(acc);
      acc += w;
    }
  }

  interface Row {
    name: string;
    specLines: string[];
    price?: string;
    unit: string;
    qty: string;
    total?: string;
    height: number;
  }

  const padX = 4;
  // Largura real disponível pro texto da descrição — sem isso, uma linha
  // longa (medidas + tipo de vidro + cor tudo junto) desenhava por cima
  // das colunas de preço/qtd/total em vez de quebrar.
  const descTextW = colWidths[0] - padX - 3;

  const rows: Row[] = dissolvedItems.map((item) => {
    const rawSpecs: string[] = [];
    if (!options.hideMeasures && (item.width > 0 || item.height > 0)) {
      const wDisp = item.width >= 1000
        ? `${(item.width / 1000).toFixed(2).replace(".", ",")}m`
        : `${item.width}mm`;
      const hDisp = item.height >= 1000
        ? `${(item.height / 1000).toFixed(2).replace(".", ",")}m`
        : `${item.height}mm`;
      rawSpecs.push(`Medidas: ${hDisp} × ${wDisp}`);
    }
    if (!options.hideDetailedDescription && item.description) {
      const cleanDesc = item.description
        .split(" | ")
        .filter((part) => !part.toLowerCase().startsWith("acréscimo por serviço"))
        .join(" | ");
      if (cleanDesc) rawSpecs.push(cleanDesc);
    }
    if (item.selectedColor && item.selectedColor !== "Padrão") {
      rawSpecs.push(`Cor: ${item.selectedColor}`);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const specLines: string[] = rawSpecs.flatMap(
      (s) => doc.splitTextToSize(s, descTextW) as string[]
    );

    const padV = 3;
    const nameH = 5;
    const specH = 3.7;
    const height = Math.max(13, padV * 2 + nameH + specLines.length * specH);
    return {
      name: item.productName || "",
      specLines,
      price: options.hidePrice ? undefined : `R$ ${fmtBR(item.displayedUnitPrice)}`,
      unit: "und",
      qty: String(item.quantity),
      total: options.hidePrice ? undefined : `R$ ${fmtBR(item.displayedTotal)}`,
      height,
    };
  });

  const headerH = 9;
  const tableRadius = 2.5;

  let rowIdx = 0;
  while (rowIdx < rows.length) {
    const avail = pageH - FOOTER_RESERVE - y - headerH;
    let used = 0;
    let count = 0;
    while (rowIdx + count < rows.length) {
      const rh = rows[rowIdx + count].height;
      if (count > 0 && used + rh > avail) break;
      used += rh;
      count++;
    }
    if (count === 0) {
      doc.addPage();
      drawTopAccent();
      y = margin;
      continue;
    }

    const chunkH = headerH + used;

    // gradiente do cabeçalho + zebra recortados nos cantos arredondados
    doc.saveGraphicsState();
    doc.roundedRect(margin, y, contentW, chunkH, tableRadius, tableRadius, null);
    doc.clip();
    doc.discardPath();

    gradientH(doc, margin, y, contentW, headerH, NAVY, NAVY_LIGHT);

    let zy = y + headerH;
    for (let i = 0; i < count; i++) {
      const r = rows[rowIdx + i];
      if ((rowIdx + i) % 2 === 1) {
        setFill(doc, BLUE_TINT2);
        doc.rect(margin, zy, contentW, r.height, "F");
      }
      zy += r.height;
    }
    doc.restoreGraphicsState();

    // borda externa arredondada
    setStroke(doc, LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, contentW, chunkH, tableRadius, tableRadius, "S");

    // cabeçalho (texto)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setTxt(doc, WHITE);
    headCols.forEach((label, ci) => {
      const cx = colX[ci];
      const cw = colWidths[ci];
      if (ci === 0) {
        doc.text(label.toUpperCase(), cx + 4, y + headerH / 2 + 1.5);
      } else {
        const align = options.hidePrice ? "center" : "right";
        const tx = align === "center" ? cx + cw / 2 : cx + cw - 4;
        doc.text(label.toUpperCase(), tx, y + headerH / 2 + 1.5, { align });
      }
    });

    // linhas de produtos
    let ry = y + headerH;
    for (let i = 0; i < count; i++) {
      const r = rows[rowIdx + i];
      const cellY = ry;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      setTxt(doc, NAVY);
      let ty = cellY + 5.5;
      doc.text(r.name, colX[0] + padX, ty);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setTxt(doc, MUTED);
      for (const spec of r.specLines) {
        ty += 3.7;
        doc.text(spec, colX[0] + padX, ty);
      }

      const midY = cellY + r.height / 2 + 1.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTxt(doc, INK);
      if (!options.hidePrice) {
        doc.text(r.price!, colX[1] + colWidths[1] - padX, midY, { align: "right" });
        doc.text(r.unit, colX[2] + colWidths[2] / 2, midY, { align: "center" });
        doc.text(r.qty, colX[3] + colWidths[3] / 2, midY, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.text(r.total!, colX[4] + colWidths[4] - padX, midY, { align: "right" });
      } else {
        doc.text(r.unit, colX[1] + colWidths[1] / 2, midY, { align: "center" });
        doc.text(r.qty, colX[2] + colWidths[2] / 2, midY, { align: "center" });
      }

      const isLastOverall = rowIdx + i === rows.length - 1;
      if (!isLastOverall) {
        setStroke(doc, LINE);
        doc.setLineWidth(0.15);
        doc.line(margin, cellY + r.height, margin + contentW, cellY + r.height);
      }
      ry += r.height;
    }

    y += chunkH;
    rowIdx += count;

    if (rowIdx < rows.length) {
      doc.addPage();
      drawTopAccent();
      y = margin;
    }
  }

  y += 8;

  // ─── TOTAIS ────────────────────────────────────────────────────────────
  if (!options.hidePrice) {
    const dissolvedSubtotal = dissolvedItems.reduce((s, i) => s + i.displayedTotal, 0);
    const boxW = 85;
    const boxX = pageW - margin - boxW;

    ensureSpace(36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setTxt(doc, MUTED);
    doc.text("Subtotal dos produtos", boxX, y + 4);
    setTxt(doc, INK);
    doc.text(`R$ ${fmtBR(dissolvedSubtotal)}`, pageW - margin, y + 4, { align: "right" });
    y += 7;

    if ((quote.discount || 0) > 0) {
      setTxt(doc, MUTED);
      doc.text("Descontos", boxX, y + 4);
      setTxt(doc, GREEN);
      doc.text(`-R$ ${fmtBR(quote.discount || 0)}`, pageW - margin, y + 4, { align: "right" });
      y += 7;
    }

    y += 2;
    const grandH = 13;
    gradientRoundedH(doc, boxX, y, boxW, grandH, 2.5, NAVY_DEEP, NAVY);
    setTxt(doc, WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL", boxX + 6, y + grandH / 2 + 1.8);
    doc.setFontSize(15);
    doc.text(`R$ ${fmtBR(quote.totalPrice || 0)}`, boxX + boxW - 6, y + grandH / 2 + 1.8, { align: "right" });
    y += grandH + 10;
  } else {
    y += 4;
  }

  // ─── EXTRAÇÃO DE PRAZO DE ENTREGA / OBSERVAÇÕES DAS NOTAS ────────────────
  const noteLines = [(quote as any).measurementNotes || "", (quote as any).assemblyNotes || ""]
    .join("\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const deliveryLines: string[] = [];
  const obsLines: string[] = [];
  for (const line of noteLines) {
    const u = line.toUpperCase();
    if (u.startsWith("PRAZO DE ENTREGA:") || u.startsWith("DATA PREVISTA")) deliveryLines.push(line);
    else obsLines.push(line);
  }
  const deliveryText = deliveryLines.join("\n") || "A combinar após aprovação";
  const obsText = obsLines.join("\n") || "—";

  // ─── CARDS: PAGAMENTO / PRAZO / OBSERVAÇÕES ─────────────────────────────
  const cardGap = 5;
  const cardW = (contentW - cardGap * 2) / 3;
  const cards = [
    { title: "FORMA DE PAGAMENTO", body: quote.paymentMethod || "A Definir" },
    { title: "PRAZO DE ENTREGA / INSTALAÇÃO", body: deliveryText },
    { title: "OBSERVAÇÕES", body: obsText },
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const wrappedBodies = cards.map((c) => doc.splitTextToSize(c.body, cardW - 8) as string[]);
  const cardH = Math.max(24, ...wrappedBodies.map((w) => 11 + w.length * 4));

  ensureSpace(cardH + 6);

  cards.forEach((card, i) => {
    const cx = margin + i * (cardW + cardGap);
    setFill(doc, BLUE_TINT2);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "F");
    setStroke(doc, LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "S");
    setFill(doc, ACCENT);
    doc.rect(cx + 1, y, cardW - 2, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setTxt(doc, NAVY);
    doc.text(card.title, cx + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTxt(doc, INK);
    doc.text(wrappedBodies[i], cx + 4, y + 11);
  });

  y += cardH + 12;

  // ─── ASSINATURA ──────────────────────────────────────────────────────────
  ensureSpace(20);
  const ruleW = 80;
  const ruleX = pageW / 2 - ruleW / 2;
  setStroke(doc, SIGN_RULE);
  doc.setLineWidth(0.25);
  doc.line(ruleX, y, ruleX + ruleW, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setTxt(doc, NAVY);
  doc.text(companySettings.legalName || companySettings.name || "", pageW / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setTxt(doc, MUTED);
  const city = cityFromAddress(companySettings.address || "");
  // Data de emissão do PDF (dia da impressão), distinta da data do orçamento.
  doc.text(`${city}, ${todayStr}`, pageW / 2, y, { align: "center" });

  // ─── RODAPÉ + PAGINAÇÃO (todas as páginas) ───────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setStroke(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setTxt(doc, MUTED);
    doc.text(`Documento gerado por ${companySettings.name || ""} · Sistema de Gestão`, margin, pageH - 9);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 9, { align: "right" });
  }

  return doc;
}
