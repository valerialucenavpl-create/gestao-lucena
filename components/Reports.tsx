import React, { useState } from 'react';
import { Sale, Quote, CashFlowEntry, InventoryItem } from '../types';
import { Icon } from './icons/Icon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FINANCIAL_DATA } from '../constants';


type ReportType = '' | 'sales_by_period' | 'sales_by_salesperson' | 'product_performance' | 'cash_flow' | 'stock_levels' | 'material_performance';

interface ReportsProps {
    quotes: Quote[];
    sales: Sale[];
    cashFlow: CashFlowEntry[];
    rawMaterials: InventoryItem[];
}

const Reports: React.FC<ReportsProps> = ({ quotes, sales, cashFlow, rawMaterials }) => {
    const [reportType, setReportType] = useState<ReportType>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState<any[] | null>(null);
    const [reportTitle, setReportTitle] = useState('');
    const [reportHeaders, setReportHeaders] = useState<string[]>([]);
    
    const formatDate = (date: Date) => date.toLocaleDateString('pt-BR');
    const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handleGenerateReport = () => {
        let data: any[] = [];
        let title = '';
        let headers: string[] = [];

        const sDate = startDate ? new Date(startDate + 'T00:00:00') : null;
        const eDate = endDate ? new Date(endDate + 'T23:59:59') : null;

        switch (reportType) {
            case 'sales_by_period':
                title = 'Relatório de Vendas por Período';
                headers = ['ID da Venda', 'Cliente', 'Vendedor', 'Data', 'Valor'];
                data = sales
                    .filter(sale => {
                        const saleDate = sale.saleDate;
                        if (sDate && eDate) return saleDate >= sDate && saleDate <= eDate;
                        if (sDate) return saleDate >= sDate;
                        if (eDate) return saleDate <= eDate;
                        return true;
                    })
                    .map(sale => ({
                        'ID da Venda': sale.id,
                        'Cliente': sale.customerName,
                        'Vendedor': sale.salesperson,
                        'Data': formatDate(sale.saleDate),
                        'Valor': formatCurrency(sale.amount),
                    }));
                break;
            
            case 'sales_by_salesperson':
                title = 'Relatório de Vendas por Vendedor';
                headers = ['Vendedor', 'Total de Vendas', 'Valor Total Vendido'];
                const salesByPerson: { [key: string]: { count: number, total: number } } = {};
                sales
                    .filter(sale => {
                        const saleDate = sale.saleDate;
                        if (sDate && eDate) return saleDate >= sDate && saleDate <= eDate;
                        return true;
                    })
                    .forEach(sale => {
                        if (!salesByPerson[sale.salesperson]) {
                            salesByPerson[sale.salesperson] = { count: 0, total: 0 };
                        }
                        salesByPerson[sale.salesperson].count++;
                        salesByPerson[sale.salesperson].total += sale.amount;
                    });
                data = Object.entries(salesByPerson).map(([person, values]) => ({
                    'Vendedor': person,
                    'Total de Vendas': values.count,
                    'Valor Total Vendido': formatCurrency(values.total),
                }));
                break;

            case 'product_performance':
                 title = 'Relatório de Desempenho de Produtos';
                 headers = ['Produto', 'Unidades Vendidas', 'Receita Total', 'Custo Total', 'Lucro Total', 'Margem Média (%)'];
                 const perfByProduct: { [key: string]: { units: number, revenue: number, cost: number } } = {};
                 sales
                    .filter(sale => {
                        const saleDate = sale.saleDate;
                        if (sDate && eDate) return saleDate >= sDate && saleDate <= eDate;
                        return true;
                    })
                    .forEach(sale => {
                        const quote = quotes.find(q => q.id === sale.quoteId);
                        if(quote && quote.items) {
                            // FIX: Correctly reference productName from QuoteItem and implement more accurate revenue/cost calculation.
                            quote.items.forEach(item => {
                                const productName = item.productName;
                                if (!perfByProduct[productName]) {
                                    perfByProduct[productName] = { units: 0, revenue: 0, cost: 0 };
                                }
                                // More accurate calculation using item data, distributing discount proportionally
                                const itemRevenue = quote.subtotal > 0 ? (item.price / quote.subtotal) * sale.amount : 0;
                                const itemCost = item.cost;
                                perfByProduct[productName].units += item.quantity;
                                perfByProduct[productName].revenue += itemRevenue;
                                perfByProduct[productName].cost += itemCost;
                            });
                        }
                    });
                
                const dataWithProfit = Object.entries(perfByProduct).map(([product, values]) => {
                    const profit = values.revenue - values.cost;
                    return { product, values, profit };
                })

                data = dataWithProfit
                .sort((a, b) => b.profit - a.profit)
                .map(({ product, values, profit }) => {
                    const margin = values.revenue > 0 ? (profit / values.revenue) * 100 : 0;
                    return {
                        'Produto': product,
                        'Unidades Vendidas': values.units,
                        'Receita Total': formatCurrency(values.revenue),
                        'Custo Total': formatCurrency(values.cost),
                        'Lucro Total': formatCurrency(profit),
                        'Margem Média (%)': `${margin.toFixed(2)}%`,
                    };
                });
                break;
            
            case 'cash_flow':
                title = 'Relatório de Fluxo de Caixa';
                headers = ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Entrada', 'Saída', 'Saldo'];
                let balance = 0;
                data = cashFlow
                    .filter(item => {
                        const itemDate = item.date;
                        if (sDate && eDate) return itemDate >= sDate && itemDate <= eDate;
                        return true;
                    })
                    .sort((a,b) => a.date.getTime() - b.date.getTime())
                    .map(item => {
                        const credit = item.type === 'income' ? item.amount : 0;
                        const debit = item.type === 'expense' ? item.amount : 0;
                        balance += credit - debit;
                        return {
                            'Data': formatDate(item.date),
                            'Descrição': item.description,
                            'Categoria': item.category,
                            'Subcategoria': item.subcategory,
                            'Entrada': credit ? formatCurrency(credit) : '-',
                            'Saída': debit ? formatCurrency(debit) : '-',
                            'Saldo': formatCurrency(balance),
                        }
                    });
                break;
            
            case 'stock_levels':
                title = 'Relatório de Níveis de Estoque';
                headers = ['Material', 'Categoria de Uso', 'Estoque', 'Unidade', 'Custo Unitário', 'Valor em Estoque'];
                // FIX: The 'cost' property does not exist directly on InventoryItem.
                // It's within the 'colorVariants' array. We'll use the cost of the first variant as a representative cost.
                data = rawMaterials.map(item => {
                    const representativeCost = item.colorVariants[0]?.cost ?? 0;
                    return {
                        'Material': item.name,
                        'Categoria de Uso': item.usageCategory,
                        'Estoque': item.stockQuantity,
                        'Unidade': item.unit,
                        'Custo Unitário': formatCurrency(representativeCost),
                        'Valor em Estoque': formatCurrency(item.stockQuantity * representativeCost)
                    };
                });
                break;
            
            case 'material_performance':
                title = 'Relatório de Desempenho de Materiais';
                headers = ['Material', 'Estoque Total', 'Custo Unitário Médio', 'Valor Total em Estoque'];
                data = rawMaterials.map(item => {
                    const averageCost = item.colorVariants.length > 0
                        ? item.colorVariants.reduce((sum, variant) => sum + variant.cost, 0) / item.colorVariants.length
                        : 0;
                    return {
                        'Material': item.name,
                        'Estoque Total': `${item.stockQuantity} ${item.unit}`,
                        'Custo Unitário Médio': formatCurrency(averageCost),
                        'Valor Total em Estoque': formatCurrency(item.stockQuantity * averageCost),
                    };
                });
                break;
        }

        setReportData(data);
        setReportTitle(title);
        setReportHeaders(headers);
    };

    const downloadCSV = () => {
        if (!reportData || !reportHeaders) return;
        const csvContent = [
            reportHeaders.join(','),
            ...reportData.map(row => 
                reportHeaders.map(header => {
                    let field = row[header] ?? '';
                    // Clean up field for CSV (remove R$, dots for thousands, use comma for decimal, and quote if necessary)
                    field = typeof field === 'string' 
                        ? `"${field.replace(/"/g, '""')}"` 
                        : field;
                    return field;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const fileName = `${reportTitle.toLowerCase().replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    const requiresDateFilter = ['sales_by_period', 'sales_by_salesperson', 'product_performance', 'cash_flow'].includes(reportType);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Desempenho Financeiro (Últimos 6 Meses)</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                    <BarChart
                        data={FINANCIAL_DATA}
                        margin={{
                        top: 5, right: 30, left: 20, bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(value) => `R$${Number(value) / 1000}k`} />
                        <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`} />
                        <Legend />
                        <Bar dataKey="income" fill="#22c55e" name="Receita" />
                        <Bar dataKey="expenses" fill="#ef4444" name="Despesas" />
                    </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Gerador de Relatórios Detalhados</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-1">
                        <label htmlFor="reportType" className="block text-sm font-medium text-gray-700">Tipo de Relatório</label>
                        <select id="reportType" value={reportType} onChange={e => setReportType(e.target.value as ReportType)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                            <option value="">Selecione um relatório</option>
                            <option value="sales_by_period">Vendas por Período</option>
                            <option value="sales_by_salesperson">Vendas por Vendedor</option>
                            <option value="product_performance">Desempenho de Produtos</option>
                            <option value="cash_flow">Fluxo de Caixa</option>
                            <option value="stock_levels">Níveis de Estoque</option>
                            <option value="material_performance">Desempenho de Materiais</option>
                        </select>
                    </div>
                    {requiresDateFilter && (
                         <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Data de Início</label>
                                <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
                            </div>
                            <div>
                                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Data de Fim</label>
                                <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-4">
                     <button onClick={handleGenerateReport} disabled={!reportType} className="w-full md:w-auto px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Gerar Relatório
                    </button>
                </div>
            </div>

            {reportData && (
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-gray-800">{reportTitle}</h3>
                        <div className="flex gap-2">
                             <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-green-700">
                                <Icon className="w-4 h-4"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></Icon>
                                Exportar CSV
                            </button>
                             <button onClick={() => alert('Exportação para PDF é uma funcionalidade em desenvolvimento.')} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-700">
                                <Icon className="w-4 h-4"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></Icon>
                                Exportar PDF
                            </button>
                        </div>
                    </div>
                    {reportData.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        {reportHeaders.map(header => <th key={header} scope="col" className="px-6 py-3">{header}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.map((row, index) => (
                                        <tr key={index} className="bg-white border-b hover:bg-gray-50">
                                            {reportHeaders.map(header => <td key={`${index}-${header}`} className="px-6 py-4 whitespace-nowrap">{row[header]}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-4">Nenhum dado encontrado para os filtros selecionados.</p>
                    )}
                 </div>
            )}

            {!reportData && reportType && (
                 <div className="bg-white p-6 rounded-xl shadow-md text-center">
                    <Icon className="mx-auto h-12 w-12 text-gray-400"><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1V4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-2.1V3.6c0-.4-.2-.8-.5-1.1-.3-.3-.7-.5-1.1-.5zM12 15c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z"/><path d="M6 22V8h12v14z"/></Icon>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum relatório gerado</h3>
                    <p className="mt-1 text-sm text-gray-500">Clique em "Gerar Relatório" para ver os dados.</p>
                </div>
            )}
        </div>
    );
};

export default Reports;