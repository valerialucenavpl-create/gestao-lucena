// src/components/NewQuote.tsx
import React, { useState, useMemo } from "react";
import {
  User,
  Client,
  InventoryItem,
  Product,
  VariableExpense,
  Quote,
  QuoteItem,
} from "../types";
import { Icon } from "./icons/Icon";
import {
  GLASS_PRODUCTS,
  GLASS_TYPES,
  GLASS_COLORS,
  PROFILE_COLORS,
  HARDWARE_COLORS,
  HANDLES,
} from "../constants";

interface NewQuoteProps {
  currentUser: User;
  clients: Client[];
  rawMaterials: InventoryItem[];
  products: Product[];
  variableExpenses: VariableExpense[];
  onAddQuote: (quote: Quote) => void;
  onAddNewClient: (client: Client) => void;
  onCancel: () => void;
}

const NewQuote: React.FC<NewQuoteProps> = ({
  currentUser,
  clients,
  rawMaterials,
  products,
  variableExpenses,
  onAddQuote,
  onAddNewClient,
  onCancel,
}) => {
  // ============================
  //           STATES
  // ============================
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<Quote["paymentMethod"]>("Cartão");
  const [discount, setDiscount] = useState<number>(0);
  const [freight, setFreight] = useState<number>(0);
  const [installation, setInstallation] = useState<number>(0);
  const [referralCommissionRate, setReferralCommissionRate] = useState<number>(0); // % (ex: 5)
  const [requireColor, setRequireColor] = useState<boolean>(false);
  const [selectedColor, setSelectedColor] = useState<string>("");

const getColorsByCategory = (): string[] => {
  const usage = mapCategoryToUsage(activeCategory);

  const colors = rawMaterials
    .filter((m) => (m.usageCategory || "").toUpperCase() === usage)
    .flatMap((m) => (m.colorVariants || []).map((cv) => cv.name))
    .map((c) => (c || "").trim())
    .filter(Boolean);

  return Array.from(new Set(colors));
};



  const [measurementNotes, setMeasurementNotes] = useState<string>("");
  const [assemblyNotes, setAssemblyNotes] = useState<string>("");

  // Modal de novo cliente
  const [isClientModalOpen, setIsClientModalOpen] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>("");
  const [newClientPhone, setNewClientPhone] = useState<string>("");

  // ✅ novos campos do modal
  const [newClientAddress, setNewClientAddress] = useState<string>("");
  const [newClientReferencePoint, setNewClientReferencePoint] = useState<string>("");
  const [newClientNotes, setNewClientNotes] = useState<string>("");

  // Categoria ativa
  const [activeCategory, setActiveCategory] = useState<
    "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO"
  >("GRANITO");

  // GRANITO
  const [grMaterialId, setGrMaterialId] = useState<string>("");
  const [grVariantName, setGrVariantName] = useState<string>("");
  const [grPieces, setGrPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [grDescription, setGrDescription] = useState<string>("");

  // ALUMÍNIO
  const [alMaterialId, setAlMaterialId] = useState<string>("");
  const [alVariantName, setAlVariantName] = useState<string>("");
  const [alPieces, setAlPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [alDescription, setAlDescription] = useState<string>("");
  const [isAlGridVisible, setIsAlGridVisible] = useState<boolean>(true);

  // PORTÃO
  const [poMaterialId, setPoMaterialId] = useState<string>("");
  const [poVariantName, setPoVariantName] = useState<string>("");
  const [poPieces, setPoPieces] = useState<
    { id: string; length: number; width: number; quantity: number }[]
  >([{ id: "1", length: 0, width: 0, quantity: 1 }]);
  const [poDescription, setPoDescription] = useState<string>("");
  const [isPoGridVisible, setIsPoGridVisible] = useState<boolean>(true);

  // VIDROS (wizard)
  const [gwSelectedProduct, setGwSelectedProduct] = useState<string>("");
  const [gwWidth, setGwWidth] = useState<number>(2000);
  const [gwHeight, setGwHeight] = useState<number>(2500);
  const [gwGlassType, setGwGlassType] = useState<string>("g8");
  const [gwGlassColor, setGwGlassColor] = useState<string>("incolor");
  const [gwProfileColor, setGwProfileColor] = useState<string>("branco");
  const [gwHardwareColor, setGwHardwareColor] = useState<string>("branco");
  const [gwHandle, setGwHandle] = useState<string>("");
  const [gwQuantity, setGwQuantity] = useState<number>(1);



// ---------------------------
// CORES POR CATEGORIA (BOTÕES)
// ---------------------------

// Se você já tem um state de cor em outro lugar, pode reaproveitar.
// Aqui é um state genérico para o "seletor de cores" da tela.

// Mapeia as categorias do orçamento para as categorias do seu estoque/produto
const mapCategoryToUsage = (cat: "GRANITO" | "VIDROS" | "ALUMINIO" | "PORTAO") => {
  switch (cat) {
    case "VIDROS":
      return "VIDRO";
    case "ALUMINIO":
      return "ALUMINIO";
    case "PORTAO":
      return "PORTAO";
    case "GRANITO":
      return "MARMORE"; // ou "GRANITO", depende do que você usa no seu cadastro
    default:
      return "OUTROS";
  }
};


// (Opcional) quando trocar categoria, limpa a cor selecionada se não existir na nova lista
// ✅ Select de cor do produto (dropdown)
const [selectedColor, setSelectedColor] = useState<string>("");

// ✅ sempre deixa uma cor válida selecionada quando muda a categoria/lista
useEffect(() => {
  if (availableColors.length === 0) {
    setSelectedColor("");
    return;
  }
  setSelectedColor((prev) => prev || availableColors[0]);
}, [availableColors]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeCategory, rawMaterials]);

  // ============================
  //       CUSTOS VARIÁVEIS
  // ============================
  const totalVariablePercent = useMemo(() => {
    const safe = Array.isArray(variableExpenses) ? variableExpenses : [];
    return safe
      .filter((e) => e?.type === "percent")
      .reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
  }, [variableExpenses]);

  // Helper para campos de dinheiro
  const handleCurrencyChange =
    (setter: React.Dispatch<React.SetStateAction<number>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/\D/g, "");
      const numberValue = Number(rawValue) / 100;
      setter(numberValue);
    };

  // ============================
  //    CÁLCULO DE PRODUTO PADRÃO
  // ============================
  const calculateItemPrice = (
    productId: string,
    width: number,
    height: number,
    quantity: number,
    color: string
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return { price: 0, cost: 0 };

    let totalCostOfGoods = 0;

    product.composition.forEach((compItem) => {
      const material = rawMaterials.find((m) => m.id === compItem.materialId);
      if (!material) return;

      const colorVariant =
        material.colorVariants.find((cv) => cv.name === color) ||
        material.colorVariants[0];

      if (!colorVariant) return;

      let materialQty = 0;
      const width_m = width / 1000;
      const height_m = height / 1000;

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
        default:
          break;
      }

      totalCostOfGoods += materialQty * colorVariant.cost;
    });

    const laborCost = product.laborCost || 0;
    totalCostOfGoods += laborCost;

    const profitMargin = product.desiredProfitMargin / 100;
    const variableCostMargin = totalVariablePercent / 100;
    const markupDivisor = 1 - variableCostMargin - profitMargin;

    const unitPrice =
      markupDivisor > 0 ? totalCostOfGoods / markupDivisor : totalCostOfGoods * 2;

    return {
      price: unitPrice * quantity,
      cost: totalCostOfGoods * quantity,
    };
  };


  // ============================
const categories = [
  {
    id: "GRANITO" as const,
    label: "Granito",
    description: "Bancadas, soleiras e degraus em pedra.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </Icon>
    ),
  },
  {
    id: "VIDROS" as const,
    label: "Vidros",
    description: "Sacadas, boxes e esquadrias especiais.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </Icon>
    ),
  },
  {
    id: "ALUMINIO" as const,
    label: "Alumínio",
    description: "Portas, janelas e estruturas em alumínio.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 7h10v10H7z" />
      </Icon>
    ),
  },
  {
    id: "PORTAO" as const,
    label: "Portão",
    description: "Portões de correr, basculantes e especiais.",
    icon: (
      <Icon className="w-4 h-4">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14" />
        <path d="M17 5v14" />
      </Icon>
    ),
  }, // <- pode deixar essa vírgula ou remover (tanto faz)
] as const;


  // ============================
  //   FUNÇÕES DE PEÇAS GENÉRICAS
  // ============================
  const addPiece = (setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
    setter([...currentPieces, { id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
  };

  const removePiece = (index: number, setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
    if (currentPieces.length > 1) {
      const newPieces = [...currentPieces];
      newPieces.splice(index, 1);
      setter(newPieces);
    }
  };

  const updatePiece = (
    index: number,
    field: string,
    value: number,
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    currentPieces: any[]
  ) => {
    const newPieces = [...currentPieces];
    newPieces[index][field] = value;
    setter(newPieces);
  };

  const getCalculations = (materialId: string, variantName: string, pieces: any[]) => {
    if (!materialId) {
      return { totalArea: 0, totalPrice: 0, totalCost: 0, productName: "", variantLabel: "" };
    }

    const material = rawMaterials.find((m) => m.id === materialId);
    const product = products.find((p) => p.id === materialId);

    let unitPrice = 0;
    let unitCost = 0;
    let productName = "";
    let variantLabel = variantName;

    if (material) {
      const variant =
        material.colorVariants.find((v) => v.name === variantName) ||
        material.colorVariants[0];
      unitPrice = variant?.salePrice || 0;
      unitCost = variant?.cost || 0;
      productName = material.name;
      variantLabel = variant?.name || "Padrão";
    } else if (product) {
      const { price, cost } = calculateItemPrice(product.id, 1000, 1000, 1, "Padrão");
      unitPrice = price;
      unitCost = cost;
      productName = product.name;
      variantLabel = "Padrão";
    }

    let totalArea = 0;
    pieces.forEach((piece) => {
      totalArea += piece.length * piece.width * piece.quantity;
    });

    const totalPrice = totalArea * unitPrice;
    const totalCost = totalArea * unitCost;

    return { totalArea, totalPrice, totalCost, productName, variantLabel };
  };

  const handleAddPieceItem = (
    category: string,
    materialId: string,
    variantName: string,
    pieces: any[],
    description: string,
    reset: () => void
  ) => {
if (!selectedColor) {
  alert("Selecione uma cor antes de adicionar.");
  return;
}


    if (!materialId) return alert("Selecione um produto/material.");

    const { totalArea, totalPrice, totalCost, productName, variantLabel } = getCalculations(
      materialId,
      variantName,
      pieces
    );

    if (totalArea === 0) return alert("Adicione medidas válidas.");

    const piecesDesc = pieces
      .map((p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length.toFixed(2)}m x ${p.width.toFixed(2)}m)`)
      .join("\n");

    const baseDesc = `${productName} ${variantLabel !== "Padrão" ? "- " + variantLabel : ""}`;
const requireColor = () => {
  if (!selectedColor) {
    alert("Selecione uma cor antes de adicionar o item.");
    return false;
  }
  return true;
};

    const fullDescription = description.trim()
      ? `${description}\n\n[Detalhamento]\n${piecesDesc}`
      : `${baseDesc}\n\n[Detalhamento]\n${piecesDesc}`;

    const newItem: QuoteItem = {
      id: `qi-${category.toLowerCase()}-${Date.now()}`,
      productId: materialId,
      productName,
      selectedColor: variantLabel,
      description: fullDescription,
      width: 0,
      height: 0,
      quantity: 1,
      price: totalPrice,
      cost: totalCost,
    };

    setItems((prev) => [...prev, newItem]);
    reset();
  };

  // ============================
  //          GLASS WIZARD
  // ============================
  const handleAddGlassItem = () => {
     if (!requireColor()) return;
    if (!gwSelectedProduct) return alert("Selecione um produto.");
    if (!gwHandle) return alert("Selecione um puxador.");

    const productObj = GLASS_PRODUCTS.find((p) => p.id === gwSelectedProduct);
    const glassTypeObj = GLASS_TYPES.find((g) => g.id === gwGlassType);
    const glassColorObj = GLASS_COLORS.find((c) => c.id === gwGlassColor);
    const handleObj = HANDLES.find((h) => h.id === gwHandle);

    if (!productObj || !glassTypeObj || !glassColorObj || !handleObj) return;

    const area = (gwWidth / 1000) * (gwHeight / 1000);
    const glassCost = area * glassTypeObj.cost * glassColorObj.priceMod;
    const kitCost = 150;
    const handleCost = handleObj.cost;

    const totalCost = (glassCost + kitCost + handleCost) * gwQuantity;

    const desiredMargin = 0.35;
    const variableMargin = totalVariablePercent / 100;
    const markupDivisor = 1 - variableMargin - desiredMargin;

    const unitPrice =
      markupDivisor > 0 ? totalCost / gwQuantity / markupDivisor : (totalCost / gwQuantity) * 2;

    const finalPrice = unitPrice * gwQuantity;

    const description = `${glassTypeObj.name} ${glassColorObj.name} | Alum: ${gwProfileColor} | Ferr: ${gwHardwareColor} | Puxador: ${handleObj.name}`;

    const newItem: QuoteItem = {
      id: `qi-glass-${Date.now()}`,
      productId: gwSelectedProduct,
      productName: productObj.name,
      selectedColor: gwGlassColor,
      description,
      width: gwWidth,
      height: gwHeight,
      quantity: gwQuantity,
      price: finalPrice,
      cost: totalCost,
    };

    setItems((prev) => [...prev, newItem]);
  };

  // ============================
  //     ITENS E TOTAIS GERAIS
  // ============================
  const handleRemoveItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleItemChange = (id: string, field: keyof QuoteItem, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id) return item;

        const updatedItem: QuoteItem = { ...item, [field]: value };

        if (
          field === "productId" ||
          field === "width" ||
          field === "height" ||
          field === "quantity" ||
          field === "selectedColor"
        ) {
          const product = products.find((p) => p.id === updatedItem.productId);
          if (product) {
            if (field === "productId") {
              updatedItem.productName = product.name;
              const availableColors = Array.from(
                new Set(
                  product.composition.flatMap((c) => {
                    const material = rawMaterials.find((m) => m.id === c.materialId);
                    return material?.colorVariants.map((cv) => cv.name) || [];
                  })
                )
              );
              updatedItem.selectedColor = availableColors.length > 0 ? (availableColors[0] as string) : "Padrão";
            }

            const { price, cost } = calculateItemPrice(
              updatedItem.productId,
              updatedItem.width,
              updatedItem.height,
              updatedItem.quantity,
              updatedItem.selectedColor
            );
            updatedItem.price = price;
            updatedItem.cost = cost;
          }
        }

        return updatedItem;
      })
    );
  };

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

// Base do orçamento (antes da comissão de indicação)
const baseTotal = subtotal + freight + installation - discount;

// Comissão de indicação (% em cima do valor do orçamento)
const referralCommissionValue =
  referralCommissionRate > 0
    ? baseTotal * (referralCommissionRate / 100)
    : 0;

// 🔥 TOTAL FINAL (cliente paga comissão)
const totalPrice = baseTotal + referralCommissionValue;

const totalCostOfGoods =
  items.reduce((sum, item) => sum + item.cost, 0);


const commissionRate =
  variableExpenses.find((e) =>
    e.name.toLowerCase().includes("comissão")
  )?.value || 0;

const taxRate =
  variableExpenses.find(
    (e) =>
      e.name.toLowerCase().includes("imposto") ||
      e.name.toLowerCase().includes("simples")
  )?.value || 0;

const cardRate =
  variableExpenses.find(
    (e) =>
      e.name.toLowerCase().includes("maquininha") ||
      e.name.toLowerCase().includes("cartão")
  )?.value || 0;

const commissionValue = totalPrice * (commissionRate / 100);
const taxValue = totalPrice * (taxRate / 100);
const cardValue =
  paymentMethod === "Cartão"
    ? totalPrice * (cardRate / 100)
    : 0;

const fixedCostEstimatePercent = 20;
const fixedCostValue =
  totalPrice * (fixedCostEstimatePercent / 100);

const netProfit =
  totalPrice -
  totalCostOfGoods -
  commissionValue -
  taxValue -
  cardValue -
  fixedCostValue;

const netProfitMargin =
  totalPrice > 0
    ? (netProfit / totalPrice) * 100
    : 0;


  // ============================
  //          SALVAR
  // ============================
const handleSave = () => {
  if (!selectedClientId) return alert("Selecione um cliente.");
  if (items.length === 0) return alert("Adicione pelo menos um item.");

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const newQuote: Quote = {
    id: `q${Date.now()}`,
    clientId: selectedClientId,
    customerName: selectedClient ? selectedClient.name : "Cliente Desconhecido",
    items,
    subtotal,
    discount,
    freight,
    installation,
    totalPrice,
    paymentMethod,
    assemblyNotes,
    measurementNotes,
    date: new Date(date),
    status: "Pendente",
    salesperson: currentUser.name,
    costOfGoods: totalCostOfGoods,
    fixedCosts: fixedCostValue,
    machineFee: cardValue,
    taxes: taxValue,

    referralCommissionRate,
  referralCommissionValue,
  };

  onAddQuote(newQuote);
};



  const handleSaveNewClient = () => {
    if (!newClientName.trim()) return alert("Nome do cliente é obrigatório.");

    const newClient: Client = {
      id: `c${Date.now()}`,
      name: newClientName,
      phone: newClientPhone,
      notes: newClientNotes,
      address: {
        street: newClientAddress,
        referencePoint: newClientReferencePoint,
      },
    };

    onAddNewClient(newClient);
    setSelectedClientId(newClient.id);

    setIsClientModalOpen(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientAddress("");
    setNewClientReferencePoint("");
    setNewClientNotes("");
  };

  // ============================
  //  COMPONENTE REUTILIZÁVEL DE PEÇAS
  // ============================
  const renderMultiPieceCalculator = ({
    materialId,
    setMaterialId,
    variantName,
    setVariantName,
    pieces,
    setPieces,
    description,
    setDescription,
    onAdd,
    categoryFilter,
    showProductGrid = false,
    isGridVisible = true,
    setIsGridVisible = (_v: boolean) => {},
  }: any) => {
    const calculations = getCalculations(materialId, variantName, pieces);

    const availableItems =
      categoryFilter === "GRANITO"
        ? rawMaterials.filter((m) => m.usageCategory === "Chapa/Placa")
        : products.filter((p) =>
            (p.category || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase()
              .includes(
                categoryFilter
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()
              )
          );

           return (
      <div className="space-y-4">
        {showProductGrid && !isGridVisible && (
          <button
            onClick={() => setIsGridVisible(true)}
            className="mb-4 flex items-center gap-2 text-primary-600 font-medium hover:underline"
          >
            <Icon className="w-4 h-4">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </Icon>
            Mostrar Catálogo de Produtos
          </button>
        )}

        {(!showProductGrid || isGridVisible) && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">
                  Produto / Material
                </label>
                <select
                  value={materialId}
                  onChange={(e) => {
                    setMaterialId(e.target.value);
                    const mat = rawMaterials.find((m) => m.id === e.target.value);
                    if (mat && mat.colorVariants.length > 0) setVariantName(mat.colorVariants[0].name);
                    if (!mat) setVariantName("Padrão");
                  }}
                  className="w-full h-12 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-medium shadow-sm focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                >
                  <option value="" className="bg-white text-gray-900">
                    Selecione o Item
                  </option>
                  {availableItems.map((item: any) => (
                    <option key={item.id} value={item.id} className="bg-white text-gray-900">
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Comprimento</div>
              <div className="col-span-3">Largura</div>
              <div className="col-span-2">Qtd</div>
              <div className="col-span-2">M²</div>
              <div className="col-span-2">Valor</div>
            </div>

            {pieces.map((piece: any, index: number) => {
              const pieceM2 = piece.length * piece.width * piece.quantity;
              const unitPrice =
                calculations.totalArea > 0 ? calculations.totalPrice / calculations.totalArea : 0;
              const pieceValue = pieceM2 * unitPrice;

              return (
                <div key={piece.id} className="grid grid-cols-12 gap-2 items-center relative group">
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={piece.length || ""}
                      onChange={(e) =>
                        updatePiece(index, "length", parseFloat(e.target.value), setPieces, pieces)
                      }
                      className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={piece.width || ""}
                      onChange={(e) =>
                        updatePiece(index, "width", parseFloat(e.target.value), setPieces, pieces)
                      }
                      className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={piece.quantity}
                      onChange={(e) =>
                        updatePiece(index, "quantity", parseInt(e.target.value), setPieces, pieces)
                      }
                      className="w-full h-10 px-1 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                      min={1}
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="w-full h-10 flex items-center justify-center border rounded-lg bg-primary-600 text-white font-bold border-primary-500 shadow-inner">
                      {pieceM2.toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="h-10 flex items-center justify-end px-2 rounded-lg bg-primary-700 text-white border border-primary-600 font-bold text-xs sm:text-sm shadow-inner">
                      {pieceValue.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {pieces.length > 1 && (
                    <button
                      onClick={() => removePiece(index, setPieces, pieces)}
                      className="absolute -right-8 top-2 text-red-500 hover:text-red-700 transition-colors"
                      title="Remover medida"
                    >
                      <Icon className="w-5 h-5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </Icon>
                    </button>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end">
              <button
                onClick={() => addPiece(setPieces, pieces)}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-md"
              >
                + ADICIONAR MEDIDA
              </button>
            </div>

            <div className="w-full">
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 h-24 border rounded-lg bg-primary-600 text-white border-primary-500 placeholder-blue-200 focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 resize-none"
                placeholder="Descreva os detalhes do produto..."
              />
            </div>

            <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4 border-t border-gray-200">
              <div className="text-right">
                <span className="block text-xs text-gray-500 uppercase font-bold mb-1">TOTAL GERAL</span>
                <div className="px-4 py-2 bg-primary-900 text-white rounded-lg text-2xl font-bold shadow-md">
                  R{" "}
                  {calculations.totalPrice.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>

              <button
                onClick={onAdd}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95 uppercase text-sm flex items-center gap-2 h-full"
              >
                <Icon className="w-5 h-5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </Icon>
                Adicionar ao Orçamento
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ============================
  //            JSX
  // ============================
  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Novo Orçamento</h2>
          <p className="text-sm text-gray-500">
            Preencha os dados do cliente, adicione os itens e salve para gerar o orçamento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <Icon className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </Icon>
            Voltar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold shadow-md hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Icon className="w-4 h-4">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </Icon>
            Salvar Orçamento
          </button>
        </div>
      </div>

      {/* DADOS DO CLIENTE */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Dados do Cliente e Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Cliente</label>
            <div className="flex gap-2 mt-1">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="flex-grow px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsClientModalOpen(true)}
                className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                title="Novo Cliente"
              >
                <Icon className="w-5 h-5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </Icon>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900"
            />
          </div>
        </div>
      </div>

      {/* PRODUCT BUILDER + CATEGORIAS EM CARDS */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Selecione o tipo de orçamento</h3>
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Categorias</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  group text-left rounded-xl border px-3 py-3 transition-all
                  flex flex-col gap-1 h-full
                  ${
                    activeCategory === cat.id
                      ? "border-primary-500 bg-primary-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-primary-300 hover:bg-gray-50"
                  }
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`
                        rounded-full p-2 flex items-center justify-center
                        ${
                          activeCategory === cat.id
                            ? "bg-primary-600 text-white"
                            : "bg-gray-100 text-gray-500 group-hover:bg-primary-100 group-hover:text-primary-700"
                        }
                      `}
                    >
                      {cat.icon}
                    </div>
                    <span
                      className={`
                        text-sm font-bold
                        ${activeCategory === cat.id ? "text-primary-700" : "text-gray-800"}
                      `}
                    >
                      {cat.label}
                    </span>
                  </div>

                  {activeCategory === cat.id && (
                    <span className="text-[10px] font-semibold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full">
                      ATIVO
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 mt-1 leading-snug">{cat.description}</p>
              </button>
            ))}
          </div>
        </div>

        {activeCategory === "GRANITO" &&
          renderMultiPieceCalculator({
            materialId: grMaterialId,
            setMaterialId: setGrMaterialId,
            variantName: grVariantName,
            setVariantName: setGrVariantName,
            pieces: grPieces,
            setPieces: setGrPieces,
            description: grDescription,
            setDescription: setGrDescription,
            onAdd: () =>
              handleAddPieceItem("GRANITO", grMaterialId, grVariantName, grPieces, grDescription, () => {
                setGrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
                setGrDescription("");
              }),
            categoryFilter: "GRANITO",
          })}
<div className="mt-6">
  <label className="block text-xs font-bold text-gray-600 mb-2 uppercase">
    Escolha a Cor *
  </label>

  <div className="flex flex-wrap gap-2">
    {getColorsByCategory().map((color) => (
      <button
        key={color}
        type="button"
        onClick={() => setSelectedColor(color)}
        className={`
          px-4 py-2 rounded-lg border text-sm font-semibold transition-all
          ${
            selectedColor === color
              ? "bg-primary-600 text-white border-primary-600 shadow-md scale-105"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
          }
        `}
      >
        {color}
      </button>
    ))}
  </div>

  {!selectedColor && (
    <p className="text-xs text-red-500 mt-2">
      A cor é obrigatória.
    </p>
  )}
</div>

        {/* (VIDROS / ALUMINIO / PORTAO) — mantenha igual ao seu código atual, se já está funcionando */}
        {/* ... */}
      </div>

      {/* Totais e forma de pagamento (mantive seu bloco original quando possível) */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex justify-end mt-4">
          <div className="w-full max-w-xs space-y-2">
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>TOTAL</span>
              <span>
                R{" "}
                {totalPrice.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="text-xs text-gray-500 mt-1">
              Forma de Pagamento:
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Quote["paymentMethod"])}
                className="ml-1 p-1 border rounded bg-primary-600 text-white border-primary-500"
              >
                <option value="A Definir" className="bg-white text-gray-900">
                  A Definir
                </option>
                <option value="PIX" className="bg-white text-gray-900">
                  PIX
                </option>
                <option value="Cartão" className="bg-white text-gray-900">
                  Cartão
                </option>
                <option value="Dinheiro" className="bg-white text-gray-900">
                  Dinheiro
                </option>
              </select>
            </div>
          </div>
        </div>

        {currentUser.role === "Admin" && (
          <div className="mt-6 border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-r-lg relative shadow-sm">
            <div className="absolute -left-1 top-0 bottom-0 w-1 bg-yellow-400 rounded-l"></div>
            <h4 className="text-md font-semibold text-yellow-800 mb-3">
              Detalhamento Financeiro do Orçamento (Admin)
            </h4>

            <div className="grid grid-cols-2 gap-8 text-sm">
              <div className="space-y-1">
                <div className="flex justify-between text-gray-700">
                  <span>Matéria Prima (CMV):</span>
                  <span className="font-medium">
                    R{" "}
                    {totalCostOfGoods.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex justify-between text-gray-700">
                  <span>Comissão ({commissionRate}%):</span>
                  <span className="font-medium">
                    R{" "}
                    {commissionValue.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex justify-between text-gray-700">
                  <span>Impostos ({taxRate}%):</span>
                  <span className="font-medium">
                    R{" "}
                    {taxValue.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex justify-between text-gray-700">
                  <span>Custos Fixos (Est. {fixedCostEstimatePercent}%):</span>
                  <span className="font-medium">
                    R{" "}
                    {fixedCostValue.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
{referralCommissionRate > 0 && (
  <div className="flex justify-between text-gray-700">
    <span>
      Comissão de Indicação ({referralCommissionRate}%):
    </span>
    <span className="font-medium">
      R{" "}
      {referralCommissionValue.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      })}
    </span>
  </div>
)}


                {paymentMethod === "Cartão" && (
                  <div className="flex justify-between text-red-600">
                    <span>Taxa Maquininha ({cardRate}%):</span>
                    <span className="font-medium">
                      R{" "}
                      {cardValue.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center border-l border-yellow-200 pl-8">
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  Lucro Líquido Estimado
                </span>
                <span className={`text-3xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  R{" "}
                  {netProfit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <span className={`text-sm font-medium ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                  Margem de Lucro <br />
                  <span className="text-lg">{netProfitMargin.toFixed(2)}%</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Observações */}
      <div className="bg-white p-6 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Medidas</label>
          <textarea
            value={measurementNotes}
            onChange={(e) => setMeasurementNotes(e.target.value)}
            rows={3}
            className="w-full p-2 border rounded text-gray-900"
            placeholder="Ex: Medidas exatas confirmadas no local."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Montagem</label>
          <textarea
            value={assemblyNotes}
            onChange={(e) => setAssemblyNotes(e.target.value)}
            rows={3}
            className="w-full p-2 border rounded text-gray-900"
            placeholder="Ex: Levar escada grande."
          />
        </div>
      </div>

      {/* Modal cliente rápido */}
      {isClientModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Adicionar Novo Cliente Rápido</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                />
              </div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

  {/* FRETE */}
  <div>
    <label className="block text-sm font-medium text-gray-700">
      Frete
    </label>
    <input
      type="number"
      value={freight}
      onChange={(e) =>
        setFreight(parseFloat(e.target.value) || 0)
      }
      className="w-full mt-1 p-2 border rounded text-gray-900"
    />
  </div>
{/* SELETOR DE CORES (obrigatório) */}
<div className="mt-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Cor * ({activeCategory})
  </label>

  {getColorsByCategory().length === 0 ? (
    <div className="text-sm text-red-600">
      Nenhuma cor cadastrada para {activeCategory}. Cadastre cores no Estoque.
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      {getColorsByCategory().map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => setSelectedColor(color)}
          className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
            selectedColor === color
              ? "bg-primary-600 text-white border-primary-600 shadow-md scale-105"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
          }`}
        >
          {color}
        </button>
      ))}
    </div>
  )}

  {!selectedColor && (
    <p className="text-xs text-red-500 mt-2">A cor é obrigatória.</p>
  )}
</div>

  {/* COMISSÃO DE INDICAÇÃO (%) */}
  <div>
    <label className="block text-sm font-medium text-gray-700">
      Comissão de Indicação (%)
    </label>
    <input
      type="number"
      value={referralCommissionRate}
      onChange={(e) =>
        setReferralCommissionRate(
          Number(e.target.value) || 0
        )
      }
      className="w-full mt-1 p-2 border rounded text-gray-900"
      min={0}
      step="0.01"
      placeholder="Ex: 5"
    />
  </div>

  {/* INSTALAÇÃO */}
  <div>
    <label className="block text-sm font-medium text-gray-700">
      Instalação
    </label>
    <input
      type="number"
      value={installation}
      onChange={(e) =>
        setInstallation(
          parseFloat(e.target.value) || 0
        )
      }
      className="w-full mt-1 p-2 border rounded text-gray-900"
    />
  </div>

</div>

              {/* ✅ NOVOS CAMPOS */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Endereço</label>
                <input
                  type="text"
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Rua, número, bairro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Ponto de Referência</label>
                <input
                  type="text"
                  value={newClientReferencePoint}
                  onChange={(e) => setNewClientReferencePoint(e.target.value)}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Ex: Próximo ao mercado"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Observação</label>
                <textarea
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  rows={3}
                  className="w-full mt-1 p-2 border rounded text-gray-900"
                  placeholder="Informações adicionais sobre o cliente"
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveNewClient}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Salvar Cliente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewQuote;
