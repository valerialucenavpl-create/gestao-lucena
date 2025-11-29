import React, { useState, ChangeEvent, useMemo } from 'react';
import { Product, ProductCompositionItem, InventoryItem, User, CalculationRule, VariableExpense } from '../types';
import { Icon } from './icons/Icon';

interface ProductsProps {
    products: Product[];
    setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
    rawMaterials: InventoryItem[];
    variableExpenses: VariableExpense[];
    currentUser: User;
}

const Products: React.FC<ProductsProps> = ({ products, setProducts, rawMaterials, variableExpenses, currentUser }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleOpenModal = (product: Product | null = null) => {
        setEditingProduct(product ? JSON.parse(JSON.stringify(product)) : null); // Deep copy
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingProduct(null);
        setIsModalOpen(false);
    };

    const handleSaveProduct = (productData: Omit<Product, 'id'>) => {
        if (editingProduct) {
            setProducts(products.map(p => p.id === editingProduct.id ? { ...editingProduct, ...productData } : p));
        } else {
            const newProduct: Product = {
                id: `prod-${Date.now()}`,
                ...productData,
            };
            setProducts([newProduct, ...products]);
        }
        handleCloseModal();
    };

    const handleDeleteProduct = (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este produto?')) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Catálogo de Produtos</h3>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
                >
                    <Icon className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                    Adicionar Produto
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Foto</th>
                            <th scope="col" className="px-6 py-3">Nome do Produto</th>
                            <th scope="col" className="px-6 py-3">Categoria</th>
                            <th scope="col" className="px-6 py-3">Componentes</th>
                            <th scope="col" className="px-6 py-3 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(product => (
                            <tr key={product.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <div className="h-10 w-10 rounded bg-white flex items-center justify-center overflow-hidden border border-gray-200 p-0.5">
                                        {product.image ? (
                                            <img src={product.image} alt={product.name} className="h-full w-full object-contain" />
                                        ) : (
                                            <Icon className="text-gray-400 w-5 h-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></Icon>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">{product.name}</td>
                                <td className="px-6 py-4">{product.category}</td>
                                <td className="px-6 py-4">{product.composition.length}</td>
                                <td className="px-6 py-4 text-center space-x-2">
                                    <button onClick={() => handleOpenModal(product)} className="text-primary-600 hover:text-primary-800">
                                        <Icon className="w-5 h-5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                                    </button>
                                    <button onClick={() => handleDeleteProduct(product.id)} className="text-red-500 hover:text-red-700">
                                        <Icon className="w-5 h-5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <ProductModal
                    product={editingProduct}
                    onClose={handleCloseModal}
                    onSave={handleSaveProduct}
                    rawMaterials={rawMaterials}
                    variableExpenses={variableExpenses}
                    currentUser={currentUser}
                />
            )}
        </div>
    );
};

// Modal Component
interface ProductModalProps {
    product: Product | null;
    onClose: () => void;
    onSave: (productData: Omit<Product, 'id'>) => void;
    rawMaterials: InventoryItem[];
    variableExpenses: VariableExpense[];
    currentUser: User;
}

const ProductModal: React.FC<ProductModalProps> = ({ product, onClose, onSave, rawMaterials, variableExpenses, currentUser }) => {
    const [name, setName] = useState(product?.name || '');
    const [category, setCategory] = useState(product?.category || 'Outros');
    const [image, setImage] = useState(product?.image || '');
    const [composition, setComposition] = useState<ProductCompositionItem[]>(product?.composition || []);
    const [laborCost, setLaborCost] = useState(product?.laborCost || 0);
    const [desiredProfitMargin, setDesiredProfitMargin] = useState(product?.desiredProfitMargin || 20);
    
    const calculationRules: { id: CalculationRule, name: string }[] = [
        { id: 'perimeter', name: 'Perímetro (2A + 2L)'},
        { id: 'height_multiplier', name: 'Múltiplo da Altura (N x A)'},
        { id: 'width_multiplier', name: 'Múltiplo da Largura (N x L)'},
        { id: 'area_multiplier', name: 'Múltiplo da Área (N x m²)'},
        { id: 'fill', name: 'Preenchimento (A / Fator)'},
        { id: 'fixed_quantity', name: 'Quantidade Fixa'},
    ]

    const handleCompositionChange = (id: string, field: keyof ProductCompositionItem, value: any) => {
        setComposition(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const addVariableComponent = () => {
        setComposition([...composition, { id: `comp-${Date.now()}`, materialId: rawMaterials[0]?.id || '', rule: 'perimeter' }]);
    };
    
    const addAccessory = () => {
         setComposition([...composition, { id: `comp-${Date.now()}`, materialId: rawMaterials.find(m => m.usageCategory === 'Componente')?.id || rawMaterials[0]?.id, rule: 'fixed_quantity', quantity: 1 }]);
    };

    const removeCompositionItem = (id: string) => {
        setComposition(composition.filter(item => item.id !== id));
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
        onSave({ name, category, image, composition, laborCost, desiredProfitMargin });
    };
    
    const renderRuleInputs = (item: ProductCompositionItem) => {
        const inputClass = "w-full p-1 border rounded bg-white text-gray-900 border-gray-300";

        switch (item.rule) {
            case 'height_multiplier':
            case 'width_multiplier':
            case 'area_multiplier':
                return <input type="number" placeholder="N" value={item.multiplier || 1} onChange={e => handleCompositionChange(item.id, 'multiplier', parseFloat(e.target.value))} className={inputClass} />;
            case 'fill':
                return (
                    <div className="relative">
                        <input 
                            type="number" 
                            placeholder="Fator (mm)" 
                            value={item.factor || ''} 
                            onChange={e => handleCompositionChange(item.id, 'factor', parseFloat(e.target.value))} 
                            className={inputClass} 
                            title="Insira a altura da peça em milímetros (ex: 120 para lambril)"
                        />
                        <span className="absolute right-2 top-1 text-xs text-gray-400 pointer-events-none">mm</span>
                    </div>
                );
            case 'fixed_quantity':
                return <input type="number" placeholder="Qtd" value={item.quantity || 1} onChange={e => handleCompositionChange(item.id, 'quantity', parseInt(e.target.value))} className={inputClass} />;
            default:
                return null;
        }
    }

    const getMaterialCost = (materialId: string) => {
        const material = rawMaterials.find(m => m.id === materialId);
        return material?.colorVariants[0]?.cost || 0;
    };

    const calculateLineCost = (item: ProductCompositionItem) => {
        const unitCost = getMaterialCost(item.materialId);
        if (item.rule === 'fixed_quantity') {
            return (item.quantity || 0) * unitCost;
        }
        if (item.rule === 'fill') return unitCost; 
        return (item.multiplier || 0) * unitCost;
    }

    const totalCompositionCost = useMemo(() => {
        const materialsTotal = composition.reduce((acc, item) => acc + calculateLineCost(item), 0);
        return materialsTotal + (laborCost || 0);
    }, [composition, rawMaterials, laborCost]);

    // Calculate Financial Breakdown based on variable expenses and desired profit
    const financialBreakdown = useMemo(() => {
        const commissionRate = variableExpenses.find(e => e.name.toLowerCase().includes('comissão'))?.value || 0;
        const taxRate = variableExpenses.find(e => e.name.toLowerCase().includes('imposto') || e.name.toLowerCase().includes('simples'))?.value || 0;
        const cardRate = variableExpenses.find(e => e.name.toLowerCase().includes('maquininha') || e.name.toLowerCase().includes('cartão'))?.value || 0;
        const fixedCostEstimateRate = 20; // Estimated
        
        const totalDeductionsPercent = commissionRate + taxRate + cardRate + fixedCostEstimateRate + desiredProfitMargin;
        
        // Calculate suggested price to cover all costs and profit
        // Price = Cost / (1 - Deductions%)
        const divisor = 1 - (totalDeductionsPercent / 100);
        const suggestedPrice = divisor > 0 ? totalCompositionCost / divisor : 0;

        const commissionValue = suggestedPrice * (commissionRate / 100);
        const taxValue = suggestedPrice * (taxRate / 100);
        const cardValue = suggestedPrice * (cardRate / 100);
        const fixedCostValue = suggestedPrice * (fixedCostEstimateRate / 100);
        const profitValue = suggestedPrice * (desiredProfitMargin / 100);

        return {
            suggestedPrice,
            commissionValue,
            commissionRate,
            taxValue,
            taxRate,
            cardValue,
            cardRate,
            fixedCostValue,
            fixedCostEstimateRate,
            profitValue
        };
    }, [totalCompositionCost, variableExpenses, desiredProfitMargin]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {product ? 'Editar Produto' : 'Adicionar Novo Produto'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nome do Produto *</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Categoria</label>
                            <input type="text" value={category} onChange={e => setCategory(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Image Side (Left) - Grid Column */}
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Foto do Produto</label>
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

                        {/* Composition Side (Right) */}
                        <div className="md:col-span-2">
                            <h4 className="text-md font-semibold text-gray-800 mb-2">Composição / Ficha Técnica</h4>
                            
                            {/* Variable Components */}
                            <div className="p-3 bg-gray-50 rounded-md border border-gray-100">
                                    <h5 className="text-sm font-semibold text-gray-600 mb-2">Componentes Variáveis (Calculados por Medida)</h5>
                                <div className="space-y-3">
                                    {composition.filter(item => item.rule !== 'fixed_quantity').map((item) => (
                                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-4">
                                                <select value={item.materialId} onChange={e => handleCompositionChange(item.id, 'materialId', e.target.value)} className="w-full p-1.5 border rounded bg-white text-gray-900 border-gray-300">
                                                    {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-3">
                                                <select value={item.rule} onChange={e => handleCompositionChange(item.id, 'rule', e.target.value as CalculationRule)} className="w-full p-1.5 border rounded bg-white text-gray-900 border-gray-300">
                                                    {calculationRules.filter(r => r.id !== 'fixed_quantity').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-2">{renderRuleInputs(item)}</div>
                                            <div className="col-span-2 text-right text-sm font-medium text-gray-700">
                                                {formatCurrency(calculateLineCost(item))}
                                            </div>
                                            <div className="col-span-1 text-right">
                                                <button type="button" onClick={() => removeCompositionItem(item.id)} className="text-red-500 hover:text-red-700">
                                                    <Icon><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={addVariableComponent} className="mt-3 flex items-center gap-2 px-3 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded hover:bg-gray-50">
                                    <Icon className="w-3 h-3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                                    Adicionar Variável
                                </button>
                            </div>
                            
                            {/* Accessories */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-100">
                                <h5 className="text-sm font-semibold text-gray-600 mb-2">Acessórios (Quantidade Fixa)</h5>
                                <div className="space-y-3">
                                    {composition.filter(item => item.rule === 'fixed_quantity').map((item) => (
                                            <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-6">
                                                <select value={item.materialId} onChange={e => handleCompositionChange(item.id, 'materialId', e.target.value)} className="w-full p-1.5 border rounded bg-white text-gray-900 border-gray-300">
                                                        {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-2">
                                                <input type="number" placeholder="Qtd" value={item.quantity || 1} onChange={e => handleCompositionChange(item.id, 'quantity', parseInt(e.target.value))} className="w-full p-1 border rounded bg-white text-gray-900 border-gray-300" />
                                                </div>
                                                 <div className="col-span-3 text-right text-sm font-medium text-gray-700">
                                                    {formatCurrency(calculateLineCost(item))}
                                                </div>
                                                <div className="col-span-1 text-right">
                                                    <button type="button" onClick={() => removeCompositionItem(item.id)} className="text-red-500 hover:text-red-700">
                                                        <Icon><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></Icon>
                                                    </button>
                                                </div>
                                            </div>
                                    ))}
                                </div>
                                <button type="button" onClick={addAccessory} className="mt-3 flex items-center gap-2 px-3 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded hover:bg-gray-50">
                                        <Icon className="w-3 h-3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                                    Adicionar Acessório
                                </button>
                            </div>

                            <div className="mt-4 p-4 bg-gray-100 rounded border border-gray-200">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-300">
                                    <span className="text-sm font-bold text-gray-700">Detalhamento Financeiro Unitário (Base)</span>
                                </div>
                                
                                <div className="space-y-1 text-sm text-gray-600">
                                    <div className="flex justify-between items-center">
                                        <span>Custo Materiais:</span>
                                        <span>{formatCurrency(totalCompositionCost - laborCost)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Custo Mão de Obra:</span>
                                        <input 
                                            type="number" 
                                            value={laborCost} 
                                            onChange={e => setLaborCost(parseFloat(e.target.value))} 
                                            className="w-24 p-0.5 text-right text-sm bg-white border rounded border-gray-300 text-gray-900"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                    <div className="flex justify-between items-center font-medium text-gray-800 pt-1">
                                        <span>= Custo Base Total:</span>
                                        <span>{formatCurrency(totalCompositionCost)}</span>
                                    </div>
                                </div>

                                {financialBreakdown.suggestedPrice > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-300 space-y-1 text-xs text-gray-500">
                                         <div className="flex justify-between">
                                            <span>(+) Impostos ({financialBreakdown.taxRate}%):</span>
                                            <span>{formatCurrency(financialBreakdown.taxValue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>(+) Comissão ({financialBreakdown.commissionRate}%):</span>
                                            <span>{formatCurrency(financialBreakdown.commissionValue)}</span>
                                        </div>
                                         <div className="flex justify-between">
                                            <span>(+) Taxa Cartão ({financialBreakdown.cardRate}%):</span>
                                            <span>{formatCurrency(financialBreakdown.cardValue)}</span>
                                        </div>
                                         <div className="flex justify-between">
                                            <span>(+) Custos Fixos (Est. {financialBreakdown.fixedCostEstimateRate}%):</span>
                                            <span>{formatCurrency(financialBreakdown.fixedCostValue)}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-green-700 text-sm pt-1">
                                            <span>(+) Lucro Líquido ({desiredProfitMargin}%):</span>
                                            <span>{formatCurrency(financialBreakdown.profitValue)}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-blue-900 text-base pt-2 border-t border-gray-300 mt-2">
                                            <span>= Preço de Venda Sugerido:</span>
                                            <span>{formatCurrency(financialBreakdown.suggestedPrice)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Precificação - Admin Only */}
                    {currentUser.role === 'Admin' && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                            <h4 className="text-md font-semibold text-yellow-800 mb-2">Precificação (Admin)</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Margem de Lucro Desejada (%)</label>
                                <input type="number" value={desiredProfitMargin} onChange={e => setDesiredProfitMargin(parseFloat(e.target.value))} className="w-full md:w-1/3 mt-1 p-2 border rounded bg-white text-gray-900 border-gray-300" required min="0" />
                                <p className="text-xs text-gray-600 mt-1">Esta margem será usada no cálculo de Markup para este produto.</p>
                            </div>
                        </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar Produto</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Products;