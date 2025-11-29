import React, { useState, useMemo } from 'react';
import { Sale, Quote, Client, CashFlowEntry } from '../types';
import { Icon } from './icons/Icon';

interface SalesProps {
  sales: Sale[];
  quotes: Quote[];
  clients: Client[];
  cashFlow: CashFlowEntry[];
}

type SaleStatusFilter = 'Todos' | 'Aprovado' | 'Concluído' | 'Pendente' | 'Cancelado';

const Sales: React.FC<SalesProps> = ({ sales, quotes, clients, cashFlow }) => {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'financial'>('details');
  const [filterStatus, setFilterStatus] = useState<SaleStatusFilter>('Todos');

  const getQuote = (quoteId: string) => quotes.find(q => q.id === quoteId);
  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  // Helper to calculate financial status for a sale
  const getFinancialInfo = (sale: Sale) => {
    const payments = cashFlow.filter(entry => 
      entry.type === 'income' && 
      entry.description.toLowerCase().includes(sale.customerName.toLowerCase()) &&
      entry.date >= sale.saleDate 
    );
    
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const effectivePaid = Math.min(totalPaid, sale.amount); 
    const remaining = sale.amount - effectivePaid;
    const percentage = sale.amount > 0 ? (effectivePaid / sale.amount) * 100 : 0;

    return { payments, totalPaid: effectivePaid, remaining, percentage };
  };

  // Determine the status of a sale
  const getSaleStatus = (sale: Sale): SaleStatusFilter => {
      const quote = getQuote(sale.quoteId);
      
      if (quote && quote.status === 'Recusado') return 'Cancelado';
      if (quote && quote.status === 'Pendente') return 'Pendente';

      // If approved, check payment to decide if it's "Concluído" or just "Aprovado" (In Progress)
      const { percentage } = getFinancialInfo(sale);
      if (percentage >= 99.9) return 'Concluído';
      
      return 'Aprovado';
  };

  // Filter logic
  const filteredSales = useMemo(() => {
    if (filterStatus === 'Todos') return sales;
    return sales.filter(sale => getSaleStatus(sale) === filterStatus);
  }, [sales, quotes, cashFlow, filterStatus]);

  // Counts for the cards
  const statusCounts = useMemo(() => {
    const counts = {
        Todos: sales.length,
        Aprovado: 0,
        Concluído: 0,
        Pendente: 0,
        Cancelado: 0
    };
    sales.forEach(sale => {
        const status = getSaleStatus(sale);
        if (counts[status] !== undefined) {
            counts[status]++;
        }
    });
    return counts;
  }, [sales, quotes, cashFlow]);

  const SaleCard: React.FC<{ sale: Sale }> = ({ sale }) => {
    const status = getSaleStatus(sale);
    
    let statusColor = 'text-gray-600 border-gray-200 bg-gray-50';
    let statusLabel: string = status;

    if (status === 'Aprovado') {
        statusColor = 'text-blue-600 border-blue-200 bg-blue-50';
        statusLabel = 'Em Andamento';
    } else if (status === 'Concluído') {
        statusColor = 'text-green-600 border-green-200 bg-green-50';
    } else if (status === 'Pendente') {
        statusColor = 'text-yellow-600 border-yellow-200 bg-yellow-50';
    } else if (status === 'Cancelado') {
        statusColor = 'text-red-600 border-red-200 bg-red-50';
    }

    return (
      <div className="bg-white rounded-lg p-4 shadow-md mb-3 border-l-4 border-primary-500 flex flex-col md:flex-row justify-between items-center hover:bg-gray-50 transition-colors">
        <div className="flex-grow mb-4 md:mb-0">
          <div className="flex items-center gap-2 mb-1">
             <h4 className="text-gray-800 font-bold text-lg">Pedido nº {sale.quoteId.replace(/\D/g, '')} - {sale.saleDate.getFullYear()}</h4>
          </div>
          <p className="text-gray-500 text-sm mb-1">{sale.saleDate.toLocaleDateString('pt-BR')} • {sale.customerName}</p>
          <p className="text-gray-400 text-xs uppercase font-semibold">{sale.salesperson}</p>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="text-right mr-4">
                <span className="block text-green-600 font-bold text-xl">R$ {sale.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${statusColor} bg-opacity-50`}>
                    {statusLabel}
                </span>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => {
                        setSelectedSale(sale);
                        setActiveTab('details');
                    }} 
                    className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                >
                    <Icon className="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                </button>
            </div>
        </div>
      </div>
    );
  };

  // Status Card Component for Filtering
  const StatusCard = ({ status, label, count, colorClass }: { status: SaleStatusFilter, label: string, count: number, colorClass: string }) => (
    <div 
        onClick={() => setFilterStatus(status)}
        className={`cursor-pointer p-4 rounded-xl shadow-sm border transition-all flex flex-col justify-between h-24 ${filterStatus === status ? 'ring-2 ring-offset-2 ring-primary-500 scale-105' : 'hover:scale-105'} ${colorClass}`}
    >
        <p className="text-xs font-bold uppercase opacity-80">{label}</p>
        <p className="text-3xl font-bold">{count}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-2xl font-bold text-gray-800">Painel de Vendas</h3>
      </div>

      {/* Status Filters Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatusCard 
            status="Todos" 
            label="Todos" 
            count={statusCounts.Todos} 
            colorClass="bg-white text-gray-700 border-gray-200" 
          />
          <StatusCard 
            status="Aprovado" 
            label="Em Aberto" 
            count={statusCounts.Aprovado} 
            colorClass="bg-blue-50 text-blue-700 border-blue-200" 
          />
           <StatusCard 
            status="Pendente" 
            label="Pendente Aprovação" 
            count={statusCounts.Pendente} 
            colorClass="bg-yellow-50 text-yellow-700 border-yellow-200" 
          />
          <StatusCard 
            status="Concluído" 
            label="Entregue / Pago" 
            count={statusCounts.Concluído} 
            colorClass="bg-green-50 text-green-700 border-green-200" 
          />
          <StatusCard 
            status="Cancelado" 
            label="Cancelado" 
            count={statusCounts.Cancelado} 
            colorClass="bg-red-50 text-red-700 border-red-200" 
          />
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {filteredSales.length > 0 ? (
            filteredSales.map(sale => (
            <SaleCard key={sale.id} sale={sale} />
            ))
        ) : (
            <div className="text-center py-16 text-gray-400 bg-gray-50 border border-gray-200 rounded-xl border-dashed">
                <Icon className="mx-auto h-12 w-12 text-gray-300 mb-2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></Icon>
                <p>Nenhum pedido encontrado com o status "{filterStatus}".</p>
            </div>
        )}
      </div>

      {/* Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800">Pedido nº {selectedSale.quoteId.replace(/\D/g, '')}</h3>
                        <p className="text-gray-500 text-sm">{selectedSale.customerName}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-green-600 font-bold text-xl">R$ {selectedSale.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary-600 text-primary-600 bg-primary-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        Detalhes do Pedido
                    </button>
                    <button 
                        onClick={() => setActiveTab('financial')}
                        className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeTab === 'financial' ? 'border-primary-600 text-primary-600 bg-primary-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        Histórico Financeiro
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                    {activeTab === 'details' && (() => {
                        const quote = getQuote(selectedSale.quoteId);
                        const client = quote ? getClient(quote.clientId) : null;
                        const deliveryDate = new Date(selectedSale.saleDate);
                        deliveryDate.setDate(deliveryDate.getDate() + 15); // Simulate 15 days delivery
                        
                        const today = new Date();
                        const diffTime = deliveryDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        let countdownLabel = '';
                        let countdownColor = '';

                        if (diffDays > 0) {
                            countdownLabel = `Faltam ${diffDays} dias`;
                            countdownColor = diffDays <= 3 ? 'text-yellow-600' : 'text-blue-600';
                        } else if (diffDays === 0) {
                            countdownLabel = 'Entrega Hoje!';
                            countdownColor = 'text-green-600 font-bold';
                        } else {
                            countdownLabel = `Atrasado há ${Math.abs(diffDays)} dias`;
                            countdownColor = 'text-red-600 font-bold';
                        }

                        return (
                            <div className="space-y-6">
                                {/* Client & Delivery Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                        <h4 className="text-gray-500 text-sm font-bold uppercase mb-3 flex items-center gap-2">
                                            <Icon className="w-4 h-4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></Icon>
                                            Cliente
                                        </h4>
                                        <p className="text-lg font-semibold text-gray-800">{selectedSale.customerName}</p>
                                        <p className="text-gray-500 text-sm mt-1">{client?.phone || 'Telefone não informado'}</p>
                                        <p className="text-gray-500 text-sm">{client?.address?.city} - {client?.address?.state}</p>
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                             <p className="text-sm text-gray-400"><span className="font-semibold">Endereço de Entrega:</span></p>
                                             <p className="text-sm text-gray-600">
                                                {client?.address?.street}, {client?.address?.number} - {client?.address?.neighborhood}
                                             </p>
                                             <p className="text-sm text-gray-500">{client?.address?.referencePoint}</p>
                                        </div>
                                    </div>

                                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                        <h4 className="text-gray-500 text-sm font-bold uppercase mb-3 flex items-center gap-2">
                                            <Icon className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></Icon>
                                            Detalhes da Entrega
                                        </h4>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-500 text-sm">Data do Pedido:</span>
                                            <span className="font-medium text-gray-800">{selectedSale.saleDate.toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className="flex justify-between mb-2 items-start">
                                            <span className="text-gray-500 text-sm pt-1">Previsão de Entrega:</span>
                                            <div className="text-right">
                                                <span className="font-medium block text-gray-800">{deliveryDate.toLocaleDateString('pt-BR')}</span>
                                                <span className={`text-xs ${countdownColor}`}>{countdownLabel}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-500 text-sm">Forma de Pagamento:</span>
                                            <span className="font-medium text-gray-800">{quote?.paymentMethod || 'N/A'}</span>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-gray-100">
                                            <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-gray-300">
                                                 <Icon className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></Icon>
                                                 Gerar Documento PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Products List */}
                                <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                                     <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 font-bold text-sm uppercase tracking-wide text-gray-600">
                                        Produtos
                                     </div>
                                     <div className="p-4">
                                         {quote?.items.map((item, idx) => (
                                             <div key={idx} className="flex justify-between items-center border-b border-gray-100 last:border-0 py-3 first:pt-0 last:pb-0">
                                                 <div className="flex items-center gap-3">
                                                     <div className="bg-gray-200 w-10 h-10 rounded flex items-center justify-center text-gray-600 font-bold">
                                                         {item.quantity}x
                                                     </div>
                                                     <div>
                                                         <p className="font-medium text-gray-800">{item.productName}</p>
                                                         <p className="text-sm text-gray-500">{item.description || `${item.width}x${item.height}mm - ${item.selectedColor}`}</p>
                                                     </div>
                                                 </div>
                                                 <p className="font-bold text-gray-900">R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                             </div>
                                         ))}
                                     </div>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'financial' && (() => {
                        const { payments, totalPaid, remaining, percentage } = getFinancialInfo(selectedSale);

                        return (
                            <div className="space-y-6">
                                {/* Financial Summary */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-gray-500 font-medium">Resumo Financeiro</span>
                                        <span className="text-gray-800 font-bold text-lg">{percentage.toFixed(0)}% Pago</span>
                                    </div>
                                    
                                    {/* Progress Bar */}
                                    <div className="w-full bg-gray-200 rounded-full h-4 mb-4 relative overflow-hidden">
                                        <div 
                                            className="bg-blue-500 h-4 rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>

                                    <div className="flex justify-between mt-2">
                                        <div>
                                            <p className="text-sm text-gray-500">Recebido</p>
                                            <p className="text-xl font-bold text-green-600">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-500">Pendente</p>
                                            <p className="text-xl font-bold text-red-600">R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Transaction History */}
                                <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                                    <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 font-bold text-sm uppercase tracking-wide flex justify-between items-center text-gray-600">
                                        <span>Histórico de Pagamentos (Caixa)</span>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {payments.length > 0 ? payments.map(payment => (
                                            <div key={payment.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-green-100 p-2 rounded-full text-green-600">
                                                        <Icon className="w-5 h-5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></Icon>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-800">{payment.description}</p>
                                                        <p className="text-sm text-gray-500">{payment.date.toLocaleDateString('pt-BR')} • {payment.subcategory}</p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-green-600">+ R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : (
                                            <div className="p-8 text-center text-gray-500">
                                                Nenhum pagamento registrado para este cliente após a data do pedido.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
                    <button 
                        onClick={() => setSelectedSale(null)}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors font-medium"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Sales;