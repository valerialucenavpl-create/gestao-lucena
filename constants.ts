import { InventoryItem, Quote, Sale, FinancialRecord, CashFlowEntry, User, Client, QuoteItem, FixedExpense, VariableExpense, Product, UsageCategory, UnitOfMeasure, ProductCompositionItem, CompanySettings } from './types';

export const USAGE_CATEGORIES: UsageCategory[] = ['Chapa/Placa', 'Linear', 'Componente', 'Peso', 'Serviço'];
export const UNITS_OF_MEASURE: UnitOfMeasure[] = ['m²', 'm', 'un', 'kg', 'g', 'cm', 'mm'];

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    name: 'SUA EMPRESA',
    legalName: 'Razão Social LTDA',
    cnpj: '',
    email: '',
    phone: '',
    address: '',
    logo: ''
};

export const RAW_MATERIALS_DATA: InventoryItem[] = [
  // Materials kept for Calculator Logic functionality (NewQuote), but with 0 stock.
  { id: 'm02', name: 'Granito Preto São Gabriel', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [{ name: 'Preto Absoluto', cost: 0, salePrice: 0 }], stockQuantity: 0, standardSize: '3.2m x 1.8m' },
  { id: 'm01', name: 'Mármore Carrara', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [{ name: 'Branco Rajado', cost: 0, salePrice: 0 }], stockQuantity: 0, standardSize: '3.0m x 1.6m' },
  { id: 'g01', name: 'Vidro Temperado 8mm', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [ { name: 'Incolor', cost: 0, salePrice: 0 }, { name: 'Fumê', cost: 0, salePrice: 0 }, { name: 'Verde', cost: 0, salePrice: 0 }, ], stockQuantity: 0 },
  { id: 'g02', name: 'Vidro Temperado 10mm', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [ { name: 'Incolor', cost: 0, salePrice: 0 }, { name: 'Fumê', cost: 0, salePrice: 0 } ], stockQuantity: 0 },

  // Services
  { id: 'srv01', name: 'Frete Caminhão', usageCategory: 'Serviço', unit: 'm²', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 999 },
  { id: 'srv02', name: 'ISMC Frete', usageCategory: 'Serviço', unit: 'm²', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 999 },
  
  // Inputs
  { id: 'ins01', name: 'Massa Plástica', usageCategory: 'Peso', unit: 'kg', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins02', name: 'Disco Porcelanato', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins03', name: 'Cera Carnauba', usageCategory: 'Peso', unit: 'g', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins04', name: 'Palha de Aço', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins05', name: 'Disco 120', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins06', name: 'Lixa Manual', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'ins07', name: 'Maçarico Portátil', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  
  // Profiles
  { id: 'met02', name: 'Perfil de Alumínio Lambril (LB 030)', usageCategory: 'Linear', unit: 'm', colorVariants: [ { name: 'Branco', cost: 0, salePrice: 0 }, { name: 'Preto', cost: 0, salePrice: 0 }, { name: 'Bronze', cost: 0, salePrice: 0 }, { name: 'Inox', cost: 0, salePrice: 0 }, { name: 'Madeirado', cost: 0, salePrice: 0 }, ], stockQuantity: 0, standardSize: 'Barra de 6m' },
  { id: 'met03', name: 'Dobradiça Inox', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Inox', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'met05', name: 'Perfil Contorno (PC)', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 0, salePrice: 0 }, { name: 'Preto', cost: 0, salePrice: 0 }], stockQuantity: 0, standardSize: 'Barra de 6m' },
  { id: 'met06', name: 'Travessa (TG 004)', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 0, salePrice: 0 }, { name: 'Preto', cost: 0, salePrice: 0 }], stockQuantity: 0, standardSize: 'Barra de 6m' },
  { id: 'met07', name: 'PU 639', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 0, salePrice: 0 }], stockQuantity: 0, standardSize: 'Barra de 6m' },
  { id: 'met08', name: 'Fechadura para Portão', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },

  // Accessories
  { id: 'acc_h01', name: 'Puxador Arco 1 Furo', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'acc_h02', name: 'Puxador H 400mm', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'acc_h03', name: 'Puxador H 600mm', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
  { id: 'kit_piv', name: 'Kit Porta Pivotante', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0, salePrice: 0 }], stockQuantity: 0 },
];

// Keeping logic structure for calculators, but they rely on the IDs above.
const gateComposition: ProductCompositionItem[] = [
    { id: 'c1', materialId: 'met05', rule: 'perimeter' }, 
    { id: 'c2', materialId: 'met06', rule: 'height_multiplier', multiplier: 4 }, 
    { id: 'c3', materialId: 'met02', rule: 'fill', factor: 120 }, 
    { id: 'c4', materialId: 'met07', rule: 'width_multiplier', multiplier: 2 }, 
    { id: 'c5', materialId: 'met08', rule: 'fixed_quantity', quantity: 1 }, 
    { id: 'c6', materialId: 'met03', rule: 'fixed_quantity', quantity: 3 }, 
]

const marbleSinkComposition: ProductCompositionItem[] = [
    { id: 'cmp1', materialId: 'm02', rule: 'fill' }, 
    { id: 'cmp2', materialId: 'srv01', rule: 'fill' }, 
    { id: 'cmp3', materialId: 'srv02', rule: 'fill' }, 
    { id: 'cmp4', materialId: 'ins01', rule: 'area_multiplier', multiplier: 1 }, 
    { id: 'cmp5', materialId: 'ins02', rule: 'area_multiplier', multiplier: 0.5 }, 
    { id: 'cmp6', materialId: 'ins03', rule: 'area_multiplier', multiplier: 0.25 }, 
    { id: 'cmp7', materialId: 'ins04', rule: 'area_multiplier', multiplier: 0.5 }, 
    { id: 'cmp8', materialId: 'ins05', rule: 'area_multiplier', multiplier: 2 }, 
    { id: 'cmp9', materialId: 'ins06', rule: 'area_multiplier', multiplier: 0.25 }, 
    { id: 'cmp10', materialId: 'ins07', rule: 'area_multiplier', multiplier: 0.5 }, 
];

export const PRODUCTS_DATA: Product[] = [
    // Template products kept for demonstration of logic
    { id: 'prod01', name: 'Portão de Alumínio Lambril (Modelo)', category: 'Portões', composition: gateComposition, desiredProfitMargin: 20 },
    { id: 'p01', name: 'Pia de Cozinha Granito (Modelo)', category: 'Pias', composition: marbleSinkComposition, desiredProfitMargin: 30 },
    { id: 'p02', name: 'Box de Vidro Padrão (Modelo)', category: 'Boxes', composition: [{id: 'c-box', materialId: 'g01', rule: 'fill'}], desiredProfitMargin: 25 },
];

export const GLASS_PRODUCTS = [
    { id: 'gp01', name: 'Porta 2 Folhas Pivotante com Bandeira Fixa', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' },
    { id: 'gp02', name: 'Porta 2 Folhas Pivotante com Fixo Lateral Vidro/Vidro', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' }, 
    { id: 'gp03', name: 'Porta 2 Folhas Pivotante com Fixos Laterais', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' },
];

export const GLASS_TYPES = [
    { id: 'g8', name: 'Vidro 8mm Temperado', cost: 0 },
    { id: 'g10', name: 'Vidro 10mm Temperado', cost: 0 },
];

export const GLASS_COLORS = [
    { id: 'incolor', name: 'Incolor', hex: '#eef2f3', priceMod: 1 },
    { id: 'verde', name: 'Verde', hex: '#4ade80', priceMod: 1.1 },
    { id: 'fume', name: 'Fumê', hex: '#4b5563', priceMod: 1.15 },
    { id: 'preto_sg', name: 'Preto São Gabriel', hex: '#000000', priceMod: 1.5 }, 
    { id: 'bronze', name: 'Bronze', hex: '#d97706', priceMod: 1.2 },
];

export const PROFILE_COLORS = [
    { id: 'branco', name: 'Branco', hex: '#ffffff' },
    { id: 'preto', name: 'Preto', hex: '#000000' },
    { id: 'bronze', name: 'Bronze', hex: '#d97706' },
    { id: 'inox', name: 'Inox', hex: '#94a3b8' },
    { id: 'madeira', name: 'Amadeirado', hex: '#78350f' },
];

export const HARDWARE_COLORS = [
    { id: 'branco', name: 'Branco', hex: '#ffffff' },
    { id: 'preto', name: 'Preto', hex: '#000000' },
    { id: 'cromado', name: 'Cromado', hex: '#e2e8f0' },
    { id: 'bronze', name: 'Bronze', hex: '#d97706' },
];

export const HANDLES = [
    { id: 'h01', name: 'Puxador Arco de um Furo', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 0 },
    { id: 'h02', name: 'Puxador H 400 e 300 entre furos', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 0 },
    { id: 'h03', name: 'Puxador H 600 e 500 entre furos', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 0 },
];

// -----------------------------

export const USERS_DATA: User[] = [
    { id: 'u01', name: 'Admin', role: 'Admin', avatar: 'https://api.dicebear.com/8.x/initials/svg?seed=Admin', email: 'admin@admin.com', password: 'admin' },
];

export const CLIENTS_DATA: Client[] = [];

export const QUOTES_DATA: Quote[] = [];

export const SALES_DATA: Sale[] = [];

export const FINANCIAL_DATA: FinancialRecord[] = [
    { month: 'Set', income: 0, expenses: 0 },
    { month: 'Out', income: 0, expenses: 0 },
    { month: 'Nov', income: 0, expenses: 0 },
    { month: 'Dez', income: 0, expenses: 0 },
    { month: 'Jan', income: 0, expenses: 0 },
    { month: 'Fev', income: 0, expenses: 0 },
];

export const FIXED_EXPENSES_DATA: FixedExpense[] = [];

export const VARIABLE_EXPENSES_DATA: VariableExpense[] = [
    { id: 've01', name: 'Taxa Maquininha Cartão', type: 'percent', value: 0 },
    { id: 've02', name: 'Comissão Vendedora', type: 'percent', value: 0 },
    { id: 've03', name: 'Imposto Simples Nacional', type: 'percent', value: 0 },
];

export const CASH_FLOW_CATEGORIES = {
  income: {
    'Receitas Operacionais': ['Venda no PIX', 'Venda no Cartão', 'Venda no Dinheiro', 'Outras Receitas'],
  },
  expense: {
    'Custos Fixos': ['Aluguel', 'Salários', 'Contas (Luz, Água, Internet)', 'Impostos'],
    'Custos Variáveis': ['Compra de Matéria Prima', 'Manutenção de Equipamentos', 'Marketing', 'Frete'],
    'Outras Despesas': ['Despesas Administrativas'],
  },
};

export const CASH_FLOW_DATA: CashFlowEntry[] = [];

export const DAILY_QUOTES = [
    { text: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.", author: "Provérbios 16:3" },
    { text: "O sucesso é a soma de pequenos esforços repetidos dia após dia.", author: "Robert Collier" },
    { text: "Tudo o que fizerem, façam de todo o coração, como para o Senhor, e não para os homens.", author: "Colossenses 3:23" },
    { text: "A única maneira de fazer um excelente trabalho é amar o que você faz.", author: "Steve Jobs" },
    { text: "Seja forte e corajoso! Não se apavore nem desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.", author: "Josué 1:9" },
    { text: "Qualidade significa fazer certo quando ninguém está olhando.", author: "Henry Ford" },
    { text: "Pois comerás do trabalho das tuas mãos; feliz serás, e te irá bem.", author: "Salmos 128:2" },
    { text: "Não espere por oportunidades extraordinárias. Agarre ocasiões comuns e faça-as grandes.", author: "Orison Swett Marden" },
    { text: "Toda a obra do homem é para a sua boca; contudo, o seu apetite nunca se satisfaz.", author: "Eclesiastes 6:7" },
    { text: "A inovaçao distingue um lider de um seguidor.", author: "Steve Jobs" },
];