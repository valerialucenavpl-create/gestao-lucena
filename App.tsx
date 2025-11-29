import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Quotes from './components/Quotes';
import Sales from './components/Sales';
import Inventory from './components/Inventory';
import Products from './components/Products';
import Financials from './components/Financials';
import Assistant from './components/Assistant';
import Reports from './components/Reports';
import CashFlow from './components/CashFlow';
import NewQuote from './components/NewQuote';
import Clients from './components/Clients';
import Settings from './components/Settings';
import AccessDenied from './components/AccessDenied';
import QuoteDetail from './components/QuoteDetail';
import Login from './components/Login';

import { User, UserRole, View, Quote, Client, Sale, CashFlowEntry, InventoryItem, Product, FixedExpense, VariableExpense, CompanySettings } from './types';
import { USERS_DATA, CLIENTS_DATA, QUOTES_DATA, SALES_DATA, CASH_FLOW_DATA, RAW_MATERIALS_DATA, PRODUCTS_DATA, FIXED_EXPENSES_DATA, VARIABLE_EXPENSES_DATA, DEFAULT_COMPANY_SETTINGS } from './constants';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  // Data State
  const [users, setUsers] = useState<User[]>(USERS_DATA);
  const [currentUser, setCurrentUser] = useState<User>(USERS_DATA[0]); // Default initial user
  
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(false);

  // State Management
  const [quotes, setQuotes] = useState<Quote[]>(QUOTES_DATA);
  const [clients, setClients] = useState<Client[]>(CLIENTS_DATA);
  const [sales, setSales] = useState<Sale[]>(SALES_DATA);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>(CASH_FLOW_DATA);
  const [rawMaterials, setRawMaterials] = useState<InventoryItem[]>(RAW_MATERIALS_DATA);
  const [products, setProducts] = useState<Product[]>(PRODUCTS_DATA);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(FIXED_EXPENSES_DATA);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>(VARIABLE_EXPENSES_DATA);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);


  const permissions: { [key in UserRole]: View[] } = {
    Admin: ['dashboard', 'quotes', 'newQuote', 'quoteDetail', 'sales', 'inventory', 'products', 'cashflow', 'financials', 'reports', 'assistant', 'clients', 'settings'],
    Finance: ['dashboard', 'sales', 'cashflow', 'financials', 'reports'],
    Sales: ['dashboard', 'quotes', 'newQuote', 'quoteDetail', 'sales', 'inventory', 'products', 'reports', 'clients'],
  };

  const handleLogin = (email: string) => {
    // Simple auth check
    // In a real app, you'd check password too. 
    // Here we check if email exists in our user list (mocked for now without passwords in initial data, so just email match)
    // If user has password set, we should check it. For demo, assuming email match is enough or generic admin login.
    
    const user = users.find(u => u.email === email || u.name.toLowerCase() === 'admin'); // Fallback for demo
    if (user) {
        setCurrentUser(user);
        setIsAuthenticated(true);
    } else {
        // Allow demo entry if list is pristine
        setIsAuthenticated(true); 
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setActiveView('dashboard');
  };

  const handleSetView = (view: View, id: string | null = null) => {
    if (permissions[currentUser.role].includes(view)) {
      if (id) {
        if (view === 'quoteDetail') setSelectedQuoteId(id);
      }
      setActiveView(view);
    } else {
      setActiveView('accessDenied');
    }
  };
  
  const handleAddQuote = (newQuote: Quote) => {
    setQuotes(prev => [newQuote, ...prev]);
    handleSetView('quotes');
  }

  const handleAddClient = (newClient: Client) => {
    setClients(prev => [newClient, ...prev]);
  }
  
  const handleUpdateQuote = (updatedQuote: Quote) => {
    setQuotes(prev => prev.map(q => q.id === updatedQuote.id ? updatedQuote : q));
    handleSetView('quoteDetail', updatedQuote.id);
  }

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const renderView = () => {
    if (!permissions[currentUser.role].includes(activeView) && activeView !== 'accessDenied') {
      return <AccessDenied />;
    }
    
    switch (activeView) {
      case 'dashboard':
        return <Dashboard setActiveView={handleSetView} currentUser={currentUser} />;
      case 'quotes':
        return <Quotes quotes={quotes} setActiveView={handleSetView} />;
      case 'newQuote':
        return <NewQuote 
                    currentUser={currentUser} 
                    clients={clients} 
                    rawMaterials={rawMaterials}
                    products={products}
                    variableExpenses={variableExpenses}
                    onAddQuote={handleAddQuote} 
                    onAddNewClient={handleAddClient} 
                    onCancel={() => handleSetView('quotes')} 
                />;
      case 'quoteDetail':
        const selectedQuote = quotes.find(q => q.id === selectedQuoteId);
        return selectedQuote ? <QuoteDetail 
                                    quote={selectedQuote} 
                                    rawMaterials={rawMaterials} 
                                    products={products}
                                    variableExpenses={variableExpenses}
                                    companySettings={companySettings}
                                    onUpdateQuote={handleUpdateQuote} 
                                    onBack={() => handleSetView('quotes')} 
                                /> : <p>Orçamento não encontrado.</p>;
      case 'sales':
        return <Sales 
                  sales={sales} 
                  quotes={quotes} 
                  clients={clients} 
                  cashFlow={cashFlow} 
               />;
      case 'inventory':
        return <Inventory rawMaterials={rawMaterials} setRawMaterials={setRawMaterials} />;
      case 'products':
        return <Products 
                    products={products} 
                    setProducts={setProducts} 
                    rawMaterials={rawMaterials}
                    variableExpenses={variableExpenses}
                    currentUser={currentUser}
                />;
      case 'cashflow':
        return <CashFlow cashFlowEntries={cashFlow} setCashFlowEntries={setCashFlow} />;
      case 'financials':
        return <Financials 
                    fixedExpenses={fixedExpenses}
                    setFixedExpenses={setFixedExpenses}
                    variableExpenses={variableExpenses}
                    setVariableExpenses={setVariableExpenses}
                    cashFlow={cashFlow}
                />;
      case 'assistant':
        return <Assistant />;
      case 'reports':
        return <Reports quotes={quotes} sales={sales} cashFlow={cashFlow} rawMaterials={rawMaterials} />;
      case 'clients':
        return <Clients clients={clients} setClients={setClients} />;
      case 'settings':
        return <Settings 
                  companySettings={companySettings} 
                  setCompanySettings={setCompanySettings}
                  users={users}
                  setUsers={setUsers}
                />;
      case 'accessDenied':
         return <AccessDenied />;
      default:
        return <Dashboard setActiveView={handleSetView} currentUser={currentUser} />;
    }
  };
  
  const getTitle = () => {
    switch (activeView) {
        case 'dashboard': return 'Dashboard';
        case 'quotes': return 'Orçamentos';
        case 'newQuote': return 'Novo Orçamento';
        case 'quoteDetail': return `Orçamento #${selectedQuoteId}`;
        case 'sales': return 'Vendas';
        case 'inventory': return 'Estoque de Matéria Prima';
        case 'products': return 'Catálogo de Produtos';
        case 'cashflow': return 'Caixa';
        case 'financials': return 'Financeiro e Precificação';
        case 'assistant': return 'Assistente IA';
        case 'reports': return 'Relatórios';
        case 'clients': return 'Clientes';
        case 'settings': return 'Configurações';
        case 'accessDenied': return 'Acesso Negado';
        default: return 'Dashboard';
    }
  }

  // --- Authentication Check ---
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className={`${isDarkMode ? 'dark' : ''}`}>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200">
        <Sidebar 
          activeView={activeView} 
          setActiveView={handleSetView} 
          isSidebarOpen={isSidebarOpen} 
          setSidebarOpen={setSidebarOpen}
          currentUser={currentUser}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            title={getTitle()} 
            toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} 
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            users={users}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-6 lg:p-8 transition-colors duration-200">
            {renderView()}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;