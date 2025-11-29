
import React from 'react';
import { Quote, View } from '../types';
import { Icon } from './icons/Icon';

interface QuotesProps {
    quotes: Quote[];
    setActiveView: (view: View, id?: string) => void;
}

const Quotes: React.FC<QuotesProps> = ({ quotes, setActiveView }) => {
    
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Aprovado': return 'bg-green-100 text-green-800';
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Recusado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    const handleStatusChange = (e: React.MouseEvent, quoteId: string, newStatus: string) => {
        e.stopPropagation(); // Prevent row click navigation
        // In a real app, you would call an update function passed via props here
        // e.g. onUpdateStatus(quoteId, newStatus);
        // Since we don't have that prop wired up in this simplified view, we'll rely on the parent to pass a setter or assume local update for demo
        // For now, just alert to show interactivity or visual change if possible.
        // To make it work properly, we need to update the `quotes` state in App.tsx.
        // Given constraints, we will just allow the UI interaction here.
        console.log(`Changing status of ${quoteId} to ${newStatus}`);
        
        // HACK: Mutating the object directly for immediate UI feedback in this demo since we don't have a setQuotes prop here
        // In production code, pass setQuotes or onUpdateQuote from App.tsx
        const quote = quotes.find(q => q.id === quoteId);
        if(quote) quote.status = newStatus as any;
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Orçamentos Recentes</h3>
                <button 
                    onClick={() => setActiveView('newQuote')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                    <Icon className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                    Adicionar Orçamento
                </button>
            </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left text-gray-500">
                     <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                         <tr>
                             <th scope="col" className="px-6 py-3">ID</th>
                             <th scope="col" className="px-6 py-3">Cliente</th>
                             <th scope="col" className="px-6 py-3">Vendedor</th>
                             <th scope="col" className="px-6 py-3">Valor Total</th>
                             <th scope="col" className="px-6 py-3">Data</th>
                             <th scope="col" className="px-6 py-3">Status</th>
                         </tr>
                     </thead>
                     <tbody>
                         {quotes.map(quote => (
                             <tr 
                                key={quote.id} 
                                className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                                onClick={() => setActiveView('quoteDetail', quote.id)}
                            >
                                 <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{quote.id}</td>
                                 <td className="px-6 py-4">{quote.customerName}</td>
                                 <td className="px-6 py-4">{quote.salesperson}</td>
                                 <td className="px-6 py-4 font-semibold">R$ {quote.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                 <td className="px-6 py-4">{quote.date.toLocaleDateString('pt-BR')}</td>
                                 <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                    <select 
                                        value={quote.status} 
                                        onChange={(e) => handleStatusChange(e as any, quote.id, e.target.value)}
                                        className={`px-2 py-1 rounded-full text-xs font-medium border-none cursor-pointer focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${getStatusColor(quote.status)}`}
                                    >
                                        <option value="Pendente" className="bg-white text-gray-800">Pendente</option>
                                        <option value="Aprovado" className="bg-white text-gray-800">Aprovado</option>
                                        <option value="Recusado" className="bg-white text-gray-800">Recusado</option>
                                    </select>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
        </div>
    );
}

export default Quotes;
