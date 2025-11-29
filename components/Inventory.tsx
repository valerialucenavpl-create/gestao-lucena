
import React, { useState, ChangeEvent } from 'react';
import { InventoryItem, UsageCategory, UnitOfMeasure, ColorVariant } from '../types';
import { Icon } from './icons/Icon';
import { USAGE_CATEGORIES, UNITS_OF_MEASURE } from '../constants';

interface InventoryProps {
    rawMaterials: InventoryItem[];
    setRawMaterials: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

const Inventory: React.FC<InventoryProps> = ({ rawMaterials, setRawMaterials }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

    const handleOpenModal = (item: InventoryItem | null = null) => {
        setEditingItem(item ? JSON.parse(JSON.stringify(item)) : null); // Deep copy to avoid modifying state directly
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingItem(null);
        setIsModalOpen(false);
    };

    const handleSaveItem = (itemData: Omit<InventoryItem, 'id'> & { id?: string }) => {
        if (editingItem) {
            setRawMaterials(rawMaterials.map(i => i.id === editingItem.id ? { ...editingItem, ...itemData } : i));
        } else {
            const newItem: InventoryItem = {
                id: `mat-${Date.now()}`,
                ...itemData,
                colorVariants: itemData.colorVariants || [{name: 'Padrão', cost: 0, salePrice: 0}],
                stockQuantity: itemData.stockQuantity || 0
            };
            setRawMaterials([newItem, ...rawMaterials]);
        }
        handleCloseModal();
    };

    const handleDeleteItem = (id: string) => {
        if (window.confirm('Tem certeza que deseja remover esta matéria prima do estoque?')) {
            setRawMaterials(rawMaterials.filter(i => i.id !== id));
        }
    };
    
    const formatCurrency = (value: number) => value.toLocaleString('pt-BR', {minimumFractionDigits: 2});

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-800">Estoque de Matéria Prima</h3>
            <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
            >
                <Icon className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                Adicionar Matéria Prima
            </button>
        </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3">Foto</th>
              <th scope="col" className="px-6 py-3">Nome</th>
              <th scope="col" className="px-6 py-3">Cores / Preços de Venda</th>
              <th scope="col" className="px-6 py-3">Estoque</th>
              <th scope="col" className="px-6 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rawMaterials.map(item => (
              <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                <td className="px-6 py-4">
                    <div className="h-10 w-10 rounded bg-white flex items-center justify-center overflow-hidden border border-gray-200 p-0.5">
                        {item.image ? (
                            <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                        ) : (
                            <Icon className="text-gray-400 w-5 h-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></Icon>
                        )}
                    </div>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">{item.name}<br/><span className="text-xs text-gray-500">{item.usageCategory}</span></td>
                <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                        {item.colorVariants.map(variant => (
                            <span key={variant.name} className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                                {variant.name}: <span className="font-semibold">R$ {formatCurrency(variant.salePrice)}</span>
                            </span>
                        ))}
                    </div>
                </td>
                <td className="px-6 py-4">{item.stockQuantity} {item.unit}</td>
                <td className="px-6 py-4 text-center space-x-2">
                    <button onClick={() => handleOpenModal(item)} className="text-primary-600 hover:text-primary-800">
                        <Icon className="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                    </button>
                    <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:text-red-700">
                        <Icon className="w-5 h-5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                    </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

       {isModalOpen && (
            <ItemModal
                item={editingItem}
                onClose={handleCloseModal}
                onSave={handleSaveItem}
            />
        )}
    </div>
  );
};

// Modal Component
interface ItemModalProps {
    item: InventoryItem | null;
    onClose: () => void;
    onSave: (itemData: Omit<InventoryItem, 'id'> & { id?: string }) => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ item, onClose, onSave }) => {
    const [name, setName] = useState(item?.name || '');
    const [usageCategory, setUsageCategory] = useState<UsageCategory>(item?.usageCategory || 'Chapa/Placa');
    const [unit, setUnit] = useState<UnitOfMeasure>(item?.unit || 'm²');
    const [colorVariants, setColorVariants] = useState<ColorVariant[]>(item?.colorVariants || [{ name: 'Padrão', cost: 0, salePrice: 0 }]);
    const [stockQuantity, setStockQuantity] = useState(item?.stockQuantity || 0);
    const [standardSize, setStandardSize] = useState(item?.standardSize || '');
    const [image, setImage] = useState(item?.image || '');

    const handleVariantChange = (index: number, field: keyof ColorVariant, value: string | number) => {
        const newVariants = [...colorVariants];
        (newVariants[index] as any)[field] = value;
        setColorVariants(newVariants);
    };

    const addVariant = () => {
        setColorVariants([...colorVariants, { name: '', cost: 0, salePrice: 0 }]);
    };

    const removeVariant = (index: number) => {
        if (colorVariants.length > 1) {
            setColorVariants(colorVariants.filter((_, i) => i !== index));
        }
    };
    
    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            setImage(imageUrl);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ 
            name, 
            usageCategory, 
            unit, 
            colorVariants,
            stockQuantity, 
            standardSize,
            image 
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {item ? 'Editar Matéria Prima' : 'Adicionar Nova Matéria Prima'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Image Column */}
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Foto do Material</label>
                            <label className="block w-full aspect-square relative group cursor-pointer rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-300">
                                {image ? (
                                    <img src={image} alt="Preview" className="h-full w-full object-contain" />
                                ) : (
                                    <div className="h-full w-full flex flex-col items-center justify-center text-gray-400">
                                        <Icon className="mx-auto h-10 w-10 mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Icon>
                                        <span className="text-sm">Clique para enviar</span>
                                    </div>
                                )}
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleImageUpload}
                                    className="hidden" 
                                />
                                {image && (
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
                                         <span className="text-xs font-medium text-gray-700 opacity-0 group-hover:opacity-100 bg-white px-2 py-1 rounded shadow">Alterar</span>
                                    </div>
                                )}
                            </label>
                             {image && (
                                 <button type="button" onClick={() => setImage('')} className="mt-2 text-xs text-red-500 hover:underline text-center w-full">Remover Imagem</button>
                             )}
                        </div>

                        {/* Fields Column */}
                        <div className="md:col-span-2 space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Nome *</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-2 border rounded" required />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Categoria de Uso</label>
                                    <select value={usageCategory} onChange={e => setUsageCategory(e.target.value as UsageCategory)} className="w-full mt-1 p-2 border rounded">
                                        {USAGE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Unidade de Medida</label>
                                    <select value={unit} onChange={e => setUnit(e.target.value as UnitOfMeasure)} className="w-full mt-1 p-2 border rounded">
                                        {UNITS_OF_MEASURE.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700">Quantidade em Estoque</label>
                                    <input type="number" value={stockQuantity} onChange={e => setStockQuantity(parseFloat(e.target.value))} className="w-full mt-1 p-2 border rounded" min="0" step="0.01" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Tamanho Padrão (Ex: 3x2m)</label>
                                    <input type="text" value={standardSize} onChange={e => setStandardSize(e.target.value)} className="w-full mt-1 p-2 border rounded" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Color Variants */}
                    <div className="border-t pt-4 mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Variações de Cor e Preço</label>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {colorVariants.map((variant, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-4">
                                    <input type="text" placeholder="Nome da Cor" value={variant.name} onChange={e => handleVariantChange(index, 'name', e.target.value)} className="w-full p-2 border rounded" required/>
                                </div>
                                <div className="col-span-3">
                                    <input type="number" placeholder="Custo" value={variant.cost} onChange={e => handleVariantChange(index, 'cost', parseFloat(e.target.value))} className="w-full p-2 border rounded" required min="0" step="0.01"/>
                                </div>
                                <div className="col-span-3">
                                    <input type="number" placeholder="Preço Venda" value={variant.salePrice} onChange={e => handleVariantChange(index, 'salePrice', parseFloat(e.target.value))} className="w-full p-2 border rounded" required min="0" step="0.01"/>
                                </div>
                                <div className="col-span-2 text-right">
                                    <button type="button" onClick={() => removeVariant(index)} disabled={colorVariants.length <= 1} className="text-red-500 hover:text-red-700 disabled:opacity-50">
                                        <Icon><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                    </button>
                                </div>
                            </div>
                        ))}
                        </div>
                         <button type="button" onClick={addVariant} className="mt-2 flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-lg hover:bg-blue-200">
                             <Icon className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                            Adicionar Cor
                        </button>
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export default Inventory;
