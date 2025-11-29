import React, { useMemo } from 'react';
import { Icon } from './icons/Icon';
import { FINANCIAL_DATA, QUOTES_DATA, SALES_DATA, USERS_DATA, DAILY_QUOTES } from '../constants';
import { View, User } from '../types';

interface DashboardCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, icon, color, onClick }) => (
  <div onClick={onClick} className={`bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition-transform transform hover:scale-105 ${onClick ? 'cursor-pointer' : ''}`}>
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
    <div className={`p-3 rounded-full ${color}`}>
      {icon}
    </div>
  </div>
);

interface DashboardProps {
    setActiveView: (view: View) => void;
    currentUser: User;
}

const Dashboard: React.FC<DashboardProps> = ({setActiveView, currentUser}) => {

  const totalIncome = FINANCIAL_DATA.reduce((sum, item) => sum + item.income, 0);
  const pendingQuotes = QUOTES_DATA.filter(q => q.status === 'Pendente').length;
  const totalSalesCount = SALES_DATA.length;

  // Daily Quote Logic
  const dailyQuote = useMemo(() => {
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const quoteIndex = dayOfYear % DAILY_QUOTES.length;
    return DAILY_QUOTES[quoteIndex];
  }, []);

  // Goal Calculations
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Filter sales for current month
  const currentMonthSales = SALES_DATA.filter(sale => 
    sale.saleDate.getMonth() === currentMonth && sale.saleDate.getFullYear() === currentYear
  );

  // Aggregate sales by person
  const salesByPerson: { [key: string]: number } = {};
  let totalSalesAmountCurrentMonth = 0;

  currentMonthSales.forEach(sale => {
    salesByPerson[sale.salesperson] = (salesByPerson[sale.salesperson] || 0) + sale.amount;
    totalSalesAmountCurrentMonth += sale.amount;
  });

  // Filter users who have goals
  const usersWithGoals = USERS_DATA.filter(user => user.monthlyGoal && user.monthlyGoal > 0);
  
  const totalGoal = usersWithGoals.reduce((sum, user) => sum + (user.monthlyGoal || 0), 0);
  const totalProgressPercent = totalGoal > 0 ? Math.min((totalSalesAmountCurrentMonth / totalGoal) * 100, 100) : 0;
  const totalRemaining = Math.max(totalGoal - totalSalesAmountCurrentMonth, 0);

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Logic to filter displayed goals based on user role
  const displayableUsersWithGoals = currentUser.role === 'Sales' 
    ? usersWithGoals.filter(user => user.id === currentUser.id)
    : usersWithGoals;

  return (
    <div className="space-y-6">
      {/* Daily Motivational Quote */}
      <div className="bg-gradient-to-r from-primary-800 to-primary-600 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-200 mb-2 flex items-center gap-2">
                <Icon className="w-4 h-4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></Icon>
                Mensagem do Dia
            </h3>
            <p className="text-xl font-serif italic leading-relaxed">"{dailyQuote.text}"</p>
            <p className="text-sm mt-2 text-primary-100 font-semibold">— {dailyQuote.author}</p>
        </div>
        <div className="hidden md:block opacity-80">
             <Icon className="w-24 h-24 text-white"><path d="M8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0z" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></Icon>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Faturamento (semestre)"
          value={`R$ ${totalIncome.toLocaleString('pt-BR')}`}
          icon={<Icon className="text-white"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Icon>}
          color="bg-green-500"
          onClick={() => setActiveView('financials')}
        />
        <DashboardCard
          title="Orçamentos Pendentes"
          value={pendingQuotes.toString()}
          icon={<Icon className="text-white"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></Icon>}
          color="bg-yellow-500"
          onClick={() => setActiveView('quotes')}
        />
        <DashboardCard
          title="Vendas Realizadas"
          value={totalSalesCount.toString()}
          icon={<Icon className="text-white"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></Icon>}
          color="bg-blue-500"
          onClick={() => setActiveView('sales')}
        />
        <DashboardCard
          title="Ajuda Rápida"
          value="Assistente IA"
          icon={<Icon className="text-white"><path d="M12 8V4H8" /><rect x="4" y="12" width="8" height="8" rx="2" /><path d="M8 12v-2a2 2 0 1 1 4 0v2" /><path d="m18 12 2-2 2 2" /><path d="m18 20-2 2-2-2" /></Icon>}
          color="bg-purple-500"
          onClick={() => setActiveView('assistant')}
        />
      </div>

      {/* Sales Goals Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* General Goal Card */}
        <div className="bg-white p-6 rounded-xl shadow-md lg:col-span-1">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Icon className="text-primary-600"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></Icon>
                Meta Geral da Empresa
            </h3>
            <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-40 h-40">
                     <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path
                            className="text-gray-200"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                        />
                        <path
                            className={`${totalProgressPercent >= 100 ? 'text-green-500' : 'text-primary-600'}`}
                            strokeDasharray={`${totalProgressPercent}, 100`}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                        />
                    </svg>
                    <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-gray-800">{totalProgressPercent.toFixed(0)}%</span>
                        <span className="text-xs text-gray-500">Atingido</span>
                    </div>
                </div>
                <div className="mt-6 text-center w-full">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Vendido</span>
                        <span className="font-bold text-gray-800">R$ {formatCurrency(totalSalesAmountCurrentMonth)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                         <span className="text-gray-500">Meta</span>
                         <span className="font-bold text-gray-800">R$ {formatCurrency(totalGoal)}</span>
                    </div>
                     <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-sm font-semibold">
                        Falta: R$ {formatCurrency(totalRemaining)}
                    </div>
                </div>
            </div>
        </div>

        {/* Individual Goals List */}
        <div className="bg-white p-6 rounded-xl shadow-md lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-800">
                    {currentUser.role === 'Sales' ? 'Sua Meta Individual' : 'Metas Individuais - Vendedoras'}
                </h3>
            </div>
            <div className="space-y-6">
                {displayableUsersWithGoals.map(user => {
                    const userSales = salesByPerson[user.name] || 0;
                    const userGoal = user.monthlyGoal || 1;
                    const percent = Math.min((userSales / userGoal) * 100, 100);
                    const remaining = Math.max(userGoal - userSales, 0);
                    const isGoalMet = percent >= 100;

                    return (
                        <div key={user.id} className="border-b pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full bg-gray-100" />
                                    <div>
                                        <p className="font-semibold text-gray-800">{user.name}</p>
                                        <p className="text-xs text-gray-500">{user.role}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-gray-800">R$ {formatCurrency(userSales)}</p>
                                    <p className="text-xs text-gray-500">de R$ {formatCurrency(userGoal)}</p>
                                </div>
                            </div>
                            <div className="relative pt-1">
                                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                                    <div style={{ width: `${percent}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${isGoalMet ? 'bg-green-500' : 'bg-primary-500'}`}></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${isGoalMet ? 'text-green-600 bg-green-200' : 'text-primary-600 bg-primary-200'}`}>
                                        {percent.toFixed(1)}%
                                    </span>
                                    {!isGoalMet && (
                                        <span className="text-xs font-medium text-red-500">
                                            Falta vender: R$ {formatCurrency(remaining)}
                                        </span>
                                    )}
                                     {isGoalMet && (
                                        <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                                            <Icon className="w-3 h-3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon>
                                            Meta Batida!
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
                 {displayableUsersWithGoals.length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                        {currentUser.role === 'Sales' 
                            ? 'Sua meta mensal ainda não foi definida.' 
                            : 'Nenhuma meta configurada para os usuários.'}
                    </p>
                )}
            </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Bem-vindo(a) ao seu Painel de Gestão!</h2>
        <p className="text-gray-600">
          Aqui você tem uma visão geral do seu negócio. Navegue pelas seções no menu à esquerda para criar orçamentos, registrar vendas, controlar seu estoque e analisar suas finanças. Precisa de uma dica? Converse com nosso <button onClick={() => setActiveView('assistant')} className="text-primary-600 font-semibold hover:underline">Assistente IA</button>.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;