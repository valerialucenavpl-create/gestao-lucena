import React, { useState } from 'react';
import { User, UserRole, CompanySettings } from '../types';
import { Icon } from './icons/Icon';

interface SettingsProps {
    companySettings: CompanySettings;
    setCompanySettings: (settings: CompanySettings) => void;
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const Settings: React.FC<SettingsProps> = ({ companySettings, setCompanySettings, users, setUsers }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'company'>('company');
    
    // User Management State
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const [userRole, setUserRole] = useState<UserRole>('Sales');
    const [userGoal, setUserGoal] = useState<number>(0);

    const handleCompanyChange = (field: keyof CompanySettings, value: string) => {
        setCompanySettings({ ...companySettings, [field]: value });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            setCompanySettings({ ...companySettings, logo: imageUrl });
        }
    };

    // User Actions
    const handleOpenUserModal = (user: User | null = null) => {
        if (user) {
            setEditingUser(user);
            setUserName(user.name);
            setUserEmail(user.email || '');
            setUserPassword(user.password || '');
            setUserRole(user.role);
            setUserGoal(user.monthlyGoal || 0);
        } else {
            setEditingUser(null);
            setUserName('');
            setUserEmail('');
            setUserPassword('');
            setUserRole('Sales');
            setUserGoal(0);
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingUser) {
            // Update
            setUsers(users.map(u => u.id === editingUser.id ? {
                ...u,
                name: userName,
                email: userEmail,
                password: userPassword,
                role: userRole,
                monthlyGoal: (userRole === 'Sales' || userRole === 'Manager') ? userGoal : undefined
            } : u));
        } else {
            // Create
            const newUser: User = {
                id: `u${Date.now()}`,
                name: userName,
                email: userEmail,
                password: userPassword,
                role: userRole,
                monthlyGoal: (userRole === 'Sales' || userRole === 'Manager') ? userGoal : undefined,
                avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${userName}`
            };
            setUsers([...users, newUser]);
        }
        setIsUserModalOpen(false);
    };

    const handleDeleteUser = (userId: string) => {
        if (window.confirm('Tem certeza que deseja remover este usuário?')) {
            setUsers(users.filter(u => u.id !== userId));
        }
    };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md min-h-[80vh]">
      <div className="flex border-b mb-6">
            <button 
                className={`px-4 py-2 font-medium text-sm focus:outline-none ${activeTab === 'company' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('company')}
            >
                Dados da Loja
            </button>
            <button 
                className={`px-4 py-2 font-medium text-sm focus:outline-none ${activeTab === 'users' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('users')}
            >
                Gerenciar Usuários
            </button>
      </div>

      {/* --- USERS TAB --- */}
      {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Usuários do Sistema</h3>
                <button 
                    onClick={() => handleOpenUserModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
                >
                    <Icon className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                    Novo Usuário
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3">Usuário</th>
                        <th scope="col" className="px-6 py-3">Email</th>
                        <th scope="col" className="px-6 py-3">Função</th>
                        <th scope="col" className="px-6 py-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                    <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full mr-3"/>
                            {user.name}
                        </td>
                        <td className="px-6 py-4">{user.email || '-'}</td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                user.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                                user.role === 'Manager' ? 'bg-indigo-100 text-indigo-800' :
                                user.role === 'Finance' ? 'bg-green-100 text-green-800' :
                                'bg-blue-100 text-blue-800'
                            }`}>
                                {user.role}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={() => handleOpenUserModal(user)} className="text-blue-600 hover:text-blue-800">
                                    <Icon className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                                </button>
                                <button onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:text-red-800">
                                    <Icon className="w-4 h-4"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                </button>
                            </div>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
          </div>
      )}

      {/* --- COMPANY SETTINGS TAB --- */}
      {activeTab === 'company' && (
          <div className="max-w-3xl">
             <h3 className="text-xl font-semibold text-gray-800 mb-6">Configurações da Empresa</h3>
             <div className="grid grid-cols-1 gap-6">
                 {/* Logo Upload */}
                 <div className="flex items-center space-x-6">
                    <div className="shrink-0">
                        {companySettings.logo ? (
                            <img className="h-24 w-24 object-contain rounded-md border" src={companySettings.logo} alt="Logo da Empresa" />
                        ) : (
                            <div className="h-24 w-24 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 border border-dashed border-gray-300">
                                <Icon className="w-8 h-8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Icon>
                            </div>
                        )}
                    </div>
                    <label className="block">
                        <span className="sr-only">Escolher logo</span>
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"/>
                        <span className="text-xs text-gray-500 mt-1 block">Recomendado: PNG transparente ou JPG. Essa logo aparecerá nos orçamentos.</span>
                    </label>
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <label className="block text-sm font-medium text-gray-700">Nome Fantasia</label>
                         <input type="text" value={companySettings.name} onChange={e => handleCompanyChange('name', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="Ex: Marmoraria Pedra Dura"/>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-700">Razão Social</label>
                         <input type="text" value={companySettings.legalName} onChange={e => handleCompanyChange('legalName', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="Ex: João Silva ME"/>
                     </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                         <input type="text" value={companySettings.cnpj} onChange={e => handleCompanyChange('cnpj', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="00.000.000/0001-00"/>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-700">Telefone / WhatsApp</label>
                         <input type="text" value={companySettings.phone} onChange={e => handleCompanyChange('phone', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="(00) 00000-0000"/>
                     </div>
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-gray-700">Email de Contato</label>
                     <input type="email" value={companySettings.email} onChange={e => handleCompanyChange('email', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="contato@suaempresa.com"/>
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-gray-700">Endereço Completo</label>
                     <textarea value={companySettings.address} onChange={e => handleCompanyChange('address', e.target.value)} rows={3} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" placeholder="Rua, Número, Bairro, Cidade - Estado, CEP"/>
                 </div>
             </div>
          </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                  <form onSubmit={handleSaveUser} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Nome</label>
                          <input type="text" value={userName} onChange={e => setUserName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" required />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Email (Login)</label>
                          <input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" required />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Senha</label>
                          <input type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" placeholder={editingUser ? "Deixe em branco para manter" : ""} required={!editingUser} />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Função / Cargo</label>
                          <select value={userRole} onChange={e => setUserRole(e.target.value as UserRole)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                              <option value="Admin">Admin (Acesso Total)</option>
                              <option value="Manager">Gerente de Vendas (Acesso Total + Meta)</option>
                              <option value="Finance">Financeiro (Acesso Financeiro)</option>
                              <option value="Sales">Vendas (Acesso Vendas/Orçamentos)</option>
                          </select>
                      </div>
                      {(userRole === 'Sales' || userRole === 'Manager') && (
                          <div>
                              <label className="block text-sm font-medium text-gray-700">Meta Mensal (R$)</label>
                              <input type="number" value={userGoal} onChange={e => setUserGoal(parseFloat(e.target.value))} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
                          </div>
                      )}
                      <div className="flex justify-end gap-4 pt-4">
                          <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                          <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default Settings;