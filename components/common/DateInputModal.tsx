import React, { useState } from "react";

type Props = {
  title: string;
  message?: string;
  defaultValue?: string; // YYYY-MM-DD
  confirmLabel?: string;
  onConfirm: (dateYMD: string) => void;
  onCancel: () => void;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// Substitui window.prompt("...DD/MM/AAAA...") por um <input type="date">
// de verdade — digita só os números (ou usa o calendário), sem precisar
// escrever a barra "/" manualmente.
const DateInputModal: React.FC<Props> = ({ title, message, defaultValue, confirmLabel = "Confirmar", onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue || todayISO());

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
        {message && <p className="text-sm text-gray-500 mb-3">{message}</p>}
        <input
          type="date"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-primary-500"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => value && onConfirm(value)}
            disabled={!value}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateInputModal;
