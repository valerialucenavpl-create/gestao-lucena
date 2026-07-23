import React, { useMemo, useState } from "react";
import jsPDF from "jspdf";
import { InventoryItem, Product } from "../types";
import { getCompositionLineBreakdown } from "../utils/productComposition";
import { resolveMaterialPurchaseLengthMeters } from "../utils/materialPurchaseLength";

// ---------- helpers (mirrored from ProductModal) ----------
type MaterialVariant = {
  name?: string; color_name?: string; variant_name?: string; color?: string;
  cost?: number; cost_price?: number; price?: number; value?: number;
};

const getVariantName = (v?: MaterialVariant | null) =>
  String(v?.name ?? v?.color_name ?? v?.variant_name ?? v?.color ?? "").trim();

const getVariantCost = (v?: MaterialVariant | null) =>
  Number(v?.cost ?? v?.cost_price ?? v?.price ?? v?.value ?? 0);

const getMaterialVariants = (material?: InventoryItem | null): MaterialVariant[] => {
  if (!material) return [];
  const variants =
    (material as any)?.colorVariants ??
    (material as any)?.color_variants ??
    (material as any)?.inventory_variants ??
    [];
  if (!Array.isArray(variants)) return [];
  return variants
    .map((v: any) => { const n = getVariantName(v); return n ? { ...v, name: n, cost: getVariantCost(v) } : null; })
    .filter(Boolean) as MaterialVariant[];
};

const getEffectiveMaterialUnitCost = (material: InventoryItem | null | undefined, rawCost: number) => {
  const safe = Number(rawCost || 0);
  if (!Number.isFinite(safe)) return 0;
  const pl = resolveMaterialPurchaseLengthMeters((material || null) as unknown as Record<string, unknown> | null);
  if (!(pl > 0)) return safe;
  const unit = String(material?.unit || "").trim().toLowerCase();
  if (unit === "m") return safe / pl;
  if (unit === "cm") return safe / (pl * 100);
  if (unit === "mm") return safe / (pl * 1000);
  return safe;
};

const fmtCurrency = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- types ----------
interface MaterialRow {
  key: string;
  materialName: string;
  colorVariant: string;
  unit: string;
  byProduct: Record<string, { quantity: number; unitCost: number; totalCost: number }>;
}

// ---------- component ----------
interface ProductReportModalProps {
  products: Product[];
  rawMaterials: InventoryItem[];
  onClose: () => void;
}

const ProductReportModal: React.FC<ProductReportModalProps> = ({ products, rawMaterials, onClose }) => {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" })),
    [products]
  );

  const filtered = useMemo(
    () => sortedProducts.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [sortedProducts, search]
  );

  const selectedProducts = useMemo(
    () => sortedProducts.filter(p => selectedIds.has(p.id)),
    [sortedProducts, selectedIds]
  );

  const toggleProduct = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const report = useMemo((): MaterialRow[] => {
    if (!showDetail || selectedProducts.length === 0) return [];

    const productBreakdowns: Record<string, Map<string, { materialName: string; colorVariant: string; unit: string; quantity: number; unitCost: number; totalCost: number }>> = {};

    for (const product of selectedProducts) {
      const widthMm = product.referenceWidthMm || 1000;
      const heightMm = product.referenceHeightMm || 1000;
      const map = new Map<string, { materialName: string; colorVariant: string; unit: string; quantity: number; unitCost: number; totalCost: number }>();

      for (const compItem of product.composition || []) {
        const material = rawMaterials.find(m => String(m.id) === String(compItem.materialId));
        if (!material) continue;

        const variants = getMaterialVariants(material);
        const variantName = compItem.variantName || "";
        const variant = variants.find(v => getVariantName(v) === variantName) || variants[0] || null;
        const rawCost = variant ? getVariantCost(variant) : 0;
        const unitCost = getEffectiveMaterialUnitCost(material, rawCost);

        const breakdown = getCompositionLineBreakdown(compItem, material, unitCost, widthMm, heightMm);
        const colorVariant = variantName || (variant ? getVariantName(variant) : "");
        const key = `${material.name}|${colorVariant}`;

        const existing = map.get(key);
        if (existing) {
          existing.quantity += breakdown.requiredQuantity;
          existing.totalCost += breakdown.totalCost;
        } else {
          map.set(key, {
            materialName: material.name,
            colorVariant,
            unit: material.unit,
            quantity: breakdown.requiredQuantity,
            unitCost: breakdown.calculationUnitCost,
            totalCost: breakdown.totalCost,
          });
        }
      }

      productBreakdowns[product.id] = map;
    }

    // Merge keys in order: first product first, then any new keys from subsequent products
    const allKeys: string[] = [];
    const keySet = new Set<string>();
    for (const product of selectedProducts) {
      for (const key of productBreakdowns[product.id].keys()) {
        if (!keySet.has(key)) { keySet.add(key); allKeys.push(key); }
      }
    }

    return allKeys.map(key => {
      let materialName = "";
      let colorVariant = "";
      let unit = "";
      const byProduct: Record<string, { quantity: number; unitCost: number; totalCost: number }> = {};

      for (const product of selectedProducts) {
        const entry = productBreakdowns[product.id].get(key);
        if (entry) {
          materialName = materialName || entry.materialName;
          colorVariant = colorVariant || entry.colorVariant;
          unit = unit || entry.unit;
          byProduct[product.id] = { quantity: entry.quantity, unitCost: entry.unitCost, totalCost: entry.totalCost };
        }
      }

      return { key, materialName, colorVariant, unit, byProduct };
    });
  }, [showDetail, selectedProducts, rawMaterials]);

  const productTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of report) {
      for (const [pid, data] of Object.entries(row.byProduct)) {
        result[pid] = (result[pid] || 0) + data.totalCost;
      }
    }
    return result;
  }, [report]);

  // ---- PDF download ----
  const handleDownloadPDF = () => {
    const isLandscape = selectedProducts.length > 1;
    const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });

    const pageW = isLandscape ? 297 : 210;
    const pageH = isLandscape ? 210 : 297;
    const margin = 12;
    const contentW = pageW - margin * 2;

    type RGB = [number, number, number];
    const NAVY: RGB    = [30, 61, 122];
    const NAVY2: RGB   = [22, 48, 95];
    const NAVY_L: RGB  = [44, 83, 160];
    const INK: RGB     = [31, 41, 55];
    const GRAY: RGB    = [100, 116, 139];
    const LINE: RGB    = [226, 232, 240];
    const ALTROW: RGB  = [248, 250, 252];
    const TOTBG: RGB   = [230, 236, 248];
    const WHITE: RGB   = [255, 255, 255];

    const setFill   = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const setTxt    = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const setStroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

    let y = margin;

    // ── Cabeçalho ──────────────────────────────────────────────────────
    setFill(NAVY); doc.rect(margin, y, contentW, 13, "F");
    setTxt(WHITE); doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Relatório de Composição de Produtos", margin + 4, y + 8.5);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, pageW - margin - 3, y + 8.5, { align: "right" });
    y += 17;

    // ── Calcula larguras de colunas ────────────────────────────────────
    const matW = Math.min(70, contentW * 0.32);
    const restW = contentW - matW;
    const prodW = restW / selectedProducts.length; // total por produto
    const subW  = prodW / 3;                        // qty | unit | total

    const headerH1 = 9;
    const headerH2 = 7;

    // ── Linha 1 do cabeçalho: "MATERIAL" + nomes dos produtos ─────────
    let x = margin;
    setFill(NAVY2); doc.rect(x, y, matW, headerH1 + headerH2, "F");
    setStroke(NAVY2); doc.setLineWidth(0.1); doc.rect(x, y, matW, headerH1 + headerH2, "S");
    setTxt(WHITE); doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("MATERIAL", x + 3, y + (headerH1 + headerH2) / 2 + 2);
    x += matW;

    for (const p of selectedProducts) {
      setFill(NAVY_L); doc.rect(x, y, prodW, headerH1, "F");
      setStroke(NAVY2); doc.rect(x, y, prodW, headerH1, "S");
      setTxt(WHITE); doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
      const label = p.name.length > 34 ? p.name.slice(0, 32) + "…" : p.name;
      doc.text(label, x + prodW / 2, y + 5.5, { align: "center" });

      // linha 2: dimensão de referência + sub-headers
      const dimLabel = (p.referenceHeightMm || p.referenceWidthMm)
        ? `${p.referenceHeightMm ?? 0} × ${p.referenceWidthMm ?? 0} mm`
        : "";
      const subLabels = dimLabel
        ? ["Quantidade", "Vlr. Unit.", "Vlr. Total"]
        : ["Quantidade", "Vlr. Unit.", "Vlr. Total"];

      for (let i = 0; i < 3; i++) {
        setFill(NAVY2); doc.rect(x + i * subW, y + headerH1, subW, headerH2, "F");
        setStroke(NAVY2); doc.rect(x + i * subW, y + headerH1, subW, headerH2, "S");
        setTxt(WHITE); doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
        const sub = i === 0 && dimLabel ? dimLabel : subLabels[i];
        doc.text(sub, x + i * subW + subW / 2, y + headerH1 + 4.5, { align: "center" });
      }

      x += prodW;
    }
    y += headerH1 + headerH2 + 1;

    // ── Linhas de dados ────────────────────────────────────────────────
    const rowH = 6.5;

    for (let i = 0; i < report.length; i++) {
      const row = report[i];

      if (y + rowH > pageH - margin - 12) {
        doc.addPage();
        y = margin;
      }

      const bg = i % 2 === 0 ? WHITE : ALTROW;
      x = margin;

      // Célula material
      setFill(bg); doc.rect(x, y, matW, rowH, "F");
      setStroke(LINE); doc.setLineWidth(0.15); doc.rect(x, y, matW, rowH, "S");
      setTxt(INK); doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
      let mLabel = row.materialName;
      if (row.colorVariant) mLabel += ` (${row.colorVariant})`;
      if (mLabel.length > 30) mLabel = mLabel.slice(0, 28) + "…";
      doc.text(mLabel, x + 2, y + 4.2);
      x += matW;

      // Células de cada produto
      for (const p of selectedProducts) {
        const d = row.byProduct[p.id];
        const vals = d
          ? [
              `${Number(d.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${row.unit}`,
              `R$ ${Number(d.unitCost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `R$ ${Number(d.totalCost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            ]
          : ["—", "—", "—"];

        for (let col = 0; col < 3; col++) {
          setFill(bg); doc.rect(x + col * subW, y, subW, rowH, "F");
          setStroke(LINE); doc.rect(x + col * subW, y, subW, rowH, "S");
          setTxt(d ? INK : GRAY); doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
          doc.text(vals[col], x + col * subW + subW - 2, y + 4.2, { align: "right" });
        }
        x += prodW;
      }

      y += rowH;
    }

    // ── Linha de total ─────────────────────────────────────────────────
    if (y + rowH + 2 > pageH - margin) { doc.addPage(); y = margin; }

    doc.setLineWidth(0.5);
    setStroke(NAVY); doc.line(margin, y, margin + contentW, y);
    doc.setLineWidth(0.15);
    y += 1;

    x = margin;
    setFill(TOTBG); doc.rect(x, y, contentW, rowH + 1, "F");
    setStroke(LINE); doc.rect(x, y, contentW, rowH + 1, "S");
    setTxt(NAVY); doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("TOTAL — CUSTO MATÉRIA-PRIMA", x + 3, y + 5);
    x += matW;

    for (const p of selectedProducts) {
      x += subW * 2;
      const total = productTotals[p.id] || 0;
      doc.text(
        `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        x + subW - 2,
        y + 5,
        { align: "right" }
      );
      x += subW;
    }

    // ── Rodapé ─────────────────────────────────────────────────────────
    setTxt(GRAY); doc.setFontSize(6); doc.setFont("helvetica", "normal");
    doc.text("Lucena PRO — Sistema de Gestão", margin, pageH - 6);
    doc.text(`Página 1`, pageW - margin, pageH - 6, { align: "right" });

    const dateStr = new Date().toISOString().split("T")[0];
    doc.save(`composicao-produtos-${dateStr}.pdf`);
  };

  // ---- Detail View ----
  if (showDetail) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDetail(false)}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium text-sm"
            >
              ← Voltar
            </button>
            <h2 className="text-lg font-semibold text-gray-800">
              Detalhamento de Composição
            </h2>
            <span className="text-sm text-gray-500">
              {selectedProducts.length} produto(s) • baseado nas medidas de referência
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg font-semibold text-sm hover:bg-primary-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Baixar PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full min-w-max">
              <thead>
                {/* Product headers */}
                <tr>
                  <th
                    rowSpan={2}
                    className="px-4 py-3 text-left bg-slate-800 text-white font-semibold border border-slate-700 sticky left-0 z-10 min-w-[200px]"
                  >
                    Material
                  </th>
                  {selectedProducts.map(p => (
                    <th
                      key={p.id}
                      colSpan={3}
                      className="px-3 py-2 text-center bg-primary-700 text-white font-semibold border border-primary-600"
                    >
                      <div className="truncate max-w-xs">{p.name}</div>
                      {(p.referenceHeightMm || p.referenceWidthMm) ? (
                        <div className="text-xs font-normal opacity-80 mt-0.5">
                          {p.referenceHeightMm || 0} × {p.referenceWidthMm || 0} mm
                        </div>
                      ) : (
                        <div className="text-xs font-normal opacity-60 mt-0.5">sem medida de referência</div>
                      )}
                    </th>
                  ))}
                </tr>
                {/* Column sub-headers */}
                <tr>
                  {selectedProducts.map(p => (
                    <React.Fragment key={p.id}>
                      <th className="px-2 py-2 text-right bg-primary-800 text-white text-xs font-medium border border-primary-700 whitespace-nowrap">
                        Quantidade
                      </th>
                      <th className="px-2 py-2 text-right bg-primary-800 text-white text-xs font-medium border border-primary-700 whitespace-nowrap">
                        Vlr. Unit.
                      </th>
                      <th className="px-2 py-2 text-right bg-primary-800 text-white text-xs font-medium border border-primary-600 whitespace-nowrap">
                        Vlr. Total
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 border border-gray-200 sticky left-0 bg-inherit z-10 font-medium text-gray-800 whitespace-nowrap">
                      {row.materialName}
                      {row.colorVariant && (
                        <span className="ml-1.5 text-xs text-gray-400 font-normal">
                          {row.colorVariant}
                        </span>
                      )}
                    </td>
                    {selectedProducts.map(p => {
                      const d = row.byProduct[p.id];
                      return (
                        <React.Fragment key={p.id}>
                          <td className="px-3 py-2.5 text-right border border-gray-200 text-gray-700 whitespace-nowrap">
                            {d
                              ? `${Number(d.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${row.unit}`
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right border border-gray-200 text-gray-600 whitespace-nowrap">
                            {d ? fmtCurrency(d.unitCost) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right border border-gray-200 font-semibold text-gray-900 whitespace-nowrap">
                            {d ? fmtCurrency(d.totalCost) : <span className="text-gray-300">—</span>}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td className="px-4 py-3 font-bold text-slate-800 border border-slate-200 sticky left-0 bg-slate-100 z-10">
                    Total — Custo Matéria-Prima
                  </td>
                  {selectedProducts.map(p => (
                    <React.Fragment key={p.id}>
                      <td className="border border-slate-200" />
                      <td className="border border-slate-200" />
                      <td className="px-3 py-3 text-right font-bold text-primary-700 border border-slate-200 whitespace-nowrap text-base">
                        {fmtCurrency(productTotals[p.id] || 0)}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---- Selection View ----
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-xl font-semibold text-gray-800">Relatório de Produtos</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {selectedIds.size > 0 && (
          <span className="text-sm text-primary-700 font-medium">
            {selectedIds.size} selecionado(s)
          </span>
        )}
        <button
          onClick={() => { setSelectedIds(new Set()); }}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
          style={{ display: selectedIds.size > 0 ? "inline" : "none" }}
        >
          Limpar seleção
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowDetail(true)}
          disabled={selectedIds.size === 0}
          className="px-5 py-2 bg-primary-700 text-white rounded-lg font-semibold text-sm hover:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Gerar Detalhamento {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-12">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(product => {
              const selected = selectedIds.has(product.id);
              return (
                <label
                  key={product.id}
                  className={`relative flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                    selected
                      ? "border-primary-600 bg-primary-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm"
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleProduct(product.id)}
                    className="absolute top-2 left-2 w-4 h-4 accent-primary-600"
                  />

                  {/* Imagem */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center mb-2 border border-gray-200 mt-2">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-2xl text-gray-300">📦</span>
                    )}
                  </div>

                  {/* Nome */}
                  <span className="text-xs font-semibold text-gray-800 text-center leading-snug line-clamp-2">
                    {product.name}
                  </span>
                  {product.category && (
                    <span className="text-xs text-gray-400 mt-0.5 text-center">{product.category}</span>
                  )}
                  {(product.referenceHeightMm || product.referenceWidthMm) && (
                    <span className="text-xs text-gray-400 mt-0.5">
                      {product.referenceHeightMm || 0}×{product.referenceWidthMm || 0}mm
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductReportModal;
