export type View = 'dashboard' | 'quotes' | 'newQuote' | 'quoteDetail' | 'sales' | 'inventory' | 'products' | 'financials' | 'assistant' | 'reports' | 'cashflow' | 'clients' | 'settings' | 'accessDenied';

export type UserRole = 'Admin' | 'Finance' | 'Sales';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
  email?: string;     // New field for login
  password?: string;  // New field for login
  monthlyGoal?: number; 
}

export interface CompanySettings {
    name: string;
    legalName: string;
    cnpj: string;
    email: string;
    phone: string;
    address: string;
    logo?: string;
}

export type UnitOfMeasure = 'un' | 'm' | 'm²' | 'g' | 'kg' | 'cm' | 'mm';
export type UsageCategory = 'Linear' | 'Chapa/Placa' | 'Componente' | 'Peso' | 'Serviço';

export interface ColorVariant {
    name: string;
    cost: number;
    salePrice: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  usageCategory: UsageCategory;
  unit: UnitOfMeasure;
  colorVariants: ColorVariant[];
  stockQuantity: number;
  standardSize?: string;
  image?: string; 
}

export type CalculationRule = 'perimeter' | 'height_multiplier' | 'width_multiplier' | 'fill' | 'fixed_quantity' | 'area_multiplier';

export interface ProductCompositionItem {
    id: string;
    materialId: string;
    rule: CalculationRule;
    multiplier?: number;
    factor?: number;
    quantity?: number;
}


export interface Product {
    id: string;
    name: string;
    category: string;
    image?: string; 
    composition: ProductCompositionItem[];
    laborCost?: number; 
    desiredProfitMargin: number;
}


export interface Client {
    id: string;
    name: string;
    phone?: string;
    birthDate?: string;
    address: {
        cep?: string;
        street?: string;
        number?: string;
        complement?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        referencePoint?: string;
    }
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
}


export interface Quote {
  id: string;
  clientId: string;
  customerName: string; 
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  freight?: number; 
  installation?: number; 
  totalPrice: number;
  paymentMethod: 'PIX' | 'Cartão' | 'Dinheiro' | 'A Definir';
  assemblyNotes: string;
  measurementNotes: string;
  date: Date;
  status: 'Pendente' | 'Aprovado' | 'Recusado';
  salesperson: string;
  costOfGoods: number;
  fixedCosts?: number;
  machineFee?: number;
  taxes?: number;
}

export interface Sale {
  id: string;
  quoteId: string;
  customerName: string;
  amount: number;
  saleDate: Date;
  salesperson: string;
  costOfGoods: number;
}

export interface FinancialRecord {
    month: string;
    income: number;
    expenses: number;
}

export interface CashFlowEntry {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  subcategory: string;
}

export interface FixedExpense {
    id: string;
    name: string;
    date: Date;
    amount: number;
    category: 'Funcionários' | 'Estrutura' | 'Impostos' | 'Outros';
}

export interface VariableExpense {
    id: string;
    name: string;
    type: 'percent' | 'fixed';
    value: number;
}

export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  isTyping?: boolean;
}