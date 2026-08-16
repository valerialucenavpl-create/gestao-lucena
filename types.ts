// ---------------------------------------------
// Views do sistema
// ---------------------------------------------
export type View =
  | "dashboard"
  | "quotes"
  | "sales"
  | "clients"
  | "agenda"
  | "products"
  | "inventory"
  | "cashflow"
  | "payables"
  | "receivables"
  | "financials"
  | "employees"
  | "employee-new"
  | "assistant"
  | "reports"
  | "settings"
  | "sellers";


// ---------------------------------------------
// Usuário
// ---------------------------------------------
export interface User {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Sales" | "Finance";
  avatar?: string;
  monthlyGoal?: number;
  password?: string;
}

// ---------------------------------------------
// Materiais / Estoque
// ---------------------------------------------
export interface ColorVariant {
  name: string;
  cost: number;
  salePrice: number;
}
export type UnitType = "un" | "m" | "m²" | "kg" | "g" | "cm" | "mm";

export interface InventoryItem {
  id: string;
  name: string;
  unit: UnitType;
  quantity?: number;
  minStock?: number;
  usageCategory?: string;
  colorVariants?: ColorVariant[];
  stockQuantity?: number;
  standardSize?: string;
  purchaseLengthMeters?: number;
  jateadoPrice?: number;
}

// ---------------------------------------------
// Produtos
// ---------------------------------------------
export type CalculationRule =
  | "perimeter"
  | "height_multiplier"
  | "width_multiplier"
  | "area_multiplier"
  | "fill"
  | "fixed_quantity";

export type ProductCompositionAxis = "height" | "width" | "accessory" | "area";
export type ProductCompositionAdjustmentMode = "none" | "add" | "subtract";
export type ProductCompositionQuantityMode = "normal" | "made_to_measure";

export interface ProductCompositionMeasureFormula {
  target: ProductCompositionAxis;
  intervalMm: number;
  // Percentual do vão (0-100) que esta peça ocupa antes de dividir pelo
  // intervalMm. Usado para portões com 2 lambris de tamanhos diferentes,
  // onde cada um cobre uma fração da altura total.
  spanPercent?: number;
}

export interface ProductCompositionItem {
  id: string;
  materialId: string;
  rule: CalculationRule;
  multiplier?: number;
  quantity?: number;
  factor?: number;
  lambrilWidthCm?: number;
  variantName?: string; // 🔘 cor da variação do material
  applyOn?: ProductCompositionAxis;
  adjustmentType?: ProductCompositionAdjustmentMode;
  adjustmentMm?: number;
  divideBy?: number;
  multiplyBy?: number;
  quantityMode?: ProductCompositionQuantityMode;
  measureFormula?: ProductCompositionMeasureFormula;
}

export interface Product {
  id: string;
  name: string;
  desiredProfitMargin: number;
  marginByColor?: Record<string, number>;
  minProfitValue?: number;
  fixedSalePrice?: number;
  fixedSalePriceByColor?: Record<string, number>;
  pricePerSqmByColor?: Record<string, number>;
  composition: ProductCompositionItem[];
  category?: string;
  productCategory?: string;
  productType?: string;
  productSubCategory1?: string;
  productSubCategory2?: string;
  productSubCategory3?: string;
  image?: string;
  laborCost?: number;
  productionHours?: number;
  assemblyHours?: number;
  hourlyRate?: number;
  // Mão de obra detalhada
  professionalCount?: number;
  professionalHours?: number;
  professionalRate?: number;
  helperCount?: number;
  helperHours?: number;
  helperRate?: number;
  // Mão de obra — instalação
  instProfCount?: number;
  instProfInstHours?: number;
  instProfRate?: number;
  instHelpCount?: number;
  instHelpInstHours?: number;
  instHelpRate?: number;
  laborSector?: string;
  fixedCostRate?: number;
  quantityReference?: number;
  selectedCategoryColor?: string;
  referenceWidthMm?: number;
  referenceHeightMm?: number;
  widthIncrement?: number;
  heightIncrement?: number;
}

// ---------------------------------------------
// Clientes
// ---------------------------------------------
export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;

  // ✅ Observação do cliente
  notes?: string;

  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    referencePoint?: string;
  };
}

// ---------------------------------------------
// Despesas Variáveis
// ---------------------------------------------
export interface VariableExpense {
  id: string;
  name: string;
  type: "percent" | "fixed";
  value: number;
}


export interface FixedExpense {
  id: string;
  name: string;
  value: number;
}

export interface FinancialRecord {
  month: string;
  income: number;
  expenses: number;
}

export type UsageCategory = "Chapa/Placa" | "Linear" | "Componente" | "Peso" | "Serviço";
export type UnitOfMeasure = UnitType;

// ---------------------------------------------
// Itens do Orçamento
// ---------------------------------------------
export interface QuoteItemMaterialLine {
  name: string;
  color: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface QuoteItemLaborLine {
  role: string;
  count: number;
  hours: number;
  rate: number;
  total: number;
}

export interface QuoteInstallationCostLine {
  id: string;
  name: string;
  value: number;
}

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  selectedColor: string;
  description: string;
  width: number;
  height: number;
  quantity: number;
  price: number;
  cost: number;
  materialCost?: number;
  laborCost?: number;
  fixedCostValue?: number;
  materialBreakdown?: QuoteItemMaterialLine[];
  laborBreakdown?: QuoteItemLaborLine[];
}
// ---------------------------------------------
// Orçamentos
// ---------------------------------------------
export type QuoteInternalStatus =
  | "Pedido"
  | "Na Produção"
  | "Aguardando Material"
  | "Falta Entregar"
  | "Entregue";

export interface Quote {
  id: string;
  clientId: string;
  quoteNumber?: number;

  customerName: string;
  salesperson: string;
  date: string;
  deliveryDate?: string;
  status: "Pendente" | "Aprovado" | "Recusado";
  internalStatus?: QuoteInternalStatus;

  items: QuoteItem[];

  subtotal: number;
  discount: number;
  freight: number;
  installation: number;
  installationCostItems?: QuoteInstallationCostLine[];
  totalPrice: number;

  paymentMethod: "A Definir" | "PIX" | "Cartão" | "Dinheiro" | "Transferência" | "Boleto";

  costOfGoods: number;
  fixedCosts: number;
  machineFee: number;
  taxes: number;

  measurementNotes: string;
  assemblyNotes: string;

  referralCommissionRate?: number;
  referralCommissionValue?: number;
}


// ---------------------------------------------
// Configurações da Empresa
// ---------------------------------------------
export interface CompanySettings {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
}

// ---------------------------------------------
// Fluxo de Caixa
// ---------------------------------------------
export interface CashFlowEntry {
  id: string;
  type: "Entrada" | "Saída";
  amount: number;
  category: string;
  subcategory?: string;
  description: string;
  date: string;
  createdAt?: string;
}

// ---------------------------------------------
// Vendas (Ligadas a Orçamentos)
// ---------------------------------------------
export interface Sale {
  id: string; // UUID gerado pelo Supabase
  quoteId: string; // referência ao orçamento aprovado
  customerName: string;
  salesperson: string;
  saleDate: Date;
  amount: number; // total do orçamento
  status: "Aprovado" | "Concluído" | "Pendente" | "Cancelado";
}
// ---------------------------------------------
// Contas a Receber (geradas automaticamente ao aprovar um orçamento)
// ---------------------------------------------
export interface Receivable {
  id: string;
  quoteId: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  dueDate: string;
  status: "pending" | "received";
  receivedAt?: string;
  receivedBy?: string;
  createdAt?: string;
}

export type Message = {
  id: number;
  text: string;
  sender: "bot" | "user";
  isTyping?: boolean;
};

// ---------------------------------------------
// Contas a Pagar
// ---------------------------------------------
export interface PayableInstallment {
  id: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  paidDate?: string;
}

export interface Payable {
  id: string;
  name: string;
  amount: number;
  supplier: string;
  payableCategory: string;
  productCategory: string;
  dueDate: string;
  installments: PayableInstallment[];
  notes: string;
  status: "pending" | "partial" | "paid";
  createdAt?: string;
}

// ---------------------------------------------
// Agenda
// ---------------------------------------------
export type AgendaSegment = "Vidro/Esquadria" | "Mármore/Granito" | "Portão";

export type AgendaServiceType =
  | "Medição"
  | "Instalação"
  | "Entrega"
  | "Orçamento"
  | "Visita"
  | "Manutenção";

export type AgendaStatus = "Pendente" | "Confirmado" | "Concluído" | "Cancelado";

export interface Agendamento {
  id: string;
  clientName: string;
  clientId?: string;
  phone?: string;
  sellerName: string;
  segment: AgendaSegment;
  serviceType?: AgendaServiceType;
  description: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  address?: string;
  status: AgendaStatus;
  createdAt?: string;
}

