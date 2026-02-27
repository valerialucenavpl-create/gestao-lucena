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
}

// ---------------------------------------------
// Materiais / Estoque
// ---------------------------------------------
export interface ColorVariant {
  name: string;
  cost: number;
  salePrice: number;
}
export type UnitType = "un" | "m" | "m²";

export interface InventoryItem {
  id: string;
  name: string;
  unit: UnitType;
  quantity: number;
  minStock: number;
  usageCategory?: string;
  colorVariants?: ColorVariant[];
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

export interface ProductCompositionItem {
  id: string;
  materialId: string;
  rule: CalculationRule;
  multiplier?: number;
  quantity?: number;
  factor?: number;
  variantName?: string; // 🔘 cor da variação do material
}

export interface Product {
  id: string;
  name: string;
  desiredProfitMargin: number;
  composition: ProductCompositionItem[];
  category?: string;
  laborCost?: number;
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
}
// ---------------------------------------------
// Orçamentos
// ---------------------------------------------
export interface Quote {
  id: string;
  clientId: string;

  customerName: string;
  salesperson: string;
  date: string | Date;
  status: "Pendente" | "Aprovado" | "Recusado";

  items: QuoteItem[];

  subtotal: number;
  discount: number;
  freight: number;
  installation: number;
  totalPrice: number;

  paymentMethod: "A Definir" | "PIX" | "Cartão" | "Dinheiro";

  costOfGoods: number;
  fixedCosts: number;
  machineFee: number;
  taxes: number;

  measurementNotes: string;
  assemblyNotes: string;

  // ✅ SUA COMISSÃO DE INDICAÇÃO
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

