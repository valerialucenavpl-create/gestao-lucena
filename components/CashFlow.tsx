
import React, { useState, useEffect, useMemo } from 'react';
import { CashFlowEntry } from '../types';
import { CASH_FLOW_CATEGORIES } from '../constants';
import { Icon } from './icons/Icon';

interface CashFlowProps {
    cashFlowEntries: CashFlowEntry[];
    setCashFlowEntries: React.Dispatch<React.SetStateAction<CashFlowEntry[]>>;
}

const CashFlow: React.FC<CashFlowProps> = ({ cashFlowEntries, setCashFlowEntries }) => {
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [category, setCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');

    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([]);

    useEffect(() => {
        const cats = Object.keys(CASH_FLOW_CATEGORIES[type]);
        setAvailableCategories(cats);
        setCategory(cats[0] || '');
    }, [type]);

    useEffect(() => {
        if (category) {
            const subcats = CASH_FLOW_CATEGORIES[type][category] || [];
            setAvailableSubcategories(subcats);
            setSubcategory(subcats[0] || '');
        } else {
            setAvailableSubcategories([]);
            setSubcategory('');
        }
    }, [category, type]);

    const handleAddEntry = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !description || Number(amount) <= 0 || !category || !subcategory) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        const newEntry: CashFlowEntry = {
            id: `cf${Date.now()}`,
            date: new Date(date + 'T00:00:00'),
            description,
            amount: Number(amount),
            type,
            category,
            subcategory,
        };

        setCashFlowEntries(prevEntries => [newEntry, ...prevEntries].sort((a,b) => b.date.getTime() - a.date.getTime()));

        // Reset form
        setDescription('');
        setAmount('');
    };
    
    const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Calculations for Summary
    const summary = useMemo(() => {
        const totalIncome = cashFlowEntries.filter(e => e.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
        const totalExpense = cashFlowEntries.filter(e => e.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
        const balance = totalIncome - totalExpense;
        return { totalIncome, totalExpense, balance };
    }, [cashFlowEntries]);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-green-500 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase">Total Entradas</p>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalIncome)}</p>
                    </div>
                    <div className="p-2 bg-green-100 rounded-full text-green-600">
                        <Icon className="w-8 h-8"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></Icon>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-red-500 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase">Total Saídas</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalExpense)}</p>
                    </div>
                    <div className="p-2 bg-red-100 rounded-full text-red-600">
                        <Icon className="w-8 h-8"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></Icon>
                    </div>
                </div>
                <div className={`bg-white p-4 rounded-xl shadow-md border-l-4 flex justify-between items-center ${summary.balance >= 0 ? 'border-blue-500' : 'border-red-500'}`}>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase">Saldo em Caixa</p>
                        <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                            {formatCurrency(summary.balance)}
                        </p>
                    </div>
                    <div className={`p-2 rounded-full ${summary.balance >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                         <Icon className="w-8 h-8"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></Icon>
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Novo Lançamento no Caixa</h3>
                <form onSubmit={handleAddEntry} className="space-y-4">
                    {/* Type and Date */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Tipo de Lançamento</label>
                            <div className="mt-1 flex rounded-md shadow-sm">
                                <button type="button" onClick={() => setType('income')} className={`flex-1 px-4 py-2 text-sm font-medium border ${type === 'income' ? 'bg-primary-600 text-white border-primary-600 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'} rounded-l-md`}>
                                    Entrada
                                </button>
                                <button type="button" onClick={() => setType('expense')} className={`flex-1 px-4 py-2 text-sm font-medium border -ml-px ${type === 'expense' ? 'bg-red-600 text-white border-red-600 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'} rounded-r-md`}>
                                    Saída
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-gray-700">Data</label>
                            <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" required />
                        </div>
                        <div>
                            <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Valor</label>
                            <input type="number" id="amount" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} min="0.01" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" placeholder="0,00" required />
                        </div>
                    </div>

                    {/* Description and Categories */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Descrição</label>
                            <input type="text" id="description" value={description} onChange={e => setDescription(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" required />
                        </div>
                        <div>
                            <label htmlFor="category" className="block text-sm font-medium text-gray-700">Categoria</label>
                            <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                                {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700">Subcategoria</label>
                            <select id="subcategory" value={subcategory} onChange={e => setSubcategory(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" disabled={!category}>
                                {availableSubcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-2 flex justify-end">
                         <button type="submit" className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                            Adicionar Lançamento
                        </button>
                    </div>

                </form>
            </div>

            {/* History Table */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Histórico do Caixa</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Data</th>
                                <th scope="col" className="px-6 py-3">Descrição</th>
                                <th scope="col" className="px-6 py-3">Categoria</th>
                                <th scope="col" className="px-6 py-3 text-right">Entrada</th>
                                <th scope="col" className="px-6 py-3 text-right">Saída</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashFlowEntries.map(entry => (
                                <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4">{entry.date.toLocaleDateString('pt-BR')}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{entry.description}</td>
                                    <td className="px-6 py-4 text-xs">
                                        <span className="font-semibold">{entry.category}</span>
                                        <br/>
                                        <span className="text-gray-500">{entry.subcategory}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-semibold text-green-600">
                                        {entry.type === 'income' ? formatCurrency(entry.amount) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-semibold text-red-600">
                                        {entry.type === 'expense' ? formatCurrency(entry.amount) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CashFlow;
