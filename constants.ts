
import { InventoryItem, Quote, Sale, FinancialRecord, CashFlowEntry, User, Client, QuoteItem, FixedExpense, VariableExpense, Product, UsageCategory, UnitOfMeasure, ProductCompositionItem, CompanySettings } from './types';

export const USAGE_CATEGORIES: UsageCategory[] = ['Chapa/Placa', 'Linear', 'Componente', 'Peso', 'Serviço'];
export const UNITS_OF_MEASURE: UnitOfMeasure[] = ['m²', 'm', 'un', 'kg', 'g', 'cm', 'mm'];

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    name: 'SUA EMPRESA',
    legalName: 'Razão Social LTDA',
    cnpj: '00.000.000/0001-00',
    email: 'contato@empresa.com',
    phone: '(99) 99999-9999',
    address: 'Rua Exemplo, 123, Centro, Cidade - UF',
    logo: ''
};

export const RAW_MATERIALS_DATA: InventoryItem[] = [
  // Original Items
  { id: 'm02', name: 'Granito Preto São Gabriel', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [{ name: 'Preto Absoluto', cost: 175.00, salePrice: 450 }], stockQuantity: 120, standardSize: '3.2m x 1.8m', image: 'https://images.unsplash.com/photo-1616048496713-b795e28e649c?auto=format&fit=crop&q=80&w=150&h=150' },
  { id: 'm01', name: 'Mármore Carrara', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [{ name: 'Branco Rajado', cost: 550, salePrice: 850 }], stockQuantity: 50, standardSize: '3.0m x 1.6m', image: 'https://images.unsplash.com/photo-1618221392185-682cb9431c7f?auto=format&fit=crop&q=80&w=150&h=150' },
  { id: 'g01', name: 'Vidro Temperado 8mm', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [ { name: 'Incolor', cost: 150, salePrice: 250 }, { name: 'Fumê', cost: 170, salePrice: 280 }, { name: 'Verde', cost: 165, salePrice: 275 }, ], stockQuantity: 200, image: 'https://images.unsplash.com/photo-1558432190-1c0994b35e21?auto=format&fit=crop&q=80&w=150&h=150' },
  { id: 'g02', name: 'Vidro Temperado 10mm', usageCategory: 'Chapa/Placa', unit: 'm²', colorVariants: [ { name: 'Incolor', cost: 200, salePrice: 350 }, { name: 'Fumê', cost: 230, salePrice: 380 } ], stockQuantity: 150 },

  // Excel Items - Services & Costs per m2
  { id: 'srv01', name: 'Frete Caminhão', usageCategory: 'Serviço', unit: 'm²', colorVariants: [{ name: 'Padrão', cost: 45.00, salePrice: 45.00 }], stockQuantity: 999 },
  { id: 'srv02', name: 'ISMC Frete', usageCategory: 'Serviço', unit: 'm²', colorVariants: [{ name: 'Padrão', cost: 3.50, salePrice: 3.50 }], stockQuantity: 999 },
  
  // Excel Items - Production Inputs (Insumos)
  { id: 'ins01', name: 'Massa Plástica', usageCategory: 'Peso', unit: 'kg', colorVariants: [{ name: 'Padrão', cost: 7.90, salePrice: 15.00 }], stockQuantity: 50 },
  { id: 'ins02', name: 'Disco Porcelanato', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 33.00, salePrice: 33.00 }], stockQuantity: 20 },
  { id: 'ins03', name: 'Cera Carnauba', usageCategory: 'Peso', unit: 'g', colorVariants: [{ name: 'Padrão', cost: 0.04, salePrice: 0.10 }], stockQuantity: 1000 },
  { id: 'ins04', name: 'Palha de Aço', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 1.65, salePrice: 3.00 }], stockQuantity: 100 },
  { id: 'ins05', name: 'Disco 120', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 0.90, salePrice: 2.00 }], stockQuantity: 200 },
  { id: 'ins06', name: 'Lixa Manual', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 1.01, salePrice: 2.00 }], stockQuantity: 150 },
  { id: 'ins07', name: 'Maçarico Portátil', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 2.50, salePrice: 5.00 }], stockQuantity: 10 },
  
  // Profiles (Original)
  { id: 'met02', name: 'Perfil de Alumínio Lambril (LB 030)', usageCategory: 'Linear', unit: 'm', colorVariants: [ { name: 'Branco', cost: 25, salePrice: 55 }, { name: 'Preto', cost: 30, salePrice: 65 }, { name: 'Bronze', cost: 35, salePrice: 75 }, { name: 'Inox', cost: 40, salePrice: 85 }, { name: 'Madeirado', cost: 55, salePrice: 110 }, ], stockQuantity: 300, standardSize: 'Barra de 6m', image: 'https://images.unsplash.com/photo-1585826090351-56c6d1a20c2f?auto=format&fit=crop&q=80&w=150&h=150' },
  { id: 'met03', name: 'Dobradiça Inox', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Inox', cost: 12, salePrice: 25 }], stockQuantity: 500 },
  { id: 'met05', name: 'Perfil Contorno (PC)', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 28, salePrice: 60 }, { name: 'Preto', cost: 33, salePrice: 70 }], stockQuantity: 150, standardSize: 'Barra de 6m' },
  { id: 'met06', name: 'Travessa (TG 004)', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 22, salePrice: 50 }, { name: 'Preto', cost: 27, salePrice: 60 }], stockQuantity: 200, standardSize: 'Barra de 6m' },
  { id: 'met07', name: 'PU 639', usageCategory: 'Linear', unit: 'm', colorVariants: [{ name: 'Branco', cost: 18, salePrice: 40 }], stockQuantity: 100, standardSize: 'Barra de 6m' },
  { id: 'met08', name: 'Fechadura para Portão', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 45, salePrice: 90 }], stockQuantity: 80 },

  // Accessories for Glass Wizard
  { id: 'acc_h01', name: 'Puxador Arco 1 Furo', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 25, salePrice: 50 }], stockQuantity: 50 },
  { id: 'acc_h02', name: 'Puxador H 400mm', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 40, salePrice: 80 }], stockQuantity: 50 },
  { id: 'acc_h03', name: 'Puxador H 600mm', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 60, salePrice: 120 }], stockQuantity: 50 },
  { id: 'kit_piv', name: 'Kit Porta Pivotante', usageCategory: 'Componente', unit: 'un', colorVariants: [{ name: 'Padrão', cost: 150, salePrice: 300 }], stockQuantity: 30 },
];

const gateComposition: ProductCompositionItem[] = [
    { id: 'c1', materialId: 'met05', rule: 'perimeter' }, // PC
    { id: 'c2', materialId: 'met06', rule: 'height_multiplier', multiplier: 4 }, // TG 004
    { id: 'c3', materialId: 'met02', rule: 'fill', factor: 120 }, // Lambril (12cm = 120mm)
    { id: 'c4', materialId: 'met07', rule: 'width_multiplier', multiplier: 2 }, // PU 639
    { id: 'c5', materialId: 'met08', rule: 'fixed_quantity', quantity: 1 }, // Fechadura
    { id: 'c6', materialId: 'met03', rule: 'fixed_quantity', quantity: 3 }, // Dobradiças
]

// Composition based on the User's Excel Screenshot
const marbleSinkComposition: ProductCompositionItem[] = [
    { id: 'cmp1', materialId: 'm02', rule: 'fill' }, // Marmore (1m2)
    { id: 'cmp2', materialId: 'srv01', rule: 'fill' }, // Frete (1m2)
    { id: 'cmp3', materialId: 'srv02', rule: 'fill' }, // ISMC (1m2)
    { id: 'cmp4', materialId: 'ins01', rule: 'area_multiplier', multiplier: 1 }, // Massa (1kg per m2)
    { id: 'cmp5', materialId: 'ins02', rule: 'area_multiplier', multiplier: 0.5 }, // Disco Porcelanato (0.5 per m2)
    { id: 'cmp6', materialId: 'ins03', rule: 'area_multiplier', multiplier: 0.25 }, // Cera (0.25 per m2 - assumed unit fix)
    { id: 'cmp7', materialId: 'ins04', rule: 'area_multiplier', multiplier: 0.5 }, // Palha de Aço (0.5 per m2)
    { id: 'cmp8', materialId: 'ins05', rule: 'area_multiplier', multiplier: 2 }, // Disco 120 (2 per m2)
    { id: 'cmp9', materialId: 'ins06', rule: 'area_multiplier', multiplier: 0.25 }, // Lixa Manual (0.25 per m2)
    { id: 'cmp10', materialId: 'ins07', rule: 'area_multiplier', multiplier: 0.5 }, // Maçarico (0.5 per m2)
];


export const PRODUCTS_DATA: Product[] = [
    { id: 'prod01', name: 'Portão de Alumínio Lambril', category: 'Portões', composition: gateComposition, desiredProfitMargin: 15, image: 'https://images.unsplash.com/photo-1617103996702-96ff29b1c467?auto=format&fit=crop&q=80&w=150&h=150' },
    { id: 'p01', name: 'Pia de Cozinha Granito Preto São Gabriel', category: 'Pias', composition: marbleSinkComposition, desiredProfitMargin: 40, image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=150&h=150' },
    { id: 'p02', name: 'Box de Vidro Temperado Padrão', category: 'Boxes', composition: [{id: 'c-box', materialId: 'g01', rule: 'fill'}], desiredProfitMargin: 35, image: 'https://images.unsplash.com/photo-1595315849835-441772870a57?auto=format&fit=crop&q=80&w=150&h=150' },
];

// --- Data for Glass Wizard ---
export const GLASS_PRODUCTS = [
    { id: 'gp01', name: 'Porta 2 Folhas Pivotante com Bandeira Fixa', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' },
    { id: 'gp02', name: 'Porta 2 Folhas Pivotante com Fixo Lateral Vidro/Vidro', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' }, // Placeholder icon
    { id: 'gp03', name: 'Porta 2 Folhas Pivotante com Fixos Laterais', image: 'https://cdn-icons-png.flaticon.com/512/69/69744.png' },
];

export const GLASS_TYPES = [
    { id: 'g8', name: 'Vidro 8mm Temperado', cost: 150 },
    { id: 'g10', name: 'Vidro 10mm Temperado', cost: 200 },
];

export const GLASS_COLORS = [
    { id: 'incolor', name: 'Incolor', hex: '#eef2f3', priceMod: 1 },
    { id: 'verde', name: 'Verde', hex: '#4ade80', priceMod: 1.1 },
    { id: 'fume', name: 'Fumê', hex: '#4b5563', priceMod: 1.15 },
    { id: 'preto_sg', name: 'Preto São Gabriel', hex: '#000000', priceMod: 1.5 }, // Simulated as glass color for UI
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
    { id: 'h01', name: 'Puxador Arco de um Furo', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 25 },
    { id: 'h02', name: 'Puxador H 400 e 300 entre furos', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 40 },
    { id: 'h03', name: 'Puxador H 600 e 500 entre furos', image: 'https://cdn-icons-png.flaticon.com/512/154/154262.png', cost: 60 },
];

// -----------------------------

export const USERS_DATA: User[] = [
    { id: 'u01', name: 'Admin', role: 'Admin', avatar: 'https://api.dicebear.com/8.x/initials/svg?seed=Admin' },
    { id: 'u02', name: 'Maria (Financeiro)', role: 'Finance', avatar: 'https://api.dicebear.com/8.x/initials/svg?seed=Maria' },
    { id: 'u03', name: 'Ana (Vendas)', role: 'Sales', avatar: 'https://api.dicebear.com/8.x/initials/svg?seed=Ana', monthlyGoal: 50000 },
    { id: 'u04', name: 'Julia (Vendas)', role: 'Sales', avatar: 'https://api.dicebear.com/8.x/initials/svg?seed=Julia', monthlyGoal: 45000 },
];

export const CLIENTS_DATA: Client[] = [
    { id: 'c01', name: 'Construtora Alfa', phone: '11987654321', address: { city: 'São Paulo', state: 'SP'}},
    { id: 'c02', name: 'Mariana Silva', phone: '21912345678', address: { city: 'Rio de Janeiro', state: 'RJ'}},
    { id: 'c03', name: 'Escritório de Arquitetura Moderno', phone: '3199998888', address: { city: 'Belo Horizonte', state: 'MG'}},
];

const quote1Items: QuoteItem[] = [
    { id: 'qi01', productId: 'p01', productName: 'Pia de Cozinha Granito Preto São Gabriel', selectedColor: 'Preto Absoluto', description: '', width: 2000, height: 800, quantity: 1, price: 900, cost: 400 },
];
const quote1Subtotal = quote1Items.reduce((acc, item) => acc + item.price, 0);


export const QUOTES_DATA: Quote[] = [
    { 
        id: 'q001', 
        clientId: 'c01',
        customerName: 'Construtora Alfa',
        items: quote1Items,
        subtotal: quote1Subtotal,
        discount: 0,
        totalPrice: quote1Subtotal,
        paymentMethod: 'Cartão',
        assemblyNotes: 'Instalar com cuba embutida.',
        measurementNotes: 'Confirmar medidas no local.',
        date: new Date('2023-10-15'), 
        status: 'Aprovado', 
        salesperson: 'Ana (Vendas)', 
        costOfGoods: 400,
        fixedCosts: 100,
        machineFee: 50.5,
        taxes: 120.2
    },
    { 
        id: 'q002', 
        clientId: 'c02',
        customerName: 'Mariana Silva',
        items: [
            { id: 'qi03', productId: 'p02', productName: 'Box de Vidro Temperado Padrão', selectedColor: 'Incolor', description: '', width: 1200, height: 1900, quantity: 1, price: 570, cost: 342 }
        ],
        subtotal: 570,
        discount: 20,
        totalPrice: 550,
        paymentMethod: 'PIX',
        assemblyNotes: '',
        measurementNotes: 'Medida exata do vão é 1180mm',
        date: new Date('2023-10-20'), 
        status: 'Pendente', 
        salesperson: 'Ana (Vendas)', 
        costOfGoods: 342,
    },
];

// Sales data needs to reflect sales for Julia as well to show progress
const currentDate = new Date();
export const SALES_DATA: Sale[] = [
    { id: 's001', quoteId: 'q001', customerName: 'Construtora Alfa', amount: 900, saleDate: new Date('2023-10-18'), salesperson: 'Ana (Vendas)', costOfGoods: 400 },
    // Recent sales for goals demo (using current date month)
    { id: 's002', quoteId: 'q003', customerName: 'Cliente Exemplo A', amount: 15000, saleDate: currentDate, salesperson: 'Ana (Vendas)', costOfGoods: 8000 },
    { id: 's003', quoteId: 'q004', customerName: 'Cliente Exemplo B', amount: 12500, saleDate: currentDate, salesperson: 'Julia (Vendas)', costOfGoods: 6000 },
    { id: 's004', quoteId: 'q005', customerName: 'Cliente Exemplo C', amount: 8000, saleDate: currentDate, salesperson: 'Julia (Vendas)', costOfGoods: 4000 },
];

export const FINANCIAL_DATA: FinancialRecord[] = [
    { month: 'Set', income: 12000, expenses: 7000 },
    { month: 'Out', income: 15000, expenses: 8000 },
    { month: 'Nov', income: 18000, expenses: 9500 },
    { month: 'Dez', income: 22000, expenses: 11000 },
    { month: 'Jan', income: 20000, expenses: 10500 },
    { month: 'Fev', income: 25000, expenses: 13000 },
];

export const FIXED_EXPENSES_DATA: FixedExpense[] = [
    { id: 'fe01', name: 'Aluguel do Galpão', date: new Date(), amount: 5000, category: 'Estrutura' },
    { id: 'fe02', name: 'Salários Equipe', date: new Date(), amount: 12000, category: 'Funcionários' },
    { id: 'fe03', name: 'Contas (Luz, Água, Internet)', date: new Date(), amount: 1500, category: 'Estrutura' },
];

export const VARIABLE_EXPENSES_DATA: VariableExpense[] = [
    { id: 've01', name: 'Taxa Maquininha Cartão', type: 'percent', value: 4.5 },
    { id: 've02', name: 'Comissão Vendedora', type: 'percent', value: 5 },
    { id: 've03', name: 'Imposto Simples Nacional', type: 'percent', value: 6 },
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

export const CASH_FLOW_DATA: CashFlowEntry[] = [
    { id: 'cf001', date: new Date('2023-11-12'), description: 'Venda para Renovadora de Interiores', amount: 2721.6, type: 'income', category: 'Receitas Operacionais', subcategory: 'Venda no Cartão'},
    { id: 'cf002', date: new Date('2023-11-08'), description: 'Venda para Escritório de Arquitetura', amount: 2500.8, type: 'income', category: 'Receitas Operacionais', subcategory: 'Venda no PIX'},
    { id: 'cf003', date: new Date('2023-11-05'), description: 'Salários', amount: 8000, type: 'expense', category: 'Custos Fixos', subcategory: 'Salários'},
    { id: 'cf004', date: new Date('2023-11-01'), description: 'Aluguel', amount: 5000, type: 'expense', category: 'Custos Fixos', subcategory: 'Aluguel'},
    { id: 'cf005', date: new Date('2023-10-18'), description: 'Venda para Construtora Alfa', amount: 900, type: 'income', category: 'Receitas Operacionais', subcategory: 'Venda no Cartão'},
    { id: 'cf006', date: new Date('2023-10-15'), description: 'Marketing', amount: 1500, type: 'expense', category: 'Custos Variáveis', subcategory: 'Marketing'},
    { id: 'cf007', date: new Date('2023-10-10'), description: 'Compra de chapas de granito', amount: 3500, type: 'expense', category: 'Custos Variáveis', subcategory: 'Compra de Matéria Prima'},
];

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
