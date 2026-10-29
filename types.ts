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
  | "sellers"
  | "montagens"
  | "frete"
  | "clientDetail";


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

export type ProductCompositionAxis = "height" | "width" | "accessory" | "area" | "fixed_length";
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
  // Modo M² (applyOn "area"): desconto/acréscimo aplicado a cada dimensão do
  // vão antes de calcular a área — ex.: porta de esquadria com 200mm de
  // desconto na largura e na altura por causa dos perfis, pra não cobrar o
  // vão inteiro.
  areaWidthAdjustmentMm?: number;
  areaHeightAdjustmentMm?: number;
  // Modo Tamanho Fixo (applyOn "fixed_length"): tamanho em mm digitado
  // diretamente, sem depender da altura/largura do vão — ex.: kit pronto
  // de perfil de alumínio (metro linear) vendido num comprimento fixo,
  // tipo acessório de motor de 1200mm.
  fixedLengthMm?: number;
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
  /** Cores das matérias-primas que este produto NÃO tem (vazio = todas). */
  unavailableColors?: string[];
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

export interface MontagemInsumo {
  id: string;
  materialId?: string;
  name: string;
  quantity?: number;
  unitValue?: number;
  value: number;
}

export interface MontagemLaborLine {
  id: string;
  role: string;
  count: number;
  hours: number;
  rate: number;
  total: number;
}

export type MontagemCategoria = "Marmore" | "Vidro" | "Aluminio" | "ProdutosProntos";

export interface Montagem {
  id: string;
  name: string;
  price: number;
  categoria?: MontagemCategoria;
  insumos?: MontagemInsumo[];
  labor?: MontagemLaborLine[];
}

export interface FreightRate {
  id: string;
  city: string;
  km: number;
}

export interface FreightConfig {
  kmRateCar: number;
  kmRateMoto: number;
  markup: number;
}

// Um "Aplicar" do frete cadastrado, guardado no orçamento — permite ter mais
// de um (ex.: carro num dia + moto noutro dia).
export interface FreightAppliedItem {
  id: string;
  cityName: string;
  vehicle: "Carro" | "Moto";
  km: number;
  value: number;
}

// Montagem escolhida dentro de um item de orçamento — guarda o preço no
// momento da escolha (independe de o catálogo de montagens mudar depois).
export interface QuoteItemMontagem {
  id: string;
  montagemId: string;
  name: string;
  price: number;
}

// Insumo de montagem já "explodido" dentro de um item, com o nome da
// montagem de origem — usado só no detalhamento financeiro (Admin).
export interface QuoteItemAssemblyLine {
  montagemName: string;
  insumoName: string;
  value: number;
}

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  selectedColor: string;
  description: string;
  // Anotação só pra equipe (ex.: quebra de medida peça a peça) — aparece no
  // orçamento/venda dentro do sistema, mas nunca no PDF/impressão pro cliente.
  internalDetail?: string;
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
  montagens?: QuoteItemMontagem[];
  assemblyCost?: number;
  assemblyBreakdown?: QuoteItemAssemblyLine[];
  // Item de mármore composto por várias peças (comprimento x largura x qtd)
  // em vez de uma medida única — presente só nesses itens, permite reabrir
  // a edição mostrando cada peça em vez de um Alt/Larg genérico (que fica
  // sempre 0 pra esse tipo de item).
  piecesBreakdown?: { id: string; length: number; width: number; quantity: number }[];
  // Soma de montagem/cuba/acessório/diferença já embutida no price/cost do
  // item no momento da criação — preservada ao reeditar as peças, pra não
  // perder esses valores no recálculo do preço.
  extrasPriceTotal?: number;
  extrasCostTotal?: number;
  // Composição guardada pra reabrir o item no formulário de cima ("Editar")
  // com cubas/acessórios/estruturas já carregados. Itens antigos não têm —
  // nesse caso a edição tenta reconstruir a partir do internalDetail.
  composition?: {
    category: "GRANITO" | "VIDROS" | "ALUMINIO" | "ACESSORIOS";
    cubas?: QuoteItemComponent[];
    accessories?: QuoteItemComponent[];
    estruturas?: (QuoteItemComponent & { width: number; height: number; color?: string })[];
    acessoriosVidro?: (QuoteItemComponent & { color?: string })[];
    notes?: string;
    extraService?: number;
    glassTypeId?: string;
    texture?: string;
    hardwareColor?: string;
  };
}

export interface QuoteItemComponent {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
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
  // Marca manual, só Admin — pagamento 100% sozinho não conclui a venda,
  // porque o produto pode ainda não ter sido entregue.
  saleCompleted?: boolean;

  items: QuoteItem[];

  subtotal: number;
  discount: number;
  freight: number;
  // Cada "Aplicar" no seletor de frete cadastrado vira um item aqui — permite
  // somar mais de um frete no mesmo orçamento (ex.: equipe de carro num dia +
  // equipe de moto noutro dia, pra mesma cidade ou cidades diferentes).
  freightItems?: FreightAppliedItem[];
  // Se true (padrão), o frete some diluído dentro do valor de cada produto
  // na tela e no PDF; se false, aparece como linha separada pro cliente.
  dissolveFreight?: boolean;
  // Rateio manual do frete por item (chave = QuoteItem.id, valor = R$
  // daquele item) — só presente quando a usuária optou por distribuir o
  // frete ela mesma em vez de deixar rateado proporcionalmente ao preço de
  // cada item (padrão). Ausente/vazio = usa o rateio automático.
  freightManualByItem?: Record<string, number>;
  installation: number;
  installationCostItems?: QuoteInstallationCostLine[];
  // Custo de alimentação da equipe de instalação — reduz o lucro, diferente
  // de "installation" (que é cobrado do cliente).
  feedingCost?: number;
  // Ajuste de preço em nível de orçamento (não por produto) — soma direto no
  // total cobrado do cliente como lucro puro, sem afetar custo. Diferente de
  // "installation"/"feedingCost": pode ser adicionado a qualquer momento,
  // inclusive depois que os produtos já foram lançados.
  priceDifference?: number;
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

  // Sinalização manual da vendedora/Admin — orçamento que não virou venda
  // (cliente sumiu, comprou em outro lugar, etc.). Deixa o card vermelho na
  // lista de Orçamentos, mas não mexe no status oficial ("Pendente" etc.).
  notClosed?: boolean;
  // Registro de tentativas de contato/prospecção (mensagem, ligação...) —
  // lista cronológica, mais de um registro por orçamento.
  contactLog?: QuoteContactLogEntry[];
  // Data marcada pra próximo contato (lembrete) — aparece no Dashboard da
  // vendedora responsável até essa data.
  nextContactDate?: string; // YYYY-MM-DD

  // Datas de aprovação/conclusão — gravadas sozinhas por trigger no banco na
  // primeira vez que status vira "Aprovado" / saleCompleted vira true. Usadas
  // pela DRE pra reconhecer receita (ver cashflowSettings.saleRecognitionDate).
  approvedAt?: string; // YYYY-MM-DD
  concludedAt?: string; // YYYY-MM-DD
  // Data real de entrega/retirada — separada da data de conclusão (que só
  // acontece quando o pagamento completa 100%). Ver [[fluxo-status-venda]].
  deliveredAt?: string; // YYYY-MM-DD

  // Marca vendas cadastradas manualmente a partir do sistema antigo (antes
  // de existir cadastro de pedido) — serve só pra filtrar depois quantas
  // ainda faltam migrar, não muda nenhum cálculo.
  originLegacy?: boolean;

  // Motivo da recusa — pedido ao marcar o orçamento como "Recusado".
  // lostReasonDetail só vem preenchido quando o motivo é "Outro".
  lostReason?: string;
  lostReasonDetail?: string;
}

export interface QuoteContactLogEntry {
  id: string;
  text: string;
  date: string; // ISO
  author?: string;
  // "not_closed" = motivo registrado ao marcar o orçamento como "Não fechou".
  kind?: "not_closed";
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
export type PaymentMethod =
  | "Dinheiro"
  | "PIX"
  | "Cartão débito"
  | "Cartão crédito à vista"
  | "Cartão crédito parcelado"
  | "Link de pagamento"
  | "Transferência bancária"
  | "Boleto"
  | "A Definir";

export interface CashFlowEntry {
  id: string;
  type: "Entrada" | "Saída";
  amount: number;
  category: string;
  subcategory?: string;
  description: string;
  date: string;
  createdAt?: string;
  // Vínculo direto com o orçamento/venda de origem (id do orçamento) — antes
  // isso só existia embutido no texto de subcategory ("quote:<id>"), sem
  // coluna própria.
  orcamentoId?: string;
  // Forma de pagamento estruturada (além de aparecer no texto da
  // descrição) — usada pra decidir a subcategoria de recebimentos de venda.
  paymentMethod?: PaymentMethod;
  // Só preenchido quando paymentMethod = "Cartão crédito parcelado".
  installments?: number;

  // Conta bancária/caixa onde o dinheiro entrou ou saiu de fato — sem isso
  // não dá pra saber o saldo de cada conta separadamente.
  accountId?: string;
  // Data de competência (a que mês essa saída "pertence" de verdade) —
  // só usada em saídas; por padrão igual à data do pagamento, mas editável
  // (ex.: salário de setembro pago em 05/10 → competência = setembro).
  competenciaDate?: string;
  // Transferência entre contas próprias — não é receita nem despesa de
  // verdade, só move saldo de uma conta pra outra. Todo lançamento de
  // transferência vem em par (saída numa conta + entrada em outra),
  // ligados pelo mesmo transferGroupId; excluir um exclui o outro.
  isTransfer?: boolean;
  transferGroupId?: string;
  // "devolucao" = dinheiro devolvido ao cliente de um pedido (Saída em
  // DEDUÇÕES → devoluções de vendas; deduz a receita, não é despesa).
  movementKind?: string;
  // Caminho do comprovante no bucket privado "pedido-comprovantes".
  attachmentPath?: string;
  // Alteração do pedido que originou a devolução (opcional).
  pedidoAlteracaoId?: string;
}

// ---------------------------------------------
// Plano de Contas (categorias do Caixa)
// ---------------------------------------------
export type DreGroup =
  | "RECEITA_BRUTA"
  | "OUTRAS_RECEITAS"
  | "DEDUCOES"
  | "CUSTO_DIRETO"
  | "DESPESA_VARIAVEL"
  | "DESPESA_PESSOAL"
  | "DESPESA_FIXA"
  | "RESULTADO_FINANCEIRO"
  | "NAO_ENTRA";

export type DfcGroup = "OPERACIONAL" | "INVESTIMENTO" | "FINANCIAMENTO" | "NAO_ENTRA";

export const DRE_GROUP_LABELS: Record<DreGroup, string> = {
  RECEITA_BRUTA: "Receita bruta",
  OUTRAS_RECEITAS: "Outras receitas",
  DEDUCOES: "Deduções",
  CUSTO_DIRETO: "Custo direto",
  DESPESA_VARIAVEL: "Despesa variável",
  DESPESA_PESSOAL: "Despesa com pessoal",
  DESPESA_FIXA: "Despesa fixa",
  RESULTADO_FINANCEIRO: "Resultado financeiro",
  NAO_ENTRA: "Não entra no DRE",
};

export const DFC_GROUP_LABELS: Record<DfcGroup, string> = {
  OPERACIONAL: "Operacional",
  INVESTIMENTO: "Investimento",
  FINANCIAMENTO: "Financiamento",
  NAO_ENTRA: "Não entra no DFC",
};

export interface CashFlowCategory {
  id: string;
  type: "Entrada" | "Saída";
  category: string;
  groupTitle: string;
  subcategory: string;
  grupoDre: DreGroup;
  grupoDfc: DfcGroup;
  sortOrder?: number;
  active?: boolean;
}

// ---------------------------------------------
// Contas bancárias / caixa
// ---------------------------------------------
export interface BankAccount {
  id: string;
  name: string;
  initialBalance: number;
  initialBalanceDate: string;
  active: boolean;
  // Movimento = conta normal (soma no saldo operacional); Reserva/Investimento
  // fica de fora do "Saldo atual" da projeção de caixa, mostrada à parte.
  accountType?: "movimento" | "reserva";
}

// Config única (linha só) — conta padrão por forma de pagamento. Cartão
// nunca tem padrão fixo (sempre pergunta a maquininha), por isso não entra
// aqui.
export interface CashFlowSettings {
  defaultAccountDinheiro?: string;
  defaultAccountPix?: string;
  // Qual data conta como "a venda aconteceu" pra reconhecer receita na DRE.
  saleRecognitionDate?: "delivery" | "approval";
  // Meta única de margem líquida (%), usada em todos os alertas do sistema.
  targetNetMargin?: number;
  // Como calcular o Custo Direto de material na DRE: pelo custo orçado dos
  // pedidos concluídos (padrão) ou pelas compras lançadas no Caixa.
  materialCostMode?: "budgeted" | "cashflow";
  // Data a partir da qual os dados foram conferidos (YYYY-MM-DD) — períodos
  // anteriores aparecem nos relatórios como "não conferido".
  reliableDataStart?: string;
  // Margem mínima (%) por setor — chave = VIDROS | ALUMÍNIO | MÁRMORE | PORTÃO.
  minMarginBySector?: Record<string, number>;
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
  paymentMethod?: string;
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
  employeeId?: number | null;
  /** Data e forma da baixa de conta à vista (as parceladas guardam na parcela). */
  paidDate?: string;
  paymentMethod?: string;
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

