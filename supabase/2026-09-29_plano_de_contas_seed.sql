-- Semente do plano de contas reorganizado (categorias/subcategorias com
-- classificação de DRE/DFC). Idempotente — pode rodar de novo sem duplicar
-- (unique em type+category+subcategory).

insert into public.cashflow_categories (type, category, group_title, subcategory, grupo_dre, grupo_dfc, sort_order) values
-- ── ENTRADA — RECEITAS OPERACIONAIS ──
('Entrada','RECEITAS OPERACIONAIS','vendas','venda dinheiro','RECEITA_BRUTA','OPERACIONAL',10),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda pix','RECEITA_BRUTA','OPERACIONAL',11),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda cartão débito','RECEITA_BRUTA','OPERACIONAL',12),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda cartão crédito à vista','RECEITA_BRUTA','OPERACIONAL',13),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda cartão crédito parcelado','RECEITA_BRUTA','OPERACIONAL',14),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda link de pagamento','RECEITA_BRUTA','OPERACIONAL',15),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda transferência bancária','RECEITA_BRUTA','OPERACIONAL',16),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda boleto','RECEITA_BRUTA','OPERACIONAL',17),
('Entrada','RECEITAS OPERACIONAIS','vendas','venda outros','RECEITA_BRUTA','OPERACIONAL',18),
('Entrada','RECEITAS OPERACIONAIS','outras receitas operacionais','taxa de entrega','RECEITA_BRUTA','OPERACIONAL',20),
('Entrada','RECEITAS OPERACIONAIS','outras receitas operacionais','recebimento de crediário / fiado','NAO_ENTRA','OPERACIONAL',21),
('Entrada','RECEITAS OPERACIONAIS','outras receitas operacionais','outras receitas operacionais','OUTRAS_RECEITAS','OPERACIONAL',22),

-- ── ENTRADA — ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS (era "RECEITAS NÃO OPERACIONAIS") ──
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','receitas financeiras','juros de aplicação financeira','RESULTADO_FINANCEIRO','OPERACIONAL',30),
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','receitas financeiras','cashback','RESULTADO_FINANCEIRO','OPERACIONAL',31),
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','movimentações financeiras','entrada de empréstimo','NAO_ENTRA','FINANCIAMENTO',32),
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','movimentações financeiras','aporte da proprietária','NAO_ENTRA','FINANCIAMENTO',33),
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','movimentações financeiras','resgate de aplicação','NAO_ENTRA','INVESTIMENTO',34),
('Entrada','ENTRADAS FINANCEIRAS E NÃO OPERACIONAIS','outras receitas','outras receitas não operacionais','OUTRAS_RECEITAS','OPERACIONAL',35),

-- ── SAÍDA — DEDUÇÕES (nova) ──
('Saída','DEDUÇÕES','impostos','impostos sobre vendas (DAS)','DEDUCOES','OPERACIONAL',40),
('Saída','DEDUÇÕES','descontos','devoluções e descontos','DEDUCOES','OPERACIONAL',41),

-- ── SAÍDA — CUSTOS VARIÁVEIS ──
('Saída','CUSTOS VARIÁVEIS','mercadorias / produtos','compra de mercadorias','CUSTO_DIRETO','OPERACIONAL',50),
('Saída','CUSTOS VARIÁVEIS','mercadorias / produtos','frete de fornecedores','CUSTO_DIRETO','OPERACIONAL',51),
('Saída','CUSTOS VARIÁVEIS','mercadorias / produtos','embalagens','CUSTO_DIRETO','OPERACIONAL',52),
('Saída','CUSTOS VARIÁVEIS','mercadorias / produtos','consumíveis de produção','CUSTO_DIRETO','OPERACIONAL',53),
('Saída','CUSTOS VARIÁVEIS','mão de obra','mão de obra terceirizada / instalação','CUSTO_DIRETO','OPERACIONAL',54),
('Saída','CUSTOS VARIÁVEIS','despesas de venda','taxa de cartão','DESPESA_VARIAVEL','OPERACIONAL',55),
('Saída','CUSTOS VARIÁVEIS','despesas de venda','taxa de maquininha','DESPESA_VARIAVEL','OPERACIONAL',56),
('Saída','CUSTOS VARIÁVEIS','despesas de venda','taxa de plataforma / marketplace','DESPESA_VARIAVEL','OPERACIONAL',57),
('Saída','CUSTOS VARIÁVEIS','despesas de venda','taxa de link de pagamento','DESPESA_VARIAVEL','OPERACIONAL',58),
('Saída','CUSTOS VARIÁVEIS','despesas de venda','comissões','DESPESA_VARIAVEL','OPERACIONAL',59),

-- ── SAÍDA — CUSTOS FIXOS ──
('Saída','CUSTOS FIXOS','pessoal','salários produção','DESPESA_PESSOAL','OPERACIONAL',60),
('Saída','CUSTOS FIXOS','pessoal','salários administrativo','DESPESA_PESSOAL','OPERACIONAL',61),
('Saída','CUSTOS FIXOS','pessoal','encargos sociais (inss / fgts)','DESPESA_PESSOAL','OPERACIONAL',62),
('Saída','CUSTOS FIXOS','pessoal','13º salário','DESPESA_PESSOAL','OPERACIONAL',63),
('Saída','CUSTOS FIXOS','pessoal','férias','DESPESA_PESSOAL','OPERACIONAL',64),
('Saída','CUSTOS FIXOS','pessoal','rescisões','DESPESA_PESSOAL','OPERACIONAL',65),
('Saída','CUSTOS FIXOS','pessoal','horas extras','DESPESA_PESSOAL','OPERACIONAL',66),
('Saída','CUSTOS FIXOS','pessoal','pró-labore','DESPESA_PESSOAL','OPERACIONAL',67),
('Saída','CUSTOS FIXOS','pessoal','alimentação loja','DESPESA_PESSOAL','OPERACIONAL',68),
('Saída','CUSTOS FIXOS','pessoal','alimentação viagem','DESPESA_PESSOAL','OPERACIONAL',69),
('Saída','CUSTOS FIXOS','estrutura da loja','aluguel','DESPESA_FIXA','OPERACIONAL',70),
('Saída','CUSTOS FIXOS','estrutura da loja','energia','DESPESA_FIXA','OPERACIONAL',71),
('Saída','CUSTOS FIXOS','estrutura da loja','água','DESPESA_FIXA','OPERACIONAL',72),
('Saída','CUSTOS FIXOS','estrutura da loja','internet','DESPESA_FIXA','OPERACIONAL',73),
('Saída','CUSTOS FIXOS','estrutura da loja','telefonia','DESPESA_FIXA','OPERACIONAL',74),
('Saída','CUSTOS FIXOS','estrutura da loja','sistema / software','DESPESA_FIXA','OPERACIONAL',75),
('Saída','CUSTOS FIXOS','estrutura da loja','contador','DESPESA_FIXA','OPERACIONAL',76),
('Saída','CUSTOS FIXOS','transporte','combustível','DESPESA_FIXA','OPERACIONAL',80),
('Saída','CUSTOS FIXOS','transporte','ipva','DESPESA_FIXA','OPERACIONAL',81),
('Saída','CUSTOS FIXOS','transporte','manutenção de veículo','DESPESA_FIXA','OPERACIONAL',82),
('Saída','CUSTOS FIXOS','outras despesas fixas','manutenção de máquinas e ferramentas','DESPESA_FIXA','OPERACIONAL',90),
('Saída','CUSTOS FIXOS','outras despesas fixas','epi e uniformes','DESPESA_FIXA','OPERACIONAL',91),
('Saída','CUSTOS FIXOS','outras despesas fixas','marketing e publicidade','DESPESA_FIXA','OPERACIONAL',92),
('Saída','CUSTOS FIXOS','outras despesas fixas','material de escritório','DESPESA_FIXA','OPERACIONAL',93),

-- ── SAÍDA — SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS (era "DESPESAS NÃO OPERACIONAIS") ──
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','financeiras','tarifas bancárias','RESULTADO_FINANCEIRO','OPERACIONAL',100),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','financeiras','juros de empréstimo','RESULTADO_FINANCEIRO','OPERACIONAL',101),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','financeiras','amortização de empréstimo (principal)','NAO_ENTRA','FINANCIAMENTO',102),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','distribuições','distribuição de lucros','NAO_ENTRA','FINANCIAMENTO',103),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','investimentos','aquisição de imobilizado','NAO_ENTRA','INVESTIMENTO',104),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','investimentos','aplicação / investimento','NAO_ENTRA','INVESTIMENTO',105),
('Saída','SAÍDAS FINANCEIRAS E NÃO OPERACIONAIS','outras','outras saídas','DESPESA_FIXA','OPERACIONAL',106)

on conflict (type, category, subcategory) do nothing;
