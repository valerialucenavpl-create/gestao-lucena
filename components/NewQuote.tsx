import React, { useState, useEffect, useMemo } from 'react';
import { User, Client, InventoryItem, Product, VariableExpense, Quote, QuoteItem, CalculationRule, ProductCompositionItem } from '../types';
import { Icon } from './icons/Icon';
import { GLASS_PRODUCTS, GLASS_TYPES, GLASS_COLORS, PROFILE_COLORS, HARDWARE_COLORS, HANDLES } from '../constants';

interface NewQuoteProps {
    currentUser: User;
    clients: Client[];
    rawMaterials: InventoryItem[];
    products: Product[];
    variableExpenses: VariableExpense[];
    onAddQuote: (quote: Quote) => void;
    onAddNewClient: (client: Client) => void;
    onCancel: () => void;
}

const NewQuote: React.FC<NewQuoteProps> = ({ 
    currentUser, 
    clients, 
    rawMaterials, 
    products, 
    variableExpenses, 
    onAddQuote, 
    onAddNewClient, 
    onCancel 
}) => {
    // State
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<Quote['paymentMethod']>('Cartão');
    const [discount, setDiscount] = useState(0);
    const [freight, setFreight] = useState(0);
    const [installation, setInstallation] = useState(0);
    const [measurementNotes, setMeasurementNotes] = useState('');
    const [assemblyNotes, setAssemblyNotes] = useState('');
    
    // New Client Modal State
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');

    // --- Tab & Wizard State ---
    const [activeCategory, setActiveCategory] = useState<'GRANITO' | 'VIDROS' | 'ALUMINIO' | 'PORTAO'>('GRANITO');
    
    // Granite Wizard State
    const [grMaterialId, setGrMaterialId] = useState<string>('');
    const [grVariantName, setGrVariantName] = useState<string>('');
    // Changed from single dimensions to an array of pieces to support complex shapes (e.g. L-shape)
    const [grPieces, setGrPieces] = useState<{id: string, length: number, width: number, quantity: number}[]>([
        { id: '1', length: 0, width: 0, quantity: 1 }
    ]);
    const [grDescription, setGrDescription] = useState<string>('');

    // Aluminum Wizard State
    const [alMaterialId, setAlMaterialId] = useState<string>('');
    const [alVariantName, setAlVariantName] = useState<string>('');
    const [alPieces, setAlPieces] = useState<{id: string, length: number, width: number, quantity: number}[]>([
        { id: '1', length: 0, width: 0, quantity: 1 }
    ]);
    const [alDescription, setAlDescription] = useState<string>('');
    const [isAlGridVisible, setIsAlGridVisible] = useState(true);

    // Gate Wizard State
    const [poMaterialId, setPoMaterialId] = useState<string>('');
    const [poVariantName, setPoVariantName] = useState<string>('');
    const [poPieces, setPoPieces] = useState<{id: string, length: number, width: number, quantity: number}[]>([
        { id: '1', length: 0, width: 0, quantity: 1 }
    ]);
    const [poDescription, setPoDescription] = useState<string>('');
    const [isPoGridVisible, setIsPoGridVisible] = useState(true);

    // Glass Wizard State
    const [gwSelectedProduct, setGwSelectedProduct] = useState<string>('');
    const [gwWidth, setGwWidth] = useState<number>(2000);
    const [gwHeight, setGwHeight] = useState<number>(2500);
    const [gwGlassType, setGwGlassType] = useState<string>('g8');
    const [gwGlassColor, setGwGlassColor] = useState<string>('incolor');
    const [gwProfileColor, setGwProfileColor] = useState<string>('branco');
    const [gwHardwareColor, setGwHardwareColor] = useState<string>('branco');
    const [gwHandle, setGwHandle] = useState<string>('');
    const [gwQuantity, setGwQuantity] = useState<number>(1);

    // Calculation Constants
    const totalVariablePercent = useMemo(() => variableExpenses.filter(e => e.type === 'percent').reduce((sum, item) => sum + item.value, 0), [variableExpenses]);

    // Helper for Currency Inputs
    const handleCurrencyChange = (setter: React.Dispatch<React.SetStateAction<number>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const numberValue = Number(rawValue) / 100;
        setter(numberValue);
    };

    // Helper to calculate price for a specific product configuration (Standard Products)
    const calculateItemPrice = (productId: string, width: number, height: number, quantity: number, color: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return { price: 0, cost: 0 };

        let totalCostOfGoods = 0;
        product.composition.forEach(compItem => {
            const material = rawMaterials.find(m => m.id === compItem.materialId);
            if (!material) return;
            
            const colorVariant = material.colorVariants.find(cv => cv.name === color) || material.colorVariants[0];
            if (!colorVariant) return;

            let materialQty = 0;
            const width_m = width / 1000;
            const height_m = height / 1000;

            switch(compItem.rule) {
                case 'perimeter': materialQty = (width_m * 2) + (height_m * 2); break;
                case 'height_multiplier': materialQty = height_m * (compItem.multiplier || 1); break;
                case 'width_multiplier': materialQty = width_m * (compItem.multiplier || 1); break;
                case 'area_multiplier': materialQty = (width_m * height_m) * (compItem.multiplier || 1); break;
                case 'fill':
                     if (material.unit === 'm²') { materialQty = width_m * height_m; }
                     else {
                        const pieceWidth_m = (compItem.factor || 1) / 1000;
                        if (pieceWidth_m > 0) {
                            const piecesNeeded = Math.ceil(width_m / pieceWidth_m);
                            materialQty = piecesNeeded * height_m;
                        }
                     }
                     break;
                case 'fixed_quantity': materialQty = compItem.quantity || 1; break;
            }
            totalCostOfGoods += materialQty * colorVariant.cost;
        });

        // Add labor cost
        const laborCost = product.laborCost || 0;
        totalCostOfGoods += laborCost;

        const profitMargin = product.desiredProfitMargin / 100;
        const variableCostMargin = totalVariablePercent / 100;
        const markupDivisor = 1 - variableCostMargin - profitMargin;
        
        const unitPrice = markupDivisor > 0 ? totalCostOfGoods / markupDivisor : totalCostOfGoods * 2; 
        
        return {
            price: unitPrice * quantity,
            cost: totalCostOfGoods * quantity
        };
    };

    // --- Handlers for Standard Products ---
    const handleAddItem = (categoryFilter?: string) => {
        const filteredProducts = categoryFilter 
            ? products.filter(p => p.category.toUpperCase() === categoryFilter.toUpperCase())
            : products;

        if (filteredProducts.length === 0) {
            alert("Nenhum produto encontrado nesta categoria.");
            return;
        }
        const defaultProduct = filteredProducts[0];
        const availableColors = Array.from(new Set(defaultProduct.composition.flatMap(c => {
            const material = rawMaterials.find(m => m.id === c.materialId);
            return material?.colorVariants.map(cv => cv.name) || [];
        })));

        const defaultColor = availableColors.length > 0 ? (availableColors[0] as string) : 'Padrão';

        const newItem: QuoteItem = {
            id: `qi-${Date.now()}`,
            productId: defaultProduct.id,
            productName: defaultProduct.name,
            selectedColor: defaultColor,
            description: '',
            width: 1000,
            height: 1000,
            quantity: 1,
            price: 0,
            cost: 0
        };
        
        const { price, cost } = calculateItemPrice(newItem.productId, newItem.width, newItem.height, newItem.quantity, newItem.selectedColor);
        newItem.price = price;
        newItem.cost = cost;

        setItems([...items, newItem]);
    };

    // --- Generic Piece Logic (Granite, Aluminum, Gate) ---
    
    const addPiece = (setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
        setter([...currentPieces, { id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
    };

    const removePiece = (index: number, setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
        if (currentPieces.length > 1) {
            const newPieces = [...currentPieces];
            newPieces.splice(index, 1);
            setter(newPieces);
        }
    };

    const updatePiece = (index: number, field: string, value: number, setter: React.Dispatch<React.SetStateAction<any[]>>, currentPieces: any[]) => {
        const newPieces = [...currentPieces];
        newPieces[index][field] = value;
        setter(newPieces);
    };

    const getCalculations = (materialId: string, variantName: string, pieces: any[]) => {
        if (!materialId) return { totalArea: 0, totalPrice: 0, totalCost: 0, productName: '', variantLabel: '' };
        
        const material = rawMaterials.find(m => m.id === materialId);
        const product = products.find(p => p.id === materialId); 

        let unitPrice = 0;
        let unitCost = 0;
        let productName = '';
        let variantLabel = variantName;

        if (material) {
            const variant = material.colorVariants.find(v => v.name === variantName) || material.colorVariants[0];
            unitPrice = variant?.salePrice || 0;
            unitCost = variant?.cost || 0;
            productName = material.name;
            variantLabel = variant?.name || 'Padrão';
        } else if (product) {
             // For products in these calculators, we assume a standard 1m x 1m calculation to get a base unit price per m2
             const { price, cost } = calculateItemPrice(product.id, 1000, 1000, 1, 'Padrão'); 
             unitPrice = price;
             unitCost = cost;
             productName = product.name;
             variantLabel = 'Padrão';
        }
        
        let totalArea = 0;
        pieces.forEach(piece => {
            totalArea += (piece.length * piece.width * piece.quantity);
        });

        const totalPrice = totalArea * unitPrice;
        const totalCost = totalArea * unitCost;

        return { totalArea, totalPrice, totalCost, productName, variantLabel };
    };

    const handleAddPieceItem = (
        category: string,
        materialId: string, 
        variantName: string, 
        pieces: any[], 
        description: string,
        reset: () => void
    ) => {
        if (!materialId) {
            alert("Selecione um produto/material.");
            return;
        }

        const { totalArea, totalPrice, totalCost, productName, variantLabel } = getCalculations(materialId, variantName, pieces);

        if (totalArea === 0) {
            alert("Adicione medidas válidas.");
            return;
        }

        const piecesDesc = pieces
            .map((p, idx) => `Peça ${idx + 1}: ${p.quantity}x (${p.length.toFixed(2)}m x ${p.width.toFixed(2)}m)`)
            .join('\n');
        
        const baseDesc = `${productName} ${variantLabel !== 'Padrão' ? '- ' + variantLabel : ''}`;
        const fullDescription = description.trim() 
            ? `${description}\n\n[Detalhamento]\n${piecesDesc}`
            : `${baseDesc}\n\n[Detalhamento]\n${piecesDesc}`;

        const newItem: QuoteItem = {
            id: `qi-${category.toLowerCase()}-${Date.now()}`,
            productId: materialId,
            productName: productName,
            selectedColor: variantLabel,
            description: fullDescription,
            width: 0, 
            height: 0,
            quantity: 1,
            price: totalPrice,
            cost: totalCost
        };

        setItems([...items, newItem]);
        reset();
    };


    // --- Handler for GLASS WIZARD ---
    const handleAddGlassItem = () => {
        if (!gwSelectedProduct) return alert('Selecione um produto.');
        if (!gwHandle) return alert('Selecione um puxador.');

        const productObj = GLASS_PRODUCTS.find(p => p.id === gwSelectedProduct);
        const glassTypeObj = GLASS_TYPES.find(g => g.id === gwGlassType);
        const glassColorObj = GLASS_COLORS.find(c => c.id === gwGlassColor);
        const handleObj = HANDLES.find(h => h.id === gwHandle);

        if (!productObj || !glassTypeObj || !glassColorObj || !handleObj) return;

        // Calculate Cost logic for Glass Wizard
        const area = (gwWidth / 1000) * (gwHeight / 1000);
        const glassCost = area * glassTypeObj.cost * glassColorObj.priceMod;
        const kitCost = 150; // Fixed mock cost for kit
        const handleCost = handleObj.cost;
        
        const totalCost = (glassCost + kitCost + handleCost) * gwQuantity;
        
        // Pricing Logic with Margin
        const desiredMargin = 0.35; // 35% for Glass
        const variableMargin = totalVariablePercent / 100;
        const markupDivisor = 1 - variableMargin - desiredMargin;
        const unitPrice = markupDivisor > 0 ? (totalCost / gwQuantity) / markupDivisor : (totalCost / gwQuantity) * 2;
        
        const finalPrice = unitPrice * gwQuantity;

        const description = `${glassTypeObj.name} ${glassColorObj.name} | Alum: ${gwProfileColor} | Ferr: ${gwHardwareColor} | Puxador: ${handleObj.name}`;

        const newItem: QuoteItem = {
            id: `qi-glass-${Date.now()}`,
            productId: gwSelectedProduct,
            productName: productObj.name,
            selectedColor: gwGlassColor,
            description: description,
            width: gwWidth,
            height: gwHeight,
            quantity: gwQuantity,
            price: finalPrice,
            cost: totalCost
        };

        setItems([...items, newItem]);
        // Optional: Reset wizard? 
    }


    const handleRemoveItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handleItemChange = (id: string, field: keyof QuoteItem, value: any) => {
        setItems(prevItems => prevItems.map(item => {
            if (item.id !== id) return item;
            
            const updatedItem = { ...item, [field]: value };
            
            // Only recalc if it's a standard product (from products list)
            if (field === 'productId' || field === 'width' || field === 'height' || field === 'quantity' || field === 'selectedColor') {
                 const product = products.find(p => p.id === updatedItem.productId);
                 if (product) {
                     if (field === 'productId') {
                        updatedItem.productName = product.name;
                        const availableColors = Array.from(new Set(product.composition.flatMap(c => {
                            const material = rawMaterials.find(m => m.id === c.materialId);
                            return material?.colorVariants.map(cv => cv.name) || [];
                        })));
                        updatedItem.selectedColor = availableColors.length > 0 ? (availableColors[0] as string) : 'Padrão';
                     }
                     const { price, cost } = calculateItemPrice(
                        updatedItem.productId, 
                        updatedItem.width, 
                        updatedItem.height, 
                        updatedItem.quantity, 
                        updatedItem.selectedColor
                    );
                    updatedItem.price = price;
                    updatedItem.cost = cost;
                 }
            }
            return updatedItem;
        }));
    };

    // Totals
    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const totalPrice = subtotal + freight + installation - discount;

    // Cost Breakdown Logic (Admin)
    const totalCostOfGoods = items.reduce((sum, item) => sum + item.cost, 0);
    const commissionRate = variableExpenses.find(e => e.name.toLowerCase().includes('comissão'))?.value || 0;
    const taxRate = variableExpenses.find(e => e.name.toLowerCase().includes('imposto') || e.name.toLowerCase().includes('simples'))?.value || 0;
    const cardRate = variableExpenses.find(e => e.name.toLowerCase().includes('maquininha') || e.name.toLowerCase().includes('cartão'))?.value || 0;
    
    const commissionValue = totalPrice * (commissionRate / 100);
    const taxValue = totalPrice * (taxRate / 100);
    const cardValue = paymentMethod === 'Cartão' ? totalPrice * (cardRate / 100) : 0;
    
    const fixedCostEstimatePercent = 20; 
    const fixedCostValue = totalPrice * (fixedCostEstimatePercent / 100);

    const netProfit = totalPrice - totalCostOfGoods - commissionValue - taxValue - cardValue - fixedCostValue;
    const netProfitMargin = totalPrice > 0 ? (netProfit / totalPrice) * 100 : 0;


    const handleSave = () => {
        if (!selectedClientId) {
            alert("Selecione um cliente.");
            return;
        }
        if (items.length === 0) {
            alert("Adicione pelo menos um item ao orçamento.");
            return;
        }

        const selectedClient = clients.find(c => c.id === selectedClientId);

        const newQuote: Quote = {
            id: `q${Date.now()}`,
            clientId: selectedClientId,
            customerName: selectedClient ? selectedClient.name : 'Cliente Desconhecido',
            items,
            subtotal,
            discount,
            freight,
            installation,
            totalPrice,
            paymentMethod,
            assemblyNotes,
            measurementNotes,
            date: new Date(date),
            status: 'Pendente',
            salesperson: currentUser.name,
            costOfGoods: totalCostOfGoods,
            fixedCosts: fixedCostValue,
            machineFee: cardValue,
            taxes: taxValue
        };

        onAddQuote(newQuote);
    };

    const handleSaveNewClient = () => {
        if (!newClientName) {
            alert("Nome do cliente é obrigatório.");
            return;
        }
        const newClient: Client = {
            id: `c${Date.now()}`,
            name: newClientName,
            phone: newClientPhone,
            address: {}
        };
        onAddNewClient(newClient);
        setSelectedClientId(newClient.id);
        setIsClientModalOpen(false);
        setNewClientName('');
        setNewClientPhone('');
    };

    // Reusable Render Function for Multi-Piece Input (Component Logic)
    const renderMultiPieceCalculator = ({ 
        materialId, setMaterialId, 
        variantName, setVariantName, 
        pieces, setPieces, 
        description, setDescription,
        onAdd,
        categoryFilter,
        showProductGrid = false,
        isGridVisible = true,
        setIsGridVisible = (v: boolean) => {}
    }: any) => {
        
        const calculations = getCalculations(materialId, variantName, pieces);
        
        // Filter items for dropdown: Raw Materials (Sheet/Plate) OR Products in category
        // Normalizing for better matching (e.g. 'ALUMINIO' matches 'Alumínio' or 'Portões')
        const availableItems = categoryFilter === 'GRANITO' 
            ? rawMaterials.filter(m => m.usageCategory === 'Chapa/Placa') 
            : products.filter(p => p.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes(categoryFilter.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()));

        return (
            <div className="space-y-6 animate-fade-in p-6 border-2 border-primary-100 rounded-xl bg-white shadow-sm">
                
                {showProductGrid && (
                    <>
                        {isGridVisible && (
                            <div className="relative bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-md font-semibold text-gray-800">Selecione um produto:</h4>
                                    <button 
                                        onClick={() => setIsGridVisible(false)} 
                                        className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-gray-200"
                                        title="Fechar catálogo"
                                    >
                                        <Icon className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></Icon>
                                    </button>
                                </div>
                                {availableItems.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {availableItems.map(item => (
                                            <div 
                                                key={item.id}
                                                onClick={() => {
                                                    setMaterialId(item.id);
                                                    // For raw materials, select first variant. For products, 'Padrão'.
                                                    if ('colorVariants' in item && (item as any).colorVariants.length > 0) {
                                                        setVariantName((item as any).colorVariants[0].name);
                                                    } else {
                                                        setVariantName('Padrão');
                                                    }
                                                }}
                                                className={`border rounded-xl p-4 cursor-pointer transition-all flex flex-col items-center text-center ${materialId === item.id ? 'border-primary-500 ring-2 ring-primary-200 bg-white shadow-sm' : 'hover:border-gray-300 bg-white'}`}
                                            >
                                                {item.image ? (
                                                    <img src={item.image} alt={item.name} className="h-24 w-auto mb-3 opacity-90 object-contain" />
                                                ) : (
                                                    <div className="h-24 w-24 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                                                        <Icon className="w-8 h-8 text-gray-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></Icon>
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium text-gray-700">{item.name}</span>
                                                {materialId === item.id && <div className="mt-2 text-primary-600"><Icon className="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon></div>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">Nenhum produto encontrado nesta categoria.</p>
                                )}
                            </div>
                        )}
                        
                        {!isGridVisible && (
                            <button 
                                onClick={() => setIsGridVisible(true)} 
                                className="mb-6 flex items-center gap-2 text-primary-600 font-medium hover:underline"
                            >
                                <Icon className="w-4 h-4"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Icon>
                                Mostrar Catálogo de Produtos
                            </button>
                        )}
                    </>
                )}

                 {/* Product Selection Dropdown */}
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Produto Selecionado</label>
                        <select
                            value={materialId}
                            onChange={(e) => {
                                setMaterialId(e.target.value);
                                const mat = rawMaterials.find(m => m.id === e.target.value);
                                if(mat && mat.colorVariants.length > 0) setVariantName(mat.colorVariants[0].name);
                                if (!mat) setVariantName('Padrão');
                            }}
                            className="w-full h-12 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-medium shadow-sm focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200"
                        >
                            <option value="" className="bg-white text-gray-900">Selecione o Item</option>
                            {availableItems.map(item => (
                                <option key={item.id} value={item.id} className="bg-white text-gray-900">{item.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Measurement Header */}
                <div className="grid grid-cols-12 gap-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <div className="col-span-3">Comprimento</div>
                    <div className="col-span-3">Largura</div>
                    <div className="col-span-2">Qtd</div>
                    <div className="col-span-2">M²</div>
                    <div className="col-span-2">Valor</div>
                </div>

                {/* Pieces Rows */}
                {pieces.map((piece: any, index: number) => {
                    const pieceM2 = piece.length * piece.width * piece.quantity;
                    // Approximate unit price for display per piece
                    const unitPrice = calculations.totalArea > 0 ? calculations.totalPrice / calculations.totalArea : 0;
                    const pieceValue = pieceM2 * unitPrice;

                    return (
                        <div key={piece.id} className="grid grid-cols-12 gap-2 items-center relative group">
                            <div className="col-span-3">
                                <input type="number" value={piece.length || ''} onChange={(e) => updatePiece(index, 'length', parseFloat(e.target.value), setPieces, pieces)} className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200" placeholder="0.00" />
                            </div>
                            <div className="col-span-3">
                                <input type="number" value={piece.width || ''} onChange={(e) => updatePiece(index, 'width', parseFloat(e.target.value), setPieces, pieces)} className="w-full h-10 px-3 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200" placeholder="0.00" />
                            </div>
                            <div className="col-span-2">
                                <input type="number" value={piece.quantity} onChange={(e) => updatePiece(index, 'quantity', parseInt(e.target.value), setPieces, pieces)} className="w-full h-10 px-1 border rounded-lg bg-primary-600 text-white border-primary-500 font-bold text-center focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 placeholder-blue-200" min="1" />
                            </div>
                            <div className="col-span-2">
                                <div className="w-full h-10 flex items-center justify-center border rounded-lg bg-primary-600 text-white font-bold border-primary-500 shadow-inner">
                                    {pieceM2.toFixed(2)}
                                </div>
                            </div>
                            <div className="col-span-2">
                                <div className="h-10 flex items-center justify-end px-2 rounded-lg bg-primary-700 text-white border border-primary-600 font-bold text-xs sm:text-sm shadow-inner">
                                    {pieceValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            </div>
                             {pieces.length > 1 && (
                                <button onClick={() => removePiece(index, setPieces, pieces)} className="absolute -right-8 top-2 text-red-500 hover:text-red-700 transition-colors" title="Remover medida">
                                    <Icon className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></Icon>
                                </button>
                            )}
                        </div>
                    )
                })}

                <div className="flex justify-end">
                    <button onClick={() => addPiece(setPieces, pieces)} className="px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-md">
                        + ADICIONAR MEDIDA
                    </button>
                </div>

                <div className="w-full">
                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Descrição</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 h-24 border rounded-lg bg-primary-600 text-white border-primary-500 placeholder-blue-200 focus:ring-2 focus:ring-offset-1 focus:ring-primary-400 resize-none" placeholder="Descreva os detalhes do produto..." />
                </div>

                 <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4 border-t border-gray-200">
                    <div className="text-right">
                        <span className="block text-xs text-gray-500 uppercase font-bold mb-1">TOTAL GERAL</span>
                        <div className="px-4 py-2 bg-primary-900 text-white rounded-lg text-2xl font-bold shadow-md">
                            R$ {calculations.totalPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </div>
                    </div>
                    <button onClick={onAdd} className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95 uppercase text-sm flex items-center gap-2 h-full">
                        <Icon className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></Icon>
                        Adicionar ao Orçamento
                    </button>
                </div>
            </div>
        );
    };


    return (
        <div className="space-y-6">
             {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Novo Orçamento</h2>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700">Salvar Orçamento</button>
                </div>
            </div>

            {/* Client Section */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Dados do Cliente e Data</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Cliente</label>
                        <div className="flex gap-2 mt-1">
                             <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="flex-grow px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900">
                                <option value="">Selecione um cliente</option>
                                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                            </select>
                             <button type="button" onClick={() => setIsClientModalOpen(true)} className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700" title="Novo Cliente">
                                <Icon className="w-5 h-5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></Icon>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900" />
                    </div>
                </div>
            </div>

            {/* PRODUCT BUILDER SECTION */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                {/* Categories Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    {['GRANITO', 'VIDROS', 'ALUMINIO', 'PORTAO'].map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat as any)}
                            className={`px-6 py-3 font-bold text-sm focus:outline-none border-b-2 transition-colors ${
                                activeCategory === cat 
                                ? 'border-primary-600 text-primary-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* --- GRANITE CALCULATOR --- */}
                {activeCategory === 'GRANITO' && renderMultiPieceCalculator({
                    materialId: grMaterialId, setMaterialId: setGrMaterialId,
                    variantName: grVariantName, setVariantName: setGrVariantName,
                    pieces: grPieces, setPieces: setGrPieces,
                    description: grDescription, setDescription: setGrDescription,
                    onAdd: () => handleAddPieceItem('GRANITO', grMaterialId, grVariantName, grPieces, grDescription, () => {
                         setGrPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
                         setGrDescription('');
                    }),
                    categoryFilter: "GRANITO"
                })}

                {/* --- GLASS WIZARD --- */}
                {activeCategory === 'VIDROS' && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Step 1: Select Product */}
                        <div>
                            <h4 className="text-md font-semibold text-gray-800 mb-3">Selecione um produto:</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {GLASS_PRODUCTS.map(p => (
                                    <div 
                                        key={p.id}
                                        onClick={() => setGwSelectedProduct(p.id)}
                                        className={`border rounded-xl p-4 cursor-pointer transition-all flex flex-col items-center text-center ${gwSelectedProduct === p.id ? 'border-primary-500 ring-2 ring-primary-200 bg-primary-50' : 'hover:border-gray-300'}`}
                                    >
                                        <img src={p.image} alt={p.name} className="h-24 w-auto mb-3 opacity-80" />
                                        <span className="text-sm font-medium text-gray-700">{p.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Step 2: Measures */}
                        <div>
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Altura do vão (mm)</label>
                                    <input type="number" value={gwHeight} onChange={e => setGwHeight(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg bg-primary-600 text-white border-primary-500 font-semibold text-center" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Largura do vão (mm)</label>
                                    <input type="number" value={gwWidth} onChange={e => setGwWidth(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg bg-primary-600 text-white border-primary-500 font-semibold text-center" />
                                </div>
                            </div>
                        </div>

                        {/* Step 3: Glass Details */}
                        <div>
                            <h4 className="text-md font-semibold text-gray-800 mb-3">Selecione o vidro</h4>
                            <div className="flex flex-wrap gap-3 mb-4">
                                {GLASS_TYPES.map(type => (
                                    <button 
                                        key={type.id}
                                        onClick={() => setGwGlassType(type.id)}
                                        className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${gwGlassType === type.id ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                    >
                                        {type.name.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor do vidro</label>
                                    <div className="flex flex-wrap gap-2">
                                        {GLASS_COLORS.map(color => (
                                            <button
                                                key={color.id}
                                                onClick={() => setGwGlassColor(color.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${gwGlassColor === color.id ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor dos alumínios</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PROFILE_COLORS.map(color => (
                                            <button
                                                key={color.id}
                                                onClick={() => setGwProfileColor(color.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${gwProfileColor === color.id ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor das ferragens</label>
                                    <div className="flex flex-wrap gap-2">
                                        {HARDWARE_COLORS.map(color => (
                                            <button
                                                key={color.id}
                                                onClick={() => setGwHardwareColor(color.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${gwHardwareColor === color.id ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 4: Handles */}
                        <div>
                            <h4 className="text-md font-semibold text-gray-800 mb-3">Qual puxador usar?</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {HANDLES.map(handle => (
                                    <div 
                                        key={handle.id}
                                        onClick={() => setGwHandle(handle.id)}
                                        className={`border rounded-xl p-4 cursor-pointer transition-all flex flex-col items-center text-center relative ${gwHandle === handle.id ? 'border-primary-500 ring-2 ring-primary-200 bg-white' : 'hover:border-gray-300 bg-white'}`}
                                    >
                                        {gwHandle === handle.id && <div className="absolute top-2 left-2 text-primary-600"><Icon className="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon></div>}
                                        <img src={handle.image} alt={handle.name} className="h-16 w-auto mb-3 opacity-80" />
                                        <span className="text-xs font-medium text-gray-700">{handle.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Step 5: Action */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-medium text-gray-700">Quantidade</label>
                                <input type="number" value={gwQuantity} onChange={e => setGwQuantity(Number(e.target.value))} className="w-20 p-2 border border-gray-300 rounded-lg text-center font-bold bg-primary-600 text-white border-primary-500" min="1" />
                            </div>
                            <button 
                                onClick={handleAddGlassItem}
                                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95"
                            >
                                Adicionar ao Orçamento
                            </button>
                        </div>
                    </div>
                )}

                {/* --- ALUMINUM CALCULATOR --- */}
                {activeCategory === 'ALUMINIO' && renderMultiPieceCalculator({
                    materialId: alMaterialId, setMaterialId: setAlMaterialId,
                    variantName: alVariantName, setVariantName: setAlVariantName,
                    pieces: alPieces, setPieces: setAlPieces,
                    description: alDescription, setDescription: setAlDescription,
                    onAdd: () => handleAddPieceItem('ALUMINIO', alMaterialId, alVariantName, alPieces, alDescription, () => {
                         setAlPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
                         setAlDescription('');
                    }),
                    categoryFilter: "PORTÕES", // Or 'ALUMINIUM' if categorized differently
                    showProductGrid: true,
                    isGridVisible: isAlGridVisible,
                    setIsGridVisible: setIsAlGridVisible
                })}
                
                {/* --- GATE CALCULATOR --- */}
                {activeCategory === 'PORTAO' && renderMultiPieceCalculator({
                    materialId: poMaterialId, setMaterialId: setPoMaterialId,
                    variantName: poVariantName, setVariantName: setPoVariantName,
                    pieces: poPieces, setPieces: setPoPieces,
                    description: poDescription, setDescription: setPoDescription,
                    onAdd: () => handleAddPieceItem('PORTAO', poMaterialId, poVariantName, poPieces, poDescription, () => {
                         setPoPieces([{ id: Date.now().toString(), length: 0, width: 0, quantity: 1 }]);
                         setPoDescription('');
                    }),
                    categoryFilter: "PORTÕES",
                    showProductGrid: true,
                    isGridVisible: isPoGridVisible,
                    setIsGridVisible: setIsPoGridVisible
                })}
            </div>

            {/* Item List Table */}
            <div className="bg-white p-6 rounded-xl shadow-md mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Resumo dos Itens</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-2 text-left w-1/3">Produto / Descrição</th>
                                <th className="p-2 text-left">Acabamento</th>
                                <th className="p-2 text-center w-20">Qtd</th>
                                <th className="p-2 text-center w-44">Medidas</th>
                                <th className="p-2 text-right w-32">Preço</th>
                                <th className="p-2 text-center w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center text-gray-500">Nenhum item adicionado.</td>
                                </tr>
                            ) : (
                                items.map(item => {
                                    const isStandard = products.some(p => p.id === item.productId);
                                    
                                    return (
                                        <tr key={item.id} className="border-b">
                                            <td className="p-2">
                                                {isStandard ? (
                                                    <select value={item.productId} onChange={e => handleItemChange(item.id, 'productId', e.target.value)} className="w-full p-1 border rounded bg-primary-600 text-white border-primary-500 placeholder-blue-200">
                                                        {products.map(p => <option key={p.id} value={p.id} className="bg-white text-gray-900">{p.name}</option>)}
                                                    </select>
                                                ) : (
                                                    <div className="font-medium text-gray-900">
                                                        {item.productName}
                                                        <div className="text-xs text-gray-500 font-normal whitespace-pre-wrap">{item.description}</div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-2">
                                                 {isStandard ? (
                                                     <input type="text" value={item.selectedColor} onChange={e => handleItemChange(item.id, 'selectedColor', e.target.value)} className="w-full p-1 border rounded bg-primary-600 text-white border-primary-500 placeholder-blue-200" />
                                                 ) : (
                                                     <span className="text-gray-700">{item.selectedColor}</span>
                                                 )}
                                            </td>
                                            <td className="p-2">
                                                <input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)} className="w-full p-1 border rounded text-center bg-primary-600 text-white border-primary-500 placeholder-blue-200" min="1" />
                                            </td>
                                            <td className="p-2 text-center align-top flex items-center justify-center gap-1">
                                                {/* If dimensions are 0 (consolidated item), show nothing or generic text */}
                                                {item.width > 0 && item.height > 0 ? (
                                                    <>
                                                    <input type="number" value={item.width} onChange={e => handleItemChange(item.id, 'width', parseFloat(e.target.value))} className="w-20 p-1 border rounded bg-primary-600 text-white border-primary-500 text-center placeholder-blue-200" placeholder="L" />
                                                    <span className="text-gray-400">x</span>
                                                    <input type="number" value={item.height} onChange={e => handleItemChange(item.id, 'height', parseFloat(e.target.value))} className="w-20 p-1 border rounded bg-primary-600 text-white border-primary-500 text-center placeholder-blue-200" placeholder="A" />
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-gray-500">Ver descrição</span>
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-semibold text-gray-900">
                                                R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-2 text-center">
                                                <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700">
                                                    <Icon className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></Icon>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                
                 <div className="flex justify-end mt-4">
                    <div className="w-full max-w-xs space-y-2">
                         <div className="flex justify-between text-sm">
                            <span>Subtotal</span>
                            <span>R$ {subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        </div>
                         <div className="flex justify-between items-center text-sm">
                            <span>Frete</span>
                            <input 
                                type="text" 
                                value={freight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                onChange={handleCurrencyChange(setFreight)} 
                                className="w-24 p-1 border rounded text-right bg-primary-600 text-white border-primary-500 placeholder-blue-200" 
                            />
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span>Instalação</span>
                            <input 
                                type="text" 
                                value={installation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                onChange={handleCurrencyChange(setInstallation)} 
                                className="w-24 p-1 border rounded text-right bg-primary-600 text-white border-primary-500 placeholder-blue-200" 
                            />
                        </div>
                         <div className="flex justify-between items-center text-sm">
                            <span>Desconto</span>
                            <input 
                                type="text" 
                                value={discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                onChange={handleCurrencyChange(setDiscount)} 
                                className="w-24 p-1 border rounded text-right bg-primary-600 text-white border-primary-500 placeholder-blue-200" 
                            />
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                            <span>TOTAL</span>
                            <span>R$ {totalPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            Forma de Pagamento: 
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="ml-1 p-1 border rounded bg-primary-600 text-white border-primary-500">
                                <option value="A Definir" className="bg-white text-gray-900">A Definir</option>
                                <option value="PIX" className="bg-white text-gray-900">PIX</option>
                                <option value="Cartão" className="bg-white text-gray-900">Cartão</option>
                                <option value="Dinheiro" className="bg-white text-gray-900">Dinheiro</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Cost Breakdown (Admin) */}
                {currentUser.role === 'Admin' && (
                    <div className="mt-6 border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-r-lg relative shadow-sm">
                        <div className="absolute -left-1 top-0 bottom-0 w-1 bg-yellow-400 rounded-l"></div>
                         <h4 className="text-md font-semibold text-yellow-800 mb-3">Detalhamento Financeiro do Orçamento (Admin)</h4>
                         <div className="grid grid-cols-2 gap-8 text-sm">
                             <div className="space-y-1">
                                 <div className="flex justify-between text-gray-700">
                                     <span>Matéria Prima (CMV):</span>
                                     <span className="font-medium">R$ {totalCostOfGoods.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                 </div>
                                 <div className="flex justify-between text-gray-700">
                                     <span>Comissão ({commissionRate}%):</span>
                                     <span className="font-medium">R$ {commissionValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                 </div>
                                 <div className="flex justify-between text-gray-700">
                                     <span>Impostos ({taxRate}%):</span>
                                     <span className="font-medium">R$ {taxValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                 </div>
                                  <div className="flex justify-between text-gray-700">
                                     <span>Custos Fixos (Est. {fixedCostEstimatePercent}%):</span>
                                     <span className="font-medium">R$ {fixedCostValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                 </div>
                                 {paymentMethod === 'Cartão' && (
                                     <div className="flex justify-between text-red-600">
                                         <span>Taxa Maquininha ({cardRate}%):</span>
                                         <span className="font-medium">R$ {cardValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                     </div>
                                 )}
                             </div>
                             <div className="flex flex-col justify-center border-l border-yellow-200 pl-8">
                                 <span className="text-xs text-gray-500 uppercase tracking-wider">Lucro Líquido Estimado</span>
                                 <span className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                     R$ {netProfit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                 </span>
                                 <span className={`text-sm font-medium ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                     Margem de Lucro <br/>
                                     <span className="text-lg">{netProfitMargin.toFixed(2)}%</span>
                                 </span>
                             </div>
                         </div>
                    </div>
                )}
            </div>

            {/* Details Section */}
             <div className="bg-white p-6 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Medidas</label>
                    <textarea value={measurementNotes} onChange={e => setMeasurementNotes(e.target.value)} rows={3} className="w-full p-2 border rounded text-gray-900" placeholder="Ex: Medidas exatas confirmadas no local." />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações de Montagem</label>
                    <textarea value={assemblyNotes} onChange={e => setAssemblyNotes(e.target.value)} rows={3} className="w-full p-2 border rounded text-gray-900" placeholder="Ex: Levar escada grande." />
                 </div>
            </div>

            {/* Client Modal */}
            {isClientModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Adicionar Novo Cliente Rápido</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome</label>
                                <input type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="w-full mt-1 p-2 border rounded text-gray-900" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                                <input type="text" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="w-full mt-1 p-2 border rounded text-gray-900" />
                            </div>
                            <div className="flex justify-end gap-4 pt-4">
                                <button onClick={() => setIsClientModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
                                <button onClick={handleSaveNewClient} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar Cliente</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default NewQuote;