import React, { useState, ChangeEvent, useMemo } from 'react';
import {
  Product,
  ProductCompositionItem,
  InventoryItem,
  User,
  CalculationRule,
  VariableExpense
} from '../types';
import { Icon } from './icons/Icon';
import ProductModal from "./ProductModal";

interface ProductsProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  rawMaterials: InventoryItem[];
  variableExpenses: VariableExpense[];
  currentUser: User;
}

const Products: React.FC<ProductsProps> = ({
  products,
  setProducts,
  rawMaterials,
  variableExpenses,
  currentUser
}) => {

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleOpenModal = (product: Product | null = null) => {
    setEditingProduct(product ? JSON.parse(JSON.stringify(product)) : null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setIsModalOpen(false);
  };

  const handleSaveProduct = (productData: Omit<Product, 'id'>) => {
    if (editingProduct) {
      setProducts(
        products.map(p =>
          p.id === editingProduct.id
            ? { ...editingProduct, ...productData }
            : p
        )
      );
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
        <h3 className="text-xl font-semibold text-gray-800">
          Catálogo de Produtos
        </h3>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700"
        >
          <Icon className="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Adicionar Produto
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Foto</th>
              <th className="px-6 py-3">Nome do Produto</th>
              <th className="px-6 py-3">Categoria</th>
              <th className="px-6 py-3">Componentes</th>
              <th className="px-6 py-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {products.map(product => (
              <tr
                key={product.id}
                className="bg-white border-b hover:bg-gray-50"
              >
                <td className="px-6 py-4">
                  <div className="h-10 w-10 rounded bg-white flex items-center justify-center overflow-hidden border border-gray-200 p-0.5">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Icon className="text-gray-400 w-5 h-5">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </Icon>
                    )}
                  </div>
                </td>

                <td className="px-6 py-4 font-medium text-gray-900">
                  {product.name}
                </td>

                <td className="px-6 py-4">
                  {product.category}
                </td>

                <td className="px-6 py-4">
                  {product.composition.length}
                </td>

                <td className="px-6 py-4 text-center space-x-2">
                  <button
                    onClick={() => handleOpenModal(product)}
                    className="text-primary-600 hover:text-primary-800"
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    🗑
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
// build-2026-02-11

export default Products;
