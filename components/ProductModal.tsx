import React from "react";
import {
  Product,
  InventoryItem,
  User,
  VariableExpense,
} from "../types";

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (productData: Omit<Product, "id">) => void;
  rawMaterials: InventoryItem[];
  variableExpenses: VariableExpense[];
  currentUser: User;
}

const ProductModal: React.FC<ProductModalProps> = () => {
  return <div>Product Modal</div>;
};

export default ProductModal;