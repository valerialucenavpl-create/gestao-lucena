import React from "react";

type Props = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
};

const ExpenseModal: React.FC<Props> = ({ open, title, children, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default ExpenseModal;
