
import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Icon } from './icons/Icon';

interface ClientsProps {
    clients: Client[];
    setClients: React.Dispatch<React.SetStateAction<Client[]>>;
}

const Clients: React.FC<ClientsProps> = ({ clients, setClients }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newClient, setNewClient] = useState<Partial<Client>>({ address: {} });
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [editableClients, setEditableClients] = useState(clients);

    useEffect(() => {
        setEditableClients(clients);
    }, [clients]);

    const handleInputChange = (field: keyof Client, value: any) => {
        setNewClient(prev => ({ ...prev, [field]: value }));
    };
    
    const handleAddressChangeModal = (field: keyof Client['address'], value: any) => {
        setNewClient(prev => ({
            ...prev,
            address: { ...prev.address, [field]: value },
        }));
    };
    
    const handleFieldChange = (id: string, field: keyof Client | keyof Client['address'], value: string) => {
        const updatedClients = editableClients.map(client => {
            if (client.id === id) {
                 if (field in client.address) {
                    return { ...client, address: { ...client.address, [field]: value } };
                }
                return { ...client, [field]: value };
            }
            return client;
        });
        setEditableClients(updatedClients);
    };
    
    const handleBlur = (id: string) => {
        const clientToUpdate = editableClients.find(c => c.id === id);
        const originalClient = clients.find(c => c.id === id);

        if(JSON.stringify(clientToUpdate) !== JSON.stringify(originalClient)) {
            setClients(editableClients);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
        if (e.key === 'Enter') {
            handleBlur(id);
            (e.target as HTMLInputElement).blur();
        }
    }
    
    const handleDeleteClient = (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
            setClients(prev => prev.filter(client => client.id !== id));
        }
    };

    const handleEditClient = (client: Client) => {
        setNewClient(client);
        setEditingClientId(client.id);
        setIsModalOpen(true);
    };

    const handleNewClient = () => {
        setNewClient({ address: {} });
        setEditingClientId(null);
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClient.name) {
            alert('O nome do cliente é obrigatório.');
            return;
        }

        if (editingClientId) {
            // Update existing client
            setClients(prev => prev.map(c => c.id === editingClientId ? { ...newClient, id: editingClientId } as Client : c));
        } else {
            // Create new client
            const finalClient: Client = {
                id: `c${Date.now()}`,
                name: newClient.name,
                phone: newClient.phone || '',
                birthDate: newClient.birthDate || '',
                address: newClient.address || {},
            };
            setClients(prev => [finalClient, ...prev]);
        }

        setIsModalOpen(false);
        setNewClient({ address: {} });
        setEditingClientId(null);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Clientes Cadastrados</h3>
                <button 
                    onClick={handleNewClient}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
                >
                    <Icon className="w-5 h-5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></Icon>
                    Novo Cliente
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Nome</th>
                            <th scope="col" className="px-6 py-3">Contato</th>
                            <th scope="col" className="px-6 py-3">Cidade/Estado</th>
                             <th scope="col" className="px-6 py-3 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editableClients.map(client => (
                            <tr key={client.id} className="bg-white border-b hover:bg-gray-50 group">
                                <td className="px-6 py-2 font-medium text-gray-900">
                                    <input 
                                        type="text" 
                                        value={client.name} 
                                        onChange={e => handleFieldChange(client.id, 'name', e.target.value)}
                                        onBlur={() => handleBlur(client.id)}
                                        onKeyDown={e => handleKeyDown(e, client.id)}
                                        className="w-full p-1 bg-transparent rounded border border-transparent focus:border-primary-500 focus:bg-white focus:ring-1 focus:ring-primary-500"
                                    />
                                </td>
                                <td className="px-6 py-2">
                                     <input 
                                        type="text" 
                                        value={client.phone || ''} 
                                        onChange={e => handleFieldChange(client.id, 'phone', e.target.value)}
                                        onBlur={() => handleBlur(client.id)}
                                        onKeyDown={e => handleKeyDown(e, client.id)}
                                        className="w-full p-1 bg-transparent rounded border border-transparent focus:border-primary-500 focus:bg-white focus:ring-1 focus:ring-primary-500"
                                    />
                                </td>
                                <td className="px-6 py-2">
                                    <div className="flex gap-1">
                                    <input 
                                        type="text" 
                                        value={client.address?.city || ''} 
                                        onChange={e => handleFieldChange(client.id, 'city', e.target.value)}
                                        onBlur={() => handleBlur(client.id)}
                                        onKeyDown={e => handleKeyDown(e, client.id)}
                                        placeholder="Cidade"
                                        className="w-full p-1 bg-transparent rounded border border-transparent focus:border-primary-500 focus:bg-white focus:ring-1 focus:ring-primary-500"
                                    />
                                    <span>/</span>
                                     <input 
                                        type="text" 
                                        value={client.address?.state || ''} 
                                        onChange={e => handleFieldChange(client.id, 'state', e.target.value)}
                                        onBlur={() => handleBlur(client.id)}
                                        onKeyDown={e => handleKeyDown(e, client.id)}
                                        placeholder="UF"
                                        className="w-16 p-1 bg-transparent rounded border border-transparent focus:border-primary-500 focus:bg-white focus:ring-1 focus:ring-primary-500"
                                    />
                                    </div>
                                </td>
                                <td className="px-6 py-2 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button onClick={() => handleEditClient(client)} className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors" title="Editar">
                                             <Icon className="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                                        </button>
                                        <button onClick={() => handleDeleteClient(client.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors" title="Excluir">
                                            <Icon className="w-5 h-5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            {editingClientId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input type="text" placeholder="Nome *" value={newClient.name || ''} onChange={e => handleInputChange('name', e.target.value)} className="w-full p-2 border rounded" required/>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Celular" value={newClient.phone || ''} onChange={e => handleInputChange('phone', e.target.value)} className="w-full p-2 border rounded" />
                                <input type="date" placeholder="Data de Nascimento" value={newClient.birthDate || ''} onChange={e => handleInputChange('birthDate', e.target.value)} className="w-full p-2 border rounded" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <input type="text" placeholder="CEP" value={newClient.address?.cep || ''} onChange={e => handleAddressChangeModal('cep', e.target.value)} className="w-full p-2 border rounded" />
                                <input type="text" placeholder="Rua" value={newClient.address?.street || ''} onChange={e => handleAddressChangeModal('street', e.target.value)} className="w-full p-2 border rounded col-span-2" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <input type="text" placeholder="Número" value={newClient.address?.number || ''} onChange={e => handleAddressChangeModal('number', e.target.value)} className="w-full p-2 border rounded" />
                                <input type="text" placeholder="Bairro" value={newClient.address?.neighborhood || ''} onChange={e => handleAddressChangeModal('neighborhood', e.target.value)} className="w-full p-2 border rounded" />
                                <input type="text" placeholder="Complemento" value={newClient.address?.complement || ''} onChange={e => handleAddressChangeModal('complement', e.target.value)} className="w-full p-2 border rounded" />
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Cidade" value={newClient.address?.city || ''} onChange={e => handleAddressChangeModal('city', e.target.value)} className="w-full p-2 border rounded" />
                                <input type="text" placeholder="Estado" value={newClient.address?.state || ''} onChange={e => handleAddressChangeModal('state', e.target.value)} className="w-full p-2 border rounded" />
                            </div>
                            <input type="text" placeholder="Ponto de Referência" value={newClient.address?.referencePoint || ''} onChange={e => handleAddressChangeModal('referencePoint', e.target.value)} className="w-full p-2 border rounded" />
                            <div className="flex justify-end gap-4 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                    {editingClientId ? 'Salvar Alterações' : 'Salvar Cliente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Clients;
