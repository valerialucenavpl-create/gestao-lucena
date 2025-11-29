import React, { useState, useMemo } from 'react';
import { FixedExpense, VariableExpense, CashFlowEntry } from '../types';
import { Icon } from './icons/Icon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, ComposedChart } from 'recharts';

interface FinancialsProps {
    fixedExpenses: FixedExpense[];
    setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
    variableExpenses: VariableExpense[];
    setVariableExpenses: React.Dispatch<React.SetStateAction<VariableExpense[]>>;
    cashFlow: CashFlowEntry[];
}

const Financials: React.FC<FinancialsProps> = ({ fixedExpenses, setFixedExpenses, variableExpenses, setVariableExpenses, cashFlow }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'trends' | 'performance' | 'balance_sheet' | 'settings' | 'rates'>('dashboard');
    
    // Dashboard State
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM format

    // Settings State
    const [isFixedModalOpen, setIsFixedModalOpen] = useState(false);
    const [newFixedExpense, setNewFixedExpense] = useState<Omit<FixedExpense, 'id'>>({ name: '', date: new Date(), amount: 0, category: 'Outros'});
    const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
    const [newVariableExpense, setNewVariableExpense] = useState<Omit<VariableExpense, 'id'>>({ name: '', type: 'percent', value: 0 });

    // Markup Calculator state
    const [monthlyRevenueGoal, setMonthlyRevenueGoal] = useState(30000);
    const [desiredProfitMargin, setDesiredProfitMargin] = useState(20);
    const [markupDivisor, setMarkupDivisor] = useState<number | null>(null);
    const [markupMultiplier, setMarkupMultiplier] = useState<number | null>(null);
    
    // Contribution Margin analysis state
    const [cogsInput, setCogsInput] = useState(100);

    // --- Calculations for Settings Tab ---
    const totalFixedExpenses = useMemo(() => fixedExpenses.reduce((sum, item) => sum + item.amount, 0), [fixedExpenses]);
    const totalVariablePercent = useMemo(() => variableExpenses.filter(e => e.type === 'percent').reduce((sum, item) => sum + item.value, 0), [variableExpenses]);

    // Find Card Rate
    const cardFeeExpense = variableExpenses.find(e => e.name.includes('Maquininha') || e.name.includes('Cartão'));
    const currentCardRate = cardFeeExpense ? cardFeeExpense.value : 0;

    // --- Calculations for Dashboard Tab ---
    const filteredCashFlow = useMemo(() => {
        return cashFlow.filter(entry => entry.date.toISOString().startsWith(selectedMonth));
    }, [cashFlow, selectedMonth]);

    const monthIncome = filteredCashFlow.filter(e => e.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
    const monthExpense = filteredCashFlow.filter(e => e.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
    const netProfit = monthIncome - monthExpense;
    const profitMarginPercent = monthIncome > 0 ? (netProfit / monthIncome) * 100 : 0;

    // Chart Data
    const incomeVsExpenseData = [
        { name: 'Receitas', value: monthIncome, fill: '#22c55e' },
        { name: 'Despesas', value: monthExpense, fill: '#ef4444' },
    ];

    const marginData = [
        { name: 'Lucro', value: Math.max(0, netProfit) },
        { name: 'Custos', value: monthExpense },
    ];
    const MARGIN_COLORS = ['#f59e0b', '#e5e7eb'];

    // Expense Breakdown Data
    const expensesByCategory = useMemo(() => {
        const summary: {[key: string]: number} = {};
        filteredCashFlow.filter(e => e.type === 'expense').forEach(e => {
            summary[e.category] = (summary[e.category] || 0) + e.amount;
        });
        return Object.keys(summary).map(key => ({ name: key, value: summary[key] }));
    }, [filteredCashFlow]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    // --- Calculations for Trends Tab ---
    const trendData = useMemo(() => {
        // Generate last 6 months labels
        const months = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push(d);
        }

        let runningBalance = 15000; // Starting dummy balance for simulation
        
        return months.map(date => {
            const monthStr = date.toISOString().slice(0, 7);
            const entries = cashFlow.filter(c => c.date.toISOString().startsWith(monthStr));
            const income = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
            const expense = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
            
            // Simulating historical data if empty for better visualization in this demo
            const simIncome = income || (Math.random() * 10000 + 15000);
            const simExpense = expense || (Math.random() * 8000 + 10000);
            
            runningBalance = runningBalance + simIncome - simExpense;

            return {
                name: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                balance: runningBalance,
                income: simIncome,
                expense: simExpense,
                receivablesTurnover: Math.random() * 5 + 2, // Mock KPI
                payablesTurnover: Math.random() * 4 + 1,   // Mock KPI
                inventoryValue: Math.random() * 5000 + 10000 // Mock KPI
            };
        });
    }, [cashFlow]);

    // --- Calculations for Performance Tab (Mock Data for Demo) ---
    const performanceData = {
        growthChart: [
            { name: 'Jan', actual: 4000, plan: 4200 },
            { name: 'Fev', actual: 4500, plan: 4300 },
            { name: 'Mar', actual: 4800, plan: 4500 },
            { name: 'Abr', actual: 5100, plan: 4800 },
            { name: 'Mai', actual: 5300, plan: 5000 },
            { name: 'Jun', actual: 5800, plan: 5200 },
            { name: 'Jul', actual: 6200, plan: 5500 },
        ],
        marketing: [
            { metric: 'Visitantes Site', value: '195,671', plan: '201,561', vsLy: '1.6x', trend: [20,30,40,35,50,60,70] },
            { metric: 'Leads Iniciados', value: '9,949', plan: '9,850', vsLy: '1.6x', trend: [10,20,15,25,30,40,45] },
            { metric: 'Novos Clientes', value: '6,417', plan: '6,674', vsLy: '1.4x', trend: [50,50,55,60,58,62,65] },
            { metric: 'Conv. Leads/Venda', value: '6.2%', plan: '4.1%', vsLy: '1.5x', trend: [60,62,61,63,62,64,65] },
            { metric: 'Custo Aq. (CAC)', value: 'R$ 138', plan: 'R$ 139', vsLy: '0.8x', trend: [40,38,35,36,34,33,30] },
        ],
        sales: [
            { metric: 'Receita Total', value: 'R$ 694k', plan: 'R$ 578k', vsLy: '1.7x', trend: [30,35,40,45,50,55,60] },
            { metric: 'Ticket Médio', value: 'R$ 1,108', plan: 'R$ 987', vsLy: '1.2x', trend: [40,42,41,43,45,46,48] },
            { metric: 'Margem Bruta', value: '77%', plan: '75%', vsLy: '1.1x', trend: [70,72,71,73,75,76,77] },
            { metric: 'Ciclo Vendas', value: '12 dias', plan: '15 dias', vsLy: '0.8x', trend: [50,45,40,35,30,25,20] },
        ],
        product: [
            { metric: 'Eficiência Prod.', value: '98.5%', plan: '95.0%', vsLy: '1.1x', trend: [90,92,94,95,96,97,98] },
            { metric: 'Retrabalho', value: '1.2%', plan: '2.0%', vsLy: '0.6x', trend: [50,40,30,25,20,15,10] },
            { metric: 'Entrega Prazo', value: '99.2%', plan: '98.0%', vsLy: '1.0x', trend: [95,96,97,98,98,99,99] },
        ],
        ux: [
            { metric: 'NPS', value: '72', plan: '65', vsLy: '1.2x', trend: [50,55,60,62,65,68,72] },
            { metric: 'Avaliações 5*', value: '92%', plan: '90%', vsLy: '1.1x', trend: [80,85,88,90,91,92,92] },
            { metric: 'Reclamações', value: '0.5%', plan: '1.0%', vsLy: '0.5x', trend: [30,25,20,15,10,8,5] },
        ]
    };

    // --- Balance Sheet Data (Mocked) ---
    const balanceSheetData = useMemo(() => {
        // Simulating data for 2016 vs 2017 style comparison (Using current years)
        const yearCurrent = new Date().getFullYear();
        const yearPrevious = yearCurrent - 1;

        return {
            years: [yearPrevious, yearCurrent],
            assets: {
                current: [
                    { name: 'Caixa e Equivalentes', prev: 11874, curr: 22540 },
                    { name: 'Contas a Receber', prev: 1000, curr: 2000 },
                    { name: 'Estoque', prev: 1000, curr: 2500 },
                    { name: 'Despesas Antecipadas', prev: 1500, curr: 3000 },
                    { name: 'Investimentos Curto Prazo', prev: 500, curr: 1500 },
                ],
                fixed: [
                    { name: 'Investimentos Longo Prazo', prev: 1200, curr: 500 },
                    { name: 'Imóveis e Equipamentos', prev: 15340, curr: 17200 }, // Adjusted to make total larger
                ]
            },
            liabilities: {
                current: [
                    { name: 'Contas a Pagar', prev: 2500, curr: 4000 },
                    { name: 'Empréstimos Curto Prazo', prev: 1000, curr: 800 },
                ],
                longTerm: [
                    { name: 'Empréstimos Longo Prazo', prev: 8000, curr: 12000 },
                ]
            }
        };
    }, []);

    const balanceCalculations = useMemo(() => {
        const totalCurrentAssetsPrev = balanceSheetData.assets.current.reduce((a, b) => a + b.prev, 0);
        const totalCurrentAssetsCurr = balanceSheetData.assets.current.reduce((a, b) => a + b.curr, 0);
        
        const totalFixedAssetsPrev = balanceSheetData.assets.fixed.reduce((a, b) => a + b.prev, 0);
        const totalFixedAssetsCurr = balanceSheetData.assets.fixed.reduce((a, b) => a + b.curr, 0);

        const totalAssetsPrev = totalCurrentAssetsPrev + totalFixedAssetsPrev;
        const totalAssetsCurr = totalCurrentAssetsCurr + totalFixedAssetsCurr;

        const totalLiabilitiesPrev = [...balanceSheetData.liabilities.current, ...balanceSheetData.liabilities.longTerm].reduce((a, b) => a + b.prev, 0);
        const totalLiabilitiesCurr = [...balanceSheetData.liabilities.current, ...balanceSheetData.liabilities.longTerm].reduce((a, b) => a + b.curr, 0);

        const equityPrev = totalAssetsPrev - totalLiabilitiesPrev;
        const equityCurr = totalAssetsCurr - totalLiabilitiesCurr;

        // Chart Data
        const assetsCompositionData = [
            ...balanceSheetData.assets.current.map(i => ({ name: i.name, value: i.curr })),
            ...balanceSheetData.assets.fixed.map(i => ({ name: i.name, value: i.curr }))
        ];

        const equityGrowthData = [
            { name: balanceSheetData.years[0].toString(), equity: equityPrev, assets: totalAssetsPrev },
            { name: balanceSheetData.years[1].toString(), equity: equityCurr, assets: totalAssetsCurr },
        ];

        return {
            totalCurrentAssetsPrev, totalCurrentAssetsCurr,
            totalFixedAssetsPrev, totalFixedAssetsCurr,
            totalAssetsPrev, totalAssetsCurr,
            equityPrev, equityCurr,
            assetsCompositionData,
            equityGrowthData
        };
    }, [balanceSheetData]);


    // Gauge Component Helper
    const GaugeChart = ({ value, max, title, color, subLabel }: { value: number, max: number, title: string, color: string, subLabel?: string }) => {
        const angle = 180 * (value / max);
        const data = [
            { name: 'Value', value: value, color: color },
            { name: 'Remaining', value: max - value, color: '#e5e7eb' }
        ];
        
        return (
            <div className="flex flex-col items-center justify-center relative h-40">
                <h5 className="text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider text-center">{title}</h5>
                 {subLabel && <span className="text-[10px] text-gray-400 mb-1">{subLabel}</span>}
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="70%"
                            startAngle={180}
                            endAngle={0}
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute bottom-8 text-center">
                    <span className="text-xl font-bold text-gray-800">{typeof value === 'number' && value > 1000 ? `${(value/1000).toFixed(1)}k` : value}</span>
                </div>
                {/* Needle simulation */}
                <div className="absolute bottom-10 w-1 h-8 bg-gray-800 origin-bottom transform transition-transform duration-1000" style={{ transform: `rotate(${Math.min(angle, 180) - 90}deg)` }}></div>
                <div className="absolute bottom-2 w-full text-center text-xs font-medium text-gray-500 flex justify-between px-4">
                    <span>0</span>
                    <span>{max > 1000 ? `${max/1000}k` : max}</span>
                </div>
            </div>
        );
    };

    // Mini Trend Bar Component for Table
    const TrendBars = ({ data }: { data: number[] }) => (
        <div className="flex items-end h-6 gap-0.5">
            {data.map((val, idx) => (
                <div key={idx} style={{ height: `${val}%` }} className="w-1.5 bg-blue-600 rounded-t-sm opacity-80"></div>
            ))}
        </div>
    );

    // Performance Table Component
    const PerformanceTable = ({ title, data }: { title: string, data: any[] }) => (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 font-semibold text-gray-700 text-sm">
                {title}
            </div>
            <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="px-3 py-2 text-left">Métrica</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="px-3 py-2 text-right">Plano</th>
                        <th className="px-3 py-2 text-center">vs LY</th>
                        <th className="px-3 py-2 text-center">Tendência</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {data.map((row, i) => (
                        <tr key={i}>
                            <td className="px-3 py-2 font-medium text-gray-700">{row.metric}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{row.value}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{row.plan}</td>
                            <td className="px-3 py-2 text-center text-gray-500">
                                <span className={row.vsLy.includes('1.') || row.vsLy.includes('2.') ? 'text-green-600' : 'text-yellow-600'}>{row.vsLy}</span>
                            </td>
                            <td className="px-3 py-2 flex justify-center">
                                <TrendBars data={row.trend} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    
    // --- Handlers ---
    const handleAddFixedExpense = (e: React.FormEvent) => {
        e.preventDefault();
        setFixedExpenses(prev => [...prev, { id: `fe-${Date.now()}`, ...newFixedExpense }]);
        setIsFixedModalOpen(false);
        setNewFixedExpense({ name: '', date: new Date(), amount: 0, category: 'Outros'});
    };

    const handleAddVariableExpense = (e: React.FormEvent) => {
        e.preventDefault();
        setVariableExpenses(prev => [...prev, { id: `ve-${Date.now()}`, ...newVariableExpense }]);
        setIsVariableModalOpen(false);
        setNewVariableExpense({ name: '', type: 'percent', value: 0 });
    };
    
    const handleCardRateUpdate = (newRate: number) => {
        setVariableExpenses(prev => {
            const exists = prev.find(e => e.name.includes('Maquininha') || e.name.includes('Cartão'));
            if (exists) {
                return prev.map(e => (e.name.includes('Maquininha') || e.name.includes('Cartão')) ? { ...e, value: newRate } : e);
            } else {
                return [...prev, { id: `ve-${Date.now()}`, name: 'Taxa Maquininha Cartão', type: 'percent', value: newRate }];
            }
        });
    };

    const handleCalculateMarkup = () => {
        if (monthlyRevenueGoal <= 0) {
            alert("A meta de faturamento deve ser maior que zero.");
            return;
        }
        const fixedCostPercent = (totalFixedExpenses / monthlyRevenueGoal) * 100;
        const totalPercents = fixedCostPercent + totalVariablePercent + desiredProfitMargin;
        if (totalPercents >= 100) {
            alert("A soma das despesas e lucro desejado não pode ser maior ou igual a 100%. Ajuste os valores.");
            setMarkupDivisor(null);
            setMarkupMultiplier(null);
            return;
        }
        const divisor = (100 - totalPercents) / 100;
        const multiplier = 1 / divisor;
        setMarkupDivisor(divisor);
        setMarkupMultiplier(multiplier);
    }
    
    // Analysis calculations
    const suggestedSalePrice = markupMultiplier ? cogsInput * markupMultiplier : 0;
    const variableCostsValue = (suggestedSalePrice * totalVariablePercent) / 100;
    const contributionMarginValue = suggestedSalePrice - cogsInput - variableCostsValue;
    const contributionMarginPercent = suggestedSalePrice > 0 ? (contributionMarginValue / suggestedSalePrice) * 100 : 0;

    return (
        <div className="space-y-6">
            
            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm p-2 flex flex-wrap gap-2">
                <button 
                    onClick={() => setActiveTab('dashboard')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'dashboard' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Painel de Resultados
                </button>
                <button 
                    onClick={() => setActiveTab('trends')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'trends' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Análise de Tendências
                </button>
                 <button 
                    onClick={() => setActiveTab('performance')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'performance' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Desempenho Comercial
                </button>
                 <button 
                    onClick={() => setActiveTab('balance_sheet')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'balance_sheet' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Balanço Patrimonial
                </button>
                <button 
                    onClick={() => setActiveTab('rates')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'rates' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Taxas de Cartão
                </button>
                <button 
                    onClick={() => setActiveTab('settings')} 
                    className={`flex-grow md:flex-none whitespace-nowrap py-2 px-4 rounded-lg font-medium text-sm transition-colors ${activeTab === 'settings' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    Configurações e Custos
                </button>
            </div>

            {/* --- DASHBOARD TAB --- */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Date Filter */}
                    <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-800">Resultados Mensais</h3>
                        <div className="flex items-center gap-2">
                            <label htmlFor="monthPicker" className="text-sm font-medium text-gray-700">Selecionar Mês:</label>
                            <input 
                                type="month" 
                                id="monthPicker"
                                value={selectedMonth} 
                                onChange={(e) => setSelectedMonth(e.target.value)} 
                                className="p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
                            <p className="text-sm text-gray-500 font-medium uppercase">Receitas Totais</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">R$ {monthIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
                            <p className="text-sm text-gray-500 font-medium uppercase">Despesas Totais</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">R$ {monthExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                            <p className="text-sm text-gray-500 font-medium uppercase">Lucro Líquido</p>
                            <p className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                                R$ {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                         <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
                            <p className="text-sm text-gray-500 font-medium uppercase">Margem de Lucro</p>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{profitMarginPercent.toFixed(1)}%</p>
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Income vs Expense Chart */}
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h4 className="text-lg font-semibold text-gray-800 mb-6">Receitas x Despesas</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={incomeVsExpenseData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                        <YAxis hide />
                                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={60}>
                                            {incomeVsExpenseData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Profit Margin Gauge (Simulated with Pie) */}
                         <div className="bg-white p-6 rounded-xl shadow-md">
                            <h4 className="text-lg font-semibold text-gray-800 mb-4">Margem de Lucro</h4>
                            <div className="h-64 relative flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={marginData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            startAngle={180}
                                            endAngle={0}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {marginData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={MARGIN_COLORS[index % MARGIN_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute text-center pb-4">
                                     <p className="text-3xl font-bold text-gray-800">{profitMarginPercent.toFixed(1)}%</p>
                                     <p className="text-xs text-gray-500">Margem Real</p>
                                </div>
                            </div>
                        </div>

                        {/* Expense Breakdown */}
                        <div className="bg-white p-6 rounded-xl shadow-md lg:col-span-2">
                            <h4 className="text-lg font-semibold text-gray-800 mb-4">Composição das Despesas</h4>
                             <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={expensesByCategory}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {expensesByCategory.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TRENDS TAB --- */}
            {activeTab === 'trends' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-blue-900 text-white p-6 rounded-xl shadow-lg">
                        <h3 className="text-2xl font-bold">Análise de Tendências Financeiras</h3>
                        <p className="opacity-80">Gerenciamento de Caixa, Capital de Giro e Ciclos Financeiros</p>
                    </div>

                    {/* Top Row: Working Capital & Cash Balance */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Liquidity/Working Capital Column */}
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-800 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase">Liquidez Corrente</p>
                                    <p className="text-2xl font-bold text-gray-800">1.85</p>
                                </div>
                                <Icon className="text-green-500 w-8 h-8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-600 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase">Liquidez Imediata</p>
                                    <p className="text-2xl font-bold text-gray-800">0.65</p>
                                </div>
                                <Icon className="text-yellow-500 w-8 h-8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></Icon>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-md text-center">
                                <p className="text-sm font-bold text-gray-500 uppercase mb-2">Saldo Atual de Caixa</p>
                                <p className="text-4xl font-bold text-blue-900">R$ {trendData[trendData.length - 1].balance.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                                <div className="flex justify-between mt-4 pt-4 border-t text-sm">
                                    <div className="text-left">
                                        <span className="block text-gray-500 uppercase text-xs">Entradas (mês)</span>
                                        <span className="font-semibold text-green-600">+ R$ {trendData[trendData.length - 1].income.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-gray-500 uppercase text-xs">Saídas (mês)</span>
                                        <span className="font-semibold text-red-600">- R$ {trendData[trendData.length - 1].expense.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cash Balance Chart */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
                            <h4 className="text-sm font-bold text-gray-500 uppercase mb-4">Evolução do Saldo de Caixa (6 Meses)</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`}/>
                                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="balance" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} name="Saldo Final" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Middle Row: Cash Conversion Cycle */}
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h4 className="text-lg font-bold text-gray-800 mb-6 border-b pb-2">Ciclo de Conversão de Caixa</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* DSO */}
                            <GaugeChart 
                                value={24} 
                                max={60} 
                                title="Prazo Médio Recebimento (DSO)" 
                                color="#0ea5e9" 
                            />
                            {/* DIO */}
                            <GaugeChart 
                                value={50} 
                                max={90} 
                                title="Giro de Estoque (Dias - DIO)" 
                                color="#1e3a8a" 
                            />
                            {/* DPO */}
                            <GaugeChart 
                                value={29} 
                                max={60} 
                                title="Prazo Médio Pagamento (DPO)" 
                                color="#60a5fa" 
                            />
                        </div>
                    </div>

                    {/* Bottom Row: Turnover Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h4 className="text-sm font-bold text-gray-500 uppercase mb-4">Giro Contas a Receber vs Pagar</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="receivablesTurnover" name="Giro Recebíveis" fill="#1e40af" barSize={20} />
                                        <Bar dataKey="payablesTurnover" name="Giro Pagáveis" fill="#93c5fd" barSize={20} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h4 className="text-sm font-bold text-gray-500 uppercase mb-4">Tendência de Valor em Estoque</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trendData}>
                                        <defs>
                                            <linearGradient id="colorInventory" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" />
                                        <YAxis tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                                        <Area type="monotone" dataKey="inventoryValue" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorInventory)" name="Valor Estoque" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {/* --- PERFORMANCE TAB --- */}
            {activeTab === 'performance' && (
                <div className="space-y-6 animate-fade-in">
                     <div className="bg-white p-6 rounded-xl shadow-md text-center">
                        <h3 className="text-2xl font-semibold text-gray-800">Painel de Desempenho de Negócios</h3>
                        <p className="text-gray-500">Marketing, Produto e Métricas Comerciais Totais</p>
                     </div>

                     {/* Top Row Gauges */}
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-white p-4 rounded-xl shadow-md">
                        <div className="border-r border-gray-100 last:border-0">
                            <GaugeChart value={6417} max={6676} title="Clientes Ativos (Ano)" subLabel="Target: 6,676" color="#3b82f6" />
                        </div>
                        <div className="border-r border-gray-100 last:border-0">
                            <GaugeChart value={694030} max={578358} title="Receita Acumulada YTD" subLabel="Target: 578k" color="#22c55e" />
                        </div>
                         <div className="border-r border-gray-100 last:border-0">
                            <GaugeChart value={108} max={85} title="Ticket Médio" subLabel="Target: R$ 85" color="#22c55e" />
                        </div>
                         <div className="border-r border-gray-100 last:border-0">
                            <GaugeChart value={6.2} max={5.0} title="Taxa Conversão (%)" subLabel="Target: 4.1%" color="#22c55e" />
                        </div>
                         <div className="border-r border-gray-100 last:border-0">
                            <GaugeChart value={97} max={100} title="Retenção Mensal (%)" subLabel="Target: 103%" color="#22c55e" />
                        </div>
                     </div>

                     {/* Middle Section: Tables and Chart */}
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Left Columns: Data Tables */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <PerformanceTable title="Marketing" data={performanceData.marketing} />
                            <PerformanceTable title="Vendas (Sales)" data={performanceData.sales} />
                            <PerformanceTable title="Produto / Produção" data={performanceData.product} />
                            <PerformanceTable title="Experiência do Usuário" data={performanceData.ux} />
                        </div>

                        {/* Right Column: Growth Chart */}
                        <div className="lg:col-span-1 bg-white p-4 rounded-xl shadow-md flex flex-col">
                            <h4 className="text-lg font-bold text-gray-700 mb-4 text-center">Crescimento Real vs Planejado</h4>
                             <div className="flex-1 min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={performanceData.growthChart}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" scale="point" padding={{ left: 10, right: 10 }} />
                                        <YAxis hide />
                                        <Tooltip formatter={(value) => `R$ ${value}`} />
                                        <Legend verticalAlign="top" height={36}/>
                                        <Bar dataKey="actual" name="Realizado" fill="#1e3a8a" barSize={20} />
                                        <Bar dataKey="plan" name="Planejado" fill="#22c55e" barSize={20} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                             <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                                <div className="p-2 bg-gray-50 rounded">
                                    <span className="block text-xs text-gray-500">Cresc. Real (Mês)</span>
                                    <span className="font-bold text-blue-800">R$ 6,200</span>
                                </div>
                                <div className="p-2 bg-gray-50 rounded">
                                    <span className="block text-xs text-gray-500">Previsão Próx.</span>
                                    <span className="font-bold text-green-700">R$ 6,500</span>
                                </div>
                            </div>
                        </div>
                     </div>

                </div>
            )}

            {/* --- BALANCE SHEET TAB --- */}
            {activeTab === 'balance_sheet' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl shadow-md mb-6">
                        <h3 className="text-2xl font-bold text-gray-800">Modelo PPT do Painel do Balanço Financeiro</h3>
                        <p className="text-gray-500">Visão geral de ativos, passivos e patrimônio líquido da empresa.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left Column: The Table (Simulating the PPT Slide Table) */}
                        <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-md">
                            {/* Header Row */}
                            <div className="grid grid-cols-3 bg-blue-900 text-white font-bold text-lg p-4 rounded-t-lg">
                                <div>Ativos (Assets)</div>
                                <div className="text-right">{balanceSheetData.years[0]}</div>
                                <div className="text-right">{balanceSheetData.years[1]}</div>
                            </div>

                            {/* Current Assets Section */}
                            <div className="bg-blue-50 p-2 font-bold text-blue-800 mt-1">Ativos Circulantes (Current Assets)</div>
                            {balanceSheetData.assets.current.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-3 border-b border-gray-100 p-2 text-sm hover:bg-gray-50">
                                    <div>{item.name}</div>
                                    <div className="text-right text-gray-600">{item.prev.toLocaleString('pt-BR')}</div>
                                    <div className="text-right font-semibold">{item.curr.toLocaleString('pt-BR')}</div>
                                </div>
                            ))}
                            <div className="grid grid-cols-3 bg-blue-100 p-2 font-bold text-blue-900 border-t border-blue-200">
                                <div>Total Ativos Circulantes</div>
                                <div className="text-right">{balanceCalculations.totalCurrentAssetsPrev.toLocaleString('pt-BR')}</div>
                                <div className="text-right">{balanceCalculations.totalCurrentAssetsCurr.toLocaleString('pt-BR')}</div>
                            </div>

                            {/* Fixed Assets Section */}
                            <div className="bg-blue-800 p-2 font-bold text-white mt-4">Ativos Não Circulantes (Fixed Assets)</div>
                             {balanceSheetData.assets.fixed.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-3 border-b border-gray-100 p-2 text-sm hover:bg-gray-50">
                                    <div>{item.name}</div>
                                    <div className="text-right text-gray-600">{item.prev.toLocaleString('pt-BR')}</div>
                                    <div className="text-right font-semibold">{item.curr.toLocaleString('pt-BR')}</div>
                                </div>
                            ))}
                            <div className="grid grid-cols-3 bg-blue-200 p-2 font-bold text-blue-900">
                                <div>Total Ativos</div>
                                <div className="text-right">{balanceCalculations.totalAssetsPrev.toLocaleString('pt-BR')}</div>
                                <div className="text-right">{balanceCalculations.totalAssetsCurr.toLocaleString('pt-BR')}</div>
                            </div>
                            
                            {/* Liabilities Header */}
                             <div className="grid grid-cols-3 bg-red-900 text-white font-bold text-lg p-2 mt-8 rounded-t-lg">
                                <div>Passivos e Patrimônio</div>
                                <div className="text-right">{balanceSheetData.years[0]}</div>
                                <div className="text-right">{balanceSheetData.years[1]}</div>
                            </div>

                            {/* Current Liabilities */}
                            <div className="bg-red-50 p-2 font-bold text-red-800 mt-1">Passivos Circulantes</div>
                             {balanceSheetData.liabilities.current.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-3 border-b border-gray-100 p-2 text-sm hover:bg-gray-50">
                                    <div>{item.name}</div>
                                    <div className="text-right text-gray-600">{item.prev.toLocaleString('pt-BR')}</div>
                                    <div className="text-right font-semibold">{item.curr.toLocaleString('pt-BR')}</div>
                                </div>
                            ))}

                            {/* Long Term Liabilities */}
                            <div className="bg-red-50 p-2 font-bold text-red-800 mt-2">Passivos Não Circulantes</div>
                             {balanceSheetData.liabilities.longTerm.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-3 border-b border-gray-100 p-2 text-sm hover:bg-gray-50">
                                    <div>{item.name}</div>
                                    <div className="text-right text-gray-600">{item.prev.toLocaleString('pt-BR')}</div>
                                    <div className="text-right font-semibold">{item.curr.toLocaleString('pt-BR')}</div>
                                </div>
                            ))}

                            {/* Equity */}
                            <div className="bg-green-50 p-2 font-bold text-green-800 mt-4 border-t-2 border-green-200">Patrimônio Líquido (Equity)</div>
                             <div className="grid grid-cols-3 border-b border-gray-100 p-2 text-sm hover:bg-gray-50 font-semibold text-green-700">
                                <div>Capital e Reservas</div>
                                <div className="text-right">{balanceCalculations.equityPrev.toLocaleString('pt-BR')}</div>
                                <div className="text-right">{balanceCalculations.equityCurr.toLocaleString('pt-BR')}</div>
                            </div>

                             <div className="grid grid-cols-3 bg-gray-800 p-2 font-bold text-white mt-2 rounded-b-lg">
                                <div>Total Passivos + Patrimônio</div>
                                <div className="text-right">{balanceCalculations.totalAssetsPrev.toLocaleString('pt-BR')}</div>
                                <div className="text-right">{balanceCalculations.totalAssetsCurr.toLocaleString('pt-BR')}</div>
                            </div>
                        </div>

                        {/* Right Column: Charts */}
                        <div className="lg:col-span-5 space-y-6">
                            
                            {/* KPI Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-600">
                                    <p className="text-xs text-gray-500 uppercase">Capital de Giro</p>
                                    <p className="text-lg font-bold text-gray-800">R$ {(balanceCalculations.totalCurrentAssetsCurr - 4800).toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-green-600">
                                    <p className="text-xs text-gray-500 uppercase">Índice de Liquidez</p>
                                    <p className="text-lg font-bold text-gray-800">{(balanceCalculations.totalCurrentAssetsCurr / 4800).toFixed(2)}</p>
                                </div>
                            </div>

                            {/* Asset Composition Chart */}
                            <div className="bg-white p-6 rounded-xl shadow-md flex flex-col items-center">
                                <h4 className="text-md font-bold text-gray-700 mb-4 self-start">Composição de Ativos ({balanceSheetData.years[1]})</h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={balanceCalculations.assetsCompositionData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                paddingAngle={2}
                                                dataKey="value"
                                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                            >
                                                {balanceCalculations.assetsCompositionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="text-center mt-2">
                                    <p className="text-3xl font-bold text-blue-900">R$ {balanceCalculations.totalAssetsCurr.toLocaleString('pt-BR')}</p>
                                    <p className="text-xs text-gray-500">Total de Ativos</p>
                                </div>
                            </div>

                            {/* Growth Chart */}
                             <div className="bg-white p-6 rounded-xl shadow-md">
                                <h4 className="text-md font-bold text-gray-700 mb-4">Crescimento Patrimonial</h4>
                                <div className="h-60">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={balanceCalculations.equityGrowthData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={40} />
                                            <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                                            <Legend />
                                            <Bar dataKey="equity" name="Patrimônio Líquido" fill="#22c55e" barSize={20} radius={[0, 4, 4, 0]} />
                                            <Bar dataKey="assets" name="Total Ativos" fill="#1e40af" barSize={20} radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* --- RATES TAB (Card Fees) --- */}
            {activeTab === 'rates' && (
                 <div className="space-y-6 animate-fade-in">
                     <div className="bg-white p-6 rounded-xl shadow-md">
                         <h3 className="text-2xl font-bold text-gray-800 mb-6">Taxas de Cartão e Meios de Pagamento</h3>
                         <p className="text-gray-500 mb-8">Configure aqui as taxas que serão descontadas automaticamente nos orçamentos quando o pagamento for via cartão.</p>
                         
                         <div className="max-w-md">
                             <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                                 <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                                            <Icon className="w-8 h-8"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></Icon>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-lg">Taxa da Maquininha</h4>
                                            <p className="text-xs text-gray-500">Desconto automático em vendas no crédito/débito</p>
                                        </div>
                                    </div>
                                 </div>
                                 
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Taxa Atual (%)</label>
                                     <div className="relative rounded-md shadow-sm">
                                        <input
                                            type="number"
                                            value={currentCardRate}
                                            onChange={(e) => handleCardRateUpdate(parseFloat(e.target.value))}
                                            className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-4 pr-12 py-3 sm:text-lg font-bold border-gray-300 rounded-md bg-white text-gray-900"
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                        />
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-lg font-bold">%</span>
                                        </div>
                                     </div>
                                     <p className="text-xs text-gray-500 mt-2">
                                         Ex: Se o orçamento for R$ 1.000,00, será descontado R$ {(1000 * (currentCardRate/100)).toFixed(2)} no cálculo de lucro.
                                     </p>
                                 </div>
                             </div>
                         </div>
                     </div>
                 </div>
            )}


            {/* --- SETTINGS TAB (Original Content) --- */}
            {activeTab === 'settings' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Fixed Expenses */}
                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold text-gray-800">Despesas Fixas Mensais</h3>
                                <button onClick={() => setIsFixedModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-primary-100 text-primary-700 text-sm font-semibold rounded-lg hover:bg-primary-200">
                                    <Icon className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                                    Nova Despesa Fixa
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                   {/* ... table content for fixed expenses */}
                                    <tbody>
                                        {fixedExpenses.map(exp => (
                                            <tr key={exp.id} className="border-b">
                                                <td className="py-2 pr-2">{exp.name} <span className="text-xs text-gray-500">({exp.category})</span></td>
                                                <td className="py-2 pl-2 text-right font-semibold">R$ {exp.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2">
                                            <td className="py-2 pr-2 font-bold">Total</td>
                                            <td className="py-2 pl-2 text-right font-bold text-lg">R$ {totalFixedExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        {/* Variable Expenses */}
                        <div className="bg-white p-6 rounded-xl shadow-md">
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold text-gray-800">Despesas Variáveis (Custos de Venda)</h3>
                                 <button onClick={() => setIsVariableModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-primary-100 text-primary-700 text-sm font-semibold rounded-lg hover:bg-primary-200">
                                     <Icon className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                                    Nova Despesa Variável
                                </button>
                            </div>
                             <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                   {/* ... table content for variable expenses */}
                                     <tbody>
                                        {variableExpenses.map(exp => (
                                            <tr key={exp.id} className="border-b">
                                                <td className="py-2 pr-2">{exp.name}</td>
                                                <td className="py-2 pl-2 text-right font-semibold">
                                                    {exp.type === 'percent' 
                                                        ? `${exp.value.toLocaleString('pt-BR')}%` 
                                                        : `R$ ${exp.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2">
                                            <td className="py-2 pr-2 font-bold">Total (%)</td>
                                            <td className="py-2 pl-2 text-right font-bold text-lg">{totalVariablePercent.toLocaleString('pt-BR')}%</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Markup Calculator */}
                    <div className="bg-white p-6 rounded-xl shadow-md">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Calculadora de Markup</h3>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Meta de Faturamento Mensal</label>
                                <input type="number" value={monthlyRevenueGoal} onChange={e => setMonthlyRevenueGoal(parseFloat(e.target.value))} className="mt-1 w-full p-2 border rounded bg-white text-gray-900 border-gray-300" />
                             </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700">Margem de Lucro Desejada (%)</label>
                                <input type="number" value={desiredProfitMargin} onChange={e => setDesiredProfitMargin(parseFloat(e.target.value))} className="mt-1 w-full p-2 border rounded bg-white text-gray-900 border-gray-300" />
                             </div>
                             <button onClick={handleCalculateMarkup} className="w-full px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700">Calcular Markup</button>
                         </div>
                         {markupMultiplier && (
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-around">
                                <div>
                                    <p className="text-sm text-blue-800">Markup Divisor</p>
                                    <p className="text-2xl font-bold text-blue-900">{markupDivisor?.toFixed(4)}</p>
                                </div>
                                <div className="h-12 border-l border-blue-200"></div>
                                <div>
                                    <p className="text-sm text-green-800">Markup Multiplicador</p>
                                    <p className="text-2xl font-bold text-green-900">{markupMultiplier.toFixed(4)}</p>
                                </div>
                            </div>
                         )}
                    </div>
                    
                    {/* Contribution Margin Analysis */}
                    {markupMultiplier && (
                         <div className="bg-white p-6 rounded-xl shadow-md">
                             <h3 className="text-xl font-semibold text-gray-800 mb-4">Análise de Preço e Margem de Contribuição</h3>
                             <div className="flex items-end gap-4">
                                <div className="flex-grow">
                                    <label className="block text-sm font-medium text-gray-700">Custo da Matéria Prima (R$)</label>
                                    <input type="number" value={cogsInput} onChange={e => setCogsInput(parseFloat(e.target.value))} className="mt-1 w-full p-2 border rounded bg-white text-gray-900 border-gray-300" placeholder="Ex: 100.00" />
                                </div>
                                <p className="text-3xl font-bold text-gray-700 pb-2">=</p>
                                <div className="flex-grow p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm text-green-800 text-center">Preço de Venda Sugerido</p>
                                    <p className="text-2xl font-bold text-green-900 text-center">R$ {suggestedSalePrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                </div>
                             </div>
                             <div className="mt-4 space-y-2 text-sm">
                                <div className="flex justify-between p-2 rounded bg-gray-50"><span>- Custos Variáveis ({totalVariablePercent}%):</span> <span>R$ {variableCostsValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                                <div className="flex justify-between p-2 rounded bg-gray-50"><span>- Custo Matéria Prima:</span> <span>R$ {cogsInput.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                                <div className="flex justify-between p-3 rounded bg-yellow-100 text-yellow-900 font-bold text-base"><span>= MARGEM DE CONTRIBUIÇÃO:</span> <span>R$ {contributionMarginValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})} ({contributionMarginPercent.toFixed(2)}%)</span></div>
                                <p className="text-xs text-gray-500 pt-2 text-center">A Margem de Contribuição é o valor que sobra para pagar as despesas fixas e gerar lucro.</p>
                             </div>
                         </div>
                    )}
                </div>
            )}


            {/* Modal for Fixed Expense */}
            {isFixedModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Nova Despesa Fixa</h3>
                        <form onSubmit={handleAddFixedExpense} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome da Despesa</label>
                                <input
                                    type="text"
                                    value={newFixedExpense.name}
                                    onChange={e => setNewFixedExpense({ ...newFixedExpense, name: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Valor (R$)</label>
                                    <input
                                        type="number"
                                        value={newFixedExpense.amount}
                                        onChange={e => setNewFixedExpense({ ...newFixedExpense, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                        required
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Categoria</label>
                                    <select
                                        value={newFixedExpense.category}
                                        onChange={e => setNewFixedExpense({ ...newFixedExpense, category: e.target.value as FixedExpense['category'] })}
                                        className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                    >
                                        <option value="Funcionários">Funcionários</option>
                                        <option value="Estrutura">Estrutura</option>
                                        <option value="Impostos">Impostos</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-4 pt-4">
                                <button type="button" onClick={() => setIsFixedModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar Despesa</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Modal for Variable Expense */}
            {isVariableModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Nova Despesa Variável</h3>
                        <form onSubmit={handleAddVariableExpense} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome da Despesa</label>
                                <input
                                    type="text"
                                    value={newVariableExpense.name}
                                    onChange={e => setNewVariableExpense({ ...newVariableExpense, name: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Tipo</label>
                                    <select
                                        value={newVariableExpense.type}
                                        onChange={e => setNewVariableExpense({ ...newVariableExpense, type: e.target.value as 'percent' | 'fixed' })}
                                        className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                    >
                                        <option value="percent">% (Percentual)</option>
                                        <option value="fixed">R$ (Valor Fixo)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Valor</label>
                                    <input
                                        type="number"
                                        value={newVariableExpense.value}
                                        onChange={e => setNewVariableExpense({ ...newVariableExpense, value: parseFloat(e.target.value) || 0 })}
                                        className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300"
                                        required
                                        step="0.01"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-4 pt-4">
                                <button type="button" onClick={() => setIsVariableModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar Despesa</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Financials;