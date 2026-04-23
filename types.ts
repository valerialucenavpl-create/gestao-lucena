// ---------------------------------------------
// Views do sistema
// ---------------------------------------------
export type View =
  | "dashboard"
  | "quotes"
  | "sales"
  | "clients"
  | "products"
  | "inventory"
  | "cashflow"
  | "financials"
  | "employees"      // ✅ ADICIONADO
  | "employee-new"   // ✅ ADICIONADO
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
  fixedCostRate?: number;
  absorptionRate?: number;
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
  absorptionCost?: number;
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
  type: "income" | "expense";
  amount: number;
  category: string;
  subcategory?: string;
  description: string;
  date: string;
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
export type Message = {
  id: number;
  text: string;
  sender: "bot" | "user";
  isTyping?: boolean; // ✅ adiciona isso
};

