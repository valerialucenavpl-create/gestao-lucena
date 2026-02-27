// components/QuoteDetail.tsx
import React, { useMemo, useState } from "react";
import {
  Quote,
  QuoteItem,
  InventoryItem,
  Product,
  VariableExpense,
  CompanySettings,
} from "../types";
import { Icon } from "./icons/Icon";

interface QuoteDetailProps {
  quote: Quote;
  rawMaterials: InventoryItem[];
  products: Product[];
  variableExpenses?: VariableExpense[]; // ✅ opcional (pode vir undefined)
  companySettings: CompanySettings;
  onUpdateQuote: (quote: Quote) => void;
  onBack: () => void;
}

// Helper component for editable fields in preview
const EditableField: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}> = ({ value, onChange, className = "", placeholder = "", multiline = false }) => {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded px-1 resize-none overflow-hidden ${className}`}
        placeholder={placeholder}
        rows={value.split("\n").length || 1}
        style={{ minHeight: "1.5em" }}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded px-1 w-full ${className}`}
      placeholder={placeholder}
    />
  );
};

const QuotePreview: React.FC<{
  quote: Quote;
  companySettings: CompanySettings;
  showDetails: boolean;
  showCosts: boolean;
}> = ({ quote, companySettings, showDetails, showCosts }) => {
  const currentDate = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const safeQuoteItems = Array.isArray(quote?.items) ? quote.items : [];

  const [companyName, setCompanyName] = useState(companySettings?.name || "SUA EMPRESA");
  const [legalName, setLegalName] = useState(companySettings?.legalName || "Razão Social LTDA");
  const [ownerName, setOwnerName] = useState("Responsável / Vendedor");
  const [cnpj, setCnpj] = useState(companySettings?.cnpj || "00.000.000/0001-00");
  const [address, setAddress] = useState(companySettings?.address || "Endereço da Empresa");
  const [phone, setPhone] = useState(companySettings?.phone || "(00) 00000-0000");
  const [email, setEmail] = useState(companySettings?.email || "email@empresa.com");
  const [docTitle, setDocTitle] = useState(
    `Ordem de serviço (N° ${String(quote?.id || "").replace(/\D/g, "") || "001"} - ${new Date().getFullYear()})`
  );

  // Subtotal exibido quando não mostrar frete/instalação separados
  const displayedSubtotal = showCosts
    ? Number(quote?.subtotal || 0)
    : Number(quote?.subtotal || 0) + Number(quote?.freight || 0) + Number(quote?.installation || 0);

  return (
    <div className="p-8 bg-white text-gray-800 font-sans max-w-4xl mx-auto printable-content">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="w-1/3">
          <div className="flex flex-col">
            <div className="relative">
              {companySettings?.logo ? (
                <img src={companySettings.logo} alt="Logo" className="max-h-24 object-contain mb-2" />
              ) : (
                <EditableField
                  value={companyName}
                  onChange={setCompanyName}
                  className="text-4xl font-extrabold italic text-blue-900 tracking-tighter leading-none uppercase"
                  placeholder="NOME FANTASIA"
                />
              )}
              {!companySettings?.logo && <div className="h-1.5 w-24 bg-orange-500 mt-1 skew-x-12"></div>}
            </div>
          </div>
        </div>

        <div className="w-2/3 text-right text-sm space-y-1 flex flex-col items-end">
          <EditableField
            value={legalName}
            onChange={setLegalName}
            className="font-bold text-lg uppercase text-right"
            placeholder="RAZÃO SOCIAL"
          />
          <EditableField
            value={ownerName}
            onChange={setOwnerName}
            className="uppercase font-medium text-right"
            placeholder="NOME DO RESPONSÁVEL"
          />
          <div className="flex items-center justify-end w-full gap-1">
            <span className="whitespace-nowrap">CNPJ:</span>
            <EditableField value={cnpj} onChange={setCnpj} className="text-right w-40" />
          </div>
          <EditableField value={address} onChange={setAddress} className="text-right" placeholder="ENDEREÇO COMPLETO" />

          <div className="flex justify-end gap-4 font-medium mt-2 w-full">
            <div className="flex items-center gap-1 justify-end">
              <Icon className="w-3 h-3 flex-shrink-0">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </Icon>
              <EditableField value={phone} onChange={setPhone} className="w-32 text-right" />
            </div>
            <div className="flex items-center gap-1 justify-end">
              <Icon className="w-3 h-3 flex-shrink-0">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </Icon>
              <EditableField value={email} onChange={setEmail} className="w-40 text-right" />
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="bg-gray-100 py-2 px-4 flex justify-between items-center mb-6 border-y border-gray-200">
        <div className="flex-grow">
          <EditableField value={docTitle} onChange={setDocTitle} className="text-xl font-bold text-blue-900 bg-transparent" />
        </div>
        <div className="flex items-center gap-2 text-gray-700 font-medium flex-shrink-0 ml-4">
          <Icon className="w-4 h-4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </Icon>
          <span>{new Date(quote?.date || Date.now()).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>

      {/* Client */}
      <div className="bg-gray-100 p-4 mb-8 border-l-4 border-blue-900 rounded-sm">
        <p className="font-bold text-gray-800 text-lg">
          Cliente: <span className="font-normal capitalize">{quote?.customerName || "—"}</span>
        </p>
        <p className="text-gray-600">
          {safeQuoteItems[0]?.description ? "Detalhes conforme projeto." : "Endereço não informado."}
        </p>
      </div>

      {/* Products */}
      <h3 className="text-xl font-bold text-blue-900 mb-3 text-center">Produtos</h3>

      <div className="mb-8">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-blue-900 text-white">
            <tr>
              <th className="p-3 text-left font-bold w-5/12">Descrição</th>
              <th className="p-3 text-right font-bold w-2/12">Preço</th>
              <th className="p-3 text-center font-bold w-1/12">Unidade</th>
              <th className="p-3 text-center font-bold w-1/12">Quant.</th>
              <th className="p-3 text-right font-bold w-3/12">Total</th>
            </tr>
          </thead>
          <tbody>
            {safeQuoteItems.map((item, idx) => {
              const fullDescription =
                item.description || `Acabamento: ${item.selectedColor} | Medidas: ${item.width}x${item.height}mm`;
              const displayDescription = showDetails ? fullDescription : fullDescription.split("[Detalhamento]")[0].trim();

              const itemPrice = showCosts
                ? Number(item.price || 0)
                : Number(item.price || 0) +
                  (Number(quote?.freight || 0) + Number(quote?.installation || 0)) / Math.max(1, safeQuoteItems.length);

              return (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                  <td className="p-3 border-b border-gray-200">
                    <span className="font-semibold block text-gray-900">{item.productName}</span>
                    <span className="text-xs text-gray-500 block mt-0.5 whitespace-pre-wrap">{displayDescription}</span>
                  </td>
                  <td className="p-3 text-right border-b border-gray-200 text-gray-700">
                    R$ {(itemPrice / Math.max(1, item.quantity)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-3 text-center border-b border-gray-200 text-gray-700">und</td>
                  <td className="p-3 text-center border-b border-gray-200 text-gray-700">{item.quantity}</td>
                  <td className="p-3 text-right font-bold text-gray-900 border-b border-gray-200">
                    R$ {itemPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex flex-col items-end mb-8">
        <div className="w-full md:w-1/2 lg:w-5/12">
          <div className="flex justify-between py-2 px-2 border-b border-gray-300">
            <span className="font-bold text-gray-700">Subtotal produtos</span>
            <span className="font-bold text-gray-900">
              R$ {displayedSubtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {(quote?.freight || 0) > 0 && showCosts && (
            <div className="flex justify-between py-2 px-2 border-b border-gray-300">
              <span className="font-bold text-gray-700">Frete</span>
              <span className="font-bold text-gray-900">
                R$ {Number(quote?.freight || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {(quote?.installation || 0) > 0 && showCosts && (
            <div className="flex justify-between py-2 px-2 border-b border-gray-300">
              <span className="font-bold text-gray-700">Instalação</span>
              <span className="font-bold text-gray-900">
                R$ {Number(quote?.installation || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {Number(quote?.discount || 0) > 0 && (
            <div className="flex justify-between py-2 px-2 border-b border-gray-300 text-red-600">
              <span className="font-bold">Desconto</span>
              <span className="font-bold">
                - R$ {Number(quote?.discount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="flex justify-between bg-blue-900 text-white p-3 mt-2 font-bold text-xl rounded-sm shadow-sm">
            <span>Total</span>
            <span>R$ {Number(quote?.totalPrice || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 pt-4 border-t border-gray-200">
        <div>
          <h4 className="font-bold text-blue-900 mb-2 text-lg">Forma de pagamento</h4>
          <p className="text-gray-700 font-medium">{quote?.paymentMethod || "—"}</p>
          <p className="text-sm text-gray-500 mt-1">Pix, cartão de crédito, cartão de débito, dinheiro.</p>
          {quote?.paymentMethod === "Pix" && (
            <p className="text-sm font-mono bg-gray-100 p-2 mt-2 rounded">
              Chave Pix: {String(phone).replace(/[^\d]/g, "")}
            </p>
          )}
        </div>
        <div>
          <h4 className="font-bold text-blue-900 mb-2 text-lg">Condições de pagamento</h4>
          <p className="text-gray-700">
            {Number(quote?.subtotal || 0) > Number(quote?.totalPrice || 0)
              ? "Desconto especial aplicado."
              : "À vista ou parcelado no cartão."}
          </p>
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-16 pt-8">
        <div className="text-center mb-16 text-gray-600 flex justify-center items-center gap-1">
          <EditableField value={"Cidade"} onChange={() => {}} className="w-32 text-right" />, {currentDate}
        </div>
        <div className="flex justify-between px-8 gap-12">
          <div className="text-center flex-1 flex flex-col items-center">
            <div className="border-t border-gray-800 w-3/4 mx-auto pt-2"></div>
            <p className="font-bold text-gray-900 uppercase text-center">{companyName}</p>
            <p className="text-xs text-gray-500 uppercase text-center">{ownerName}</p>
          </div>
          <div className="text-center flex-1">
            <div className="border-t border-gray-800 w-3/4 mx-auto pt-2"></div>
            <p className="font-bold text-gray-900 uppercase">{quote?.customerName || "—"}</p>
            <p className="text-xs text-gray-500 uppercase">Cliente</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuoteDetail: React.FC<QuoteDetailProps> = ({
  quote,
  rawMaterials,
  products,
  variableExpenses = [], // ✅ evita undefined
  companySettings,
  onUpdateQuote,
  onBack,
}) => {
  const safeCompanySettings = companySettings ?? ({} as CompanySettings); // ✅ garante objeto
  const safeRawMaterials = Array.isArray(rawMaterials) ? rawMaterials : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const safeQuoteItems = Array.isArray(quote?.items) ? quote.items : [];

  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showCosts, setShowCosts] = useState(false);

  const [editedQuote, setEditedQuote] = useState<Quote>(() => structuredClone(quote));

  const totalVariablePercent = useMemo(() => {
    return (Array.isArray(variableExpenses) ? variableExpenses : [])
      .filter((e) => e?.type === "percent")
      .reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
  }, [variableExpenses]);

  const recalcQuote = (base: Quote, items: QuoteItem[]) => {
    const safeItems = Array.isArray(items) ? items : [];

    const newCalculatedItems = safeItems.map((item) => {
      const product = safeProducts.find((p) => p.id === item.productId);
      if (!product) return { ...item, price: 0, cost: 0 };

      let totalCostOfGoods = 0;

      product.composition.forEach((compItem) => {
        const material = safeRawMaterials.find((m) => m.id === compItem.materialId);
        if (!material) return;

        const colorVariant =
          material.colorVariants.find((cv) => cv.name === item.selectedColor) || material.colorVariants[0];
        if (!colorVariant) return;

        let materialQty = 0;
        const width_m = Number(item.width || 0) / 1000;
        const height_m = Number(item.height || 0) / 1000;

        switch (compItem.rule) {
          case "perimeter":
            materialQty = width_m * 2 + height_m * 2;
            break;
          case "height_multiplier":
            materialQty = height_m * (compItem.multiplier || 1);
            break;
          case "width_multiplier":
            materialQty = width_m * (compItem.multiplier || 1);
            break;
          case "area_multiplier":
            materialQty = width_m * height_m * (compItem.multiplier || 1);
            break;
          case "fill":
            if (material.unit === "m²") {
              materialQty = width_m * height_m;
            } else {
              const pieceWidth_m = (compItem.factor || 1) / 1000;
              if (pieceWidth_m > 0) {
                const piecesNeeded = Math.ceil(width_m / pieceWidth_m);
                materialQty = piecesNeeded * height_m;
              }
            }
            break;
          case "fixed_quantity":
            materialQty = compItem.quantity || 1;
            break;
        }

        totalCostOfGoods += materialQty * Number(colorVariant.cost || 0);
      });

      const costPerUnit = totalCostOfGoods;
      const profitMargin = Number(product.desiredProfitMargin || 0) / 100;
      const variableCostMargin = Number(totalVariablePercent || 0) / 100;
      const markupDivisor = 1 - variableCostMargin - profitMargin;

      const salePrice = markupDivisor > 0 ? costPerUnit / markupDivisor : costPerUnit * 2;

      return {
        ...item,
        price: salePrice * Number(item.quantity || 0),
        cost: costPerUnit * Number(item.quantity || 0),
      };
    });

    const subtotal = newCalculatedItems.reduce((acc, item) => acc + Number(item.price || 0), 0);
    const totalPrice =
      subtotal + Number(base.freight || 0) + Number(base.installation || 0) - Number(base.discount || 0);
    const costOfGoods = newCalculatedItems.reduce((acc, item) => acc + Number(item.cost || 0), 0);

    return {
      ...base,
      items: newCalculatedItems,
      subtotal,
      totalPrice,
      costOfGoods,
    };
  };

  const startEdit = () => {
    const cloned = structuredClone(quote);
    const recalculated = recalcQuote(cloned, safeQuoteItems);
    setEditedQuote(recalculated);
    setIsEditing(true);
  };

  const handleItemChange = (id: string, field: keyof QuoteItem, value: any) => {
    setEditedQuote((prev) => {
      const updatedItems = (Array.isArray(prev.items) ? prev.items : []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      );
      return recalcQuote(prev, updatedItems);
    });
  };

  const handleSimpleField = (field: "freight" | "installation" | "discount", value: number) => {
    setEditedQuote((prev) => {
      const base = { ...prev, [field]: value };
      return recalcQuote(base, base.items || []);
    });
  };

  const handleSave = () => {
    onUpdateQuote(editedQuote);
    setIsEditing(false);
  };

  const handlePrint = () => window.print();

  const currentQuote = isEditing ? editedQuote : quote;
  const inputClass = "w-full p-1 border rounded bg-primary-600 text-white border-primary-500 placeholder-blue-200";

  const renderEditableItemRow = (item: QuoteItem) => {
    const product = safeProducts.find((p) => p.id === item.productId);

    const availableColors = Array.from(
      new Set(
        product?.composition.flatMap((c) => {
          const material = safeRawMaterials.find((m) => m.id === c.materialId);
          return material?.colorVariants.map((cv) => cv.name) || [];
        }) || []
      )
    );

    return (
      <tr key={item.id} className="border-b">
        <td className="p-2 align-top">
          <select
            value={item.productId}
            onChange={(e) => handleItemChange(item.id, "productId", e.target.value)}
            className={inputClass}
          >
            {safeProducts.map((p) => (
              <option key={p.id} value={p.id} className="bg-white text-gray-900">
                {p.name}
              </option>
            ))}
          </select>
        </td>

        <td className="p-2 align-top">
          <select
            value={item.selectedColor}
            onChange={(e) => handleItemChange(item.id, "selectedColor", e.target.value)}
            className={inputClass}
          >
            {availableColors.length > 0 ? (
              availableColors.map((c) => (
                <option key={c} value={c} className="bg-white text-gray-900">
                  {c}
                </option>
              ))
            ) : (
              <option value="Padrão" className="bg-white text-gray-900">
                Padrão
              </option>
            )}
          </select>
        </td>

        <td className="p-2 align-top">
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => handleItemChange(item.id, "quantity", parseInt(e.target.value || "0", 10))}
            className={`${inputClass} w-16 text-center`}
          />
        </td>

        <td className="p-2 align-top">
          <input
            type="number"
            value={item.width}
            onChange={(e) => handleItemChange(item.id, "width", parseFloat(e.target.value || "0"))}
            className={`${inputClass} w-24 text-center`}
            placeholder="Largura (mm)"
          />
        </td>

        <td className="p-2 align-top">
          <input
            type="number"
            value={item.height}
            onChange={(e) => handleItemChange(item.id, "height", parseFloat(e.target.value || "0"))}
            className={`${inputClass} w-24 text-center`}
            placeholder="Altura (mm)"
          />
        </td>

        <td className="p-2 text-right align-top font-semibold">
          R$ {Number(item.price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <Icon className="w-5 h-5">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </Icon>
            Voltar para Orçamentos
          </button>
          <h2 className="text-2xl font-bold text-gray-800">Detalhes do Orçamento #{currentQuote.id}</h2>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            <Icon>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </Icon>
            Visualizar / Imprimir
          </button>

          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedQuote(structuredClone(quote));
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700"
              >
                Salvar
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
            >
              Editar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        {/* ... (o resto do seu JSX permanece igual) ... */}
      </div>

      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl min-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center no-print">
              <h3 className="text-lg font-medium text-gray-900">Pré-visualização do Orçamento</h3>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showDetails}
                    onChange={(e) => setShowDetails(e.target.checked)}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  Mostrar Detalhamento Técnico
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCosts}
                    onChange={(e) => setShowCosts(e.target.checked)}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  Mostrar Custos (Frete/Inst.)
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={() => setIsPreviewOpen(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                  >
                    Fechar
                  </button>

                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Icon>
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </Icon>
                    Imprimir
                  </button>
                </div>
              </div>
            </div>

            <div className="printable-area flex-1 bg-gray-50 overflow-y-auto">
              <QuotePreview
                quote={currentQuote}
                companySettings={safeCompanySettings} // ✅ usa o safe
                showDetails={showDetails}
                showCosts={showCosts}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDetail;
